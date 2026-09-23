export type {
  ApiErrorBody,
  HealthResponse,
  MeResponse,
} from '@friendly-funicular/shared';

export type ApiErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'throttled'
  | 'server'
  | 'network'
  | 'timeout'
  | 'client'
  | 'interaction_required';

/** Normalized API failure. Never contains the bearer token. */
export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
    readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
