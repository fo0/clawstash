import { describe, it, expect } from 'vitest';
import {
  CreateStashSchema,
  UpdateStashSchema,
  MAX_METADATA_DEPTH,
  maxObjectDepth,
} from '../validation';

describe('maxObjectDepth', () => {
  it('primitives count as depth 1', () => {
    expect(maxObjectDepth('a')).toBe(1);
    expect(maxObjectDepth(7)).toBe(1);
    expect(maxObjectDepth(true)).toBe(1);
    expect(maxObjectDepth(null)).toBe(1);
  });

  it('empty containers count as depth 1', () => {
    expect(maxObjectDepth({})).toBe(1);
    expect(maxObjectDepth([])).toBe(1);
  });

  it('counts nested object levels', () => {
    expect(maxObjectDepth({ a: 1 })).toBe(1);
    expect(maxObjectDepth({ a: { b: 1 } })).toBe(2);
    expect(maxObjectDepth({ a: { b: { c: { d: { e: 1 } } } } })).toBe(5);
  });

  it('counts arrays as object containers', () => {
    expect(maxObjectDepth([[[[[1]]]]])).toBe(5);
  });

  it('picks the deepest branch among siblings', () => {
    expect(maxObjectDepth({ a: 1, b: { c: { d: 1 } } })).toBe(3);
  });
});

describe('CreateStashSchema metadata depth', () => {
  const baseFile = { filename: 'x.txt', content: 'x' };

  it('accepts flat metadata', () => {
    const parsed = CreateStashSchema.safeParse({
      files: [baseFile],
      metadata: { model: 'claude', purpose: 'review' },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts metadata up to MAX_METADATA_DEPTH', () => {
    // Build {a: {a: {a: {a: {a: 1}}}}} = depth 5
    let nested: unknown = 1;
    for (let i = 0; i < MAX_METADATA_DEPTH - 1; i++) nested = { a: nested };
    const parsed = CreateStashSchema.safeParse({
      files: [baseFile],
      metadata: { a: nested },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects metadata deeper than MAX_METADATA_DEPTH', () => {
    let nested: unknown = 1;
    for (let i = 0; i < MAX_METADATA_DEPTH + 1; i++) nested = { a: nested };
    const parsed = CreateStashSchema.safeParse({
      files: [baseFile],
      metadata: { a: nested },
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toContain('nesting');
    }
  });

  it('rejects array metadata', () => {
    const parsed = CreateStashSchema.safeParse({
      files: [baseFile],
      metadata: [{ a: 1 }] as unknown as Record<string, unknown>,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('UpdateStashSchema metadata depth', () => {
  it('rejects metadata deeper than MAX_METADATA_DEPTH on update', () => {
    let nested: unknown = 1;
    for (let i = 0; i < MAX_METADATA_DEPTH + 1; i++) nested = { a: nested };
    const parsed = UpdateStashSchema.safeParse({ metadata: { a: nested } });
    expect(parsed.success).toBe(false);
  });
});
