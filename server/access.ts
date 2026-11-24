import type { Db } from './db.ts';
import { forbidden, notFound } from './http.ts';

export type Role = 'owner' | 'editor' | 'viewer';

const RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

export interface DocRow {
  id: string;
  owner_id: string;
  title: string;
  content: string;
  version: number;
  created_at: number;
  updated_at: number;
  updated_by: string | null;
}

/**
 * Single source of truth for document authorization.
 *
 * Returns the document and the caller's effective role, or throws:
 * - 404 when the user has no access at all (we don't reveal that the doc exists)
 * - 403 when the user can see the doc but lacks the required role
 */
export function authorizeDoc(db: Db, docId: string, userId: string, required: Role) {
  const row = db
    .prepare(
      `SELECT d.*, s.role AS share_role FROM documents d
       LEFT JOIN document_shares s ON s.document_id = d.id AND s.user_id = ?
       WHERE d.id = ?`,
    )
    .get(userId, docId) as (DocRow & { share_role: 'viewer' | 'editor' | null }) | undefined;

  if (!row) throw notFound();
  const role: Role | null = row.owner_id === userId ? 'owner' : row.share_role;
  if (!role) throw notFound();
  if (RANK[role] < RANK[required]) {
    throw forbidden(
      required === 'owner'
        ? 'Only the document owner can do that.'
        : 'You have view-only access to this document.',
    );
  }
  const { share_role: _ignored, ...doc } = row;
  return { doc: doc as DocRow, role };
}
