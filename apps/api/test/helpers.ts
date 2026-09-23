import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type CryptoKey,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

export const TENANT_ID = '11111111-2222-3333-4444-555555555555';
export const CLIENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
export const USER_OID = '99999999-8888-7777-6666-555555555555';
export const ISSUER = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;

export interface TestKeys {
  privateKey: CryptoKey;
  kid: string;
  getKey: JWTVerifyGetKey;
  jwks: { keys: unknown[] };
}

export async function createTestKeys(kid = 'test-key-1'): Promise<TestKeys> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', {
    extractable: true,
  });
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid,
    alg: 'RS256',
    use: 'sig',
  };
  const jwks = { keys: [jwk] };
  return {
    privateKey,
    kid,
    jwks,
    getKey: createLocalJWKSet(jwks as Parameters<typeof createLocalJWKSet>[0]),
  };
}

export function validClaims(overrides: JWTPayload = {}): JWTPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: ISSUER,
    aud: CLIENT_ID,
    tid: TENANT_ID,
    oid: USER_OID,
    sub: 'subject-123',
    scp: 'access_as_user',
    ver: '2.0',
    iat: now - 60,
    nbf: now - 60,
    exp: now + 3600,
    name: 'Test User',
    ...overrides,
  };
}

export async function signToken(
  keys: Pick<TestKeys, 'privateKey' | 'kid'>,
  claims: JWTPayload = validClaims(),
  alg = 'RS256',
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg, kid: keys.kid, typ: 'JWT' })
    .sign(keys.privateKey);
}

export function functionUrlEvent(
  overrides: {
    method?: string;
    path?: string;
    headers?: Record<string, string>;
  } = {},
): APIGatewayProxyEventV2 {
  const method = overrides.method ?? 'GET';
  const path = overrides.path ?? '/api/me';
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
    headers: overrides.headers ?? {},
    isBase64Encoded: false,
    requestContext: {
      accountId: 'anonymous',
      apiId: 'url-id',
      domainName: 'url-id.lambda-url.eu-west-1.on.aws',
      domainPrefix: 'url-id',
      http: {
        method,
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '203.0.113.1',
        userAgent: 'vitest',
      },
      requestId: 'req-1',
      routeKey: '$default',
      stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000',
      timeEpoch: 0,
    },
  };
}
