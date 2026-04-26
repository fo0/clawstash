import { useMemo } from 'react';
import type { StashListItem, LayoutMode } from '../types';
import { formatRelativeTime } from '../utils/format';
import { renderDescriptionMarkdown } from '../utils/markdown';

interface Props {
  stash: StashListItem;
  layout: LayoutMode;
  onClick: () => void;
  onFilterTag: (tag: string) => void;
}

function getUniqueLanguages(stash: StashListItem): string[] {
  const langs = new Set<string>();
  for (const f of stash.files) {
    if (f.language) langs.add(f.language);
  }
  return Array.from(langs);
}

export default function StashCard({ stash, layout, onClick, onFilterTag }: Props) {
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
