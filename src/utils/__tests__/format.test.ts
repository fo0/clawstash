import { describe, it, expect } from 'vitest';
import { formatBuildVersion, formatDate, formatDateTime, formatRelativeTime } from '../format';

describe('formatBuildVersion', () => {
  it('formats a valid ISO date as vYYYYMMDD-HHMM in UTC', () => {
    expect(formatBuildVersion('2026-05-10T07:48:59Z')).toBe('v20260510-0748');
  });

  it('zero-pads single-digit components', () => {
    expect(formatBuildVersion('2026-01-02T03:04:00Z')).toBe('v20260102-0304');
  });

  it('returns null for unparseable input', () => {
    expect(formatBuildVersion('not-a-date')).toBeNull();
    expect(formatBuildVersion('')).toBeNull();
  });

  it('uses UTC, not local time', () => {
    // 23:30 UTC reads as a different local hour in most timezones — pin
    // the canonical output here so a regression to local-time formatting
    // is caught even when the test runs in TZ=America/Los_Angeles etc.
    expect(formatBuildVersion('2026-12-31T23:30:00Z')).toBe('v20261231-2330');
  });
});

describe('format helpers — characterization', () => {
  it('formatDate returns a non-empty string for a valid ISO date', () => {
    expect(formatDate('2026-05-10T00:00:00Z')).toMatch(/\d/);
  });

  it('formatDateTime returns a non-empty string for a valid ISO date', () => {
    expect(formatDateTime('2026-05-10T07:48:59Z')).toMatch(/\d/);
  });

  it('formatRelativeTime returns "just now" for the current time', () => {
    expect(formatRelativeTime(new Date().toISOString())).toBe('just now');
  });
});
