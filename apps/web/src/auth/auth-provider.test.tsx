import type { IPublicClientApplication } from '@azure/msal-browser';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TEST_ACCOUNT, TEST_ENV } from '../test/test-utils';
import { AuthProvider } from './auth-provider';
import { useAuth, type AuthContextValue } from './use-auth';

vi.mock('@azure/msal-react', () => ({
  MsalProvider: ({ children }: { children: React.ReactNode }) => children,
}));

function fakeInstance(overrides: Partial<IPublicClientApplication> = {}) {
  let active: unknown = null;
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    handleRedirectPromise: vi.fn().mockResolvedValue(null),
    getAllAccounts: vi.fn(() => []),
    getActiveAccount: vi.fn(() => active),
    setActiveAccount: vi.fn((a: unknown) => {
      active = a;
    }),
    loginRedirect: vi.fn().mockResolvedValue(undefined),
    logoutRedirect: vi.fn().mockResolvedValue(undefined),
    acquireTokenSilent: vi.fn(),
    acquireTokenRedirect: vi.fn(),
    ...overrides,
  } as unknown as IPublicClientApplication;
}

function renderProvider(instance: IPublicClientApplication) {
  const ref: { current?: AuthContextValue } = {};
  function Probe() {
    const auth = useAuth();
    ref.current = auth;
    return <p data-testid="status">{auth.status}</p>;
  }
  render(
    <AuthProvider instance={instance} env={TEST_ENV}>
      <Probe />
    </AuthProvider>,
  );
  return ref;
}

describe('AuthProvider', () => {
  it('starts in the initializing state', () => {
    renderProvider(
      fakeInstance({ initialize: vi.fn(() => new Promise<void>(() => {})) }),
    );
    expect(screen.getByTestId('status')).toHaveTextContent('initializing');
  });

  it('becomes unauthenticated when there is no account', async () => {
    renderProvider(fakeInstance());
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'),
    );
  });

  it('completes the redirect, sets the active account and keeps the return path', async () => {
    const instance = fakeInstance({
      handleRedirectPromise: vi
        .fn()
        .mockResolvedValue({ account: TEST_ACCOUNT, state: '/reports' }),
    });
    const ref = renderProvider(instance);
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated'),
    );
    expect(instance.setActiveAccount).toHaveBeenCalledWith(TEST_ACCOUNT);
    expect(ref.current?.account).toBe(TEST_ACCOUNT);
    expect(ref.current?.returnTo).toBe('/reports');
  });

  it('ignores an unsafe return path in the OAuth state', async () => {
    const ref = renderProvider(
      fakeInstance({
        handleRedirectPromise: vi.fn().mockResolvedValue({
          account: TEST_ACCOUNT,
          state: 'https://evil.example',
        }),
      }),
    );
    await waitFor(() => expect(ref.current?.status).toBe('authenticated'));
    expect(ref.current?.returnTo).toBe('/');
  });

  it('restores an existing session on refresh without a redirect', async () => {
    const instance = fakeInstance({
      getAllAccounts: vi.fn(() => [TEST_ACCOUNT]),
    });
    renderProvider(instance);
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated'),
    );
    expect(instance.loginRedirect).not.toHaveBeenCalled();
  });

  it('surfaces initialization errors and can retry', async () => {
    const handleRedirectPromise = vi
      .fn()
      .mockRejectedValueOnce(new Error('AADSTS50011: redirect mismatch'))
      .mockResolvedValue(null);
    const ref = renderProvider(fakeInstance({ handleRedirectPromise }));
    await waitFor(() => expect(ref.current?.status).toBe('error'));
    expect(ref.current?.error?.message).toContain('AADSTS50011');

    act(() => ref.current?.retry());
    await waitFor(() => expect(ref.current?.status).toBe('unauthenticated'));
  });

  it('starts loginRedirect with the API scope and a sanitized return path', async () => {
    const instance = fakeInstance();
    const ref = renderProvider(instance);
    await waitFor(() => expect(ref.current?.status).toBe('unauthenticated'));

    await act(() => ref.current!.login('/reports'));
    expect(instance.loginRedirect).toHaveBeenCalledWith({
      scopes: [TEST_ENV.apiScope],
      state: '/reports',
    });
    expect(ref.current?.status).toBe('redirecting');
  });

  it('reports a failure to start the login redirect', async () => {
    const instance = fakeInstance({
      loginRedirect: vi.fn().mockRejectedValue(new Error('popup blocked')),
    });
    const ref = renderProvider(instance);
    await waitFor(() => expect(ref.current?.status).toBe('unauthenticated'));
    await act(() => ref.current!.login());
    expect(ref.current?.status).toBe('error');
  });

  it('logs out through Entra for the active account', async () => {
    const instance = fakeInstance({
      getAllAccounts: vi.fn(() => [TEST_ACCOUNT]),
    });
    const ref = renderProvider(instance);
    await waitFor(() => expect(ref.current?.status).toBe('authenticated'));
    await act(() => ref.current!.logout());
    expect(instance.logoutRedirect).toHaveBeenCalledWith({
      account: TEST_ACCOUNT,
    });
  });
});
