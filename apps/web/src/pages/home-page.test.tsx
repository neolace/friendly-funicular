import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-types';
import { fakeApi, fakeAuth, renderWithProviders } from '../test/test-utils';
import { HomePage } from './home-page';

const me = {
  oid: 'oid-1',
  tenantId: 'tid-1',
  scopes: ['access_as_user'],
  roles: ['Reader'],
  name: 'Ada Lovelace',
};

describe('HomePage', () => {
  it('shows a loading state, then the validated identity from /api/me', async () => {
    const get = vi.fn().mockResolvedValue(me);
    renderWithProviders(<HomePage />, { api: fakeApi(get) });
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
    expect(await screen.findByText('oid-1')).toBeInTheDocument();
    expect(screen.getByText('access_as_user')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/api/me', expect.any(AbortSignal));
  });

  it('offers to sign in again on 401', async () => {
    const auth = fakeAuth();
    const get = vi
      .fn()
      .mockRejectedValue(
        new ApiError('unauthorized', 'Your session has expired.', 401, 'c-1'),
      );
    renderWithProviders(<HomePage />, { api: fakeApi(get), auth });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /session has expired/i,
    );
    expect(screen.getByText('c-1')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: /sign in again/i }),
    );
    expect(auth.login).toHaveBeenCalledWith('/');
  });

  it('sends the user to the access-denied page on 403', async () => {
    const get = vi
      .fn()
      .mockRejectedValue(new ApiError('forbidden', 'nope', 403));
    renderWithProviders(<HomePage />, {
      api: fakeApi(get),
      path: '/',
      extraRoutes: { '/forbidden': <p>access denied page</p> },
    });
    expect(await screen.findByText('access denied page')).toBeInTheDocument();
  });

  it('allows retrying after a server error', async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError('server', 'The service is temporarily unavailable.', 503),
      )
      .mockResolvedValueOnce(me);
    renderWithProviders(<HomePage />, { api: fakeApi(get) });
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByText('oid-1')).toBeInTheDocument());
    expect(get).toHaveBeenCalledTimes(2);
  });
});
