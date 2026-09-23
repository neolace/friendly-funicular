import { useAuth } from '../../auth/use-auth';

export function LoginButton({ returnTo }: { returnTo?: string }) {
  const { status, login } = useAuth();
  const busy = status === 'redirecting' || status === 'initializing';
  return (
    <button
      type="button"
      className="button button--primary"
      onClick={() => void login(returnTo)}
      disabled={busy}
      aria-busy={busy}
    >
      {status === 'redirecting' ? 'Redirecting…' : 'Sign in with Microsoft'}
    </button>
  );
}
