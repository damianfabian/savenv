import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  deleteEntry,
  findEntryIndex,
  getEntries,
  parseEnv,
  readEnvFile,
  serializeEnv,
  setEncryptedEntry,
  setPlainEntry,
  writeEnvFile,
} from './env-file';

describe('env-file.parseEnv', () => {
  it('parses plain entries', () => {
    const lines = parseEnv('FOO=bar\nBAZ=qux');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ type: 'entry', kind: 'plain', name: 'FOO', value: 'bar' });
    expect(lines[1]).toMatchObject({ type: 'entry', kind: 'plain', name: 'BAZ', value: 'qux' });
  });

  it('parses encrypted entries', () => {
    const lines = parseEnv("API_KEY=savenv('AbCdEf==')");
    expect(lines[0]).toMatchObject({
      type: 'entry',
      kind: 'encrypted',
      name: 'API_KEY',
      payload: 'AbCdEf==',
    });
  });

  it('handles comments and blank lines', () => {
    const lines = parseEnv('# header\n\nFOO=1');
    expect(lines.map((l) => l.type)).toEqual(['comment', 'blank', 'entry']);
  });

  it('handles empty values', () => {
    const lines = parseEnv('FOO=');
    expect(lines[0]).toMatchObject({ type: 'entry', kind: 'plain', name: 'FOO', value: '' });
  });

  it('strips matching surrounding quotes', () => {
    const lines = parseEnv('A="hello world"\nB=\'x\'');
    expect((lines[0] as { value: string }).value).toBe('hello world');
    expect((lines[1] as { value: string }).value).toBe('x');
  });

  it('treats malformed lines (no =, bad name) as comments', () => {
    const lines = parseEnv('not-a-line\n9BAD=oops');
    expect(lines[0]?.type).toBe('comment');
    expect(lines[1]?.type).toBe('comment');
  });

  it('accepts CRLF line endings', () => {
    const lines = parseEnv('A=1\r\nB=2\r\n');
    expect(lines).toHaveLength(2);
  });

  it('ignores a single trailing newline (no phantom blank)', () => {
    const lines = parseEnv('A=1\n');
    expect(lines).toHaveLength(1);
  });
});

describe('env-file.serializeEnv', () => {
  it('round-trips structure for plain + encrypted + comments', () => {
    const src = "# top\nFOO=bar\nAPI_KEY=savenv('XYZ')\n";
    const out = serializeEnv(parseEnv(src));
    expect(out).toBe(src);
  });

  it('always ends with a single trailing newline', () => {
    expect(serializeEnv(parseEnv('A=1'))).toBe('A=1\n');
  });
});

describe('env-file mutation helpers', () => {
  it('setPlainEntry appends when missing', () => {
    const after = setPlainEntry(parseEnv('A=1'), 'B', '2');
    expect(getEntries(after)).toHaveLength(2);
    expect(serializeEnv(after)).toBe('A=1\nB=2\n');
  });

  it('setPlainEntry replaces in place when present', () => {
    const after = setPlainEntry(parseEnv('A=1\nB=2'), 'A', '99');
    expect(serializeEnv(after)).toBe('A=99\nB=2\n');
  });

  it('setEncryptedEntry replaces a plain entry with encrypted form', () => {
    const after = setEncryptedEntry(parseEnv('A=1'), 'A', 'CIPHER');
    expect(serializeEnv(after)).toBe("A=savenv('CIPHER')\n");
  });

  it('deleteEntry removes the matching line', () => {
    const after = deleteEntry(parseEnv('A=1\nB=2'), 'A');
    expect(serializeEnv(after)).toBe('B=2\n');
  });

  it('deleteEntry is a no-op for unknown names', () => {
    const before = parseEnv('A=1');
    const after = deleteEntry(before, 'X');
    expect(after).toBe(before);
  });

  it('findEntryIndex returns -1 for missing names', () => {
    expect(findEntryIndex(parseEnv('A=1'), 'X')).toBe(-1);
  });

  it('rejects invalid names on upsert', () => {
    expect(() => setPlainEntry([], 'bad name', 'x')).toThrow(/invalid variable name/);
  });
});

describe('env-file file IO', () => {
  let tmpDir: string;
  let envPath: string;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'savenv-env-'));
    envPath = path.join(tmpDir, '.env');
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('readEnvFile returns [] when file is missing', async () => {
    expect(await readEnvFile(envPath)).toEqual([]);
  });

  it('round-trips through writeEnvFile/readEnvFile', async () => {
    const lines = parseEnv("# header\nFOO=bar\nAPI_KEY=savenv('CIPHER')\n");
    await writeEnvFile(envPath, lines);
    const back = await readEnvFile(envPath);
    expect(serializeEnv(back)).toBe(serializeEnv(lines));
  });
});
