import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadFavoriteIds,
  saveFavoriteIds,
  toggleFavorite,
  pruneFavoriteIds,
  sortStashesWithFavorites,
} from '../favorites';

const STORAGE_KEY = 'clawstash_favorite_stashes';

// Minimal in-memory localStorage stub. The real one is a `Storage` object,
// but only the four methods used by our utils are needed here.
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
    clear: () => {
      store.clear();
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as unknown as Storage;
  vi.stubGlobal('localStorage', stub);
  // `loadFavoriteIds` also guards on `window`; provide a minimal stub.
  vi.stubGlobal('window', { localStorage: stub });
  return stub;
}

describe('toggleFavorite', () => {
  it('adds an id when not present', () => {
    const initial = new Set<string>(['a']);
    const next = toggleFavorite(initial, 'b');
    expect([...next].sort()).toEqual(['a', 'b']);
  });

  it('removes an id when already present', () => {
    const initial = new Set<string>(['a', 'b']);
    const next = toggleFavorite(initial, 'a');
    expect([...next]).toEqual(['b']);
  });

  it('does not mutate the input set', () => {
    const initial = new Set<string>(['a']);
    const snapshot = [...initial];
    toggleFavorite(initial, 'b');
    toggleFavorite(initial, 'a');
    expect([...initial]).toEqual(snapshot);
  });

  it('returns a different set instance even when toggling produces same content', () => {
    // Toggling on then off yields the same content but should still be a new
    // reference so React state updates trigger correctly.
    const initial = new Set<string>(['a']);
    const after = toggleFavorite(initial, 'b');
    expect(after).not.toBe(initial);
  });
});

describe('sortStashesWithFavorites', () => {
  type S = { id: string; updated_at: string };

  // The dashboard receives stashes from the server pre-sorted by
  // `updated_at DESC`. The fixture mirrors that.
  const stashes: S[] = [
    { id: 'a', updated_at: '2026-04-26T10:00:00Z' },
    { id: 'b', updated_at: '2026-04-25T10:00:00Z' },
    { id: 'c', updated_at: '2026-04-24T10:00:00Z' },
    { id: 'd', updated_at: '2026-04-23T10:00:00Z' },
  ];

  it('returns input order untouched when there are no favorites', () => {
    const result = sortStashesWithFavorites(stashes, new Set());
    expect(result.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('lifts a favorite to the top while preserving non-favorite order', () => {
    const result = sortStashesWithFavorites(stashes, new Set(['c']));
    expect(result.map((s) => s.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('keeps favorites in the original input order among themselves', () => {
    const result = sortStashesWithFavorites(stashes, new Set(['d', 'b']));
    // `b` appears before `d` in the input, so favorites group is [b, d];
    // non-favorites group is [a, c] in original order.
    expect(result.map((s) => s.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('handles all stashes being favorites', () => {
    const result = sortStashesWithFavorites(stashes, new Set(['a', 'b', 'c', 'd']));
    expect(result.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ignores favorite ids that are not in the current list', () => {
    const result = sortStashesWithFavorites(stashes, new Set(['zzz']));
    expect(result.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns a new array even when no reordering happens', () => {
    const result = sortStashesWithFavorites(stashes, new Set());
    expect(result).not.toBe(stashes);
  });
});

describe('pruneFavoriteIds', () => {
  it('drops ids that are not in the known set', () => {
    const ids = new Set(['a', 'b', 'c']);
    const result = pruneFavoriteIds(ids, ['a', 'c']);
    expect([...result].sort()).toEqual(['a', 'c']);
  });

  it('returns the same instance when nothing changes', () => {
    const ids = new Set(['a', 'b']);
    const result = pruneFavoriteIds(ids, ['a', 'b', 'c']);
    expect(result).toBe(ids);
  });
});

describe('localStorage persistence', () => {
  beforeEach(() => {
    installLocalStorageStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an empty set when nothing is stored', () => {
    expect(loadFavoriteIds().size).toBe(0);
  });

  it('round-trips ids through localStorage', () => {
    saveFavoriteIds(new Set(['x', 'y', 'z']));
    expect([...loadFavoriteIds()].sort()).toEqual(['x', 'y', 'z']);
  });

  it('persists toggle results so a reload restores the same state', () => {
    let ids = loadFavoriteIds();
    ids = toggleFavorite(ids, 'first');
    saveFavoriteIds(ids);
    ids = toggleFavorite(ids, 'second');
    saveFavoriteIds(ids);

    const reloaded = loadFavoriteIds();
    expect([...reloaded].sort()).toEqual(['first', 'second']);
  });

  it('removes ids that get toggled off', () => {
    saveFavoriteIds(new Set(['a', 'b']));
    let ids = loadFavoriteIds();
    ids = toggleFavorite(ids, 'a');
    saveFavoriteIds(ids);

    expect([...loadFavoriteIds()]).toEqual(['b']);
  });

  it('returns an empty set when the stored value is corrupted JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    expect(loadFavoriteIds().size).toBe(0);
  });

  it('returns an empty set when the stored value is not an array', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ a: true }));
    expect(loadFavoriteIds().size).toBe(0);
  });

  it('drops non-string entries from a corrupted payload', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['ok', 42, null, 'also-ok']));
    expect([...loadFavoriteIds()].sort()).toEqual(['also-ok', 'ok']);
  });
});

describe('end-to-end toggle action', () => {
  type S = { id: string; updated_at: string };

  beforeEach(() => {
    installLocalStorageStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('toggling a stash favorite lifts it to the top and persists across reloads', () => {
    const stashes: S[] = [
      { id: 'a', updated_at: '2026-04-26T10:00:00Z' },
      { id: 'b', updated_at: '2026-04-25T10:00:00Z' },
      { id: 'c', updated_at: '2026-04-24T10:00:00Z' },
    ];

    // 1. Initial load — no favorites yet, default order.
    let favorites = loadFavoriteIds();
    expect(sortStashesWithFavorites(stashes, favorites).map((s) => s.id)).toEqual(['a', 'b', 'c']);

    // 2. User toggles `c` as favorite — UI updates live.
    favorites = toggleFavorite(favorites, 'c');
    saveFavoriteIds(favorites);
    expect(sortStashesWithFavorites(stashes, favorites).map((s) => s.id)).toEqual(['c', 'a', 'b']);

    // 3. Page reload — state is restored from localStorage.
    favorites = loadFavoriteIds();
    expect(sortStashesWithFavorites(stashes, favorites).map((s) => s.id)).toEqual(['c', 'a', 'b']);

    // 4. User unfavorites `c` — order returns to default.
    favorites = toggleFavorite(favorites, 'c');
    saveFavoriteIds(favorites);
    expect(sortStashesWithFavorites(stashes, favorites).map((s) => s.id)).toEqual(['a', 'b', 'c']);

    // 5. Reload again — empty favorites persist.
    favorites = loadFavoriteIds();
    expect(favorites.size).toBe(0);
  });
});
