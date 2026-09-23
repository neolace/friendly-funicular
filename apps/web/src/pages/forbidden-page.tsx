import { Link } from 'react-router-dom';

export function ForbiddenPage() {
  return (
    <section className="card" aria-labelledby="forbidden-title">
      <h1 id="forbidden-title">Access denied</h1>
      <p className="muted">
        You are signed in, but your account does not have permission to use this
        feature. Contact your administrator if you believe this is a mistake.
      </p>
      <div className="actions">
        <Link className="button button--secondary" to="/">
          Back to home
        </Link>
      </div>
    </section>
  );
}
