import { describe, expect, it } from 'vitest';
import {
  ACCESS_SOURCES,
  countBySource,
  filterBySource,
  hasMixedSources,
} from '../access-log-filter';
import type { AccessLogEntry } from '../../types';

function entry(id: string, source: AccessLogEntry['source']): AccessLogEntry {
  return {
    id,
    stash_id: 's1',
    source,
    action: 'read',
    timestamp: '2026-01-01T00:00:00.000Z',
  };
}

describe('countBySource', () => {
  it('counts every channel, including the ones with no entries', () => {
    expect(countBySource([entry('a', 'api'), entry('b', 'mcp'), entry('c', 'api')])).toEqual({
      api: 2,
      mcp: 1,
      ui: 0,
    });
  });

  it('returns zeros for an empty log', () => {
    expect(countBySource([])).toEqual({ api: 0, mcp: 0, ui: 0 });
  });

  it('ignores a source this build does not know instead of throwing', () => {
    const unknown = { ...entry('x', 'api'), source: 'webhook' } as unknown as AccessLogEntry;
    expect(countBySource([unknown, entry('a', 'ui')])).toEqual({ api: 0, mcp: 0, ui: 1 });
  });

  it('ignores an unknown source that collides with an Object.prototype key', () => {
    const polluted = ['toString', 'constructor', 'valueOf'].map(
      (source, i) => ({ ...entry(`p${i}`, 'api'), source }) as unknown as AccessLogEntry,
    );
    expect(countBySource([...polluted, entry('a', 'ui')])).toEqual({ api: 0, mcp: 0, ui: 1 });
  });
});

describe('filterBySource', () => {
  const entries = [entry('a', 'api'), entry('b', 'mcp'), entry('c', 'api')];

  it('narrows to a single channel, preserving order', () => {
    expect(filterBySource(entries, 'api').map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('returns the same reference for "all" so the list can skip a re-render', () => {
    expect(filterBySource(entries, 'all')).toBe(entries);
  });

  it('returns an empty list for a channel with no entries', () => {
    expect(filterBySource(entries, 'ui')).toEqual([]);
  });
});

describe('hasMixedSources', () => {
  it('is false for an empty or single-channel log', () => {
    expect(hasMixedSources({ api: 0, mcp: 0, ui: 0 })).toBe(false);
    expect(hasMixedSources({ api: 7, mcp: 0, ui: 0 })).toBe(false);
  });

  it('is true as soon as two channels are present', () => {
    expect(hasMixedSources({ api: 1, mcp: 0, ui: 1 })).toBe(true);
  });
});

describe('ACCESS_SOURCES', () => {
  it('lists the three channels the log records', () => {
    expect([...ACCESS_SOURCES]).toEqual(['api', 'mcp', 'ui']);
  });
});
