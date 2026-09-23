import type { JWTPayload } from 'jose';

/**
 * Normalized identity built ONLY from validated token claims. This is the
 * sole identity object passed beyond the authentication layer; the raw
 * bearer token never leaves it.
 */
export interface RequestIdentity {
  readonly oid: string;
  readonly sub: string;
  readonly tid: string;
  readonly scopes: readonly string[];
  readonly roles: readonly string[];
  /** Presentation only — never use for authorization. */
  readonly name?: string;
}

export interface EntraAccessTokenClaims extends JWTPayload {
  tid?: unknown;
  oid?: unknown;
  scp?: unknown;
  roles?: unknown;
  ver?: unknown;
  name?: unknown;
}

export function parseScopes(scp: unknown): string[] {
  if (typeof scp !== 'string') return [];
  return scp.split(' ').filter((s) => s.length > 0);
}

export function parseRoles(roles: unknown): string[] {
  if (!Array.isArray(roles)) return [];
  return roles.filter((r): r is string => typeof r === 'string');
}

export function toRequestIdentity(
  claims: EntraAccessTokenClaims,
): RequestIdentity {
  const identity: RequestIdentity = {
    oid: String(claims.oid),
    sub: String(claims.sub),
    tid: String(claims.tid).toLowerCase(),
    scopes: Object.freeze(parseScopes(claims.scp)),
    roles: Object.freeze(parseRoles(claims.roles)),
    ...(typeof claims.name === 'string' ? { name: claims.name } : {}),
  };
  return Object.freeze(identity);
}
