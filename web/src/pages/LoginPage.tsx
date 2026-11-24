import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import type { User } from '../types';
import { Avatar } from '../components/Avatar';
import { Logo } from '../components/Logo';

export function LoginPage() {
  const { login } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    api
      .users()
      .then(setUsers)
      .catch((e) => setError(e.message));
  }, []);

  const signIn = async (u: User) => {
    setPending(u.id);
    setError(null);
    try {
      await login(u.email);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
      setPending(null);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <Logo size={40} />
        <h1>Sign in to Folio</h1>
        <p className="muted">
          Choose a demo account. Authentication is mocked for this prototype, so there are no passwords. Use the avatar
          menu to switch accounts and try sharing.
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="login-users">
          {users === null && !error && <div className="muted">Loading accounts…</div>}
          {users?.map((u) => (
            <button key={u.id} className="login-user" onClick={() => signIn(u)} disabled={pending !== null}>
              <Avatar user={u} size={36} />
              <span className="login-user-text">
                <strong>{u.name}</strong>
                <span className="muted small">{u.email}</span>
              </span>
              <ArrowRight size={18} className="login-arrow" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
