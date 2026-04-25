import { describe, it, expect } from 'vitest';
import {
  PAYLOAD_VERSION,
  IV_LENGTH,
  TAG_LENGTH,
  KEY_LENGTH,
  decodePayload,
  decryptValue,
  deriveKey,
  encodePayload,
  encryptValue,
  generateSalt,
  isEncryptableMode,
} from './crypto';

const PASSPHRASE = 'correct horse battery staple';

function key(): Buffer {
  // Fixed salt so tests are deterministic-ish (key only).
  const salt = Buffer.alloc(16, 0x42);
  return deriveKey(PASSPHRASE, salt);
}

describe('crypto.deriveKey', () => {
  it('produces a 32-byte key', () => {
    expect(key().length).toBe(KEY_LENGTH);
  });

  it('is deterministic for same passphrase + salt', () => {
    expect(key().equals(key())).toBe(true);
  });

  it('differs for different salts', () => {
    const a = deriveKey(PASSPHRASE, Buffer.alloc(16, 0x01));
    const b = deriveKey(PASSPHRASE, Buffer.alloc(16, 0x02));
    expect(a.equals(b)).toBe(false);
  });
});

describe('crypto.generateSalt', () => {
  it('returns 16 random bytes; consecutive calls differ', () => {
    const a = generateSalt();
    const b = generateSalt();
    expect(a.length).toBe(16);
    expect(b.length).toBe(16);
    expect(a.equals(b)).toBe(false);
  });
});

describe('crypto.encryptValue / decryptValue', () => {
  it('round-trips a plaintext value (mode m)', () => {
    const k = key();
    const payload = encryptValue('hello world', k, 'm');
    const { plaintext, mode } = decryptValue(payload, k);
    expect(plaintext).toBe('hello world');
    expect(mode).toBe('m');
  });

  it('round-trips with mode p', () => {
    const k = key();
    const payload = encryptValue('s3cret', k, 'p');
    const { plaintext, mode } = decryptValue(payload, k);
    expect(plaintext).toBe('s3cret');
    expect(mode).toBe('p');
  });

  it('produces a different ciphertext for the same input each call (random IV)', () => {
    const k = key();
    const a = encryptValue('same', k, 'm');
    const b = encryptValue('same', k, 'm');
    expect(a).not.toBe(b);
  });

  it('handles unicode plaintext', () => {
    const k = key();
    const payload = encryptValue('héllo 🌮 — naïve', k, 'm');
    expect(decryptValue(payload, k).plaintext).toBe('héllo 🌮 — naïve');
  });

  it('fails authentication if the ciphertext is tampered with', () => {
    const k = key();
    const payload = encryptValue('abc', k, 'm');
    const buf = Buffer.from(payload, 'base64');
    buf[buf.length - 1] = buf[buf.length - 1]! ^ 0x01;
    const tampered = buf.toString('base64');
    expect(() => decryptValue(tampered, k)).toThrow();
  });

  it('fails to decrypt with the wrong key', () => {
    const k = key();
    const payload = encryptValue('abc', k, 'm');
    const wrong = deriveKey(PASSPHRASE, Buffer.alloc(16, 0xff));
    expect(() => decryptValue(payload, wrong)).toThrow();
  });

  it('rejects keys of the wrong length', () => {
    expect(() => encryptValue('x', Buffer.alloc(31), 'm')).toThrow(/key/);
    expect(() => decryptValue('AAAA', Buffer.alloc(31))).toThrow(/key/);
  });
});

describe('crypto.encodePayload / decodePayload', () => {
  it('preserves all fields through a round-trip', () => {
    const original = {
      version: PAYLOAD_VERSION,
      mode: 'm' as const,
      iv: Buffer.alloc(IV_LENGTH, 0x11),
      tag: Buffer.alloc(TAG_LENGTH, 0x22),
      ciphertext: Buffer.from('opaque'),
    };
    const decoded = decodePayload(encodePayload(original));
    expect(decoded.version).toBe(original.version);
    expect(decoded.mode).toBe(original.mode);
    expect(decoded.iv.equals(original.iv)).toBe(true);
    expect(decoded.tag.equals(original.tag)).toBe(true);
    expect(decoded.ciphertext.equals(original.ciphertext)).toBe(true);
  });

  it('rejects payloads shorter than the header', () => {
    const tiny = Buffer.alloc(5).toString('base64');
    expect(() => decodePayload(tiny)).toThrow(/too short/);
  });

  it('rejects an unknown version byte', () => {
    const buf = Buffer.concat([
      Buffer.from([0xff, 0x6d]),
      Buffer.alloc(IV_LENGTH),
      Buffer.alloc(TAG_LENGTH),
    ]);
    expect(() => decodePayload(buf.toString('base64'))).toThrow(/version/);
  });

  it('rejects an unknown mode byte', () => {
    const buf = Buffer.concat([
      Buffer.from([PAYLOAD_VERSION, 0x5a]),
      Buffer.alloc(IV_LENGTH),
      Buffer.alloc(TAG_LENGTH),
    ]);
    expect(() => decodePayload(buf.toString('base64'))).toThrow(/mode byte/);
  });
});

describe('crypto.isEncryptableMode', () => {
  it('returns true for p and m, false for o', () => {
    expect(isEncryptableMode('p')).toBe(true);
    expect(isEncryptableMode('m')).toBe(true);
    expect(isEncryptableMode('o')).toBe(false);
  });
});
