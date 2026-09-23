import { describe, expect, it, vi } from 'vitest';
import { InteractionRequiredError } from '../auth/token-service';
import { createApiClient, type ApiClientOptions } from './api-client';
import { ApiError } from './api-types';

const TOKEN = 'eyJ.secret.token';

function client(
  fetchImpl: typeof fetch,
  overrides: Partial<ApiClientOptions> = {},
) {
  return createApiClient({
    baseUrl: 'https://api.example.test/',
    getAccessToken: vi.fn().mockResolvedValue(TOKEN),
    fetchImpl,
    sleep: vi.fn().mockResolvedValue(undefined),
    createCorrelationId: () => 'corr-1234',
    ...overrides,
  });
}

const json = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe('createApiClient', () => {
  it('attaches the bearer token and correlation ID to the Function URL request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { ok: true }));
    await expect(client(fetchImpl).get('/api/me')).resolves.toEqual({
      ok: true,
    });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.example.test/api/me');
    expect(init.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.headers['x-correlation-id']).toBe('corr-1234');
    expect(init.credentials).toBe('omit');
  });

  it('serializes JSON bodies', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    await client(fetchImpl).request('/api/items', {
      method: 'POST',
      body: { a: 1 },
    });
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init.body).toBe('{"a":1}');
    expect(init.headers['content-type']).toBe('application/json');
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [429, 'throttled'],
    [500, 'server'],
    [400, 'client'],
  ] as const)('maps HTTP %i to %s', async (status, kind) => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(status, {
        error: { code: 'x', message: 'bad', correlationId: 'srv-1' },
      }),
    );
    const error = await failure(
      client(fetchImpl, { maxRetries: 0 }).get('/api/me'),
    );
    expect(error.kind).toBe(kind);
    expect(error.status).toBe(status);
    expect(error.correlationId).toBe('srv-1');
  });

  it('maps network failures', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await failure(
      client(fetchImpl, { maxRetries: 0 }).get('/api/me'),
    );
    expect(error.kind).toBe('network');
  });

  it('maps timeouts', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const error = await failure(
      client(fetchImpl as unknown as typeof fetch, {
        timeoutMs: 10,
        maxRetries: 0,
      }).get('/api/me'),
    );
    expect(error.kind).toBe('timeout');
  });

  it('retries idempotent requests on 503, honouring Retry-After', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(503, {}, { 'retry-after': '2' }))
      .mockResolvedValueOnce(json(200, { ok: 1 }));
    await expect(client(fetchImpl, { sleep }).get('/api/me')).resolves.toEqual({
      ok: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('gives up after the retry budget', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => json(429, {}));
    const error = await failure(
      client(fetchImpl, { maxRetries: 2 }).get('/api/me'),
    );
    expect(error.kind).toBe('throttled');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('never retries non-idempotent requests', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(503, {}));
    await failure(
      client(fetchImpl).request('/api/items', { method: 'POST', body: {} }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not call the API when a token cannot be acquired', async () => {
    const fetchImpl = vi.fn();
    const error = await failure(
      client(fetchImpl, {
        getAccessToken: vi
          .fn()
          .mockRejectedValue(new InteractionRequiredError()),
      }).get('/api/me'),
    );
    expect(error.kind).toBe('interaction_required');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never logs the bearer token', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (m) => vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const fetchImpl = vi.fn().mockResolvedValue(json(500, {}));
    const error = await failure(
      client(fetchImpl, { maxRetries: 0 }).get('/api/me'),
    );
    for (const spy of spies) {
      for (const call of spy.mock.calls)
        expect(JSON.stringify(call)).not.toContain(TOKEN);
      spy.mockRestore();
    }
    expect(JSON.stringify(error)).not.toContain(TOKEN);
    expect(error.message).not.toContain(TOKEN);
  });
});
