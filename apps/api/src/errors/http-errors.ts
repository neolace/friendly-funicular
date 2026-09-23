import type { ApiErrorCode } from '@friendly-funicular/shared';

/** Error that maps directly onto an HTTP response. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** 401 — credential absent, malformed, expired, or not for this API. */
export class UnauthorizedError extends HttpError {
  constructor(
    readonly reason: string,
    message = 'Authentication is required.',
  ) {
    super(401, 'unauthorized', message, {
      'www-authenticate': 'Bearer error="invalid_token"',
    });
    this.name = 'UnauthorizedError';
  }
}

/** 403 — authenticated, but not permitted. */
export class ForbiddenError extends HttpError {
  constructor(
    readonly reason: string,
    message = 'You do not have permission to perform this operation.',
    insufficientScope = false,
  ) {
    super(
      403,
      'forbidden',
      message,
      insufficientScope
        ? { 'www-authenticate': 'Bearer error="insufficient_scope"' }
        : {},
    );
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends HttpError {
  constructor() {
    super(404, 'not_found', 'Resource not found.');
  }
}

export class MethodNotAllowedError extends HttpError {
  constructor(allowed: string[]) {
    super(405, 'method_not_allowed', 'Method not allowed.', {
      allow: allowed.join(', '),
    });
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string) {
    super(400, 'bad_request', message);
  }
}
