import { describe, it, expect } from 'vitest';
import { sanitizeLogValue, quoteLogValue } from '../log-sanitize';

describe('sanitizeLogValue', () => {
  it('returns plain values unchanged', () => {
    expect(sanitizeLogValue('Mozilla/5.0 (X11; Linux x86_64)')).toBe(
      'Mozilla/5.0 (X11; Linux x86_64)',
    );
  });

  it('strips CR/LF so a crafted header cannot forge additional log lines', () => {
    expect(sanitizeLogValue('agent\r\n[audit] admin export: forged')).toBe(
      'agent[audit] admin export: forged',
    );
  });

  it('strips all C0 controls and DEL, keeping the printable remainder', () => {
    expect(sanitizeLogValue('a\x00b\x1bc\x7fd')).toBe('abcd');
  });

  it('strips C1 controls and Unicode line separators', () => {
    expect(sanitizeLogValue('a\x9bb\u2028c\u2029d')).toBe('abcd');
  });

  it('strips bidi direction controls (Trojan-source display spoofing guard)', () => {
    expect(sanitizeLogValue('a\u202eb\u200fc\u2066d')).toBe('abcd');
  });

  it("falls back to 'unknown' for undefined and empty input", () => {
    expect(sanitizeLogValue(undefined)).toBe('unknown');
    expect(sanitizeLogValue('')).toBe('unknown');
  });

  it("falls back to 'unknown' when stripping leaves nothing", () => {
    expect(sanitizeLogValue('\r\n\x1b')).toBe('unknown');
  });

  it('preserves non-ASCII printable characters', () => {
    expect(sanitizeLogValue('Münchner-Agent/1.0 (テスト)')).toBe('Münchner-Agent/1.0 (テスト)');
  });
});

describe('quoteLogValue', () => {
  it('wraps a plain value in double quotes', () => {
    expect(quoteLogValue('Mozilla/5.0')).toBe('"Mozilla/5.0"');
  });

  it('quotes printable [audit]-like text so it cannot pose as a separate field', () => {
    // No control chars needed — printable text alone confuses an unanchored
    // grep without the quoting (#121). The quotes bound it as one value.
    expect(quoteLogValue('agent [audit] admin export: forged stashes=999')).toBe(
      '"agent [audit] admin export: forged stashes=999"',
    );
  });

  it('escapes embedded double quotes so the value cannot be terminated early', () => {
    expect(quoteLogValue('a"b')).toBe('"a\\"b"');
  });

  it('escapes backslashes', () => {
    expect(quoteLogValue('a\\b')).toBe('"a\\\\b"');
  });

  it('still strips CR/LF before quoting', () => {
    expect(quoteLogValue('agent\r\n[audit] forged')).toBe('"agent[audit] forged"');
  });

  it('quotes the unknown fallback for missing/empty input', () => {
    expect(quoteLogValue(undefined)).toBe('"unknown"');
    expect(quoteLogValue('')).toBe('"unknown"');
  });
});
