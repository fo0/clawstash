// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isProbablyBinary, readImportedFiles, sanitizeImportedFilename } from '../file-import';

describe('sanitizeImportedFilename', () => {
  it('reduces a dropped folder path to its basename', () => {
    expect(sanitizeImportedFilename('src/server/db.ts')).toBe('db.ts');
    expect(sanitizeImportedFilename('C:\\tmp\\notes.md')).toBe('notes.md');
  });

  it('strips the character classes the server rejects', () => {
    // `..` and control characters both fail isValidFilename() server-side.
    expect(sanitizeImportedFilename('a..b.txt')).toBe('a.b.txt');
    expect(sanitizeImportedFilename(`bad${String.fromCharCode(10)}name.txt`)).toBe('badname.txt');
  });

  it('never returns an empty name and honours the length cap', () => {
    expect(sanitizeImportedFilename('/')).toBe('untitled.txt');
    expect(sanitizeImportedFilename('a'.repeat(300))).toHaveLength(255);
  });
});

describe('isProbablyBinary', () => {
  it('accepts text and rejects NUL bytes or a wall of replacement chars', () => {
    expect(isProbablyBinary('const a = 1;\n')).toBe(false);
    expect(isProbablyBinary('')).toBe(false);
    expect(isProbablyBinary(`png${String.fromCharCode(0)}data`)).toBe(true);
    expect(isProbablyBinary(String.fromCharCode(0xfffd).repeat(50))).toBe(true);
  });
});

describe('readImportedFiles', () => {
  const file = (name: string, content: string) => new File([content], name);

  it('reads text files into editor rows', async () => {
    const res = await readImportedFiles([file('a.ts', 'export const a = 1;')], 1024);
    expect(res.skipped).toEqual([]);
    expect(res.files).toEqual([{ filename: 'a.ts', content: 'export const a = 1;', language: '' }]);
  });

  it('skips oversized and binary files, naming each reason', async () => {
    const res = await readImportedFiles(
      [file('big.txt', 'x'.repeat(50)), file('logo.png', `PNG${String.fromCharCode(0)}`)],
      10,
    );
    expect(res.files).toEqual([]);
    expect(res.skipped).toHaveLength(2);
    expect(res.skipped[0]).toContain('big.txt');
    expect(res.skipped[1]).toContain('logo.png');
  });

  it('caps how many files one import may add', async () => {
    const picked = [file('a.txt', 'a'), file('b.txt', 'b'), file('c.txt', 'c')];
    const res = await readImportedFiles(picked, 1024, 2);
    expect(res.files.map((f) => f.filename)).toEqual(['a.txt', 'b.txt']);
    expect(res.skipped).toEqual(['1 more file — at most 2 per import.']);
  });
});
