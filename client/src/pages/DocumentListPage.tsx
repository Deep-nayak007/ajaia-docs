import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatTime, SUPPORTED_UPLOADS, SUPPORTED_UPLOADS_LABEL, type DocumentSummary } from '../api';
import { Header } from '../components/Header';

export function DocumentListPage() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<{ owned: DocumentSummary[]; shared: DocumentSummary[] } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'create' | 'upload'>('');

  useEffect(() => {
    api
      .listDocuments()
      .then(setDocs)
      .catch((e) => setError(e.message));
  }, []);

  async function create() {
    setBusy('create');
    setError('');
    try {
      const doc = await api.createDocument();
      navigate(`/d/${doc.id}`, { state: { focusTitle: true } });
    } catch (e) {
      setError((e as Error).message);
      setBusy('');
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy('upload');
    setError('');
    try {
      const doc = await api.importDocument(file);
      navigate(`/d/${doc.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy('');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <>
      <Header />
      <main className="page">
        <div className="toolbar-row">
          <button className="btn primary" onClick={() => void create()} disabled={!!busy}>
            {busy === 'create' ? 'Creating…' : '+ New document'}
          </button>
          <button className="btn" onClick={() => fileInput.current?.click()} disabled={!!busy}>
            {busy === 'upload' ? 'Importing…' : 'Upload file'}
          </button>
          <span className="muted small">Import {SUPPORTED_UPLOADS_LABEL} as a new document</span>
          <input
            ref={fileInput}
            type="file"
            accept={SUPPORTED_UPLOADS}
            hidden
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </div>

        {error && <p className="error" role="alert">{error}</p>}
        {!docs && !error && <p className="muted">Loading documents…</p>}

        {docs && (
          <>
            <DocSection
              title="My documents"
              docs={docs.owned}
              empty="You have no documents yet. Create one or upload a file to get started."
            />
            <DocSection title="Shared with me" docs={docs.shared} empty="Nothing has been shared with you yet." />
          </>
        )}
      </main>
    </>
  );
}

function DocSection({ title, docs, empty }: { title: string; docs: DocumentSummary[]; empty: string }) {
  return (
    <section className="doc-section">
      <h2>
        {title} <span className="count">{docs.length}</span>
      </h2>
      {docs.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul className="doc-list">
          {docs.map((d) => (
            <li key={d.id}>
              <Link to={`/d/${d.id}`} className="doc-row">
                <span className="doc-icon" aria-hidden>
                  ▤
                </span>
                <span className="doc-title">{d.title}</span>
                {d.role === 'owner' ? (
                  <span className="badge owner">Owner</span>
                ) : (
                  <>
                    <span className="muted small hide-sm">from {d.owner.name}</span>
                    <span className={`badge ${d.role}`}>{d.role === 'editor' ? 'Can edit' : 'View only'}</span>
                  </>
                )}
                <span className="muted small doc-time">{formatTime(d.updatedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
