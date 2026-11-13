import { useState, type FormEvent } from 'react';
import { api, type User } from '../api';

const DEMO_USERS = [
  { email: 'alice@ajaia.test', name: 'Alice Chen' },
  { email: 'bob@ajaia.test', name: 'Bob Patel' },
  { email: 'carol@ajaia.test', name: 'Carol Diaz' },
];
const DEMO_PASSWORD = 'demo1234';

export function LoginPage({ onSignedIn }: { onSignedIn: (u: User) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn(e: string, p: string) {
    setBusy(true);
    setError('');
    try {
      const { user } = await api.login(e, p);
      onSignedIn(user);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    void signIn(email, password);
  }

  return (
    <div className="login">
      <form className="card login-card" onSubmit={onSubmit}>
        <h1 className="brand">Ajaia Docs</h1>
        <p className="muted">Sign in to create and share documents.</p>

        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="demo-users">
          <p className="muted small">
            Demo accounts (password <code>{DEMO_PASSWORD}</code>). To try sharing, sign in as a second user in a private window or another browser.
          </p>
          {DEMO_USERS.map((u) => (
            <button
              key={u.email}
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void signIn(u.email, DEMO_PASSWORD)}
            >
              Continue as {u.name}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
