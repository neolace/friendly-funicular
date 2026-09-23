import {
  InteractionRequiredAuthError,
  type IPublicClientApplication,
} from '@azure/msal-browser';

/** The user must interact with Entra (consent, MFA, CA, re-auth). */
export class InteractionRequiredError extends Error {
  constructor() {
    super('Additional sign-in interaction is required.');
    this.name = 'InteractionRequiredError';
  }
}

export class NotSignedInError extends Error {
  constructor() {
    super('No signed-in account.');
    this.name = 'NotSignedInError';
  }
}

export interface TokenService {
  /** Returns an API access token. Never log or persist the result. */
  getAccessToken(): Promise<string>;
}

/**
 * acquireTokenSilent() is the normal path. acquireTokenRedirect() is only a
 * recovery path when Entra reports that interaction is required.
 */
export function createTokenService(
  instance: IPublicClientApplication,
  scopes: string[],
  onInteractionRequired?: () => void,
): TokenService {
  let redirecting: Promise<void> | undefined;

  return {
    async getAccessToken() {
      const account = instance.getActiveAccount();
      if (!account) throw new NotSignedInError();

      try {
        const result = await instance.acquireTokenSilent({ scopes, account });
        return result.accessToken;
      } catch (error) {
        if (error instanceof InteractionRequiredAuthError) {
          onInteractionRequired?.();
          redirecting ??= instance
            .acquireTokenRedirect({ scopes, account })
            .finally(() => {
              redirecting = undefined;
            });
          await redirecting;
          throw new InteractionRequiredError();
        }
        throw error;
      }
    },
  };
}
