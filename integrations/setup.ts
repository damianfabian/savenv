/**
 * Vitest globalSetup for the integration suite.
 *
 * The workspace fixtures depend on `hidevars`, which npm resolves to the
 * registry-published version inside `node_modules/hidevars` (npm only treats
 * sibling workspace entries as link candidates, not the workspace root).
 *
 * Replace that copy with a symlink to the workspace root so the spawned
 * node-app and the in-process vite build both load the freshly compiled
 * `dist/` we are testing.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TARGET = path.join(ROOT, 'node_modules', 'hidevars');

export default async function setup(): Promise<void> {
  const distExists = await fs
    .stat(path.join(ROOT, 'dist', 'index.js'))
    .then(() => true)
    .catch(() => false);
  if (!distExists) {
    throw new Error('integrations: dist/ not built. Run `npm run build` first.');
  }

  let alreadyLinked = false;
  try {
    const existing = await fs.lstat(TARGET);
    if (existing.isSymbolicLink()) {
      const dest = await fs.readlink(TARGET);
      if (path.resolve(path.dirname(TARGET), dest) === ROOT) {
        alreadyLinked = true;
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  if (!alreadyLinked) {
    await fs.rm(TARGET, { recursive: true, force: true });
    await fs.mkdir(path.dirname(TARGET), { recursive: true });
    await fs.symlink(ROOT, TARGET, 'junction');
  }
}
