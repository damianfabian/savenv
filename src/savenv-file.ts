import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PROJECT_SAVENV_FILE } from './paths';
import { isValidProfileName } from './profile-store';

const HEADER = '# SaveEnv Profile';

export interface SavenvPointer {
  profile: string;
}

export function savenvFilePath(projectDir: string): string {
  return path.join(projectDir, PROJECT_SAVENV_FILE);
}

export async function readSavenvFile(projectDir: string): Promise<SavenvPointer | null> {
  const filePath = savenvFilePath(projectDir);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  const profile = parseProfile(raw);
  if (profile === null) {
    throw new Error(`malformed ${PROJECT_SAVENV_FILE}: missing "profile=" entry`);
  }
  if (!isValidProfileName(profile)) {
    throw new Error(`malformed ${PROJECT_SAVENV_FILE}: invalid profile name "${profile}"`);
  }
  return { profile };
}

export async function writeSavenvFile(projectDir: string, pointer: SavenvPointer): Promise<void> {
  if (!isValidProfileName(pointer.profile)) {
    throw new Error(`invalid profile name: "${pointer.profile}"`);
  }
  const content = `${HEADER}\nprofile=${pointer.profile}\n`;
  await fs.writeFile(savenvFilePath(projectDir), content, 'utf8');
}

function parseProfile(raw: string): string | null {
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key === 'profile') return value;
  }
  return null;
}
