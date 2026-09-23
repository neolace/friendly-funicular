import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createTokenValidator } from '../src/auth/token-validator.js';
import { createApplicationHandler } from '../src/handlers/application.js';
import {
  CLIENT_ID,
  TENANT_ID,
  USER_OID,
  createTestKeys,
  functionUrlEvent,
  signToken,
  validClaims,
  type TestKeys,
} from './helpers.js';

let keys: TestKeys;
const ctx = { awsRequestId: 'aws-req-1' };

beforeAll(async () => {
  keys = await createTestKeys();
});

function setup(
  overrides: Partial<Parameters<typeof createApplicationHandler>[0]> = {},
) {
  const lines: string[] = [];
  const handler = createApplicationHandler({
    config: { serviceName: 'api', environment: 'test' },
    validateToken: createTokenValidator({
      tenantId: TENANT_ID,
      audience: CLIENT_ID,
      requiredScope: 'access_as_user',
      getKey: keys.getKey,
    }),
    logWriter: (line) => lines.push(line),
    ...overrides,
  });
  const logs = () => lines.map((l) => JSON.parse(l) as Record<string, unknown>);
  return { handler, lines, logs };
}

type Result = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

describe('Function URL handler', () => {
  it('serves /api/health without authentication and without config details', async () => {
    const { handler } = setup();
    const res = (await handler(
      functionUrlEvent({ path: '/api/health' }),
      ctx,
    )) as Result;
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
  });

  it('returns the allow-listed identity for a valid token on /api/me', async () => {
    const { handler, logs } = setup();
    const token = await signToken(keys);
    const res = (await handler(
      functionUrlEvent({ headers: { authorization: `Bearer ${token}` } }),
      ctx,
    )) as Result;

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      oid: USER_OID,
      tenantId: TENANT_ID,
      scopes: ['access_as_user'],
      roles: [],
      name: 'Test User',
    });
    expect(res.body).not.toContain(token);
    expect(res.headers['cache-control']).toBe('no-store');

    const [entry] = logs();
    expect(entry).toMatchObject({
      level: 'info',
      service: 'api',
      environment: 'test',
      awsRequestId: 'aws-req-1',
      route: '/api/me',
      method: 'GET',
      userOid: USER_OID,
      tenantId: TENANT_ID,
      status: 200,
      result: 'success',
      authOutcome: 'accepted',
    });
    expect(typeof entry?.duration).toBe('number');
    expect(typeof entry?.correlationId).toBe('string');
  });

  it('returns 401 with WWW-Authenticate when the token is missing', async () => {
    const { handler, logs } = setup();
    const res = (await handler(functionUrlEvent(), ctx)) as Result;
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toContain('invalid_token');
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('unauthorized');
    expect(body.error.correlationId).toBe(res.headers['x-correlation-id']);
    expect(logs()[0]).toMatchObject({
      authOutcome: 'rejected',
      authFailureReason: 'missing_token',
      level: 'warn',
    });
  });

  it('returns 403 insufficient_scope when the scope is missing', async () => {
    const { handler } = setup();
    const token = await signToken(keys, validClaims({ scp: 'User.Read' }));
    const res = (await handler(
      functionUrlEvent({ headers: { authorization: `Bearer ${token}` } }),
      ctx,
    )) as Result;
    expect(res.statusCode).toBe(403);
    expect(res.headers['www-authenticate']).toContain('insufficient_scope');
  });

  it('authenticates before revealing that a route does not exist', async () => {
    const { handler } = setup();
    const unauth = (await handler(
      functionUrlEvent({ path: '/api/secret' }),
      ctx,
    )) as Result;
    expect(unauth.statusCode).toBe(401);

    const token = await signToken(keys);
    const auth = (await handler(
      functionUrlEvent({
        path: '/api/secret',
        headers: { authorization: `Bearer ${token}` },
      }),
      ctx,
    )) as Result;
    expect(auth.statusCode).toBe(404);
  });

  it('returns 405 for a known path with an unsupported method', async () => {
    const { handler } = setup();
    const token = await signToken(keys);
    const res = (await handler(
      functionUrlEvent({
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      }),
      ctx,
    )) as Result;
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe('GET');
  });

  it('propagates a safe caller correlation ID and replaces unsafe ones', async () => {
    const { handler } = setup();
    const ok = (await handler(
      functionUrlEvent({
        path: '/api/health',
        headers: { 'x-correlation-id': 'abc-123-def-456' },
      }),
      ctx,
    )) as Result;
    expect(ok.headers['x-correlation-id']).toBe('abc-123-def-456');

    const bad = (await handler(
      functionUrlEvent({
        path: '/api/health',
        headers: { 'x-correlation-id': 'bad\nvalue' },
      }),
      ctx,
    )) as Result;
    expect(bad.headers['x-correlation-id']).not.toContain('\n');
    expect(bad.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns a generic 500 and logs the failure without leaking details', async () => {
    const { handler, logs } = setup({
      validateToken: vi.fn().mockRejectedValue(new Error('JWKS endpoint down')),
    });
    const res = (await handler(
      functionUrlEvent({ headers: { authorization: 'Bearer a.b.c' } }),
      ctx,
    )) as Result;
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('JWKS');
    expect(logs().map((l) => l.message)).toEqual([
      'unhandled_error',
      'request',
    ]);
  });

  it('never writes the bearer token or authorization header to logs', async () => {
    const { handler, lines } = setup();
    const token = await signToken(keys);
    await handler(
      functionUrlEvent({ headers: { authorization: `Bearer ${token}` } }),
      ctx,
    );
    const expired = await signToken(
      keys,
      validClaims({ exp: 1, iat: 0, nbf: 0 }),
    );
    await handler(
      functionUrlEvent({ headers: { authorization: `Bearer ${expired}` } }),
      ctx,
    );
    const all = lines.join('\n');
    expect(all).not.toContain(token);
    expect(all).not.toContain(expired);
    expect(all.toLowerCase()).not.toContain('bearer');
  });
});
