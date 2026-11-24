import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import type { Db } from '../db.ts';
import { authorizeDoc, type DocRow, type Role } from '../access.ts';
import { HttpError, badRequest } from '../http.ts';
import { sanitizeDocHtml } from '../sanitize.ts';
import { MAX_UPLOAD_BYTES, convertUpload } from '../importFile.ts';

const MAX_TITLE = 200;
const MAX_CONTENT_CHARS = 2_000_000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  defParamCharset: 'utf8',
});

function normalizeTitle(raw: unknown): string {
  if (raw === undefined || raw === null) return 'Untitled document';
  if (typeof raw !== 'string') throw badRequest('Title must be a string.');
  const title = raw.replace(/\s+/g, ' ').trim();
  if (title.length > MAX_TITLE) throw badRequest(`Title must be at most ${MAX_TITLE} characters.`);
  return title || 'Untitled document';
}

function validateContent(raw: unknown): string {
  if (typeof raw !== 'string') throw badRequest('Content must be an HTML string.');
  if (raw.length > MAX_CONTENT_CHARS) throw new HttpError(413, 'too_large', 'Document is too large to save.');
  return sanitizeDocHtml(raw);
}

/** Plain-text preview for the document list (skips a leading line that just repeats the title). */
function snippet(html: string, title: string) {
  const text = html
    .slice(0, 2000)
    .replace(/<\/(p|h[1-3]|li|blockquote|pre)>/g, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  const rest = text.toLowerCase().startsWith(title.toLowerCase()) ? text.slice(title.length).trim() : text;
  return rest.slice(0, 160);
}

export function documentsRouter(db: Db) {
  const r = Router();

  const userById = db.prepare('SELECT id, name, email, color FROM users WHERE id = ?');
  const getUser = (id: string | null) =>
    id ? ((userById.get(id) as { id: string; name: string; email: string; color: string }) ?? null) : null;

  const serialize = (doc: DocRow, role: Role, { withContent = true } = {}) => ({
    id: doc.id,
    title: doc.title,
    ...(withContent ? { content: doc.content } : {}),
    version: doc.version,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
    updatedBy: getUser(doc.updated_by),
    owner: getUser(doc.owner_id),
    role,
  });

  const insertDoc = (ownerId: string, title: string, content: string) => {
    const now = Date.now();
    const id = randomUUID();
    db.prepare(
      `INSERT INTO documents (id, owner_id, title, content, created_at, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, ownerId, title, content, now, now, ownerId);
    return authorizeDoc(db, id, ownerId, 'owner').doc;
  };

  // List: documents I own + documents shared with me.
  r.get('/', (req, res) => {
    const userId = req.user!.id;
    const owned = db
      .prepare(
        `SELECT d.*, (SELECT COUNT(*) FROM document_shares s WHERE s.document_id = d.id) AS share_count
         FROM documents d WHERE d.owner_id = ? ORDER BY d.updated_at DESC`,
      )
      .all(userId) as unknown as (DocRow & { share_count: number })[];
    const shared = db
      .prepare(
        `SELECT d.*, s.role AS share_role FROM document_shares s
         JOIN documents d ON d.id = s.document_id
         WHERE s.user_id = ? ORDER BY d.updated_at DESC`,
      )
      .all(userId) as unknown as (DocRow & { share_role: 'viewer' | 'editor' })[];

    res.json({
      owned: owned.map((d) => ({
        ...serialize(d, 'owner', { withContent: false }),
        snippet: snippet(d.content, d.title),
        shareCount: d.share_count,
      })),
      shared: shared.map((d) => ({
        ...serialize(d, d.share_role, { withContent: false }),
        snippet: snippet(d.content, d.title),
      })),
    });
  });

  r.post('/', (req, res) => {
    const title = normalizeTitle(req.body?.title);
    const content = req.body?.content === undefined ? '' : validateContent(req.body.content);
    res.status(201).json(serialize(insertDoc(req.user!.id, title, content), 'owner'));
  });

  // Upload a .txt / .md / .docx file and turn it into a new document.
  r.post('/import', upload.single('file'), async (req, res) => {
    if (!req.file) throw badRequest('Attach a file in the "file" field.');
    const { title, html } = await convertUpload(req.file.originalname, req.file.buffer);
    res.status(201).json(serialize(insertDoc(req.user!.id, title, html), 'owner'));
  });

  r.get('/:id', (req, res) => {
    const { doc, role } = authorizeDoc(db, req.params.id, req.user!.id, 'viewer');
    res.json(serialize(doc, role));
  });

  /**
   * Update title and/or content.
   * Content saves use optimistic concurrency: the client sends the version it
   * started from (baseVersion) and gets 409 if someone else saved in between,
   * unless it explicitly chooses to overwrite (force: true).
   * Title renames are last-write-wins and don't bump the content version.
   */
  r.patch('/:id', (req, res) => {
    const userId = req.user!.id;
    const body = req.body ?? {};
    const { doc } = authorizeDoc(db, req.params.id, userId, 'editor');

    const hasTitle = body.title !== undefined;
    const hasContent = body.content !== undefined;
    if (!hasTitle && !hasContent) throw badRequest('Nothing to update: send "title" and/or "content".');

    const title = hasTitle ? normalizeTitle(body.title) : undefined;
    const content = hasContent ? validateContent(body.content) : undefined;
    const force = body.force === true;
    if (hasContent && !force && !Number.isInteger(body.baseVersion)) {
      throw badRequest('"baseVersion" (integer) is required when saving content.');
    }

    const now = Date.now();
    db.exec('BEGIN IMMEDIATE');
    try {
      if (content !== undefined) {
        const result = force
          ? db
              .prepare(
                `UPDATE documents SET content = ?, version = version + 1, updated_at = ?, updated_by = ?
                 WHERE id = ?`,
              )
              .run(content, now, userId, doc.id)
          : db
              .prepare(
                `UPDATE documents SET content = ?, version = version + 1, updated_at = ?, updated_by = ?
                 WHERE id = ? AND version = ?`,
              )
              .run(content, now, userId, doc.id, body.baseVersion);
        if (result.changes === 0) {
          const current = db.prepare('SELECT version, updated_at, updated_by FROM documents WHERE id = ?').get(doc.id) as {
            version: number;
            updated_at: number;
            updated_by: string | null;
          };
          throw new HttpError(409, 'version_conflict', 'This document was changed by someone else since you opened it.', {
            currentVersion: current.version,
            updatedAt: current.updated_at,
            updatedBy: getUser(current.updated_by),
          });
        }
      }
      if (title !== undefined) {
        db.prepare('UPDATE documents SET title = ?, updated_at = ?, updated_by = ? WHERE id = ?').run(
          title,
          now,
          userId,
          doc.id,
        );
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const updated = authorizeDoc(db, doc.id, userId, 'viewer');
    res.json(serialize(updated.doc, updated.role, { withContent: false }));
  });

  r.delete('/:id', (req, res) => {
    const { doc } = authorizeDoc(db, req.params.id, req.user!.id, 'owner');
    db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
    res.status(204).end();
  });

  // ---- Sharing ------------------------------------------------------------

  const listAccess = (docId: string, ownerId: string) => ({
    owner: getUser(ownerId),
    shares: (
      db
        .prepare(
          `SELECT u.id, u.name, u.email, u.color, s.role FROM document_shares s
           JOIN users u ON u.id = s.user_id WHERE s.document_id = ? ORDER BY s.created_at`,
        )
        .all(docId) as { id: string; name: string; email: string; color: string; role: 'viewer' | 'editor' }[]
    ).map(({ role, ...user }) => ({ user, role })),
  });

  // Anyone with access can see who else has access; only the owner can change it.
  r.get('/:id/shares', (req, res) => {
    const { doc } = authorizeDoc(db, req.params.id, req.user!.id, 'viewer');
    res.json(listAccess(doc.id, doc.owner_id));
  });

  // Grant or change access (upsert by email).
  r.post('/:id/shares', (req, res) => {
    const { doc } = authorizeDoc(db, req.params.id, req.user!.id, 'owner');
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const role = req.body?.role ?? 'viewer';
    if (!email) throw badRequest('Enter an email address to share with.');
    if (role !== 'viewer' && role !== 'editor') throw badRequest('Role must be "viewer" or "editor".');

    const target = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string } | undefined;
    if (!target) throw new HttpError(404, 'user_not_found', `No user found with email ${email}.`);
    if (target.id === doc.owner_id) throw badRequest('The owner already has full access.');

    db.prepare(
      `INSERT INTO document_shares (document_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (document_id, user_id) DO UPDATE SET role = excluded.role`,
    ).run(doc.id, target.id, role, Date.now());
    res.json(listAccess(doc.id, doc.owner_id));
  });

  // Owner revokes access, or a collaborator removes themselves.
  r.delete('/:id/shares/:userId', (req, res) => {
    const me = req.user!.id;
    const isSelf = req.params.userId === me;
    const { doc } = authorizeDoc(db, req.params.id, me, isSelf ? 'viewer' : 'owner');
    db.prepare('DELETE FROM document_shares WHERE document_id = ? AND user_id = ?').run(doc.id, req.params.userId);
    res.json(listAccess(doc.id, doc.owner_id));
  });

  return r;
}

/** Convert a file to HTML without creating a document (used for "insert file into this doc"). */
export function convertRouter() {
  const r = Router();
  r.post('/', upload.single('file'), async (req, res) => {
    if (!req.file) throw badRequest('Attach a file in the "file" field.');
    res.json(await convertUpload(req.file.originalname, req.file.buffer));
  });
  return r;
}
