import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from 'aws-lambda';
import { CORRELATION_ID_HEADER } from '@friendly-funicular/shared';
import type { RequestIdentity } from '../auth/claims.js';
import type { TokenValidator } from '../auth/token-validator.js';
import type { ApiConfig } from '../config/config.js';
import {
  HttpError,
  MethodNotAllowedError,
  NotFoundError,
} from '../errors/http-errors.js';
import {
  errorResponse,
  internalErrorResponse,
  resolveCorrelationId,
  type JsonResult,
} from '../utils/http.js';
import { createLogger, type Logger } from '../utils/logger.js';
import { healthHandler } from './health.js';
import { meHandler } from './me.js';

type PublicRoute = { auth: 'public'; handle: () => JsonResult };
type ProtectedRoute = {
  auth: 'protected';
  handle: (identity: RequestIdentity) => JsonResult | Promise<JsonResult>;
};
type Route = PublicRoute | ProtectedRoute;

/** path -> method -> route */
const ROUTES: Record<string, Record<string, Route>> = {
  '/api/health': { GET: { auth: 'public', handle: healthHandler } },
  '/api/me': { GET: { auth: 'protected', handle: meHandler } },
};

export interface ApplicationDeps {
  config: Pick<ApiConfig, 'serviceName' | 'environment'>;
  validateToken: TokenValidator;
  logWriter?: (line: string) => void;
  now?: () => number;
}

export type FunctionUrlHandler = (
  event: APIGatewayProxyEventV2,
  context: Pick<Context, 'awsRequestId'>,
) => Promise<APIGatewayProxyResultV2>;

function header(
  event: APIGatewayProxyEventV2,
  name: string,
): string | undefined {
  // Function URL lower-cases header names.
  return event.headers?.[name] ?? event.headers?.[name.toLowerCase()];
}

/**
 * Function URL entry point. Order of operations is a security property:
 *   1. establish correlation context
 *   2. public routes (health) short-circuit
 *   3. EVERY other request — including unknown paths — validates the bearer
 *      token before any routing result or business logic is revealed
 *   4. business handler with the normalized identity only
 */
export function createApplicationHandler(
  deps: ApplicationDeps,
): FunctionUrlHandler {
  const now = deps.now ?? Date.now;

  return async (event, context) => {
    const started = now();
    const method = event.requestContext?.http?.method?.toUpperCase() ?? 'GET';
    const path = event.rawPath ?? event.requestContext?.http?.path ?? '/';
    const correlationId = resolveCorrelationId(
      header(event, CORRELATION_ID_HEADER),
    );
    const logger: Logger = createLogger(
      {
        service: deps.config.serviceName,
        environment: deps.config.environment,
        awsRequestId: context.awsRequestId,
        correlationId,
      },
      deps.logWriter,
    );

    const routeMethods = ROUTES[path];
    const route = routeMethods?.[method];
    const routeName = routeMethods ? path : 'unmatched';

    let identity: RequestIdentity | undefined;
    let authOutcome: 'public' | 'accepted' | 'rejected' = 'public';
    let authFailureReason: string | undefined;
    let result: JsonResult;

    try {
      if (route?.auth === 'public') {
        result = route.handle();
      } else {
        try {
          identity = await deps.validateToken(header(event, 'authorization'));
          authOutcome = 'accepted';
        } catch (err) {
          authOutcome = 'rejected';
          if (err instanceof HttpError) {
            authFailureReason = (err as HttpError & { reason?: string }).reason;
          }
          throw err;
        }

        if (!routeMethods) throw new NotFoundError();
        if (!route) throw new MethodNotAllowedError(Object.keys(routeMethods));
        result = await (route as ProtectedRoute).handle(identity);
      }
    } catch (err) {
      if (err instanceof HttpError) {
        result = errorResponse(err, correlationId);
      } else {
        logger.error('unhandled_error', {
          route: routeName,
          method,
          errorName: err instanceof Error ? err.name : typeof err,
          errorMessage: err instanceof Error ? err.message : undefined,
        });
        result = internalErrorResponse(correlationId);
      }
    }

    result.headers[CORRELATION_ID_HEADER] = correlationId;

    const status = result.statusCode;
    logger.log(
      status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
      'request',
      {
        route: routeName,
        method,
        userOid: identity?.oid,
        tenantId: identity?.tid,
        status,
        duration: now() - started,
        result: status < 400 ? 'success' : 'failure',
        authOutcome,
        ...(authFailureReason ? { authFailureReason } : {}),
      },
    );

    return result;
  };
}
