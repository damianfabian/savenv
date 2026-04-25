import path from 'node:path';
import { decryptValue } from '../crypto';
import { getEntries, readEnvFile } from '../env-file';
import { PROJECT_ENV_FILE } from '../paths';
import { openSession } from '../session';

export interface RunGetOptions {
  name: string;
  cwd?: string;
  profilesFile?: string;
  profile?: string;
  env?: NodeJS.ProcessEnv;
}

export async function runGet(options: RunGetOptions): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const lines = await readEnvFile(path.join(cwd, PROJECT_ENV_FILE));
  const entry = getEntries(lines).find((e) => e.name === options.name);
  if (!entry) {
    throw new Error(`variable "${options.name}" not found`);
  }
  if (entry.kind === 'plain') {
    return entry.value;
  }
  const session = await openSession({
    cwd,
    profile: options.profile,
    profilesFile: options.profilesFile,
    env: options.env,
  });
  const { plaintext } = decryptValue(entry.payload, session.key);
  return plaintext;
}
