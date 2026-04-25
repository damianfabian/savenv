import { promises as fs } from 'node:fs';
import path from 'node:path';
import { generateSalt, SCRYPT_PARAMS } from './crypto';
import { profilesFile } from './paths';

export interface ProfileEntry {
  passphrase: string;
  salt: string;
  kdf: 'scrypt';
  kdfParams: { N: number; r: number; p: number };
  createdAt: string;
}

export interface ProfilesFile {
  version: 1;
  profiles: Record<string, ProfileEntry>;
}

const FILE_VERSION = 1;
const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

export interface ProfileStoreOptions {
  filePath?: string;
}

function resolveFilePath(opts: ProfileStoreOptions = {}): string {
  return opts.filePath ?? profilesFile();
}

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function readProfilesFile(opts: ProfileStoreOptions = {}): Promise<ProfilesFile> {
  const filePath = resolveFilePath(opts);
  const raw = await readFileIfExists(filePath);
  if (raw === null) {
    return { version: FILE_VERSION, profiles: {} };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`profiles file at ${filePath} is not valid JSON: ${(err as Error).message}`);
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as ProfilesFile).version !== FILE_VERSION ||
    typeof (parsed as ProfilesFile).profiles !== 'object'
  ) {
    throw new Error(`profiles file at ${filePath} has unexpected shape`);
  }
  return parsed as ProfilesFile;
}

export async function writeProfilesFile(
  data: ProfilesFile,
  opts: ProfileStoreOptions = {},
): Promise<void> {
  const filePath = resolveFilePath(opts);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true, mode: DIR_MODE });
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), { mode: FILE_MODE });
  await fs.rename(tmp, filePath);
  if (process.platform !== 'win32') {
    await fs.chmod(filePath, FILE_MODE);
  }
}

export async function listProfiles(opts: ProfileStoreOptions = {}): Promise<string[]> {
  const file = await readProfilesFile(opts);
  return Object.keys(file.profiles).sort();
}

export async function getProfile(
  name: string,
  opts: ProfileStoreOptions = {},
): Promise<ProfileEntry | null> {
  const file = await readProfilesFile(opts);
  return file.profiles[name] ?? null;
}

export async function createProfile(
  name: string,
  passphrase: string,
  opts: ProfileStoreOptions = {},
): Promise<ProfileEntry> {
  if (!isValidProfileName(name)) {
    throw new Error(`invalid profile name: "${name}"`);
  }
  if (passphrase.length === 0) {
    throw new Error('passphrase must not be empty');
  }
  const file = await readProfilesFile(opts);
  if (file.profiles[name]) {
    throw new Error(`profile "${name}" already exists`);
  }
  const entry: ProfileEntry = {
    passphrase,
    salt: generateSalt().toString('base64'),
    kdf: 'scrypt',
    kdfParams: { ...SCRYPT_PARAMS },
    createdAt: new Date().toISOString(),
  };
  file.profiles[name] = entry;
  await writeProfilesFile(file, opts);
  return entry;
}

export function isValidProfileName(name: string): boolean {
  return /^[a-zA-Z0-9_.-]{1,64}$/.test(name);
}
