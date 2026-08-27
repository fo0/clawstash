import { useCallback, useMemo, useState } from 'react';
import type { StashVersion } from '../types';
import type { FileDiff } from './version-diff-utils';
import { computeFileDiffs } from './version-diff-utils';

/** Spelled-out form of the single-letter A / D / M status badge. */
const STATUS_WORD: Record<FileDiff['status'], string> = {
  added: 'Added',
  removed: 'Deleted',
  modified: 'Modified',
  unchanged: 'Unchanged',
};

interface Props {
  v1: StashVersion;
  v2: StashVersion;
}

/** Compact "key: value" listing of a version's metadata for the meta-diff row. */
function formatMetadataSummary(metadata: Record<string, unknown> | undefined): string {
  return Object.entries(metadata ?? {})
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(', ');
}

/** Right-pointing chevron; rotated by `.expanded` — same asset the viewer uses. */
function CollapseChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={`file-collapse-chevron ${expanded ? 'expanded' : ''}`}
      aria-hidden="true"
    >
      <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

/** Added / removed line counts of a single file diff. */
function countLines(fd: FileDiff): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const hunk of fd.hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'add') additions++;
      if (line.type === 'remove') deletions++;
    }
  }
  return { additions, deletions };
}

function MetaDiff({ label, oldVal, newVal }: { label: string; oldVal: string; newVal: string }) {
  if (oldVal === newVal) return null;
  return (
    <div className="diff-meta-change">
      <span className="diff-meta-label">{label}:</span>
      <span className="diff-line-remove">{oldVal || '(empty)'}</span>
      <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>&rarr;</span>
      <span className="diff-line-add">{newVal || '(empty)'}</span>
    </div>
  );
}

export default function VersionDiff({ v1, v2 }: Props) {
  const fileDiffs = useMemo(() => computeFileDiffs(v1, v2), [v1, v2]);
  // The files actually shown below. Hoisted out of the three inline filters
  // that used to recompute it on every render.
  const changedFiles = useMemo(
    () => fileDiffs.filter((f) => f.status !== 'unchanged'),
    [fileDiffs],
  );
  const perFile = useMemo(
    () => new Map(changedFiles.map((fd) => [fd.filename, countLines(fd)])),
    [changedFiles],
  );

  // Filenames whose hunks are folded away. A diff of many files was one
  // uninterruptible scroll with no way to skim which files changed — the
  // stash viewer already folds files this way. Expanded stays the default,
  // so nothing is hidden unless the user asks for it.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const allCollapsed = changedFiles.length > 0 && collapsed.size >= changedFiles.length;

  const toggleFile = useCallback((filename: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setCollapsed((prev) =>
      prev.size >= changedFiles.length ? new Set() : new Set(changedFiles.map((f) => f.filename)),
    );
  }, [changedFiles]);

  const stats = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    for (const fd of fileDiffs) {
      const counts = countLines(fd);
      additions += counts.additions;
      deletions += counts.deletions;
    }
    return { additions, deletions };
  }, [fileDiffs]);

  return (
    <div className="version-diff">
      {/* "+12 / -3 / A / D / M" carry their whole meaning in a sign or a single
          letter — read aloud they are just characters. The visible chrome stays
          exactly as it was; the words are added for assistive tech and as
          hover titles. */}
      <div className="diff-summary">
        <span className="diff-stat-add" title={`${stats.additions} lines added`}>
          +{stats.additions}
          <span className="sr-only"> lines added</span>
        </span>
        <span className="diff-stat-remove" title={`${stats.deletions} lines removed`}>
          -{stats.deletions}
          <span className="sr-only"> lines removed</span>
        </span>
        <span className="diff-stat-files">
          {changedFiles.length} file{changedFiles.length !== 1 ? 's' : ''} changed
        </span>
        {changedFiles.length > 1 && (
          <button
            type="button"
            className="btn btn-sm btn-ghost diff-collapse-all"
            onClick={toggleAll}
            aria-expanded={!allCollapsed}
            title={allCollapsed ? 'Expand all file diffs' : 'Collapse all file diffs'}
            aria-label={allCollapsed ? 'Expand all file diffs' : 'Collapse all file diffs'}
          >
            <CollapseChevron expanded={!allCollapsed} />
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        )}
      </div>

      {/* Metadata changes */}
      {(v1.name !== v2.name ||
        v1.description !== v2.description ||
        JSON.stringify(v1.tags) !== JSON.stringify(v2.tags) ||
        JSON.stringify(v1.metadata ?? {}) !== JSON.stringify(v2.metadata ?? {})) && (
        <div className="diff-meta-section">
          <div className="diff-file-header">
            <span className="diff-file-status diff-status-modified" title={STATUS_WORD.modified}>
              <span aria-hidden="true">M</span>
              <span className="sr-only">{STATUS_WORD.modified}:</span>
            </span>
            <span>Stash Metadata</span>
          </div>
          <div className="diff-meta-body">
            <MetaDiff label="Name" oldVal={v1.name} newVal={v2.name} />
            <MetaDiff label="Description" oldVal={v1.description} newVal={v2.description} />
            <MetaDiff label="Tags" oldVal={v1.tags.join(', ')} newVal={v2.tags.join(', ')} />
            <MetaDiff
              label="Metadata"
              oldVal={formatMetadataSummary(v1.metadata)}
              newVal={formatMetadataSummary(v2.metadata)}
            />
          </div>
        </div>
      )}

      {/* File diffs */}
      {changedFiles.map((fd) => {
        const isCollapsed = collapsed.has(fd.filename);
        const counts = perFile.get(fd.filename) ?? { additions: 0, deletions: 0 };
        const bodyId = `diff-body-${encodeURIComponent(fd.filename)}`;
        return (
          <div
            key={fd.filename}
            className={`diff-file${isCollapsed ? ' diff-file-collapsed' : ''}`}
          >
            <div className="diff-file-header">
              <button
                type="button"
                className="btn btn-sm btn-ghost file-collapse-toggle"
                onClick={() => toggleFile(fd.filename)}
                aria-expanded={!isCollapsed}
                // Only point at the body while it is actually in the DOM — a
                // collapsed file unmounts it, and a dangling aria-controls id
                // would reference nothing (same rule as the search overlay).
                aria-controls={isCollapsed ? undefined : bodyId}
                title={isCollapsed ? `Expand ${fd.filename}` : `Collapse ${fd.filename}`}
                aria-label={isCollapsed ? `Expand ${fd.filename}` : `Collapse ${fd.filename}`}
              >
                <CollapseChevron expanded={!isCollapsed} />
              </button>
              <span
                className={`diff-file-status diff-status-${fd.status}`}
                title={STATUS_WORD[fd.status]}
              >
                <span aria-hidden="true">
                  {fd.status === 'added' ? 'A' : fd.status === 'removed' ? 'D' : 'M'}
                </span>
                <span className="sr-only">{STATUS_WORD[fd.status]}:</span>
              </span>
              <span>{fd.filename}</span>
              {/* Per-file counts, so a folded file still says how much it
                  changed — the summary bar only carries the totals. */}
              <span className="diff-file-stats">
                <span className="diff-stat-add" title={`${counts.additions} lines added`}>
                  +{counts.additions}
                  <span className="sr-only"> lines added</span>
                </span>
                <span className="diff-stat-remove" title={`${counts.deletions} lines removed`}>
                  -{counts.deletions}
                  <span className="sr-only"> lines removed</span>
                </span>
              </span>
            </div>
            {/* Focusable scroll container: `.diff-table-wrapper` is
                `overflow-x: auto` and long code lines push past its width, so
                without a tabindex keyboard-only users cannot scroll it
                (WCAG 2.1.1). Unmounted rather than hidden while collapsed, so
                a folded file costs neither layout nor a tab stop. */}
            {!isCollapsed && (
              <div
                className="diff-table-wrapper"
                id={bodyId}
                // Deliberate: the focusable-scroll-region fix described above.
                // The plugin has no rule for scrollable regions and flags the
                // fix for one instead.
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable scroll region
                tabIndex={0}
                role="region"
                aria-label={`Diff for ${fd.filename}`}
              >
                <table className="diff-table">
                  <tbody>
                    {fd.hunks.map((hunk, hi) =>
                      hunk.lines.map((line, li) => (
                        <tr key={`${hi}-${li}`} className={`diff-line diff-line-${line.type}`}>
                          <td className="diff-line-num diff-line-num-old">
                            {line.oldLineNo ?? ''}
                          </td>
                          <td className="diff-line-num diff-line-num-new">
                            {line.newLineNo ?? ''}
                          </td>
                          <td className="diff-line-marker">
                            {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                          </td>
                          <td className="diff-line-content">
                            <pre>{line.content}</pre>
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {changedFiles.length === 0 && (
        <div className="diff-no-changes">No file content changes between these versions.</div>
      )}
    </div>
  );
}
