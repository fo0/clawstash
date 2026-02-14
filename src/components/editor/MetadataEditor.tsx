import { useState, useEffect, useRef } from 'react';

export interface MetadataEntry {
  key: string;
  value: string;
}

interface Props {
  entries: MetadataEntry[];
  onChange: (entries: MetadataEntry[]) => void;
  availableKeys: string[];
}

export function metadataToEntries(metadata: Record<string, unknown>): MetadataEntry[] {
  return Object.entries(metadata).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  }));
}

export function entriesToMetadata(entries: MetadataEntry[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const entry of entries) {
    if (!entry.key.trim()) continue;
    const val = entry.value.trim();
    try {
      const parsed = JSON.parse(val);
      result[entry.key.trim()] = parsed;
    } catch {
      result[entry.key.trim()] = val;
    }
  }
  return result;
}

const PREVIEW_COUNT = 3;

export default function MetadataEditor({ entries, onChange, availableKeys }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [showKeyDropdown, setShowKeyDropdown] = useState(false);
  const keyInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const displayEntries = showAll ? entries : entries.slice(0, PREVIEW_COUNT);
  const hasMore = entries.length > PREVIEW_COUNT;

  const existingKeys = entries.map((e) => e.key);
  const filteredKeys = availableKeys
    .filter((k) => !existingKeys.includes(k))
    .filter((k) => !keyInput || k.toLowerCase().includes(keyInput.toLowerCase()));

  const updateEntry = (index: number, field: 'key' | 'value', val: string) => {
    const updated = [...entries];
    updated[index] = { ...updated[index], [field]: val };
    onChange(updated);
  };

  const removeEntry = (index: number) => {
    onChange(entries.filter((_, i) => i !== index));
  };

  const addEntry = (key: string) => {
    const trimmed = key.trim();
    if (trimmed && !entries.some((e) => e.key === trimmed)) {
      onChange([...entries, { key: trimmed, value: '' }]);
      setShowAll(true);
    }
    setKeyInput('');
    setShowKeyDropdown(false);
  };

  const handleKeyInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (keyInput.trim()) addEntry(keyInput);
    } else if (e.key === 'Escape') {
      setShowKeyDropdown(false);
    }
  };

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowKeyDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="metadata-editor">
      {entries.length > 0 && (
        <div className="metadata-entries">
          {displayEntries.map((entry, index) => (
            <div key={index} className="metadata-entry-row">
              <input
                type="text"
                value={entry.key}
                onChange={(e) => updateEntry(index, 'key', e.target.value)}
                placeholder="Key"
                className="form-input metadata-key-input"
              />
              <input
                type="text"
                value={entry.value}
                onChange={(e) => updateEntry(index, 'value', e.target.value)}
                placeholder="Value"
                className="form-input metadata-value-input"
              />
              <button className="btn btn-sm btn-ghost btn-remove" onClick={() => removeEntry(index)} title="Remove entry">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                </svg>
              </button>
            </div>
          ))}
          {hasMore && !showAll && (
            <button className="btn btn-sm btn-ghost metadata-show-more" onClick={() => setShowAll(true)}>
              Show {entries.length - PREVIEW_COUNT} more...
            </button>
          )}
          {hasMore && showAll && (
            <button className="btn btn-sm btn-ghost metadata-show-more" onClick={() => setShowAll(false)}>
              Show less
            </button>
          )}
        </div>
      )}

      <div className="metadata-add-row" ref={dropdownRef}>
        <input
          ref={keyInputRef}
          type="text"
          value={keyInput}
          onChange={(e) => { setKeyInput(e.target.value); setShowKeyDropdown(true); }}
          onFocus={() => setShowKeyDropdown(true)}
          onKeyDown={handleKeyInputKeyDown}
          placeholder="Add key..."
          className="form-input metadata-add-input"
          autoComplete="off"
        />
        <button className="btn btn-sm btn-secondary" onClick={() => { if (keyInput.trim()) addEntry(keyInput); }} title="Add metadata entry">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
          </svg>
          Add
        </button>
        {showKeyDropdown && filteredKeys.length > 0 && (
          <div className="tag-combobox-dropdown metadata-key-dropdown">
            {filteredKeys.slice(0, 8).map((k) => (
              <button key={k} className="tag-combobox-option" onClick={() => addEntry(k)}>
                {k}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
