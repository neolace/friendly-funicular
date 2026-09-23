import type { AccountInfo } from '@azure/msal-browser';
import { createContext, use } from 'react';

export type AuthStatus =
  | 'initializing'
  | 'unauthenticated'
  | 'redirecting'
  | 'authenticated'
  | 'interaction_required'
  | 'error';

export interface AuthContextValue {
  status: AuthStatus;
  account: AccountInfo | null;
  error: Error | null;
  /** Path to return to after the redirect sign-in completes. */
  returnTo: string;
  login(returnTo?: string): Promise<void>;
  logout(): Promise<void>;
  getAccessToken(): Promise<string>;
  /** Forget returnTo once it has been honoured. */
  clearReturnTo(): void;
  /** Re-run initialization after a failure. */
  retry(): void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth must be used within <AuthProvider>');
  return value;
}
