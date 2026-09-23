import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { createTokenValidator } from './auth/token-validator.js';
import { loadConfig } from './config/config.js';
import {
  createApplicationHandler,
  type FunctionUrlHandler,
} from './handlers/application.js';

/**
 * Lambda entry point. Configuration and the token validator (with its JWKS
 * cache) are created once per execution environment and reused across
 * invocations. No user-specific state is cached at module scope.
 */
let app: FunctionUrlHandler | undefined;

function getApp(): FunctionUrlHandler {
  if (!app) {
    const config = loadConfig();
    app = createApplicationHandler({
      config,
      validateToken: createTokenValidator({
        tenantId: config.tenantId,
        audience: config.audience,
        requiredScope: config.requiredScope,
        clockToleranceSeconds: config.clockToleranceSeconds,
      }),
    });
  }
  return app;
}

export const handler = (event: APIGatewayProxyEventV2, context: Context) =>
  getApp()(event, context);
