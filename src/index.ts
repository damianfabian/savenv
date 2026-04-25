/**
 * savenv — library entry point.
 *
 * Public API:
 *   await require('savenv').load()
 *   await require('savenv').load({ profile })
 */

import path from 'node:path';
import { decryptValue } from './crypto';
import { type Entry, getEntries, readEnvFile } from './env-file';
import { PROJECT_ENV_FILE } from './paths';
import { openSession } from './session';

export interface LoadOptions {
  profile?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  warn?: (message: string) => void;
  /** Internal/testing: path to the profiles JSON file. Defaults to the per-user location. */
  profilesFile?: string;
}

export interface LoadResult {
  loaded: string[];
  failed: string[];
}

export async function load(options: LoadOptions = {}): Promise<LoadResult> {
  const cwd = options.cwd ?? process.cwd();
  const target = options.env ?? process.env;
  const warn = options.warn ?? defaultWarn;

  const lines = await readEnvFile(path.join(cwd, PROJECT_ENV_FILE));
  const entries = getEntries(lines);

  const loaded: string[] = [];
  const failed: string[] = [];

  let key: Buffer | null = null;
  const hasEncrypted = entries.some((e) => e.kind === 'encrypted');
  if (hasEncrypted) {
    try {
      const session = await openSession({
        cwd,
        profile: options.profile,
        env: options.env,
        profilesFile: options.profilesFile,
      });
      key = session.key;
    } catch (err) {
      warn(`savenv: ${describeError(err)}; encrypted variables will be skipped`);
    }
  }

  for (const entry of entries) {
    try {
      assignEntry(entry, key, target);
      loaded.push(entry.name);
    } catch (err) {
      warn(`savenv: failed to load "${entry.name}": ${describeError(err)}`);
      failed.push(entry.name);
    }
  }

  return { loaded, failed };
}

function assignEntry(entry: Entry, key: Buffer | null, target: NodeJS.ProcessEnv): void {
  if (entry.kind === 'plain') {
    target[entry.name] = entry.value;
    return;
  }
  if (!key) {
    throw new Error('no decryption key available');
  }
  const { plaintext } = decryptValue(entry.payload, key);
  target[entry.name] = plaintext;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function defaultWarn(message: string): void {
  process.stderr.write(`${message}\n`);
}

export default { load };
