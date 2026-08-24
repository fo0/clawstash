import type { FileInput } from '../types';
import { formatBytes } from './format';

/**
 * Cap on a single drop / pick. Dropping a folder is easy to do by accident and
 * every accepted file becomes its own code editor in the form.
 */
export const MAX_IMPORT_FILES = 20;

/** U+FFFD REPLACEMENT CHARACTER — what a UTF-8 decoder emits for a bad byte. */
const REPLACEMENT_CHAR = 0xfffd;

export interface FileImportResult {
  /** Files that were read and are safe to add to the editor. */
  files: FileInput[];
  /** One human-readable line per rejected file: what was skipped and why. */
  skipped: string[];
}

/**
 * Reduce a picked file's name to something `isValidFilename` (server) accepts:
 * a bare basename, no path separators, no `..`, no control characters, capped
 * in length and never empty. A dropped folder yields names like `src/a.ts`,
 * which the server would reject outright.
 */
export function sanitizeImportedFilename(raw: string, maxLength = 255): string {
  const base = raw.split(/[/\\]/).pop() ?? '';
  const cleaned = Array.from(base)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      // C0 controls, DEL and the C1 range — the exact set the server rejects.
      return code >= 0x20 && !(code >= 0x7f && code <= 0x9f);
    })
    .join('')
    .replace(/\.{2,}/g, '.');
  const capped = cleaned.slice(0, maxLength).trim();
  return capped.length > 0 ? capped : 'untitled.txt';
}

/**
 * True when the decoded text almost certainly came from a binary file.
 * `File.text()` decodes as UTF-8 and turns undecodable bytes into replacement
 * characters, so a PNG arrives as a wall of U+FFFD instead of as a read error.
 * A NUL byte alone is already conclusive.
 */
export function isProbablyBinary(content: string): boolean {
  const sample = content.slice(0, 4096);
  if (sample.length === 0) return false;
  let replacements = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code === 0) return true;
    if (code === REPLACEMENT_CHAR) replacements++;
  }
  return replacements / sample.length > 0.1;
}

/**
 * Read picked files into editor rows, rejecting what a stash cannot hold.
 *
 * `maxContentLength` counts string length (the server's Zod `.max()` does too).
 * UTF-8 never uses more than 3 bytes per UTF-16 unit, so a byte size above
 * `3 * maxContentLength` is over the limit for certain — checked before the
 * read so an oversized file is never decoded into memory first.
 */
export async function readImportedFiles(
  selected: readonly File[],
  maxContentLength: number,
  maxFiles: number = MAX_IMPORT_FILES,
): Promise<FileImportResult> {
  const files: FileInput[] = [];
  const skipped: string[] = [];
  const accepted = selected.slice(0, maxFiles);
  if (selected.length > accepted.length) {
    const rest = selected.length - accepted.length;
    skipped.push(`${rest} more file${rest !== 1 ? 's' : ''} — at most ${maxFiles} per import.`);
  }
  const overLimit = (name: string, size: number) =>
    `${name} — ${formatBytes(size)}, over the ${formatBytes(maxContentLength)} per-file limit.`;

  for (const file of accepted) {
    const name = sanitizeImportedFilename(file.name);
    if (file.size > maxContentLength * 3) {
      skipped.push(overLimit(name, file.size));
      continue;
    }
    let content: string;
    try {
      content = await file.text();
    } catch {
      skipped.push(`${name} — could not be read.`);
      continue;
    }
    if (isProbablyBinary(content)) {
      skipped.push(`${name} — looks binary; stashes hold text.`);
      continue;
    }
    if (content.length > maxContentLength) {
      skipped.push(overLimit(name, content.length));
      continue;
    }
    files.push({ filename: name, content, language: '' });
  }
  return { files, skipped };
}
