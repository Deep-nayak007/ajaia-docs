# Submission: Ajaia Docs

A lightweight collaborative document editor. Users can create and format documents, import files, share them with editor or viewer access, and see each other's changes without reloading.

## Links

| | |
|---|---|
| **Live product** | https://ajaia-docs-qwbs.onrender.com |
| **Source code** | https://github.com/Deep-nayak007/ajaia-docs |
| **Walkthrough video** | _PASTE VIDEO LINK_ |
| **Google Drive folder** | _PASTE DRIVE LINK_ |

The live app runs on Render's free tier. The first load after a quiet period can take about 30 seconds while the server wakes up.

## Test accounts

All accounts use the password **`demo1234`**. The login screen also has one-click "Continue as…" buttons.

| User | Email | Seeded access |
|---|---|---|
| Alice Chen | `alice@ajaia.test` | Owns "Q3 Planning Notes" |
| Bob Patel | `bob@ajaia.test` | Can edit "Q3 Planning Notes"; owns "Bob's private draft" |
| Carol Diaz | `carol@ajaia.test` | Can view "Q3 Planning Notes" |

**To review sharing:** sign in as the second user in a private/incognito window or a different browser. Sessions are per browser.

**Suggested review path (about 3 minutes):**
1. As Alice, create a document, rename it, format some text, and refresh. The content and formatting are still there.
2. Upload a `.txt`, `.md` or `.docx` file. It becomes a new editable document.
3. Share the document with `carol@ajaia.test` as **Can view** and `bob@ajaia.test` as **Can edit**.
4. As Carol, the document is under "Shared with me", marked "View only", and can't be edited.
5. As Bob, edit it. Alice sees the change within about 5 seconds without refreshing.

## What's included

| Item | Location |
|---|---|
| Source code | `server/` (API), `client/` (React app), `e2e/` (browser test), config files at the root |
| Setup and run instructions | `README.md` |
| Architecture note | `docs/ARCHITECTURE.md` |
| AI workflow note | `docs/AI_WORKFLOW.md` |
| Automated tests | `server/app.test.ts` (`npm test`, 10 API tests); `e2e/smoke.mjs` (`npm run e2e`, browser test with three users) |
| CI | `.github/workflows/ci.yml` runs type checks, tests and the build on every push |
| Screenshots | `docs/screenshots/` (login, document list, editor, share dialog, shared with me, conflict, mobile) |
| Deployment config | `render.yaml` (Render Blueprint), `Dockerfile` |
| Walkthrough video URL | `VIDEO_URL.txt` |

## Run locally

Requires Node.js 22.13 or newer (Node 24 recommended).

```bash
npm install
npm run dev      # open http://localhost:5173
npm test         # 10 API tests
```

For a production build, run `npm run build && npm start` and open http://localhost:3001. Data is stored in `data/app.db`, which is created and seeded on first start. Delete the `data/` folder to reset.

## Status

### Working end to end
- **Documents:** create, rename, edit, delete (owner only), and reopen. Autosaves about 0.8 s after typing stops; ⌘/Ctrl+S saves immediately. The browser warns before you close a tab with unsaved changes.
- **Formatting:** bold, italic, underline, strikethrough, Heading 1–3, bulleted and numbered lists, quotes, links, undo/redo.
- **File upload:** `.txt`, `.md` and `.docx` up to 2 MB, as a new document or inserted at the cursor in an open one. Unsupported files get a clear error. The limits are shown in the UI.
- **Sharing:** the owner shares by email as *Can edit* or *Can view*, and can change or remove access. "My documents" and "Shared with me" are separate lists with role badges. Viewers get a read-only editor.
- **Multiple editors:** other people's saves appear within about 5 seconds. If two people save at the same time, the second save is refused and that user chooses **Load their version** or **Keep mine**, so nobody's work is silently overwritten. A user whose access is removed is told so.
- **Persistence:** SQLite, with formatting stored as sanitized HTML.

### Intentionally not built
- Real-time, character-by-character co-editing. It would need a CRDT library (such as Yjs) and WebSockets.
- Sign-up, password reset, and sharing with people who don't have an account yet.
- Images and attachments inside documents.

### Known limitation
- On Render's free tier the database resets when the server restarts or redeploys. The demo users and sample documents are re-created automatically, so the review flow always works. The fix is a persistent disk or hosted Postgres.

### Next, with 2–4 more hours
1. Version history (each save already increments a version number).
2. Export to Markdown and PDF.
3. Email invitations for people without an account.
4. Hosted Postgres so the live demo keeps its data.

## Architecture summary

**Stack:** React 19 + TipTap 3 (rich-text editor) → Express 5 API (TypeScript) → SQLite. It deploys as one Node service, with Express also serving the built frontend.

**Key decisions:**
- **Safe saving.** Every save sends the version it was based on. The server refuses an outdated save (HTTP 409) instead of overwriting newer work.
- **Server-side permissions in one place.** A single query works out whether the user is owner, editor or viewer, and every API route checks it. Documents you can't access return 404 rather than 403, so their IDs can't be probed.
- **Shared content is untrusted.** Every save passes through an HTML allow-list, so a shared document can't carry scripts to the people it's shared with.
- **Uploads become editable documents.** Files are converted rather than stored as attachments, because the user's goal is to work on the content.
- **Easy to review.** One URL, no paid services, seeded accounts, and one-click login.

**Trade-offs:**
- **SQLite instead of Postgres:** no setup, and each test gets a fresh in-memory database.
- **HTML instead of the editor's JSON format:** the importers already produce HTML.
- **Checking every 5 s instead of WebSockets:** simple and works on any host.
- **Server sessions instead of JWTs:** logout really revokes the session.

Full detail is in `docs/ARCHITECTURE.md`.

## AI workflow summary

- **Tools:** Kiro (an agentic IDE using a Claude model) for implementation, tests and debugging. Playwright for browser testing. GitHub Actions for CI. Render for hosting.
- **Where AI sped things up:** project setup and wiring, current library details (TipTap 3, Express 5, Node's built-in SQLite), broad permission tests, and a repeatable test with three users at once.
- **What I changed or rejected:** running the app caught several problems in the first version:
  - the editor saved even when nobody had typed, which caused false conflicts
  - pressing Enter after renaming dropped the next keystrokes
  - the production build served 404s because it looked for the frontend in the wrong folder
  - one cookie setting broke local runs over HTTP
  - the conflict warning could scroll off-screen

  I also rejected real-time co-editing as too large for the timebox.
- **How I verified:** 10 API tests, strict TypeScript, CI on every push, a three-user browser test against both the local production build and the live site, and a review of the screenshots at desktop and phone widths.

Full detail is in `docs/AI_WORKFLOW.md`.
