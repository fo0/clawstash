import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadShowArchived, saveShowArchived } from '../archived';

const STORAGE_KEY = 'clawstash_archived';

function installLocalStorageStub() {
  const store = new Map<string, string>();
  const stub = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
  vi.stubGlobal('localStorage', stub);
  // load/saveShowArchived also guard on `window`; provide a minimal stub.
  vi.stubGlobal('window', { localStorage: stub });
  return store;
}

describe('loadShowArchived', () => {
  beforeEach(() => installLocalStorageStub());
  afterEach(() => vi.unstubAllGlobals());

  it('defaults to false when nothing is stored', () => {
    expect(loadShowArchived()).toBe(false);
  });

  it('returns true only for the exact "1" marker', () => {
    localStorage.setItem(STORAGE_KEY, '1');
    expect(loadShowArchived()).toBe(true);
  });

  it('returns false for "0"', () => {
    localStorage.setItem(STORAGE_KEY, '0');
    expect(loadShowArchived()).toBe(false);
  });

  it('falls back to false on an unexpected/hand-edited value', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    expect(loadShowArchived()).toBe(false);
  });
});

describe('saveShowArchived', () => {
  beforeEach(() => installLocalStorageStub());
  afterEach(() => vi.unstubAllGlobals());

  it('persists true as "1" and round-trips through loadShowArchived', () => {
    saveShowArchived(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1');
    expect(loadShowArchived()).toBe(true);
  });

  it('persists false as "0" and round-trips through loadShowArchived', () => {
    saveShowArchived(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('0');
    expect(loadShowArchived()).toBe(false);
  });
});
