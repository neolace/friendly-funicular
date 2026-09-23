import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/use-auth';
import { LoadingScreen } from '../components/layout/loading-screen';
import { ErrorPage } from './error-page';

/**
 * Optional dedicated redirect target (/auth/callback). The AuthProvider has
 * already processed the redirect response; this page only routes onwards.
 */
export function AuthCallbackPage() {
  const { status, error, returnTo, retry } = useAuth();
  if (status === 'initializing' || status === 'redirecting') {
    return <LoadingScreen label="Completing sign-in…" />;
  }
  if (status === 'error') {
    return (
      <ErrorPage
        title="Sign-in could not be completed"
        message={error?.message}
        onRetry={retry}
      />
    );
  }
  if (status === 'authenticated') return <Navigate to={returnTo} replace />;
  return <Navigate to="/login" replace />;
}
