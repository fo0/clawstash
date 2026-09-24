import { useState, useRef, useCallback } from 'react';
import { useClickOutside } from '../../hooks/useClickOutside';

export interface MetadataEntry {
  key: string;
  value: string;
  /**
   * The value string as produced by `metadataToEntries` — set ONLY when the
   * source metadata value was already a string. `entriesToMetadata` compares
   * against it to detect "the user never touched this row" and skip the
   * JSON re-parse for those. Absent for non-string sources and for rows the
   * user added, which keep the parse-on-save behaviour.
   */
  original?: string;
}

interface Props {
  entries: MetadataEntry[];
  onChange: (entries: MetadataEntry[]) => void;
  availableKeys: string[];
  /**
   * Id of the visible heading that names this editor. The editor is a
   * composite of several inputs, so no single `<label htmlFor>` can own it —
   * the wrapper takes `role="group"` + `aria-labelledby` instead, the same
   * shape the graph depth controls use.
   */
  labelledBy?: string;
}

export function metadataToEntries(metadata: Record<string, unknown>): MetadataEntry[] {
  return Object.entries(metadata).map(([key, value]) =>
    typeof value === 'string'
      ? { key, value, original: value }
      : { key, value: JSON.stringify(value) },
  );
}

export function entriesToMetadata(entries: MetadataEntry[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const entry of entries) {
    const key = entry.key.trim();
    if (!key) continue;
    // A string value the user never edited round-trips verbatim. Running it
    // through JSON.parse would silently retype it on a save the user never
    // asked for ("true" -> boolean, "123" -> number, "null" -> null) and the
    // trim would eat intentional padding. Only edited / newly added rows take
    // the parse path, where typing `{"a":1}` is a deliberate act.
    if (entry.original !== undefined && entry.value === entry.original) {
      result[key] = entry.value;
      continue;
    }
    const val = entry.value.trim();
    try {
      result[key] = JSON.parse(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

/**
 * The JSON type `entriesToMetadata` would store for this row, or `null` when it
 * is saved as a plain string (the common case) — see the parse rules there.
 *
 * Rendered next to the input so the retyping is visible BEFORE saving: typing
 * `123` or `true` in a value field silently produced a number/boolean, which
 * only surfaced later in the API payload.
 */
export function metadataValueType(entry: MetadataEntry): string | null {
  if (entry.original !== undefined && entry.value === entry.original) return null;
  const val = entry.value.trim();
  if (!val) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(val);
  } catch {
    return null;
  }
  if (parsed === null) return 'null';
  if (Array.isArray(parsed)) return 'array';
  if (typeof parsed === 'string') return null;
  return typeof parsed;
}

const PREVIEW_COUNT = 3;

/**
 * Mirrors `MAX_METADATA_KEYS` in `src/server/validation.ts`. Copied, not
 * imported: this is a client component and that module is server code (same
 * reason TagCombobox and StashEditor copy their limits). Counted per row, which
 * can only err on the safe side — a blank or duplicate key row saves as fewer
 * keys, never more.
 */
const MAX_METADATA_KEYS = 50;

/** Why `key` cannot be added next to `entries`, or null when it can. */
function addRefusal(key: string, entries: MetadataEntry[]): string | null {
  if (entries.some((e) => e.key === key)) return `Key "${key}" already exists.`;
  if (entries.length >= MAX_METADATA_KEYS) {
    return `Metadata limit reached (${MAX_METADATA_KEYS} keys) — remove an entry to add "${key}".`;
  }
  return null;
}

export default function MetadataEditor({ entries, onChange, availableKeys, labelledBy }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [showKeyDropdown, setShowKeyDropdown] = useState(false);
  // Highlighted suggestion index for keyboard navigation of the key dropdown.
  // -1 = nothing highlighted (mirrors TagCombobox). Keeps the key input
  // arrow-navigable + Enter-selectable instead of mouse-click only.
  const [activeIndex, setActiveIndex] = useState(-1);
  // Inline notice shown when an add is refused — a key that already exists, or
  // one past the key limit. Previously a duplicate add silently cleared the
  // input with no explanation.
  const [addWarning, setAddWarning] = useState<string | null>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Stable per-row IDs so React reconciles edits to the correct input when
  // rows are removed or reordered. Using `key={index}` made remove visually
  // carry the next row's text into the removed row's slot (React would treat
  // the row as reused). Pattern mirrors fileIds in StashEditor.tsx. Caller-
  // driven entries replacement keeps IDs in sync via removeEntry/addEntry —
  // a bare-length mismatch falls back to padding/truncating at the tail.
  const idCounter = useRef(0);
  const entryIds = useRef<number[]>([]);
  while (entryIds.current.length < entries.length) {
    entryIds.current.push(idCounter.current++);
  }
  if (entryIds.current.length > entries.length) {
    entryIds.current.length = entries.length;
  }

  const displayEntries = showAll ? entries : entries.slice(0, PREVIEW_COUNT);
  const hasMore = entries.length > PREVIEW_COUNT;
  // The server rejects the whole save past this many keys; without the guard
  // the limit only surfaced then, after the stash had been composed.
  const atKeyLimit = entries.length >= MAX_METADATA_KEYS;

  const existingKeys = entries.map((e) => e.key);
  // Keys occurring in more than one row (after trimming — save trims too).
  // entriesToMetadata assigns by key, so the later row silently overwrites
  // the earlier one; addEntry blocks duplicates but row EDITS could still
  // create them unnoticed. Flag the affected rows instead.
  const trimmedKeys = existingKeys.map((k) => k.trim());
  const duplicateKeys = new Set(trimmedKeys.filter((k, i) => k && trimmedKeys.indexOf(k) !== i));
  const filteredKeys = availableKeys
    .filter((k) => !existingKeys.includes(k))
    .filter((k) => !keyInput || k.toLowerCase().includes(keyInput.toLowerCase()));
  // Cap mirrors the render slice below so keyboard navigation and the visible
  // option list stay in lockstep.
  const visibleKeys = filteredKeys.slice(0, 8);
  // At the limit every suggestion would only lead to a refused add.
  const dropdownVisible = showKeyDropdown && visibleKeys.length > 0 && !atKeyLimit;
  const activeOptionId =
    dropdownVisible && activeIndex >= 0 ? `metadata-key-option-${activeIndex}` : undefined;

  const updateEntry = (index: number, field: 'key' | 'value', val: string) => {
    const updated = [...entries];
    updated[index] = { ...updated[index], [field]: val };
    onChange(updated);
  };

  const removeEntry = (index: number) => {
    entryIds.current.splice(index, 1);
    const remaining = entries.filter((_, i) => i !== index);
    onChange(remaining);
    // A shown refusal is about the key still in the input. Re-judge it against
    // the rows that remain: removing the duplicate row, or freeing a slot under
    // the limit, resolves it; removing an unrelated row does not.
    if (addWarning) {
      const typed = keyInput.trim();
      setAddWarning(typed ? addRefusal(typed, remaining) : null);
    }
  };

  const addEntry = (key: string) => {
    const trimmed = key.trim();
    if (!trimmed) return;
    // Duplicate key, or past the key limit — keep the typed value (so it
    // survives freeing a slot) and tell the user why nothing was added instead
    // of silently clearing the field.
    const refusal = addRefusal(trimmed, entries);
    if (refusal) {
      setAddWarning(refusal);
      return;
    }
    entryIds.current.push(idCounter.current++);
    onChange([...entries, { key: trimmed, value: '' }]);
    setShowAll(true);
    setAddWarning(null);
    setKeyInput('');
    setShowKeyDropdown(false);
    setActiveIndex(-1);
  };

  // Commit a typed-but-unconfirmed key when focus truly leaves the add row —
  // otherwise "purpose" typed without Enter is silently dropped on Save.
  // Mirrors TagCombobox's blur flush; every button inside this editor
  // suppresses its own blur (onMouseDown preventDefault) so a click on Add /
  // a suggestion / Remove can never double-add through this path.
  const handleKeyInputBlur = () => {
    if (keyInput.trim()) {
      addEntry(keyInput);
    } else {
      setShowKeyDropdown(false);
      setActiveIndex(-1);
    }
  };

  const handleKeyInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setShowKeyDropdown(true);
      setActiveIndex((prev) =>
        visibleKeys.length === 0 ? -1 : Math.min(prev + 1, visibleKeys.length - 1),
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setShowKeyDropdown(true);
      setActiveIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Prefer the highlighted suggestion; otherwise fall back to adding the
      // typed key (preserves the original Enter-adds-typed-key behaviour).
      if (dropdownVisible && activeIndex >= 0 && visibleKeys[activeIndex]) {
        addEntry(visibleKeys[activeIndex]);
      } else if (keyInput.trim()) {
        addEntry(keyInput);
      }
    } else if (e.key === 'Escape') {
      setShowKeyDropdown(false);
      setActiveIndex(-1);
    }
  };

  const closeKeyDropdown = useCallback(() => {
    setShowKeyDropdown(false);
    // Also drop a hover-set highlight — otherwise a later Enter in the key
    // input would silently add the stale highlighted suggestion.
    setActiveIndex(-1);
  }, []);
  // Only listen while the dropdown is open, so the hook's document-level
  // Escape handler doesn't swallow Escape presses meant for other UI.
  useClickOutside(dropdownRef, closeKeyDropdown, showKeyDropdown);

  return (
    <div className="metadata-editor" role="group" aria-labelledby={labelledBy}>
      {entries.length > 0 && (
        <div className="metadata-entries">
          {displayEntries.map((entry, index) => (
            <div key={entryIds.current[index]} className="metadata-entry-row">
              <input
                type="text"
                value={entry.key}
                onChange={(e) => updateEntry(index, 'key', e.target.value)}
                placeholder="Key"
                className="form-input metadata-key-input"
                aria-label={`Metadata key ${index + 1}`}
                aria-invalid={duplicateKeys.has(entry.key.trim()) || undefined}
                // `title` is a pointer-only affordance: it never reaches a
                // touch user and assistive tech may ignore it when the field
                // already has a label. Point the flagged rows at the warning
                // list below, which spells the same thing out in the DOM.
                aria-describedby={
                  duplicateKeys.has(entry.key.trim()) ? 'metadata-duplicate-keys' : undefined
                }
                title={
                  duplicateKeys.has(entry.key.trim())
                    ? `Duplicate key "${entry.key.trim()}" — only the last value is saved`
                    : undefined
                }
              />
              <input
                type="text"
                value={entry.value}
                onChange={(e) => updateEntry(index, 'value', e.target.value)}
                placeholder="Value"
                className="form-input metadata-value-input"
                aria-label={`Metadata value for "${entry.key || `entry ${index + 1}`}"`}
              />
              {(() => {
                const type = metadataValueType(entry);
                return type ? (
                  <span
                    className="metadata-value-type"
                    title={`Saved as JSON ${type}, not as text. Wrap it in quotes to keep it a string.`}
                  >
                    {type}
                  </span>
                ) : null;
              })()}
              <button
                className="btn btn-sm btn-ghost btn-remove"
                // Removing a row must not blur-commit a half-typed key.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => removeEntry(index)}
                title={`Remove metadata entry "${entry.key || `#${index + 1}`}"`}
                aria-label={`Remove metadata entry "${entry.key || `#${index + 1}`}"`}
              >
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                </svg>
              </button>
            </div>
          ))}
          {hasMore && !showAll && (
            <button
              className="btn btn-sm btn-ghost metadata-show-more"
              // Expanding the list must not blur-commit a half-typed key.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowAll(true)}
            >
              Show {entries.length - PREVIEW_COUNT} more...
            </button>
          )}
          {hasMore && showAll && (
            <button
              className="btn btn-sm btn-ghost metadata-show-more"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowAll(false)}
            >
              Show less
            </button>
          )}
          {duplicateKeys.size > 0 && (
            <div
              id="metadata-duplicate-keys"
              className="metadata-dup-warning"
              role="status"
              aria-live="polite"
              style={{ color: 'var(--accent-orange)', fontSize: 12, marginTop: 4 }}
            >
              Duplicate key{duplicateKeys.size !== 1 ? 's' : ''}:{' '}
              {Array.from(duplicateKeys).join(', ')} — only the last value per key is saved.
            </div>
          )}
        </div>
      )}

      <div className="metadata-add-row" ref={dropdownRef}>
        <input
          ref={keyInputRef}
          type="text"
          value={keyInput}
          onChange={(e) => {
            setKeyInput(e.target.value);
            setShowKeyDropdown(true);
            setActiveIndex(-1);
            if (addWarning) setAddWarning(null);
          }}
          onFocus={() => setShowKeyDropdown(true)}
          onBlur={handleKeyInputBlur}
          onKeyDown={handleKeyInputKeyDown}
          placeholder={
            atKeyLimit ? `Metadata limit reached (${MAX_METADATA_KEYS} keys)` : 'Add key...'
          }
          className="form-input metadata-add-input"
          role="combobox"
          aria-expanded={dropdownVisible}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls="metadata-key-listbox"
          aria-activedescendant={activeOptionId}
          aria-label="Add metadata key"
          aria-invalid={addWarning ? true : undefined}
          // Same reason as the entry rows above: the warning is a polite live
          // region announced once, so without this a user returning to an
          // already-invalid field hears "invalid" and no reason.
          aria-describedby={addWarning ? 'metadata-add-warning' : undefined}
          autoComplete="off"
        />
        <button
          className="btn btn-sm btn-secondary"
          // Keep focus in the input: a blur here would commit the typed key
          // through handleKeyInputBlur and this onClick would then add it twice.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (keyInput.trim()) addEntry(keyInput);
          }}
          // Left enabled at the limit on purpose: a disabled button drops out
          // of the tab order and cannot explain itself, while a click here
          // routes through addEntry, which names the limit in the live region.
          title={
            atKeyLimit
              ? `A stash holds at most ${MAX_METADATA_KEYS} metadata keys — remove one to add another`
              : 'Add metadata entry'
          }
        >
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
          </svg>
          Add
        </button>
        {dropdownVisible && (
          <div
            id="metadata-key-listbox"
            className="tag-combobox-dropdown metadata-key-dropdown"
            role="listbox"
          >
            {visibleKeys.map((k, i) => (
              <button
                key={k}
                id={`metadata-key-option-${i}`}
                className={`tag-combobox-option${activeIndex === i ? ' active' : ''}`}
                // Same reason as the Add button: never blur-commit the filter
                // text as its own key while picking a suggestion.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addEntry(k)}
                onMouseEnter={() => setActiveIndex(i)}
                role="option"
                aria-selected={activeIndex === i}
              >
                {k}
              </button>
            ))}
          </div>
        )}
      </div>
      {addWarning && (
        <div
          id="metadata-add-warning"
          className="metadata-dup-warning"
          role="status"
          aria-live="polite"
          style={{ color: 'var(--accent-orange)', fontSize: 12, marginTop: 4 }}
        >
          {addWarning}
        </div>
      )}
    </div>
  );
}
