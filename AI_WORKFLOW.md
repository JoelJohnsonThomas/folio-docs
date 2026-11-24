# AI workflow note

## Tools used

- **Claude Code** (Claude Opus 5.5, agentic mode in VS Code) as the main pair programmer. It read the brief, proposed the architecture, wrote code, ran commands (install, typecheck, tests, build), and drove a headless Chrome session to check the UI.
- **puppeteer-core** with local Chrome, scripted by the agent, for end-to-end checks and the screenshots in `docs/screenshots/`.
- No AI features run inside the product itself.

## Where AI materially sped things up

- **Scaffolding a coherent full-stack slice fast:** Express API, SQLite schema plus seed, React pages, and TipTap wiring were drafted in minutes rather than hours. That left most of the timebox for the harder parts: autosave semantics, authorization, and conflict handling.
- **Test-first confidence on access control:** the integration suite (`tests/api.test.ts`), covering the full share lifecycle, sanitization, conflicts, and import edge cases, was written in one pass and passed on the first run. It then served as a guardrail for every later refactor.
- **Boilerplate-heavy UI:** the toolbar, share dialog, toasts, CSS, and print stylesheet.
- **End-to-end verification:** a scripted two-user browser run (Alice and Bob in separate contexts) checked the whole flow, including taking one user offline to force a real save conflict. Clicking through that by hand after every change would have been slow.

## What AI produced that was changed or rejected

| What happened | Change |
| --- | --- |
| The installed packages were newer major versions than the model's defaults (TypeScript 7, react-router 8, marked 18, TipTap 3). | We checked the real exports and signatures first (e.g. TipTap v3 `setContent(content, { emitUpdate })`) instead of coding against remembered APIs. |
| The first `useAutosave` returned a new object on every render. Effects depending on it would have reset the polling interval and the ⌘S listener on each render. | The hook now returns memoized, stable actions, and effects depend on those. |
| The editor's `onUpdate` closure referenced the autosave hook, which is declared after `useEditor`. | Routed through a ref, so it never captures a stale or uninitialized value. |
| A default choice of `better-sqlite3` plus Vitest. | Rejected in favor of built-in `node:sqlite` and `node --test`. No native compilation (this matters in slim Docker images), and no bundler between tests and a `node:`-only builtin. |
| The `.docx` test fixture was generated with macOS `textutil`, which doesn't emit real Word heading or list styles. | The test asserts only what the fixture can prove (bold and italic survive), not headings. |
| Screenshot review showed document-list previews repeating the title when the body starts with the same heading. | The snippet now skips a leading line that matches the title. |
| The first production build shipped a single 712 KB JS bundle. | The editor route is lazy-loaded, cutting the initial load to about 89 KB gzipped. |
| The E2E script read Bob's document list before it had loaded. | Fixed the test's wait condition. The app was correct. |

**Scope cuts kept deliberately**, even though AI could have generated more code: no CRDT real-time editing, no comments, no version history. More features would have meant less-verified features. See `ARCHITECTURE.md` for the reasoning.

## How correctness, UX, and reliability were verified

- **Automated:** 14 API integration tests over real HTTP (`npm test`) and strict TypeScript for server and web (`npm run typecheck`). Both run inside the Docker build, so a red test can't ship.
- **Security-relevant behavior was tested, not assumed:** 404 vs 403 semantics, owner-only sharing, viewer write attempts, and XSS payloads (`<script>`, `onerror`, `javascript:` URLs) stripped on save.
- **Browser E2E (headless Chrome):** create → format → rename → reload (formatting preserved) → share as viewer → Bob sees "Shared with me" and a read-only editor → upgrade to editor → Bob's edit appears for Alice via refresh → offline edit → 409 conflict banner → overwrite → Carol is denied → `.md` import → `.pdf` rejected with a clear message. The run had no uncaught page errors. The only console errors were expected HTTP statuses (401 before sign-in, 404, 409, 415, offline).
- **Visual review:** each screenshot was inspected for layout, hierarchy, and copy. The duplicated-snippet issue above was found this way.

## Personal review

[Add 2–3 sentences in your own words: what you reviewed line by line, what you would have done differently, and any AI suggestion you overruled.]
