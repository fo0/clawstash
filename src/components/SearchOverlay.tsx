import { useState, useEffect, useRef, useCallback } from 'react';
import type { StashListItem } from '../types';
import { api } from '../api';
import { formatRelativeTime } from '../utils/format';
import { splitHighlight } from '../utils/highlight';
import { SEARCH_DEBOUNCE_MS } from '../utils/constants';
import { loadRecentViews, type RecentView } from '../utils/recent-views';
import { buildStashUrl } from '../utils/stash-url';
import { isModifiedClick } from '../utils/link-click';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import Spinner from './shared/Spinner';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectStash: (id: string) => void;
  /**
   * Hand the current query to the dashboard's own search. The overlay caps its
   * result list, so a query matching more stashes than fit used to dead-end at
   * "refine to narrow" — the dashboard is capped too, but offers "Load more"
   * up to the full total.
   */
  onSearchAll: (query: string) => void;
}

export default function SearchOverlay({ open, onClose, onSelectStash, onSearchAll }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StashListItem[]>([]);
  // Full server-side match count. The result list is capped (see the `limit`
  // below), so `total > results.length` means matches are hidden — surfaced to
  // the user, mirroring the dashboard/sidebar "showing N" honesty pattern.
  const [total, setTotal] = useState(0);
  const [recent, setRecent] = useState<RecentView[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Each search bumps this; only the latest search may write results.
  // Prevents an in-flight request from a previous query (or a previous
  // open of the overlay) from overwriting newer results.
  const searchGenRef = useRef(0);

  // Focus input when opened, reset state
  useEffect(() => {
    if (open) {
      searchGenRef.current++;
      // Cancel any in-flight debounce from a previous open of the overlay,
      // otherwise a queued doSearch(value) from before the close fires
      // ~200ms into the new open and briefly populates stale results.
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = undefined;
      }
      setQuery('');
      setResults([]);
      setTotal(0);
      setActiveIndex(0);
      setLoading(false);
      // Refresh the "Recently viewed" shortcut list each time the overlay
      // opens so it reflects stashes opened since the last open.
      setRecent(loadRecentViews());
      // Small delay to ensure the DOM is rendered
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    const gen = ++searchGenRef.current;
    setLoading(true);
    try {
      const res = await api.listStashes({ search: q, limit: 12 });
      if (gen !== searchGenRef.current) return;
      setResults(res.stashes);
      setTotal(res.total);
      setActiveIndex(0);
    } catch {
      if (gen !== searchGenRef.current) return;
      setResults([]);
      setTotal(0);
    } finally {
      if (gen === searchGenRef.current) setLoading(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Clearing the field falls back to the "Recently viewed" list — drop the
    // stale results synchronously (waiting for the debounce would render both
    // lists at once, with duplicate option ids) and invalidate any in-flight
    // search. Mirrors handleClearQuery; re-homes the highlight to item 0.
    if (!value.trim()) {
      debounceRef.current = undefined;
      searchGenRef.current++;
      setResults([]);
      setTotal(0);
      setActiveIndex(0);
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void doSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  // Clear the query without closing the overlay — Escape closes it entirely, so
  // there was previously no way to wipe the field and fall back to the "Recently
  // viewed" list short of selecting-all + delete. Mirrors the sidebar search's
  // inline clear button.
  const handleClearQuery = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = undefined;
    }
    // Invalidate any in-flight search so a late response cannot repopulate the
    // list after the field has been cleared.
    searchGenRef.current++;
    setQuery('');
    setResults([]);
    setTotal(0);
    setActiveIndex(0);
    setLoading(false);
    inputRef.current?.focus();
  };

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Keep Tab inside the dialog and hand focus back to the trigger on close —
  // without it Tab walked into the dashboard behind the backdrop and closing
  // dropped focus to <body>.
  useFocusTrap(dialogRef, open);

  // The dashboard behind the backdrop still scrolled under the wheel.
  useBodyScrollLock(open);

  // Global Escape listener so closing works even when focus has moved off
  // the dialog (e.g. user clicked into something else briefly). The inner
  // dialog handler still catches Escape when the dialog itself has focus;
  // this is the belt-and-braces fallback. Closes BACKLOG #100.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        // The overlay consumes this Escape. Without stopPropagation the event
        // would continue to App's window-level hotkey handler, which treats
        // Escape as "back to dashboard" and would ALSO navigate away from the
        // currently open stash/editor/graph. (App additionally guards via
        // modalOpenRef — this is defense in depth.)
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

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

  /**
   * Open a result in a new browser tab and leave the overlay open, so several
   * stashes can be pulled out of one search without reopening it. Backs the
   * Ctrl/Cmd+Enter binding; a modified mouse click is handled natively by the
   * anchor the rows are rendered as.
   *
   * `noopener,noreferrer` matches the rest of the app's new-tab links — the
   * opened tab must not reach back through `window.opener`.
   */
  const openInNewTab = (id: string) => {
    window.open(buildStashUrl(window.location.origin, id), '_blank', 'noopener,noreferrer');
  };

  // Escape hatch for a capped result list: push the query into the dashboard
  // search, which pages up to the full match count, and close the overlay.
  const handleShowAll = () => {
    const q = query.trim();
    if (!q) return;
    onSearchAll(q);
    onClose();
  };

  // Arrow/Enter navigation targets whichever list is on screen: search results
  // when a query is present, otherwise the "Recently viewed" shortcuts. Both
  // item shapes expose an `id`, so selection is uniform.
  const navItems: { id: string }[] = query.trim() ? results : recent;

  // The id of the listbox that is actually rendered right now, or `undefined`
  // when neither is — drives both `aria-controls` and `aria-expanded` from one
  // source so they can never disagree.
  const listboxId =
    navItems.length === 0
      ? undefined
      : query.trim()
        ? 'search-overlay-results'
        : 'search-overlay-recent';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i < navItems.length - 1 ? i + 1 : i));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i > 0 ? i - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = navItems[activeIndex];
      if (!item) return;
      // Ctrl/Cmd+Enter mirrors the modified click: open the highlighted result
      // in a new tab and keep the overlay (and the query) in place. Plain
      // Enter still navigates in place and closes.
      if (e.ctrlKey || e.metaKey) {
        openInNewTab(item.id);
      } else {
        handleSelect(item.id);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  // Wrap the parts of `text` that match the current query in <mark> so the
  // reason a result surfaced is visible. Segments render as React text nodes
  // (XSS-safe); non-match segments stay bare strings (no key needed).
  const renderHighlighted = (text: string) =>
    splitHighlight(text, query).map((seg, i) =>
      seg.match ? (
        <mark key={i} className="search-overlay-mark">
          {seg.text}
        </mark>
      ) : (
        seg.text
      ),
    );

  if (!open) return null;

  return (
    // NOTE: no aria-hidden on the backdrop — the dialog is its child, and
    // aria-hidden on an ancestor would remove the entire dialog (including
    // the focused input) from the accessibility tree.
    <div className="search-overlay-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="search-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Quick search stashes"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="search-overlay-input-row">
          <svg
            aria-hidden="true"
            className="search-overlay-icon"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="search-overlay-input"
            placeholder="Search stashes..."
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            aria-label="Search stashes"
            // The field owns a listbox and moves a virtual cursor through it
            // with aria-activedescendant, which is the combobox pattern — as a
            // plain textbox assistive tech never announced that a result list
            // had opened. Same spelling the editor's TagCombobox uses.
            role="combobox"
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-expanded={listboxId !== undefined}
            // Only reference a listbox that is actually rendered — a query with
            // zero results (or no query and no recents) renders no list, so a
            // dangling aria-controls id would point at nothing.
            aria-controls={listboxId}
            aria-activedescendant={
              navItems.length > 0 ? `search-overlay-option-${activeIndex}` : undefined
            }
          />
          {query && (
            <button
              type="button"
              className="search-overlay-input-clear"
              onClick={handleClearQuery}
              title="Clear search"
              aria-label="Clear search"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </button>
          )}
          <kbd className="search-overlay-kbd">Esc</kbd>
        </div>

        {loading && query.trim() && (
          <div className="search-overlay-status" role="status" aria-live="polite">
            <Spinner size={14} />
            <span style={{ marginLeft: 8 }}>Searching...</span>
          </div>
        )}

        {!loading && query.trim() && results.length === 0 && (
          <div className="search-overlay-status" role="status" aria-live="polite">
            No stashes found
          </div>
        )}

        {results.length > 0 && (
          <>
            {/* Outside the listbox on purpose: the listbox content model only
                permits `option` (and grouping) children, and a live-region
                status row nested inside made assistive tech announce it as
                one of the results. Keeping it above also stops the count from
                scrolling out of view with the list. */}
            {/* The row is a plain flex container; only the text carries the
                live region. An interactive control inside `aria-live` would be
                re-announced on every keystroke that changes the count. */}
            <div className="search-overlay-results-count">
              <span aria-live="polite" role="status">
                {total > results.length
                  ? `Showing first ${results.length} of ${total} matches`
                  : `${results.length} result${results.length !== 1 ? 's' : ''}`}
              </span>
              {total > results.length && (
                <button
                  type="button"
                  className="search-overlay-show-all"
                  onClick={handleShowAll}
                  title={`Search the dashboard for "${query.trim()}" to page through all ${total} matches`}
                >
                  Show all {total}
                </button>
              )}
            </div>
            <div
              className="search-overlay-results"
              ref={listRef}
              role="listbox"
              id="search-overlay-results"
              aria-label={`${results.length} result${results.length !== 1 ? 's' : ''}`}
            >
              {results.map((stash, idx) => (
                // A real link, matching the dashboard cards and the sidebar
                // rows, so a result can be opened in a new tab with the
                // browser's own affordances (Ctrl/Cmd+click, middle-click,
                // context menu). `role="option"` keeps the listbox semantics
                // the overlay's arrow-key navigation relies on.
                <a
                  key={stash.id}
                  id={`search-overlay-option-${idx}`}
                  className={`search-overlay-item ${idx === activeIndex ? 'active' : ''}`}
                  role="option"
                  aria-selected={idx === activeIndex}
                  href={buildStashUrl('', stash.id)}
                  // onMouseMove (not onMouseEnter): keyboard-nav's scrollIntoView
                  // shifts the list under a stationary cursor, which would fire
                  // enter events and yank the highlight back to the hovered row.
                  onMouseMove={() => setActiveIndex(idx)}
                  onClick={(e) => {
                    // A modified click asked the browser for a new tab — step
                    // aside and let it happen instead of navigating in place.
                    if (isModifiedClick(e)) return;
                    e.preventDefault();
                    handleSelect(stash.id);
                  }}
                >
                  <div className="search-overlay-item-main">
                    <span className="search-overlay-item-name">
                      {renderHighlighted(stash.name || stash.files[0]?.filename || 'Untitled')}
                    </span>
                    {stash.files.length > 0 && (
                      <span className="search-overlay-item-files">
                        {stash.files.length} file{stash.files.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {stash.description && (
                    <div className="search-overlay-item-desc">
                      {renderHighlighted(
                        stash.description.length > 100
                          ? stash.description.slice(0, 100) + '...'
                          : stash.description,
                      )}
                    </div>
                  )}
                  <div className="search-overlay-item-meta">
                    {stash.tags.length > 0 && (
                      <span className="search-overlay-item-tags">
                        {stash.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="search-overlay-tag">
                            {tag}
                          </span>
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
                </a>
              ))}
            </div>
          </>
        )}

        {!query.trim() && recent.length > 0 && (
          <>
            {/* Section heading, not an option — kept outside the listbox for
                the same content-model reason as the result count above. */}
            <div className="search-overlay-results-count">Recently viewed</div>
            <div
              className="search-overlay-results"
              role="listbox"
              id="search-overlay-recent"
              aria-label={`${recent.length} recently viewed stash${recent.length !== 1 ? 'es' : ''}`}
            >
              {recent.map((item, idx) => (
                // Same link treatment as the result rows above — a recently
                // viewed stash is just as likely to be wanted in a new tab.
                <a
                  key={item.id}
                  id={`search-overlay-option-${idx}`}
                  className={`search-overlay-item ${idx === activeIndex ? 'active' : ''}`}
                  role="option"
                  aria-selected={idx === activeIndex}
                  href={buildStashUrl('', item.id)}
                  onMouseMove={() => setActiveIndex(idx)}
                  onClick={(e) => {
                    if (isModifiedClick(e)) return;
                    e.preventDefault();
                    handleSelect(item.id);
                  }}
                >
                  <div className="search-overlay-item-main">
                    <span className="search-overlay-item-name">{item.title}</span>
                  </div>
                </a>
              ))}
            </div>
          </>
        )}

        {!query.trim() && recent.length === 0 && (
          <div className="search-overlay-hint">
            <span>Type to search by name, filename, or content</span>
          </div>
        )}

        <div className="search-overlay-footer">
          <span className="search-overlay-footer-item">
            <kbd>&uarr;</kbd>
            <kbd>&darr;</kbd> navigate
          </span>
          <span className="search-overlay-footer-item">
            <kbd>&crarr;</kbd> open
          </span>
          {/* Both modifier labels rather than a platform-detected one: the
              footer is a hint strip, and naming both keeps it correct on
              every platform without a client-only render. */}
          <span className="search-overlay-footer-item">
            <kbd>ctrl</kbd>
            <span className="search-overlay-footer-or">/</span>
            <kbd>&#8984;</kbd>
            <kbd>&crarr;</kbd> new tab
          </span>
          <span className="search-overlay-footer-item">
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
