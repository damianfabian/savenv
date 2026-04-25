import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readhidevarsFile, hidevarsFilePath, writehidevarsFile } from './hidevars-file';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hidevars-pointer-'));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('hidevars-file', () => {
  it('returns null when missing', async () => {
    expect(await readhidevarsFile(tmpDir)).toBeNull();
  });

  it('round-trips a profile pointer', async () => {
    await writehidevarsFile(tmpDir, { profile: 'work' });
    const back = await readhidevarsFile(tmpDir);
    expect(back).toEqual({ profile: 'work' });
  });

  it('writes the documented header + profile= line', async () => {
    await writehidevarsFile(tmpDir, { profile: 'default' });
    const raw = await fs.readFile(hidevarsFilePath(tmpDir), 'utf8');
    expect(raw).toBe('# SaveEnv Profile\nprofile=default\n');
  });

  it('rejects an invalid profile name on write', async () => {
    await expect(writehidevarsFile(tmpDir, { profile: 'bad name' })).rejects.toThrow(/invalid profile/);
  });

  it('rejects an invalid profile name on read', async () => {
    await fs.writeFile(hidevarsFilePath(tmpDir), 'profile=bad name\n');
    await expect(readhidevarsFile(tmpDir)).rejects.toThrow(/invalid profile/);
  });

  it('throws when no profile= line is present', async () => {
    await fs.writeFile(hidevarsFilePath(tmpDir), '# only a comment\n');
    await expect(readhidevarsFile(tmpDir)).rejects.toThrow(/missing/);
  });

  it('ignores extra comments and blank lines', async () => {
    await fs.writeFile(
      hidevarsFilePath(tmpDir),
      '# header\n\n# more\nprofile=work\n# trailing\n',
    );
    expect((await readhidevarsFile(tmpDir))?.profile).toBe('work');
  });
});
