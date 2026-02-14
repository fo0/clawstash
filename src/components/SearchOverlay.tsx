import { useState, useEffect, useRef, useCallback } from 'react';
import type { StashListItem } from '../types';
import { api } from '../api';
import { formatRelativeTime } from '../utils/format';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectStash: (id: string) => void;
}

export default function SearchOverlay({ open, onClose, onSelectStash }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StashListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Focus input when opened, reset state
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setActiveIndex(0);
      setLoading(false);
      // Small delay to ensure the DOM is rendered
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.listStashes({ search: q, limit: 12 });
      setResults(res.stashes);
      setActiveIndex(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 200);
  };

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector('.search-overlay-item.active');
    if (active) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const handleSelect = (id: string) => {
    onSelectStash(id);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => (i < results.length - 1 ? i + 1 : i));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => (i > 0 ? i - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[activeIndex]) {
        handleSelect(results[activeIndex].id);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="search-overlay-backdrop" onMouseDown={onClose}>
      <div className="search-overlay" role="dialog" aria-label="Quick search stashes" onMouseDown={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="search-overlay-input-row">
          <svg className="search-overlay-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="search-overlay-input"
            placeholder="Search stashes..."
            value={query}
            onChange={e => handleInputChange(e.target.value)}
          />
          <kbd className="search-overlay-kbd">Esc</kbd>
        </div>

        {loading && query.trim() && (
          <div className="search-overlay-status">Searching...</div>
        )}

        {!loading && query.trim() && results.length === 0 && (
          <div className="search-overlay-status">No stashes found</div>
        )}

        {results.length > 0 && (
          <div className="search-overlay-results" ref={listRef}>
            {results.map((stash, idx) => (
              <div
                key={stash.id}
                className={`search-overlay-item ${idx === activeIndex ? 'active' : ''}`}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => handleSelect(stash.id)}
              >
                <div className="search-overlay-item-main">
                  <span className="search-overlay-item-name">
                    {stash.name || stash.files[0]?.filename || 'Untitled'}
                  </span>
                  {stash.files.length > 0 && (
                    <span className="search-overlay-item-files">
                      {stash.files.length} file{stash.files.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {stash.description && (
                  <div className="search-overlay-item-desc">
                    {stash.description.length > 100
                      ? stash.description.slice(0, 100) + '...'
                      : stash.description}
                  </div>
                )}
                <div className="search-overlay-item-meta">
                  {stash.tags.length > 0 && (
                    <span className="search-overlay-item-tags">
                      {stash.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="search-overlay-tag">{tag}</span>
                      ))}
                      {stash.tags.length > 3 && (
                        <span className="search-overlay-tag-more">+{stash.tags.length - 3}</span>
                      )}
                    </span>
                  )}
                  <span className="search-overlay-item-date">
                    {formatRelativeTime(stash.updated_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {!query.trim() && (
          <div className="search-overlay-hint">
            <span>Type to search by name, filename, or content</span>
          </div>
        )}

        <div className="search-overlay-footer">
          <span className="search-overlay-footer-item">
            <kbd>&uarr;</kbd><kbd>&darr;</kbd> navigate
          </span>
          <span className="search-overlay-footer-item">
            <kbd>&crarr;</kbd> open
          </span>
          <span className="search-overlay-footer-item">
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
