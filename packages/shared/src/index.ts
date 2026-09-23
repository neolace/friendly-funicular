/**
 * Contracts shared by the SPA (apps/web) and the Lambda API (apps/api).
 * Types only plus a few constants — no runtime dependencies.
 */

/** Delegated scope exposed by the single Entra app registration. */
export const API_SCOPE_NAME = 'access_as_user';

/** Header used to propagate a request correlation ID end to end. */
export const CORRELATION_ID_HEADER = 'x-correlation-id';

export interface HealthResponse {
  status: 'ok';
}

/**
 * Allow-listed identity projection returned by GET /api/me.
 * Deliberately excludes the raw token and mutable claims such as email/UPN.
 */
export interface MeResponse {
  oid: string;
  tenantId: string;
  scopes: string[];
  roles: string[];
  name?: string;
}

export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'method_not_allowed'
  | 'bad_request'
  | 'internal_error';

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    correlationId: string;
  };
}
