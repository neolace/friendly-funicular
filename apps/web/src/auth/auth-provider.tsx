import type {
  AccountInfo,
  AuthenticationResult,
  IPublicClientApplication,
} from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AppEnvironment } from '../config/environment';
import { apiScopes, createLoginRequest, sanitizeReturnTo } from './auth-config';
import { createTokenService } from './token-service';
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
} from './use-auth';

interface AuthProviderProps {
  instance: IPublicClientApplication;
  env: AppEnvironment;
  children: ReactNode;
}

/**
 * MSAL must be initialized and the redirect response processed exactly once
 * per page load — even under React StrictMode's double effects.
 */
const bootstraps = new WeakMap<
  IPublicClientApplication,
  Promise<AuthenticationResult | null>
>();

function bootstrap(
  instance: IPublicClientApplication,
): Promise<AuthenticationResult | null> {
  let pending = bootstraps.get(instance);
  if (!pending) {
    pending = instance
      .initialize()
      .then(() => instance.handleRedirectPromise());
    bootstraps.set(instance, pending);
  }
  return pending;
}

export function AuthProvider({ instance, env, children }: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>('initializing');
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [returnTo, setReturnTo] = useState('/');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    bootstrap(instance)
      .then((result) => {
        if (cancelled) return;
        if (result?.account) instance.setActiveAccount(result.account);
        const active =
          instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;
        if (active && !instance.getActiveAccount())
          instance.setActiveAccount(active);
        if (result?.state) setReturnTo(sanitizeReturnTo(result.state));
        setAccount(active);
        setError(null);
        setStatus(active ? 'authenticated' : 'unauthenticated');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        bootstraps.delete(instance);
        setError(err instanceof Error ? err : new Error('Sign-in failed.'));
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [instance, attempt]);

  const tokenService = useMemo(
    () =>
      createTokenService(instance, apiScopes(env), () =>
        setStatus('interaction_required'),
      ),
    [instance, env],
  );

  const login = useCallback(
    async (target?: string) => {
      setError(null);
      setStatus('redirecting');
      try {
        await instance.loginRedirect(
          createLoginRequest(env, sanitizeReturnTo(target ?? '/')),
        );
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Sign-in failed.'));
        setStatus('error');
      }
    },
    [instance, env],
  );

  const logout = useCallback(async () => {
    setStatus('redirecting');
    try {
      await instance.logoutRedirect({ account: instance.getActiveAccount() });
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Sign-out failed.'));
      setStatus('error');
    }
  }, [instance]);

  const retry = useCallback(() => {
    setError(null);
    setStatus('initializing');
    setAttempt((n) => n + 1);
  }, []);

  const clearReturnTo = useCallback(() => setReturnTo('/'), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      account,
      error,
      returnTo,
      login,
      logout,
      retry,
      clearReturnTo,
      getAccessToken: tokenService.getAccessToken,
    }),
    [
      status,
      account,
      error,
      returnTo,
      login,
      logout,
      retry,
      clearReturnTo,
      tokenService,
    ],
  );

  return (
    <MsalProvider instance={instance}>
      <AuthContext value={value}>{children}</AuthContext>
    </MsalProvider>
  );
}
