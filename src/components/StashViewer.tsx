import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Stash, StashFile, AccessLogEntry } from '../types';
import { api } from '../api';
import {
  highlightCode,
  resolvePrismLanguage,
  detectLanguageFromContent,
  isRenderableLanguage,
  getLanguageDisplayName,
} from '../languages';
import RelativeTime from './shared/RelativeTime';
import { useClipboard, useClipboardWithKey } from '../hooks/useClipboard';
import { CopyIcon, CheckIcon, XIcon } from './shared/icons';
import VersionHistory from './VersionHistory';
import { Marked } from 'marked';
import { renderDescriptionMarkdown, isUnsafeUrl, sanitizeHtml } from '../utils/markdown';
import { hydrateMermaidPlaceholders, encodeMermaidSource } from '../utils/mermaid-hydrate';
import { DELETE_CONFIRM_TIMEOUT_MS } from '../utils/constants';
import { formatBytes } from '../utils/format';
import { escapeHtml } from '../utils/html';
import { buildStashUrl } from '../utils/stash-url';
import MermaidDiagram from './MermaidDiagram';
import MarkdownBody from './MarkdownBody';
import Spinner from './shared/Spinner';
import StashBackupControls from './StashBackupControls';

interface Props {
  stash: Stash;
  onEdit: () => void;
  onDelete: (id: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  onBack: () => void;
  onAnalyzeStash: (id: string) => void;
  onStashUpdated?: (stash: Stash) => void;
  // Fired specifically when a previous version is restored from the history
  // tab, so the shell can surface a success toast. Restoring previously gave
  // no confirmation, unlike save / archive / delete which all show one.
  onVersionRestored?: (stash: Stash) => void;
}

function SourceBadge({ source }: { source: string }) {
  const labels: Record<string, { label: string; className: string; tooltip: string }> = {
    api: { label: 'API', className: 'source-badge source-api', tooltip: 'Accessed via REST API' },
    mcp: {
      label: 'MCP',
      className: 'source-badge source-mcp',
      tooltip: 'Accessed via MCP (Model Context Protocol)',
    },
    ui: { label: 'UI', className: 'source-badge source-ui', tooltip: 'Accessed via Web Dashboard' },
  };
  const info = labels[source] || { label: source, className: 'source-badge', tooltip: source };
  return (
    <span className={info.className} title={info.tooltip}>
      {info.label}
    </span>
  );
}

const RENDER_PREF_KEY = 'clawstash-render-preview';
const ACTIVE_TAB_KEY = 'clawstash-viewer-tab';
const TOC_PREF_KEY = 'clawstash-toc-expanded';
const WRAP_PREF_KEY = 'clawstash-wrap-lines';

type ViewerTab = 'content' | 'metadata' | 'access-log' | 'history';
const VALID_TABS: ViewerTab[] = ['content', 'metadata', 'access-log', 'history'];

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
  } catch {
    /* ignore */
  }
}

/**
 * Read the persisted "wrap long lines" preference for the raw code view.
 * Defaults to false (long lines scroll horizontally, preserving the original
 * layout). Mirrors the render-preview / TOC preference helpers above.
 */
function getWrapPreference(): boolean {
  try {
    return localStorage.getItem(WRAP_PREF_KEY) === 'true'; // default to false
  } catch {
    return false;
  }
}

function setWrapPreference(enabled: boolean): void {
  try {
    localStorage.setItem(WRAP_PREF_KEY, String(enabled));
  } catch {
    /* ignore */
  }
}

/** Read the persisted Table-of-Contents expanded state. Defaults to expanded. */
function getTocPreference(): boolean {
  try {
    return localStorage.getItem(TOC_PREF_KEY) !== 'false'; // default to true
  } catch {
    return true;
  }
}

function setTocPreference(expanded: boolean): void {
  try {
    localStorage.setItem(TOC_PREF_KEY, String(expanded));
  } catch {
    /* ignore */
  }
}

/** Read the last-used viewer tab from localStorage. Defaults to 'content'. */
function getTabPreference(): ViewerTab {
  try {
    const stored = localStorage.getItem(ACTIVE_TAB_KEY);
    if (stored && (VALID_TABS as string[]).includes(stored)) return stored as ViewerTab;
  } catch {
    /* ignore */
  }
  return 'content';
}

function setTabPreference(tab: ViewerTab): void {
  try {
    localStorage.setItem(ACTIVE_TAB_KEY, tab);
  } catch {
    /* ignore */
  }
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

/**
 * Trigger a browser file download for the given text content.
 * Uses a temporary object URL so it works without a server round-trip.
 */
function downloadFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Release the object URL after a short delay so the download initiates
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Slugify a heading string following GitHub conventions:
 * lowercase, remove non-letter/number/space/hyphen chars, spaces → hyphens.
 * Uses Unicode-aware regex to preserve accented characters (ü, é, etc.).
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\s-]/gu, '') // keep letters, marks, numbers, connectors, spaces, hyphens
    .trim()
    .replace(/\s+/g, '-'); // collapse spaces → single hyphen
}

/**
 * Build a fresh Marked instance whose renderer closes over per-call state.
 *
 * Previously the heading-anchor slug counter (`slugCounts`) and prefix
 * (`headingIdPrefix`) lived as module-level mutable variables that were
 * reset before each `renderMarkdown` call and consumed by a shared
 * `Marked` instance's renderer callbacks. That works in today's
 * synchronous, single-threaded usage but is a foot-gun under React 19
 * concurrent rendering: two interleaved render passes could share a
 * single `slugCounts` map and produce conflicting heading IDs.
 *
 * Building a fresh instance per call keeps the cost trivial (no parse
 * cache to populate; the renderer is just a configured object) while
 * making the state strictly local to one invocation. Closes BACKLOG
 * #43 / #80.
 */
function createMdParser(headingIdPrefix: string): Marked {
  const slugCounts = new Map<string, number>();
  return new Marked({
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
        const safeSlug = escapeHtml(finalSlug);
        return `<h${depth} id="${safeSlug}"><a class="heading-anchor" href="#${safeSlug}" aria-hidden="true">#</a>${rendered}</h${depth}>\n`;
      },
      // Open external links in a new tab; keep anchor links in-page
      link({ href, title, text }) {
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
        // Strip dangerous schemes (javascript:/vbscript:/data:text/html, with
        // case + control-char obfuscation) before rendering — defence-in-depth
        // alongside the post-render sanitiser.
        const cleanHref = isUnsafeUrl(href) ? '#' : href;
        if (cleanHref.startsWith('#')) {
          // Prepend current heading prefix so anchors match prefixed heading IDs
          const resolvedHref =
            headingIdPrefix && cleanHref !== '#'
              ? `#${headingIdPrefix}${cleanHref.slice(1)}`
              : cleanHref;
          return `<a href="${escapeHtml(resolvedHref)}"${titleAttr}>${text}</a>`;
        }
        const safeHref = escapeHtml(cleanHref);
        return `<a href="${safeHref}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
      },
      // Custom code renderer: emit a placeholder div for ```mermaid``` blocks
      // (hydrated post-render in StashViewer) and otherwise mimic marked's
      // default <pre><code class="language-X"> output.
      code({ text, lang }) {
        const language = (lang || '').trim().split(/\s+/)[0] || '';
        const lower = language.toLowerCase();
        if (lower === 'mermaid' || lower === 'mmd') {
          const encoded = encodeMermaidSource(text);
          return `<div class="mermaid-placeholder" data-mermaid-source="${encoded}"></div>\n`;
        }
        const body = escapeHtml(text.replace(/\n$/, '')) + '\n';
        if (language) {
          return `<pre><code class="language-${escapeHtml(language)}">${body}</code></pre>\n`;
        }
        return `<pre><code>${body}</code></pre>\n`;
      },
    },
  });
}

/**
 * Render markdown content to sanitized HTML.
 *
 * Builds a fresh Marked instance per call whose renderer closes over a
 * local slug counter — see `createMdParser` for the rationale. Optional
 * `idPrefix` disambiguates heading IDs across multiple files. HTML
 * sanitisation is delegated to the shared `sanitizeHtml` helper so the
 * file-Markdown surface cannot drift from the description-Markdown
 * surface on the dangerous-attribute set.
 */
function renderMarkdown(content: string, idPrefix = ''): string {
  const parser = createMdParser(idPrefix);
  const raw = parser.parse(content, { async: false }) as string;
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
 * Heading ids inside rendered markdown carry a per-file prefix whenever the
 * TOC is shown so anchors stay unique across files. Builder and parser live
 * together so the format cannot drift apart.
 */
function fileHeadingIdPrefix(fileIndex: number): string {
  return `f${fileIndex}-`;
}

/** Inverse of `fileHeadingIdPrefix` — returns the file index, or null. */
function parseFileHeadingId(id: string): number | null {
  const match = /^f(\d+)-/.exec(id);
  return match ? Number(match[1]) : null;
}

/**
 * Extract h1–h3 headings from rendered markdown HTML for TOC generation.
 */
function extractHeadings(html: string): TocHeading[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const headings: TocHeading[] = [];
  doc.querySelectorAll('h1, h2, h3').forEach((el) => {
    // Remove the anchor element so its "#" doesn't appear in the text
    const anchor = el.querySelector('.heading-anchor');
    if (anchor) anchor.remove();
    const text = el.textContent?.trim() || '';
    if (el.id && text) {
      // Explicit radix 10 — leading-zero strings are spec-compliantly base 10
      // in modern JS, but the linter (when added) flags missing radix as a
      // code-smell, and being explicit removes any historical ambiguity.
      headings.push({ id: el.id, text, depth: Number.parseInt(el.tagName[1], 10) });
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
function CopyButtonContent({
  copied,
  failed,
  size = 12,
  labelCopy = 'Copy',
  labelCopied = 'Copied!',
  labelFailed = 'Failed',
}: {
  copied: boolean;
  failed: boolean;
  size?: number;
  labelCopy?: string;
  labelCopied?: string;
  labelFailed?: string;
}) {
  if (copied)
    return (
      <>
        <CheckIcon size={size} /> {labelCopied}
      </>
    );
  if (failed)
    return (
      <>
        <XIcon size={size} /> {labelFailed}
      </>
    );
  return (
    <>
      <CopyIcon size={size} /> {labelCopy}
    </>
  );
}

/**
 * Small "open in new tab" affordance next to an API-endpoint row. The copy
 * buttons hand back the relative path (for curl/scripts); this lets the user
 * load the live endpoint directly without retyping it into the address bar.
 * `noopener noreferrer` per the usual target=_blank safety.
 */
function ApiOpenLink({ path, label }: { path: string; label: string }) {
  return (
    <a
      className="btn btn-sm btn-ghost api-open-link"
      href={path}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M3.75 2A1.75 1.75 0 0 0 2 3.75v8.5C2 13.216 2.784 14 3.75 14h8.5A1.75 1.75 0 0 0 14 12.25v-3.5a.75.75 0 0 0-1.5 0v3.5a.25.25 0 0 1-.25.25h-8.5a.25.25 0 0 1-.25-.25v-8.5a.25.25 0 0 1 .25-.25h3.5a.75.75 0 0 0 0-1.5Z" />
        <path d="M9.75 2a.75.75 0 0 0 0 1.5h1.69L6.22 8.72a.75.75 0 1 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75Z" />
      </svg>
    </a>
  );
}

export default function StashViewer({
  stash,
  onEdit,
  onDelete,
  onArchive,
  onBack,
  onAnalyzeStash,
  onStashUpdated,
  onVersionRestored,
}: Props) {
  const [activeTab, setActiveTab] = useState<ViewerTab>(getTabPreference);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [accessLog, setAccessLog] = useState<AccessLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  // Distinguish a failed access-log fetch from a genuinely empty log — a
  // swallowed error previously rendered the same "No access recorded yet."
  // empty state, hiding the failure. `logReloadKey` lets the error's Retry
  // button re-run the fetch effect without leaving the tab.
  const [logError, setLogError] = useState(false);
  const [logReloadKey, setLogReloadKey] = useState(0);
  const [renderPreview, setRenderPreview] = useState(getRenderPreference);
  const [wrapLines, setWrapLines] = useState(getWrapPreference);
  const [tocExpanded, setTocExpanded] = useState(getTocPreference);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Timestamp of when the delete confirm was armed. A genuine double-click
  // lands both clicks on the same button, which would arm AND confirm in
  // ~100 ms — ignore confirm clicks that arrive implausibly fast.
  const deleteArmedAtRef = useRef(0);
  const filesContainerRef = useRef<HTMLDivElement>(null);
  const pendingScrollIdRef = useRef<string | null>(null);
  const copyAllClipboard = useClipboard();
  const titleClipboard = useClipboard();
  const linkClipboard = useClipboard();
  const fileClipboard = useClipboardWithKey();
  const apiClipboard = useClipboardWithKey();

  // Memoize resolved languages for all files
  const resolvedLanguages = useMemo(
    () => new Map(stash.files.map((f) => [f.id, resolveEffectiveLanguage(f)])),
    [stash.files],
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
        const prefix = needsToc ? fileHeadingIdPrefix(i) : '';
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

  // Memoize Prism-highlighted HTML per file. Without this, every state-driven
  // re-render (collapse toggles, clipboard feedback, …) would re-run
  // highlightCode over all expanded files — noticeable on large stashes.
  const highlightedContent = useMemo(
    () =>
      new Map(
        stash.files.map((f) => [
          f.id,
          highlightCode(f.content, resolvedLanguages.get(f.id) || 'text'),
        ]),
      ),
    [stash.files, resolvedLanguages],
  );

  const toggleRenderPreview = useCallback(() => {
    setRenderPreview((prev) => {
      const next = !prev;
      setRenderPreference(next);
      return next;
    });
  }, []);

  /** Toggle raw-code line wrapping and persist the choice (global preference). */
  const toggleWrapLines = useCallback(() => {
    setWrapLines((prev) => {
      const next = !prev;
      setWrapPreference(next);
      return next;
    });
  }, []);

  /** Switch tab and persist the choice so the next stash opens on the same tab. */
  const switchTab = useCallback((tab: ViewerTab) => {
    setActiveTab(tab);
    setTabPreference(tab);
  }, []);

  // Hotkeys 1-4 to switch viewer tabs. Skipped when focus is inside an
  // editable element so the keys are not stolen from inline text inputs.
  useEffect(() => {
    const TAB_MAP: Record<string, ViewerTab> = {
      '1': 'content',
      '2': 'metadata',
      '3': 'access-log',
      '4': 'history',
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isEditing =
        tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable;
      if (isEditing) return;
      const tab = TAB_MAP[e.key];
      if (tab) {
        e.preventDefault();
        switchTab(tab);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [switchTab]);

  /** Toggle a file's collapsed state in the content tab. */
  const toggleFileCollapsed = useCallback((fileId: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  // True when every file is collapsed — drives the master toggle's
  // collapse-all vs expand-all behavior and its label/icon.
  const allFilesCollapsed = stash.files.length > 0 && collapsedFiles.size === stash.files.length;

  /** Collapse every file, or — when all are already collapsed — expand them all. */
  const toggleAllFilesCollapsed = useCallback(() => {
    setCollapsedFiles((prev) =>
      prev.size === stash.files.length ? new Set() : new Set(stash.files.map((f) => f.id)),
    );
  }, [stash.files]);

  /**
   * Clicking the header bar surface toggles collapse. Clicks on the filename
   * (kept selectable), the action buttons, or the actions area keep their own
   * behavior — only the "empty" header surface acts as the toggle target.
   * The chevron is a real <button> (keyboard accessible) whose own onClick
   * toggles; its bubbled click is skipped here via the `button` selector.
   */
  const handleFileHeaderClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, fileId: string) => {
      if ((e.target as Element).closest('button, .file-name, .file-actions')) return;
      toggleFileCollapsed(fileId);
    },
    [toggleFileCollapsed],
  );

  // Collapse state is per stash; the component instance is reused across
  // stash switches (no remount), so reset explicitly. Also reset the scroll
  // container — otherwise navigating from deep inside a long stash leaves
  // the reader mid-page in the next one.
  useEffect(() => {
    setCollapsedFiles(new Set());
    document.querySelector('.main-content')?.scrollTo(0, 0);
  }, [stash.id]);

  const scrollToId = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
      e.preventDefault();
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      // Heading targets live inside file content, so they are missing from
      // the DOM while their file is collapsed. Expand the owning file and
      // finish the scroll after the re-render (effect below).
      const fileIndex = parseFileHeadingId(id);
      const file = fileIndex !== null ? stash.files[fileIndex] : undefined;
      if (!file) return;
      pendingScrollIdRef.current = id;
      setCollapsedFiles((prev) => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
    },
    [stash.files],
  );

  // Finish a TOC heading jump that required expanding a collapsed file first.
  useEffect(() => {
    if (!pendingScrollIdRef.current) return;
    const el = document.getElementById(pendingScrollIdRef.current);
    pendingScrollIdRef.current = null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [collapsedFiles]);

  useEffect(() => {
    if (activeTab !== 'access-log') return;
    let cancelled = false;
    setLogLoading(true);
    setLogError(false);
    api
      .getAccessLog(stash.id, 100)
      .then((log) => {
        if (!cancelled) setAccessLog(log);
      })
      .catch(() => {
        if (!cancelled) {
          setAccessLog([]);
          setLogError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, stash.id, logReloadKey]);

  // Cleanup delete confirmation timer on unmount
  useEffect(() => {
    return () => {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    };
  }, []);

  // Render inline Mermaid placeholders inside the rendered markdown.
  //
  // `hydrateMermaidPlaceholders` walks the freshly-committed DOM and fills each
  // `.mermaid-placeholder` with its SVG. It is idempotent (claims each node
  // synchronously) and its writes are NOT tied to this effect's lifecycle, so a
  // re-render during page boot cannot orphan an in-flight render — the bug that
  // left diagrams blank on a full page load / F5 (#286). See mermaid-hydrate.ts.
  useEffect(() => {
    if (activeTab !== 'content' || !renderPreview) return;
    const root = filesContainerRef.current;
    if (!root) return;
    hydrateMermaidPlaceholders(root);
    // `collapsedFiles` is a dep because re-expanding a collapsed markdown file
    // mounts pristine placeholders that need a hydration pass.
  }, [renderedContent, renderPreview, activeTab, collapsedFiles]);

  const copyAllFiles = () => {
    const allContent = stash.files
      .map((f) => `// === ${f.filename} ===\n${f.content}`)
      .join('\n\n');
    copyAllClipboard.copy(allContent);
  };

  /**
   * Copy a shareable deep-link to this stash. Uses the live page origin so the
   * copied URL works in whatever context the app is served from (dev, custom
   * port, reverse-proxied host). Runs only in the browser (click handler), so
   * `window` is always available here.
   */
  const copyStashLink = () => {
    linkClipboard.copy(buildStashUrl(window.location.origin, stash.id));
  };

  const handleDelete = () => {
    if (showDeleteConfirm) {
      if (Date.now() - deleteArmedAtRef.current < 300) return;
      onDelete(stash.id);
    } else {
      deleteArmedAtRef.current = Date.now();
      setShowDeleteConfirm(true);
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = setTimeout(
        () => setShowDeleteConfirm(false),
        DELETE_CONFIRM_TIMEOUT_MS,
      );
    }
  };

  const title = stash.name || stash.files[0]?.filename || 'Untitled';

  // Memoize the rendered description markdown — DOMParser sanitization runs
  // on every call, so cache by description content for consistency with
  // StashCard. (Stash content may render long markdown.)
  const descriptionHtml = useMemo(
    () => (stash.description ? renderDescriptionMarkdown(stash.description) : ''),
    [stash.description],
  );

  // Total content size (UTF-8 bytes) across all files. The list/card view
  // already shows this via `total_size`, but the full Stash payload carries
  // only file content, so recompute it here for the Details table.
  const totalBytes = useMemo(
    () => stash.files.reduce((sum, f) => sum + new TextEncoder().encode(f.content).length, 0),
    [stash.files],
  );

  return (
    <div className="stash-viewer">
      {/*
        This view has no <h1> above it in the tree (App.tsx renders no
        app-level heading), so the visible ".viewer-title" <h2> below was the
        highest heading on the page — a missing top-level landmark for
        assistive tech. A visually-hidden <h1> restores the hierarchy
        (h1 -> h2 -> h3) without changing the visible heading or its
        tag-selector CSS.
      */}
      <h1 className="sr-only">{title}</h1>
      {/* Screen-reader announcement for copy status */}
      <div className="sr-only" aria-live="polite">
        {copyAllClipboard.status === 'copied' && 'All files copied to clipboard'}
        {copyAllClipboard.status === 'failed' && 'Copy failed'}
        {titleClipboard.status === 'copied' && 'Stash name copied to clipboard'}
        {titleClipboard.status === 'failed' && 'Copy failed'}
        {linkClipboard.status === 'copied' && 'Stash link copied to clipboard'}
        {linkClipboard.status === 'failed' && 'Copy failed'}
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
          <button
            type="button"
            className="viewer-title-copy-btn"
            onClick={() => titleClipboard.copy(title)}
            title={
              titleClipboard.copied
                ? 'Copied!'
                : titleClipboard.status === 'failed'
                  ? 'Copy failed'
                  : 'Copy stash name to clipboard'
            }
            aria-label="Copy stash name to clipboard"
          >
            <CopyButtonContent
              copied={titleClipboard.copied}
              failed={titleClipboard.status === 'failed'}
              size={12}
              labelCopy=""
              labelCopied=""
              labelFailed=""
            />
          </button>
        </h2>
        <div className="viewer-actions">
          <button
            className="btn btn-secondary"
            onClick={copyStashLink}
            title={
              linkClipboard.copied
                ? 'Link copied!'
                : linkClipboard.status === 'failed'
                  ? 'Copy failed'
                  : 'Copy a shareable link to this stash'
            }
            aria-label="Copy a shareable link to this stash"
          >
            <CopyButtonContent
              copied={linkClipboard.copied}
              failed={linkClipboard.status === 'failed'}
              size={14}
              labelCopy="Copy Link"
              labelCopied="Link copied"
            />
          </button>
          <button
            className="btn btn-secondary"
            onClick={copyAllFiles}
            title={
              copyAllClipboard.copied
                ? 'Copied!'
                : copyAllClipboard.status === 'failed'
                  ? 'Copy failed'
                  : 'Copy all file contents to clipboard'
            }
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
            title={
              stash.archived
                ? 'Unarchive this stash — restore to active stashes'
                : 'Archive this stash — hide from default listings'
            }
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.75 3h12.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75H1.75A.75.75 0 0 1 1 5.25v-1.5A.75.75 0 0 1 1.75 3ZM2 7.5h12v5.75a.75.75 0 0 1-.75.75H2.75a.75.75 0 0 1-.75-.75Zm4.25 1.5a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5Z" />
            </svg>
            {stash.archived ? 'Unarchive' : 'Archive'}
          </button>
          <button
            className={`btn ${showDeleteConfirm ? 'btn-danger btn-confirm-timeout' : 'btn-ghost'}`}
            onClick={handleDelete}
            title={
              showDeleteConfirm
                ? 'Click again to permanently delete this stash'
                : 'Delete this stash'
            }
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z" />
            </svg>
            {showDeleteConfirm ? 'Confirm Delete?' : 'Delete'}
          </button>
        </div>
      </div>

      <StashBackupControls stash={stash} onStashUpdated={onStashUpdated} />

      {stash.description && (
        <div
          className="viewer-description markdown-description"
          dangerouslySetInnerHTML={{ __html: descriptionHtml }}
        />
      )}

      {(stash.tags.length > 0 || Object.keys(stash.metadata).length > 0) && (
        <div className="viewer-meta-bar">
          {stash.tags.map((tag) => (
            <span key={tag} className="stash-tag" title={`Tag: ${tag}`}>
              {tag}
            </span>
          ))}
          {Object.keys(stash.metadata).length > 0 && (
            <span className="meta-indicator" title="This stash has AI metadata attached">
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="currentColor"
                style={{ marginRight: 4, verticalAlign: -1 }}
              >
                <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.92 6.085h.001a.749.749 0 1 1-1.342-.67c.169-.339.516-.552.974-.552.97 0 1.447.67 1.447 1.181 0 .43-.245.756-.462.97l-.044.042c-.21.196-.383.375-.383.632v.22a.75.75 0 0 1-1.5 0v-.22c0-.67.406-1.05.634-1.26l.044-.043c.16-.147.228-.228.228-.356 0-.098-.06-.233-.447-.233-.218 0-.316.1-.361.183ZM8 10.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
              </svg>
              Has metadata
            </span>
          )}
        </div>
      )}

      <div className="viewer-tabs" role="tablist" aria-label="Stash view tabs">
        <button
          role="tab"
          aria-selected={activeTab === 'content'}
          className={`tab ${activeTab === 'content' ? 'active' : ''}`}
          onClick={() => switchTab('content')}
          title="View file contents (key: 1)"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            style={{ marginRight: 6, verticalAlign: -2 }}
            aria-hidden="true"
          >
            <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z" />
          </svg>
          Content
          <kbd className="tab-kbd">1</kbd>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'metadata'}
          className={`tab ${activeTab === 'metadata' ? 'active' : ''}`}
          onClick={() => switchTab('metadata')}
          title="View stash details, metadata, and API endpoints (key: 2)"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            style={{ marginRight: 6, verticalAlign: -2 }}
            aria-hidden="true"
          >
            <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.92 6.085h.001a.749.749 0 1 1-1.342-.67c.169-.339.516-.552.974-.552.97 0 1.447.67 1.447 1.181 0 .43-.245.756-.462.97l-.044.042c-.21.196-.383.375-.383.632v.22a.75.75 0 0 1-1.5 0v-.22c0-.67.406-1.05.634-1.26l.044-.043c.16-.147.228-.228.228-.356 0-.098-.06-.233-.447-.233-.218 0-.316.1-.361.183ZM8 10.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
          </svg>
          Details & API
          <kbd className="tab-kbd">2</kbd>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'access-log'}
          className={`tab ${activeTab === 'access-log' ? 'active' : ''}`}
          onClick={() => switchTab('access-log')}
          title="View when and how this stash was accessed (API, MCP, UI) (key: 3)"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            style={{ marginRight: 6, verticalAlign: -2 }}
            aria-hidden="true"
          >
            <path d="M1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm.5 4.75a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 .37.65l2.5 1.5a.75.75 0 1 0 .77-1.29L8.5 7.94Z" />
          </svg>
          Access Log
          <kbd className="tab-kbd">3</kbd>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'history'}
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => switchTab('history')}
          title="View version history and compare changes (key: 4)"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            style={{ marginRight: 6, verticalAlign: -2 }}
            aria-hidden="true"
          >
            <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
          </svg>
          History
          <span className="version-count-badge">v{stash.version}</span>
          <kbd className="tab-kbd">4</kbd>
        </button>
        <button
          className="tab tab-analyze"
          onClick={() => onAnalyzeStash(stash.id)}
          title="Analyze connections in the stash graph"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            style={{ marginRight: 6, verticalAlign: -2 }}
            aria-hidden="true"
          >
            <path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Zm0 1.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />
          </svg>
          Analyze
        </button>
      </div>

      {activeTab === 'content' && tocEntries.length > 0 && renderPreview && (
        <div className="viewer-toc">
          <button
            className="viewer-toc-toggle"
            onClick={() =>
              setTocExpanded((prev) => {
                const next = !prev;
                setTocPreference(next);
                return next;
              })
            }
            aria-expanded={tocExpanded}
            aria-controls="viewer-toc-nav"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M2 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm3.75-1.5a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5Zm0 5a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5Zm0 5a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5ZM3 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-1 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
            </svg>
            Table of Contents
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="currentColor"
              className={`toc-chevron ${tocExpanded ? 'expanded' : ''}`}
            >
              <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
          {tocExpanded && (
            <nav id="viewer-toc-nav" className="viewer-toc-nav" aria-label="Table of contents">
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
                      {entry.headings.map((h) => (
                        <li key={h.id} className={`toc-heading toc-h${h.depth}`}>
                          <a href={`#${h.id}`} onClick={(e) => scrollToId(e, h.id)}>
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
        <div className="viewer-files" ref={filesContainerRef}>
          {stash.files.length > 1 && (
            <div className="viewer-files-toolbar">
              <button
                type="button"
                className="btn btn-sm btn-ghost viewer-files-collapse-all"
                onClick={toggleAllFilesCollapsed}
                aria-expanded={!allFilesCollapsed}
                title={allFilesCollapsed ? 'Expand all files' : 'Collapse all files'}
                aria-label={allFilesCollapsed ? 'Expand all files' : 'Collapse all files'}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className={`file-collapse-chevron ${allFilesCollapsed ? '' : 'expanded'}`}
                  aria-hidden="true"
                >
                  <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
                </svg>
                {allFilesCollapsed ? 'Expand all' : 'Collapse all'}
              </button>
            </div>
          )}
          {stash.files.map((file, fileIndex) => {
            const lang = resolvedLanguages.get(file.id) || 'text';
            const renderable = isRenderableLanguage(lang);
            const showRendered = renderable && renderPreview;
            const langLabel =
              file.language || (lang !== 'text' ? `auto:${getLanguageDisplayName(lang)}` : '');

            const collapsed = collapsedFiles.has(file.id);

            return (
              <div
                key={file.id}
                id={`stash-file-${fileIndex}`}
                className={`viewer-file ${collapsed ? 'viewer-file-collapsed' : ''}`}
              >
                <div
                  className="file-header file-header-collapsible"
                  onClick={(e) => handleFileHeaderClick(e, file.id)}
                >
                  <div className="file-title">
                    <button
                      className="btn btn-sm btn-ghost file-collapse-toggle"
                      onClick={() => toggleFileCollapsed(file.id)}
                      aria-expanded={!collapsed}
                      title={collapsed ? `Expand ${file.filename}` : `Collapse ${file.filename}`}
                      aria-label={
                        collapsed ? `Expand ${file.filename}` : `Collapse ${file.filename}`
                      }
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        className={`file-collapse-chevron ${collapsed ? '' : 'expanded'}`}
                        aria-hidden="true"
                      >
                        <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
                      </svg>
                    </button>
                    <span className="file-name" title={file.filename}>
                      {file.filename}
                    </span>
                  </div>
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
                        aria-pressed={showRendered}
                        title={showRendered ? 'Show raw source code' : 'Show rendered preview'}
                        aria-label={showRendered ? 'Show raw source code' : 'Show rendered preview'}
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.831.88 9.577.43 8.9a1.619 1.619 0 0 1 0-1.798c.45-.678 1.367-1.932 2.637-3.023C4.33 2.992 6.019 2 8 2ZM1.679 7.932a.12.12 0 0 0 0 .136c.411.622 1.241 1.75 2.366 2.717C5.176 11.758 6.527 12.5 8 12.5c1.473 0 2.825-.742 3.955-1.715 1.124-.967 1.954-2.096 2.366-2.717a.12.12 0 0 0 0-.136c-.412-.621-1.242-1.75-2.366-2.717C10.824 4.242 9.473 3.5 8 3.5c-1.473 0-2.825.742-3.955 1.715-1.124.967-1.954 2.096-2.366 2.717ZM8 10a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 10Z" />
                        </svg>
                        {showRendered ? 'Raw' : 'Preview'}
                      </button>
                    )}
                    {!showRendered && (
                      <button
                        className={`btn btn-sm btn-ghost wrap-toggle ${wrapLines ? 'wrap-active' : ''}`}
                        onClick={toggleWrapLines}
                        aria-pressed={wrapLines}
                        title={
                          wrapLines
                            ? 'Stop wrapping — scroll long lines horizontally'
                            : 'Wrap long lines to fit the width'
                        }
                        aria-label={wrapLines ? 'Stop wrapping long lines' : 'Wrap long lines'}
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M1.75 3.5a.75.75 0 0 1 0-1.5h12.5a.75.75 0 0 1 0 1.5H1.75Zm0 5a.75.75 0 0 1 0-1.5h9.5a2.75 2.75 0 0 1 0 5.5H8.56l.72.72a.75.75 0 1 1-1.06 1.06l-2-2a.75.75 0 0 1 0-1.06l2-2a.75.75 0 0 1 1.06 1.06l-.72.72h2.69a1.25 1.25 0 0 0 0-2.5h-9.5Zm0 5a.75.75 0 0 1 0-1.5h3.5a.75.75 0 0 1 0 1.5h-3.5Z" />
                        </svg>
                        Wrap
                      </button>
                    )}
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => fileClipboard.copy(file.id, file.content)}
                      title={
                        fileClipboard.isCopied(file.id)
                          ? 'Copied!'
                          : fileClipboard.isFailed(file.id)
                            ? 'Copy failed'
                            : 'Copy file content to clipboard'
                      }
                    >
                      <CopyButtonContent
                        copied={fileClipboard.isCopied(file.id)}
                        failed={fileClipboard.isFailed(file.id)}
                      />
                    </button>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => downloadFile(file.filename, file.content)}
                      title={`Download ${file.filename}`}
                      aria-label={`Download ${file.filename}`}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z" />
                        <path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.97a.749.749 0 1 1 1.06 1.06L8.53 10.03a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06Z" />
                      </svg>
                      Download
                    </button>
                  </div>
                </div>
                {/* Collapsed files skip content rendering entirely — that is
                    the point: large files drop out of the DOM so the page
                    stays fast to scroll. */}
                {!collapsed &&
                  (showRendered && lang === 'mermaid' ? (
                    <div className="file-rendered file-mermaid">
                      <MermaidDiagram
                        code={file.content}
                        storageKey={`${stash.id}:${file.filename}`}
                      />
                    </div>
                  ) : showRendered && lang === 'markdown' ? (
                    <MarkdownBody html={renderedContent.get(file.id) || ''} />
                  ) : showRendered && lang === 'markup' ? (
                    <iframe
                      className="file-rendered html-preview"
                      sandbox=""
                      srcDoc={renderedContent.get(file.id) || ''}
                      title={`Preview of ${file.filename}`}
                    />
                  ) : (
                    <pre className={`file-content${wrapLines ? ' file-content-wrap' : ''}`}>
                      <code
                        dangerouslySetInnerHTML={{
                          __html: highlightedContent.get(file.id) || '',
                        }}
                      />
                    </pre>
                  ))}
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
                <tr>
                  <td>ID</td>
                  <td>
                    <span className="stash-id-cell">
                      <code>{stash.id}</code>
                      <button
                        className="btn btn-sm btn-ghost stash-id-copy-btn"
                        onClick={() => apiClipboard.copy('stash-id', stash.id)}
                        title={
                          apiClipboard.isCopied('stash-id')
                            ? 'Copied!'
                            : apiClipboard.isFailed('stash-id')
                              ? 'Copy failed'
                              : 'Copy stash ID to clipboard'
                        }
                        aria-label="Copy stash ID to clipboard"
                      >
                        <CopyButtonContent
                          copied={apiClipboard.isCopied('stash-id')}
                          failed={apiClipboard.isFailed('stash-id')}
                        />
                      </button>
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>Files</td>
                  <td>{stash.files.length}</td>
                </tr>
                <tr>
                  <td>Size</td>
                  <td>{formatBytes(totalBytes)}</td>
                </tr>
                <tr>
                  <td>Created</td>
                  <td>{new Date(stash.created_at).toLocaleString()}</td>
                </tr>
                <tr>
                  <td>Updated</td>
                  <td>{new Date(stash.updated_at).toLocaleString()}</td>
                </tr>
                {stash.tags.length > 0 && (
                  <tr>
                    <td>Tags</td>
                    <td>{stash.tags.join(', ')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {stash.description && (
            <div className="metadata-section">
              <h3>Description</h3>
              <div
                className="markdown-description"
                style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}
                dangerouslySetInnerHTML={{ __html: descriptionHtml }}
              />
            </div>
          )}

          {Object.keys(stash.metadata).length > 0 && (
            <div className="metadata-section">
              <div className="metadata-section-header">
                <h3>AI Metadata</h3>
                <button
                  className="btn btn-sm btn-ghost copy-btn-inline"
                  onClick={() =>
                    apiClipboard.copy('meta-all-json', JSON.stringify(stash.metadata, null, 2))
                  }
                  title={
                    apiClipboard.isCopied('meta-all-json')
                      ? 'Copied!'
                      : apiClipboard.isFailed('meta-all-json')
                        ? 'Copy failed'
                        : 'Copy all metadata as JSON'
                  }
                  aria-label="Copy all metadata as JSON"
                >
                  <CopyButtonContent
                    copied={apiClipboard.isCopied('meta-all-json')}
                    failed={apiClipboard.isFailed('meta-all-json')}
                    size={12}
                    labelCopy="Copy JSON"
                  />
                </button>
              </div>
              <table className="metadata-table">
                <tbody>
                  {Object.entries(stash.metadata).map(([key, value]) => {
                    const display = typeof value === 'string' ? value : JSON.stringify(value);
                    const copyKey = `meta-${key}`;
                    return (
                      <tr key={key}>
                        <td>{key}</td>
                        <td className="metadata-value-cell">
                          <code>{display}</code>
                          <button
                            className="btn btn-sm btn-ghost copy-btn-inline"
                            onClick={() => apiClipboard.copy(copyKey, display)}
                            title={`Copy value of "${key}"`}
                            aria-label={`Copy value of "${key}"`}
                          >
                            <CopyButtonContent
                              copied={apiClipboard.isCopied(copyKey)}
                              failed={apiClipboard.isFailed(copyKey)}
                            />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="metadata-section">
            <h3>API Access</h3>
            <div className="api-examples">
              <div className="api-example">
                <span className="api-label" title="HTTP GET request to retrieve this stash">
                  GET
                </span>
                <code>/api/stashes/{stash.id}</code>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => apiClipboard.copy(`get-${stash.id}`, `/api/stashes/${stash.id}`)}
                  title={
                    apiClipboard.isCopied(`get-${stash.id}`)
                      ? 'Copied!'
                      : apiClipboard.isFailed(`get-${stash.id}`)
                        ? 'Copy failed'
                        : 'Copy API endpoint'
                  }
                >
                  <CopyButtonContent
                    copied={apiClipboard.isCopied(`get-${stash.id}`)}
                    failed={apiClipboard.isFailed(`get-${stash.id}`)}
                  />
                </button>
                <ApiOpenLink
                  path={`/api/stashes/${stash.id}`}
                  label="Open API endpoint in a new tab"
                />
              </div>
              {stash.files.map((f) => (
                <div key={f.id} className="api-example">
                  <span className="api-label" title="HTTP GET request for raw file content">
                    RAW
                  </span>
                  <code>
                    /api/stashes/{stash.id}/files/{f.filename}/raw
                  </code>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() =>
                      // Encode the filename — the adjacent open-link already
                      // does, and an un-encoded copy breaks for filenames
                      // with spaces or special characters.
                      apiClipboard.copy(
                        `raw-${f.id}`,
                        `/api/stashes/${stash.id}/files/${encodeURIComponent(f.filename)}/raw`,
                      )
                    }
                    title={
                      apiClipboard.isCopied(`raw-${f.id}`)
                        ? 'Copied!'
                        : apiClipboard.isFailed(`raw-${f.id}`)
                          ? 'Copy failed'
                          : 'Copy raw file endpoint'
                    }
                  >
                    <CopyButtonContent
                      copied={apiClipboard.isCopied(`raw-${f.id}`)}
                      failed={apiClipboard.isFailed(`raw-${f.id}`)}
                    />
                  </button>
                  <ApiOpenLink
                    path={`/api/stashes/${stash.id}/files/${encodeURIComponent(f.filename)}/raw`}
                    label={`Open raw ${f.filename} in a new tab`}
                  />
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
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="currentColor"
                style={{ marginRight: 8, verticalAlign: -2 }}
                aria-hidden="true"
              >
                <path d="M1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm.5 4.75a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 .37.65l2.5 1.5a.75.75 0 1 0 .77-1.29L8.5 7.94Z" />
              </svg>
              Access Log
            </h3>
            <span
              className="access-log-hint"
              title="Tracks when this stash was accessed via API, MCP, or the web dashboard"
            >
              Shows recent access from all channels
            </span>
          </div>
          {logLoading ? (
            <div className="loading" role="status" aria-live="polite">
              <Spinner size={16} />
              <span style={{ marginLeft: 10 }}>Loading access log...</span>
            </div>
          ) : logError ? (
            <div className="access-log-empty" role="alert">
              <svg
                width="24"
                height="24"
                viewBox="0 0 16 16"
                fill="currentColor"
                style={{ marginBottom: 8, color: 'var(--text-danger, #f85149)' }}
                aria-hidden="true"
              >
                <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
              </svg>
              <p>Failed to load access log.</p>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => setLogReloadKey((k) => k + 1)}
              >
                Retry
              </button>
            </div>
          ) : accessLog.length === 0 ? (
            <div className="access-log-empty">
              <svg
                width="24"
                height="24"
                viewBox="0 0 16 16"
                fill="currentColor"
                style={{ marginBottom: 8 }}
                aria-hidden="true"
              >
                <path d="M1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm.5 4.75a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 .37.65l2.5 1.5a.75.75 0 1 0 .77-1.29L8.5 7.94Z" />
              </svg>
              <p>No access recorded yet.</p>
              <span className="access-log-hint">
                Access events are logged when this stash is read via API, MCP, or UI.
              </span>
            </div>
          ) : (
            <div className="access-log-list">
              {accessLog.map((entry) => (
                <div key={entry.id} className="access-log-entry">
                  <SourceBadge source={entry.source} />
                  <span className="access-log-action">{entry.action}</span>
                  <RelativeTime dateStr={entry.timestamp} className="access-log-time" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <VersionHistory
          // Remount on stash switch: the internal sub-view (version detail /
          // diff panel) would otherwise keep showing the PREVIOUS stash's
          // version content under the new stash's header.
          key={stash.id}
          stashId={stash.id}
          currentVersion={stash.version}
          onRestore={(restored) => {
            onStashUpdated?.(restored);
            onVersionRestored?.(restored);
          }}
        />
      )}
    </div>
  );
}
