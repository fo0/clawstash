import type { StashListItem, LayoutMode } from '../types';
import StashCard from './StashCard';

interface Props {
  stashes: StashListItem[];
  total: number;
  layout: LayoutMode;
  loading: boolean;
  filterTag: string;
  onLayoutChange: (mode: LayoutMode) => void;
  onSelectStash: (id: string) => void;
  onNewStash: () => void;
  onFilterTag: (tag: string) => void;
}

export default function Dashboard({
  stashes,
  total,
  layout,
  loading,
  filterTag,
  onLayoutChange,
  onSelectStash,
  onNewStash,
  onFilterTag,
}: Props) {
  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="dashboard-title">
          <h1>Your Stashes</h1>
          <span className="stash-count" title="Total number of stashes stored">{total} stashes</span>
        </div>
        <div className="dashboard-actions">
          {filterTag && (
            <span className="active-filter" title={`Showing only stashes tagged with "${filterTag}"`}>
              Tag: {filterTag}
              <button className="filter-clear" onClick={() => onFilterTag(filterTag)} title="Clear tag filter">x</button>
            </span>
          )}
          <div className="layout-toggle">
            <button
              className={`layout-btn ${layout === 'grid' ? 'active' : ''}`}
              onClick={() => onLayoutChange('grid')}
              title="Grid view — show stashes as cards"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
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
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="1" y="2" width="14" height="2" rx="1" />
                <rect x="1" y="7" width="14" height="2" rx="1" />
                <rect x="1" y="12" width="14" height="2" rx="1" />
              </svg>
            </button>
          </div>
          <button className="btn btn-new-stash" onClick={onNewStash} title="Create a new stash to store files">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
            </svg>
            New Stash
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading stashes...</div>
      ) : stashes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <svg width="36" height="36" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
            </svg>
          </div>
          <p>No stashes yet. Create your first one!</p>
          <button className="btn btn-new-stash" onClick={onNewStash}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
            </svg>
            New Stash
          </button>
        </div>
      ) : (
        <div className={`stash-grid ${layout}`}>
          <div className="new-stash-card" onClick={onNewStash} title="Create a new stash">
            <div className="new-stash-icon">
              <svg width="36" height="36" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
              </svg>
            </div>
            <div className="new-stash-text">New Stash</div>
          </div>
          {stashes.map((stash) => (
            <StashCard
              key={stash.id}
              stash={stash}
              layout={layout}
              onClick={() => onSelectStash(stash.id)}
              onFilterTag={onFilterTag}
            />
          ))}
        </div>
      )}
    </div>
  );
}
