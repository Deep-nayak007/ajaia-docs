import type { DB } from './db.js';
import { hashPassword } from './auth.js';
import { createDocument, shareDocument } from './documents.js';

export const DEMO_PASSWORD = 'demo1234';

export const SEED_USERS = [
  { email: 'alice@ajaia.test', name: 'Alice Chen' },
  { email: 'bob@ajaia.test', name: 'Bob Patel' },
  { email: 'carol@ajaia.test', name: 'Carol Diaz' },
];

const WELCOME_HTML = `
<h1>Q3 Planning Notes</h1>
<p>This document is owned by <strong>Alice</strong> and shared with <em>Bob</em> as an <u>editor</u> and Carol as a viewer.</p>
<h2>Goals</h2>
<ul><li>Ship the editor MVP</li><li>Collect feedback from two pilot teams</li></ul>
<h2>Next steps</h2>
<ol><li>Sign in as Bob and make an edit</li><li>Sign in as Carol and confirm it is read-only</li></ol>
`.trim();

/** Seeds demo users and one shared document on an empty database. Idempotent. */
export function seed(db: DB): void {
  const count = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  if (count > 0) return;

  const insert = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)');
  const ids = SEED_USERS.map((u) => Number(insert.run(u.email, u.name, hashPassword(DEMO_PASSWORD)).lastInsertRowid));

  const doc = createDocument(db, ids[0], 'Q3 Planning Notes', WELCOME_HTML);
  shareDocument(db, ids[0], doc.id, SEED_USERS[1].email, 'editor');
  shareDocument(db, ids[0], doc.id, SEED_USERS[2].email, 'viewer');
  createDocument(db, ids[1], "Bob's private draft", '<p>Only Bob can see this until he shares it.</p>');
}
