import { Link } from 'react-router-dom';

interface ErrorPageProps {
  title?: string;
  message?: string;
  correlationId?: string;
  onRetry?: () => void;
}

export function ErrorPage({
  title = 'Something went wrong',
  message = 'An unexpected error occurred.',
  correlationId,
  onRetry,
}: ErrorPageProps) {
  return (
    <main className="centered">
      <section className="card" role="alert" aria-labelledby="error-title">
        <h1 id="error-title">{title}</h1>
        <p className="muted">{message}</p>
        {correlationId && (
          <p className="muted small">
            Reference: <code>{correlationId}</code>
          </p>
        )}
        <div className="actions">
          {onRetry && (
            <button
              type="button"
              className="button button--primary"
              onClick={onRetry}
            >
              Try again
            </button>
          )}
          <Link className="button button--secondary" to="/">
            Go home
          </Link>
        </div>
      </section>
    </main>
  );
}

export function NotFoundPage() {
  return (
    <ErrorPage
      title="Page not found"
      message="The page you requested does not exist."
    />
  );
}
