import { useMemo } from 'react';
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

  const stats = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    for (const fd of fileDiffs) {
      for (const hunk of fd.hunks) {
        for (const line of hunk.lines) {
          if (line.type === 'add') additions++;
          if (line.type === 'remove') deletions++;
        }
      }
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
          {fileDiffs.filter((f) => f.status !== 'unchanged').length} file
          {fileDiffs.filter((f) => f.status !== 'unchanged').length !== 1 ? 's' : ''} changed
        </span>
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
      {fileDiffs
        .filter((f) => f.status !== 'unchanged')
        .map((fd) => (
          <div key={fd.filename} className="diff-file">
            <div className="diff-file-header">
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
            </div>
            {/* Focusable scroll container: `.diff-table-wrapper` is
                `overflow-x: auto` and long code lines push past its width, so
                without a tabindex keyboard-only users cannot scroll it
                (WCAG 2.1.1). */}
            <div
              className="diff-table-wrapper"
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
                        <td className="diff-line-num diff-line-num-old">{line.oldLineNo ?? ''}</td>
                        <td className="diff-line-num diff-line-num-new">{line.newLineNo ?? ''}</td>
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
          </div>
        ))}

      {fileDiffs.every((f) => f.status === 'unchanged') && (
        <div className="diff-no-changes">No file content changes between these versions.</div>
      )}
    </div>
  );
}
