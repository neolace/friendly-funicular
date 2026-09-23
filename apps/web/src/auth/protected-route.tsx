import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoadingScreen } from '../components/layout/loading-screen';
import { ErrorPage } from '../pages/error-page';
import { useAuth } from './use-auth';

/**
 * UX control only — NOT a security boundary. Every protected backend
 * operation is independently enforced by Lambda token validation and
 * business authorization.
 */
export function ProtectedRoute() {
  const { status, error, retry, returnTo } = useAuth();
  const location = useLocation();

  switch (status) {
    case 'initializing':
      return <LoadingScreen label="Checking your session…" />;
    case 'redirecting':
      return <LoadingScreen label="Redirecting to Microsoft sign-in…" />;
    case 'error':
      return (
        <ErrorPage
          title="Sign-in problem"
          message={error?.message ?? 'We could not confirm your session.'}
          onRetry={retry}
        />
      );
    case 'authenticated':
    case 'interaction_required':
      // After the Entra redirect lands on "/", continue to the page the user
      // originally asked for (sanitized, same-origin path only).
      if (returnTo !== '/' && location.pathname === '/') {
        return <ReturnToRedirect to={returnTo} />;
      }
      return <Outlet />;
    case 'unauthenticated':
      return (
        <Navigate
          to="/login"
          replace
          state={{ from: `${location.pathname}${location.search}` }}
        />
      );
  }
}

function ReturnToRedirect({ to }: { to: string }) {
  const { clearReturnTo } = useAuth();
  useEffect(() => clearReturnTo(), [clearReturnTo]);
  return <Navigate to={to} replace />;
}
