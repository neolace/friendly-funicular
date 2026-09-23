import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { fakeAuth } from '../test/test-utils';
import { ProtectedRoute } from './protected-route';
import { AuthContext, type AuthContextValue } from './use-auth';

function LoginProbe() {
  const location = useLocation();
  return <p>login page from {(location.state as { from: string }).from}</p>;
}

function renderAt(route: string, auth: AuthContextValue = fakeAuth()) {
  render(
    <AuthContext value={auth}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/login" element={<LoginProbe />} />
          <Route element={<ProtectedRoute />}>
            <Route index element={<p>home content</p>} />
            <Route path="/reports" element={<p>reports content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext>,
  );
  return auth;
}

describe('ProtectedRoute', () => {
  it('shows a loading state (and no protected content) while initializing', () => {
    renderAt('/reports', fakeAuth({ status: 'initializing' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      /checking your session/i,
    );
    expect(screen.queryByText('reports content')).not.toBeInTheDocument();
  });

  it('redirects unauthenticated users to /login, remembering the target', () => {
    renderAt(
      '/reports?tab=2',
      fakeAuth({ status: 'unauthenticated', account: null }),
    );
    expect(
      screen.getByText('login page from /reports?tab=2'),
    ).toBeInTheDocument();
  });

  it('renders the protected route when authenticated', () => {
    renderAt('/reports');
    expect(screen.getByText('reports content')).toBeInTheDocument();
  });

  it('shows redirect progress', () => {
    renderAt('/reports', fakeAuth({ status: 'redirecting' }));
    expect(screen.getByRole('status')).toHaveTextContent(/redirecting/i);
  });

  it('shows an error with a retry action', () => {
    renderAt(
      '/reports',
      fakeAuth({ status: 'error', error: new Error('boom') }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
    expect(
      screen.getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it('continues to the original page after the sign-in redirect lands on /', () => {
    const auth = renderAt('/', fakeAuth({ returnTo: '/reports' }));
    expect(screen.getByText('reports content')).toBeInTheDocument();
    expect(auth.clearReturnTo).toHaveBeenCalled();
  });
});
