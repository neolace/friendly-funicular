import { Link, Outlet } from 'react-router-dom';
import { UserMenu } from '../auth/user-menu';
import { BrandMark } from './brand-mark';

export function AppShell() {
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="shell__header">
        <Link to="/" className="shell__brand">
          <BrandMark size={28} />
          <span>Secure Application</span>
        </Link>
        <UserMenu />
      </header>
      <main id="main" className="shell__main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
