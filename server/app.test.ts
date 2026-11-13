import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { openDb } from './db.js';
import { DEMO_PASSWORD, seed } from './seed.js';

type Agent = ReturnType<typeof request.agent>;

let app: ReturnType<typeof createApp>;

async function signIn(email: string): Promise<Agent> {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: DEMO_PASSWORD }).expect(200);
  return agent;
}

beforeEach(() => {
  const db = openDb(':memory:');
  seed(db);
  app = createApp(db);
});

describe('auth', () => {
  it('rejects bad credentials and unauthenticated requests', async () => {
    await request(app).post('/api/auth/login').send({ email: 'alice@ajaia.test', password: 'nope' }).expect(401);
    await request(app).get('/api/documents').expect(401);
  });
});

describe('documents', () => {
  it('creates, renames, edits and reopens a document with formatting preserved', async () => {
    const alice = await signIn('alice@ajaia.test');
    const created = await alice.post('/api/documents').send({}).expect(201);
    expect(created.body.title).toBe('Untitled document');
    expect(created.body.role).toBe('owner');

    const html = '<h2>Agenda</h2><p><strong>Bold</strong> <em>it</em> <u>u</u></p><ul><li><p>one</p></li></ul>';
    const saved = await alice
      .patch(`/api/documents/${created.body.id}`)
      .send({ title: 'Team sync', contentHtml: html, baseVersion: created.body.version })
      .expect(200);
    expect(saved.body.version).toBe(created.body.version + 1);

    const reopened = await alice.get(`/api/documents/${created.body.id}`).expect(200);
    expect(reopened.body.title).toBe('Team sync');
    expect(reopened.body.contentHtml).toBe(html);
  });

  it('strips unsafe HTML before storing it', async () => {
    const alice = await signIn('alice@ajaia.test');
    const res = await alice
      .post('/api/documents')
      .send({ title: 'x', contentHtml: '<p onclick="evil()">hi<script>alert(1)</script><a href="javascript:x">l</a></p>' })
      .expect(201);
    expect(res.body.contentHtml).toBe('<p>hi<a>l</a></p>');
  });

  it('validates input', async () => {
    const alice = await signIn('alice@ajaia.test');
    const res = await alice.post('/api/documents').send({ title: '   ' }).expect(400);
    expect(res.body.error).toMatch(/Title cannot be empty/);
    const { body } = await alice.post('/api/documents').send({}).expect(201);
    await alice.patch(`/api/documents/${body.id}`).send({}).expect(400);
  });

  it('rejects a stale save with 409 instead of overwriting newer content', async () => {
    const alice = await signIn('alice@ajaia.test');
    const bob = await signIn('bob@ajaia.test');
    const { body: list } = await bob.get('/api/documents').expect(200);
    const shared = list.shared[0];
    const { body: doc } = await bob.get(`/api/documents/${shared.id}`).expect(200);

    await alice.patch(`/api/documents/${doc.id}`).send({ contentHtml: '<p>alice</p>', baseVersion: doc.version }).expect(200);
    const stale = await bob
      .patch(`/api/documents/${doc.id}`)
      .send({ contentHtml: '<p>bob</p>', baseVersion: doc.version })
      .expect(409);
    expect(stale.body.current.contentHtml).toBe('<p>alice</p>');
  });
});

describe('sharing and access control', () => {
  it('separates owned and shared documents and enforces roles', async () => {
    const alice = await signIn('alice@ajaia.test');
    const bob = await signIn('bob@ajaia.test');
    const carol = await signIn('carol@ajaia.test');

    const { body: doc } = await alice.post('/api/documents').send({ title: 'Secret plan' }).expect(201);

    // Not shared yet: other users can't see it, and it doesn't leak via 403.
    await bob.get(`/api/documents/${doc.id}`).expect(404);
    expect((await bob.get('/api/documents')).body.shared.map((d: { id: string }) => d.id)).not.toContain(doc.id);

    // Only the owner can share.
    await bob.post(`/api/documents/${doc.id}/shares`).send({ email: 'bob@ajaia.test' }).expect(404);
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'bob@ajaia.test', role: 'editor' }).expect(200);
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'carol@ajaia.test', role: 'viewer' }).expect(200);
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'nobody@ajaia.test' }).expect(404);

    // Shared docs show up under "shared" with the right role.
    const bobList = await bob.get('/api/documents').expect(200);
    const bobEntry = bobList.body.shared.find((d: { id: string }) => d.id === doc.id);
    expect(bobEntry).toMatchObject({ role: 'editor', owner: { email: 'alice@ajaia.test' } });
    expect(bobList.body.owned.map((d: { id: string }) => d.id)).not.toContain(doc.id);

    // Editor can edit; viewer can read but not edit; neither can share or delete.
    await bob.patch(`/api/documents/${doc.id}`).send({ contentHtml: '<p>bob was here</p>' }).expect(200);
    expect((await carol.get(`/api/documents/${doc.id}`).expect(200)).body.contentHtml).toBe('<p>bob was here</p>');
    await carol.patch(`/api/documents/${doc.id}`).send({ contentHtml: '<p>nope</p>' }).expect(403);
    await bob.post(`/api/documents/${doc.id}/shares`).send({ email: 'carol@ajaia.test', role: 'editor' }).expect(403);
    await bob.delete(`/api/documents/${doc.id}`).expect(403);

    // Revoking access removes it.
    const carolId = (await alice.get(`/api/documents/${doc.id}/shares`)).body.shares.find(
      (s: { email: string }) => s.email === 'carol@ajaia.test',
    ).userId;
    await alice.delete(`/api/documents/${doc.id}/shares/${carolId}`).expect(200);
    await carol.get(`/api/documents/${doc.id}`).expect(404);
  });
});

describe('file import', () => {
  it('turns a markdown upload into a new formatted document', async () => {
    const alice = await signIn('alice@ajaia.test');
    const md = '# Launch plan\n\nSome **bold** text.\n\n- first\n- second\n';
    const res = await alice
      .post('/api/documents/import')
      .attach('file', Buffer.from(md), 'launch-plan.md')
      .expect(201);
    expect(res.body.title).toBe('launch-plan');
    expect(res.body.contentHtml).toContain('<h1>Launch plan</h1>');
    expect(res.body.contentHtml).toContain('<strong>bold</strong>');
    expect(res.body.contentHtml).toContain('<li>first</li>');
  });

  it('turns a .docx upload into a new document', async () => {
    const alice = await signIn('alice@ajaia.test');
    const docx = fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'sample.docx'));
    const res = await alice.post('/api/documents/import').attach('file', docx, 'Quarterly Review.docx').expect(201);
    expect(res.body.title).toBe('Quarterly Review');
    expect(res.body.contentHtml).toContain('Revenue grew <strong>12%</strong> this quarter.');
  });

  it('converts plain text paragraphs and escapes markup', async () => {
    const alice = await signIn('alice@ajaia.test');
    const res = await alice
      .post('/api/convert')
      .attach('file', Buffer.from('Hello <b>world</b>\nline two\n\nSecond para'), 'notes.txt')
      .expect(200);
    expect(res.body.contentHtml).toBe('<p>Hello &lt;b&gt;world&lt;/b&gt;<br />line two</p><p>Second para</p>');
  });

  it('rejects unsupported and empty files with a clear message', async () => {
    const alice = await signIn('alice@ajaia.test');
    const bad = await alice.post('/api/documents/import').attach('file', Buffer.from('x'), 'photo.png').expect(415);
    expect(bad.body.error).toMatch(/Supported: .txt/);
    await alice.post('/api/documents/import').attach('file', Buffer.from('  \n '), 'empty.txt').expect(400);
    await alice.post('/api/documents/import').attach('file', Buffer.from('not a zip'), 'broken.docx').expect(400);
  });
});
