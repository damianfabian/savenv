import { deriveKey } from './crypto';
import { getProfile, type ProfileEntry } from './profile-store';
import { readhidevarsFile } from './hidevars-file';

export interface SessionOptions {
  cwd?: string;
  profile?: string;
  profilesFile?: string;
  env?: NodeJS.ProcessEnv;
}

export interface Session {
  projectDir: string;
  profileName: string;
  entry: ProfileEntry;
  key: Buffer;
}

export async function resolveProfileName(opts: SessionOptions = {}): Promise<string> {
  const env = opts.env ?? process.env;
  if (opts.profile && opts.profile.length > 0) return opts.profile;
  const fromEnv = env.hidevars_PROFILE;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  const cwd = opts.cwd ?? process.cwd();
  const pointer = await readhidevarsFile(cwd);
  if (!pointer) {
    throw new Error('no .hidevars file found in project; run `hidevars init` first');
  }
  return pointer.profile;
}

export async function openSession(opts: SessionOptions = {}): Promise<Session> {
  const projectDir = opts.cwd ?? process.cwd();
  const profileName = await resolveProfileName(opts);
  const entry = await getProfile(profileName, { filePath: opts.profilesFile });
  if (!entry) {
    throw new Error(`profile "${profileName}" not found in profiles file`);
  }
  if (entry.kdf !== 'scrypt') {
    throw new Error(`unsupported KDF in profile "${profileName}": ${entry.kdf}`);
  }
  const salt = Buffer.from(entry.salt, 'base64');
  const key = deriveKey(entry.passphrase, salt);
  return { projectDir, profileName, entry, key };
}
