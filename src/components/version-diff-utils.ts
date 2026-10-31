/**
 * Pure helpers for `VersionDiff.tsx` — file-level diff computation between
 * two `StashVersion` snapshots. Extracted so each per-status branch is
 * named, independently testable, and the dispatcher in `computeFileDiffs`
 * stays scannable at a glance.
 */
import { diffLines } from 'diff';
import type { StashVersion } from '../types';

export interface FileDiff {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  hunks: DiffHunk[];
}

export interface DiffHunk {
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

/**
 * Sort key for the file-diff list: changed entries first, then bulk
 * adds/removes, then unchanged. Names the previously-inline `order`
 * literal so callers see the intent without scanning numbers.
 */
export const STATUS_ORDER: Record<FileDiff['status'], number> = {
  modified: 0,
  added: 1,
  removed: 2,
  unchanged: 3,
};

export function diffAddedFile(filename: string, content: string): FileDiff {
  // ''.split('\n') yields [''] — an empty file would render a phantom +1
  // line and inflate the diff stats. Emit an empty hunk instead.
  const lines = content === '' ? [] : content.split('\n');
  return {
    filename,
    status: 'added',
    hunks: [
      {
        lines: lines.map((line, i) => ({ type: 'add', content: line, newLineNo: i + 1 })),
      },
    ],
  };
}

export function diffRemovedFile(filename: string, content: string): FileDiff {
  // Same phantom-line guard as `diffAddedFile` — see comment there.
  const lines = content === '' ? [] : content.split('\n');
  return {
    filename,
    status: 'removed',
    hunks: [
      {
        lines: lines.map((line, i) => ({ type: 'remove', content: line, oldLineNo: i + 1 })),
      },
    ],
  };
}

export function diffModifiedFile(
  filename: string,
  oldContent: string,
  newContent: string,
): FileDiff {
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

  return { filename, status: 'modified', hunks: [{ lines }] };
}

/**
 * Render the computed diffs as a unified diff — the format `git diff` emits and
 * every diff viewer (and every agent) already understands.
 *
 * The rendered table cannot be copied out: line numbers, markers and content
 * live in separate `<td>`s, so a mouse selection yields interleaved gutter
 * numbers rather than a patch. This is the only text form of the comparison.
 *
 * `computeFileDiffs` puts every line of a file in ONE hunk (it does not fold
 * unchanged runs), so each file emits a single `@@` header whose ranges are the
 * full file. Counting is per unified-diff rules: the old range counts context +
 * removals, the new range counts context + additions. A side with zero lines
 * starts at 0, which is how the format spells an empty side.
 */
export function buildUnifiedDiff(fileDiffs: readonly FileDiff[]): string {
  const out: string[] = [];

  for (const fd of fileDiffs) {
    if (fd.status === 'unchanged') continue;

    const lines = fd.hunks.flatMap((h) => h.lines);
    let oldCount = 0;
    let newCount = 0;
    for (const line of lines) {
      if (line.type === 'remove' || line.type === 'context') oldCount++;
      if (line.type === 'add' || line.type === 'context') newCount++;
    }

    // A file that only exists on one side has no counterpart path; /dev/null is
    // the unified-diff spelling for it.
    out.push(`--- ${fd.status === 'added' ? '/dev/null' : `a/${fd.filename}`}`);
    out.push(`+++ ${fd.status === 'removed' ? '/dev/null' : `b/${fd.filename}`}`);
    out.push(`@@ -${oldCount === 0 ? 0 : 1},${oldCount} +${newCount === 0 ? 0 : 1},${newCount} @@`);

    for (const line of lines) {
      const marker = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
      out.push(`${marker}${line.content}`);
    }
  }

  return out.length > 0 ? out.join('\n') + '\n' : '';
}

export function computeFileDiffs(v1: StashVersion, v2: StashVersion): FileDiff[] {
  const v1Files = new Map(v1.files.map((f) => [f.filename, f.content]));
  const v2Files = new Map(v2.files.map((f) => [f.filename, f.content]));
  const allFilenames = new Set([...v1Files.keys(), ...v2Files.keys()]);
  const diffs: FileDiff[] = [];

  for (const filename of allFilenames) {
    const oldContent = v1Files.get(filename);
    const newContent = v2Files.get(filename);

    if (oldContent === undefined && newContent !== undefined) {
      diffs.push(diffAddedFile(filename, newContent));
    } else if (oldContent !== undefined && newContent === undefined) {
      diffs.push(diffRemovedFile(filename, oldContent));
    } else if (oldContent !== undefined && newContent !== undefined) {
      if (oldContent === newContent) {
        diffs.push({ filename, status: 'unchanged', hunks: [] });
      } else {
        diffs.push(diffModifiedFile(filename, oldContent, newContent));
      }
    }
  }

  diffs.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  return diffs;
}

/** Unchanged lines kept on each side of a change when a long run is folded. */
export const DIFF_CONTEXT_LINES = 3;
/**
 * Smallest run of hidden lines worth a fold row. Folding one or two lines
 * would replace them with a "Show 2 unchanged lines" row of the same height.
 */
export const DIFF_MIN_FOLD = 4;

/** A stretch of `DiffLine`s to render as-is, or a folded run of context lines. */
export interface DiffSegment {
  kind: 'lines' | 'fold';
  /** Index into the source `lines` of the segment's first line — a stable key. */
  start: number;
  lines: DiffLine[];
}

/**
 * Splits a diff's lines into visible stretches and folds, the way `git diff`
 * and every code-review tool trim a comparison: `computeFileDiffs` keeps every
 * line of a file, so a one-line change in a 500-line file rendered all 500.
 * Each maximal run of context lines keeps `context` lines next to a change on
 * either side; the rest becomes a fold when it is at least `minFold` lines
 * long. A run at the start or end of the file only borders a change on one
 * side, so it keeps context on that side only. Lines with no change at all
 * (or only changes) come back as one `lines` segment.
 */
export function foldDiffLines(
  lines: DiffLine[],
  context = DIFF_CONTEXT_LINES,
  minFold = DIFF_MIN_FOLD,
): DiffSegment[] {
  const segments: DiffSegment[] = [];
  let visible: DiffLine[] = [];
  let visibleStart = 0;
  const flush = (nextStart: number) => {
    if (visible.length > 0) segments.push({ kind: 'lines', start: visibleStart, lines: visible });
    visible = [];
    visibleStart = nextStart;
  };

  let i = 0;
  while (i < lines.length) {
    if (lines[i]!.type !== 'context') {
      visible.push(lines[i]!);
      i++;
      continue;
    }
    let end = i;
    while (end < lines.length && lines[end]!.type === 'context') end++;
    const keepBefore = i === 0 ? 0 : context;
    const keepAfter = end === lines.length ? 0 : context;
    const hideFrom = i + keepBefore;
    const hideTo = end - keepAfter;
    // A file without a single change has nothing to anchor context to.
    const hasChange = !(i === 0 && end === lines.length);
    if (hasChange && hideTo - hideFrom >= minFold) {
      visible.push(...lines.slice(i, hideFrom));
      flush(hideTo);
      segments.push({ kind: 'fold', start: hideFrom, lines: lines.slice(hideFrom, hideTo) });
      visible.push(...lines.slice(hideTo, end));
    } else {
      visible.push(...lines.slice(i, end));
    }
    i = end;
  }
  flush(lines.length);
  return segments;
}
