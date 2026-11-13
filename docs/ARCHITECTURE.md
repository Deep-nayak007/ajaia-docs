# Architecture note

## Shape of the system

```
Browser (React + TipTap) ──fetch /api──▶ Express ──▶ SQLite (node:sqlite)
         ▲                                  │
         └──────── static build ◀───────────┘   (one service, one URL)
```

- **Frontend:** React 19, React Router, and TipTap 3 (ProseMirror) as the editor. Vite builds it.
- **Backend:** Express 5 in TypeScript. Zod validates request bodies. Multer handles uploads in memory with a 2 MB limit. Mammoth converts `.docx` files and `marked` converts Markdown.
- **Storage:** SQLite through Node's built-in `node:sqlite`. There are four tables: `users`, `sessions`, `documents` and `document_shares`. Foreign keys cascade, so deleting a document removes its shares.

## What I prioritized and why

1. **The editing loop has to be trustworthy.** A document editor that loses work isn't usable, so most of the frontend effort went into `useDocumentSync`:
   - Edits are debounced and queued, and only one save request is in flight at a time.
   - A failed save is merged back under newer edits and retried.
   - The browser warns before you close a tab with unsaved changes.
   - Every save carries the version it was based on. The server's `UPDATE ... WHERE version = ?` rejects stale writes with 409, so two editors can't silently overwrite each other. The UI then offers *Load their version* or *Keep mine*.
2. **Access control lives on the server, in one place.** One SQL query in `documents.ts` resolves the caller's role (`owner`, `editor` or `viewer`) for a document. Every route goes through `getDocument`, `assertCanEdit` or `assertOwner`. Documents you can't access return **404, not 403**, so document IDs can't be probed. The UI hides controls by role, but that is only for usability. The API is the actual check, and the tests cover it.
3. **Shared HTML is untrusted input.** Content is stored as HTML because TipTap, the `.docx` import and the Markdown import all produce it. Every write passes through a tag allow-list (`sanitize.ts`) that matches what the editor can produce. Without that, sharing a document with someone would be a stored-XSS risk.
4. **Uploads produce editable documents.** The product goal is to get existing content into the editor, so uploads are converted rather than stored as attachments. One conversion function backs both "new document from file" and "insert into this document".
5. **Reviewers can test it easily.** It deploys as a single service with no external database or paid dependency. Demo users are seeded, and the login page has one-click sign-in buttons.

## Deliberate scope cuts

| Cut | Why | What I'd do instead |
|---|---|---|
| Real-time co-editing (CRDT/OT) | A large problem on its own. Version checks plus polling cover "two people working on the same doc" safely. | Yjs plus TipTap's collaboration extension over WebSockets |
| Sign-up, password reset, OAuth | Not what's being evaluated. Seeded accounts show the sharing model. | An auth provider such as Auth0 or Clerk, or magic links |
| Sharing with people who don't have an account, link sharing | Needs invitations and email delivery | Pending invitations keyed by email |
| Images and attachments in documents | Needs blob storage and a sanitizer that allows `<img>` | S3-compatible storage with signed URLs |
| PDF/Markdown export, comments, version history | Optional stretch work. I chose viewer/editor roles because they deepen the sharing feature. | Version history first (a `document_versions` table written on each save) |
| Rate limiting, CSRF tokens | The `SameSite=Lax`, `HttpOnly` cookie and JSON-only API cover the demo's risk | `express-rate-limit` on login; CSRF tokens if forms are added |

## Notable trade-offs

- **SQLite instead of Postgres.** It needs no setup and is easy to run locally and to test (each test gets a fresh in-memory database). The cost is that data on Render's free tier is lost on restart. Moving to Postgres would only touch `db.ts` and the SQL in `documents.ts` and `auth.ts`.
- **HTML instead of ProseMirror JSON.** HTML works directly with the importers and is readable in the database. JSON would make schema-aware migrations easier. With an allow-list sanitizer in place, HTML is the simpler choice.
- **Polling instead of WebSockets.** Polling every 5 s, and only while there are no unsaved local edits, is stateless and works on any host. It is the wrong tool for keystroke-level collaboration, which is listed as the next step.
- **Server sessions instead of JWTs.** Sessions are random tokens in an `HttpOnly` cookie, stored in SQLite. Logout really revokes the session, and there is no signing key to manage.

## Next 2–4 hours

1. Version history: snapshot on save, list and restore. This builds on the existing `version` column.
2. Export to Markdown and PDF.
3. Invitations for emails that don't have an account yet, plus a "copy link" button for people who already have access.
4. Postgres on a managed free tier so the deployed demo keeps its data.
5. Move the Playwright walkthrough into CI.
