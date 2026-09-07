// One stash, one text blob.
//
// The viewer has always offered "Copy All" — every file of a stash in one
// clipboard write. The same bundle is what a user wants on disk when the
// alternative is clicking Download once per file, so the format lives here
// instead of inside the copy handler, and both surfaces read it from one place.

/** The minimum a file needs to appear in a bundle. */
interface BundleFile {
  filename: string;
  content: string;
}

/** Longest slug taken from a stash name before it is cut (extension excluded). */
const MAX_SLUG_LENGTH = 60;

/**
 * Every file of a stash in one string, each preceded by a `// === name ===`
 * separator. This is the format "Copy All" has always produced — kept verbatim
 * so the clipboard and the downloaded file cannot drift apart.
 */
export function buildAllFilesText(files: readonly BundleFile[]): string {
  return files.map((f) => `// === ${f.filename} ===\n${f.content}`).join('\n\n');
}

/**
 * Filename for the bundle of a whole stash: the stash name as a slug, or its
 * id when the name is empty or slugifies to nothing (a name of only punctuation
 * or non-Latin script). Always `.txt`, because the bundle mixes the file types
 * of every member and is a plain-text listing, not any one of them.
 */
export function bundleFilename(stash: { id: string; name?: string | null }): string {
  const slug = (stash.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    // A cut can land on a separator — drop it rather than ship "name-.txt".
    .replace(/-+$/, '');
  return `${slug || `stash-${stash.id}`}.txt`;
}
