import type { HealthResponse } from '@friendly-funicular/shared';
import { json, type JsonResult } from '../utils/http.js';

/**
 * Unauthenticated liveness response. Must never expose configuration,
 * dependency details, versions or environment variables.
 */
export function healthHandler(): JsonResult {
  const body: HealthResponse = { status: 'ok' };
  return json(200, body);
}
