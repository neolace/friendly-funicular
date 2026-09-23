import { describe, expect, it } from 'vitest';
import { EnvironmentError, readEnvironment } from './environment';

const valid = {
  VITE_ENTRA_TENANT_ID: '11111111-2222-3333-4444-555555555555',
  VITE_ENTRA_CLIENT_ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  VITE_ENTRA_API_SCOPE:
    'api://aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/access_as_user',
  VITE_API_BASE_URL: 'https://abc.lambda-url.eu-west-1.on.aws/',
};

describe('readEnvironment', () => {
  it('reads and normalizes valid configuration', () => {
    expect(readEnvironment(valid)).toEqual({
      tenantId: valid.VITE_ENTRA_TENANT_ID,
      clientId: valid.VITE_ENTRA_CLIENT_ID,
      apiScope: valid.VITE_ENTRA_API_SCOPE,
      apiBaseUrl: 'https://abc.lambda-url.eu-west-1.on.aws',
    });
  });

  it('allows http only for localhost', () => {
    expect(
      readEnvironment({ ...valid, VITE_API_BASE_URL: 'http://localhost:3001' })
        .apiBaseUrl,
    ).toBe('http://localhost:3001');
    expect(() =>
      readEnvironment({
        ...valid,
        VITE_API_BASE_URL: 'http://api.example.com',
      }),
    ).toThrow(EnvironmentError);
  });

  it('rejects multi-tenant authorities and mismatched scopes', () => {
    const error = (() => {
      try {
        readEnvironment({
          ...valid,
          VITE_ENTRA_TENANT_ID: 'common',
          VITE_ENTRA_API_SCOPE: 'api://other/access_as_user',
        });
      } catch (e) {
        return e as EnvironmentError;
      }
    })();
    expect(error?.problems).toHaveLength(2);
  });

  it('reports every missing value', () => {
    expect(() => readEnvironment({})).toThrow(/VITE_ENTRA_TENANT_ID/);
  });
});
