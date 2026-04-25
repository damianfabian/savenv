import path from 'node:path';
import { type DisplayMode, encryptValue, isEncryptableMode } from '../crypto';
import {
  readEnvFile,
  setEncryptedEntry,
  setPlainEntry,
  writeEnvFile,
} from '../env-file';
import { PROJECT_ENV_FILE } from '../paths';
import { openSession } from '../session';

export interface ParsedNameSpec {
  name: string;
  mode: DisplayMode;
}

const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const VALID_MODES: ReadonlySet<DisplayMode> = new Set(['p', 'm', 'o']);

export function parseNameSpec(spec: string): ParsedNameSpec {
  const colon = spec.indexOf(':');
  if (colon < 0) {
    if (!NAME_PATTERN.test(spec)) {
      throw new Error(`invalid variable name: "${spec}"`);
    }
    return { name: spec, mode: 'm' };
  }
  const name = spec.slice(0, colon);
  const modeSpec = spec.slice(colon + 1);
  if (!NAME_PATTERN.test(name)) {
    throw new Error(`invalid variable name: "${name}"`);
  }
  if (modeSpec.length === 0) {
    throw new Error('expected display mode after ":" (one of p, m, o)');
  }
  if (modeSpec.length > 1 || !VALID_MODES.has(modeSpec as DisplayMode)) {
    throw new Error(`invalid display mode "${modeSpec}" (expected one of p, m, o)`);
  }
  return { name, mode: modeSpec as DisplayMode };
}

export interface RunSetOptions {
  spec: string;
  value: string;
  cwd?: string;
  profilesFile?: string;
  profile?: string;
  env?: NodeJS.ProcessEnv;
}

export interface SetResult {
  name: string;
  mode: DisplayMode;
  created: boolean;
}

export async function runSet(options: RunSetOptions): Promise<SetResult> {
  const { name, mode } = parseNameSpec(options.spec);
  const cwd = options.cwd ?? process.cwd();
  const envPath = path.join(cwd, PROJECT_ENV_FILE);
  const lines = await readEnvFile(envPath);
  const existed = lines.some((l) => l.type === 'entry' && l.name === name);

  let nextLines;
  if (isEncryptableMode(mode)) {
    const session = await openSession({
      cwd,
      profile: options.profile,
      profilesFile: options.profilesFile,
      env: options.env,
    });
    const payload = encryptValue(options.value, session.key, mode);
    nextLines = setEncryptedEntry(lines, name, payload);
  } else {
    nextLines = setPlainEntry(lines, name, options.value);
  }

  await writeEnvFile(envPath, nextLines);
  return { name, mode, created: !existed };
}
