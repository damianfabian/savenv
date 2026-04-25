import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInit, type Prompter } from './init';
import { runSet, parseNameSpec } from './set';
import { runGet } from './get';
import { runDel } from './del';
import { runList } from './list';

let tmpDir: string;
let projectDir: string;
let profilesFile: string;

const baseEnv = { envsafe_PROFILE: undefined } as NodeJS.ProcessEnv;

const prompter: Prompter = {
  pickOrCreateProfile: async () => ({ kind: 'create' }),
  newProfileName: async () => 'default',
  newPassphrase: async () => 'pp',
  confirmSwitchProfile: async () => true,
};

async function bootstrap(): Promise<void> {
  await runInit({ cwd: projectDir, profilesFile, prompter });
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'envsafe-cmds-'));
  projectDir = path.join(tmpDir, 'project');
  profilesFile = path.join(tmpDir, 'profiles.json');
  await fs.mkdir(projectDir, { recursive: true });
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('parseNameSpec', () => {
  it('defaults to mode m when no colon is given', () => {
    expect(parseNameSpec('FOO')).toEqual({ name: 'FOO', mode: 'm' });
  });
  it.each([['p'], ['m'], ['o']])('accepts mode %s', (m) => {
    expect(parseNameSpec(`FOO:${m}`).mode).toBe(m);
  });
  it('rejects unknown modes', () => {
    expect(() => parseNameSpec('FOO:x')).toThrow(/invalid display mode/);
  });
  it('rejects multi-char mode', () => {
    expect(() => parseNameSpec('FOO:pm')).toThrow(/invalid display mode/);
  });
  it('rejects bad names', () => {
    expect(() => parseNameSpec('9bad')).toThrow(/invalid variable name/);
  });
  it('rejects empty mode after colon', () => {
    expect(() => parseNameSpec('FOO:')).toThrow(/expected display mode/);
  });
});

describe('runSet', () => {
  it('writes encrypted entry by default (mode m) and round-trips via runGet', async () => {
    await bootstrap();
    await runSet({ spec: 'API_KEY', value: 's3cret', cwd: projectDir, profilesFile, env: baseEnv });
    const env = await fs.readFile(path.join(projectDir, '.env'), 'utf8');
    expect(env).toMatch(/API_KEY=envsafe\('/);
    const value = await runGet({ name: 'API_KEY', cwd: projectDir, profilesFile, env: baseEnv });
    expect(value).toBe('s3cret');
  });

  it('writes plaintext for mode o', async () => {
    await bootstrap();
    await runSet({ spec: 'PUBLIC:o', value: 'visible', cwd: projectDir, profilesFile, env: baseEnv });
    const env = await fs.readFile(path.join(projectDir, '.env'), 'utf8');
    expect(env).toContain('PUBLIC=visible');
    expect(env).not.toMatch(/PUBLIC=envsafe/);
  });

  it('updates an existing variable in place (re-encrypts, switches mode)', async () => {
    await bootstrap();
    await runSet({ spec: 'X', value: 'one', cwd: projectDir, profilesFile, env: baseEnv });
    await runSet({ spec: 'X:p', value: 'two', cwd: projectDir, profilesFile, env: baseEnv });
    expect(await runGet({ name: 'X', cwd: projectDir, profilesFile, env: baseEnv })).toBe('two');
    const items = await runList({ cwd: projectDir, profilesFile, env: baseEnv });
    expect(items.find((i) => i.name === 'X')?.mode).toBe('p');
  });

  it('returns created=true the first time and false on update', async () => {
    await bootstrap();
    expect((await runSet({ spec: 'A', value: '1', cwd: projectDir, profilesFile, env: baseEnv })).created).toBe(true);
    expect((await runSet({ spec: 'A', value: '2', cwd: projectDir, profilesFile, env: baseEnv })).created).toBe(false);
  });
});

describe('runGet', () => {
  it('throws when variable is missing', async () => {
    await bootstrap();
    await expect(runGet({ name: 'NOPE', cwd: projectDir, profilesFile, env: baseEnv })).rejects.toThrow(/not found/);
  });

  it('returns plain values without needing a session', async () => {
    await bootstrap();
    await runSet({ spec: 'P:o', value: 'visible', cwd: projectDir, profilesFile, env: baseEnv });
    expect(await runGet({ name: 'P', cwd: projectDir, profilesFile, env: baseEnv })).toBe('visible');
  });
});

describe('runDel', () => {
  it('removes a variable', async () => {
    await bootstrap();
    await runSet({ spec: 'X', value: '1', cwd: projectDir, profilesFile, env: baseEnv });
    await runDel({ name: 'X', cwd: projectDir });
    const env = await fs.readFile(path.join(projectDir, '.env'), 'utf8');
    expect(env).not.toContain('X=');
  });

  it('throws when variable is absent', async () => {
    await bootstrap();
    await expect(runDel({ name: 'GHOST', cwd: projectDir })).rejects.toThrow(/not found/);
  });
});

describe('runList', () => {
  it('renders modes correctly', async () => {
    await bootstrap();
    await runSet({ spec: 'PUB:o', value: 'visible', cwd: projectDir, profilesFile, env: baseEnv });
    await runSet({ spec: 'MASK', value: 'hello', cwd: projectDir, profilesFile, env: baseEnv });
    await runSet({ spec: 'PROT:p', value: 'topsecret', cwd: projectDir, profilesFile, env: baseEnv });

    const items = await runList({ cwd: projectDir, profilesFile, env: baseEnv });
    const byName = Object.fromEntries(items.map((i) => [i.name, i]));
    expect(byName.PUB).toMatchObject({ mode: 'o', display: 'visible' });
    expect(byName.MASK).toMatchObject({ mode: 'm', display: 'hel*******' });
    expect(byName.PROT).toMatchObject({ mode: 'p', display: '**********' });
  });

  it('marks entries as <unavailable> when session cannot be opened', async () => {
    await bootstrap();
    await runSet({ spec: 'A', value: 'x', cwd: projectDir, profilesFile, env: baseEnv });
    // Point the pointer at a non-existent profile.
    await fs.writeFile(path.join(projectDir, '.envsafe'), 'profile=missing\n');
    const items = await runList({ cwd: projectDir, profilesFile, env: baseEnv });
    expect(items[0]?.display).toBe('<unavailable>');
    expect(items[0]?.error).toBeDefined();
  });

  it('still lists plain entries even when session fails', async () => {
    await bootstrap();
    await runSet({ spec: 'PUB:o', value: 'visible', cwd: projectDir, profilesFile, env: baseEnv });
    await fs.writeFile(path.join(projectDir, '.envsafe'), 'profile=missing\n');
    const items = await runList({ cwd: projectDir, profilesFile, env: baseEnv });
    expect(items.find((i) => i.name === 'PUB')?.display).toBe('visible');
  });
});
