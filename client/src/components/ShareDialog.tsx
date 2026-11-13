import { useEffect, useState, type FormEvent } from 'react';
import { api, type ShareEntry } from '../api';

export function ShareDialog({ docId, title, onClose }: { docId: string; title: string; onClose: () => void }) {
  const [shares, setShares] = useState<ShareEntry[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .listShares(docId)
      .then((r) => setShares(r.shares))
      .catch((e) => setError(e.message));
  }, [docId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function run(action: () => Promise<{ shares: ShareEntry[] }>) {
    setBusy(true);
    setError('');
    try {
      setShares((await action()).shares);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (await run(() => api.share(docId, email, role))) setEmail('');
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <h2 id="share-title">Share “{title}”</h2>
        <form className="share-form" onSubmit={onSubmit}>
          <input
            type="email"
            placeholder="Email, e.g. bob@ajaia.test"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <select value={role} onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')} aria-label="Access level">
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
          <button className="btn primary" disabled={busy}>
            Share
          </button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}

        <h3>People with access</h3>
        {!shares ? (
          <p className="muted">Loading…</p>
        ) : shares.length === 0 ? (
          <p className="muted">Only you can see this document.</p>
        ) : (
          <ul className="share-list">
            {shares.map((s) => (
              <li key={s.userId}>
                <span className="avatar">{s.name[0]}</span>
                <span className="share-who">
                  {s.name}
                  <span className="muted small">{s.email}</span>
                </span>
                <select
                  value={s.role}
                  disabled={busy}
                  aria-label={`Access for ${s.name}`}
                  onChange={(e) => void run(() => api.share(docId, s.email, e.target.value as 'editor' | 'viewer'))}
                >
                  <option value="editor">Can edit</option>
                  <option value="viewer">Can view</option>
                </select>
                <button className="btn ghost" disabled={busy} onClick={() => void run(() => api.unshare(docId, s.userId))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
