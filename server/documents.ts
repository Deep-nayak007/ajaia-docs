import crypto from 'node:crypto';
import type { DB } from './db.js';
import { HttpError } from './errors.js';

export type Role = 'owner' | 'editor' | 'viewer';
export type ShareRole = Exclude<Role, 'owner'>;

export interface DocumentSummary {
  id: string;
  title: string;
  role: Role;
  owner: { id: number; name: string; email: string };
  updatedAt: number;
}

export interface DocumentFull extends DocumentSummary {
  contentHtml: string;
  version: number;
  createdAt: number;
  updatedBy: { id: number; name: string } | null;
}

interface DocRow {
  id: string;
  title: string;
  content_html: string;
  version: number;
  created_at: number;
  updated_at: number;
  owner_id: number;
  owner_name: string;
  owner_email: string;
  updated_by: number | null;
  updated_by_name: string | null;
  role: Role;
}

const SELECT_DOC = `
  SELECT d.id, d.title, d.content_html, d.version, d.created_at, d.updated_at,
         d.owner_id, o.name AS owner_name, o.email AS owner_email,
         d.updated_by, ub.name AS updated_by_name,
         CASE WHEN d.owner_id = :userId THEN 'owner' ELSE s.role END AS role
    FROM documents d
    JOIN users o ON o.id = d.owner_id
    LEFT JOIN users ub ON ub.id = d.updated_by
    LEFT JOIN document_shares s ON s.document_id = d.id AND s.user_id = :userId
`;

function toSummary(row: DocRow): DocumentSummary {
  return {
    id: row.id,
    title: row.title,
    role: row.role,
    owner: { id: row.owner_id, name: row.owner_name, email: row.owner_email },
    updatedAt: row.updated_at,
  };
}

function toFull(row: DocRow): DocumentFull {
  return {
    ...toSummary(row),
    contentHtml: row.content_html,
    version: row.version,
    createdAt: row.created_at,
    updatedBy: row.updated_by ? { id: row.updated_by, name: row.updated_by_name ?? 'Unknown' } : null,
  };
}

export function listDocuments(db: DB, userId: number): { owned: DocumentSummary[]; shared: DocumentSummary[] } {
  const rows = db
    .prepare(
      `${SELECT_DOC}
        WHERE d.owner_id = :userId OR s.user_id IS NOT NULL
        ORDER BY d.updated_at DESC`,
    )
    .all({ userId }) as unknown as DocRow[];
  const docs = rows.map(toSummary);
  return {
    owned: docs.filter((d) => d.role === 'owner'),
    shared: docs.filter((d) => d.role !== 'owner'),
  };
}

/**
 * Loads a document the user can access. Documents the user cannot see return
 * 404 rather than 403 so we don't reveal which document ids exist.
 */
export function getDocument(db: DB, userId: number, docId: string): DocumentFull {
  const row = db.prepare(`${SELECT_DOC} WHERE d.id = :docId`).get({ userId, docId }) as DocRow | undefined;
  if (!row || !row.role) throw new HttpError(404, 'Document not found');
  return toFull(row);
}

export function assertCanEdit(doc: DocumentFull): void {
  if (doc.role === 'viewer') throw new HttpError(403, 'You have view-only access to this document');
}

export function assertOwner(doc: DocumentFull): void {
  if (doc.role !== 'owner') throw new HttpError(403, 'Only the owner can do that');
}

export function createDocument(db: DB, userId: number, title: string, contentHtml: string): DocumentFull {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO documents (id, owner_id, title, content_html, version, created_at, updated_at, updated_by)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
  ).run(id, userId, title, contentHtml, now, now, userId);
  return getDocument(db, userId, id);
}

export function updateDocument(
  db: DB,
  userId: number,
  docId: string,
  changes: { title?: string; contentHtml?: string; baseVersion?: number },
): DocumentFull {
  const doc = getDocument(db, userId, docId);
  assertCanEdit(doc);

  // Optimistic concurrency: if the client says which version it edited and
  // someone else saved in the meantime, refuse instead of silently overwriting.
  if (changes.baseVersion !== undefined && changes.baseVersion !== doc.version) {
    throw new HttpError(409, 'This document was changed by someone else', { current: doc });
  }

  const result = db
    .prepare(
      `UPDATE documents
          SET title = COALESCE(:title, title),
              content_html = COALESCE(:content, content_html),
              version = version + 1,
              updated_at = :now,
              updated_by = :userId
        WHERE id = :docId AND version = :version`,
    )
    .run({
      title: changes.title ?? null,
      content: changes.contentHtml ?? null,
      now: Date.now(),
      userId,
      docId,
      version: doc.version,
    });

  // Lost a race between the read above and this write.
  if (result.changes === 0) {
    throw new HttpError(409, 'This document was changed by someone else', { current: getDocument(db, userId, docId) });
  }
  return getDocument(db, userId, docId);
}

export function deleteDocument(db: DB, userId: number, docId: string): void {
  assertOwner(getDocument(db, userId, docId));
  db.prepare('DELETE FROM documents WHERE id = ?').run(docId);
}

export interface ShareEntry {
  userId: number;
  name: string;
  email: string;
  role: ShareRole;
}

export function listShares(db: DB, userId: number, docId: string): ShareEntry[] {
  getDocument(db, userId, docId); // access check
  return db
    .prepare(
      `SELECT u.id AS userId, u.name, u.email, s.role
         FROM document_shares s JOIN users u ON u.id = s.user_id
        WHERE s.document_id = ?
        ORDER BY u.name`,
    )
    .all(docId) as unknown as ShareEntry[];
}

/** Grants or updates access. Re-sharing with an existing user changes their role. */
export function shareDocument(db: DB, userId: number, docId: string, email: string, role: ShareRole): ShareEntry[] {
  const doc = getDocument(db, userId, docId);
  assertOwner(doc);
  const target = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim()) as { id: number } | undefined;
  if (!target) throw new HttpError(404, `No user found with email ${email}`);
  if (target.id === doc.owner.id) throw new HttpError(400, 'You already own this document');

  db.prepare(
    `INSERT INTO document_shares (document_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (document_id, user_id) DO UPDATE SET role = excluded.role`,
  ).run(docId, target.id, role, Date.now());
  return listShares(db, userId, docId);
}

export function unshareDocument(db: DB, userId: number, docId: string, targetUserId: number): ShareEntry[] {
  assertOwner(getDocument(db, userId, docId));
  db.prepare('DELETE FROM document_shares WHERE document_id = ? AND user_id = ?').run(docId, targetUserId);
  return listShares(db, userId, docId);
}
