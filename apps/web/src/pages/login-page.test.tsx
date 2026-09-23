import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fakeAuth, renderWithProviders } from '../test/test-utils';
import { LoginPage } from './login-page';

const unauthenticated = () =>
  fakeAuth({ status: 'unauthenticated', account: null });

describe('LoginPage', () => {
  it('renders branding and the Microsoft sign-in action', () => {
    renderWithProviders(<LoginPage />, {
      auth: unauthenticated(),
      route: '/login',
    });
    expect(
      screen.getByRole('heading', { name: 'Secure Application' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/protected by microsoft entra id/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /sign in with microsoft/i }),
    ).toBeEnabled();
  });

  it('never renders credential fields', () => {
    const { container } = renderWithProviders(<LoginPage />, {
      auth: unauthenticated(),
      route: '/login',
    });
    expect(container.querySelectorAll('input')).toHaveLength(0);
  });

  it('starts the redirect with the remembered target (keyboard accessible)', async () => {
    const auth = unauthenticated();
    renderWithProviders(<LoginPage />, {
      auth,
      route: '/login',
      routeState: { from: '/reports' },
    });
    await userEvent.tab();
    expect(
      screen.getByRole('button', { name: /sign in with microsoft/i }),
    ).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(auth.login).toHaveBeenCalledWith('/reports');
  });

  it('shows a loading state while the session is checked', () => {
    renderWithProviders(<LoginPage />, {
      auth: fakeAuth({ status: 'initializing', account: null }),
      route: '/login',
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      /checking your session/i,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows redirect progress and disables the button', () => {
    renderWithProviders(<LoginPage />, {
      auth: fakeAuth({ status: 'redirecting', account: null }),
      route: '/login',
    });
    expect(screen.getByRole('button', { name: /redirecting/i })).toBeDisabled();
    expect(
      screen.getByText(/taking you to microsoft sign-in/i),
    ).toBeInTheDocument();
  });

  it('shows a friendly error with a retry action', async () => {
    const auth = fakeAuth({
      status: 'error',
      account: null,
      error: new Error('The request was cancelled.'),
    });
    renderWithProviders(<LoginPage />, { auth, route: '/login' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      /couldn’t sign you in/i,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(auth.retry).toHaveBeenCalled();
  });

  it('sends authenticated users on to their destination', () => {
    renderWithProviders(<LoginPage />, {
      route: '/login',
      routeState: { from: '/reports' },
      path: '/login',
      extraRoutes: { '/reports': <p>reports page</p> },
    });
    expect(screen.getByText('reports page')).toBeInTheDocument();
  });
});
