import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

export const PAYLOAD_VERSION = 0x01;
export const KEY_LENGTH = 32;
export const IV_LENGTH = 12;
export const TAG_LENGTH = 16;
export const SALT_LENGTH = 16;

export const SCRYPT_PARAMS = { N: 1 << 15, r: 8, p: 1 } as const;

export type DisplayMode = 'p' | 'm' | 'o';
const ENCRYPTABLE_MODES: ReadonlySet<DisplayMode> = new Set(['p', 'm']);

export interface EncryptedPayload {
  version: number;
  mode: 'p' | 'm';
  iv: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
}

export function generateSalt(): Buffer {
  return randomBytes(SALT_LENGTH);
}

export function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LENGTH, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    maxmem: 128 * SCRYPT_PARAMS.N * SCRYPT_PARAMS.r * 2,
  });
}

export function encryptValue(
  plaintext: string,
  key: Buffer,
  mode: 'p' | 'm',
): string {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`key must be ${KEY_LENGTH} bytes`);
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return encodePayload({ version: PAYLOAD_VERSION, mode, iv, tag, ciphertext });
}

export function decryptValue(payloadB64: string, key: Buffer): { plaintext: string; mode: 'p' | 'm' } {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`key must be ${KEY_LENGTH} bytes`);
  }
  const payload = decodePayload(payloadB64);
  const decipher = createDecipheriv('aes-256-gcm', key, payload.iv);
  decipher.setAuthTag(payload.tag);
  const plaintext = Buffer.concat([
    decipher.update(payload.ciphertext),
    decipher.final(),
  ]).toString('utf8');
  return { plaintext, mode: payload.mode };
}

export function encodePayload(p: EncryptedPayload): string {
  if (p.iv.length !== IV_LENGTH) {
    throw new Error(`iv must be ${IV_LENGTH} bytes`);
  }
  if (p.tag.length !== TAG_LENGTH) {
    throw new Error(`tag must be ${TAG_LENGTH} bytes`);
  }
  const modeByte = modeToByte(p.mode);
  const buf = Buffer.concat([
    Buffer.from([p.version, modeByte]),
    p.iv,
    p.tag,
    p.ciphertext,
  ]);
  return buf.toString('base64');
}

export function decodePayload(b64: string): EncryptedPayload {
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    throw new Error('invalid base64 payload');
  }
  const headerLen = 2 + IV_LENGTH + TAG_LENGTH;
  if (buf.length < headerLen) {
    throw new Error('payload too short');
  }
  const version = buf[0]!;
  if (version !== PAYLOAD_VERSION) {
    throw new Error(`unsupported payload version: ${version}`);
  }
  const mode = byteToMode(buf[1]!);
  const iv = buf.subarray(2, 2 + IV_LENGTH);
  const tag = buf.subarray(2 + IV_LENGTH, headerLen);
  const ciphertext = buf.subarray(headerLen);
  return { version, mode, iv, tag, ciphertext };
}

export function isEncryptableMode(mode: DisplayMode): mode is 'p' | 'm' {
  return ENCRYPTABLE_MODES.has(mode);
}

function modeToByte(mode: 'p' | 'm'): number {
  if (mode === 'p') return 0x70;
  if (mode === 'm') return 0x6d;
  throw new Error(`invalid encryptable mode: ${mode as string}`);
}

function byteToMode(b: number): 'p' | 'm' {
  if (b === 0x70) return 'p';
  if (b === 0x6d) return 'm';
  throw new Error(`invalid mode byte: 0x${b.toString(16)}`);
}
