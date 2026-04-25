import { promises as fs } from 'node:fs';

export type EntryKind = 'plain' | 'encrypted';

export interface PlainEntry {
  type: 'entry';
  kind: 'plain';
  name: string;
  value: string;
  raw: string;
}

export interface EncryptedEntry {
  type: 'entry';
  kind: 'encrypted';
  name: string;
  payload: string;
  raw: string;
}

export interface CommentLine {
  type: 'comment';
  raw: string;
}

export interface BlankLine {
  type: 'blank';
  raw: string;
}

export type EnvLine = PlainEntry | EncryptedEntry | CommentLine | BlankLine;
export type Entry = PlainEntry | EncryptedEntry;

const envsafe_PATTERN = /^envsafe\(\s*'([^']*)'\s*\)$/;
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseEnv(content: string): EnvLine[] {
  const lines = content.split(/\r?\n/);
  // Drop a trailing empty string produced by a final newline.
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.map(parseLine);
}

function parseLine(raw: string): EnvLine {
  const trimmed = raw.trim();
  if (trimmed === '') return { type: 'blank', raw };
  if (trimmed.startsWith('#')) return { type: 'comment', raw };

  const eqIndex = raw.indexOf('=');
  if (eqIndex < 0) return { type: 'comment', raw };

  const name = raw.slice(0, eqIndex).trim();
  if (!NAME_PATTERN.test(name)) return { type: 'comment', raw };

  const valueRaw = raw.slice(eqIndex + 1).trim();
  const envsafeMatch = envsafe_PATTERN.exec(valueRaw);
  if (envsafeMatch) {
    return {
      type: 'entry',
      kind: 'encrypted',
      name,
      payload: envsafeMatch[1] ?? '',
      raw,
    };
  }
  return {
    type: 'entry',
    kind: 'plain',
    name,
    value: stripQuotes(valueRaw),
    raw,
  };
}

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

export function serializeEnv(lines: EnvLine[]): string {
  return lines.map(lineToString).join('\n') + '\n';
}

function lineToString(line: EnvLine): string {
  switch (line.type) {
    case 'blank':
    case 'comment':
      return line.raw;
    case 'entry':
      if (line.kind === 'plain') {
        return `${line.name}=${line.value}`;
      }
      return `${line.name}=envsafe('${line.payload}')`;
  }
}

export function findEntryIndex(lines: EnvLine[], name: string): number {
  return lines.findIndex(
    (l) => l.type === 'entry' && (l as Entry).name === name,
  );
}

export function getEntries(lines: EnvLine[]): Entry[] {
  return lines.filter((l): l is Entry => l.type === 'entry');
}

export function setPlainEntry(lines: EnvLine[], name: string, value: string): EnvLine[] {
  return upsertEntry(lines, name, { type: 'entry', kind: 'plain', name, value, raw: '' });
}

export function setEncryptedEntry(
  lines: EnvLine[],
  name: string,
  payload: string,
): EnvLine[] {
  return upsertEntry(lines, name, {
    type: 'entry',
    kind: 'encrypted',
    name,
    payload,
    raw: '',
  });
}

export function deleteEntry(lines: EnvLine[], name: string): EnvLine[] {
  const idx = findEntryIndex(lines, name);
  if (idx < 0) return lines;
  return [...lines.slice(0, idx), ...lines.slice(idx + 1)];
}

function upsertEntry(lines: EnvLine[], name: string, entry: Entry): EnvLine[] {
  if (!NAME_PATTERN.test(name)) {
    throw new Error(`invalid variable name: "${name}"`);
  }
  const idx = findEntryIndex(lines, name);
  // Re-derive raw via serializeEnv at write-time; keep it empty here.
  if (idx < 0) return [...lines, entry];
  const next = [...lines];
  next[idx] = entry;
  return next;
}

export async function readEnvFile(filePath: string): Promise<EnvLine[]> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return parseEnv(raw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export async function writeEnvFile(filePath: string, lines: EnvLine[]): Promise<void> {
  await fs.writeFile(filePath, serializeEnv(lines), 'utf8');
}
