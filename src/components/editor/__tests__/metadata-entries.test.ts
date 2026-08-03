import { describe, it, expect } from 'vitest';
import { metadataToEntries, entriesToMetadata, metadataValueType } from '../MetadataEditor';

describe('metadataToEntries', () => {
  it('marks string values as original so they can round-trip untouched', () => {
    expect(metadataToEntries({ note: 'true' })).toEqual([
      { key: 'note', value: 'true', original: 'true' },
    ]);
  });

  it('serialises non-string values without an original marker', () => {
    expect(metadataToEntries({ ok: true, n: 123, obj: { a: 1 } })).toEqual([
      { key: 'ok', value: 'true' },
      { key: 'n', value: '123' },
      { key: 'obj', value: '{"a":1}' },
    ]);
  });
});

describe('entriesToMetadata', () => {
  it('keeps untouched JSON-looking strings as strings', () => {
    const entries = metadataToEntries({
      flag: 'true',
      count: '123',
      empty: 'null',
      shape: '{"a":1}',
    });
    expect(entriesToMetadata(entries)).toEqual({
      flag: 'true',
      count: '123',
      empty: 'null',
      shape: '{"a":1}',
    });
  });

  it('preserves whitespace inside an untouched string value', () => {
    const entries = metadataToEntries({ padded: '  spaced  ' });
    expect(entriesToMetadata(entries)).toEqual({ padded: '  spaced  ' });
  });

  it('round-trips non-string values through their serialised form', () => {
    const source = { ok: true, n: 123, obj: { a: 1 } };
    expect(entriesToMetadata(metadataToEntries(source))).toEqual(source);
  });

  it('parses a value the user edited', () => {
    const [entry] = metadataToEntries({ flag: 'no' });
    expect(entriesToMetadata([{ ...entry, value: 'true' }])).toEqual({ flag: true });
  });

  it('parses newly added rows that carry no original', () => {
    expect(entriesToMetadata([{ key: 'n', value: '42' }])).toEqual({ n: 42 });
  });

  it('trims edited values but not untouched ones', () => {
    const [entry] = metadataToEntries({ note: ' keep me ' });
    expect(entriesToMetadata([entry])).toEqual({ note: ' keep me ' });
    expect(entriesToMetadata([{ ...entry, value: ' edited ' }])).toEqual({ note: 'edited' });
  });

  it('keeps the original marker when only the key is renamed', () => {
    const [entry] = metadataToEntries({ old: '123' });
    expect(entriesToMetadata([{ ...entry, key: 'new' }])).toEqual({ new: '123' });
  });

  it('skips rows with a blank key', () => {
    expect(entriesToMetadata([{ key: '   ', value: 'x' }])).toEqual({});
  });
});

describe('metadataValueType', () => {
  it('reports the JSON type a newly typed value will be saved as', () => {
    expect(metadataValueType({ key: 'a', value: '123' })).toBe('number');
    expect(metadataValueType({ key: 'a', value: 'true' })).toBe('boolean');
    expect(metadataValueType({ key: 'a', value: 'null' })).toBe('null');
    expect(metadataValueType({ key: 'a', value: '[1,2]' })).toBe('array');
    expect(metadataValueType({ key: 'a', value: '{"a":1}' })).toBe('object');
  });

  it('stays silent for values that are saved as plain text', () => {
    expect(metadataValueType({ key: 'a', value: 'hello' })).toBeNull();
    expect(metadataValueType({ key: 'a', value: '' })).toBeNull();
    expect(metadataValueType({ key: 'a', value: '"quoted"' })).toBeNull();
  });

  it('stays silent for untouched string rows, which never get re-parsed', () => {
    const [entry] = metadataToEntries({ count: '123' });
    expect(metadataValueType(entry)).toBeNull();
    expect(metadataValueType({ ...entry, value: '456' })).toBe('number');
  });

  it('flags exactly the values entriesToMetadata stores as non-strings', () => {
    for (const value of ['123', 'true', 'null', '[1,2]', '{"a":1}', 'hello', '"quoted"', ' ']) {
      const stored = entriesToMetadata([{ key: 'k', value }]).k;
      const flagged = metadataValueType({ key: 'k', value }) !== null;
      expect(flagged).toBe(typeof stored !== 'string' && stored !== undefined);
    }
  });
});
