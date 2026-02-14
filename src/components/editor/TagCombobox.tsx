import { useState, useEffect, useRef } from 'react';
import type { TagInfo } from '../../types';

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
  availableTags: TagInfo[];
}

export default function TagCombobox({ tags, onChange, availableTags }: Props) {
  const [input, setInput] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = availableTags
    .filter((t) => !tags.includes(t.tag))
    .filter((t) => !input || t.tag.toLowerCase().includes(input.toLowerCase()));

  const addTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput('');
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (input.trim()) addTag(input);
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="tag-combobox" ref={wrapperRef}>
      <div className="tag-combobox-input-wrapper" onClick={() => inputRef.current?.focus()}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? 'Type to add tags...' : 'Add more...'}
          className="tag-combobox-input"
          autoComplete="off"
        />
      </div>
      {showDropdown && filtered.length > 0 && (
        <div className="tag-combobox-dropdown">
          {filtered.slice(0, 10).map((t) => (
            <button key={t.tag} className="tag-combobox-option" onClick={() => addTag(t.tag)}>
              <span>{t.tag}</span>
              <span className="tag-combobox-count">{t.count}</span>
            </button>
          ))}
          {input.trim() && !availableTags.some((t) => t.tag === input.trim().toLowerCase()) && (
            <button className="tag-combobox-option tag-combobox-create" onClick={() => addTag(input)}>
              Create &quot;{input.trim()}&quot;
            </button>
          )}
        </div>
      )}
      {showDropdown && filtered.length === 0 && input.trim() && (
        <div className="tag-combobox-dropdown">
          <button className="tag-combobox-option tag-combobox-create" onClick={() => addTag(input)}>
            Create &quot;{input.trim()}&quot;
          </button>
        </div>
      )}
      {tags.length > 0 && (
        <div className="tag-combobox-tags">
          {tags.map((tag) => (
            <span key={tag} className="tag-combobox-tag">
              {tag}
              <button className="tag-combobox-tag-remove" onClick={() => removeTag(tag)} title="Remove tag">&times;</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
