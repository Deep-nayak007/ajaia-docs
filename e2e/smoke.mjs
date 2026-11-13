// End-to-end browser walkthrough of the main flows (three users, real UI).
// Needs a running server on a FRESH database (it expects only seeded data):
//   rm -rf data && npm run build && npm start      # in one terminal
//   npx playwright install chromium && npm run e2e # in another
// Also regenerates docs/screenshots/*.png.
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3001';
const SHOTS = new URL('../docs/screenshots', import.meta.url).pathname;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ajaia-e2e-'));
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const errors = [];
async function newUser(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name} console: ${m.text()}`));
  await page.goto(BASE);
  await page.getByRole('button', { name: new RegExp(`Continue as ${name}`) }).click();
  await page.getByText('My documents').waitFor();
  return page;
}
const step = (s) => console.log('✓', s);
const saved = async (page) => {
  try {
    await page.getByText('All changes saved').waitFor({ timeout: 8000 });
  } catch (e) {
    await page.screenshot({ path: `${TMP}/fail.png` });
    console.log('status:', await page.locator('.save-status').textContent(), '| banners:', await page.locator('.banner').allTextContents());
    console.log(errors.join('\n'));
    throw e;
  }
};

// Login screen
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const p = await ctx.newPage();
  await p.goto(BASE);
  await p.screenshot({ path: `${SHOTS}/01-login.png` });
  await p.fill('input[type=email]', 'alice@ajaia.test');
  await p.fill('input[type=password]', 'wrong');
  await p.getByRole('button', { name: 'Sign in' }).click();
  await p.getByText('Invalid email or password').waitFor();
  step('bad login shows error');
  await ctx.close();
}

const alice = await newUser('Alice');
await alice.getByText('Q3 Planning Notes').waitFor();
await alice.screenshot({ path: `${SHOTS}/02-document-list.png` });
step('alice sees her document list');

// Create + rename + format
await alice.getByRole('button', { name: '+ New document' }).click();
const titleInput = alice.getByLabel('Document title');
await titleInput.waitFor();
await alice.keyboard.type('Launch checklist');
await alice.keyboard.press('Enter');
await alice.keyboard.type('Owner notes');
await alice.getByLabel('Text style').selectOption('h2');
await alice.keyboard.press('End');
await alice.keyboard.press('Enter');
await alice.keyboard.type('This is ');
await alice.keyboard.press('ControlOrMeta+b');
await alice.keyboard.type('bold');
await alice.keyboard.press('ControlOrMeta+b');
await alice.keyboard.type(' and ');
await alice.keyboard.press('ControlOrMeta+i');
await alice.keyboard.type('italic');
await alice.keyboard.press('ControlOrMeta+i');
await alice.keyboard.type(' and ');
await alice.keyboard.press('ControlOrMeta+u');
await alice.keyboard.type('underlined');
await alice.keyboard.press('ControlOrMeta+u');
await alice.keyboard.press('Enter');
await alice.getByRole('button', { name: 'Bulleted list' }).click();
await alice.keyboard.type('First item');
await alice.keyboard.press('Enter');
await alice.keyboard.type('Second item');
await alice.keyboard.press('Enter');
await alice.keyboard.press('Enter');
await alice.getByRole('button', { name: 'Numbered list' }).click();
await alice.keyboard.type('Step one');
await saved(alice);
await alice.evaluate(() => window.scrollTo(0, 0));
await alice.screenshot({ path: `${SHOTS}/03-editor.png` });
const docUrl = alice.url();
const before = await alice.locator('.tiptap').innerHTML();
await alice.reload();
try {
  await alice.locator('.tiptap h2', { hasText: 'Owner notes' }).waitFor({ timeout: 5000 });
} catch (e) {
  console.log('BEFORE reload:', before);
  console.log('AFTER reload:', await alice.locator('.tiptap').innerHTML().catch(() => '(none)'));
  console.log('title:', await alice.getByLabel('Document title').inputValue().catch(() => '(none)'));
  throw e;
}
const html = await alice.locator('.tiptap').innerHTML();
for (const frag of ['<strong>bold</strong>', '<em>italic</em>', '<u>underlined</u>', '<ul>', '<ol>']) {
  if (!html.includes(frag)) throw new Error(`missing ${frag} after reload: ${html}`);
}
if ((await titleInput.inputValue()) !== 'Launch checklist') throw new Error('title not persisted');
step('create, rename, format, autosave and reload preserve content');

// Share with Carol (viewer) and Bob (editor)
await alice.getByRole('button', { name: 'Share' }).click();
await alice.fill('.share-form input', 'nobody@ajaia.test');
await alice.locator('.share-form button').click();
await alice.getByText('No user found with email').waitFor();
await alice.fill('.share-form input', 'carol@ajaia.test');
await alice.locator('.share-form select').selectOption('viewer');
await alice.locator('.share-form button').click();
await alice.locator('.share-list').getByText('Carol Diaz').waitFor();
await alice.fill('.share-form input', 'bob@ajaia.test');
await alice.locator('.share-form select').selectOption('editor');
await alice.locator('.share-form button').click();
await alice.locator('.share-list').getByText('Bob Patel').waitFor();
await alice.screenshot({ path: `${SHOTS}/04-share-dialog.png` });
await alice.getByRole('button', { name: 'Done' }).click();
step('share dialog: unknown email rejected, viewer + editor granted');

// Carol: view-only
const carol = await newUser('Carol');
const row = carol.locator('.doc-row', { hasText: 'Launch checklist' });
await row.getByText('View only').waitFor();
await carol.screenshot({ path: `${SHOTS}/05-shared-with-me.png` });
await row.click();
await carol.locator('.tiptap', { hasText: 'Owner notes' }).waitFor();
if ((await carol.locator('.tiptap').getAttribute('contenteditable')) !== 'false') throw new Error('viewer can edit');
if (await carol.locator('.editor-toolbar').count()) throw new Error('viewer sees toolbar');
if (await carol.getByRole('button', { name: 'Share' }).count()) throw new Error('viewer sees share');
step('carol sees doc under Shared with me, read-only, no toolbar/share');

// Bob edits, Alice and Carol see it via polling
const bob = await newUser('Bob');
await bob.locator('.doc-row', { hasText: 'Launch checklist' }).getByText('Can edit').waitFor();
await bob.goto(docUrl);
await bob.locator('.tiptap').waitFor();
await bob.locator('.tiptap ol li').last().click(); await bob.waitForTimeout(150);
await bob.keyboard.press('End');
await bob.keyboard.type(' (added by Bob)');
await saved(bob);
await alice.locator('.tiptap', { hasText: 'added by Bob' }).waitFor({ timeout: 8000 });
await carol.locator('.tiptap', { hasText: 'added by Bob' }).waitFor({ timeout: 8000 });
step("bob's edit appears for alice and carol without reload");

// Conflict: Bob saves, Alice types before her next poll picks it up
await alice.waitForTimeout(5200); // let Alice's poll tick pass
await bob.keyboard.type(' v2');
await saved(bob);
await alice.locator('.tiptap h2').click(); await alice.waitForTimeout(150);
await alice.keyboard.press('End');
await alice.keyboard.type('!');
const banner = alice.getByText('saved a newer version while you were editing');
await banner.waitFor({ timeout: 8000 });
await alice.screenshot({ path: `${SHOTS}/06-conflict.png` });
await alice.getByRole('button', { name: 'Keep mine (overwrite)' }).click();
await saved(alice);
step('conflicting save shows banner; overwrite resolves it');

// Upload a markdown file as a new document
await alice.goto(BASE);
fs.writeFileSync(`${TMP}/meeting-notes.md`, '# Meeting notes\n\n**Decision:** ship Friday.\n\n1. QA pass\n2. Deploy\n');
await alice.locator('input[type=file]').setInputFiles(`${TMP}/meeting-notes.md`);
await alice.locator('.tiptap h1', { hasText: 'Meeting notes' }).waitFor();
if ((await alice.getByLabel('Document title').inputValue()) !== 'meeting-notes') throw new Error('bad import title');
step('markdown upload becomes a new formatted document');

// Unsupported upload is rejected with a message
await alice.goto(BASE);
fs.writeFileSync(`${TMP}/pic.png`, 'x');
await alice.locator('input[type=file]').setInputFiles(`${TMP}/pic.png`);
await alice.getByText('Unsupported file type').waitFor();
step('unsupported upload shows error');

// Import into an existing doc at the cursor
await alice.goto(docUrl);
await alice.locator('.tiptap').waitFor();
fs.writeFileSync(`${TMP}/appendix.txt`, 'Appendix from a text file');
await alice.locator('.tiptap ol li').last().click(); await alice.waitForTimeout(150);
await alice.keyboard.press('End');
await alice.keyboard.press('Enter');
await alice.keyboard.press('Enter');
await alice.locator('input[type=file]').setInputFiles(`${TMP}/appendix.txt`);
await alice.locator('.tiptap', { hasText: 'Appendix from a text file' }).waitFor();
const appendixHtml = await alice.locator('.tiptap').innerHTML();
if (appendixHtml.indexOf('Appendix') < appendixHtml.indexOf('Step one')) throw new Error('import landed before the cursor position: ' + appendixHtml);
await saved(alice);
step('import file into an existing document');

// Revoke Carol: her open tab notices
await alice.getByRole('button', { name: 'Share' }).click();
await alice.locator('.share-list li', { hasText: 'Carol' }).getByRole('button', { name: 'Remove' }).click();
await alice.getByText('Carol Diaz').waitFor({ state: 'detached' });
await alice.getByRole('button', { name: 'Done' }).click();
await carol.getByText('your access was removed').waitFor({ timeout: 8000 });
step('revoked viewer is told access was removed');

// Mobile layout smoke
await alice.setViewportSize({ width: 390, height: 800 });
await alice.evaluate(() => window.scrollTo(0, 0));
await alice.screenshot({ path: `${SHOTS}/07-mobile.png` });

console.log(errors.length ? `\nPage errors:\n${errors.join('\n')}` : '\nNo page errors');
await browser.close();
