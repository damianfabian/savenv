import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { load } from './index';
import { encryptValue, deriveKey } from './crypto';
import { createProfile } from './profile-store';
import { writeSavenvFile } from './savenv-file';

let tmpDir: string;
let projectDir: string;
let profilesPath: string;

async function bootstrap(profileName: string, passphrase: string): Promise<{ key: Buffer }> {
  await createProfile(profileName, passphrase, { filePath: profilesPath });
  await writeSavenvFile(projectDir, { profile: profileName });
  // Mirror the salt the store generated so we can encrypt fixtures.
  const file = JSON.parse(await fs.readFile(profilesPath, 'utf8')) as {
    profiles: Record<string, { salt: string }>;
  };
  const entry = file.profiles[profileName];
  if (!entry) throw new Error('profile missing after create');
  return { key: deriveKey(passphrase, Buffer.from(entry.salt, 'base64')) };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'savenv-load-'));
  projectDir = path.join(tmpDir, 'project');
  profilesPath = path.join(tmpDir, 'profiles.json');
  await fs.mkdir(projectDir, { recursive: true });
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('savenv.load', () => {
  it('returns empty result when .env is missing', async () => {
    const target: NodeJS.ProcessEnv = {};
    const result = await load({ cwd: projectDir, env: target, warn: () => {} });
    expect(result).toEqual({ loaded: [], failed: [] });
    expect(target).toEqual({});
  });

  it('loads plain entries even when no profile is configured', async () => {
    await fs.writeFile(path.join(projectDir, '.env'), 'PLAIN=value\n');
    const target: NodeJS.ProcessEnv = {};
    const result = await load({ cwd: projectDir, env: target, warn: () => {} });
    expect(result.loaded).toEqual(['PLAIN']);
    expect(target.PLAIN).toBe('value');
  });

  it('decrypts encrypted entries using the active profile', async () => {
    const { key } = await bootstrap('default', 'pp');
    const payload = encryptValue('s3cret', key, 'm');
    await fs.writeFile(path.join(projectDir, '.env'), `PLAIN=ok\nAPI=savenv('${payload}')\n`);

    const target: NodeJS.ProcessEnv = {};
    const result = await load({
      cwd: projectDir,
      env: target,
      profilesFile: profilesPath,
      warn: () => {},
    });
    expect(result.loaded.sort()).toEqual(['API', 'PLAIN']);
    expect(result.failed).toEqual([]);
    expect(target.PLAIN).toBe('ok');
    expect(target.API).toBe('s3cret');
  });

  it('warns and skips a single corrupt encrypted entry but loads the rest', async () => {
    const { key } = await bootstrap('default', 'pp');
    const good = encryptValue('hello', key, 'm');
    await fs.writeFile(
      path.join(projectDir, '.env'),
      `OK=savenv('${good}')\nBAD=savenv('not-real-base64!@#')\n`,
    );
    const warnings: string[] = [];
    const target: NodeJS.ProcessEnv = {};
    const result = await load({
      cwd: projectDir,
      env: target,
      profilesFile: profilesPath,
      warn: (m) => warnings.push(m),
    });
    expect(result.loaded).toEqual(['OK']);
    expect(result.failed).toEqual(['BAD']);
    expect(target.OK).toBe('hello');
    expect(target.BAD).toBeUndefined();
    expect(warnings.some((w) => /BAD/.test(w))).toBe(true);
  });

  it('honours SAVENV_PROFILE env override', async () => {
    const { key } = await bootstrap('work', 'pp');
    const payload = encryptValue('value-from-work', key, 'm');
    // Pointer file points at "default" but env var redirects to "work".
    await writeSavenvFile(projectDir, { profile: 'default' });
    await fs.writeFile(path.join(projectDir, '.env'), `K=savenv('${payload}')\n`);

    const target: NodeJS.ProcessEnv = { SAVENV_PROFILE: 'work' };
    const result = await load({
      cwd: projectDir,
      env: target,
      profilesFile: profilesPath,
      warn: () => {},
    });
    expect(result.loaded).toEqual(['K']);
    expect(target.K).toBe('value-from-work');
  });

  it('warns and skips encrypted entries when profile cannot be resolved', async () => {
    await fs.writeFile(path.join(projectDir, '.env'), "API=savenv('garbage')\n");
    const warnings: string[] = [];
    const target: NodeJS.ProcessEnv = {};
    const result = await load({
      cwd: projectDir,
      env: target,
      warn: (m) => warnings.push(m),
    });
    expect(result.loaded).toEqual([]);
    expect(result.failed).toEqual(['API']);
    expect(warnings.some((w) => /savenv init/.test(w) || /encrypted/.test(w))).toBe(true);
    expect(target.API).toBeUndefined();
  });
});
