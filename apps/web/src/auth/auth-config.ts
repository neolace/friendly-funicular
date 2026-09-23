import {
  BrowserCacheLocation,
  LogLevel,
  type Configuration,
  type RedirectRequest,
} from '@azure/msal-browser';
import type { AppEnvironment } from '../config/environment';

/**
 * Static MSAL configuration. Single-tenant authority, public client (no
 * secret), sessionStorage cache. MSAL performs Authorization Code + PKCE.
 */
export function createMsalConfiguration(
  env: AppEnvironment,
  origin: string = window.location.origin,
): Configuration {
  return {
    auth: {
      clientId: env.clientId,
      authority: `https://login.microsoftonline.com/${env.tenantId}`,
      redirectUri: origin,
      postLogoutRedirectUri: `${origin}/login`,
    },
    cache: {
      // Tab/session scoped. Changing this is a security trade-off — record
      // it in docs/security.md before doing so.
      cacheLocation: BrowserCacheLocation.SessionStorage,
    },
    system: {
      loggerOptions: {
        logLevel: LogLevel.Warning,
        piiLoggingEnabled: false,
        loggerCallback: (level, message, containsPii) => {
          if (containsPii) return;
          if (level === LogLevel.Error) console.error(message);
          else if (level === LogLevel.Warning) console.warn(message);
        },
      },
    },
  };
}

/** Scopes requested at sign-in and for every API call. */
export function apiScopes(env: AppEnvironment): string[] {
  return [env.apiScope];
}

export function createLoginRequest(
  env: AppEnvironment,
  returnTo?: string,
): RedirectRequest {
  return {
    scopes: apiScopes(env),
    ...(returnTo ? { state: returnTo } : {}),
  };
}

/**
 * Only same-origin, path-relative return targets are honoured after sign-in
 * (prevents open redirects via the OAuth state parameter).
 */
export function sanitizeReturnTo(value: unknown): string {
  if (typeof value !== 'string') return '/';
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return '/';
  }
  if (value.startsWith('/login') || value.startsWith('/auth/callback'))
    return '/';
  return value;
}
