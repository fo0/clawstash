import { describe, expect, it } from 'vitest';
import { parseNonNegativeInt, parsePositiveInt } from '../_helpers';

/**
 * Both parsers document that non-integer input yields `undefined`.
 * `Number.parseInt` alone stops at the first non-digit, so `'1.5'`, `'2abc'`
 * and `'1e3'` used to come back truncated (`1`, `2`, `1`) — a `?limit=1.5`
 * or a `/versions/3abc` path silently acted as `1` / `3`.
 */
describe('parsePositiveInt', () => {
  it('accepts plain positive decimal integers', () => {
    expect(parsePositiveInt('1')).toBe(1);
    expect(parsePositiveInt('42')).toBe(42);
    expect(parsePositiveInt('007')).toBe(7);
  });

  it('rejects null, empty, zero and negative values', () => {
    expect(parsePositiveInt(null)).toBeUndefined();
    expect(parsePositiveInt('')).toBeUndefined();
    expect(parsePositiveInt('0')).toBeUndefined();
    expect(parsePositiveInt('-3')).toBeUndefined();
  });

  it('rejects non-integer input instead of truncating it', () => {
    for (const value of ['1.5', '2abc', '1e3', '0x10', ' 5', '5 ', '+5', 'abc']) {
      expect(parsePositiveInt(value), value).toBeUndefined();
    }
  });
});

describe('parseNonNegativeInt', () => {
  it('accepts zero and plain positive decimal integers', () => {
    expect(parseNonNegativeInt('0')).toBe(0);
    expect(parseNonNegativeInt('12')).toBe(12);
  });

  it('rejects null, empty and negative values', () => {
    expect(parseNonNegativeInt(null)).toBeUndefined();
    expect(parseNonNegativeInt('')).toBeUndefined();
    expect(parseNonNegativeInt('-1')).toBeUndefined();
  });

  it('rejects non-integer input instead of truncating it', () => {
    for (const value of ['0.5', '3abc', '1e2', ' 0', '+1']) {
      expect(parseNonNegativeInt(value), value).toBeUndefined();
    }
  });
});
