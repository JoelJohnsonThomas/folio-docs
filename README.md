# Folio: a lightweight collaborative document editor

Folio is a small full-stack document editor. You can create and format documents in the browser, import files, share documents with other users as viewers or editors, and have everything persist across sessions.

**Live demo:** `<DEPLOYMENT_URL>` (free tier: the first load after a while may take about a minute to wake up). Pick a demo account on the sign-in screen. No password is needed.

| Demo account | Email | Seeded state |
| --- | --- | --- |
| Alice Chen | `alice@folio.test` | Owns "Q3 Launch Plan" (shared with Bob as editor); can view Bob's checklist |
| Bob Okafor | `bob@folio.test` | Owns "Team Onboarding Checklist" (shared with Alice as viewer); can edit Alice's plan |
| Carol Diaz | `carol@folio.test` | Nothing shared with her, so you can use her to check access is denied |

Switch accounts from the avatar menu (top right). It takes one click, so you can test a sharing flow in a single browser tab.

---

## What works

**Documents**
- Create, rename (click the title), edit, delete (owner only), and reopen.
- Rich text: bold, italic, underline, strikethrough, inline code, three heading levels, bulleted and numbered lists, quotes, dividers, clear formatting, and undo/redo. The usual keyboard shortcuts work (⌘/Ctrl+B/I/U, Markdown-style `# `, `- `, `1. `).
- **Autosave** about 0.8 s after you stop typing, with a visible status (Saved / Unsaved / Saving / Couldn't save + Retry / Conflict). ⌘/Ctrl+S saves immediately, and the browser warns you before closing a tab with unsaved changes. Failed saves retry automatically.
- **Conflict detection.** If two people edit the same document, the second save is rejected (HTTP 409) and the user chooses between *load theirs* and *keep mine*. Nothing is overwritten silently.
- **Live refresh.** While you have no unsaved edits, the open document picks up other people's saves within about 8 s, and a notice says who changed it.

**File upload** (supported: **`.txt`, `.md` / `.markdown`, `.docx`**, up to **5 MB**)
- *Import as a new document* from the documents page, using the button or by dropping a file anywhere on the page. The file name becomes the title.
- *Insert from file* in the editor toolbar converts the file and inserts its content at the cursor.
- Markdown keeps headings, emphasis, lists, quotes and code. `.docx` keeps headings, bold/italic/underline and lists (via mammoth). Images and tables are dropped, though table text is kept. Other file types get a clear error message.

**Sharing**
- Every document has one **owner**. The owner shares by email as **Can edit** or **Can view**, can change a role, and can revoke access.
- Collaborators can see who has access and can remove themselves.
- The documents page separates **My documents** from **Shared with me** (with the owner and your role on each).
- Viewers get a read-only editor with no toolbar. The server enforces roles on every request, not just the UI.
- Users without access get a 404, so the app doesn't reveal that the document exists.

**Export (stretch):** Markdown, HTML, or Print / Save as PDF.

## What's intentionally not included

- **Real-time co-editing** (CRDT/OT, live cursors). This is the biggest cut. Optimistic concurrency plus a periodic refresh covers "two people work on the same doc" safely without the complexity. Next step: Yjs + Hocuspocus over WebSockets.
- **Real authentication.** Accounts are seeded and you sign in by picking one. Sessions are real (server-side records, httpOnly cookie), so adding passwords or SSO would only change the login route.
- Comments, version history, images, tables, link-sharing, and sharing with people who don't have an account.

---

## Run locally

Requires **Node.js 22.18 or newer** (Node 24 recommended). The server uses Node's built-in `node:sqlite` and native TypeScript type-stripping, so there's no native module to compile and no build step for the server.

```bash
npm install
npm run dev          # API on :3001 + Vite dev server on :5173 (proxying /api)
```

Open http://localhost:5173. The SQLite database is created at `./data/folio.db` and seeded with the demo accounts and documents on first start. Delete the `data/` folder to reset.

Production-style run (one process serving the API and the built SPA):

```bash
npm run build
npm start            # http://localhost:3001
```

| Command | What it does |
| --- | --- |
| `npm test` | API integration tests (Node's built-in test runner, real HTTP against an in-memory DB) |
| `npm run typecheck` | TypeScript checks for server and web |
| `npm run build` | Builds the React app into `dist/` |

Environment variables: `PORT` (default `3001`) and `DATABASE_PATH` (default `./data/folio.db`).

### Docker

```bash
docker build -t folio .
docker run -p 7860:7860 -v folio-data:/data folio     # http://localhost:7860
```

The image runs typecheck and tests during the build, so a failing test fails the build.

## Deployment

The app is one stateless Node process plus a SQLite file, packaged as a Docker image, so any Docker host works. The demo runs on **Render's free tier** using the included Blueprint (`render.yaml`):

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, pick the repo, then **Apply**. Render builds the Dockerfile (which runs typecheck and tests) and serves it over HTTPS.

> **Free-tier caveats:** the service sleeps after about 15 minutes idle, so **the first request can take up to a minute**. There's also no persistent disk, so the demo database resets and re-seeds on each restart or redeploy. Within a session, everything persists normally. For production, mount a disk at `/data` or move to Postgres (see the architecture note).

## Tests

`tests/api.test.ts` covers the parts that would hurt most if they broke:

- **Access control lifecycle:** no access → viewer → editor → revoked. It checks 404s for non-collaborators, 403s for viewers trying to edit, share, or delete, and owner-only sharing.
- **Persistence:** formatting round-trips unchanged through save and reopen.
- **Sanitization:** scripts, event handlers and `javascript:` URLs are stripped on write.
- **Optimistic concurrency:** stale saves get a 409 with details; forced saves succeed.
- **Import:** `.md`, `.txt`, `.docx` (real fixture) conversion, plus rejection of unsupported, corrupt, missing and oversized (>5 MB) files.
- **Validation:** bad titles, empty updates, and a missing `baseVersion` all return 400 with a message.

The full user flow (two browsers, sharing, view-only, live refresh, offline save → conflict → resolve, import) was also exercised in headless Chrome. Screenshots are in [`docs/screenshots/`](docs/screenshots).

## Project layout

```
server/            Express API (TypeScript, run directly by Node)
  app.ts           app factory (also used by tests)
  db.ts            schema + demo seed (node:sqlite)
  access.ts        the single authorization check for documents
  auth.ts          mocked login + cookie sessions
  importFile.ts    .txt/.md/.docx → sanitized HTML
  sanitize.ts      HTML allowlist shared by saves and imports
  routes/          auth, users, documents, shares, convert
web/src/           React + TipTap SPA
  pages/           Login, Documents, Editor
  useAutosave.ts   debounced save queue + conflict handling
tests/             API integration tests + .docx fixture
docs/              screenshots
```

Further reading: [ARCHITECTURE.md](ARCHITECTURE.md) · [AI_WORKFLOW.md](AI_WORKFLOW.md) · [SUBMISSION.md](SUBMISSION.md)
