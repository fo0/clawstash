import { describe, expect, it } from 'vitest';
import { buildAllFilesText, bundleFilename } from '../stash-bundle';

describe('buildAllFilesText', () => {
  it('separates files with the header the copy button has always used', () => {
    expect(
      buildAllFilesText([
        { filename: 'a.txt', content: 'one' },
        { filename: 'b.txt', content: 'two' },
      ]),
    ).toBe('// === a.txt ===\none\n\n// === b.txt ===\ntwo');
  });

  it('keeps a single file unwrapped except for its own header', () => {
    expect(buildAllFilesText([{ filename: 'only.md', content: '# hi' }])).toBe(
      '// === only.md ===\n# hi',
    );
  });

  it('returns an empty string for a stash with no files', () => {
    expect(buildAllFilesText([])).toBe('');
  });
});

describe('bundleFilename', () => {
  it('slugifies the stash name', () => {
    expect(bundleFilename({ id: 'abc', name: 'Deploy Notes' })).toBe('deploy-notes.txt');
  });

  it('collapses punctuation runs and trims the edges', () => {
    expect(bundleFilename({ id: 'abc', name: '  ..Deploy // Notes!! ' })).toBe('deploy-notes.txt');
  });

  it('falls back to the id when there is no name', () => {
    expect(bundleFilename({ id: 'abc123' })).toBe('stash-abc123.txt');
    expect(bundleFilename({ id: 'abc123', name: '' })).toBe('stash-abc123.txt');
  });

  it('falls back to the id when the name slugifies to nothing', () => {
    expect(bundleFilename({ id: 'abc123', name: '☃☃☃' })).toBe('stash-abc123.txt');
  });

  it('caps a long name without leaving a trailing separator', () => {
    const name = `${'a'.repeat(59)} tail`;
    const result = bundleFilename({ id: 'abc', name });
    expect(result).toBe(`${'a'.repeat(59)}.txt`);
  });
});
