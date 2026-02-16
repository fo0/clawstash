import { useState, useRef, useEffect } from 'react';
import type { JSX } from 'react';
import type { StashListItem, SettingsSection, TagInfo } from '../types';
import { formatDate } from '../utils/format';

interface Props {
  stashes: StashListItem[];
  selectedId: string | null;
  search: string;
  onSearch: (query: string) => void;
  filterTag: string;
  onFilterTag: (tag: string) => void;
  tags: TagInfo[];
  recentTags: string[];
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
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" x2="4" y1="21" y2="14" /><line x1="4" x2="4" y1="10" y2="3" />
        <line x1="12" x2="12" y1="21" y2="12" /><line x1="12" x2="12" y1="8" y2="3" />
        <line x1="20" x2="20" y1="21" y2="16" /><line x1="20" x2="20" y1="12" y2="3" />
        <line x1="2" x2="6" y1="14" y2="14" /><line x1="10" x2="14" y1="8" y2="8" /><line x1="18" x2="22" y1="16" y2="16" />
      </svg>
    ),
  },
  {
    id: 'api',
    label: 'API & Tokens',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
      </svg>
    ),
  },
  {
    id: 'storage',
    label: 'Storage',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" /><path d="M12 8h.01" />
      </svg>
    ),
  },
];

export default function Sidebar({ stashes, selectedId, search, onSearch, filterTag, onFilterTag, tags, recentTags, onSelectStash, onNewStash, onGoHome, onGraphView, onSettingsView, isSettingsView, settingsSection, onSettingsSection, onLogout, isOpen, onClose }: Props) {
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const tagFilterRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!tagDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (tagFilterRef.current && !tagFilterRef.current.contains(e.target as Node)) {
        setTagDropdownOpen(false);
        setTagSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [tagDropdownOpen]);

  const filteredTags = tagSearch
    ? tags.filter(t => t.tag.toLowerCase().includes(tagSearch.toLowerCase()))
    : tags;

  return (
    <aside className={`sidebar${isOpen ? ' sidebar-open' : ''}`}>
      <div className="sidebar-header">
        {onClose && (
          <button className="sidebar-close-btn" onClick={onClose} aria-label="Close menu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
        <div className="sidebar-logo" onClick={onGoHome} title="Go to dashboard">
          <span className="logo-icon">CS</span>
          <span className="logo-text">ClawStash</span>
        </div>
        <button className="sidebar-graph-btn" onClick={onGraphView} title="Tag Graph — visualize tag connections">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
                type="text"
                placeholder="Search stashes..."
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                className="search-input"
                title="Search by name, filename, or content — Alt+K for quick search"
              />
              <kbd className="search-input-kbd" title="Alt+K for quick search overlay">Alt+K</kbd>
            </div>
          </div>

          {tags.length > 0 && (
            <div className="sidebar-tag-filter" ref={tagFilterRef}>
              {filterTag ? (
                <div className="sidebar-active-tag">
                  <svg className="sidebar-tag-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
                  </svg>
                  <span
                    className="sidebar-active-tag-name"
                    onClick={() => { setTagDropdownOpen(!tagDropdownOpen); setTagSearch(''); }}
                    title="Click to change tag filter"
                  >
                    {filterTag}
                  </span>
                  <button
                    className="sidebar-active-tag-clear"
                    onClick={() => { onFilterTag(filterTag); setTagDropdownOpen(false); setTagSearch(''); }}
                    title="Clear tag filter"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  className="sidebar-tag-filter-btn"
                  onClick={() => { setTagDropdownOpen(!tagDropdownOpen); setTagSearch(''); }}
                  title="Filter stashes by tag"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
                  </svg>
                  Filter by tag
                </button>
              )}
              {tagDropdownOpen && (
                <div className="sidebar-tag-dropdown">
                  {tags.length > 5 && (
                    <div className="sidebar-tag-search">
                      <input
                        type="text"
                        placeholder="Search tags..."
                        value={tagSearch}
                        onChange={(e) => setTagSearch(e.target.value)}
                        className="sidebar-tag-search-input"
                        autoFocus
                      />
                    </div>
                  )}
                  <div className="sidebar-tag-options">
                    {filteredTags.map(t => (
                      <button
                        key={t.tag}
                        className={`sidebar-tag-option ${filterTag === t.tag ? 'active' : ''}`}
                        onClick={() => {
                          onFilterTag(t.tag);
                          setTagDropdownOpen(false);
                          setTagSearch('');
                        }}
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
              {recentTags.map(tag => (
                <button
                  key={tag}
                  className="sidebar-recent-tag"
                  onClick={() => onFilterTag(tag)}
                  title={`Filter by "${tag}"`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          <div className="sidebar-btn-group">
            <button className="btn btn-new-stash sidebar-new-btn" onClick={onNewStash} title="Create a new stash to store files">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
              </svg>
              New Stash
            </button>
          </div>

          <div className="sidebar-list">
            {stashes.map((stash) => (
              <div
                key={stash.id}
                className={`sidebar-item ${selectedId === stash.id ? 'active' : ''}`}
                onClick={() => onSelectStash(stash.id)}
                title={`${stash.name || stash.files[0]?.filename || 'Untitled'} — ${stash.files.length} file${stash.files.length !== 1 ? 's' : ''}`}
              >
                <div className="sidebar-item-title">
                  {stash.name || stash.files[0]?.filename || 'Untitled'}
                </div>
                <div className="sidebar-item-meta">
                  <span className="sidebar-item-filename">{stash.files[0]?.filename}</span>
                </div>
                <div className="sidebar-item-footer">
                  <span className="sidebar-item-date">{formatDate(stash.updated_at)}</span>
                </div>
              </div>
            ))}
            {stashes.length === 0 && (
              <div className="sidebar-empty">No stashes found</div>
            )}
          </div>
        </>
      )}

      {isSettingsView && (
        <>
          <div className="sidebar-settings-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                onClick={() => onSettingsSection(section.id)}
              >
                <span className="sidebar-settings-nav-icon">{section.icon}</span>
                {section.label}
              </div>
            ))}

            <div className="sidebar-settings-divider" />

            <div
              className="sidebar-settings-nav-item sidebar-settings-back"
              onClick={onGoHome}
            >
              <span className="sidebar-settings-nav-icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
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
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
