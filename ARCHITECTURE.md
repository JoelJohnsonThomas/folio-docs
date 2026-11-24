# Architecture note

## Shape of the system

```
Browser (React + TipTap)  ──fetch /api──▶  Express (Node 24, TypeScript)  ──▶  SQLite (node:sqlite)
        ▲                                         │
        └──────── static SPA served by the same process in production
```

It runs as a single process from a single origin. That means no CORS and no separate frontend host, and the whole app ships as one Docker image. For a 4–6 hour timebox, I wanted the fewest moving parts that still look like a real product: a real HTTP API, a real database, and server-enforced permissions.

## What I prioritized, and why

I put most of the depth into three areas a reviewer will exercise first, where a shallow version would be obvious:

1. **The editing loop has to feel trustworthy.** A document editor that loses work is worse than no editor. So the focus went to autosave rather than to more toolbar buttons:
   - Saves are debounced, with at most one request in flight. Edits made during a save trigger exactly one follow-up save with the latest content (`web/src/useAutosave.ts`).
   - The save status is always visible, failures retry automatically, ⌘S saves immediately, and the browser warns before you close a tab with unsaved changes.
   - **Optimistic concurrency.** Each document has a `version`. A save sends the `baseVersion` it started from, and the server runs `UPDATE … WHERE version = ?`. If someone else saved first, the user gets a 409 and an explicit choice. That's the minimum for "collaborative" to be safe without real-time sync.
2. **Access control has one source of truth.** Every document route goes through `authorizeDoc(db, docId, userId, requiredRole)` in `server/access.ts`, which returns the doc and the caller's effective role (`owner > editor > viewer`) or throws. A user with no access gets a 404 (existence isn't revealed). A user with too little access gets a 403. The UI hides controls for viewers, but the server never relies on that. The integration tests walk the full grant → upgrade → revoke lifecycle.
3. **File import should be useful.** Uploads turn into editable documents (or are inserted at the cursor) rather than sitting as inert attachments. `.docx` uses mammoth, `.md` uses marked, and `.txt` splits on paragraphs. All three go through the same sanitizer.

## Key decisions

| Decision | Why | Trade-off |
| --- | --- | --- |
| **TipTap (ProseMirror)** editor | Mature schema-based editor. The schema drops unknown markup on load, which gives a second layer of sanitization. Toolbar state comes from `useEditorState`, so the toolbar re-renders only when formatting at the cursor changes. | About 140 KB gzipped, so it's lazy-loaded only on the editor route. |
| **Store content as sanitized HTML** | Imports (mammoth/marked) already produce HTML, the editor reads and writes HTML losslessly for the supported features, and it's easy to export or inspect. | ProseMirror JSON would be better for structural diffing or CRDTs later, and switching is mechanical. |
| **Sanitize on the server on every write** (`sanitize-html` allowlist matching the editor's features) | The server is the trust boundary, because a client can send anything to `PATCH`. | Unsupported formatting (colors, tables) is dropped on purpose. |
| **SQLite via built-in `node:sqlite`** | Zero native dependencies (no `better-sqlite3` compile step), real SQL, transactions and foreign keys. The schema ports to Postgres almost unchanged. | Single writer. That's fine at this scale; Postgres is the step for multi-instance hosting. |
| **Node's native TypeScript type-stripping** for the server | No build step or `tsx` for the API. Tests run with `node --test`. | Requires Node ≥ 22.18 and erasable-only TS syntax (enforced by `erasableSyntaxOnly`). |
| **Mocked auth with real sessions** | The prompt allows simulated users. Picking from seeded accounts with one-click switching makes testing the sharing flow fast. Sessions are still opaque server-side tokens in httpOnly, SameSite=Lax cookies. | Anyone can sign in as any demo user, which is intended for a demo. |
| **Roles: owner / editor / viewer** (a stretch item) | Costs little once authorization is centralized, and makes "visible distinction" meaningful. | No link-sharing or groups. |
| **Polling instead of WebSockets** for remote changes | Pulls in others' saves when you're idle, using no extra infrastructure. | Up to about 8 s of latency, and it doesn't merge concurrent edits (the 409 flow handles that). |
| **Last-write-wins for titles** | Renames are small and atomic. Versioning them would cause spurious content conflicts. | Two simultaneous renames: the last one wins. |

## Data model

```
users(id, email UNIQUE NOCASE, name, color)
sessions(token PK, user_id → users, expires_at)
documents(id, owner_id → users, title, content HTML, version, created_at, updated_at, updated_by)
document_shares(document_id → documents, user_id → users, role CHECK IN ('viewer','editor'), PK(document_id, user_id))
```

Ownership is a column, not a share row, so a document always has exactly one owner and the owner can't be "unshared." Deleting a document cascades to its shares.

## API

| Method & path | Min. role | Notes |
| --- | --- | --- |
| `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me` | none | mocked login by email |
| `GET /api/documents` | signed in | `{ owned, shared }` with role, owner, snippet |
| `POST /api/documents` | signed in | create |
| `POST /api/documents/import` | signed in | multipart `file` → new doc (415 / 422 / 413 on bad input) |
| `GET /api/documents/:id` | viewer | |
| `PATCH /api/documents/:id` | editor | `{ title?, content?, baseVersion \| force }` → 409 on stale version |
| `DELETE /api/documents/:id` | owner | |
| `GET /api/documents/:id/shares` | viewer | who has access |
| `POST /api/documents/:id/shares` | owner | upsert `{ email, role }` |
| `DELETE /api/documents/:id/shares/:userId` | owner (or self) | revoke / leave |
| `POST /api/convert` | signed in | file → `{ title, html }` for "Insert from file" |

Errors always come back as `{ error: { code, message, ...details } }`, so the UI can show the server's message directly.

## What I'd build next (another 2–4 hours)

1. **Real-time co-editing:** Yjs + Hocuspocus, persisting Yjs updates alongside an HTML snapshot, plus presence avatars and cursors. The 409 flow would become a fallback.
2. **Version history:** a `document_versions` table written on save (throttled), a restore action, and diffs between versions.
3. **Durable hosting:** Postgres (Neon/Supabase free tier) behind the same queries, plus a mounted volume or object storage for attachments.
4. **Real auth:** email magic links or OAuth. The rest of the app already depends only on `req.user`.
5. Front-end component tests for the autosave hook (fake timers) and the share dialog.
