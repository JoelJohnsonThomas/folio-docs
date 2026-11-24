import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type Db = DatabaseSync;

const SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS documents (
    id         TEXT PRIMARY KEY,
    owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL DEFAULT '',
    -- Incremented on every content save; used for optimistic concurrency.
    version    INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);

  CREATE TABLE IF NOT EXISTS document_shares (
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (document_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_shares_user ON document_shares(user_id);
`;

export const SEED_USERS = [
  { id: 'u_alice', email: 'alice@folio.test', name: 'Alice Chen', color: '#2563eb' },
  { id: 'u_bob', email: 'bob@folio.test', name: 'Bob Okafor', color: '#16a34a' },
  { id: 'u_carol', email: 'carol@folio.test', name: 'Carol Diaz', color: '#c026d3' },
] as const;

export function openDb(path: string, { seed = true } = {}): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  if (seed) seedDemoData(db);
  return db;
}

/** Idempotent: inserts demo users always, demo documents only into an empty DB. */
function seedDemoData(db: Db) {
  const insertUser = db.prepare(
    'INSERT OR IGNORE INTO users (id, email, name, color) VALUES (?, ?, ?, ?)',
  );
  for (const u of SEED_USERS) insertUser.run(u.id, u.email, u.name, u.color);

  const { n } = db.prepare('SELECT COUNT(*) AS n FROM documents').get() as { n: number };
  if (n > 0) return;

  const now = Date.now();
  const insertDoc = db.prepare(
    `INSERT INTO documents (id, owner_id, title, content, created_at, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertShare = db.prepare(
    'INSERT INTO document_shares (document_id, user_id, role, created_at) VALUES (?, ?, ?, ?)',
  );

  const planId = randomUUID();
  insertDoc.run(
    planId,
    'u_alice',
    'Q3 Launch Plan',
    `<h1>Q3 Launch Plan</h1>
<p>This document is <strong>owned by Alice</strong> and shared with <em>Bob as an editor</em>. Sign in as Bob to edit it, or as Carol to confirm she <u>cannot</u> see it.</p>
<h2>Goals</h2>
<ol><li><p>Ship the beta to three pilot teams</p></li><li><p>Collect structured feedback</p></li><li><p>Decide on GA scope</p></li></ol>
<h2>Open questions</h2>
<ul><li><p>Do we need SSO for the pilot?</p></li><li><p>Who owns support rotations?</p></li></ul>`,
    now - 1000 * 60 * 60 * 26,
    now - 1000 * 60 * 42,
    'u_alice',
  );
  insertShare.run(planId, 'u_bob', 'editor', now);

  const notesId = randomUUID();
  insertDoc.run(
    notesId,
    'u_bob',
    'Team Onboarding Checklist',
    `<h1>Team Onboarding Checklist</h1>
<p>Owned by Bob and shared with <strong>Alice as a viewer</strong>, so Alice sees it read-only.</p>
<h3>First week</h3>
<ul><li><p>Laptop and accounts</p></li><li><p>Meet your onboarding buddy</p></li><li><p>Read the engineering handbook</p></li></ul>`,
    now - 1000 * 60 * 60 * 72,
    now - 1000 * 60 * 60 * 5,
    'u_bob',
  );
  insertShare.run(notesId, 'u_alice', 'viewer', now);
}
