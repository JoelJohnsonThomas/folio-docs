# Walkthrough video outline (about 4 minutes)

A speaking guide for the recording. Not part of the product.

1. **Framing (20 s).** "A lightweight collaborative editor. I focused on three things: an editing loop you can trust, server-enforced sharing, and file import that's actually useful."
2. **Main flow as Alice (60 s).** Sign in → documents page (My documents vs Shared with me) → New document → rename → type with headings, bold/italic/underline, lists → point at the "Saved" status → reload: everything persists.
3. **File upload (30 s).** Back to the list → drop a `.md` or `.docx` → it becomes a formatted doc. Show "Insert from file" in the toolbar, and a `.pdf` being rejected with a clear message.
4. **Sharing (60 s).** Share with Bob as *Can view* → switch to Bob from the avatar menu → the doc is under "Shared with me" and read-only. Switch back, upgrade to *Can edit* → Bob edits → Alice sees the change appear. Switch to Carol and open the URL: access denied.
5. **Conflict handling (20 s).** Show the conflict banner (or the screenshot) and explain the 409 / `baseVersion` approach.
6. **Deliberate cuts (30 s).** No CRDT real-time editing, mocked auth, no images or tables, ephemeral demo storage. Explain why, and what's next (Yjs, version history, Postgres).
7. **Implementation and AI (40 s).** Single Node process, SQLite, one `authorizeDoc` choke point, sanitize on every write, tests in the Docker build. How AI helped and what was caught and changed (autosave hook re-render bug, docx fixture limits, bundle splitting).
