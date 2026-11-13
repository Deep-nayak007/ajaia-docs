# Submission: Ajaia Docs

## Links

- **Live product:** _TODO: paste deployed URL_
- **Walkthrough video:** see `VIDEO_URL.txt`
- **Google Drive folder:** _TODO: paste folder link_

## Test accounts

Password for all accounts: `demo1234`. The login screen also has one-click buttons.

- `alice@ajaia.test`: owner of "Q3 Planning Notes"
- `bob@ajaia.test`: editor on that document
- `carol@ajaia.test`: viewer on that document

Use a private window for the second user.

## What's included

| Item | Location |
|---|---|
| Source code | `server/`, `client/`, `e2e/`, config files at the root |
| Setup and run instructions | `README.md` |
| Architecture note | `docs/ARCHITECTURE.md` |
| AI workflow note | `docs/AI_WORKFLOW.md` |
| Automated tests | `server/app.test.ts` (`npm test`, 10 API tests); `e2e/smoke.mjs` (`npm run e2e`, browser walkthrough) |
| Screenshots | `docs/screenshots/` (login, document list, editor, share dialog, shared-with-me, conflict, mobile) |
| Deployment config | `render.yaml` (Render Blueprint), `Dockerfile` |
| Walkthrough video URL | `VIDEO_URL.txt` |

## Status

**Working end to end:**

- Login with seeded users.
- Create, rename, edit and delete documents, with autosave.
- Rich text: bold, italic, underline, strikethrough, H1–H3, bulleted and numbered lists, quotes, links.
- Upload of `.txt`, `.md` and `.docx`, either as a new document or inserted into an open one.
- Sharing with viewer or editor roles, changing roles, and revoking access.
- Separate "My documents" and "Shared with me" lists.
- Other users' edits appear within about 5 s.
- Conflict detection on concurrent saves.
- SQLite persistence.

**Limitations (intentional):**

- Real-time keystroke-level co-editing is not built. Changes sync every 5 s, and concurrent saves are detected and resolved by the user.
- There is no sign-up or password reset.
- You can only share with existing accounts.
- On Render's free tier the database resets when the instance restarts. Seeded data is restored on boot.

**Next with 2–4 more hours:** version history, Markdown/PDF export, invitations by email, and hosted Postgres. Details are in `docs/ARCHITECTURE.md`.
