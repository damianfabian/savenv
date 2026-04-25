import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  PROJECT_ENV_FILE,
  PROJECT_GITIGNORE_FILE,
  PROJECT_envsafe_FILE,
} from './paths';

const REQUIRED_ENTRIES = [PROJECT_ENV_FILE, PROJECT_envsafe_FILE];

export async function ensureGitignore(projectDir: string): Promise<{ added: string[] }> {
  const filePath = path.join(projectDir, PROJECT_GITIGNORE_FILE);
  let existing = '';
  try {
    existing = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  const present = new Set(
    existing
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== '' && !l.startsWith('#')),
  );

  const missing = REQUIRED_ENTRIES.filter((entry) => !present.has(entry));
  if (missing.length === 0) return { added: [] };

  const needsLeadingNewline = existing.length > 0 && !existing.endsWith('\n');
  const block = `${needsLeadingNewline ? '\n' : ''}${
    existing.length === 0 ? '' : '\n'
  }# Added by envsafe\n${missing.join('\n')}\n`;

  await fs.writeFile(filePath, existing + block, 'utf8');
  return { added: missing };
}
