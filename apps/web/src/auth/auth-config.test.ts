import { BrowserCacheLocation } from '@azure/msal-browser';
import { describe, expect, it } from 'vitest';
import { TEST_ENV } from '../test/test-utils';
import {
  createLoginRequest,
  createMsalConfiguration,
  sanitizeReturnTo,
} from './auth-config';

describe('createMsalConfiguration', () => {
  it('uses the tenant-specific authority, origin redirect and sessionStorage', () => {
    const config = createMsalConfiguration(TEST_ENV, 'https://app.example.com');
    expect(config.auth).toMatchObject({
      clientId: TEST_ENV.clientId,
      authority: `https://login.microsoftonline.com/${TEST_ENV.tenantId}`,
      redirectUri: 'https://app.example.com',
      postLogoutRedirectUri: 'https://app.example.com/login',
    });
    expect(config.cache?.cacheLocation).toBe(
      BrowserCacheLocation.SessionStorage,
    );
    expect(JSON.stringify(config)).not.toMatch(/secret/i);
  });

  it('requests the API scope at sign-in', () => {
    expect(createLoginRequest(TEST_ENV, '/reports')).toEqual({
      scopes: [TEST_ENV.apiScope],
      state: '/reports',
    });
  });
});

describe('sanitizeReturnTo', () => {
  it.each([
    ['/reports?x=1', '/reports?x=1'],
    ['https://evil.example', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['/login', '/'],
    [undefined, '/'],
    [42, '/'],
  ])('%s -> %s', (input, expected) => {
    expect(sanitizeReturnTo(input)).toBe(expected);
  });
});
