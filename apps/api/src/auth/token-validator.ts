import {
  createRemoteJWKSet,
  errors as joseErrors,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose';
import { expectedIssuer } from '../config/config.js';
import { ForbiddenError, UnauthorizedError } from '../errors/http-errors.js';
import {
  parseScopes,
  toRequestIdentity,
  type EntraAccessTokenClaims,
  type RequestIdentity,
} from './claims.js';

/**
 * Entra access-token validation for the Lambda Function URL.
 *
 * Cryptography, JWKS fetching, key caching and key rotation are delegated to
 * `jose` (a maintained, standards-based JOSE library). This module owns only
 * the policy: which issuer, audience, tenant, token version and scope are
 * acceptable for THIS API.
 */

export interface TokenValidatorOptions {
  tenantId: string;
  audience: string;
  requiredScope: string;
  clockToleranceSeconds?: number;
  /** Override key resolution (tests). Defaults to OIDC discovery + remote JWKS. */
  getKey?: JWTVerifyGetKey;
  /** Override fetch used for OIDC discovery (tests). */
  fetchImpl?: typeof fetch;
}

export type TokenValidator = (
  authorizationHeader: string | undefined,
) => Promise<RequestIdentity>;

const BEARER = /^Bearer ([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)$/;

export function extractBearerToken(header: string | undefined): string {
  if (!header) throw new UnauthorizedError('missing_token');
  const match = BEARER.exec(header.trim());
  if (!match?.[1]) throw new UnauthorizedError('malformed_authorization');
  return match[1];
}

interface OidcMetadata {
  issuer: string;
  jwks_uri: string;
}

function defaultRemoteJwks(jwksUri: URL): JWTVerifyGetKey {
  return createRemoteJWKSet(jwksUri, {
    timeoutDuration: 5000,
    cooldownDuration: 30_000,
    cacheMaxAge: 12 * 60 * 60 * 1000,
  });
}

/**
 * Resolve signing keys via the tenant's OpenID Connect discovery document.
 * The discovery document is fetched once per execution environment and its
 * issuer is checked against the configured tenant before keys are trusted.
 * `createRemoteJWKSet` caches keys and refetches on unknown `kid` (rotation).
 */
export function createDiscoveryKeyResolver(
  tenantId: string,
  fetchImpl: typeof fetch = fetch,
  createJwks: (jwksUri: URL) => JWTVerifyGetKey = defaultRemoteJwks,
): JWTVerifyGetKey {
  const issuer = expectedIssuer(tenantId);
  const discoveryUrl = `${issuer}/.well-known/openid-configuration`;
  let jwks: Promise<JWTVerifyGetKey> | undefined;

  const load = async (): Promise<JWTVerifyGetKey> => {
    const response = await fetchImpl(discoveryUrl, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error(`OIDC discovery failed with HTTP ${response.status}`);
    }
    const metadata = (await response.json()) as Partial<OidcMetadata>;
    if (metadata.issuer !== issuer) {
      throw new Error('OIDC discovery issuer does not match configured tenant');
    }
    if (
      typeof metadata.jwks_uri !== 'string' ||
      !metadata.jwks_uri.startsWith('https://login.microsoftonline.com/')
    ) {
      throw new Error('OIDC discovery returned an unexpected jwks_uri');
    }
    return createJwks(new URL(metadata.jwks_uri));
  };

  return async (header, token) => {
    jwks ??= load().catch((err: unknown) => {
      jwks = undefined; // allow retry on next request
      throw err;
    });
    const resolver = await jwks;
    return resolver(header, token);
  };
}

export function createTokenValidator(
  options: TokenValidatorOptions,
): TokenValidator {
  const tenantId = options.tenantId.toLowerCase();
  const audience = options.audience.toLowerCase();
  const issuer = expectedIssuer(tenantId);
  const getKey =
    options.getKey ?? createDiscoveryKeyResolver(tenantId, options.fetchImpl);

  return async (authorizationHeader) => {
    const token = extractBearerToken(authorizationHeader);

    let claims: EntraAccessTokenClaims;
    try {
      const result = await jwtVerify<EntraAccessTokenClaims>(token, getKey, {
        issuer,
        audience,
        algorithms: ['RS256'],
        requiredClaims: ['exp', 'iat', 'nbf', 'sub'],
        clockTolerance: options.clockToleranceSeconds ?? 60,
      });
      claims = result.payload;
    } catch (err) {
      throw new UnauthorizedError(classifyJoseError(err));
    }

    if (claims.ver !== '2.0') {
      throw new UnauthorizedError('unsupported_token_version');
    }
    if (
      typeof claims.tid !== 'string' ||
      claims.tid.toLowerCase() !== tenantId
    ) {
      throw new UnauthorizedError('wrong_tenant');
    }
    if (typeof claims.oid !== 'string' || claims.oid.length === 0) {
      throw new UnauthorizedError('missing_oid');
    }
    if (!parseScopes(claims.scp).includes(options.requiredScope)) {
      throw new ForbiddenError(
        'missing_scope',
        'The access token does not grant the required scope.',
        true,
      );
    }

    return toRequestIdentity(claims);
  };
}

function classifyJoseError(err: unknown): string {
  if (err instanceof joseErrors.JWTExpired) return 'token_expired';
  if (err instanceof joseErrors.JWTClaimValidationFailed) {
    return `invalid_claim_${err.claim}`;
  }
  if (err instanceof joseErrors.JWSSignatureVerificationFailed) {
    return 'invalid_signature';
  }
  if (err instanceof joseErrors.JWKSNoMatchingKey) return 'unknown_signing_key';
  if (err instanceof joseErrors.JOSEAlgNotAllowed)
    return 'algorithm_not_allowed';
  if (
    err instanceof joseErrors.JWTInvalid ||
    err instanceof joseErrors.JWSInvalid
  ) {
    return 'malformed_token';
  }
  return 'token_validation_failed';
}
