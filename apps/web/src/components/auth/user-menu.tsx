import { useAuth } from '../../auth/use-auth';
import { LogoutButton } from './logout-button';

/** Presentation only: display name is never used for authorization. */
export function UserMenu() {
  const { account } = useAuth();
  if (!account) return null;
  return (
    <div className="user-menu">
      <span className="user-menu__name" title={account.username}>
        {account.name ?? account.username}
      </span>
      <LogoutButton />
    </div>
  );
}
