/**
 * End-to-end integration tests.
 *
 * Each test:
 *   1. Provisions a temporary XDG_CONFIG_HOME so the global profile lookup
 *      hits a sandboxed profiles.json (no contact with the developer's real
 *      ~/.config/hidevars).
 *   2. Seeds a profile + derives its key via the same primitives the CLI uses.
 *   3. Writes a real `.env` (with `hidevars('...')` ciphertext) and a
 *      `.hidevars` pointer into the fixture project.
 *   4. Runs the consumer the way a real user would and asserts on output:
 *        - node-app: spawn `node index.js` as a child process.
 *        - vite-app: invoke vite.build() programmatically and inspect the
 *          emitted bundle for inlined plaintext.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { createProfile } from '../src/profile-store';
import { deriveKey, encryptValue } from '../src/crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NODE_APP = path.join(HERE, 'node-app');
const VITE_APP = path.join(HERE, 'vite-app');
const PROFILE_NAME = 'integration';
const PASSPHRASE = 'integration-test-pass';

let tmpHome: string;
let xdgConfig: string;
let profilesFile: string;
let key: Buffer;

async function seedProfile(): Promise<void> {
  const profile = await createProfile(PROFILE_NAME, PASSPHRASE, { filePath: profilesFile });
  key = deriveKey(profile.passphrase, Buffer.from(profile.salt, 'base64'));
}

function enc(value: string, mode: 'p' | 'm' = 'm'): string {
  return `hidevars('${encryptValue(value, key, mode)}')`;
}

async function writeFixture(dir: string, envContent: string): Promise<void> {
  await fs.writeFile(path.join(dir, '.env'), envContent, 'utf8');
  await fs.writeFile(path.join(dir, '.hidevars'), `profile=${PROFILE_NAME}\n`, 'utf8');
}

async function clearFixture(dir: string): Promise<void> {
  await fs.unlink(path.join(dir, '.env')).catch(() => {});
  await fs.unlink(path.join(dir, '.hidevars')).catch(() => {});
  await fs.rm(path.join(dir, 'dist'), { recursive: true, force: true });
}

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'hidevars-int-'));
  xdgConfig = path.join(tmpHome, 'config');
  profilesFile = path.join(xdgConfig, 'hidevars', 'profiles.json');
  await fs.mkdir(xdgConfig, { recursive: true });
  await seedProfile();
});

afterEach(async () => {
  await clearFixture(NODE_APP);
  await clearFixture(VITE_APP);
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe('node-app: hidevars.load() in a real Node process', () => {
  it('decrypts hidevars(...) entries and exposes plain values via process.env', () => {
    const envContent = [
      'PUBLIC_NAME=clear-text',
      `API_KEY=${enc('s3cret-api-key')}`,
      `DATABASE_URL=${enc('postgres://user:pw@db/app', 'p')}`,
      '',
    ].join('\n');

    return writeFixture(NODE_APP, envContent).then(() => {
      const result = spawnSync(process.execPath, ['index.js'], {
        cwd: NODE_APP,
        env: { ...process.env, XDG_CONFIG_HOME: xdgConfig, hidevars_PROFILE: '' },
        encoding: 'utf8',
      });

      if (result.status !== 0) {
        throw new Error(`node-app exited with ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
      }
      const parsed = JSON.parse(result.stdout) as {
        loaded: string[];
        failed: string[];
        values: Record<string, string | undefined>;
      };

      expect(parsed.failed).toEqual([]);
      expect(parsed.loaded.sort()).toEqual(['API_KEY', 'DATABASE_URL', 'PUBLIC_NAME']);
      expect(parsed.values).toEqual({
        API_KEY: 's3cret-api-key',
        DATABASE_URL: 'postgres://user:pw@db/app',
        PUBLIC_NAME: 'clear-text',
      });
    });
  });
});

describe('vite-app: hidevars/vite plugin during a real build', () => {
  it('inlines decrypted VITE_-prefixed values into the built JS bundle', async () => {
    const apiUrl = 'https://api.integration-test.example.com/v1';
    const featureFlag = 'feature-zeta-9f4d';
    const serverSecret = 'server-only-7c1a';

    const envContent = [
      `VITE_API_URL=${enc(apiUrl)}`,
      `VITE_FEATURE_FLAG=${enc(featureFlag, 'p')}`,
      `SERVER_SECRET=${enc(serverSecret)}`,
      '',
    ].join('\n');
    await writeFixture(VITE_APP, envContent);

    const previousXdg = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = xdgConfig;
    try {
      await build({ root: VITE_APP, logLevel: 'silent', configFile: path.join(VITE_APP, 'vite.config.js') });
    } finally {
      if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = previousXdg;
    }

    const assetsDir = path.join(VITE_APP, 'dist', 'assets');
    const files = await fs.readdir(assetsDir);
    let bundle = '';
    for (const f of files) {
      if (f.endsWith('.js')) bundle += await fs.readFile(path.join(assetsDir, f), 'utf8');
    }

    expect(bundle).toContain(apiUrl);
    expect(bundle).toContain(featureFlag);
    expect(bundle).not.toContain(serverSecret);
    expect(bundle).not.toContain("hidevars('");
  });
});
