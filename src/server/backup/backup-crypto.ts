import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

/**
 * At-rest encryption for the GitHub backup token (refs #108).
 *
 * AES-256-GCM with a per-instance key. Key resolution order:
 *  1. `CLAWSTASH_ENCRYPTION_KEY` env var (64 hex chars = 32 bytes) — for
 *     deployments that manage secrets externally (k8s, Docker secrets).
 *  2. Key file next to the SQLite database (`.clawstash-key`, mode 0600),
 *     auto-generated on first use so zero-config setups keep working. It
 *     lives in the data volume, so backups of the volume carry the key.
 *
 * Ciphertext format: `v1:<iv b64>:<auth tag b64>:<ciphertext b64>`.
 */

const KEY_ENV_VAR = 'CLAWSTASH_ENCRYPTION_KEY';
const KEY_FILENAME = '.clawstash-key';
const HEX_KEY_PATTERN = /^[0-9a-fA-F]{64}$/;

let cachedKey: Buffer | null = null;

function keyFilePath(): string {
  const dbPath = process.env.DATABASE_PATH || './data/clawstash.db';
  return path.join(path.dirname(dbPath), KEY_FILENAME);
}

/** Test hook: clear the process-level key cache. */
export function resetEncryptionKeyCache(): void {
  cachedKey = null;
}

export function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const fromEnv = process.env[KEY_ENV_VAR];
  if (fromEnv) {
    if (!HEX_KEY_PATTERN.test(fromEnv)) {
      throw new Error(`${KEY_ENV_VAR} must be exactly 64 hex characters (32 bytes)`);
    }
    cachedKey = Buffer.from(fromEnv, 'hex');
    return cachedKey;
  }

  const file = keyFilePath();
  if (fs.existsSync(file)) {
    const hex = fs.readFileSync(file, 'utf8').trim();
    if (!HEX_KEY_PATTERN.test(hex)) {
      throw new Error(
        `Encryption key file ${file} is corrupt (expected 64 hex characters). ` +
          `Delete it to generate a new key — previously stored secrets must then be re-entered.`,
      );
    }
    cachedKey = Buffer.from(hex, 'hex');
    return cachedKey;
  }

  const key = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${key.toString('hex')}\n`, { mode: 0o600 });
  cachedKey = key;
  return cachedKey;
}

export function encryptSecret(plaintext: string, key?: Buffer): string {
  const k = key ?? getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptSecret(encrypted: string, key?: Buffer): string {
  const parts = encrypted.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Unrecognized encrypted value format');
  }
  const k = key ?? getEncryptionKey();
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}

// GitHub token shapes (classic PAT, fine-grained PAT, OAuth/user-to-server
// tokens). Matched defensively so a token can never leak into stored error
// messages or the sync log even if a future code path embeds one.
const GITHUB_TOKEN_PATTERN =
  /\b(?:gh[pousr]_[A-Za-z0-9_]{16,255}|github_pat_[A-Za-z0-9_]{20,255})\b/g;

/**
 * Strip secrets from a message before it is logged or persisted. Replaces
 * every occurrence of the given secrets plus anything that looks like a
 * GitHub token.
 */
export function redactSecrets(
  message: string,
  secrets: (string | null | undefined)[] = [],
): string {
  let result = message;
  for (const secret of secrets) {
    if (secret && secret.length >= 8) {
      result = result.split(secret).join('[redacted]');
    }
  }
  return result.replace(GITHUB_TOKEN_PATTERN, '[redacted]');
}
