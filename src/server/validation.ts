/**
 * Zod validation schemas for API route handlers.
 *
 * These schemas validate and constrain input on all POST/PATCH endpoints.
 * Size limits prevent abuse without restricting legitimate use.
 */
import { z } from 'zod';

// --- Size Limits ---
const MAX_NAME_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 50_000;
const MAX_TAGS = 50;
const MAX_TAG_LENGTH = 100;
const MAX_METADATA_KEYS = 50;
const MAX_FILES = 100;
const MAX_FILENAME_LENGTH = 255;
const MAX_FILE_CONTENT_LENGTH = 10 * 1024 * 1024; // 10MB per file
export const MAX_IMPORT_SIZE = 100 * 1024 * 1024; // 100MB for ZIP import

// --- Shared Sub-Schemas ---

const FileSchema = z.object({
  filename: z.string().min(1, 'Filename is required').max(MAX_FILENAME_LENGTH)
    .refine(f => !/[/\\]/.test(f) && !f.includes('..') && !f.includes('\0'), 'Filename contains invalid characters'),
  content: z.string().max(MAX_FILE_CONTENT_LENGTH, 'File content exceeds 10MB limit'),
  language: z.string().max(50).optional(),
});

// Reject empty-string tags. `z.string()` accepts "" by default, so without
// `.min(1)` callers could silently push `["", "python"]` into the tag list,
// which then renders as a blank pill in the UI and matches everything in tag
// filters. Tags also feed `getTagGraph`, where empty strings would inflate
// node/edge counts.
const TagsSchema = z.array(z.string().min(1, 'Tag cannot be empty').max(MAX_TAG_LENGTH)).max(MAX_TAGS);

// `z.record(z.unknown())` accepts arrays in Zod 3 (typeof [] === 'object').
// Without the explicit Array.isArray refusal, an array submitted as
// `metadata: [...]` would pass validation, then `safeParseMetadata` silently
// drops it on read with no error to the caller. Reject up-front instead.
const MetadataSchema = z.record(z.unknown())
  .refine((val) => !Array.isArray(val), {
    message: 'Metadata must be an object, not an array',
  })
  .refine(
    (val) => Object.keys(val).length <= MAX_METADATA_KEYS,
    { message: `Metadata cannot have more than ${MAX_METADATA_KEYS} keys` }
  );

// --- Stash Schemas ---

export const CreateStashSchema = z.object({
  name: z.string().max(MAX_NAME_LENGTH).optional(),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
  tags: TagsSchema.optional(),
  metadata: MetadataSchema.optional(),
  files: z.array(FileSchema).min(1, 'At least one file is required').max(MAX_FILES),
});

export const UpdateStashSchema = z.object({
  name: z.string().max(MAX_NAME_LENGTH).optional(),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
  tags: TagsSchema.optional(),
  metadata: MetadataSchema.optional(),
  files: z.array(FileSchema).max(MAX_FILES).optional(),
  archived: z.boolean().optional(),
});

// --- Token Schema ---

export const CreateTokenSchema = z.object({
  label: z.string().max(200).optional().default(''),
  scopes: z.array(z.enum(['read', 'write', 'admin', 'mcp'])).min(1).transform(s => [...new Set(s)]).optional(),
});

// --- Helpers ---

export function formatZodError(error: z.ZodError): string {
  return error.issues.map(i => {
    const path = i.path.length > 0 ? `${i.path.join('.')}: ` : '';
    return `${path}${i.message}`;
  }).join('; ');
}
