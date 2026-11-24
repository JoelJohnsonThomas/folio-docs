# Submission: Folio collaborative document editor

**Live product:** **https://folio-docs-1lau.onrender.com** (hosted on Render's free tier, so the first load can take up to a minute while the service wakes up)
**Walkthrough video:** see `VIDEO_URL.txt`

## Test accounts (no password, pick one on the sign-in screen)

| Account | Use it to… |
| --- | --- |
| `alice@folio.test` | Owner of "Q3 Launch Plan" (shared with Bob as editor) |
| `bob@folio.test` | Owner of "Team Onboarding Checklist" (shared with Alice as viewer) |
| `carol@folio.test` | Check that unshared documents are inaccessible |

Switch accounts instantly from the avatar menu (top right).

## What's included

| Item | Location |
| --- | --- |
| Source code | `server/` (API), `web/` (React app), `tests/` |
| Setup and run instructions | `README.md` |
| Architecture note | `ARCHITECTURE.md` |
| AI workflow note | `AI_WORKFLOW.md` |
| This file | `SUBMISSION.md` |
| Walkthrough video URL | `VIDEO_URL.txt` |
| Screenshots of the main flows | `docs/screenshots/` |
| Automated tests | `tests/api.test.ts` (run with `npm test`) |
| Container build and deploy config | `Dockerfile`, `render.yaml` |

## Status

**Working end to end**
- Create / rename / edit / delete / reopen documents with rich text (bold, italic, underline, strike, code, H1–H3, bulleted and numbered lists, quotes, dividers)
- Autosave with visible status and retry, ⌘/Ctrl+S, unsaved-changes guard
- Conflict detection (HTTP 409) with "load theirs" or "keep mine"
- Live refresh of other people's saves while you're idle
- File upload: `.txt`, `.md`, `.docx` (≤ 5 MB) → new document, or inserted into the current document
- Sharing by email with **Can edit** / **Can view**, role changes, revoke, leave; "My documents" vs "Shared with me"
- Server-enforced permissions (404 for no access, 403 for insufficient role)
- SQLite persistence; export to Markdown, HTML, or PDF (print)

**Incomplete or intentionally out of scope**
- Real-time co-editing and live cursors (concurrent edits are detected and resolved, not merged)
- Real authentication (seeded accounts, mocked sign-in)
- Images and tables in documents (stripped on import; table text is kept)
- The demo host has no persistent disk, so the demo database re-seeds when the host restarts

**Next 2–4 hours**
1. Real-time co-editing with Yjs + Hocuspocus, with presence avatars
2. Version history with restore
3. Postgres for durable hosting; real auth (magic link / OAuth)
4. Front-end tests for the autosave hook and share dialog
