import { useMemo } from 'react';
import type { StashListItem, LayoutMode, SortMode } from '../types';
import { sortStashesWithFavorites } from '../utils/favorites';
import { sortStashes, SORT_OPTIONS } from '../utils/sort';
import { pluralize } from '../utils/format';
import StashCard from './StashCard';
import Spinner from './shared/Spinner';

interface Props {
  stashes: StashListItem[];
  total: number;
  layout: LayoutMode;
  sortMode: SortMode;
  loading: boolean;
  /** Active sidebar search term — it filters this list, so the dashboard
   * must show it (filter chip + honest empty state). */
  search: string;
  onClearSearch: () => void;
  filterTag: string;
  showArchived: boolean;
  favoriteIds: ReadonlySet<string>;
  onToggleShowArchived: () => void;
  onLayoutChange: (mode: LayoutMode) => void;
  onSortChange: (mode: SortMode) => void;
  onSelectStash: (id: string) => void;
  onNewStash: () => void;
  onFilterTag: (tag: string) => void;
  onToggleFavorite: (id: string) => void;
}

export default function Dashboard({
  stashes,
  total,
  layout,
  sortMode,
  loading,
  search,
  onClearSearch,
  filterTag,
  showArchived,
  favoriteIds,
  onToggleShowArchived,
  onLayoutChange,
  onSortChange,
  onSelectStash,
  onNewStash,
  onFilterTag,
  onToggleFavorite,
}: Props) {
  // First apply the user-chosen sort order, then pin favorites to the top
  // (favorites preserve the sorted order within each group).
  const orderedStashes = useMemo(
    () => sortStashesWithFavorites(sortStashes(stashes, sortMode), favoriteIds),
    [stashes, sortMode, favoriteIds],
  );

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="dashboard-title">
          <h1>Your Stashes</h1>
          <span className="stash-count" title="Total number of stashes stored">
            {pluralize(total, 'stash', 'stashes')}
          </span>
          {/* The server caps list responses (50 browse / 20 search), so the
              header total and the rendered cards can diverge — say so
              instead of silently looking complete. */}
          {stashes.length < total && (
            <span
              className="stash-count"
              title={`The list is capped — ${stashes.length} of ${total} stashes are shown. Use search or tag filters to narrow down.`}
            >
              showing {stashes.length}
            </span>
          )}
          {loading && stashes.length > 0 && (
            <span
              className="dashboard-refresh-indicator"
              role="status"
              aria-live="polite"
              title="Refreshing stash list"
            >
              <Spinner size={12} />
              <span className="sr-only">Refreshing</span>
            </span>
          )}
        </div>
        <div className="dashboard-actions">
          {search && (
            <span className="active-filter" title={`Showing stashes matching "${search}"`}>
              Search: {search}
              <button
                className="filter-clear"
                onClick={onClearSearch}
                title="Clear search"
                aria-label={`Clear search: ${search}`}
              >
                <span aria-hidden="true">x</span>
              </button>
            </span>
          )}
          {filterTag && (
            <span
              className="active-filter"
              title={`Showing only stashes tagged with "${filterTag}"`}
            >
              Tag: {filterTag}
              <button
                className="filter-clear"
                onClick={() => onFilterTag(filterTag)}
                title="Clear tag filter"
                aria-label={`Clear tag filter: ${filterTag}`}
              >
                <span aria-hidden="true">x</span>
              </button>
            </span>
          )}
          {showArchived && (
            <span
              className="active-filter active-filter-archive"
              title="Showing all stashes including archived"
            >
              Including archived
              <button
                className="filter-clear"
                onClick={onToggleShowArchived}
                title="Hide archived stashes"
                aria-label="Hide archived stashes"
              >
                <span aria-hidden="true">x</span>
              </button>
            </span>
          )}
          <label className="sort-control" title="Change how stashes are ordered">
            <span className="sr-only">Sort stashes by</span>
            <svg
              className="sort-control-icon"
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M11.5 15a.75.75 0 0 1-.53-.22l-2.75-2.75a.75.75 0 1 1 1.06-1.06l1.47 1.47V2.75a.75.75 0 0 1 1.5 0v9.69l1.47-1.47a.75.75 0 1 1 1.06 1.06l-2.75 2.75a.75.75 0 0 1-.53.22ZM1.75 4a.75.75 0 0 1 0-1.5h4.5a.75.75 0 0 1 0 1.5h-4.5Zm0 4a.75.75 0 0 1 0-1.5h3a.75.75 0 0 1 0 1.5h-3Zm0 4a.75.75 0 0 1 0-1.5h1.5a.75.75 0 0 1 0 1.5h-1.5Z" />
            </svg>
            <select
              className="sort-select"
              value={sortMode}
              onChange={(e) => onSortChange(e.target.value as SortMode)}
              aria-label="Sort stashes by"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <div className="layout-toggle">
            <button
              className={`layout-btn ${layout === 'grid' ? 'active' : ''}`}
              onClick={() => onLayoutChange('grid')}
              title="Grid view — show stashes as cards"
              aria-pressed={layout === 'grid'}
              aria-label="Grid view"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <rect x="1" y="1" width="6" height="6" rx="1" />
                <rect x="9" y="1" width="6" height="6" rx="1" />
                <rect x="1" y="9" width="6" height="6" rx="1" />
                <rect x="9" y="9" width="6" height="6" rx="1" />
              </svg>
            </button>
            <button
              className={`layout-btn ${layout === 'list' ? 'active' : ''}`}
              onClick={() => onLayoutChange('list')}
              title="List view — show stashes as rows"
              aria-pressed={layout === 'list'}
              aria-label="List view"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <rect x="1" y="2" width="14" height="2" rx="1" />
                <rect x="1" y="7" width="14" height="2" rx="1" />
                <rect x="1" y="12" width="14" height="2" rx="1" />
              </svg>
            </button>
          </div>
          <button
            className="btn btn-new-stash"
            onClick={onNewStash}
            title="Create a new stash to store files"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
            </svg>
            New Stash
          </button>
        </div>
      </div>

      {loading && stashes.length === 0 ? (
        <div className="loading" role="status" aria-live="polite">
          <Spinner size={18} />
          <span style={{ marginLeft: 10 }}>Loading stashes...</span>
        </div>
      ) : !loading && stashes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <svg width="36" height="36" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
            </svg>
          </div>
          <p>
            {search
              ? `No stashes match "${search}".`
              : filterTag || showArchived
                ? 'No stashes match the current filter.'
                : 'No stashes yet. Create your first one!'}
          </p>
          <button className="btn btn-new-stash" onClick={onNewStash}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
            </svg>
            New Stash
          </button>
        </div>
      ) : (
        // While `loading` is true but we still have a previous result set we
        // keep the grid visible and overlay a subtle spinner. This avoids the
        // "flash to empty" jank every time the user toggles a tag filter or
        // types in the sidebar search field.
        <div
          className={`stash-grid ${layout}${loading ? ' stash-grid-refreshing' : ''}`}
          aria-busy={loading || undefined}
        >
          {/*
            Keyboard-accessible "new stash" card. Was a bare <div onClick>
            previously, so keyboard-only users (and most assistive tech)
            could not invoke it. role+tabIndex+Enter/Space handler bring it
            in line with the StashCard buttons next to it without changing
            the existing pointer-click behavior.
          */}
          <div
            className="new-stash-card"
            onClick={onNewStash}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onNewStash();
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Create a new stash"
            title="Create a new stash"
          >
            <div className="new-stash-icon">
              <svg width="36" height="36" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
              </svg>
            </div>
            <div className="new-stash-text">New Stash</div>
          </div>
          {orderedStashes.map((stash) => (
            <StashCard
              key={stash.id}
              stash={stash}
              layout={layout}
              isFavorite={favoriteIds.has(stash.id)}
              onClick={() => onSelectStash(stash.id)}
              onFilterTag={onFilterTag}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      )}
    </div>
  );
}
