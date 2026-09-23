import { SignJWT } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createDiscoveryKeyResolver,
  createTokenValidator,
  extractBearerToken,
  type TokenValidator,
} from '../src/auth/token-validator.js';
import {
  ForbiddenError,
  UnauthorizedError,
} from '../src/errors/http-errors.js';
import {
  CLIENT_ID,
  ISSUER,
  TENANT_ID,
  USER_OID,
  createTestKeys,
  signToken,
  validClaims,
  type TestKeys,
} from './helpers.js';

let keys: TestKeys;
let validate: TokenValidator;

beforeAll(async () => {
  keys = await createTestKeys();
  validate = createTokenValidator({
    tenantId: TENANT_ID,
    audience: CLIENT_ID,
    requiredScope: 'access_as_user',
    getKey: keys.getKey,
  });
});

async function expectRejected(
  header: string | undefined,
  reason: string,
  type: typeof UnauthorizedError | typeof ForbiddenError = UnauthorizedError,
) {
  const error = await validate(header).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(type);
  expect((error as UnauthorizedError).reason).toBe(reason);
}

describe('extractBearerToken', () => {
  it('rejects a missing header', () => {
    expect(() => extractBearerToken(undefined)).toThrow(UnauthorizedError);
  });
  it('rejects non-bearer schemes', () => {
    expect(() => extractBearerToken('Basic dXNlcjpwYXNz')).toThrow(
      UnauthorizedError,
    );
  });
  it('extracts a JWT-shaped bearer token', () => {
    expect(extractBearerToken('Bearer a.b.c')).toBe('a.b.c');
  });
});

describe('createTokenValidator', () => {
  it('accepts a valid v2 access token and returns a normalized identity', async () => {
    const identity = await validate(`Bearer ${await signToken(keys)}`);
    expect(identity).toEqual({
      oid: USER_OID,
      sub: 'subject-123',
      tid: TENANT_ID,
      scopes: ['access_as_user'],
      roles: [],
      name: 'Test User',
    });
    expect(Object.isFrozen(identity)).toBe(true);
  });

  it('parses roles and multiple scopes', async () => {
    const token = await signToken(
      keys,
      validClaims({ scp: 'other access_as_user', roles: ['Admin', 42] }),
    );
    const identity = await validate(`Bearer ${token}`);
    expect(identity.scopes).toEqual(['other', 'access_as_user']);
    expect(identity.roles).toEqual(['Admin']);
  });

  it('rejects a missing token', () =>
    expectRejected(undefined, 'missing_token'));

  it('rejects a malformed token', () =>
    expectRejected('Bearer not-a-jwt', 'malformed_authorization'));

  it('rejects an expired token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signToken(
      keys,
      validClaims({ iat: now - 7200, nbf: now - 7200, exp: now - 3600 }),
    );
    await expectRejected(`Bearer ${token}`, 'token_expired');
  });

  it('rejects a token that is not yet valid', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signToken(keys, validClaims({ nbf: now + 3600 }));
    await expectRejected(`Bearer ${token}`, 'invalid_claim_nbf');
  });

  it('rejects the wrong issuer', async () => {
    const token = await signToken(
      keys,
      validClaims({ iss: 'https://login.microsoftonline.com/other/v2.0' }),
    );
    await expectRejected(`Bearer ${token}`, 'invalid_claim_iss');
  });

  it('rejects a v1 issuer', async () => {
    const token = await signToken(
      keys,
      validClaims({ iss: `https://sts.windows.net/${TENANT_ID}/` }),
    );
    await expectRejected(`Bearer ${token}`, 'invalid_claim_iss');
  });

  it('rejects the wrong audience (e.g. a Microsoft Graph token)', async () => {
    const token = await signToken(
      keys,
      validClaims({ aud: '00000003-0000-0000-c000-000000000000' }),
    );
    await expectRejected(`Bearer ${token}`, 'invalid_claim_aud');
  });

  it('rejects the wrong tenant even when the issuer matches', async () => {
    const token = await signToken(
      keys,
      validClaims({ tid: '00000000-0000-0000-0000-000000000000' }),
    );
    await expectRejected(`Bearer ${token}`, 'wrong_tenant');
  });

  it('rejects v1 tokens', async () => {
    const token = await signToken(keys, validClaims({ ver: '1.0' }));
    await expectRejected(`Bearer ${token}`, 'unsupported_token_version');
  });

  it('rejects tokens without oid', async () => {
    const token = await signToken(keys, validClaims({ oid: undefined }));
    await expectRejected(`Bearer ${token}`, 'missing_oid');
  });

  it('rejects tokens without the required scope with 403', async () => {
    const token = await signToken(keys, validClaims({ scp: 'User.Read' }));
    await expectRejected(`Bearer ${token}`, 'missing_scope', ForbiddenError);
  });

  it('rejects app-only tokens (roles but no scp)', async () => {
    const token = await signToken(
      keys,
      validClaims({ scp: undefined, roles: ['Api.ReadWrite'] }),
    );
    await expectRejected(`Bearer ${token}`, 'missing_scope', ForbiddenError);
  });

  it('rejects a token signed by an unknown key', async () => {
    const other = await createTestKeys('test-key-1');
    const token = await signToken(other);
    await expectRejected(`Bearer ${token}`, 'invalid_signature');
  });

  it('rejects a token whose kid is not in the JWKS', async () => {
    const other = await createTestKeys('unknown-kid');
    const token = await signToken(other);
    await expectRejected(`Bearer ${token}`, 'unknown_signing_key');
  });

  it('rejects symmetric (HS256) tokens', async () => {
    const secret = new TextEncoder().encode('x'.repeat(32));
    const token = await new SignJWT(validClaims())
      .setProtectedHeader({ alg: 'HS256', kid: keys.kid })
      .sign(secret);
    await expectRejected(`Bearer ${token}`, 'algorithm_not_allowed');
  });

  it('rejects tokens missing nbf', async () => {
    const token = await signToken(keys, validClaims({ nbf: undefined }));
    await expectRejected(`Bearer ${token}`, 'invalid_claim_nbf');
  });

  it('rejects a tampered payload', async () => {
    const token = await signToken(keys);
    const [h, , s] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify(validClaims({ oid: 'attacker' })),
    ).toString('base64url');
    await expectRejected(`Bearer ${h}.${forged}.${s}`, 'invalid_signature');
  });
});

describe('createDiscoveryKeyResolver', () => {
  it('resolves keys via OIDC discovery and caches the metadata', async () => {
    const jwksUri = `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`;
    const fetchImpl = vi.fn(async () =>
      Response.json({ issuer: ISSUER, jwks_uri: jwksUri }),
    );
    const createJwks = vi.fn(() => keys.getKey);
    const validateViaDiscovery = createTokenValidator({
      tenantId: TENANT_ID,
      audience: CLIENT_ID,
      requiredScope: 'access_as_user',
      getKey: createDiscoveryKeyResolver(TENANT_ID, fetchImpl, createJwks),
    });

    const token = await signToken(keys);
    await expect(
      validateViaDiscovery(`Bearer ${token}`),
    ).resolves.toMatchObject({
      oid: USER_OID,
    });
    await validateViaDiscovery(`Bearer ${token}`);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      `${ISSUER}/.well-known/openid-configuration`,
      expect.anything(),
    );
    expect(createJwks).toHaveBeenCalledWith(new URL(jwksUri));
  });

  it('refuses discovery metadata for a different issuer', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        issuer: 'https://login.microsoftonline.com/evil/v2.0',
        jwks_uri: 'https://login.microsoftonline.com/evil/discovery/v2.0/keys',
      }),
    );
    const resolver = createDiscoveryKeyResolver(TENANT_ID, fetchImpl);
    await expect(
      resolver({ alg: 'RS256' }, {
        payload: '',
        signature: '',
        protected: '',
      } as never),
    ).rejects.toThrow(/issuer does not match/);
  });

  it('refuses a jwks_uri outside login.microsoftonline.com', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ issuer: ISSUER, jwks_uri: 'https://evil.example/keys' }),
    );
    const resolver = createDiscoveryKeyResolver(TENANT_ID, fetchImpl);
    await expect(
      resolver({ alg: 'RS256' }, {
        payload: '',
        signature: '',
        protected: '',
      } as never),
    ).rejects.toThrow(/unexpected jwks_uri/);
  });

  it('retries discovery after a failure', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('down', { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({ issuer: 'https://wrong/v2.0', jwks_uri: 'x' }),
      );
    const resolver = createDiscoveryKeyResolver(TENANT_ID, fetchImpl);
    const token = { payload: '', signature: '', protected: '' } as never;
    await expect(resolver({ alg: 'RS256' }, token)).rejects.toThrow(/HTTP 503/);
    await expect(resolver({ alg: 'RS256' }, token)).rejects.toThrow(/issuer/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
