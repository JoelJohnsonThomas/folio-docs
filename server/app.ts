import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import type { Db } from './db.ts';
import { loadUser, requireUser } from './auth.ts';
import { HttpError, errorHandler } from './http.ts';
import { authRouter, usersRouter } from './routes/auth.ts';
import { convertRouter, documentsRouter } from './routes/documents.ts';

export function createApp(db: Db, { staticDir }: { staticDir?: string } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    // No X-Frame-Options: some hosts (e.g. Hugging Face Spaces) embed the app in an
    // iframe. Instead, the SPA refuses to render its UI when framed (see web/src/main.tsx).
    next();
  });

  app.use('/api', express.json({ limit: '3mb' }), loadUser(db));
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/auth', authRouter(db));
  app.use('/api/users', usersRouter(db));
  app.use('/api/documents', requireUser, documentsRouter(db));
  app.use('/api/convert', requireUser, convertRouter());
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'not_found', 'No such API route.')));

  // In production the built React app is served from the same origin.
  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(join(staticDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
