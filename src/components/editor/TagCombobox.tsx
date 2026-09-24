import { useState, useRef, useCallback, useImperativeHandle } from 'react';
import type { Ref } from 'react';
import { useClickOutside } from '../../hooks/useClickOutside';
import type { TagInfo } from '../../types';

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
  availableTags: TagInfo[];
  inputLabelledBy?: string;
  /**
   * Imperative handle for the parent's Ctrl+S flush (see
   * {@link TagComboboxHandle}). Declared as a normal prop rather than through
   * `forwardRef`: React 19 passes `ref` to function components like any other
   * prop, and `forwardRef` is on its way out. Behaviour is unchanged —
   * `useImperativeHandle` accepts the same `Ref` value either way.
   */
  ref?: Ref<TagComboboxHandle>;
}

/**
 * Mirrors `MAX_TAGS` / `MAX_TAG_LENGTH` in `src/server/validation.ts`. Copied
 * rather than imported for the same reason `StashEditor` mirrors
 * `MAX_NAME_LENGTH` and `MAX_FILENAME_LENGTH`: these are client components and
 * `server/validation.ts` is server code.
 *
 * Without them the editor let a user add a 51st tag, or a tag longer than 100
 * characters, and said nothing — the limit only surfaced as a rejected save
 * once the whole stash had been composed. Both are enforced in `commitTag`
 * rather than on the input, because the field takes a comma-separated list and
 * an input-level cap would truncate a valid paste of many short tags.
 */
const MAX_TAGS = 50;
const MAX_TAG_LENGTH = 100;

export interface TagComboboxHandle {
  /**
   * Commit any half-typed tag text (same logic as the blur handler) and
   * return the tags that were actually added. The accompanying onChange
   * state update is batched by React, so a caller inside the same event
   * (e.g. StashEditor's Ctrl+S save) will NOT see it in its own `tags`
   * closure — it must append the returned tags to the payload itself.
   */
  commitPending: () => string[];
}

export default function TagCombobox({
  tags,
  onChange,
  availableTags,
  inputLabelledBy,
  ref,
}: Props) {
  const [input, setInput] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Inline notice for an add that was refused: an already-present tag, a tag
  // over the length limit, or one past the tag count limit. Mirrors
  // MetadataEditor's addWarning — a refused add used to be a silent no-op that
  // still cleared the input.
  const [warning, setWarning] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Tags are stored lowercase on commit, but availableTags from the API can
  // be mixed-case — compare case-insensitively everywhere.
  const filtered = availableTags
    .filter((t) => !tags.some((existing) => existing.toLowerCase() === t.tag.toLowerCase()))
    .filter((t) => !input || t.tag.toLowerCase().includes(input.toLowerCase()));

  // At the cap no further tag can be committed, so the suggestion list and the
  // "Create" entry would only offer adds that commitTag is about to refuse.
  const atTagLimit = tags.length >= MAX_TAGS;

  // Build the full option list: filtered suggestions + optional "Create" entry
  const showCreate =
    !atTagLimit &&
    !!input.trim() &&
    !availableTags.some((t) => t.tag.toLowerCase() === input.trim().toLowerCase());
  const visibleOptions = atTagLimit ? [] : filtered.slice(0, 10);
  const totalOptions = visibleOptions.length + (showCreate ? 1 : 0);

  // Commit without touching focus — used by the blur handler, where pulling
  // focus back into the input would steal it from the element the user just
  // clicked (e.g. the Save button). Pasted values may contain comma-separated
  // lists ("a, b, c") — split and commit each part with the same lowercase +
  // dedupe rules as typed input. Returns the tags actually added.
  const commitTag = (tag: string): string[] => {
    const parts = tag
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    const candidates: string[] = [];
    const dups: string[] = [];
    const tooLong: string[] = [];
    for (const part of parts) {
      if (candidates.includes(part)) continue; // repeated within the same input
      if (tags.includes(part)) {
        dups.push(part);
      } else if (part.length > MAX_TAG_LENGTH) {
        // `maxLength` on the input bounds what can be TYPED, but a pasted
        // "a, <100+ chars>, c" arrives as one field value, so every part still
        // has to be measured here.
        tooLong.push(part);
      } else {
        candidates.push(part);
      }
    }
    // Take only what still fits. Splitting rather than rejecting the whole
    // input keeps a paste that straddles the limit from losing the tags that
    // did fit.
    const capacity = Math.max(0, MAX_TAGS - tags.length);
    const added = candidates.slice(0, capacity);
    const overflow = candidates.length - added.length;
    if (added.length > 0) {
      onChange([...tags, ...added]);
    }

    const problems: string[] = [];
    if (dups.length > 0) {
      problems.push(
        `Tag${dups.length !== 1 ? 's' : ''} ${dups.map((d) => `"${d}"`).join(', ')} already added.`,
      );
    }
    if (tooLong.length > 0) {
      // Deliberately not quoted back: these are by definition over 100
      // characters and would bury the message they belong to.
      problems.push(
        `${tooLong.length} tag${tooLong.length !== 1 ? 's' : ''} skipped — longer than ${MAX_TAG_LENGTH} characters.`,
      );
    }
    if (overflow > 0) {
      problems.push(
        `Tag limit reached (${MAX_TAGS}) — ${overflow} tag${overflow !== 1 ? 's' : ''} not added.`,
      );
    }
    setWarning(problems.length > 0 ? problems.join(' ') : null);
    setInput('');
    setShowDropdown(false);
    setActiveIndex(-1);
    return added;
  };

  useImperativeHandle(ref, () => ({
    commitPending: () => (input.trim() ? commitTag(input) : []),
  }));

  const addTag = (tag: string) => {
    commitTag(tag);
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => {
    // Drop any refusal notice: removing a tag frees capacity, so a "Tag limit
    // reached" message would now be describing a state that no longer holds.
    setWarning(null);
    onChange(tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setShowDropdown(true);
      setActiveIndex((prev) => (totalOptions === 0 ? -1 : Math.min(prev + 1, totalOptions - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setShowDropdown(true);
      setActiveIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (showDropdown && activeIndex >= 0 && totalOptions > 0) {
        // Select the highlighted option
        if (activeIndex < visibleOptions.length) {
          addTag(visibleOptions[activeIndex]!.tag);
        } else {
          // "Create" option
          addTag(input);
        }
      } else if (input.trim()) {
        addTag(input);
      }
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]!);
    } else if (e.key === 'Escape') {
      // Escape means "cancel" — also drop the typed text, otherwise the blur
      // handler would still commit it as a tag afterwards.
      setInput('');
      setShowDropdown(false);
      setActiveIndex(-1);
    }
  };

  const closeDropdown = useCallback(() => {
    setShowDropdown(false);
    setActiveIndex(-1);
  }, []);
  // Only listen while the dropdown is open, so the hook's document-level
  // Escape handler doesn't swallow Escape presses meant for other UI.
  useClickOutside(wrapperRef, closeDropdown, showDropdown);

  const activeOptionId =
    showDropdown && activeIndex >= 0 ? `tag-combobox-option-${activeIndex}` : undefined;

  const dropdownVisible = showDropdown && totalOptions > 0;

  return (
    <div className="tag-combobox" ref={wrapperRef}>
      <div className="tag-combobox-input-wrapper" onClick={() => inputRef.current?.focus()}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowDropdown(true);
            setActiveIndex(-1);
            if (warning) setWarning(null);
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => {
            // Commit a typed-but-unconfirmed tag when focus truly leaves the
            // combobox — otherwise "python" typed without Enter is silently
            // dropped on Save. Dropdown option clicks never blur the input
            // (their mousedown is prevented below), so this cannot double-add.
            if (input.trim()) {
              commitTag(input);
            } else {
              setShowDropdown(false);
              setActiveIndex(-1);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            atTagLimit
              ? `Tag limit reached (${MAX_TAGS})`
              : tags.length === 0
                ? 'Type to add tags...'
                : 'Add more...'
          }
          // Deliberately NO `maxLength`, unlike the single-value name and
          // filename fields: this input accepts a comma-separated list, so a
          // per-tag cap applied to the whole field would truncate a legitimate
          // paste of many short tags. commitTag measures each part instead,
          // which covers typed and pasted input alike. The input also stays
          // enabled at the tag limit so existing text can be edited or
          // cleared — commitTag is what refuses the add, with a reason.
          className="tag-combobox-input"
          autoComplete="off"
          role="combobox"
          aria-expanded={dropdownVisible}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls="tag-combobox-listbox"
          aria-labelledby={inputLabelledBy}
          aria-activedescendant={activeOptionId}
          aria-invalid={warning ? true : undefined}
          // The warning below is a polite live region, so it is announced once
          // as it appears — a user who tabs back into an already-invalid field
          // heard nothing but "invalid". Point at it so the reason travels
          // with the field.
          aria-describedby={warning ? 'tag-combobox-warning' : undefined}
        />
      </div>
      {dropdownVisible && (
        <div id="tag-combobox-listbox" className="tag-combobox-dropdown" role="listbox">
          {visibleOptions.map((t, i) => (
            <button
              key={t.tag}
              id={`tag-combobox-option-${i}`}
              className={`tag-combobox-option${activeIndex === i ? ' active' : ''}`}
              // Keep focus in the input while clicking an option — a blur
              // here would commit the half-typed filter text as its own tag.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(t.tag)}
              role="option"
              aria-selected={activeIndex === i}
            >
              <span>{t.tag}</span>
              <span className="tag-combobox-count">{t.count}</span>
            </button>
          ))}
          {showCreate && (
            <button
              id={`tag-combobox-option-${visibleOptions.length}`}
              className={`tag-combobox-option tag-combobox-create${activeIndex === visibleOptions.length ? ' active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(input)}
              role="option"
              aria-selected={activeIndex === visibleOptions.length}
            >
              Create &quot;{input.trim()}&quot;
            </button>
          )}
        </div>
      )}
      {tags.length > 0 && (
        <div className="tag-combobox-tags">
          {tags.map((tag) => (
            <span key={tag} className="tag-combobox-tag">
              {tag}
              <button
                className="tag-combobox-tag-remove"
                // Removing a tag must not blur-commit a half-typed filter.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => removeTag(tag)}
                title={`Remove tag "${tag}"`}
                aria-label={`Remove tag "${tag}"`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
      {warning && (
        <div
          id="tag-combobox-warning"
          className="tag-combobox-warning"
          role="status"
          aria-live="polite"
          style={{ color: 'var(--accent-orange)', fontSize: 12, marginTop: 4 }}
        >
          {warning}
        </div>
      )}
    </div>
  );
}
