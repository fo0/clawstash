/**
 * Zod validation schemas for API route handlers.
 *
 * These schemas validate and constrain input on all POST/PATCH endpoints.
 * Size limits prevent abuse without restricting legitimate use.
 */
import { z } from 'zod';

// --- Size Limits ---
// Exported as the single source of truth for both the REST schemas below and
// the MCP tool schemas (src/server/tool-defs.ts imports these). Keeping one
// copy prevents the two trust boundaries from drifting on payload limits.
export const MAX_NAME_LENGTH = 500;
export const MAX_DESCRIPTION_LENGTH = 50_000;
export const MAX_TAGS = 50;
export const MAX_TAG_LENGTH = 100;
export const MAX_METADATA_KEYS = 50;
export const MAX_METADATA_DEPTH = 5;
export const MAX_FILES = 100;
export const MAX_FILENAME_LENGTH = 255;
export const MAX_RECORD_ID_LENGTH = 100;
export const MAX_FILE_CONTENT_LENGTH = 10 * 1024 * 1024; // 10MB per file
export const MAX_IMPORT_SIZE = 100 * 1024 * 1024; // 100MB for ZIP import
/**
 * Cap on the COMBINED uncompressed size of the JSON entries read out of an
 * import ZIP. `MAX_IMPORT_SIZE` only bounds the compressed upload; a
 * decompression bomb (a few MB of zeros inflating to many GB) would sail past
 * it and OOM the process inside `entry.getData()`. 1GB comfortably exceeds any
 * real export — a full stash DB at the 10MB-per-file / 100-files-per-stash
 * ceiling still compresses far below the upload limit.
 */
export const MAX_IMPORT_UNCOMPRESSED_SIZE = 1024 * 1024 * 1024; // 1GB inflated

/**
 * Compute the maximum nesting depth of a JSON-like value.
 *
 * Depth definitions:
 * - primitives (string/number/boolean/null) and empty objects/arrays = 1
 * - non-empty container with depth-N child = 1 + N
 *
 * Used by the metadata depth refinement to reject deeply nested payloads
 * (defense-in-depth against accidental or malicious nesting that could
 * inflate serialization cost / push downstream parsers into pathological
 * paths). Iterative traversal so a hostile payload cannot blow the JS
 * call stack inside validation itself.
 */
export function maxObjectDepth(value: unknown): number {
  let maxDepth = 0;
  const stack: { v: unknown; d: number }[] = [{ v: value, d: 1 }];
  while (stack.length > 0) {
    const { v, d } = stack.pop()!;
    if (d > maxDepth) maxDepth = d;
    if (v && typeof v === 'object') {
      const entries = Array.isArray(v) ? v : Object.values(v as Record<string, unknown>);
      for (const child of entries) {
        if (child && typeof child === 'object') stack.push({ v: child, d: d + 1 });
      }
    }
  }
  return maxDepth || 1;
}

// --- Shared Sub-Schemas ---

/**
 * Validates a filename: no path separators, no ".." segments, no control
 * characters (incl. NUL / CR / LF), non-empty, within length cap. Used by both
 * write-side schemas (Create/Update) and the read-side raw-file route, so
 * traversal attempts are rejected symmetrically. Today the DB does an
 * exact-match lookup so traversal cannot escape the row; this is
 * defense-in-depth in case file storage ever becomes filesystem-backed.
 *
 * The control-character rejection also closes a header-injection vector: the
 * raw-file route reflects the stored filename into a `Content-Disposition`
 * response header, so a CR/LF in a filename could otherwise smuggle extra
 * header lines. The scan uses char-code comparisons (not a regex with inline
 * control bytes, which are invisible and formatter-fragile).
 */
export function isValidFilename(filename: string): boolean {
  if (typeof filename !== 'string') return false;
  if (filename.length === 0 || filename.length > MAX_FILENAME_LENGTH) return false;
  if (/[/\\]/.test(filename)) return false;
  if (filename.includes('..')) return false;
  // Reject C0 controls (0x00-0x1F, incl. NUL/CR/LF), DEL (0x7F) and C1
  // controls (0x80-0x9F). No legitimate filename contains control bytes.
  for (let i = 0; i < filename.length; i++) {
    const code = filename.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return false;
  }
  return true;
}

/**
 * Validates a record identifier read out of an import archive: no path
 * separators, no ".." segments, no control characters, non-empty, within the
 * length cap. Mirrors `isValidFilename` so both trust boundaries reject the
 * same shapes.
 *
 * Every id ClawStash writes itself is a `crypto.randomUUID()` value, so this
 * is a no-op for genuine exports. `POST /api/admin/import` is the ONLY path
 * on which a caller-chosen id reaches the `stashes` table, and `stash.id` is
 * interpolated into GitHub-backup git tree paths as a bare path segment
 * (`<pathPrefix>/<id>/stash.json`, see backup/backup-service.ts). A `/`, `\`
 * or `..` inside the id therefore escapes the operator's configured backup
 * path prefix and writes outside the intended subtree of their repository.
 * Rejecting the separators here keeps the id symmetric with the filename
 * guard applied to the same archives.
 */
export function isValidRecordId(id: string): boolean {
  if (typeof id !== 'string') return false;
  if (id.length === 0 || id.length > MAX_RECORD_ID_LENGTH) return false;
  if (/[/\\]/.test(id)) return false;
  if (id.includes('..')) return false;
  // Reject C0 controls (0x00-0x1F, incl. NUL/CR/LF), DEL (0x7F) and C1
  // controls (0x80-0x9F). No id ClawStash issues contains control bytes.
  for (let i = 0; i < id.length; i++) {
    const code = id.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return false;
  }
  return true;
}

const FileSchema = z.object({
  filename: z
    .string()
    .min(1, 'Filename is required')
    .max(MAX_FILENAME_LENGTH)
    .refine(isValidFilename, 'Filename contains invalid characters'),
  // No `.min(1)` here: empty-string content is intentionally allowed so
  // placeholder / scaffold files can be stored. Such files survive
  // createStash / updateStash and are FTS-indexed as empty rows (they match
  // no search terms and contribute nothing to BM25 ranking). If empty files
  // should ever be rejected, add `.min(1)` here AND in FileInputSchema
  // (tool-defs.ts) so REST and MCP stay symmetric.
  content: z.string().max(MAX_FILE_CONTENT_LENGTH, 'File content exceeds 10MB limit'),
  language: z.string().max(50).optional(),
});

/**
 * True when no two entries share a filename (compared after trimming).
 *
 * Raw-file lookup (`GET /api/stashes/:id/files/:filename/raw`) resolves a
 * filename to a single row, so a stash holding two files with the same name is
 * ambiguous: only the first match is ever reachable. The editor blocks
 * duplicates client-side, but REST and MCP callers could still create such a
 * stash — reject it at the trust boundary instead.
 *
 * Trimmed comparison also catches the visually identical `"a.txt"` /
 * `"a.txt "` pair, which SQL exact-match would happily store side by side.
 */
export function hasUniqueFilenames(files: { filename: string }[]): boolean {
  const seen = new Set<string>();
  for (const file of files) {
    const key = file.filename.trim();
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

export const DUPLICATE_FILENAME_MESSAGE = 'Filenames must be unique within a stash';

// Reject empty-string tags. `z.string()` accepts "" by default, so without
// `.min(1)` callers could silently push `["", "python"]` into the tag list,
// which then renders as a blank pill in the UI and matches everything in tag
// filters. Tags also feed `getTagGraph`, where empty strings would inflate
// node/edge counts.
const TagsSchema = z
  .array(z.string().min(1, 'Tag cannot be empty').max(MAX_TAG_LENGTH))
  .max(MAX_TAGS);

// `z.record(z.unknown())` accepts arrays in Zod 3 (typeof [] === 'object').
// Without the explicit Array.isArray refusal, an array submitted as
// `metadata: [...]` would pass validation, then `safeParseMetadata` silently
// drops it on read with no error to the caller. Reject up-front instead.
//
// The `maxObjectDepth` refinement caps nested depth at MAX_METADATA_DEPTH —
// metadata is meant for flat key/value bookkeeping (model, agent_id, purpose,
// …). Allowing arbitrary depth would let callers submit pathologically nested
// payloads that bloat JSON-encoding cost and force downstream consumers
// (frontend metadata editor, exports, version diffs) to walk arbitrarily
// deep trees. Closes BACKLOG #27.
const MetadataSchema = z
  .record(z.unknown())
  .refine((val) => !Array.isArray(val), {
    message: 'Metadata must be an object, not an array',
  })
  .refine((val) => Object.keys(val).length <= MAX_METADATA_KEYS, {
    message: `Metadata cannot have more than ${MAX_METADATA_KEYS} keys`,
  })
  .refine((val) => maxObjectDepth(val) <= MAX_METADATA_DEPTH, {
    message: `Metadata nesting cannot exceed ${MAX_METADATA_DEPTH} levels`,
  });

// --- Stash Schemas ---

export const CreateStashSchema = z.object({
  name: z.string().max(MAX_NAME_LENGTH).optional(),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
  tags: TagsSchema.optional(),
  metadata: MetadataSchema.optional(),
  files: z
    .array(FileSchema)
    .min(1, 'At least one file is required')
    .max(MAX_FILES)
    .refine(hasUniqueFilenames, DUPLICATE_FILENAME_MESSAGE),
});

export const UpdateStashSchema = z.object({
  name: z.string().max(MAX_NAME_LENGTH).optional(),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
  tags: TagsSchema.optional(),
  metadata: MetadataSchema.optional(),
  files: z
    .array(FileSchema)
    .max(MAX_FILES)
    .refine(hasUniqueFilenames, DUPLICATE_FILENAME_MESSAGE)
    .optional(),
  archived: z.boolean().optional(),
  backup_enabled: z.boolean().optional(),
});

// --- Import Schemas ---
// Validate rows from export ZIPs before they reach the DB insert statements.
// These are permissive on optional/nullable fields (we accept what a ClawStash
// export actually produces) while rejecting rows that would trip later code
// paths: missing/empty id, non-string fields, non-JSON tags/metadata strings,
// obviously invalid sort_order/version numbers. Closes BACKLOG #67.

/** ISO-8601 datetime string or null — accepts the format written by ClawStash exports. */
const IsoDateStringSchema = z.string().min(1).max(100);

/** JSON string (tags/metadata stored as serialised JSON in the DB). */
const JsonStringSchema = z.string().max(200_000);

/**
 * Row / foreign-key identifier from an export archive. Same length bound the
 * schemas carried before, plus the `isValidRecordId` guard — see there for
 * why a path separator inside an id is a live problem for GitHub backup.
 */
const RecordIdSchema = z
  .string()
  .min(1)
  .max(MAX_RECORD_ID_LENGTH)
  .refine(isValidRecordId, 'Identifier contains invalid characters');

export const ImportStashRowSchema = z.object({
  id: RecordIdSchema,
  name: z.string().max(MAX_NAME_LENGTH).nullable().optional(),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).nullable().optional(),
  tags: JsonStringSchema.nullable().optional(),
  metadata: JsonStringSchema.nullable().optional(),
  version: z.number().int().min(0).nullable().optional(),
  archived: z.union([z.boolean(), z.number().int(), z.null()]).optional(),
  backup_enabled: z.union([z.boolean(), z.number().int(), z.null()]).optional(),
  created_at: IsoDateStringSchema.nullable().optional(),
  updated_at: IsoDateStringSchema.nullable().optional(),
});

// Filenames from an import archive go through the same `isValidFilename`
// guard as the write path (`FileSchema`). Without it the import route is the
// one way a stored filename can carry `/`, `\`, `..` or control bytes — the
// raw-file route reflects stored filenames into a `Content-Disposition`
// header, and DB-exact-match storage is the only reason that is not
// exploitable today. Keeping the two paths symmetric means a future
// FS-backed store cannot inherit a traversal gap from an old export.
const ImportFilenameSchema = z
  .string()
  .min(1)
  .max(MAX_FILENAME_LENGTH)
  .refine(isValidFilename, 'Filename contains invalid characters');

export const ImportStashFileRowSchema = z.object({
  id: RecordIdSchema,
  stash_id: RecordIdSchema,
  filename: ImportFilenameSchema,
  content: z.string().max(MAX_FILE_CONTENT_LENGTH).nullable().optional(),
  language: z.string().max(50).nullable().optional(),
  sort_order: z.number().int().min(0).nullable().optional(),
});

export const ImportStashVersionRowSchema = z.object({
  id: RecordIdSchema,
  stash_id: RecordIdSchema,
  name: z.string().max(MAX_NAME_LENGTH).nullable().optional(),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).nullable().optional(),
  tags: JsonStringSchema.nullable().optional(),
  metadata: JsonStringSchema.nullable().optional(),
  version: z.number().int().min(0).nullable().optional(),
  created_by: z.string().max(50).nullable().optional(),
  created_at: IsoDateStringSchema.nullable().optional(),
  change_summary: JsonStringSchema.nullable().optional(),
});

export const ImportStashVersionFileRowSchema = z.object({
  id: RecordIdSchema,
  version_id: RecordIdSchema,
  filename: ImportFilenameSchema,
  content: z.string().max(MAX_FILE_CONTENT_LENGTH).nullable().optional(),
  language: z.string().max(50).nullable().optional(),
  sort_order: z.number().int().min(0).nullable().optional(),
});

// --- Token Schema ---

export const CreateTokenSchema = z.object({
  label: z.string().max(200).optional().default(''),
  scopes: z
    .array(z.enum(['read', 'write', 'admin', 'mcp']))
    .min(1)
    .transform((s) => [...new Set(s)])
    .optional(),
});

// --- GitHub Backup Schemas (refs #108) ---

// GitHub logins: alphanumeric + inner hyphens. Repo names additionally
// allow dot and underscore. Empty string = "not chosen yet" (settings can
// be saved before a repo is picked).
const GITHUB_OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const GITHUB_REPO_PATTERN = /^[A-Za-z0-9._-]+$/;
// Pragmatic subset of valid git ref names — covers `main`, `backups/prod`
// etc. while rejecting whitespace and ref-syntax metacharacters.
const GIT_BRANCH_PATTERN = /^[A-Za-z0-9._/-]+$/;
const REPO_PATH_PREFIX_PATTERN = /^[A-Za-z0-9._/-]*$/;

export const GithubOwnerSchema = z
  .string()
  .max(100)
  .refine((v) => v === '' || GITHUB_OWNER_PATTERN.test(v), 'Invalid repository owner');

export const GithubRepoNameSchema = z
  .string()
  .max(150)
  .refine((v) => v === '' || GITHUB_REPO_PATTERN.test(v), 'Invalid repository name');

export const BackupSettingsSchema = z.object({
  enabled: z.boolean(),
  repoOwner: GithubOwnerSchema,
  repoName: GithubRepoNameSchema,
  branch: z
    .string()
    .min(1)
    .max(200)
    .regex(GIT_BRANCH_PATTERN, 'Invalid branch name')
    .refine((v) => !v.includes('..'), 'Invalid branch name'),
  pathPrefix: z
    .string()
    .max(200)
    .regex(REPO_PATH_PREFIX_PATTERN, 'Path prefix may contain letters, digits, ., _, - and /')
    .refine((v) => !v.includes('..'), 'Path prefix must not contain ".."'),
  intervalMinutes: z.union([
    z.literal(0),
    z.literal(5),
    z.literal(15),
    z.literal(60),
    z.literal(360),
    z.literal(1440),
  ]),
  deleteMode: z.enum(['remove', 'keep']),
  commitAuthorName: z.string().min(1).max(100),
  commitAuthorEmail: z.string().min(3).max(200).email(),
  oauthClientId: z
    .string()
    .max(100)
    .regex(/^[A-Za-z0-9._-]*$/, 'Invalid OAuth client ID'),
});

export const BackupPatSchema = z.object({
  token: z
    .string()
    .min(8, 'Token is too short')
    .max(300)
    .regex(/^\S+$/, 'Token must not contain whitespace'),
});

export const BackupDeviceStartSchema = z.object({
  clientId: z
    .string()
    .min(10)
    .max(100)
    .regex(/^[A-Za-z0-9._-]+$/, 'Invalid OAuth client ID')
    .optional(),
});

export const BackupDevicePollSchema = z.object({
  sessionId: z.string().uuid(),
});

export const BackupSyncSchema = z.object({
  stashId: z.string().min(1).max(100).optional(),
  force: z.boolean().optional(),
});

// --- Helpers ---

/**
 * Render a Zod issue path readably: keys joined with `.`, array indices in
 * brackets — `files[0].content`, not `files.0.content` (BACKLOG #127).
 */
export function formatZodPath(path: readonly (string | number | symbol)[]): string {
  let out = '';
  for (const segment of path) {
    if (typeof segment === 'number') out += `[${segment}]`;
    else out += out.length > 0 ? `.${String(segment)}` : String(segment);
  }
  return out;
}

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((i) => {
      const path = formatZodPath(i.path);
      return path.length > 0 ? `${path}: ${i.message}` : i.message;
    })
    .join('; ');
}
