import { useState, useRef, useCallback } from 'react';
import { useClickOutside } from '../../hooks/useClickOutside';
import type { TagInfo } from '../../types';

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
  availableTags: TagInfo[];
  inputLabelledBy?: string;
}

export default function TagCombobox({ tags, onChange, availableTags, inputLabelledBy }: Props) {
  const [input, setInput] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = availableTags
    .filter((t) => !tags.includes(t.tag))
    .filter((t) => !input || t.tag.toLowerCase().includes(input.toLowerCase()));

  // Build the full option list: filtered suggestions + optional "Create" entry
  const showCreate =
    !!input.trim() && !availableTags.some((t) => t.tag === input.trim().toLowerCase());
  const visibleOptions = filtered.slice(0, 10);
  const totalOptions = visibleOptions.length + (showCreate ? 1 : 0);

  // Commit without touching focus — used by the blur handler, where pulling
  // focus back into the input would steal it from the element the user just
  // clicked (e.g. the Save button).
  const commitTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput('');
    setShowDropdown(false);
    setActiveIndex(-1);
  };

  const addTag = (tag: string) => {
    commitTag(tag);
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => {
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
      setShowDropdown(false);
      setActiveIndex(-1);
    }
  };

  const closeDropdown = useCallback(() => {
    setShowDropdown(false);
    setActiveIndex(-1);
  }, []);
  useClickOutside(wrapperRef, closeDropdown);

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
          placeholder={tags.length === 0 ? 'Type to add tags...' : 'Add more...'}
          className="tag-combobox-input"
          autoComplete="off"
          role="combobox"
          aria-expanded={dropdownVisible}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls="tag-combobox-listbox"
          aria-labelledby={inputLabelledBy}
          aria-activedescendant={activeOptionId}
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
    </div>
  );
}
