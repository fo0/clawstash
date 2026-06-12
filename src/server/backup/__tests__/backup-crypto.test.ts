import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import {
  decryptSecret,
  encryptSecret,
  getEncryptionKey,
  redactSecrets,
  resetEncryptionKeyCache,
} from '../backup-crypto';

const TEST_KEY_HEX = 'ab'.repeat(32);

describe('encryptSecret / decryptSecret', () => {
  const key = Buffer.from(TEST_KEY_HEX, 'hex');

  it('round-trips a secret', () => {
    const encrypted = encryptSecret('ghp_supersecrettoken1234', key);
    expect(encrypted.startsWith('v1:')).toBe(true);
    expect(encrypted).not.toContain('ghp_supersecrettoken1234');
    expect(decryptSecret(encrypted, key)).toBe('ghp_supersecrettoken1234');
  });

  it('produces a different ciphertext per call (random IV)', () => {
    expect(encryptSecret('same', key)).not.toBe(encryptSecret('same', key));
  });

  it('fails on tampered ciphertext', () => {
    const encrypted = encryptSecret('secret', key);
    const parts = encrypted.split(':');
    const tampered = Buffer.from(parts[3], 'base64');
    tampered[0] = tampered[0] ^ 0xff;
    parts[3] = tampered.toString('base64');
    expect(() => decryptSecret(parts.join(':'), key)).toThrow();
  });

  it('fails on a wrong key', () => {
    const encrypted = encryptSecret('secret', key);
    const otherKey = crypto.randomBytes(32);
    expect(() => decryptSecret(encrypted, otherKey)).toThrow();
  });

  it('rejects unknown formats', () => {
    expect(() => decryptSecret('plaintext', key)).toThrow(/format/i);
    expect(() => decryptSecret('v2:a:b:c', key)).toThrow(/format/i);
  });
});

describe('getEncryptionKey (env source)', () => {
  beforeEach(() => resetEncryptionKeyCache());
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEncryptionKeyCache();
  });

  it('uses CLAWSTASH_ENCRYPTION_KEY when set', () => {
    vi.stubEnv('CLAWSTASH_ENCRYPTION_KEY', TEST_KEY_HEX);
    expect(getEncryptionKey().toString('hex')).toBe(TEST_KEY_HEX);
  });

  it('rejects malformed env keys', () => {
    vi.stubEnv('CLAWSTASH_ENCRYPTION_KEY', 'not-hex');
    expect(() => getEncryptionKey()).toThrow(/64 hex/);
  });
});

describe('redactSecrets', () => {
  it('replaces explicit secrets', () => {
    const msg = 'request with Bearer my-secret-value-123 failed';
    expect(redactSecrets(msg, ['my-secret-value-123'])).toBe(
      'request with Bearer [redacted] failed',
    );
  });

  it('ignores null/short secrets (no accidental global replacements)', () => {
    expect(redactSecrets('abc failed', [null, undefined, 'abc'])).toBe('abc failed');
  });

  it('redacts GitHub token shapes even when not passed explicitly', () => {
    const classic = `boom ghp_${'a'.repeat(36)} end`;
    const fineGrained = `boom github_pat_${'b'.repeat(40)} end`;
    const oauth = `boom gho_${'c'.repeat(36)} end`;
    expect(redactSecrets(classic)).toBe('boom [redacted] end');
    expect(redactSecrets(fineGrained)).toBe('boom [redacted] end');
    expect(redactSecrets(oauth)).toBe('boom [redacted] end');
  });
});
