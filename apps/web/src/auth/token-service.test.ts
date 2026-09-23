import {
  InteractionRequiredAuthError,
  type IPublicClientApplication,
} from '@azure/msal-browser';
import { describe, expect, it, vi } from 'vitest';
import { TEST_ACCOUNT } from '../test/test-utils';
import {
  InteractionRequiredError,
  NotSignedInError,
  createTokenService,
} from './token-service';

function fakeInstance(overrides: Partial<IPublicClientApplication> = {}) {
  return {
    getActiveAccount: vi.fn(() => TEST_ACCOUNT),
    acquireTokenSilent: vi.fn().mockResolvedValue({ accessToken: 'at-123' }),
    acquireTokenRedirect: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as IPublicClientApplication;
}

describe('createTokenService', () => {
  it('acquires tokens silently for the API scope and active account', async () => {
    const instance = fakeInstance();
    const service = createTokenService(instance, ['api://x/access_as_user']);
    await expect(service.getAccessToken()).resolves.toBe('at-123');
    expect(instance.acquireTokenSilent).toHaveBeenCalledWith({
      scopes: ['api://x/access_as_user'],
      account: TEST_ACCOUNT,
    });
    expect(instance.acquireTokenRedirect).not.toHaveBeenCalled();
  });

  it('fails when nobody is signed in', async () => {
    const service = createTokenService(
      fakeInstance({ getActiveAccount: vi.fn(() => null) }),
      ['s'],
    );
    await expect(service.getAccessToken()).rejects.toBeInstanceOf(
      NotSignedInError,
    );
  });

  it('falls back to acquireTokenRedirect only when interaction is required', async () => {
    const onInteraction = vi.fn();
    const instance = fakeInstance({
      acquireTokenSilent: vi
        .fn()
        .mockRejectedValue(
          new InteractionRequiredAuthError('interaction_required', 'corr'),
        ),
    });
    const service = createTokenService(instance, ['s'], onInteraction);
    await expect(service.getAccessToken()).rejects.toBeInstanceOf(
      InteractionRequiredError,
    );
    expect(instance.acquireTokenRedirect).toHaveBeenCalledWith({
      scopes: ['s'],
      account: TEST_ACCOUNT,
    });
    expect(onInteraction).toHaveBeenCalled();
  });

  it('does not start more than one interactive redirect at a time', async () => {
    let finish!: () => void;
    const instance = fakeInstance({
      acquireTokenSilent: vi
        .fn()
        .mockRejectedValue(
          new InteractionRequiredAuthError('consent_required', 'corr'),
        ),
      acquireTokenRedirect: vi.fn(
        () => new Promise<void>((resolve) => (finish = resolve)),
      ),
    });
    const service = createTokenService(instance, ['s']);
    const a = service.getAccessToken().catch((e: unknown) => e);
    const b = service.getAccessToken().catch((e: unknown) => e);
    await vi.waitFor(() =>
      expect(instance.acquireTokenRedirect).toHaveBeenCalled(),
    );
    finish();
    await Promise.all([a, b]);
    expect(instance.acquireTokenRedirect).toHaveBeenCalledTimes(1);
  });

  it('propagates other token acquisition failures', async () => {
    const service = createTokenService(
      fakeInstance({
        acquireTokenSilent: vi
          .fn()
          .mockRejectedValue(new Error('network down')),
      }),
      ['s'],
    );
    await expect(service.getAccessToken()).rejects.toThrow('network down');
  });
});
