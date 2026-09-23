import { describe, expect, it } from 'vitest';
import {
  canAccessResource,
  hasRole,
  hasScope,
  requireAnyRole,
  requireResourceAccess,
  requireRole,
  requireScope,
} from '../src/auth/authorization.js';
import type { RequestIdentity } from '../src/auth/claims.js';
import { ForbiddenError } from '../src/errors/http-errors.js';
import { TENANT_ID, USER_OID } from './helpers.js';

const user: RequestIdentity = {
  oid: USER_OID,
  sub: 's',
  tid: TENANT_ID,
  scopes: ['access_as_user'],
  roles: ['Reader'],
};
const admin: RequestIdentity = { ...user, oid: 'admin-oid', roles: ['Admin'] };

describe('scope and role helpers', () => {
  it('checks scopes', () => {
    expect(hasScope(user, 'access_as_user')).toBe(true);
    expect(hasScope(user, 'other')).toBe(false);
    expect(() => requireScope(user, 'other')).toThrow(ForbiddenError);
  });

  it('checks roles', () => {
    expect(hasRole(user, 'Reader')).toBe(true);
    expect(() => requireRole(user, 'Admin')).toThrow(ForbiddenError);
    expect(() => requireRole(admin, 'Admin')).not.toThrow();
    expect(() => requireAnyRole(user, ['Admin', 'Reader'])).not.toThrow();
    expect(() => requireAnyRole(user, ['Admin'])).toThrow(ForbiddenError);
  });
});

describe('resource authorization', () => {
  const owned = { ownerOid: USER_OID, tenantId: TENANT_ID };
  const othersResource = { ownerOid: 'someone-else', tenantId: TENANT_ID };
  const foreignTenant = {
    ownerOid: USER_OID,
    tenantId: '00000000-0000-0000-0000-000000000000',
  };

  it('allows the owner', () => {
    expect(canAccessResource(user, owned)).toBe(true);
    expect(() => requireResourceAccess(user, owned)).not.toThrow();
  });

  it('denies a non-owner', () => {
    expect(canAccessResource(user, othersResource)).toBe(false);
    expect(() => requireResourceAccess(user, othersResource)).toThrow(
      ForbiddenError,
    );
  });

  it('allows an admin in the same tenant when an admin role is configured', () => {
    expect(canAccessResource(admin, othersResource, 'Admin')).toBe(true);
    expect(canAccessResource(admin, othersResource)).toBe(false);
  });

  it('always denies cross-tenant access, even for the same oid or admins', () => {
    expect(canAccessResource(user, foreignTenant)).toBe(false);
    expect(canAccessResource(admin, foreignTenant, 'Admin')).toBe(false);
  });
});
