# AI workflow note

> **Before submitting:** this note describes the build session with Kiro. Edit it so it reflects your own usage, including any review, prompting or other tools you used.

## Tools

- **Kiro** (agentic IDE, Claude model). It scaffolded the project, wrote most of the first-pass code, and ran the tests, builds and browser checks from the terminal.
- **Playwright** (driven by the agent) for headless browser checks of the real UI with three simultaneous users.

## Where AI sped things up

- **Scaffolding and wiring.** Express, Vite, TipTap, Vitest, the TypeScript configs and the deploy files took minutes instead of an hour or more.
- **Library details.** It handled TipTap 3 specifics such as `useEditorState` for toolbar state and StarterKit now bundling Underline and Link. It also covered Express 5 route syntax and `node:sqlite` usage.
- **Test breadth.** It wrote the full permission matrix, including the 404-not-403 cases, revocation, and import failure modes, which I would otherwise have trimmed.
- **Browser walkthrough.** It drove three browser sessions in parallel to check sharing, live updates and conflicts. That would be slow to repeat by hand after every change.

## What was changed or rejected

Each item below was caught by running the app, not by reading the code.

- **Spurious saves from the editor.** The first version saved on every TipTap `onUpdate`. In the three-user run, the viewer's tab produced a 403 and an editor got a false conflict, both from saves when nobody had typed. I changed it so a save only happens when the HTML actually changed and the update didn't come from applying someone else's edit. The editable flag is also toggled without emitting an update.
- **Dropped keystrokes after renaming.** Pressing Enter in the title called `editor.commands.focus()`, which waits a frame before focusing. Text typed straight after was lost. The fix focuses the editor view synchronously.
- **Frontend path in the compiled server.** It resolved `dist/` relative to the compiled file, giving `dist/dist/client`, so the deployed build would have served 404s. Found with a curl smoke test against `npm start`. The server now looks for the project root instead.
- **Cookies over local HTTP.** I rejected "Secure cookies whenever `NODE_ENV=production`" because it breaks `npm start` over plain HTTP. Cookies are now Secure exactly when the request arrived over HTTPS, using `trust proxy` behind Render.
- **Conflict banner placement.** The banner scrolled off-screen, so a user deep in a document only saw a small red "Conflict" label. I spotted this in a screenshot. The banners now stick to the top with the toolbar.
- **Rejected: real-time co-editing with a CRDT.** Too large for the timebox. Versioned saves plus polling give safe, understandable behavior instead.
- **Misdiagnosis caught.** One import landed at the top of the document in a headless run. I traced ProseMirror transactions and found the cause was the test clicking before the browser's `selectionchange` was processed, not an app bug. I fixed the test and added an assertion that imported content lands at the cursor, rather than adding a workaround in the app.

## How correctness was verified

- `npm test`: 10 API tests covering auth, document lifecycle, sanitization, validation, the stale-write 409, the full role matrix, and `.md`/`.txt`/`.docx` import and rejection.
- `npm run typecheck` with strict TypeScript on both server and client.
- `npm run e2e`: a Playwright walkthrough against the production build (`npm start`) with Alice, Bob and Carol at the same time. It covers:
  - create, rename, all formatting, and reload to confirm persistence
  - sharing, including an unknown email
  - viewer is read-only
  - live updates between users
  - conflict resolution
  - upload, rejecting a bad file type, and import at the cursor
  - revoked access
- **UX review** of the generated screenshots on desktop and a 390 px phone width. This led to the header layout fix on mobile and the sticky banners.
