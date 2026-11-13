import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type DocumentFull } from './api';

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error' | 'conflict';

type Changes = { title?: string; contentHtml?: string };

const AUTOSAVE_DELAY_MS = 800;
const RETRY_DELAY_MS = 4000;
const POLL_INTERVAL_MS = 5000;

/**
 * Owns the save pipeline for one open document:
 *  - edits are queued and debounced, and only one PATCH is in flight at a time
 *  - every PATCH carries the version it was based on, so the server can
 *    reject it (409) if someone else saved first, instead of silently overwriting
 *  - while there are no local edits, it polls for other people's changes
 */
export function useDocumentSync(initial: DocumentFull, onRemoteChange: (doc: DocumentFull) => void) {
  const [doc, setDoc] = useState(initial);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<DocumentFull | null>(null);
  const [lostAccess, setLostAccess] = useState(false);

  const version = useRef(initial.version);
  const pending = useRef<Changes | null>(null);
  const saving = useRef(false);
  const blocked = useRef(false); // true while a conflict is unresolved
  const timer = useRef<number | undefined>(undefined);
  const remoteCb = useRef(onRemoteChange);
  remoteCb.current = onRemoteChange;

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (saving.current || blocked.current || !pending.current) return;

    const changes = pending.current;
    pending.current = null;
    saving.current = true;
    setStatus('saving');
    try {
      const saved = await api.updateDocument(initial.id, { ...changes, baseVersion: version.current });
      version.current = saved.version;
      setDoc(saved);
      setError('');
      setStatus(pending.current ? 'unsaved' : 'saved');
    } catch (e) {
      // Put the failed changes back underneath anything typed since.
      // (TS narrows pending.current to null above, but it can change while awaiting.)
      pending.current = { ...changes, ...(pending.current as Changes | null) };
      const err = e as ApiError;
      if (err.status === 409 && err.body.current) {
        blocked.current = true;
        setConflict(err.body.current as DocumentFull);
        setStatus('conflict');
      } else if (err.status === 403 || err.status === 404) {
        blocked.current = true;
        setLostAccess(true);
        setError(err.message);
        setStatus('error');
      } else {
        setError(err.message);
        setStatus('error');
        timer.current = window.setTimeout(() => void flush(), RETRY_DELAY_MS);
      }
    } finally {
      saving.current = false;
    }
    if (pending.current && !blocked.current) timer.current = window.setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  }, [initial.id]);

  const queue = useCallback(
    (changes: Changes, immediate = false) => {
      pending.current = { ...pending.current, ...changes };
      if (blocked.current) return;
      setStatus('unsaved');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), immediate ? 0 : AUTOSAVE_DELAY_MS);
    },
    [flush],
  );

  /** "theirs" discards local edits and loads the latest; "mine" overwrites it. */
  const resolveConflict = useCallback(
    (choice: 'theirs' | 'mine') => {
      if (!conflict) return;
      version.current = conflict.version;
      blocked.current = false;
      setConflict(null);
      if (choice === 'theirs') {
        pending.current = null;
        setDoc(conflict);
        remoteCb.current(conflict);
        setStatus('saved');
      } else {
        void flush();
      }
    },
    [conflict, flush],
  );

  // Poll for changes made by other users while we have nothing unsaved.
  useEffect(() => {
    const id = window.setInterval(async () => {
      if (document.hidden || saving.current || pending.current || blocked.current) return;
      try {
        const latest = await api.getDocument(initial.id);
        if (saving.current || pending.current || blocked.current) return;
        if (latest.version !== version.current || latest.role !== doc.role) {
          version.current = latest.version;
          setDoc(latest);
          remoteCb.current(latest);
        }
      } catch (e) {
        const err = e as ApiError;
        if (err.status === 404) {
          blocked.current = true;
          setLostAccess(true);
          setError('This document was deleted or your access was removed.');
        }
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [initial.id, doc.role]);

  // Warn before closing the tab with unsaved work; try to save on unmount.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current || saving.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.clearTimeout(timer.current);
      if (pending.current && !blocked.current) {
        void api
          .updateDocument(initial.id, { ...pending.current, baseVersion: version.current })
          .catch(() => undefined);
      }
    };
  }, [initial.id]);

  return { doc, status, error, conflict, lostAccess, queue, flush, resolveConflict };
}
