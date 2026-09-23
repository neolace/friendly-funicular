import { useAuth } from '../../auth/use-auth';

export function LogoutButton() {
  const { status, logout } = useAuth();
  return (
    <button
      type="button"
      className="button button--secondary"
      onClick={() => void logout()}
      disabled={status === 'redirecting'}
    >
      Sign out
    </button>
  );
}
