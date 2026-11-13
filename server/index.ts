import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openDb } from './db.js';
import { seed } from './seed.js';

// This file runs from server/ (dev, via tsx) or dist/server/ (prod), so walk
// up to the directory containing package.json to find the project root.
function findRoot(dir: string): string {
  while (!fs.existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
  return dir;
}

const root = findRoot(path.dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT ?? 3001);
const dbFile = process.env.DATABASE_PATH ?? path.join(root, 'data', 'app.db');
const isProd = process.env.NODE_ENV === 'production';

const db = openDb(dbFile);
seed(db);

const app = createApp(db, {
  staticDir: path.join(root, 'dist', 'client'),
  trustProxy: isProd,
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port} (db: ${dbFile})`);
});
