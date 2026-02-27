import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Stash, StashFile, AccessLogEntry } from '../types';
import { api } from '../api';
import { highlightCode, resolvePrismLanguage, detectLanguageFromContent, isRenderableLanguage, getLanguageDisplayName } from '../languages';
import { formatRelativeTime } from '../utils/format';
import { useClipboard, useClipboardWithKey } from '../hooks/useClipboard';
import { CopyIcon, CheckIcon, XIcon } from './shared/icons';
import VersionHistory from './VersionHistory';
import { Marked } from 'marked';

interface Props {
  stash: Stash;
  onEdit: () => void;
  onDelete: (id: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  onBack: () => void;
  onAnalyzeStash: (id: string) => void;
  onStashUpdated?: (stash: Stash) => void;
}

function SourceBadge({ source }: { source: string }) {
  const labels: Record<string, { label: string; className: string; tooltip: string }> = {
    api: { label: 'API', className: 'source-badge source-api', tooltip: 'Accessed via REST API' },
    mcp: { label: 'MCP', className: 'source-badge source-mcp', tooltip: 'Accessed via MCP (Model Context Protocol)' },
    ui: { label: 'UI', className: 'source-badge source-ui', tooltip: 'Accessed via Web Dashboard' },
  };
  const info = labels[source] || { label: source, className: 'source-badge', tooltip: source };
  return <span className={info.className} title={info.tooltip}>{info.label}</span>;
}

const RENDER_PREF_KEY = 'clawstash-render-preview';

function getRenderPreference(): boolean {
  try {
    const stored = localStorage.getItem(RENDER_PREF_KEY);
    return stored !== 'false'; // default to true
  } catch {
    return true;
  }
}

function setRenderPreference(enabled: boolean): void {
  try {
    localStorage.setItem(RENDER_PREF_KEY, String(enabled));
  } catch { /* ignore */ }
}

/**
 * Resolve the effective PrismJS language for a file,
 * using content-based detection as fallback.
 */
function resolveEffectiveLanguage(file: StashFile): string {
  const fromMeta = resolvePrismLanguage(file.language, file.filename);
  if (fromMeta !== 'text') return fromMeta;
  return detectLanguageFromContent(file.content);
}

/** Escape a string for safe use inside an HTML attribute value. */
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Slugify a heading string following GitHub conventions:
 * lowercase, remove non-letter/number/space/hyphen chars, spaces → hyphens.
 * Uses Unicode-aware regex to preserve accented characters (ü, é, etc.).
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\s-]/gu, '')  // keep letters, marks, numbers, connectors, spaces, hyphens
    .trim()
    .replace(/\s+/g, '-');                            // collapse spaces → single hyphen
}

// Track slug occurrences per render pass to disambiguate duplicate headings
let slugCounts: Map<string, number> = new Map();
// Prefix prepended to heading IDs for cross-file disambiguation (set before each render)
let headingIdPrefix = '';

// Dedicated Marked instance — no global mutation
const mdParser = new Marked({
  breaks: true,
  gfm: true,
  renderer: {
    // GitHub-style heading anchors: each heading gets a slugified id + clickable anchor
    heading({ text, depth, tokens }) {
      let slug = slugify(text);
      const count = slugCounts.get(slug) || 0;
      slugCounts.set(slug, count + 1);
      if (count > 0) slug = `${slug}-${count}`;
      const finalSlug = headingIdPrefix + slug;
      const rendered = this.parser.parseInline(tokens);
      const safeSlug = escapeAttr(finalSlug);
      return `<h${depth} id="${safeSlug}"><a class="heading-anchor" href="#${safeSlug}" aria-hidden="true">#</a>${rendered}</h${depth}>\n`;
    },
    // Open external links in a new tab; keep anchor links in-page
    link({ href, title, text }) {
      const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
      if (href.startsWith('#')) {
        // Prepend current heading prefix so anchors match prefixed heading IDs
        const resolvedHref = headingIdPrefix ? `#${headingIdPrefix}${href.slice(1)}` : href;
        return `<a href="${escapeAttr(resolvedHref)}"${titleAttr}>${text}</a>`;
      }
      const safeHref = escapeAttr(href);
      return `<a href="${safeHref}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
});

/**
 * Sanitize HTML output by stripping dangerous elements and attributes.
 */
function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,form,link,base,meta,noscript').forEach(el => el.remove());
  doc.querySelectorAll('*').forEach(el => {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith('on') || attr.value.trimStart().startsWith('javascript:')) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return doc.body.innerHTML;
}

/**
 * Render markdown content to sanitized HTML.
 * Slug counter is reset per call so each file gets independent heading IDs.
 * Optional idPrefix disambiguates heading IDs across multiple files.
 */
function renderMarkdown(content: string, idPrefix = ''): string {
  slugCounts = new Map();
  headingIdPrefix = idPrefix;
  const raw = mdParser.parse(content, { async: false }) as string;
  return sanitizeHtml(raw);
}

interface TocHeading {
  id: string;
  text: string;
  depth: number;
}

interface TocEntry {
  fileIndex: number;
  filename: string;
  headings: TocHeading[];
}

/**
 * Extract h1–h3 headings from rendered markdown HTML for TOC generation.
 */
function extractHeadings(html: string): TocHeading[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const headings: TocHeading[] = [];
  doc.querySelectorAll('h1, h2, h3').forEach(el => {
    // Remove the anchor element so its "#" doesn't appear in the text
    const anchor = el.querySelector('.heading-anchor');
    if (anchor) anchor.remove();
    const text = el.textContent?.trim() || '';
    if (el.id && text) {
      headings.push({ id: el.id, text, depth: parseInt(el.tagName[1]) });
    }
  });
  return headings;
}

/**
 * Build sandboxed HTML document string for HTML preview.
 */
function buildHtmlPreview(content: string): string {
  // Wrap in a full document if it's just a fragment
  if (!/^<!DOCTYPE|^<html/i.test(content.trim())) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;padding:16px;margin:0;line-height:1.5}a{color:#58a6ff}img{max-width:100%}</style></head><body>${content}</body></html>`;
  }
  return content;
}

/** Renders copy/check/error icon + label based on clipboard state. */
function CopyButtonContent({ copied, failed, size = 12, labelCopy = 'Copy', labelCopied = 'Copied!', labelFailed = 'Failed' }: {
  copied: boolean;
  failed: boolean;
  size?: number;
  labelCopy?: string;
  labelCopied?: string;
  labelFailed?: string;
}) {
  if (copied) return <><CheckIcon size={size} /> {labelCopied}</>;
  if (failed) return <><XIcon size={size} /> {labelFailed}</>;
  return <><CopyIcon size={size} /> {labelCopy}</>;
}

export default function StashViewer({ stash, onEdit, onDelete, onArchive, onBack, onAnalyzeStash, onStashUpdated }: Props) {
  const [activeTab, setActiveTab] = useState<'content' | 'metadata' | 'access-log' | 'history'>('content');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [accessLog, setAccessLog] = useState<AccessLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [renderPreview, setRenderPreview] = useState(getRenderPreference);
  const [tocExpanded, setTocExpanded] = useState(true);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyAllClipboard = useClipboard();
  const fileClipboard = useClipboardWithKey();
  const apiClipboard = useClipboardWithKey();

  // Memoize resolved languages for all files
  const resolvedLanguages = useMemo(
    () => new Map(stash.files.map(f => [f.id, resolveEffectiveLanguage(f)])),
    [stash.files]
  );

  // Memoize rendered markdown/HTML output and TOC entries
  const { renderedContent, tocEntries } = useMemo(() => {
    const contentMap = new Map<string, string>();
    const mdFileIndices: number[] = [];
    stash.files.forEach((f, i) => {
      if (resolvedLanguages.get(f.id) === 'markdown') mdFileIndices.push(i);
    });
    const needsToc = mdFileIndices.length >= 2;
    const entries: TocEntry[] = [];

    for (let i = 0; i < stash.files.length; i++) {
      const file = stash.files[i];
      const lang = resolvedLanguages.get(file.id);
      if (lang === 'markdown') {
        const prefix = needsToc ? `f${i}-` : '';
        const html = renderMarkdown(file.content, prefix);
        contentMap.set(file.id, html);
        if (needsToc) {
          entries.push({
            fileIndex: i,
            filename: file.filename,
            headings: extractHeadings(html),
          });
        }
      } else if (lang === 'markup') {
        contentMap.set(file.id, buildHtmlPreview(file.content));
      }
    }
    return { renderedContent: contentMap, tocEntries: entries };
  }, [stash.files, resolvedLanguages]);

  const toggleRenderPreview = useCallback(() => {
    setRenderPreview(prev => {
      const next = !prev;
      setRenderPreference(next);
      return next;
    });
  }, []);

  const scrollToId = useCallback((e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    if (activeTab === 'access-log') {
      setLogLoading(true);
      api.getAccessLog(stash.id, 100)
        .then(setAccessLog)
        .catch(() => setAccessLog([]))
        .finally(() => setLogLoading(false));
    }
  }, [activeTab, stash.id]);

  // Cleanup delete confirmation timer on unmount
  useEffect(() => {
    return () => {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    };
  }, []);

  const copyAllFiles = () => {
    const allContent = stash.files
      .map((f) => `// === ${f.filename} ===\n${f.content}`)
      .join('\n\n');
    copyAllClipboard.copy(allContent);
  };

  const handleDelete = () => {
    if (showDeleteConfirm) {
      onDelete(stash.id);
    } else {
      setShowDeleteConfirm(true);
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = setTimeout(() => setShowDeleteConfirm(false), 3000);
    }
  };

  const title = stash.name || stash.files[0]?.filename || 'Untitled';

  return (
    <div className="stash-viewer">
      {/* Screen-reader announcement for copy status */}
      <div className="sr-only" aria-live="polite">
        {copyAllClipboard.status === 'copied' && 'All files copied to clipboard'}
        {copyAllClipboard.status === 'failed' && 'Copy failed'}
        {fileClipboard.copiedKey && 'File copied to clipboard'}
        {fileClipboard.failedKey && 'Copy failed'}
        {apiClipboard.copiedKey && 'API endpoint copied to clipboard'}
        {apiClipboard.failedKey && 'Copy failed'}
      </div>

      <div className="viewer-header">
        <button className="btn btn-ghost" onClick={onBack} title="Go back to dashboard">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z" />
          </svg>
          Back
        </button>
        <h2 className="viewer-title">
          {title}
          {stash.archived && <span className="viewer-archived-badge">Archived</span>}
        </h2>
        <div className="viewer-actions">
          <button
            className="btn btn-secondary"
            onClick={copyAllFiles}
            title={copyAllClipboard.copied ? 'Copied!' : copyAllClipboard.status === 'failed' ? 'Copy failed' : 'Copy all file contents to clipboard'}
          >
            <CopyButtonContent
              copied={copyAllClipboard.copied}
              failed={copyAllClipboard.status === 'failed'}
              size={14}
              labelCopy="Copy All"
            />
          </button>
          <button className="btn btn-secondary" onClick={onEdit} title="Edit this stash">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758ZM11.189 4l1.811 1.811 1.72-1.72a.25.25 0 0 0 0-.354l-1.086-1.086a.25.25 0 0 0-.354 0Zm.528 3.283L9.906 5.472l-6.1 6.1a.25.25 0 0 0-.063.108l-.558 1.953 1.953-.558a.249.249 0 0 0 .108-.063Z" />
            </svg>
            Edit
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => onArchive(stash.id, !stash.archived)}
            title={stash.archived ? 'Unarchive this stash — restore to active stashes' : 'Archive this stash — hide from default listings'}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.75 3h12.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75H1.75A.75.75 0 0 1 1 5.25v-1.5A.75.75 0 0 1 1.75 3ZM2 7.5h12v5.75a.75.75 0 0 1-.75.75H2.75a.75.75 0 0 1-.75-.75Zm4.25 1.5a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5Z" />
            </svg>
            {stash.archived ? 'Unarchive' : 'Archive'}
          </button>
          <button
            className={`btn ${showDeleteConfirm ? 'btn-danger' : 'btn-ghost'}`}
            onClick={handleDelete}
            title={showDeleteConfirm ? 'Click again to permanently delete this stash' : 'Delete this stash'}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z" />
            </svg>
            {showDeleteConfirm ? 'Confirm Delete?' : 'Delete'}
          </button>
        </div>
      </div>

      {stash.description && (
        <p className="viewer-description">{stash.description}</p>
      )}

      {(stash.tags.length > 0 || Object.keys(stash.metadata).length > 0) && (
        <div className="viewer-meta-bar">
          {stash.tags.map((tag) => (
            <span key={tag} className="stash-tag" title={`Tag: ${tag}`}>{tag}</span>
          ))}
          {Object.keys(stash.metadata).length > 0 && (
            <span className="meta-indicator" title="This stash has AI metadata attached">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: 4, verticalAlign: -1 }}>
                <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.92 6.085h.001a.749.749 0 1 1-1.342-.67c.169-.339.516-.552.974-.552.97 0 1.447.67 1.447 1.181 0 .43-.245.756-.462.97l-.044.042c-.21.196-.383.375-.383.632v.22a.75.75 0 0 1-1.5 0v-.22c0-.67.406-1.05.634-1.26l.044-.043c.16-.147.228-.228.228-.356 0-.098-.06-.233-.447-.233-.218 0-.316.1-.361.183ZM8 10.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
              </svg>
              Has metadata
            </span>
          )}
        </div>
      )}

      <div className="viewer-tabs">
        <button
          className={`tab ${activeTab === 'content' ? 'active' : ''}`}
          onClick={() => setActiveTab('content')}
          title="View file contents"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: 6, verticalAlign: -2 }}>
            <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z" />
          </svg>
          Content
        </button>
        <button
          className={`tab ${activeTab === 'metadata' ? 'active' : ''}`}
          onClick={() => setActiveTab('metadata')}
          title="View stash details, metadata, and API endpoints"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: 6, verticalAlign: -2 }}>
            <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.92 6.085h.001a.749.749 0 1 1-1.342-.67c.169-.339.516-.552.974-.552.97 0 1.447.67 1.447 1.181 0 .43-.245.756-.462.97l-.044.042c-.21.196-.383.375-.383.632v.22a.75.75 0 0 1-1.5 0v-.22c0-.67.406-1.05.634-1.26l.044-.043c.16-.147.228-.228.228-.356 0-.098-.06-.233-.447-.233-.218 0-.316.1-.361.183ZM8 10.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
          </svg>
          Details & API
        </button>
        <button
          className={`tab ${activeTab === 'access-log' ? 'active' : ''}`}
          onClick={() => setActiveTab('access-log')}
          title="View when and how this stash was accessed (API, MCP, UI)"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: 6, verticalAlign: -2 }}>
            <path d="M1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm.5 4.75a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 .37.65l2.5 1.5a.75.75 0 1 0 .77-1.29L8.5 7.94Z" />
          </svg>
          Access Log
        </button>
        <button
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
          title="View version history and compare changes"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: 6, verticalAlign: -2 }}>
            <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
          </svg>
          History
          <span className="version-count-badge">v{stash.version}</span>
        </button>
        <button
          className="tab tab-analyze"
          onClick={() => onAnalyzeStash(stash.id)}
          title="Analyze connections in the stash graph"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: 6, verticalAlign: -2 }}>
            <path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Zm0 1.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />
          </svg>
          Analyze
        </button>
      </div>

      {activeTab === 'content' && tocEntries.length > 0 && renderPreview && (
        <div className="viewer-toc">
          <button className="viewer-toc-toggle" onClick={() => setTocExpanded(!tocExpanded)}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm3.75-1.5a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5Zm0 5a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5Zm0 5a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5ZM3 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-1 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
            </svg>
            Table of Contents
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className={`toc-chevron ${tocExpanded ? 'expanded' : ''}`}>
              <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
          {tocExpanded && (
            <nav className="viewer-toc-nav" aria-label="Table of contents">
              {tocEntries.map((entry) => (
                <div key={entry.fileIndex} className="toc-file-group">
                  <a
                    className="toc-file-link"
                    href={`#stash-file-${entry.fileIndex}`}
                    onClick={(e) => scrollToId(e, `stash-file-${entry.fileIndex}`)}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z" />
                    </svg>
                    {entry.filename}
                  </a>
                  {entry.headings.length > 0 && (
                    <ul className="toc-headings">
                      {entry.headings.map((h, hi) => (
                        <li key={hi} className={`toc-heading toc-h${h.depth}`}>
                          <a
                            href={`#${h.id}`}
                            onClick={(e) => scrollToId(e, h.id)}
                          >
                            {h.text}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </nav>
          )}
        </div>
      )}

      {activeTab === 'content' && (
        <div className="viewer-files">
          {stash.files.map((file, fileIndex) => {
            const lang = resolvedLanguages.get(file.id) || 'text';
            const renderable = isRenderableLanguage(lang);
            const showRendered = renderable && renderPreview;
            const langLabel = file.language || (lang !== 'text' ? `auto:${getLanguageDisplayName(lang)}` : '');

            return (
              <div key={file.id} id={`stash-file-${fileIndex}`} className="viewer-file">
                <div className="file-header">
                  <span className="file-name" title={file.filename}>{file.filename}</span>
                  <div className="file-actions">
                    {langLabel && (
                      <span className="lang-tag" title={`Language: ${langLabel}`}>
                        {langLabel}
                      </span>
                    )}
                    {renderable && (
                      <button
                        className={`btn btn-sm btn-ghost render-toggle ${showRendered ? 'render-active' : ''}`}
                        onClick={toggleRenderPreview}
                        title={showRendered ? 'Show raw source code' : 'Show rendered preview'}
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.831.88 9.577.43 8.9a1.619 1.619 0 0 1 0-1.798c.45-.678 1.367-1.932 2.637-3.023C4.33 2.992 6.019 2 8 2ZM1.679 7.932a.12.12 0 0 0 0 .136c.411.622 1.241 1.75 2.366 2.717C5.176 11.758 6.527 12.5 8 12.5c1.473 0 2.825-.742 3.955-1.715 1.124-.967 1.954-2.096 2.366-2.717a.12.12 0 0 0 0-.136c-.412-.621-1.242-1.75-2.366-2.717C10.824 4.242 9.473 3.5 8 3.5c-1.473 0-2.825.742-3.955 1.715-1.124.967-1.954 2.096-2.366 2.717ZM8 10a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 10Z" />
                        </svg>
                        {showRendered ? 'Raw' : 'Preview'}
                      </button>
                    )}
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => fileClipboard.copy(file.id, file.content)}
                      title={fileClipboard.isCopied(file.id) ? 'Copied!' : fileClipboard.isFailed(file.id) ? 'Copy failed' : 'Copy file content to clipboard'}
                    >
                      <CopyButtonContent copied={fileClipboard.isCopied(file.id)} failed={fileClipboard.isFailed(file.id)} />
                    </button>
                  </div>
                </div>
                {showRendered && lang === 'markdown' ? (
                  <div className="file-rendered markdown-body" dangerouslySetInnerHTML={{ __html: renderedContent.get(file.id) || '' }} />
                ) : showRendered && lang === 'markup' ? (
                  <iframe
                    className="file-rendered html-preview"
                    sandbox=""
                    srcDoc={renderedContent.get(file.id) || ''}
                    title={`Preview of ${file.filename}`}
                  />
                ) : (
                  <pre className="file-content"><code dangerouslySetInnerHTML={{ __html: highlightCode(file.content, lang) }} /></pre>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'metadata' && (
        <div className="viewer-metadata">
          <div className="metadata-section">
            <h3>Details</h3>
            <table className="metadata-table">
              <tbody>
                <tr><td>ID</td><td><code>{stash.id}</code></td></tr>
                <tr><td>Files</td><td>{stash.files.length}</td></tr>
                <tr><td>Created</td><td>{new Date(stash.created_at).toLocaleString()}</td></tr>
                <tr><td>Updated</td><td>{new Date(stash.updated_at).toLocaleString()}</td></tr>
                {stash.tags.length > 0 && (
                  <tr><td>Tags</td><td>{stash.tags.join(', ')}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {stash.description && (
            <div className="metadata-section">
              <h3>Description</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{stash.description}</p>
            </div>
          )}

          {Object.keys(stash.metadata).length > 0 && (
            <div className="metadata-section">
              <h3>AI Metadata</h3>
              <table className="metadata-table">
                <tbody>
                  {Object.entries(stash.metadata).map(([key, value]) => (
                    <tr key={key}>
                      <td>{key}</td>
                      <td><code>{typeof value === 'string' ? value : JSON.stringify(value)}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="metadata-section">
            <h3>API Access</h3>
            <div className="api-examples">
              <div className="api-example">
                <span className="api-label" title="HTTP GET request to retrieve this stash">GET</span>
                <code>/api/stashes/{stash.id}</code>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => apiClipboard.copy(`get-${stash.id}`, `/api/stashes/${stash.id}`)}
                  title={apiClipboard.isCopied(`get-${stash.id}`) ? 'Copied!' : apiClipboard.isFailed(`get-${stash.id}`) ? 'Copy failed' : 'Copy API endpoint'}
                >
                  <CopyButtonContent copied={apiClipboard.isCopied(`get-${stash.id}`)} failed={apiClipboard.isFailed(`get-${stash.id}`)} />
                </button>
              </div>
              {stash.files.map((f) => (
                <div key={f.id} className="api-example">
                  <span className="api-label" title="HTTP GET request for raw file content">RAW</span>
                  <code>/api/stashes/{stash.id}/files/{f.filename}/raw</code>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => apiClipboard.copy(`raw-${f.id}`, `/api/stashes/${stash.id}/files/${f.filename}/raw`)}
                    title={apiClipboard.isCopied(`raw-${f.id}`) ? 'Copied!' : apiClipboard.isFailed(`raw-${f.id}`) ? 'Copy failed' : 'Copy raw file endpoint'}
                  >
                    <CopyButtonContent copied={apiClipboard.isCopied(`raw-${f.id}`)} failed={apiClipboard.isFailed(`raw-${f.id}`)} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'access-log' && (
        <div className="viewer-access-log">
          <div className="access-log-header">
            <h3>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: 8, verticalAlign: -2 }}>
                <path d="M1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm.5 4.75a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 .37.65l2.5 1.5a.75.75 0 1 0 .77-1.29L8.5 7.94Z" />
              </svg>
              Access Log
            </h3>
            <span className="access-log-hint" title="Tracks when this stash was accessed via API, MCP, or the web dashboard">
              Shows recent access from all channels
            </span>
          </div>
          {logLoading ? (
            <div className="loading">Loading access log...</div>
          ) : accessLog.length === 0 ? (
            <div className="access-log-empty">
              <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor" style={{ marginBottom: 8 }}>
                <path d="M1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm.5 4.75a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 .37.65l2.5 1.5a.75.75 0 1 0 .77-1.29L8.5 7.94Z" />
              </svg>
              <p>No access recorded yet.</p>
              <span className="access-log-hint">Access events are logged when this stash is read via API, MCP, or UI.</span>
            </div>
          ) : (
            <div className="access-log-list">
              {accessLog.map((entry) => (
                <div key={entry.id} className="access-log-entry">
                  <SourceBadge source={entry.source} />
                  <span className="access-log-action">{entry.action}</span>
                  <span className="access-log-time" title={new Date(entry.timestamp).toLocaleString()}>
                    {formatRelativeTime(entry.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <VersionHistory
          stashId={stash.id}
          currentVersion={stash.version}
          onRestore={(restored) => onStashUpdated?.(restored)}
        />
      )}
    </div>
  );
}
