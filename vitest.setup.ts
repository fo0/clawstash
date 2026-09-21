// Node 24+ carries `localStorage` and `sessionStorage` on `globalThis` itself,
// and without `--localstorage-file` that accessor yields `undefined` or throws.
// Vitest's jsdom environment only copies the window keys the Node global does
// not already have — and its `window` IS `globalThis` — so jsdom's own Storage
// is unreachable and every bare `localStorage.…` in a component test fails.
// CI pins Node 26 while a developer machine on Node 22 has no such global,
// which is why this only ever went red in the pipeline.
//
// Where the environment's Storage is unusable, install an in-memory one — the
// same stub the storage-backed unit tests already build by hand (see
// src/utils/__tests__/sidebar-width.test.ts). Node-environment tests have no
// `window` and are left alone; where jsdom's Storage does work, it is kept.

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    getItem: (key: string) => store.get(String(key)) ?? null,
    setItem: (key: string, value: string) => {
      store.set(String(key), String(value));
    },
    removeItem: (key: string) => {
      store.delete(String(key));
    },
    clear: () => {
      store.clear();
    },
  };
}

function isUsable(key: 'localStorage' | 'sessionStorage'): boolean {
  try {
    // Reading alone is what Node's unconfigured accessor rejects, but a getter
    // handing back a broken object would only surface on first use.
    const storage = globalThis[key] as Storage | undefined;
    if (!storage) return false;
    storage.getItem('__clawstash_storage_probe__');
    return true;
  } catch {
    return false;
  }
}

if (typeof window !== 'undefined') {
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    if (isUsable(key)) continue;
    Object.defineProperty(globalThis, key, {
      value: createMemoryStorage(),
      configurable: true,
      enumerable: true,
      writable: true,
    });
  }
}
