import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadRecentViews,
  saveRecentViews,
  addRecentView,
  recordRecentView,
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
