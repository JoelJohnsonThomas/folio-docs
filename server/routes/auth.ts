import { Router } from 'express';
import type { Db } from '../db.ts';
import { createSession, destroySession, requireUser, type User } from '../auth.ts';
import { HttpError, badRequest } from '../http.ts';

export function authRouter(db: Db) {
  const r = Router();

  // Mocked login: pick a seeded account by email. No password by design (see README).
  r.post('/login', (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    if (!email) throw badRequest('Email is required.');
    const user = db.prepare('SELECT id, email, name, color FROM users WHERE email = ?').get(email) as
      | User
      | undefined;
    if (!user) throw new HttpError(401, 'unknown_user', 'No demo account with that email.');
    createSession(db, req, res, user.id);
    res.json({ ...user });
  });

  r.post('/logout', (req, res) => {
    destroySession(db, req, res);
    res.status(204).end();
  });

  r.get('/me', requireUser, (req, res) => {
    res.json(req.user);
  });

  return r;
}

export function usersRouter(db: Db) {
  const r = Router();
  // Public on purpose: the login screen lists demo accounts, and the share
  // dialog uses it for email suggestions.
  r.get('/', (_req, res) => {
    res.json(db.prepare('SELECT id, name, email, color FROM users ORDER BY name').all());
  });
  return r;
}
