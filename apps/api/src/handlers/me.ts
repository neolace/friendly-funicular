import type { RequestIdentity } from '../auth/claims.js';
import { buildMeResponse } from '../services/profile-service.js';
import { json, type JsonResult } from '../utils/http.js';

export function meHandler(identity: RequestIdentity): JsonResult {
  return json(200, buildMeResponse(identity));
}
