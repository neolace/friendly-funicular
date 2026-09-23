import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fakeAuth, renderWithProviders } from '../../test/test-utils';
import { UserMenu } from './user-menu';

describe('UserMenu', () => {
  it('shows the account name and signs out', async () => {
    const auth = fakeAuth();
    renderWithProviders(<UserMenu />, { auth });
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(auth.logout).toHaveBeenCalled();
  });

  it('renders nothing without an account', () => {
    const { container } = renderWithProviders(<UserMenu />, {
      auth: fakeAuth({ account: null, status: 'unauthenticated' }),
    });
    expect(container).toBeEmptyDOMElement();
  });
});
