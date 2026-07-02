import { describe, it, expect } from 'vitest';
import {
  formatBuildVersion,
  formatBytes,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  pluralize,
} from '../format';

describe('formatBytes', () => {
  it('renders bytes with no decimals', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('switches to KB at 1024 and shows one decimal when not whole', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('scales to MB / GB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(Math.round(3.2 * 1024 * 1024))).toBe('3.2 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
  });

  it('clamps invalid / negative input to "0 B"', () => {
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(NaN)).toBe('0 B');
    expect(formatBytes(Infinity)).toBe('0 B');
  });
});

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

describe('pluralize', () => {
  it('uses the singular noun only when the count is exactly 1', () => {
    expect(pluralize(1, 'file')).toBe('1 file');
    expect(pluralize(0, 'file')).toBe('0 files');
    expect(pluralize(2, 'file')).toBe('2 files');
  });

  it('honors an explicit plural for irregular nouns', () => {
    expect(pluralize(1, 'stash', 'stashes')).toBe('1 stash');
    expect(pluralize(3, 'stash', 'stashes')).toBe('3 stashes');
  });

  it('defaults the plural to the singular + "s"', () => {
    expect(pluralize(5, 'connection')).toBe('5 connections');
    expect(pluralize(1, 'tag')).toBe('1 tag');
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
