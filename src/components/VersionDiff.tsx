import { useMemo } from 'react';
import { diffLines } from 'diff';
import type { StashVersion } from '../types';

interface Props {
  v1: StashVersion;
  v2: StashVersion;
}

interface FileDiff {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  hunks: DiffHunk[];
}

interface DiffHunk {
  lines: DiffLine[];
}

interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

function computeFileDiffs(v1: StashVersion, v2: StashVersion): FileDiff[] {
  const v1Files = new Map(v1.files.map(f => [f.filename, f.content]));
  const v2Files = new Map(v2.files.map(f => [f.filename, f.content]));
  const allFilenames = new Set([...v1Files.keys(), ...v2Files.keys()]);
  const diffs: FileDiff[] = [];

  for (const filename of allFilenames) {
    const oldContent = v1Files.get(filename);
    const newContent = v2Files.get(filename);

    if (oldContent === undefined && newContent !== undefined) {
      // File added
      const lines = newContent.split('\n');
      diffs.push({
        filename,
        status: 'added',
        hunks: [{
          lines: lines.map((line, i) => ({ type: 'add', content: line, newLineNo: i + 1 })),
        }],
      });
    } else if (oldContent !== undefined && newContent === undefined) {
      // File removed
      const lines = oldContent.split('\n');
      diffs.push({
        filename,
        status: 'removed',
        hunks: [{
          lines: lines.map((line, i) => ({ type: 'remove', content: line, oldLineNo: i + 1 })),
        }],
      });
    } else if (oldContent !== undefined && newContent !== undefined) {
      if (oldContent === newContent) {
        diffs.push({ filename, status: 'unchanged', hunks: [] });
        continue;
      }
      // Modified — compute line diff
      const changes = diffLines(oldContent, newContent);
      const lines: DiffLine[] = [];
      let oldLine = 1;
      let newLine = 1;

      for (const change of changes) {
        const changeLines = change.value.replace(/\n$/, '').split('\n');
        for (const line of changeLines) {
          if (change.added) {
            lines.push({ type: 'add', content: line, newLineNo: newLine++ });
          } else if (change.removed) {
            lines.push({ type: 'remove', content: line, oldLineNo: oldLine++ });
          } else {
            lines.push({ type: 'context', content: line, oldLineNo: oldLine++, newLineNo: newLine++ });
          }
        }
      }

      diffs.push({ filename, status: 'modified', hunks: [{ lines }] });
    }
  }

  // Sort: modified first, then added, then removed, then unchanged
  const order = { modified: 0, added: 1, removed: 2, unchanged: 3 };
  diffs.sort((a, b) => order[a.status] - order[b.status]);
  return diffs;
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
        <span className="diff-stat-files">{fileDiffs.filter(f => f.status !== 'unchanged').length} file{fileDiffs.filter(f => f.status !== 'unchanged').length !== 1 ? 's' : ''} changed</span>
      </div>

      {/* Metadata changes */}
      {(v1.name !== v2.name || v1.description !== v2.description || JSON.stringify(v1.tags) !== JSON.stringify(v2.tags)) && (
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
      {fileDiffs.filter(f => f.status !== 'unchanged').map((fd) => (
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
                {fd.hunks.map((hunk, hi) => (
                  hunk.lines.map((line, li) => (
                    <tr key={`${hi}-${li}`} className={`diff-line diff-line-${line.type}`}>
                      <td className="diff-line-num diff-line-num-old">{line.oldLineNo ?? ''}</td>
                      <td className="diff-line-num diff-line-num-new">{line.newLineNo ?? ''}</td>
                      <td className="diff-line-marker">
                        {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                      </td>
                      <td className="diff-line-content"><pre>{line.content}</pre></td>
                    </tr>
                  ))
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {fileDiffs.every(f => f.status === 'unchanged') && (
        <div className="diff-no-changes">No file content changes between these versions.</div>
      )}
    </div>
  );
}
