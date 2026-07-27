import { describe, it, expect } from 'vitest';
import {
  CreateStashSchema,
  UpdateStashSchema,
  ImportStashFileRowSchema,
  ImportStashVersionFileRowSchema,
  MAX_METADATA_DEPTH,
  maxObjectDepth,
  hasUniqueFilenames,
  isValidFilename,
  DUPLICATE_FILENAME_MESSAGE,
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

describe('unique filenames', () => {
  const file = (filename: string) => ({ filename, content: 'x' });

  it('accepts distinct filenames', () => {
    expect(CreateStashSchema.safeParse({ files: [file('a.txt'), file('b.txt')] }).success).toBe(
      true,
    );
  });

  it('rejects duplicate filenames on create', () => {
    const parsed = CreateStashSchema.safeParse({ files: [file('a.txt'), file('a.txt')] });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(DUPLICATE_FILENAME_MESSAGE);
    }
  });

  it('rejects filenames that only differ by surrounding whitespace', () => {
    expect(CreateStashSchema.safeParse({ files: [file('a.txt'), file(' a.txt ')] }).success).toBe(
      false,
    );
  });

  it('stays case-sensitive (raw lookup matches exactly)', () => {
    expect(CreateStashSchema.safeParse({ files: [file('a.txt'), file('A.txt')] }).success).toBe(
      true,
    );
  });

  it('rejects duplicate filenames on update', () => {
    expect(UpdateStashSchema.safeParse({ files: [file('a.txt'), file('a.txt')] }).success).toBe(
      false,
    );
  });

  it('leaves an omitted files array on update untouched', () => {
    expect(UpdateStashSchema.safeParse({ name: 'renamed' }).success).toBe(true);
  });

  it('hasUniqueFilenames handles the empty list', () => {
    expect(hasUniqueFilenames([])).toBe(true);
  });
});

describe('isValidFilename', () => {
  it('accepts ordinary filenames', () => {
    expect(isValidFilename('README.md')).toBe(true);
    expect(isValidFilename('docker-compose.yml')).toBe(true);
    expect(isValidFilename('Ümlaut — dash.txt')).toBe(true);
  });

  it('rejects path separators and traversal', () => {
    expect(isValidFilename('src/index.ts')).toBe(false);
    expect(isValidFilename('src\\index.ts')).toBe(false);
    expect(isValidFilename('..')).toBe(false);
    expect(isValidFilename('a..b')).toBe(false);
  });

  it('rejects C0 controls, DEL and C1 controls', () => {
    expect(isValidFilename('a\x00b')).toBe(false);
    expect(isValidFilename('a\rb')).toBe(false);
    expect(isValidFilename('a\nb')).toBe(false);
    expect(isValidFilename('a\tb')).toBe(false);
    expect(isValidFilename('a\x7fb')).toBe(false);
    expect(isValidFilename('a\x9fb')).toBe(false);
  });

  it('rejects empty and over-long names', () => {
    expect(isValidFilename('')).toBe(false);
    expect(isValidFilename('a'.repeat(1000))).toBe(false);
  });
});

describe('import file-row filename validation', () => {
  // The import route is the only path that writes filenames without going
  // through FileSchema. Both import schemas must apply the same guard, or an
  // old/hand-crafted export could seed a filename the write path forbids.
  const fileRow = (filename: string) => ({ id: 'f1', stash_id: 's1', filename });
  const versionFileRow = (filename: string) => ({ id: 'vf1', version_id: 'v1', filename });

  it('accepts ordinary filenames', () => {
    expect(ImportStashFileRowSchema.safeParse(fileRow('README.md')).success).toBe(true);
    expect(ImportStashVersionFileRowSchema.safeParse(versionFileRow('README.md')).success).toBe(
      true,
    );
  });

  it('rejects path separators and traversal in stash_files rows', () => {
    expect(ImportStashFileRowSchema.safeParse(fileRow('../../etc/passwd')).success).toBe(false);
    expect(ImportStashFileRowSchema.safeParse(fileRow('nested/file.txt')).success).toBe(false);
    expect(ImportStashFileRowSchema.safeParse(fileRow('nested\\file.txt')).success).toBe(false);
  });

  it('rejects control characters that could smuggle a response header', () => {
    // The raw-file route reflects the stored filename into Content-Disposition.
    expect(ImportStashFileRowSchema.safeParse(fileRow('a\r\nX-Injected: 1')).success).toBe(false);
    expect(ImportStashFileRowSchema.safeParse(fileRow('a\x00b')).success).toBe(false);
  });

  it('applies the same guard to stash_version_files rows', () => {
    expect(ImportStashVersionFileRowSchema.safeParse(versionFileRow('../evil')).success).toBe(
      false,
    );
    expect(
      ImportStashVersionFileRowSchema.safeParse(versionFileRow('a\r\nX-Injected: 1')).success,
    ).toBe(false);
  });

  it('still rejects an empty filename', () => {
    expect(ImportStashFileRowSchema.safeParse(fileRow('')).success).toBe(false);
    expect(ImportStashVersionFileRowSchema.safeParse(versionFileRow('')).success).toBe(false);
  });
});
