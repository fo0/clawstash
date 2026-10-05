import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadRecentViews,
  saveRecentViews,
  addRecentView,
  recordRecentView,
  removeRecentView,
  renameRecentView,
  forgetRecentView,
  syncRecentViewTitle,
  recentViewOf,
  MAX_RECENT_VIEWS,
  type RecentView,
} from '../recent-views';

const STORAGE_KEY = 'clawstash_recent_views';

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
  vi.stubGlobal('window', { localStorage: stub });
  return store;
}

const view = (id: string, title = `title-${id}`): RecentView => ({ id, title });

describe('addRecentView (pure)', () => {
  it('prepends the newest view', () => {
    expect(addRecentView([view('a')], view('b'))).toEqual([view('b'), view('a')]);
  });

  it('dedupes by id and moves the repeat to the front', () => {
    const result = addRecentView([view('a'), view('b')], view('a', 'renamed'));
    expect(result).toEqual([view('a', 'renamed'), view('b')]);
  });

  it('caps the list at MAX_RECENT_VIEWS', () => {
    let list: RecentView[] = [];
    for (let i = 0; i < MAX_RECENT_VIEWS + 3; i++) list = addRecentView(list, view(String(i)));
    expect(list).toHaveLength(MAX_RECENT_VIEWS);
    // Newest first: the last id added is at the front.
    expect(list[0].id).toBe(String(MAX_RECENT_VIEWS + 2));
  });

  it('does not mutate the input list', () => {
    const input = [view('a')];
    addRecentView(input, view('b'));
    expect(input).toEqual([view('a')]);
  });
});

describe('load/save/record (localStorage)', () => {
  beforeEach(() => installLocalStorageStub());
  afterEach(() => vi.unstubAllGlobals());

  it('returns an empty list when nothing is stored', () => {
    expect(loadRecentViews()).toEqual([]);
  });

  it('round-trips a saved list', () => {
    saveRecentViews([view('a'), view('b')]);
    expect(loadRecentViews()).toEqual([view('a'), view('b')]);
  });

  it('drops corrupted / non-conforming entries', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([view('a'), { id: 1 }, 'nope', { title: 'x' }, view('b')]),
    );
    expect(loadRecentViews()).toEqual([view('a'), view('b')]);
  });

  it('returns an empty list on non-array JSON', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: 'a' }));
    expect(loadRecentViews()).toEqual([]);
  });

  it('recordRecentView persists prepended + capped and returns the list', () => {
    recordRecentView(view('a'));
    const result = recordRecentView(view('b'));
    expect(result).toEqual([view('b'), view('a')]);
    expect(loadRecentViews()).toEqual([view('b'), view('a')]);
  });
});

describe('recentViewOf', () => {
  it('uses the name, then the first filename, then "Untitled"', () => {
    expect(recentViewOf({ id: 'a', name: 'Notes', files: [{ filename: 'x.md' }] })).toEqual(
      view('a', 'Notes'),
    );
    expect(recentViewOf({ id: 'a', name: '', files: [{ filename: 'x.md' }] })).toEqual(
      view('a', 'x.md'),
    );
    expect(recentViewOf({ id: 'a', name: '', files: [] })).toEqual(view('a', 'Untitled'));
  });
});

describe('removeRecentView / renameRecentView (pure)', () => {
  it('removes the entry and keeps the order of the rest', () => {
    expect(removeRecentView([view('a'), view('b'), view('c')], 'b')).toEqual([
      view('a'),
      view('c'),
    ]);
  });

  it('returns the same list when the id is not listed', () => {
    const list = [view('a')];
    expect(removeRecentView(list, 'z')).toBe(list);
  });

  it('renames in place without moving the entry to the front', () => {
    expect(renameRecentView([view('a'), view('b')], 'b', 'New name')).toEqual([
      view('a'),
      view('b', 'New name'),
    ]);
  });

  it('returns the same list for an unknown id or an unchanged title', () => {
    const list = [view('a', 'Same')];
    expect(renameRecentView(list, 'z', 'x')).toBe(list);
    expect(renameRecentView(list, 'a', 'Same')).toBe(list);
  });
});

describe('forgetRecentView / syncRecentViewTitle (localStorage)', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = installLocalStorageStub();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('forgets a deleted stash', () => {
    saveRecentViews([view('a'), view('b')]);
    forgetRecentView('a');
    expect(loadRecentViews()).toEqual([view('b')]);
  });

  it('refreshes the title of a listed stash in place', () => {
    saveRecentViews([view('a'), view('b', 'Old')]);
    syncRecentViewTitle(view('b', 'Renamed'));
    expect(loadRecentViews()).toEqual([view('a'), view('b', 'Renamed')]);
  });

  it('never adds an unlisted stash and skips the write when nothing changed', () => {
    saveRecentViews([view('a')]);
    const before = store.get(STORAGE_KEY);
    const setItem = vi.spyOn(localStorage, 'setItem');
    syncRecentViewTitle(view('z', 'Other'));
    syncRecentViewTitle(view('a'));
    forgetRecentView('z');
    expect(setItem).not.toHaveBeenCalled();
    expect(store.get(STORAGE_KEY)).toBe(before);
  });
});
