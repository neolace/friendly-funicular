import { Navigate, useLocation } from 'react-router-dom';
import { sanitizeReturnTo } from '../auth/auth-config';
import { useAuth } from '../auth/use-auth';
import { LoginButton } from '../components/auth/login-button';
import { BrandMark } from '../components/layout/brand-mark';

/**
 * Application entry point — NOT a credential form. Username, password, MFA
 * and Conditional Access all happen on Microsoft-hosted pages.
 */
export function LoginPage() {
  const { status, error, retry } = useAuth();
  const location = useLocation();
  const from = sanitizeReturnTo(
    (location.state as { from?: unknown } | null)?.from,
  );

  if (status === 'authenticated') {
    // ProtectedRoute honours any post-redirect returnTo from the OAuth state.
    return <Navigate to={from} replace />;
  }

  return (
    <main className="centered login">
      <section className="card login__card" aria-labelledby="login-title">
        <BrandMark />
        <h1 id="login-title">Secure Application</h1>
        <p className="muted">Sign in using your corporate account</p>

        {status === 'initializing' ? (
          <p role="status" aria-live="polite" className="login__status">
            <span className="spinner" aria-hidden="true" /> Checking your
            session…
          </p>
        ) : status === 'error' ? (
          <div className="alert" role="alert">
            <p>
              <strong>We couldn’t sign you in.</strong>{' '}
              {error?.message ?? 'Please try again.'}
            </p>
            <button
              type="button"
              className="button button--secondary"
              onClick={retry}
            >
              Retry
            </button>
          </div>
        ) : null}

        {status !== 'initializing' && <LoginButton returnTo={from} />}

        {status === 'redirecting' && (
          <p role="status" aria-live="polite" className="muted small">
            Taking you to Microsoft sign-in…
          </p>
        )}

        <p className="muted small login__footer">
          Protected by Microsoft Entra ID
        </p>
      </section>
    </main>
  );
}
