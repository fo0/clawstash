/**
 * Persistence for the Mermaid viewer's per-diagram zoom level.
 *
 * One localStorage key per stash+diagram. Nothing ever removed those keys when
 * a stash was deleted, so a long-lived browser profile accumulated them
 * forever — hence the LRU cap enforced on every write.
 *
 * Stored value format: `"<scale>|<writtenAtMs>"`. Legacy entries hold the bare
 * scale; they still parse (the reader splits on `|`) and sort as oldest, so
 * they are evicted first.
 */

export const ZOOM_STORAGE_PREFIX = 'clawstash_mermaid_zoom_';
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 10;

/** Maximum number of persisted zoom levels kept around. */
export const MAX_STORED_ZOOM_KEYS = 50;

type ZoomStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

function defaultStorage(): ZoomStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // Disabled storage (private mode, blocked cookies) throws on access.
    return null;
  }
}

export function loadStoredScale(
  key: string | undefined,
  storage: ZoomStorage | null = defaultStorage(),
): number | null {
  if (!key || !storage) return null;
  try {
    const raw = storage.getItem(ZOOM_STORAGE_PREFIX + key);
    if (!raw) return null;
    const n = Number.parseFloat(raw.split('|')[0] ?? '');
    return Number.isFinite(n) && n >= MIN_SCALE && n <= MAX_SCALE ? n : null;
  } catch {
    return null;
  }
}

export function saveScale(
  key: string,
  scale: number,
  storage: ZoomStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(ZOOM_STORAGE_PREFIX + key, `${scale}|${Date.now()}`);
    pruneStoredScales(storage);
  } catch {
    /* ignore quota / disabled storage */
  }
}

export function clearStoredScale(
  key: string,
  storage: ZoomStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(ZOOM_STORAGE_PREFIX + key);
  } catch {
    /* ignore */
  }
}

/**
 * Drop the least recently written zoom entries until at most
 * `MAX_STORED_ZOOM_KEYS` remain. Returns the number of evicted keys.
 */
export function pruneStoredScales(storage: ZoomStorage | null = defaultStorage()): number {
  if (!storage) return 0;
  try {
    const entries: { key: string; writtenAt: number }[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key || !key.startsWith(ZOOM_STORAGE_PREFIX)) continue;
      const writtenAt = Number.parseInt(storage.getItem(key)?.split('|')[1] ?? '', 10);
      entries.push({ key, writtenAt: Number.isFinite(writtenAt) ? writtenAt : 0 });
    }
    if (entries.length <= MAX_STORED_ZOOM_KEYS) return 0;

    entries.sort((a, b) => a.writtenAt - b.writtenAt || a.key.localeCompare(b.key));
    const evict = entries.slice(0, entries.length - MAX_STORED_ZOOM_KEYS);
    for (const entry of evict) storage.removeItem(entry.key);
    return evict.length;
  } catch {
    return 0;
  }
}
