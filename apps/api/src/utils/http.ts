import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ApiErrorBody } from '@friendly-funicular/shared';
import type { HttpError } from '../errors/http-errors.js';

const SAFE_CORRELATION_ID = /^[A-Za-z0-9\-_.]{8,128}$/;

/** Accept a caller-supplied correlation ID only if it is safe to log/echo. */
export function resolveCorrelationId(candidate: string | undefined): string {
  return candidate && SAFE_CORRELATION_ID.test(candidate)
    ? candidate
    : randomUUID();
}

const BASE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

export type JsonResult = APIGatewayProxyResultV2 & {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

export function json(
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
): JsonResult {
  return {
    statusCode,
    headers: { ...BASE_HEADERS, ...headers },
    body: JSON.stringify(body),
  };
}

export function errorResponse(
  error: HttpError,
  correlationId: string,
): JsonResult {
  const body: ApiErrorBody = {
    error: { code: error.code, message: error.message, correlationId },
  };
  return json(error.status, body, error.headers);
}

export function internalErrorResponse(correlationId: string): JsonResult {
  const body: ApiErrorBody = {
    error: {
      code: 'internal_error',
      message: 'An unexpected error occurred.',
      correlationId,
    },
  };
  return json(500, body);
}
