import { randomBytes } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import type { Db } from './db.ts';
import { HttpError } from './http.ts';

export interface User {
  id: string;
  email: string;
  name: string;
  color: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
  }
}

const COOKIE = 'folio_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/**
 * Mocked authentication: users are seeded and sign in by picking an account
 * (no passwords). Sessions are still real server-side records keyed by an
 * opaque httpOnly cookie, so swapping in real credentials later only touches
 * the login route.
 */
export function createSession(db: Db, req: Request, res: Response, userId: string) {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    Date.now() + SESSION_TTL_MS,
  );
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Follow the real protocol (behind a TLS-terminating proxy via trust proxy),
    // so the same image works over https in production and http locally.
    secure: req.secure,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

export function destroySession(db: Db, req: Request, res: Response) {
  const token = readCookie(req, COOKIE);
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie(COOKIE, { path: '/' });
}

/** Attaches req.user when a valid session cookie is present. Never rejects. */
export function loadUser(db: Db): RequestHandler {
  const stmt = db.prepare(
    `SELECT u.id, u.email, u.name, u.color FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`,
  );
  return (req, _res, next) => {
    const token = readCookie(req, COOKIE);
    if (token) {
      const row = stmt.get(token, Date.now()) as User | undefined;
      if (row) req.user = { ...row };
    }
    next();
  };
}

export const requireUser: RequestHandler = (req, _res, next) => {
  if (!req.user) throw new HttpError(401, 'unauthenticated', 'Please sign in.');
  next();
};
