import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureGitignore } from './gitignore';

let tmpDir: string;
const gitignorePath = () => path.join(tmpDir, '.gitignore');

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'savenv-gitignore-'));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('gitignore.ensureGitignore', () => {
  it('creates the file when missing and adds both entries', async () => {
    const { added } = await ensureGitignore(tmpDir);
    expect(added).toEqual(['.env', '.savenv']);
    const content = await fs.readFile(gitignorePath(), 'utf8');
    expect(content).toContain('.env');
    expect(content).toContain('.savenv');
  });

  it('appends only what is missing', async () => {
    await fs.writeFile(gitignorePath(), 'node_modules\n.env\n');
    const { added } = await ensureGitignore(tmpDir);
    expect(added).toEqual(['.savenv']);
    const content = await fs.readFile(gitignorePath(), 'utf8');
    expect(content.match(/^\.env$/gm)).toHaveLength(1);
    expect(content).toContain('.savenv');
  });

  it('does nothing when both entries already present', async () => {
    await fs.writeFile(gitignorePath(), '.env\n.savenv\n');
    const before = await fs.readFile(gitignorePath(), 'utf8');
    const { added } = await ensureGitignore(tmpDir);
    expect(added).toEqual([]);
    expect(await fs.readFile(gitignorePath(), 'utf8')).toBe(before);
  });

  it('handles a file without trailing newline', async () => {
    await fs.writeFile(gitignorePath(), 'node_modules');
    const { added } = await ensureGitignore(tmpDir);
    expect(added).toEqual(['.env', '.savenv']);
    const content = await fs.readFile(gitignorePath(), 'utf8');
    expect(content.startsWith('node_modules\n')).toBe(true);
  });

  it('ignores commented-out entries when deciding what to add', async () => {
    await fs.writeFile(gitignorePath(), '# .env\n# .savenv\n');
    const { added } = await ensureGitignore(tmpDir);
    expect(added).toEqual(['.env', '.savenv']);
  });
});
