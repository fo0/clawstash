import { describe, it, expect } from 'vitest';
import { sanitizeLogValue } from '../log-sanitize';

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
