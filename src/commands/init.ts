import { promises as fs } from 'node:fs';
import path from 'node:path';
import { deriveKey, encryptValue } from '../crypto';
import {
  type EnvLine,
  parseEnv,
  serializeEnv,
} from '../env-file';
import { ensureGitignore } from '../gitignore';
import {
  PROJECT_ENV_BACKUP_FILE,
  PROJECT_ENV_FILE,
} from '../paths';
import {
  createProfile,
  getProfile,
  listProfiles,
} from '../profile-store';
import { readhidevarsFile, writehidevarsFile } from '../hidevars-file';

const ENV_TEMPLATE =
  '# Environment Variables\n' +
  '# Add all your environment variables here, example\n' +
  "# API_KEY=hidevars('API_KEY')\n";

export interface Prompter {
  pickOrCreateProfile(existing: string[]): Promise<{ kind: 'pick'; name: string } | { kind: 'create' }>;
  newProfileName(existing: string[]): Promise<string>;
  newPassphrase(): Promise<string>;
  confirmSwitchProfile(currentName: string): Promise<boolean>;
}

export interface InitOptions {
  cwd?: string;
  profilesFile?: string;
  prompter: Prompter;
  log?: (message: string) => void;
}

export interface InitResult {
  profile: string;
  createdProfile: boolean;
  envCreated: boolean;
  envMigrated: number;
  gitignoreAdded: string[];
}

export async function runInit(options: InitOptions): Promise<InitResult> {
  const cwd = options.cwd ?? process.cwd();
  const log = options.log ?? (() => {});
  const existingPointer = await readhidevarsFile(cwd);
  if (existingPointer) {
    const ok = await options.prompter.confirmSwitchProfile(existingPointer.profile);
    if (!ok) {
      log(`Keeping existing profile "${existingPointer.profile}".`);
      return {
        profile: existingPointer.profile,
        createdProfile: false,
        envCreated: false,
        envMigrated: 0,
        gitignoreAdded: [],
      };
    }
  }

  const { profileName, createdProfile } = await chooseProfile(options);
  await writehidevarsFile(cwd, { profile: profileName });
  log(`Active profile: ${profileName}`);

  const { added: gitignoreAdded } = await ensureGitignore(cwd);
  if (gitignoreAdded.length > 0) {
    log(`Added to .gitignore: ${gitignoreAdded.join(', ')}`);
  }

  const envResult = await scaffoldOrMigrateEnv(cwd, options.profilesFile, profileName, log);

  return {
    profile: profileName,
    createdProfile,
    envCreated: envResult.created,
    envMigrated: envResult.migrated,
    gitignoreAdded,
  };
}

async function chooseProfile(
  options: InitOptions,
): Promise<{ profileName: string; createdProfile: boolean }> {
  const filePath = options.profilesFile;
  const existing = await listProfiles({ filePath });
  if (existing.length === 0) {
    return { profileName: await createNewProfile(options, existing), createdProfile: true };
  }
  const choice = await options.prompter.pickOrCreateProfile(existing);
  if (choice.kind === 'pick') {
    return { profileName: choice.name, createdProfile: false };
  }
  return { profileName: await createNewProfile(options, existing), createdProfile: true };
}

async function createNewProfile(options: InitOptions, existing: string[]): Promise<string> {
  const name = await options.prompter.newProfileName(existing);
  const passphrase = await options.prompter.newPassphrase();
  await createProfile(name, passphrase, { filePath: options.profilesFile });
  return name;
}

async function scaffoldOrMigrateEnv(
  cwd: string,
  profilesFile: string | undefined,
  profileName: string,
  log: (m: string) => void,
): Promise<{ created: boolean; migrated: number }> {
  const envPath = path.join(cwd, PROJECT_ENV_FILE);
  const exists = await fileExists(envPath);
  if (!exists) {
    await fs.writeFile(envPath, ENV_TEMPLATE, 'utf8');
    log(`Created ${PROJECT_ENV_FILE} with template.`);
    return { created: true, migrated: 0 };
  }

  const original = await fs.readFile(envPath, 'utf8');
  const backupPath = path.join(cwd, PROJECT_ENV_BACKUP_FILE);
  await fs.writeFile(backupPath, original, 'utf8');

  try {
    const profile = await getProfile(profileName, { filePath: profilesFile });
    if (!profile) {
      throw new Error(`profile "${profileName}" missing right after creation`);
    }
    const key = deriveKey(profile.passphrase, Buffer.from(profile.salt, 'base64'));
    const lines = parseEnv(original);
    const { migrated, output } = encryptAllValues(lines, key);
    await fs.writeFile(envPath, output, 'utf8');
    await fs.unlink(backupPath);
    log(`Encrypted ${migrated} value(s) in ${PROJECT_ENV_FILE}.`);
    return { created: false, migrated };
  } catch (err) {
    await fs.writeFile(envPath, original, 'utf8').catch(() => {});
    throw err;
  }
}

function encryptAllValues(lines: EnvLine[], key: Buffer): { migrated: number; output: string } {
  let migrated = 0;
  const next: EnvLine[] = lines.map((line) => {
    if (line.type !== 'entry' || line.kind !== 'plain') return line;
    if (line.value === '') return line;
    const payload = encryptValue(line.value, key, 'm');
    migrated += 1;
    return { type: 'entry', kind: 'encrypted', name: line.name, payload, raw: '' };
  });
  return { migrated, output: serializeEnv(next) };
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
