import { useMemo } from 'react';
import type { StashVersion } from '../types';
import { computeFileDiffs } from './version-diff-utils';

interface Props {
  v1: StashVersion;
  v2: StashVersion;
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
      <div className="diff-summary">
        <span className="diff-stat-add">+{stats.additions}</span>
        <span className="diff-stat-remove">-{stats.deletions}</span>
        <span className="diff-stat-files">
          {fileDiffs.filter((f) => f.status !== 'unchanged').length} file
          {fileDiffs.filter((f) => f.status !== 'unchanged').length !== 1 ? 's' : ''} changed
        </span>
      </div>

      {/* Metadata changes */}
      {(v1.name !== v2.name ||
        v1.description !== v2.description ||
        JSON.stringify(v1.tags) !== JSON.stringify(v2.tags)) && (
        <div className="diff-meta-section">
          <div className="diff-file-header">
            <span className="diff-file-status diff-status-modified">M</span>
            <span>Stash Metadata</span>
          </div>
          <div className="diff-meta-body">
            <MetaDiff label="Name" oldVal={v1.name} newVal={v2.name} />
            <MetaDiff label="Description" oldVal={v1.description} newVal={v2.description} />
            <MetaDiff label="Tags" oldVal={v1.tags.join(', ')} newVal={v2.tags.join(', ')} />
          </div>
        </div>
      )}

      {/* File diffs */}
      {fileDiffs
        .filter((f) => f.status !== 'unchanged')
        .map((fd) => (
          <div key={fd.filename} className="diff-file">
            <div className="diff-file-header">
              <span className={`diff-file-status diff-status-${fd.status}`}>
                {fd.status === 'added' ? 'A' : fd.status === 'removed' ? 'D' : 'M'}
              </span>
              <span>{fd.filename}</span>
            </div>
            <div className="diff-table-wrapper">
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
