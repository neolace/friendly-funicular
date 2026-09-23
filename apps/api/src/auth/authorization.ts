import { ForbiddenError } from '../errors/http-errors.js';
import type { RequestIdentity } from './claims.js';

/**
 * Business authorization helpers. These operate on the validated identity
 * context and stable claims only (oid/sub/tid/scp/roles) — never on email,
 * preferred_username, UPN or display name.
 */

export function hasScope(identity: RequestIdentity, scope: string): boolean {
  return identity.scopes.includes(scope);
}

export function hasRole(identity: RequestIdentity, role: string): boolean {
  return identity.roles.includes(role);
}

export function requireScope(identity: RequestIdentity, scope: string): void {
  if (!hasScope(identity, scope)) {
    throw new ForbiddenError('missing_scope', undefined, true);
  }
}

export function requireRole(identity: RequestIdentity, role: string): void {
  if (!hasRole(identity, role)) {
    throw new ForbiddenError('missing_role');
  }
}

export function requireAnyRole(
  identity: RequestIdentity,
  roles: readonly string[],
): void {
  if (!roles.some((role) => hasRole(identity, role))) {
    throw new ForbiddenError('missing_role');
  }
}

/** A resource is owned by the Entra object ID recorded when it was created. */
export interface OwnedResource {
  ownerOid: string;
  tenantId: string;
}

/**
 * Owner may access their own resource; an optional admin role may access any
 * resource in the same tenant. Cross-tenant access is always denied.
 */
export function canAccessResource(
  identity: RequestIdentity,
  resource: OwnedResource,
  adminRole?: string,
): boolean {
  if (resource.tenantId.toLowerCase() !== identity.tid) return false;
  if (resource.ownerOid === identity.oid) return true;
  return adminRole !== undefined && hasRole(identity, adminRole);
}

export function requireResourceAccess(
  identity: RequestIdentity,
  resource: OwnedResource,
  adminRole?: string,
): void {
  if (!canAccessResource(identity, resource, adminRole)) {
    throw new ForbiddenError('resource_access_denied');
  }
}
