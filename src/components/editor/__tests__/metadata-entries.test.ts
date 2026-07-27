import { describe, it, expect } from 'vitest';
import { metadataToEntries, entriesToMetadata } from '../MetadataEditor';

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
