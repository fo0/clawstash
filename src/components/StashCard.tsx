import { useMemo } from 'react';
import type { StashListItem, LayoutMode } from '../types';
import { formatRelativeTime } from '../utils/format';
import { renderDescriptionMarkdown } from '../utils/markdown';

interface Props {
  stash: StashListItem;
  layout: LayoutMode;
  isFavorite: boolean;
  onClick: () => void;
  onFilterTag: (tag: string) => void;
  onToggleFavorite: (id: string) => void;
}

function getUniqueLanguages(stash: StashListItem): string[] {
  const langs = new Set<string>();
  for (const f of stash.files) {
    if (f.language) langs.add(f.language);
  }
  return Array.from(langs);
}

export default function StashCard({ stash, layout, isFavorite, onClick, onFilterTag, onToggleFavorite }: Props) {
  const languages = getUniqueLanguages(stash);
  const title = stash.name || stash.files[0]?.filename || 'Untitled';
  // Memoize the rendered markdown — `renderDescriptionMarkdown` runs a DOMParser
  // sanitization pass on every call, which adds up across a 50-card dashboard.
  const descriptionHtml = useMemo(
    () => stash.description ? renderDescriptionMarkdown(stash.description) : '',
    [stash.description]
  );

  return (
    <div className={`stash-card ${layout}${stash.archived ? ' stash-card-archived' : ''}`} onClick={onClick} title={`Open stash: ${title}`}>
      <div className="stash-card-header">
        <span className="stash-card-title">{title}</span>
        {stash.archived && <span className="stash-card-archived-badge">Archived</span>}
        <button
          type="button"
          className={`stash-card-favorite-btn${isFavorite ? ' is-favorite' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(stash.id); }}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? `Unpin "${title}" from top` : `Pin "${title}" to top`}
          title={isFavorite ? 'Unpin from top' : 'Pin to top'}
          data-testid="favorite-toggle"
        >
          {isFavorite ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 1.25 9.882 5.065l4.21.612-3.046 2.97.719 4.192L8 10.86l-3.765 1.98.72-4.194L1.908 5.677l4.21-.612L8 1.25Z" />
            </svg>
          )}
        </button>
      </div>

      {stash.description && (
        <div
          className="stash-card-description markdown-description"
          dangerouslySetInnerHTML={{ __html: descriptionHtml }}
          onClick={(e) => { if ((e.target as HTMLElement).closest('a')) e.stopPropagation(); }}
        />
      )}

      <div className="stash-card-files">
        {stash.files.map((file, i) => (
          <div key={i} className="stash-card-file" title={file.filename}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="file-icon">
              <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z" />
            </svg>
            <span>{file.filename}</span>
          </div>
        ))}
      </div>

      <div className="stash-card-footer">
        <div className="stash-card-tags">
          {languages.map((lang) => (
            <span key={lang} className="lang-tag" title={`Language: ${lang}`}>{lang}</span>
          ))}
          {stash.tags.map((tag) => (
            <span
              key={tag}
              className="stash-tag"
              onClick={(e) => { e.stopPropagation(); onFilterTag(tag); }}
              title={`Filter by tag: ${tag}`}
            >
              {tag}
            </span>
          ))}
        </div>
        <span className="stash-card-date" title={`Last updated: ${new Date(stash.updated_at).toLocaleString()}`}>
          {formatRelativeTime(stash.updated_at)}
        </span>
      </div>
    </div>
  );
}
