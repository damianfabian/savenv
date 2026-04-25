import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createProfile,
  getProfile,
  isValidProfileName,
  listProfiles,
  readProfilesFile,
  writeProfilesFile,
} from './profile-store';

let tmpDir: string;
let filePath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'envsafe-profiles-'));
  filePath = path.join(tmpDir, 'nested', 'profiles.json');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('profile-store.readProfilesFile', () => {
  it('returns empty defaults when the file is missing', async () => {
    const data = await readProfilesFile({ filePath });
    expect(data).toEqual({ version: 1, profiles: {} });
  });

  it('throws on malformed JSON', async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, 'not json');
    await expect(readProfilesFile({ filePath })).rejects.toThrow(/not valid JSON/);
  });

  it('throws on wrong shape', async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify({ version: 99, profiles: {} }));
    await expect(readProfilesFile({ filePath })).rejects.toThrow(/unexpected shape/);
  });
});

describe('profile-store.writeProfilesFile', () => {
  it('creates the directory and writes 0600 file (POSIX)', async () => {
    await writeProfilesFile({ version: 1, profiles: {} }, { filePath });
    const stat = await fs.stat(filePath);
    expect(stat.isFile()).toBe(true);
    if (process.platform !== 'win32') {
      expect(stat.mode & 0o777).toBe(0o600);
    }
  });
});

describe('profile-store.createProfile', () => {
  it('creates a new profile with salt and timestamp', async () => {
    const entry = await createProfile('default', 'pp', { filePath });
    expect(entry.passphrase).toBe('pp');
    expect(typeof entry.salt).toBe('string');
    expect(entry.kdf).toBe('scrypt');
    expect(entry.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('persists across reads', async () => {
    await createProfile('work', 'pp', { filePath });
    const got = await getProfile('work', { filePath });
    expect(got?.passphrase).toBe('pp');
  });

  it('rejects duplicates', async () => {
    await createProfile('default', 'pp', { filePath });
    await expect(createProfile('default', 'pp', { filePath })).rejects.toThrow(/already exists/);
  });

  it('rejects empty passphrases', async () => {
    await expect(createProfile('default', '', { filePath })).rejects.toThrow(/passphrase/);
  });

  it('rejects invalid names', async () => {
    await expect(createProfile('bad name!', 'pp', { filePath })).rejects.toThrow(/invalid profile name/);
  });

  it('lists profiles sorted', async () => {
    await createProfile('zeta', 'pp', { filePath });
    await createProfile('alpha', 'pp', { filePath });
    expect(await listProfiles({ filePath })).toEqual(['alpha', 'zeta']);
  });
});

describe('profile-store.isValidProfileName', () => {
  it.each([
    ['default', true],
    ['work_1', true],
    ['my.profile', true],
    ['x-y', true],
    ['', false],
    ['bad name', false],
    ['weird/path', false],
    ['a'.repeat(65), false],
  ])('isValidProfileName(%j) = %s', (name, ok) => {
    expect(isValidProfileName(name)).toBe(ok);
  });
});

describe('profile-store.getProfile', () => {
  it('returns null for unknown profile', async () => {
    expect(await getProfile('nope', { filePath })).toBeNull();
  });
});
