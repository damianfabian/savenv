import path from 'node:path';
import {
  deleteEntry,
  findEntryIndex,
  readEnvFile,
  writeEnvFile,
} from '../env-file';
import { PROJECT_ENV_FILE } from '../paths';

export interface RunDelOptions {
  name: string;
  cwd?: string;
}

export async function runDel(options: RunDelOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const envPath = path.join(cwd, PROJECT_ENV_FILE);
  const lines = await readEnvFile(envPath);
  if (findEntryIndex(lines, options.name) < 0) {
    throw new Error(`variable "${options.name}" not found`);
  }
  await writeEnvFile(envPath, deleteEntry(lines, options.name));
}
