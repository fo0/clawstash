import { useMemo } from 'react';
import type { StashListItem, LayoutMode } from '../types';
import { renderDescriptionMarkdown } from '../utils/markdown';
import { formatBytes } from '../utils/format';
import { buildStashUrl } from '../utils/stash-url';
import { isModifiedClick } from '../utils/link-click';
import RelativeTime from './shared/RelativeTime';
import { StarIcon } from './shared/icons';

interface Props {
  stash: StashListItem;
  layout: LayoutMode;
  isFavorite: boolean;
  onClick: () => void;
  onFilterTag: (tag: string) => void;
  onToggleFavorite: (id: string) => void;
}

// The server allows up to 100 files / 50 tags per stash — rendering them all
// blows a card past 1000px. Cap the lists and summarize the overflow.
const MAX_VISIBLE_FILES = 4;
const MAX_VISIBLE_TAGS = 6;

function getUniqueLanguages(stash: StashListItem): string[] {
  const langs = new Set<string>();
  for (const f of stash.files) {
    if (f.language) langs.add(f.language);
  }
  return Array.from(langs);
}

export default function StashCard({
  stash,
  layout,
  isFavorite,
  onClick,
  onFilterTag,
  onToggleFavorite,
}: Props) {
  const languages = getUniqueLanguages(stash);
  const title = stash.name || stash.files[0]?.filename || 'Untitled';
  // Same deep link the viewer's "Copy Link" produces — as a real href so the
  // card can be opened in a new tab (Ctrl/Cmd+click, middle-click, context menu).
  const href = buildStashUrl('', stash.id);
  const fileCount = stash.files.length;
  const sizeLabel = formatBytes(stash.total_size);
  // Memoize the rendered markdown — `renderDescriptionMarkdown` runs a DOMParser
  // sanitization pass on every call, which adds up across a 50-card dashboard.
  const descriptionHtml = useMemo(
    () => (stash.description ? renderDescriptionMarkdown(stash.description) : ''),
    [stash.description],
  );

  return (
    // Deliberately NOT role="button"/tabIndex: the card holds interactive
    // descendants (favorite toggle, tag chips, description links), and a
    // button is not allowed to contain interactive content — assistive tech
    // may flatten the inner controls away. The title below is the real,
    // keyboard-reachable primary action; the container keeps its click
    // handler purely as a pointer convenience, which needs no ARIA role.
    <div
      className={`stash-card ${layout}${stash.archived ? ' stash-card-archived' : ''}`}
      onClick={(e) => {
        // A modified click means "open in a new tab" — the title link handles
        // it natively; navigating in place here would defeat it.
        if (isModifiedClick(e)) return;
        onClick();
      }}
      title={`Open stash: ${title}`}
    >
      <div className="stash-card-header">
        <a
          className="stash-card-title"
          href={href}
          onClick={(e) => {
            // The container's own handler would otherwise open the stash a
            // second time (same target, but it also fires on Enter/Space).
            e.stopPropagation();
            // Ctrl/Cmd/Shift-click and middle-click stay with the browser so
            // the stash opens in a new tab / window.
            if (isModifiedClick(e)) return;
            e.preventDefault();
            onClick();
          }}
          aria-label={`Open stash: ${title}`}
        >
          {title}
        </a>
        {stash.archived && <span className="stash-card-archived-badge">Archived</span>}
        <button
          type="button"
          className={`stash-card-favorite-btn${isFavorite ? ' is-favorite' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(stash.id);
          }}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? `Unpin "${title}" from top` : `Pin "${title}" to top`}
          title={isFavorite ? 'Unpin from top' : 'Pin to top'}
          data-testid="favorite-toggle"
        >
          <StarIcon filled={isFavorite} />
        </button>
      </div>

      {stash.description && (
        <div
          className="stash-card-description markdown-description"
          dangerouslySetInnerHTML={{ __html: descriptionHtml }}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('a')) e.stopPropagation();
          }}
        />
      )}

      <div className="stash-card-files">
        {stash.files.slice(0, MAX_VISIBLE_FILES).map((file) => (
          // Filenames are validated to be unique per stash by the server
          // (see validation.ts FileSchema / DB unique constraint), so they
          // are a stable React key. Using the array index instead would
          // break diffing when files are added / reordered in the editor.
          <div key={file.filename} className="stash-card-file" title={file.filename}>
            <svg
              aria-hidden="true"
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="file-icon"
            >
              <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z" />
            </svg>
            <span>{file.filename}</span>
          </div>
        ))}
        {fileCount > MAX_VISIBLE_FILES && (
          <div
            className="stash-card-file stash-card-file-more"
            title={stash.files
              .slice(MAX_VISIBLE_FILES)
              .map((f) => f.filename)
              .join(', ')}
          >
            +{fileCount - MAX_VISIBLE_FILES} more file{fileCount - MAX_VISIBLE_FILES !== 1 && 's'}
          </div>
        )}
      </div>

      <div className="stash-card-footer">
        <div className="stash-card-tags">
          {languages.map((lang) => (
            <span key={lang} className="lang-tag" title={`Language: ${lang}`}>
              {lang}
            </span>
          ))}
          {stash.tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
            <span
              key={tag}
              className="stash-tag"
              onClick={(e) => {
                e.stopPropagation();
                onFilterTag(tag);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onFilterTag(tag);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`Filter by tag: ${tag}`}
              title={`Filter by tag: ${tag}`}
            >
              {tag}
            </span>
          ))}
          {stash.tags.length > MAX_VISIBLE_TAGS && (
            // Same "+N" overflow pattern as the quick-search result tags.
            <span className="stash-tag-more" title={stash.tags.slice(MAX_VISIBLE_TAGS).join(', ')}>
              +{stash.tags.length - MAX_VISIBLE_TAGS}
            </span>
          )}
        </div>
        <div className="stash-card-meta">
          <span
            className="stash-card-stat"
            title={`${fileCount} file${fileCount === 1 ? '' : 's'}, ${sizeLabel} total`}
          >
            {fileCount} {fileCount === 1 ? 'file' : 'files'} · {sizeLabel}
          </span>
          <RelativeTime dateStr={stash.updated_at} className="stash-card-date" />
        </div>
      </div>
    </div>
  );
}
