import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ApiError, type MeResponse } from '../api/api-types';
import { useApi } from '../api/use-api';
import { useAuth } from '../auth/use-auth';

type State =
  | { kind: 'loading' }
  | { kind: 'loaded'; me: MeResponse }
  | { kind: 'failed'; error: ApiError };

export function HomePage() {
  const api = useApi();
  const { login } = useAuth();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .get<MeResponse>('/api/me', controller.signal)
      .then((me) => setState({ kind: 'loaded', me }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          kind: 'failed',
          error:
            error instanceof ApiError
              ? error
              : new ApiError('network', 'Unable to load your profile.'),
        });
      });
    return () => controller.abort();
  }, [api, attempt]);

  if (state.kind === 'failed' && state.error.kind === 'forbidden') {
    return <Navigate to="/forbidden" replace />;
  }

  return (
    <section className="card" aria-labelledby="home-title">
      <h1 id="home-title">Welcome</h1>

      {state.kind === 'loading' && (
        <p role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" /> Loading your profile…
        </p>
      )}

      {state.kind === 'loaded' && (
        <>
          <p className="muted">
            The API validated your Entra access token. These values come from
            the Lambda-validated identity context, not from the browser.
          </p>
          <dl className="claims">
            {state.me.name && (
              <>
                <dt>Name</dt>
                <dd>{state.me.name}</dd>
              </>
            )}
            <dt>Object ID (oid)</dt>
            <dd>
              <code>{state.me.oid}</code>
            </dd>
            <dt>Tenant ID</dt>
            <dd>
              <code>{state.me.tenantId}</code>
            </dd>
            <dt>Scopes</dt>
            <dd>{state.me.scopes.join(', ') || '—'}</dd>
            <dt>Roles</dt>
            <dd>{state.me.roles.join(', ') || '—'}</dd>
          </dl>
        </>
      )}

      {state.kind === 'failed' && (
        <div className="alert" role="alert">
          <p>{state.error.message}</p>
          {state.error.correlationId && (
            <p className="small">
              Reference: <code>{state.error.correlationId}</code>
            </p>
          )}
          <div className="actions">
            {state.error.kind === 'unauthorized' ||
            state.error.kind === 'interaction_required' ? (
              <button
                type="button"
                className="button button--primary"
                onClick={() => void login('/')}
              >
                Sign in again
              </button>
            ) : (
              <button
                type="button"
                className="button button--secondary"
                onClick={() => {
                  setState({ kind: 'loading' });
                  setAttempt((n) => n + 1);
                }}
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
