import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../App';

export function Header({ children }: { children?: ReactNode }) {
  const { user, signOut } = useAuth();
  return (
    <header className="header">
      <Link to="/" className="brand">
        Ajaia Docs
      </Link>
      <div className="header-middle">{children}</div>
      <div className="header-user">
        <span className="avatar" title={user.email}>
          {user.name[0]}
        </span>
        <span className="hide-sm">{user.name}</span>
        <button className="btn ghost" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </header>
  );
}
