import path from 'node:path';
import { decryptValue, type DisplayMode } from '../crypto';
import { type Entry, getEntries, readEnvFile } from '../env-file';
import { PROJECT_ENV_FILE } from '../paths';
import { openSession, type Session } from '../session';

export interface ListItem {
  name: string;
  mode: DisplayMode;
  display: string;
  error?: string;
}

export interface RunListOptions {
  cwd?: string;
  profilesFile?: string;
  profile?: string;
  env?: NodeJS.ProcessEnv;
}

export async function runList(options: RunListOptions = {}): Promise<ListItem[]> {
  const cwd = options.cwd ?? process.cwd();
  const lines = await readEnvFile(path.join(cwd, PROJECT_ENV_FILE));
  const entries = getEntries(lines);

  const needsKey = entries.some((e) => e.kind === 'encrypted');
  let session: Session | null = null;
  let sessionError: string | null = null;
  if (needsKey) {
    try {
      session = await openSession({
        cwd,
        profile: options.profile,
        profilesFile: options.profilesFile,
        env: options.env,
      });
    } catch (err) {
      sessionError = err instanceof Error ? err.message : String(err);
    }
  }

  return entries.map((entry) => buildItem(entry, session, sessionError));
}

function buildItem(entry: Entry, session: Session | null, sessionError: string | null): ListItem {
  if (entry.kind === 'plain') {
    return { name: entry.name, mode: 'o', display: entry.value };
  }
  if (!session) {
    return {
      name: entry.name,
      mode: 'm',
      display: '<unavailable>',
      error: sessionError ?? 'no session',
    };
  }
  try {
    const { plaintext, mode } = decryptValue(entry.payload, session.key);
    return { name: entry.name, mode, display: render(mode, plaintext) };
  } catch (err) {
    return {
      name: entry.name,
      mode: 'm',
      display: '<undecryptable>',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function render(mode: 'p' | 'm', plaintext: string): string {
  if (mode === 'p') return '*'.repeat(10);
  const prefix = plaintext.slice(0, 3);
  return `${prefix}${'*'.repeat(7)}`;
}

export function formatList(items: ListItem[]): string {
  return items.map((i) => `${i.name}=${i.display}`).join('\n');
}
