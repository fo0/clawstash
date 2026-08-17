import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  clearDraft,
  draftKey,
  loadDraft,
  saveDraft,
  MAX_DRAFT_AGE_MS,
  MAX_DRAFT_CHARS,
  type EditorDraft,
} from '../editor-draft';

function installLocalStorageStub(options?: { throwOnSet?: boolean }) {
  const store = new Map<string, string>();
  const stub = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      if (options?.throwOnSet) throw new Error('QuotaExceededError');
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

function draft(overrides: Partial<EditorDraft> = {}): EditorDraft {
  return {
    savedAt: 1_000_000,
    name: 'Docker setup',
    description: 'compose files',
    tags: ['docker'],
    metadata: [{ key: 'agent', value: 'openclaw' }],
    files: [{ filename: 'compose.yml', content: 'services: {}', language: 'yaml' }],
    ...overrides,
  };
}

describe('draftKey', () => {
  it('scopes an existing stash by id and the new-stash form by a fixed suffix', () => {
    expect(draftKey('abc')).toBe('clawstash_editor_draft:abc');
    expect(draftKey(null)).toBe('clawstash_editor_draft:new');
    expect(draftKey('abc')).not.toBe(draftKey(null));
  });
});

describe('editor draft persistence', () => {
  beforeEach(() => installLocalStorageStub());
  afterEach(() => vi.unstubAllGlobals());

  it('returns null when nothing is stored', () => {
    expect(loadDraft('abc')).toBeNull();
  });

  it('round-trips a draft for the stash it was saved under', () => {
    const d = draft();
    expect(saveDraft('abc', d)).toBe(true);
    expect(loadDraft('abc', d.savedAt)).toEqual(d);
    // Another editor target must not see it.
    expect(loadDraft(null, d.savedAt)).toBeNull();
  });

  it('clearDraft removes only its own target', () => {
    saveDraft('abc', draft());
    saveDraft(null, draft());
    clearDraft('abc');
    expect(loadDraft('abc', 1_000_000)).toBeNull();
    expect(loadDraft(null, 1_000_000)).not.toBeNull();
  });

  it('drops and removes a draft past MAX_DRAFT_AGE_MS', () => {
    const d = draft();
    saveDraft('abc', d);
    expect(loadDraft('abc', d.savedAt + MAX_DRAFT_AGE_MS + 1)).toBeNull();
    // Removed, so a later read with a sane clock does not resurrect it.
    expect(loadDraft('abc', d.savedAt)).toBeNull();
  });

  it('keeps a draft whose timestamp is in the future (clock skew)', () => {
    const d = draft({ savedAt: 5_000_000 });
    saveDraft('abc', d);
    expect(loadDraft('abc', 1_000_000)).toEqual(d);
  });

  it('drops corrupted JSON and non-conforming shapes', () => {
    localStorage.setItem(draftKey('abc'), '{not json');
    expect(loadDraft('abc')).toBeNull();

    localStorage.setItem(draftKey('abc'), JSON.stringify({ savedAt: 1, name: 'only a name' }));
    expect(loadDraft('abc')).toBeNull();

    localStorage.setItem(
      draftKey('abc'),
      JSON.stringify(draft({ files: [{ filename: 'a.txt' }] as never })),
    );
    expect(loadDraft('abc')).toBeNull();

    localStorage.setItem(draftKey('abc'), JSON.stringify(draft({ tags: [1, 2] as never })));
    expect(loadDraft('abc')).toBeNull();
  });

  it('preserves the optional baseVersion', () => {
    const d = draft({ baseVersion: 3 });
    saveDraft('abc', d);
    expect(loadDraft('abc', d.savedAt)?.baseVersion).toBe(3);
  });

  it('skips oversized drafts and clears the smaller predecessor', () => {
    saveDraft('abc', draft());
    const huge = draft({
      files: [{ filename: 'big.txt', content: 'x'.repeat(MAX_DRAFT_CHARS), language: 'text' }],
    });
    expect(saveDraft('abc', huge)).toBe(false);
    expect(loadDraft('abc', 1_000_000)).toBeNull();
  });

  it('reports failure instead of throwing when storage rejects the write', () => {
    installLocalStorageStub({ throwOnSet: true });
    expect(saveDraft('abc', draft())).toBe(false);
  });
});

describe('editor draft without a DOM', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is inert during SSR', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('localStorage', undefined);
    expect(loadDraft('abc')).toBeNull();
    expect(saveDraft('abc', draft())).toBe(false);
    expect(() => clearDraft('abc')).not.toThrow();
  });
});
