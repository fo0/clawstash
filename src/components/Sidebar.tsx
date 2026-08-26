import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';
import { useQuickSearchHint } from '../hooks/useQuickSearchHint';
import type { JSX } from 'react';
import type { SortMode, StashListItem, SettingsSection, TagInfo } from '../types';
import { formatDate } from '../utils/format';
import { splitHighlight } from '../utils/highlight';
import { sortStashes } from '../utils/sort';
import { sortStashesWithFavorites } from '../utils/favorites';
import { buildStashUrl } from '../utils/stash-url';
import { isModifiedClick } from '../utils/link-click';

interface Props {
  stashes: StashListItem[];
  /** Full result count from the server — the list itself is capped. */
  total: number;
  /**
   * True while a stash list request is in flight — disables "Load more" and
   * labels it, mirroring the dashboard's button.
   */
  loading?: boolean;
  /**
   * Widen the list by one more page. Same handler the dashboard's "Load more"
   * uses, so both surfaces stay on one server-ranked result set.
   */
  onLoadMore?: () => void;
  /** Dashboard sort order — the sidebar list mirrors it. */
  sortMode: SortMode;
  /** Pinned stashes — sorted to the top, same as on the dashboard. */
  favoriteIds: ReadonlySet<string>;
  selectedId: string | null;
  search: string;
  onSearch: (query: string) => void;
  filterTag: string;
  onFilterTag: (tag: string) => void;
  tags: TagInfo[];
  recentTags: string[];
  showArchived: boolean;
  onToggleShowArchived: () => void;
  onSelectStash: (id: string) => void;
  onNewStash: () => void;
  onGoHome: () => void;
  onGraphView: () => void;
  onSettingsView: () => void;
  isSettingsView: boolean;
  settingsSection: SettingsSection;
  onSettingsSection: (section: SettingsSection) => void;
  onLogout?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

const SETTINGS_SECTIONS: { id: SettingsSection; label: string; icon: JSX.Element }[] = [
  {
    id: 'welcome',
    label: 'Dashboard',
    icon: (
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    id: 'general',
    label: 'General',
    icon: (
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="4" x2="4" y1="21" y2="14" />
        <line x1="4" x2="4" y1="10" y2="3" />
        <line x1="12" x2="12" y1="21" y2="12" />
        <line x1="12" x2="12" y1="8" y2="3" />
        <line x1="20" x2="20" y1="21" y2="16" />
        <line x1="20" x2="20" y1="12" y2="3" />
        <line x1="2" x2="6" y1="14" y2="14" />
        <line x1="10" x2="14" y1="8" y2="8" />
        <line x1="18" x2="22" y1="16" y2="16" />
      </svg>
    ),
  },
  {
    id: 'api',
    label: 'API & Tokens',
    icon: (
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
      </svg>
    ),
  },
  {
    id: 'backup',
    label: 'GitHub Backup',
    icon: (
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
        <path d="M12 12v9" />
        <path d="m16 16-4-4-4 4" />
      </svg>
    ),
  },
  {
    id: 'storage',
    label: 'Storage',
    icon: (
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5V19A9 3 0 0 0 21 19V5" />
        <path d="M3 12A9 3 0 0 0 21 12" />
      </svg>
    ),
  },
  {
    id: 'about',
    label: 'About',
    icon: (
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
    ),
  },
];

export default function Sidebar({
  stashes,
  total,
  loading,
  onLoadMore,
  sortMode,
  favoriteIds,
  selectedId,
  search,
  onSearch,
  filterTag,
  onFilterTag,
  tags,
  recentTags,
  showArchived,
  onToggleShowArchived,
  onSelectStash,
  onNewStash,
  onGoHome,
  onGraphView,
  onSettingsView,
  isSettingsView,
  settingsSection,
  onSettingsSection,
  onLogout,
  isOpen,
  onClose,
}: Props) {
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  // Index of the keyboard-highlighted tag option. The dropdown's search field
  // filtered the list but offered no way to act on it without the mouse —
  // typing "back" then still required Tab-ing down into the options.
  const [tagHighlight, setTagHighlight] = useState(0);
  const tagFilterRef = useRef<HTMLDivElement>(null);
  const tagOptionsRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const stashListRef = useRef<HTMLDivElement>(null);

  // Same ordering pipeline as Dashboard: sort first, then lift favorites to
  // the top. Without it the sidebar kept the server's `updated_at DESC` order
  // and disagreed with the dashboard the user just picked an order in.
  const orderedStashes = useMemo(
    () => sortStashesWithFavorites(sortStashes(stashes, sortMode), favoriteIds),
    [stashes, sortMode, favoriteIds],
  );
  // "⌘K" on Apple platforms, "Ctrl+K" elsewhere. Alt+K still works and stays
  // in the tooltip, but the hint shows the accelerator users reach for.
  const quickSearchKey = useQuickSearchHint();

  const closeTagDropdown = useCallback(() => {
    setTagDropdownOpen(false);
    setTagSearch('');
    setTagHighlight(0);
  }, []);
  useClickOutside(tagFilterRef, closeTagDropdown, tagDropdownOpen);

  const openTagDropdown = useCallback(() => {
    setTagDropdownOpen(true);
    setTagSearch('');
    setTagHighlight(0);
  }, []);

  const filteredTags = tagSearch
    ? tags.filter((t) => t.tag.toLowerCase().includes(tagSearch.toLowerCase()))
    : tags;

  /** Apply a tag filter from the dropdown and close it (shared by click + Enter). */
  const applyTagFilter = useCallback(
    (tag: string) => {
      onFilterTag(tag);
      closeTagDropdown();
      onClose?.();
    },
    [onFilterTag, closeTagDropdown, onClose],
  );

  /**
   * Keyboard navigation for the tag-search field: Down/Up move the highlight,
   * Enter applies the highlighted tag. Focus deliberately stays in the input
   * (combobox pattern, mirroring the quick-search overlay) — the option
   * buttons stay clickable and Tab-reachable as before.
   */
  const handleTagSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setTagHighlight((i) => (i < filteredTags.length - 1 ? i + 1 : i));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setTagHighlight((i) => (i > 0 ? i - 1 : 0));
    } else if (e.key === 'Enter') {
      const target = filteredTags[tagHighlight];
      if (!target) return;
      e.preventDefault();
      applyTagFilter(target.tag);
    }
  };

  // Keep the highlighted option in view while arrowing through a long list.
  useEffect(() => {
    if (!tagDropdownOpen) return;
    tagOptionsRef.current
      ?.querySelector('.sidebar-tag-option.highlighted')
      ?.scrollIntoView({ block: 'nearest' });
  }, [tagHighlight, tagDropdownOpen]);

  /**
   * The stash rows, in DOM order. Read from the DOM rather than from a ref
   * array so the order can never drift from what is rendered (the list is
   * re-sorted by `sortMode` + favorites on every change).
   */
  const stashRows = useCallback(
    (): HTMLAnchorElement[] =>
      Array.from(stashListRef.current?.querySelectorAll<HTMLAnchorElement>('a.sidebar-item') ?? []),
    [],
  );

  /** Move focus to the row at `index` (clamped). Returns false on an empty list. */
  const focusStashRow = useCallback(
    (index: number) => {
      const rows = stashRows();
      if (rows.length === 0) return false;
      const row = rows[Math.max(0, Math.min(index, rows.length - 1))];
      row.focus();
      row.scrollIntoView({ block: 'nearest' });
      return true;
    },
    [stashRows],
  );

  /**
   * Arrow-key navigation for the stash list. `/` focuses the search field, but
   * from there the only way into the results was Tab — which walks the filter
   * button, the "New Stash" button and the archive toggle first, then one stop
   * per row. Down/Up now step through the rows directly (Home/End jump to the
   * ends), and Up from the first row hands focus back to the search field, so
   * the field and the list behave as one keyboard unit. Enter/Space on a row
   * already opens the stash (the rows are real links).
   */
  const handleStashListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    const rows = stashRows();
    // Only react when focus is actually on a row — the container also hosts
    // the empty state, and a stray key elsewhere must keep its default.
    const current = rows.indexOf(document.activeElement as HTMLAnchorElement);
    if (current === -1) return;
    e.preventDefault();
    if (e.key === 'ArrowDown') focusStashRow(current + 1);
    else if (e.key === 'Home') focusStashRow(0);
    else if (e.key === 'End') focusStashRow(rows.length - 1);
    else if (current === 0) searchInputRef.current?.focus();
    else focusStashRow(current - 1);
  };

  /**
   * Wrap the parts of `text` matching the active stash search in <mark>, so a
   * filtered list row shows *why* it matched — the quick-search overlay has
   * done this since it shipped, while the sidebar (driven by the very same
   * search term) rendered plain text.
   *
   * Segments render as React text nodes, so this stays XSS-safe. With no
   * active search the helper short-circuits to the raw string, which keeps the
   * common unfiltered render allocation-free.
   */
  const renderHighlighted = (text: string) => {
    if (!search.trim()) return text;
    return splitHighlight(text, search).map((seg, i) =>
      seg.match ? (
        <mark key={i} className="sidebar-item-mark">
          {seg.text}
        </mark>
      ) : (
        seg.text
      ),
    );
  };

  return (
    <aside className={`sidebar${isOpen ? ' sidebar-open' : ''}`}>
      <div className="sidebar-header">
        {onClose && (
          <button className="sidebar-close-btn" onClick={onClose} aria-label="Close menu">
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="sidebar-logo"
          onClick={onGoHome}
          title="Go to dashboard"
          aria-label="Go to dashboard"
        >
          <span className="logo-icon">CS</span>
          <span className="logo-text">ClawStash</span>
        </button>
        <button
          className="sidebar-graph-btn"
          onClick={onGraphView}
          title="Tag Graph — visualize tag connections"
          aria-label="Tag Graph — visualize tag connections"
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="4" cy="4" r="2" fill="currentColor" stroke="none" />
            <circle cx="12" cy="3" r="2" fill="currentColor" stroke="none" />
            <circle cx="3" cy="12" r="2" fill="currentColor" stroke="none" />
            <circle cx="13" cy="11" r="2" fill="currentColor" stroke="none" />
            <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />
            <line x1="4" y1="4" x2="8" y2="8" />
            <line x1="12" y1="3" x2="8" y2="8" />
            <line x1="3" y1="12" x2="8" y2="8" />
            <line x1="13" y1="11" x2="8" y2="8" />
            <line x1="4" y1="4" x2="12" y2="3" />
            <line x1="3" y1="12" x2="13" y2="11" />
          </svg>
        </button>
      </div>

      {!isSettingsView && (
        <>
          <div className="sidebar-search">
            <div className="search-input-wrapper">
              <input
                ref={searchInputRef}
                id="sidebar-stash-search"
                type="text"
                placeholder="Search stashes..."
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                // Escape clears the field instead of bubbling up to the global
                // Escape handler that navigates away — much faster way to reset
                // search than reaching for the mouse.
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && search) {
                    e.preventDefault();
                    e.stopPropagation();
                    onSearch('');
                  } else if (e.key === 'ArrowDown') {
                    // Step straight from the query into the results, the way
                    // the quick-search overlay and the tag dropdown already do.
                    if (focusStashRow(0)) e.preventDefault();
                  }
                }}
                className="search-input"
                title={`Search by name, filename, or content — / to focus, Down arrow to step into the list, Esc to clear, ${quickSearchKey} (or Alt+K) for quick search`}
                aria-label="Search stashes"
              />
              {search ? (
                <button
                  type="button"
                  className="search-input-clear"
                  onClick={() => onSearch('')}
                  title="Clear search (Esc)"
                  aria-label="Clear search"
                >
                  <svg
                    aria-hidden="true"
                    width="12"
                    height="12"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                  </svg>
                </button>
              ) : (
                <kbd
                  className="search-input-kbd"
                  title={`${quickSearchKey} (or Alt+K) for the quick search overlay`}
                >
                  {quickSearchKey}
                </kbd>
              )}
            </div>
          </div>

          {tags.length > 0 && (
            <div className="sidebar-tag-filter" ref={tagFilterRef}>
              {filterTag ? (
                <div className="sidebar-active-tag">
                  <svg
                    aria-hidden="true"
                    className="sidebar-tag-icon"
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
                  </svg>
                  <span
                    className="sidebar-active-tag-name"
                    onClick={() => (tagDropdownOpen ? closeTagDropdown() : openTagDropdown())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (tagDropdownOpen) closeTagDropdown();
                        else openTagDropdown();
                      } else if (e.key === 'ArrowDown' && !tagDropdownOpen) {
                        // Down opens the list — the accelerator every native
                        // select and combobox offers.
                        e.preventDefault();
                        openTagDropdown();
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-expanded={tagDropdownOpen}
                    aria-haspopup="listbox"
                    aria-label={`Change tag filter, currently "${filterTag}"`}
                    title="Click to change tag filter"
                  >
                    {filterTag}
                  </span>
                  <button
                    className="sidebar-active-tag-clear"
                    onClick={() => {
                      onFilterTag(filterTag);
                      setTagDropdownOpen(false);
                      setTagSearch('');
                    }}
                    title="Clear tag filter"
                    aria-label="Clear tag filter"
                  >
                    <svg
                      aria-hidden="true"
                      width="12"
                      height="12"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                    >
                      <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="sidebar-tag-filter-btn"
                  onClick={() => (tagDropdownOpen ? closeTagDropdown() : openTagDropdown())}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' && !tagDropdownOpen) {
                      e.preventDefault();
                      openTagDropdown();
                    }
                  }}
                  title="Filter stashes by tag"
                  aria-expanded={tagDropdownOpen}
                  aria-haspopup="listbox"
                >
                  <svg
                    aria-hidden="true"
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
                  </svg>
                  Filter by tag
                </button>
              )}
              {tagDropdownOpen && (
                <div
                  className="sidebar-tag-dropdown"
                  // Escape dismisses the dropdown — matches the Escape-to-close
                  // idiom used by the stash search field, quick-search overlay,
                  // and tag combobox. stopPropagation also prevents Escape on an
                  // option button from bubbling to the global handler, which
                  // would otherwise navigate back to the dashboard from an open
                  // stash / graph view.
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      closeTagDropdown();
                    }
                  }}
                >
                  {tags.length > 5 && (
                    <div className="sidebar-tag-search">
                      <input
                        type="text"
                        placeholder="Search tags..."
                        value={tagSearch}
                        onChange={(e) => {
                          setTagSearch(e.target.value);
                          // Re-home the highlight on every keystroke — the
                          // filtered list changes under it otherwise.
                          setTagHighlight(0);
                        }}
                        onKeyDown={handleTagSearchKeyDown}
                        className="sidebar-tag-search-input"
                        aria-label="Search tags"
                        // This field drives the listbox below through
                        // aria-activedescendant, which only reaches assistive
                        // tech from a combobox — a bare textbox announced the
                        // typed query and never the highlighted option. Same
                        // wiring the metadata key field and TagCombobox use.
                        role="combobox"
                        aria-expanded
                        aria-haspopup="listbox"
                        aria-autocomplete="list"
                        // The browser's own autofill list would otherwise cover
                        // the tag options.
                        autoComplete="off"
                        // Only point at a listbox that actually has options.
                        aria-controls={filteredTags.length > 0 ? 'sidebar-tag-options' : undefined}
                        aria-activedescendant={
                          filteredTags.length > 0 ? `sidebar-tag-option-${tagHighlight}` : undefined
                        }
                        // This input only exists once the user opened the tag
                        // filter, so focusing it completes that action rather
                        // than hijacking focus on load.
                        // eslint-disable-next-line jsx-a11y/no-autofocus -- revealed by a user action
                        autoFocus
                      />
                    </div>
                  )}
                  <div
                    className="sidebar-tag-options"
                    id="sidebar-tag-options"
                    ref={tagOptionsRef}
                    role="listbox"
                    aria-label="Tags"
                  >
                    {filteredTags.map((t, idx) => (
                      <button
                        key={t.tag}
                        type="button"
                        id={`sidebar-tag-option-${idx}`}
                        role="option"
                        aria-selected={filterTag === t.tag}
                        className={`sidebar-tag-option ${filterTag === t.tag ? 'active' : ''}${
                          idx === tagHighlight ? ' highlighted' : ''
                        }`}
                        // onMouseMove, not onMouseEnter: arrow-key scrolling
                        // shifts the list under a stationary cursor, which
                        // would otherwise yank the highlight back.
                        onMouseMove={() => setTagHighlight(idx)}
                        onClick={() => applyTagFilter(t.tag)}
                      >
                        <span className="sidebar-tag-option-name">{t.tag}</span>
                        <span className="sidebar-tag-option-count">{t.count}</span>
                      </button>
                    ))}
                    {filteredTags.length === 0 && (
                      <div className="sidebar-tag-empty">No matching tags</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {recentTags.length > 0 && !filterTag && (
            <div className="sidebar-recent-tags">
              {recentTags.map((tag) => (
                <button
                  key={tag}
                  className="sidebar-recent-tag"
                  onClick={() => {
                    onFilterTag(tag);
                    onClose?.();
                  }}
                  title={`Filter by "${tag}"`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          <div className="sidebar-btn-group">
            <button
              className="btn btn-new-stash sidebar-new-btn"
              onClick={onNewStash}
              title="Create a new stash to store files"
            >
              <svg
                aria-hidden="true"
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
              </svg>
              New Stash
            </button>
          </div>

          <button
            className={`sidebar-archive-toggle ${showArchived ? 'active' : ''}`}
            onClick={onToggleShowArchived}
            title={showArchived ? 'Hide archived stashes' : 'Show archived stashes'}
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.75 3h12.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75H1.75A.75.75 0 0 1 1 5.25v-1.5A.75.75 0 0 1 1.75 3ZM2 7.5h12v5.75a.75.75 0 0 1-.75.75H2.75a.75.75 0 0 1-.75-.75Zm4.25 1.5a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5Z" />
            </svg>
            {showArchived ? 'Showing archived' : 'Show archived'}
          </button>

          {stashes.length > 0 && (
            // No aria-live here — it would announce on every search keystroke;
            // screen readers get the results from the list itself.
            <div className="sidebar-list-count">
              {/* Use the server's total — the returned list is capped, so
                  counting rendered rows would disagree with the dashboard. */}
              {total} stash{total !== 1 ? 'es' : ''}
              {(search || filterTag) && ' matching'}
              {stashes.length < total && ` · showing ${stashes.length}`}
            </div>
          )}

          <div className="sidebar-list" ref={stashListRef} onKeyDown={handleStashListKeyDown}>
            {orderedStashes.map((stash) => (
              // A real link, so a row can be opened in a new tab the way every
              // other list on the web can (Ctrl/Cmd+click, middle-click,
              // context menu) — plain clicks still navigate inside the SPA.
              <a
                key={stash.id}
                className={`sidebar-item ${selectedId === stash.id ? 'active' : ''}`}
                href={buildStashUrl('', stash.id)}
                onClick={(e) => {
                  if (isModifiedClick(e)) return;
                  e.preventDefault();
                  onSelectStash(stash.id);
                }}
                onKeyDown={(e) => {
                  // Enter activates the link natively; Space would scroll the
                  // list instead, so keep the explicit handler for it.
                  if (e.key === ' ') {
                    e.preventDefault();
                    onSelectStash(stash.id);
                  }
                }}
                aria-current={selectedId === stash.id ? 'true' : undefined}
                title={`${stash.name || stash.files[0]?.filename || 'Untitled'} — ${stash.files.length} file${stash.files.length !== 1 ? 's' : ''}`}
              >
                <div className="sidebar-item-title">
                  {renderHighlighted(stash.name || stash.files[0]?.filename || 'Untitled')}
                  {stash.archived && <span className="sidebar-item-archived-badge">Archived</span>}
                </div>
                <div className="sidebar-item-meta">
                  <span className="sidebar-item-filename">
                    {stash.files[0]?.filename && renderHighlighted(stash.files[0].filename)}
                  </span>
                </div>
                <div className="sidebar-item-footer">
                  <span className="sidebar-item-date">{formatDate(stash.updated_at)}</span>
                </div>
              </a>
            ))}
            {/* An empty sidebar used to read "No stashes found" whatever caused
                it, with no way out — the dashboard has said WHY and offered the
                next action since it shipped, while the sidebar (which owns the
                search field and the tag filter that cause it) dead-ended. */}
            {stashes.length === 0 &&
              (search || filterTag ? (
                <div className="sidebar-empty">
                  <span className="sidebar-empty-text">
                    {search && filterTag
                      ? `No stashes match "${search}" with tag "${filterTag}".`
                      : search
                        ? `No stashes match "${search}".`
                        : `No stashes tagged "${filterTag}".`}
                  </span>
                  <span className="sidebar-empty-actions">
                    {search && (
                      <button
                        type="button"
                        className="sidebar-empty-action"
                        onClick={() => onSearch('')}
                        title="Clear the search field"
                      >
                        Clear search
                      </button>
                    )}
                    {filterTag && (
                      <button
                        type="button"
                        className="sidebar-empty-action"
                        onClick={() => onFilterTag(filterTag)}
                        title="Clear the tag filter"
                      >
                        Clear tag filter
                      </button>
                    )}
                  </span>
                </div>
              ) : (
                <div className="sidebar-empty">
                  <span className="sidebar-empty-text">
                    {showArchived ? 'No stashes yet.' : 'No active stashes.'}
                  </span>
                  <span className="sidebar-empty-actions">
                    {!showArchived && (
                      <button
                        type="button"
                        className="sidebar-empty-action"
                        onClick={onToggleShowArchived}
                        title="Include archived stashes in the list"
                      >
                        Show archived
                      </button>
                    )}
                    <button
                      type="button"
                      className="sidebar-empty-action"
                      onClick={onNewStash}
                      title="Create a new stash to store files"
                    >
                      New Stash
                    </button>
                  </span>
                </div>
              ))}
            {/* The sidebar admitted "showing N" of a larger total but offered no
                way to widen the list — the only path to stash 51 was to leave
                for the dashboard and press its "Load more". Same handler, so
                both lists stay one server-ranked result set. */}
            {onLoadMore && stashes.length > 0 && stashes.length < total && (
              <button
                type="button"
                className="sidebar-load-more"
                onClick={onLoadMore}
                disabled={loading}
                title={`Show more of the ${total} matching stashes`}
              >
                {loading ? 'Loading…' : `Load more (${stashes.length} of ${total})`}
              </button>
            )}
          </div>
        </>
      )}

      {isSettingsView && (
        <>
          <div className="sidebar-settings-header">
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>Settings</span>
          </div>

          <div className="sidebar-list">
            {SETTINGS_SECTIONS.map((section) => (
              <div
                key={section.id}
                className={`sidebar-settings-nav-item ${settingsSection === section.id ? 'active' : ''}`}
                onClick={() => {
                  onSettingsSection(section.id);
                  onClose?.();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSettingsSection(section.id);
                    onClose?.();
                  }
                }}
                role="button"
                tabIndex={0}
                // aria-current, not aria-pressed: these are nav items marking
                // the selected section, not toggle buttons.
                aria-current={settingsSection === section.id ? 'page' : undefined}
              >
                <span className="sidebar-settings-nav-icon">{section.icon}</span>
                {section.label}
              </div>
            ))}

            <div className="sidebar-settings-divider" />

            <div
              className="sidebar-settings-nav-item sidebar-settings-back"
              onClick={onGoHome}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onGoHome();
                }
              }}
              role="button"
              tabIndex={0}
            >
              <span className="sidebar-settings-nav-icon">
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 1.06L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z" />
                </svg>
              </span>
              Back to Stashes
            </div>
          </div>
        </>
      )}

      {!isSettingsView && (
        <div className="sidebar-footer">
          <button
            className="sidebar-footer-settings-btn"
            onClick={onSettingsView}
            title="Settings, API tokens, and administration"
            aria-label="Settings, API tokens, and administration"
          >
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Settings
          </button>
          {onLogout && (
            <button
              className="sidebar-footer-logout-btn"
              onClick={onLogout}
              title="Sign out"
              aria-label="Sign out"
            >
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" x2="9" y1="12" y2="12" />
              </svg>
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
