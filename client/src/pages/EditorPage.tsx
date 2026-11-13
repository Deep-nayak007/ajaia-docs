import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { api, formatTime, SUPPORTED_UPLOADS, type DocumentFull } from '../api';
import { Header } from '../components/Header';
import { Toolbar } from '../components/Toolbar';
import { ShareDialog } from '../components/ShareDialog';
import { useDocumentSync, type SaveStatus } from '../useDocumentSync';

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<DocumentFull | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setDoc(null);
    setError('');
    api
      .getDocument(id!)
      .then(setDoc)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error)
    return (
      <>
        <Header />
        <main className="page">
          <p className="error" role="alert">{error}</p>
          <Link to="/">← Back to documents</Link>
        </main>
      </>
    );
  if (!doc)
    return (
      <>
        <Header />
        <p className="center muted">Loading document…</p>
      </>
    );
  return <DocumentEditor key={doc.id} initial={doc} />;
}

const STATUS_LABEL: Record<SaveStatus, string> = {
  saved: 'All changes saved',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Not saved',
  conflict: 'Conflict',
};

function DocumentEditor({ initial }: { initial: DocumentFull }) {
  const navigate = useNavigate();
  const location = useLocation();
  const editorRef = useRef<Editor | null>(null);
  const lastHtml = useRef<string | null>(null);
  const applyingRemote = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(initial.title);
  const [sharing, setSharing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState('');

  const applyRemote = useCallback((remote: DocumentFull) => {
    setTitle(remote.title);
    const ed = editorRef.current;
    if (ed && ed.getHTML() !== remote.contentHtml) {
      const { from, to } = ed.state.selection;
      // Plugins (e.g. trailing node) may append follow-up transactions that
      // still fire onUpdate; the flag stops those from echoing back as saves.
      applyingRemote.current = true;
      try {
        ed.commands.setContent(remote.contentHtml, { emitUpdate: false });
      } finally {
        applyingRemote.current = false;
      }
      lastHtml.current = ed.getHTML();
      const max = ed.state.doc.content.size;
      ed.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) });
      if (remote.updatedBy) setNotice(`Updated by ${remote.updatedBy.name}`);
    }
  }, []);

  const sync = useDocumentSync(initial, applyRemote);
  const { doc, status, queue, flush } = sync;
  const canEdit = doc.role !== 'viewer' && !sync.lostAccess;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, protocols: ['mailto'] },
      }),
    ],
    content: initial.contentHtml,
    editable: canEdit,
    autofocus: location.state?.focusTitle ? false : 'start',
    onCreate: ({ editor: ed }) => {
      lastHtml.current = ed.getHTML();
    },
    onUpdate: ({ editor: ed }) => {
      // Only real content changes by someone allowed to edit become saves;
      // TipTap also emits updates for selection-free internal transactions.
      const html = ed.getHTML();
      if (applyingRemote.current || !ed.isEditable || html === lastHtml.current) return;
      lastHtml.current = html;
      queue({ contentHtml: html });
    },
  });
  editorRef.current = editor;

  useEffect(() => {
    editor?.setEditable(canEdit, false); // false: don't emit an update event
  }, [editor, canEdit]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  // Cmd/Ctrl+S saves immediately instead of opening the browser dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void flush();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flush]);

  function commitTitle() {
    const next = title.trim();
    if (!next) {
      setTitle(doc.title);
      return;
    }
    if (next !== doc.title) queue({ title: next }, true);
    setTitle(next);
  }

  async function importIntoDoc(file: File | undefined) {
    if (!file || !editor) return;
    setImporting(true);
    try {
      const { contentHtml } = await api.convertFile(file);
      editor.chain().focus().insertContent(contentHtml).run();
      setNotice(`Inserted content from ${file.name}`);
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function remove() {
    if (!window.confirm(`Delete “${doc.title}”? This cannot be undone.`)) return;
    try {
      await api.deleteDocument(doc.id);
      navigate('/');
    } catch (e) {
      window.alert((e as Error).message);
    }
  }

  const words = useEditorState({
    editor,
    selector: ({ editor: ed }) => ed?.getText().trim().split(/\s+/).filter(Boolean).length ?? 0,
  });

  return (
    <>
      <Header>
        <input
          className="title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              // Focus synchronously (commands.focus() defers a frame, dropping fast keystrokes).
              // Moving focus blurs the input, which commits the title.
              if (editor && canEdit) editor.view.focus();
              else e.currentTarget.blur();
            }
            if (e.key === 'Escape') {
              setTitle(doc.title);
              e.currentTarget.blur();
            }
          }}
          readOnly={!canEdit}
          maxLength={200}
          aria-label="Document title"
          autoFocus={!!location.state?.focusTitle}
          onFocus={(e) => location.state?.focusTitle && e.currentTarget.select()}
        />
        <span className={`save-status ${status}`} aria-live="polite">
          {canEdit ? STATUS_LABEL[status] : 'View only'}
        </span>
      </Header>

      <div className="doc-meta-bar">
        <Link to="/" className="btn ghost">
          ← Documents
        </Link>
        <span className="muted small">
          {doc.role === 'owner' ? 'You own this document' : `Owned by ${doc.owner.name}`}
          {doc.role === 'editor' && ' · You can edit'}
          {doc.role === 'viewer' && ' · You can view'}
          {' · '}Last edited {formatTime(doc.updatedAt)}
          {doc.updatedBy && ` by ${doc.updatedBy.name}`}
        </span>
        <span className="spacer" />
        {doc.role === 'owner' && (
          <>
            <button className="btn ghost danger" onClick={() => void remove()}>
              Delete
            </button>
            <button className="btn primary" onClick={() => setSharing(true)}>
              Share
            </button>
          </>
        )}
      </div>

      {/* Banners and toolbar stay pinned under the header so alerts are visible while scrolled. */}
      <div className="editor-chrome">
      {sync.conflict && (
        <div className="banner warn" role="alert">
          {sync.conflict.updatedBy?.name ?? 'Someone'} saved a newer version while you were editing.
          <button className="btn" onClick={() => sync.resolveConflict('theirs')}>
            Load their version
          </button>
          <button className="btn" onClick={() => sync.resolveConflict('mine')}>
            Keep mine (overwrite)
          </button>
        </div>
      )}
      {status === 'error' && sync.error && (
        <div className="banner error" role="alert">
          {sync.error}
          {!sync.lostAccess && (
            <button className="btn" onClick={() => void flush()}>
              Retry now
            </button>
          )}
        </div>
      )}
      {sync.lostAccess && status !== 'error' && <div className="banner error">{sync.error}</div>}
      {canEdit && editor && (
        <Toolbar editor={editor} importing={importing} onImport={() => fileInput.current?.click()} />
      )}
      </div>
      {notice && <div className="toast">{notice}</div>}
      <input
        ref={fileInput}
        type="file"
        accept={SUPPORTED_UPLOADS}
        hidden
        onChange={(e) => void importIntoDoc(e.target.files?.[0])}
      />

      <main className="paper-wrap" onClick={() => canEdit && editor?.commands.focus()}>
        <div className="paper" onClick={(e) => e.stopPropagation()}>
          <EditorContent editor={editor} />
        </div>
        <div className="word-count muted small">{words} words</div>
      </main>

      {sharing && <ShareDialog docId={doc.id} title={doc.title} onClose={() => setSharing(false)} />}
    </>
  );
}
