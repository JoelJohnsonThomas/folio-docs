import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { openDb } from './db.ts';
import { createApp } from './app.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT ?? 3001);
const dbPath = process.env.DATABASE_PATH ?? join(root, 'data', 'folio.db');

const db = openDb(dbPath);
const app = createApp(db, { staticDir: join(root, 'dist') });

const server = app.listen(port, () => {
  console.log(`Folio API listening on http://localhost:${port} (db: ${dbPath})`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
