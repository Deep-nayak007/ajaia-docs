# AI workflow note

## How I worked

I built this with **Kiro**, an agentic IDE running a Claude model. I gave it the full assignment brief and had it work end to end: plan the scope, write the code, run the checks, and report back. I then handled the parts that need my accounts: creating the GitHub repo, deploying on Render, and confirming the live URL. I treated the AI as a fast implementer whose work has to be proven by running it. "The code looks right" wasn't enough.

**Tools used:**
- **Kiro:** scaffolding, implementation, tests, debugging, and docs.
- **Playwright:** a headless browser, driven from Kiro, that signs in three users at once and uses the real UI.
- **GitHub CLI and GitHub Actions:** creating the repo and running CI on every push.
- **Render:** hosting, set up from the `render.yaml` blueprint.

## Where AI sped things up

- **Setup and wiring.** Getting Express, Vite, React, TipTap, Vitest, the TypeScript configs, CI and the Render/Docker files working together took minutes, not a couple of hours.
- **Current library details.** TipTap 3 now includes Underline and Link in StarterKit, and needs `useEditorState` for toolbar state. Express 5 changed its route syntax. Node now has built-in SQLite. These are details I'd otherwise have looked up one by one.
- **Test coverage I'd have cut for time.** The API tests cover every sharing case: owner, editor, viewer, revoked, and never shared. They also check that hidden documents return 404 rather than 403, and that bad uploads fail cleanly.
- **Repeatable multi-user testing.** Sharing, live updates and save conflicts need two or three people at once, which is slow to check by hand. The Playwright script does it in about a minute. I reran it after every fix and again against the live site.

## What I changed or rejected from the AI's first attempt

Running the app caught every one of these. None were found by reading the code.

- **Saves when nobody had typed.** The first version saved on every editor update event. In the three-user test, the viewer's tab tried to save and got a 403, and an editor got a false "someone else changed this" conflict. Now a save only happens when the content actually changed, and never while applying someone else's edit.
- **Lost keystrokes after renaming.** Pressing Enter in the title moved focus to the editor one frame late, so the first few typed characters disappeared. Now focus moves immediately.
- **A broken production build.** The compiled server looked for the frontend in the wrong folder (`dist/dist/client`), so the deployed site would have returned 404s. A quick check against `npm start` caught it before deploying.
- **Cookies that broke local runs.** I rejected the first approach, which marked cookies Secure whenever the app ran in production mode. That breaks login when running the production build over plain HTTP on localhost. Cookies are now Secure only when the request came over HTTPS, which is the case on Render.
- **A conflict warning you couldn't see.** In the screenshots, the conflict banner had scrolled off-screen, leaving only a small red "Conflict" label at the top. The banners now stay pinned under the header.
- **A wrong diagnosis, corrected.** In one test run, imported text landed at the top of the document. Instead of adding a workaround to the app, I traced the editor's transactions. The cause was the test clicking before the browser had registered the new cursor position, so it was a test timing issue, not an app bug. I fixed the test and added a check that imported content lands where the cursor is.
- **Rejected: real-time co-editing.** Character-by-character collaboration, using a CRDT library such as Yjs, was too big for the timebox. I chose versioned saves plus a check every 5 seconds for other people's changes. The server refuses a save based on an outdated version, so nobody's work is silently overwritten.

## How I verified correctness, UX, and reliability

- **API tests (`npm test`, 10 tests).** They cover login, the document lifecycle, cleaning unsafe HTML, input validation, refusing outdated saves, every sharing role, and importing `.md`, `.txt` and `.docx`, including bad files.
- **Strict TypeScript** on both server and client (`npm run typecheck`).
- **CI on GitHub Actions** runs type checks, tests and the production build on Linux for every push.
- **Browser test (`npm run e2e`)** against the production build, and then against the live Render URL. It covers:
  - create, rename and format a document, and reload to confirm it was saved
  - sharing, including an unknown email
  - a viewer can't edit
  - edits from one user appear for the others
  - resolving a save conflict
  - uploading a file, rejecting an unsupported type, and importing at the cursor
  - removing someone's access while they have the document open
- **UX review** of the generated screenshots at desktop and phone (390 px) widths. This led to the mobile header layout fix and the pinned warning banners.
- **Live check after deploying.** I confirmed the health check, login over HTTPS and the seeded data, then ran the browser test against the live site. Afterwards I deleted the test documents so reviewers start from the seeded data.
