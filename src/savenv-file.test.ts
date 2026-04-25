import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSavenvFile, savenvFilePath, writeSavenvFile } from './savenv-file';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'savenv-pointer-'));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('savenv-file', () => {
  it('returns null when missing', async () => {
    expect(await readSavenvFile(tmpDir)).toBeNull();
  });

  it('round-trips a profile pointer', async () => {
    await writeSavenvFile(tmpDir, { profile: 'work' });
    const back = await readSavenvFile(tmpDir);
    expect(back).toEqual({ profile: 'work' });
  });

  it('writes the documented header + profile= line', async () => {
    await writeSavenvFile(tmpDir, { profile: 'default' });
    const raw = await fs.readFile(savenvFilePath(tmpDir), 'utf8');
    expect(raw).toBe('# SaveEnv Profile\nprofile=default\n');
  });

  it('rejects an invalid profile name on write', async () => {
    await expect(writeSavenvFile(tmpDir, { profile: 'bad name' })).rejects.toThrow(/invalid profile/);
  });

  it('rejects an invalid profile name on read', async () => {
    await fs.writeFile(savenvFilePath(tmpDir), 'profile=bad name\n');
    await expect(readSavenvFile(tmpDir)).rejects.toThrow(/invalid profile/);
  });

  it('throws when no profile= line is present', async () => {
    await fs.writeFile(savenvFilePath(tmpDir), '# only a comment\n');
    await expect(readSavenvFile(tmpDir)).rejects.toThrow(/missing/);
  });

  it('ignores extra comments and blank lines', async () => {
    await fs.writeFile(
      savenvFilePath(tmpDir),
      '# header\n\n# more\nprofile=work\n# trailing\n',
    );
    expect((await readSavenvFile(tmpDir))?.profile).toBe('work');
  });
});
