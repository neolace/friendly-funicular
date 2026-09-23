import type { AccountInfo } from '@azure/msal-browser';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import type { ApiClient } from '../api/api-client';
import { ApiContext } from '../api/use-api';
import { AuthContext, type AuthContextValue } from '../auth/use-auth';
import type { AppEnvironment } from '../config/environment';

export const TEST_ENV: AppEnvironment = {
  tenantId: '11111111-2222-3333-4444-555555555555',
  clientId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  apiScope: 'api://aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/access_as_user',
  apiBaseUrl: 'https://api.example.test',
};

export const TEST_ACCOUNT = {
  homeAccountId: 'home',
  environment: 'login.microsoftonline.com',
  tenantId: TEST_ENV.tenantId,
  username: 'ada@example.com',
  localAccountId: 'oid-1',
  name: 'Ada Lovelace',
} as AccountInfo;

export function fakeAuth(
  overrides: Partial<AuthContextValue> = {},
): AuthContextValue {
  return {
    status: 'authenticated',
    account: TEST_ACCOUNT,
    error: null,
    returnTo: '/',
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    getAccessToken: vi.fn().mockResolvedValue('token'),
    retry: vi.fn(),
    clearReturnTo: vi.fn(),
    ...overrides,
  };
}

export function fakeApi(get: ApiClient['get'] = vi.fn()): ApiClient {
  return { get, request: vi.fn() };
}

interface Options {
  auth?: AuthContextValue;
  api?: ApiClient;
  route?: string;
  routeState?: unknown;
  /** Extra routes rendered alongside `ui` (which is mounted at `path`). */
  path?: string;
  extraRoutes?: Record<string, ReactElement>;
}

export function renderWithProviders(ui: ReactElement, options: Options = {}) {
  const auth = options.auth ?? fakeAuth();
  const api = options.api ?? fakeApi();
  const path = options.path ?? '*';
  const utils = render(
    <AuthContext value={auth}>
      <ApiContext value={api}>
        <MemoryRouter
          initialEntries={[
            { pathname: options.route ?? '/', state: options.routeState },
          ]}
        >
          <Routes>
            <Route path={path} element={ui} />
            {Object.entries(options.extraRoutes ?? {}).map(([p, el]) => (
              <Route key={p} path={p} element={el} />
            ))}
          </Routes>
        </MemoryRouter>
      </ApiContext>
    </AuthContext>,
  );
  return { ...utils, auth, api };
}
