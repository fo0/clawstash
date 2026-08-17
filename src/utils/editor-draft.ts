// Crash recovery for the stash editor.
//
// The editor already guards *deliberate* exits — `onDirtyChange` feeds App's
// `confirmDiscardUnsaved()` for in-app navigation, and a `beforeunload`
// handler covers real page unloads. Neither survives a tab crash, an OS
// restart, or a browser that kills a backgrounded tab, and the unload prompt
// is dismissible. In all of those cases everything typed since the editor was
// opened is gone with no trace.
//
// While the editor is dirty its form state is therefore mirrored into
// localStorage (debounced by the caller). Reopening the same editor target
// finds the draft and offers it back. The draft is cleared on a successful
// save and whenever the editor unmounts after having been dirty — so a
// deliberate discard never resurrects, and the banner only ever appears after
// an exit that ran no cleanup at all.
//
// Persistence mirrors the `favorites.ts` / `recent-views.ts` pattern: a
// JSON-encoded value under a stable localStorage key, SSR-safe, shape-checked
// on read, and silent on quota errors. Pure (no React) so it can be
// unit-tested directly.

/** localStorage key prefix. The suffix is the stash id, or `new`. */
const KEY_PREFIX = 'clawstash_editor_draft:';

/**
 * Drafts larger than this are not persisted. A stash file may be up to 10 MB
 * and the whole `localStorage` origin quota is typically 5–10 MB, so mirroring
 * a large stash would either throw `QuotaExceededError` or evict every other
 * preference the app stores. Recovery is a convenience; it must never cost the
 * user their layout, sort order or favorites.
 */
export const MAX_DRAFT_CHARS = 512 * 1024;

/**
 * Drafts older than this are ignored on read (and dropped). A forgotten draft
 * from weeks ago is far more likely to be noise than the work the user is
 * looking for.
 */
export const MAX_DRAFT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface DraftFile {
  filename: string;
  content: string;
  language: string;
}

export interface DraftMetadataEntry {
  key: string;
  value: string;
}

export interface EditorDraft {
  /** Epoch ms of the last autosave — rendered as relative time in the banner. */
  savedAt: number;
  /**
   * `version` of the stash the draft was based on (edit mode only). Lets the
   * banner warn when the stash has moved on since — restoring would then
   * overwrite someone else's newer content.
   */
  baseVersion?: number;
  name: string;
  description: string;
  tags: string[];
  metadata: DraftMetadataEntry[];
  files: DraftFile[];
}

/** localStorage key for an editor target: an existing stash id, or a new stash. */
export function draftKey(stashId: string | null): string {
  return `${KEY_PREFIX}${stashId ?? 'new'}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isDraftFile(value: unknown): value is DraftFile {
  if (typeof value !== 'object' || value === null) return false;
  const f = value as DraftFile;
  return (
    typeof f.filename === 'string' &&
    typeof f.content === 'string' &&
    typeof f.language === 'string'
  );
}

function isDraftMetadataEntry(value: unknown): value is DraftMetadataEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as DraftMetadataEntry;
  return typeof e.key === 'string' && typeof e.value === 'string';
}

/**
 * Type guard for a persisted draft. Every field is checked because the value
 * is hand-editable and is fed straight into the editor's form state — a
 * malformed `files` array would crash the render, not just look odd.
 */
function isEditorDraft(value: unknown): value is EditorDraft {
  if (typeof value !== 'object' || value === null) return false;
  const d = value as EditorDraft;
  return (
    typeof d.savedAt === 'number' &&
    Number.isFinite(d.savedAt) &&
    typeof d.name === 'string' &&
    typeof d.description === 'string' &&
    isStringArray(d.tags) &&
    Array.isArray(d.metadata) &&
    d.metadata.every(isDraftMetadataEntry) &&
    Array.isArray(d.files) &&
    d.files.every(isDraftFile) &&
    (d.baseVersion === undefined || typeof d.baseVersion === 'number')
  );
}

/** Remove the stored draft for this editor target. No-op during SSR. */
export function clearDraft(stashId: string | null): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(draftKey(stashId));
  } catch {
    // Storage disabled — nothing was persisted to remove.
  }
}

/**
 * Read the draft for this editor target, or null when there is none, it is
 * corrupted, or it has expired. An expired / corrupted entry is removed so it
 * cannot be re-examined on every open.
 */
export function loadDraft(stashId: string | null, now: number = Date.now()): EditorDraft | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  let raw: string | null;
  try {
    raw = localStorage.getItem(draftKey(stashId));
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearDraft(stashId);
    return null;
  }
  if (!isEditorDraft(parsed)) {
    clearDraft(stashId);
    return null;
  }
  // `savedAt` in the future (clock skew / hand-edited) counts as fresh rather
  // than expired — dropping the user's work over a wrong system clock would be
  // the worse failure.
  if (now - parsed.savedAt > MAX_DRAFT_AGE_MS) {
    clearDraft(stashId);
    return null;
  }
  return parsed;
}

/**
 * Persist a draft for this editor target. Returns false when nothing was
 * written (SSR, storage disabled/full, or over {@link MAX_DRAFT_CHARS}); the
 * caller keeps working either way — recovery is best-effort by design.
 */
export function saveDraft(stashId: string | null, draft: EditorDraft): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return false;
  const serialized = JSON.stringify(draft);
  if (serialized.length > MAX_DRAFT_CHARS) {
    // An earlier, smaller draft of the same edit would now be misleading
    // (it predates the content that pushed the stash over the cap), so drop it.
    clearDraft(stashId);
    return false;
  }
  try {
    localStorage.setItem(draftKey(stashId), serialized);
    return true;
  } catch {
    return false;
  }
}
