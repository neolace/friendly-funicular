import { CORRELATION_ID_HEADER } from '@friendly-funicular/shared';
import { InteractionRequiredError } from '../auth/token-service';
import { ApiError, type ApiErrorBody, type ApiErrorKind } from './api-types';

/**
 * The single browser-side gateway to the Lambda Function URL. Owns token
 * attachment, correlation IDs, JSON handling, timeouts, error normalization
 * and a conservative retry policy. Feature components never touch tokens.
 */
export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Retries apply only to idempotent methods. */
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  createCorrelationId?: () => string;
}

export interface RequestOptions {
  method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
  get<T>(path: string, signal?: AbortSignal): Promise<T>;
}

const IDEMPOTENT = new Set(['GET', 'HEAD']);
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_RETRY_AFTER_MS = 5000;

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createApiClient(options: ApiClientOptions): ApiClient {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxRetries = options.maxRetries ?? 2;
  const sleep = options.sleep ?? defaultSleep;
  const newCorrelationId =
    options.createCorrelationId ?? (() => crypto.randomUUID());
  const baseUrl = options.baseUrl.replace(/\/+$/, '');

  async function request<T>(
    path: string,
    init: RequestOptions = {},
  ): Promise<T> {
    const method = init.method ?? 'GET';
    const correlationId = newCorrelationId();
    const retries = IDEMPOTENT.has(method) ? maxRetries : 0;

    let token: string;
    try {
      token = await options.getAccessToken();
    } catch (error) {
      if (error instanceof InteractionRequiredError) {
        throw new ApiError('interaction_required', 'Please sign in again.');
      }
      throw new ApiError('unauthorized', 'You are not signed in.');
    }

    for (let attempt = 0; ; attempt++) {
      let response: Response;
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = init.signal
        ? AbortSignal.any([init.signal, timeout])
        : timeout;
      try {
        response = await fetchImpl(`${baseUrl}${path}`, {
          method,
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${token}`,
            [CORRELATION_ID_HEADER]: correlationId,
            ...(init.body !== undefined
              ? { 'content-type': 'application/json' }
              : {}),
          },
          body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
          signal,
          credentials: 'omit',
          cache: 'no-store',
        });
      } catch (error) {
        if (init.signal?.aborted) throw error;
        const kind: ApiErrorKind = timeout.aborted ? 'timeout' : 'network';
        if (attempt < retries) {
          await sleep(backoff(attempt));
          continue;
        }
        throw new ApiError(
          kind,
          kind === 'timeout'
            ? 'The server took too long to respond.'
            : 'Unable to reach the server. Check your connection.',
          undefined,
          correlationId,
        );
      }

      if (response.ok) {
        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
      }

      if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
        await sleep(retryDelay(response, attempt));
        continue;
      }

      throw await toApiError(response, correlationId);
    }
  }

  return {
    request,
    get: <T>(path: string, signal?: AbortSignal) =>
      request<T>(path, { method: 'GET', ...(signal ? { signal } : {}) }),
  };
}

function backoff(attempt: number): number {
  return 300 * 2 ** attempt + Math.floor(Math.random() * 100);
}

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get('retry-after');
  const seconds = header ? Number(header) : Number.NaN;
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
  return backoff(attempt);
}

async function toApiError(
  response: Response,
  requestCorrelationId: string,
): Promise<ApiError> {
  let body: Partial<ApiErrorBody> | undefined;
  try {
    body = (await response.json()) as Partial<ApiErrorBody>;
  } catch {
    body = undefined;
  }
  const correlationId =
    body?.error?.correlationId ??
    response.headers.get(CORRELATION_ID_HEADER) ??
    requestCorrelationId;
  const status = response.status;

  if (status === 401) {
    return new ApiError(
      'unauthorized',
      'Your session has expired. Please sign in again.',
      status,
      correlationId,
    );
  }
  if (status === 403) {
    return new ApiError(
      'forbidden',
      'You do not have permission to do that.',
      status,
      correlationId,
    );
  }
  if (status === 429) {
    return new ApiError(
      'throttled',
      'Too many requests. Please wait a moment and try again.',
      status,
      correlationId,
    );
  }
  if (status >= 500) {
    return new ApiError(
      'server',
      'The service is temporarily unavailable.',
      status,
      correlationId,
    );
  }
  return new ApiError(
    'client',
    body?.error?.message ?? 'The request could not be completed.',
    status,
    correlationId,
  );
}
