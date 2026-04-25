import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PROJECT_hidevars_FILE } from './paths';
import { isValidProfileName } from './profile-store';

const HEADER = '# SaveEnv Profile';

export interface hidevarsPointer {
  profile: string;
}

export function hidevarsFilePath(projectDir: string): string {
  return path.join(projectDir, PROJECT_hidevars_FILE);
}

export async function readhidevarsFile(projectDir: string): Promise<hidevarsPointer | null> {
  const filePath = hidevarsFilePath(projectDir);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  const profile = parseProfile(raw);
  if (profile === null) {
    throw new Error(`malformed ${PROJECT_hidevars_FILE}: missing "profile=" entry`);
  }
  if (!isValidProfileName(profile)) {
    throw new Error(`malformed ${PROJECT_hidevars_FILE}: invalid profile name "${profile}"`);
  }
  return { profile };
}

export async function writehidevarsFile(projectDir: string, pointer: hidevarsPointer): Promise<void> {
  if (!isValidProfileName(pointer.profile)) {
    throw new Error(`invalid profile name: "${pointer.profile}"`);
  }
  const content = `${HEADER}\nprofile=${pointer.profile}\n`;
  await fs.writeFile(hidevarsFilePath(projectDir), content, 'utf8');
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
