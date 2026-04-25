import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type Prompter, runInit } from './init';
import { load } from '../index';
import { readenvsafeFile } from '../envsafe-file';

let tmpDir: string;
let projectDir: string;
let profilesFile: string;

function makePrompter(overrides: Partial<Prompter>): Prompter {
  return {
    pickOrCreateProfile: async () => ({ kind: 'create' }),
    newProfileName: async () => 'default',
    newPassphrase: async () => 'pp',
    confirmSwitchProfile: async () => true,
    ...overrides,
  };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'envsafe-init-'));
  projectDir = path.join(tmpDir, 'project');
  profilesFile = path.join(tmpDir, 'profiles.json');
  await fs.mkdir(projectDir, { recursive: true });
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('runInit (fresh project, no .env)', () => {
  it('creates profile, .envsafe pointer, .gitignore, and .env template', async () => {
    const result = await runInit({
      cwd: projectDir,
      profilesFile,
      prompter: makePrompter({}),
    });
    expect(result).toMatchObject({
      profile: 'default',
      createdProfile: true,
      envCreated: true,
      envMigrated: 0,
    });
    expect(result.gitignoreAdded).toEqual(['.env', '.envsafe']);

    expect((await readenvsafeFile(projectDir))?.profile).toBe('default');
    const envContent = await fs.readFile(path.join(projectDir, '.env'), 'utf8');
    expect(envContent).toContain('# Environment Variables');
    const gi = await fs.readFile(path.join(projectDir, '.gitignore'), 'utf8');
    expect(gi).toContain('.env');
    expect(gi).toContain('.envsafe');
  });
});

describe('runInit (migrate existing .env)', () => {
  it('encrypts every value and removes the .bak file on success', async () => {
    await fs.writeFile(
      path.join(projectDir, '.env'),
      '# header\nFOO=bar\nAPI_KEY=s3cret\nEMPTY=\n',
    );
    const result = await runInit({
      cwd: projectDir,
      profilesFile,
      prompter: makePrompter({}),
    });
    expect(result.envMigrated).toBe(2);

    const envContent = await fs.readFile(path.join(projectDir, '.env'), 'utf8');
    expect(envContent).toContain("FOO=envsafe('");
    expect(envContent).toContain("API_KEY=envsafe('");
    expect(envContent).toContain('EMPTY=');
    expect(envContent).toContain('# header');

    await expect(fs.access(path.join(projectDir, '.env.bak'))).rejects.toThrow();

    // Round-trip via load() to confirm decryption.
    const target: NodeJS.ProcessEnv = {};
    await load({ cwd: projectDir, env: target, profilesFile, warn: () => {} });
    expect(target.FOO).toBe('bar');
    expect(target.API_KEY).toBe('s3cret');
  });
});

describe('runInit (re-init / switch profile)', () => {
  it('prompts to switch and updates the .envsafe pointer', async () => {
    await runInit({
      cwd: projectDir,
      profilesFile,
      prompter: makePrompter({ newProfileName: async () => 'first' }),
    });
    expect((await readenvsafeFile(projectDir))?.profile).toBe('first');

    await runInit({
      cwd: projectDir,
      profilesFile,
      prompter: makePrompter({
        confirmSwitchProfile: async () => true,
        pickOrCreateProfile: async () => ({ kind: 'create' }),
        newProfileName: async () => 'second',
      }),
    });
    expect((await readenvsafeFile(projectDir))?.profile).toBe('second');
  });

  it('keeps the existing profile when user declines to switch', async () => {
    await runInit({
      cwd: projectDir,
      profilesFile,
      prompter: makePrompter({ newProfileName: async () => 'first' }),
    });
    const before = await fs.readFile(path.join(projectDir, '.env'), 'utf8');

    const result = await runInit({
      cwd: projectDir,
      profilesFile,
      prompter: makePrompter({ confirmSwitchProfile: async () => false }),
    });
    expect(result.profile).toBe('first');
    expect(result.createdProfile).toBe(false);
    // .env untouched.
    const after = await fs.readFile(path.join(projectDir, '.env'), 'utf8');
    expect(after).toBe(before);
  });

  it('lets the user pick an existing profile', async () => {
    await runInit({
      cwd: projectDir,
      profilesFile,
      prompter: makePrompter({ newProfileName: async () => 'work' }),
    });
    // Simulate a different project picking the existing "work" profile.
    const projectB = path.join(tmpDir, 'projectB');
    await fs.mkdir(projectB);
    const result = await runInit({
      cwd: projectB,
      profilesFile,
      prompter: makePrompter({
        pickOrCreateProfile: async (existing) => {
          expect(existing).toContain('work');
          return { kind: 'pick', name: 'work' };
        },
      }),
    });
    expect(result.profile).toBe('work');
    expect(result.createdProfile).toBe(false);
  });
});
