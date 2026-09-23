import type { MeResponse } from '@friendly-funicular/shared';
import type { RequestIdentity } from '../auth/claims.js';

/**
 * Builds the allow-listed identity projection for GET /api/me. This is a
 * diagnostic bootstrap endpoint — it confirms wiring without echoing tokens.
 */
export function buildMeResponse(identity: RequestIdentity): MeResponse {
  return {
    oid: identity.oid,
    tenantId: identity.tid,
    scopes: [...identity.scopes],
    roles: [...identity.roles],
    ...(identity.name ? { name: identity.name } : {}),
  };
}
