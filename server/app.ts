import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { z } from 'zod';
import type { DB } from './db.js';
import {
  SESSION_COOKIE,
  createSession,
  currentUser,
  deleteSession,
  requireAuth,
  userForToken,
  verifyPassword,
} from './auth.js';
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  listShares,
  shareDocument,
  unshareDocument,
  updateDocument,
} from './documents.js';
import { HttpError, errorHandler } from './errors.js';
import { MAX_UPLOAD_BYTES, SUPPORTED_EXTENSIONS, convertToHtml, isSupported, titleFromFilename } from './importFile.js';
import { sanitizeDocumentHtml } from './sanitize.js';

const MAX_HTML_CHARS = 1_000_000;

const title = z.string().trim().min(1, 'Title cannot be empty').max(200, 'Title is too long');
const html = z.string().max(MAX_HTML_CHARS, 'Document is too large');

const loginBody = z.object({ email: z.string().trim().email(), password: z.string().min(1) });
const createBody = z.object({ title: title.optional(), contentHtml: html.optional() });
const updateBody = z
  .object({ title: title.optional(), contentHtml: html.optional(), baseVersion: z.number().int().positive().optional() })
  .refine((b) => b.title !== undefined || b.contentHtml !== undefined, { message: 'Nothing to update' });
const shareBody = z.object({ email: z.string().trim().email(), role: z.enum(['viewer', 'editor']).default('editor') });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (isSupported(file.originalname)) return cb(null, true);
    cb(new HttpError(415, `Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`));
  },
});

function uploadedFile(req: express.Request): Express.Multer.File {
  if (!req.file) throw new HttpError(400, 'Attach a file in the "file" field');
  return req.file;
}

export function createApp(db: DB, opts: { staticDir?: string; trustProxy?: boolean } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Hosts like Render terminate TLS at a proxy; trust its X-Forwarded-Proto.
  if (opts.trustProxy) app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  const auth = requireAuth(db);
  const api = express.Router();

  api.get('/health', (_req, res) => res.json({ ok: true }));

  // --- Auth ---------------------------------------------------------------
  api.post('/auth/login', (req, res) => {
    const { email, password } = loginBody.parse(req.body);
    const row = db.prepare('SELECT id, email, name, password_hash FROM users WHERE email = ?').get(email) as
      | { id: number; email: string; name: string; password_hash: string }
      | undefined;
    if (!row || !verifyPassword(password, row.password_hash)) throw new HttpError(401, 'Invalid email or password');

    const { token, expiresAt } = createSession(db, row.id);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      // Secure when served over HTTPS (behind a proxy this needs `trust proxy`),
      // so plain http://localhost still works in every browser.
      secure: req.secure,
      expires: new Date(expiresAt),
    });
    res.json({ user: { id: row.id, email: row.email, name: row.name } });
  });

  api.post('/auth/logout', (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) deleteSession(db, token);
    res.clearCookie(SESSION_COOKIE);
    res.status(204).end();
  });

  api.get('/auth/me', (req, res) => {
    res.json({ user: userForToken(db, req.cookies?.[SESSION_COOKIE]) });
  });

  // --- Documents ----------------------------------------------------------
  api.get('/documents', auth, (_req, res) => {
    res.json(listDocuments(db, currentUser(res).id));
  });

  api.post('/documents', auth, (req, res) => {
    const body = createBody.parse(req.body ?? {});
    const doc = createDocument(
      db,
      currentUser(res).id,
      body.title ?? 'Untitled document',
      sanitizeDocumentHtml(body.contentHtml ?? ''),
    );
    res.status(201).json(doc);
  });

  // Upload a file and turn it into a new document.
  api.post('/documents/import', auth, upload.single('file'), async (req, res) => {
    const file = uploadedFile(req);
    const contentHtml = await convertToHtml(file.originalname, file.buffer);
    const doc = createDocument(db, currentUser(res).id, titleFromFilename(file.originalname), contentHtml);
    res.status(201).json(doc);
  });

  // Convert a file to HTML without creating a document (used to insert into an open draft).
  api.post('/convert', auth, upload.single('file'), async (req, res) => {
    const file = uploadedFile(req);
    res.json({ contentHtml: await convertToHtml(file.originalname, file.buffer) });
  });

  api.get('/documents/:id', auth, (req, res) => {
    res.json(getDocument(db, currentUser(res).id, req.params.id as string));
  });

  api.patch('/documents/:id', auth, (req, res) => {
    const body = updateBody.parse(req.body);
    const doc = updateDocument(db, currentUser(res).id, req.params.id as string, {
      title: body.title,
      contentHtml: body.contentHtml === undefined ? undefined : sanitizeDocumentHtml(body.contentHtml),
      baseVersion: body.baseVersion,
    });
    res.json(doc);
  });

  api.delete('/documents/:id', auth, (req, res) => {
    deleteDocument(db, currentUser(res).id, req.params.id as string);
    res.status(204).end();
  });

  // --- Sharing ------------------------------------------------------------
  api.get('/documents/:id/shares', auth, (req, res) => {
    res.json({ shares: listShares(db, currentUser(res).id, req.params.id as string) });
  });

  api.post('/documents/:id/shares', auth, (req, res) => {
    const { email, role } = shareBody.parse(req.body);
    res.json({ shares: shareDocument(db, currentUser(res).id, req.params.id as string, email, role) });
  });

  api.delete('/documents/:id/shares/:userId', auth, (req, res) => {
    const targetId = z.coerce.number().int().positive().parse(req.params.userId);
    res.json({ shares: unshareDocument(db, currentUser(res).id, req.params.id as string, targetId) });
  });

  api.use((_req, _res, next) => next(new HttpError(404, 'Not found')));

  app.use('/api', api);

  // --- Frontend (production build) ----------------------------------------
  if (opts.staticDir && fs.existsSync(opts.staticDir)) {
    const indexHtml = path.join(opts.staticDir, 'index.html');
    app.use(express.static(opts.staticDir, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => res.sendFile(indexHtml));
  }

  app.use(errorHandler);
  return app;
}
