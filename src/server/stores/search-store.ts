import type Database from 'better-sqlite3';
import type {
  SearchStashItem,
  SearchStashesResult,
  StashFileInfo,
  StashListItem,
  ListStashesOptions,
} from '../db-types';

// Defensive parser — duplicated from ClawStashDB so this store is
// self-contained. Same contract: corrupted JSON in tags row must not
// throw out of the search endpoint.
function safeParseTags(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

function rowToListItem(row: Record<string, unknown>): Omit<StashListItem, 'files' | 'total_size'> {
  return {
    id: row.id as string,
    name: (row.name as string) || '',
    description: (row.description as string) || '',
    tags: safeParseTags(row.tags),
    version: (row.version as number) || 1,
    archived: (row.archived as number) === 1,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

// FTS5 snippet markers — Unicode private-use characters that cannot
// appear in legitimate user content. Used internally so we can detect a
// real snippet hit without false positives from literal "**" the user
// typed (markdown bold, `**kwargs`, etc.). Replaced with the public
// "**…**" markers before snippets leave the search method.
const FTS_SNIPPET_OPEN = '';
const FTS_SNIPPET_CLOSE = '';

function formatSnippet(raw: string): string {
  return raw.split(FTS_SNIPPET_OPEN).join('**').split(FTS_SNIPPET_CLOSE).join('**');
}

// Clamp pagination params at the DB layer so callers that bypass the
// REST route's parsePositiveInt cannot produce SQLite OFFSET errors or
// empty `LIMIT 0` pages.
function clampPagination(
  page: unknown,
  limit: unknown,
  defaultLimit: number,
): { page: number; limit: number; offset: number } {
  const safePage = typeof page === 'number' && Number.isInteger(page) && page > 0 ? page : 1;
  const safeLimit =
    typeof limit === 'number' && Number.isInteger(limit) && limit > 0 ? limit : defaultLimit;
  return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit };
}

/**
 * FTS5 search + LIKE-fallback (refs #144).
 *
 * Extracted from ClawStashDB as the third of three store splits. The
 * behaviour is bit-for-bit identical to the prior inlined implementation
 * — characterization tests in src/server/__tests__/db-search.test.ts
 * pin the contract (BM25 ranking, prefix matching, sentinel-leak
 * protection, tag / archived filters, pagination clamping).
 *
 * `searchStashes` falls back to a LIKE search via `listStashes` on
 * malformed FTS5 input. That call has to round-trip through ClawStashDB
 * because `listStashes` lives there (it touches stashes + stash_files
 * with its own pagination + filter logic). The store therefore takes a
 * `listStashes` callback in its constructor.
 */
export type StashLister = (options: ListStashesOptions) => {
  stashes: StashListItem[];
  total: number;
};

export class SearchStore {
  constructor(
    private readonly db: Database.Database,
    private readonly listStashes: StashLister,
  ) {}

  // === FTS5 index sync ===
  // Called by ClawStashDB on every create / update / delete so the
  // stashes_fts virtual table stays in step with the stashes table.

  syncIndex(stashId: string): void {
    this.db.prepare('DELETE FROM stashes_fts WHERE stash_id = ?').run(stashId);

    const stash = this.db
      .prepare('SELECT name, description, tags FROM stashes WHERE id = ?')
      .get(stashId) as
      | {
          name: string;
          description: string;
          tags: string;
        }
      | undefined;
    if (!stash) return;

    const files = this.db
      .prepare('SELECT filename, content FROM stash_files WHERE stash_id = ? ORDER BY sort_order')
      .all(stashId) as {
      filename: string;
      content: string;
    }[];

    const filenames = files.map((f) => f.filename).join(' ');
    const fileContent = files.map((f) => f.content).join('\n');
    const tags = safeParseTags(stash.tags).join(' ');

    this.db
      .prepare(
        `
      INSERT INTO stashes_fts (stash_id, name, description, tags, filenames, file_content)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      )
      .run(stashId, stash.name, stash.description, tags, filenames, fileContent);
  }

  removeIndex(stashId: string): void {
    this.db.prepare('DELETE FROM stashes_fts WHERE stash_id = ?').run(stashId);
  }

  rebuildIndex(): void {
    const rebuild = this.db.transaction(() => {
      this.db.prepare('DELETE FROM stashes_fts').run();

      const stashes = this.db.prepare('SELECT id, name, description, tags FROM stashes').all() as {
        id: string;
        name: string;
        description: string;
        tags: string;
      }[];

      const insertFts = this.db.prepare(`
        INSERT INTO stashes_fts (stash_id, name, description, tags, filenames, file_content)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const s of stashes) {
        const files = this.db
          .prepare(
            'SELECT filename, content FROM stash_files WHERE stash_id = ? ORDER BY sort_order',
          )
          .all(s.id) as {
          filename: string;
          content: string;
        }[];
        const filenames = files.map((f) => f.filename).join(' ');
        const fileContent = files.map((f) => f.content).join('\n');
        const tags = safeParseTags(s.tags).join(' ');
        insertFts.run(s.id, s.name, s.description, tags, filenames, fileContent);
      }
    });
    rebuild();
  }

  // === Query parsing ===

  buildFtsQuery(input: string): string {
    // Guard against excessively long queries
    const trimmed = input.trim();
    if (trimmed.length > 2000) return '';

    const tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || tokens.length > 50) return '';

    return tokens
      .map((t) => {
        // Strip FTS5 special syntax characters (including +/- operators) to prevent
        // query errors. Strip C0 controls (\x00-\x1F, \x7F), backtick, and the FTS
        // snippet sentinels (U+E000 / U+E001) — defense-in-depth so a query
        // containing the sentinel cannot survive into the prepared statement and
        // confuse downstream snippet detection.
        // eslint-disable-next-line no-control-regex
        const cleaned = t.replace(/['"()*{}[\]:^~!@#$%&\\<>+\-,;./|`\x00-\x1F\x7F]/g, '');
        if (!cleaned) return null;
        // Prefix matching: "pyth" matches "python".
        // Skip 1-char prefix scans — `a*` matches every word starting with `a` and
        // can produce a very expensive scan with huge result sets on big DBs.
        if (cleaned.length < 2) return cleaned;
        return cleaned + '*';
      })
      .filter(Boolean)
      .join(' ');
  }

  // === Search ===

  searchStashes(
    query: string,
    options: { tag?: string; archived?: boolean; limit?: number; page?: number } = {},
  ): SearchStashesResult {
    const { tag, archived } = options;
    // Clamp at the DB layer so MCP callers (which don't go through
    // parsePositiveInt) cannot send page=0 → negative OFFSET → SQLite
    // throw, or limit=0 → empty results despite non-zero `total`.
    const { limit, offset } = clampPagination(options.page, options.limit, 20);
    const ftsQuery = this.buildFtsQuery(query);

    if (!ftsQuery) {
      return { stashes: [], total: 0, query };
    }

    // Run FTS5 query — may throw on syntax errors despite sanitization
    let countRow: { count: number };
    let rows: {
      stash_id: string;
      rank: number;
      name_snippet: string;
      desc_snippet: string;
      tags_snippet: string;
      filenames_snippet: string;
      content_snippet: string;
    }[];

    try {
      let countSql = `
        SELECT COUNT(*) as count
        FROM stashes_fts f
        JOIN stashes s ON s.id = f.stash_id
        WHERE stashes_fts MATCH ?
      `;
      const countParams: unknown[] = [ftsQuery];

      if (tag) {
        countSql += ` AND s.tags LIKE ? ESCAPE '\\'`;
        const escapedTag = tag.replace(/[\\%_]/g, '\\$&');
        countParams.push(`%"${escapedTag}"%`);
      }

      if (archived !== undefined) {
        countSql += ' AND s.archived = ?';
        countParams.push(archived ? 1 : 0);
      }

      countRow = this.db.prepare(countSql).get(...countParams) as { count: number };

      // Use private-use Unicode markers (U+E000 / U+E001) so we can detect
      // a real FTS hit without confusing it with literal "**" the user wrote
      // (markdown bold, `**kwargs`, etc.). Replaced with "**" before return.
      const O = FTS_SNIPPET_OPEN;
      const C = FTS_SNIPPET_CLOSE;
      let sql = `
        SELECT f.stash_id, f.rank,
          snippet(stashes_fts, 1, '${O}', '${C}', '…', 32) as name_snippet,
          snippet(stashes_fts, 2, '${O}', '${C}', '…', 64) as desc_snippet,
          snippet(stashes_fts, 3, '${O}', '${C}', '…', 32) as tags_snippet,
          snippet(stashes_fts, 4, '${O}', '${C}', '…', 32) as filenames_snippet,
          snippet(stashes_fts, 5, '${O}', '${C}', '…', 64) as content_snippet
        FROM stashes_fts f
        JOIN stashes s ON s.id = f.stash_id
        WHERE stashes_fts MATCH ?
      `;
      const params: unknown[] = [ftsQuery];

      if (tag) {
        sql += ` AND s.tags LIKE ? ESCAPE '\\'`;
        const escapedTag = tag.replace(/[\\%_]/g, '\\$&');
        params.push(`%"${escapedTag}"%`);
      }

      if (archived !== undefined) {
        sql += ' AND s.archived = ?';
        params.push(archived ? 1 : 0);
      }

      sql += ` ORDER BY f.rank LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      rows = this.db.prepare(sql).all(...params) as typeof rows;
    } catch (err) {
      // Only fall back to LIKE search for FTS5-specific errors (syntax /
      // malformed MATCH). Other errors (Zod, schema, I/O, etc.) must
      // propagate so real bugs are not silently swallowed.
      const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
      const isFtsSyntaxError =
        msg.includes('fts5') || msg.includes('syntax') || msg.includes('malformed');
      if (!isFtsSyntaxError) throw err;
      console.warn(
        '[DB] FTS5 search failed, falling back to LIKE:',
        err instanceof Error ? err.message : err,
      );
      // Forward the original raw page/limit; listStashes clamps them
      // identically. Both call paths converge on the same defaults.
      const fallback = this.listStashes({
        search: query,
        tag,
        archived,
        limit: options.limit,
        page: options.page,
      });
      return {
        stashes: fallback.stashes.map((s) => ({ ...s, relevance: 0 })),
        total: fallback.total,
        query,
      };
    }

    // Build results with full stash list info (outside try/catch so real DB errors propagate)
    const stashes: SearchStashItem[] = rows.map((row) => {
      const stashRow = this.db
        .prepare('SELECT * FROM stashes WHERE id = ?')
        .get(row.stash_id) as Record<string, unknown>;
      const item = rowToListItem(stashRow);
      const files = this.db
        .prepare(
          'SELECT filename, language, LENGTH(content) as size FROM stash_files WHERE stash_id = ? ORDER BY sort_order',
        )
        .all(item.id) as StashFileInfo[];
      const total_size = files.reduce((sum, f) => sum + f.size, 0);

      // Only include snippets that contain highlighted matches. Detect via
      // the private-use sentinel (cannot appear in user content), then format
      // with the public "**…**" markers documented in the API contract.
      const snippets: Record<string, string> = {};
      if (row.name_snippet && row.name_snippet.includes(FTS_SNIPPET_OPEN))
        snippets.name = formatSnippet(row.name_snippet);
      if (row.desc_snippet && row.desc_snippet.includes(FTS_SNIPPET_OPEN))
        snippets.description = formatSnippet(row.desc_snippet);
      if (row.tags_snippet && row.tags_snippet.includes(FTS_SNIPPET_OPEN))
        snippets.tags = formatSnippet(row.tags_snippet);
      if (row.filenames_snippet && row.filenames_snippet.includes(FTS_SNIPPET_OPEN))
        snippets.filenames = formatSnippet(row.filenames_snippet);
      if (row.content_snippet && row.content_snippet.includes(FTS_SNIPPET_OPEN))
        snippets.file_content = formatSnippet(row.content_snippet);

      return {
        ...item,
        total_size,
        files,
        relevance: Math.abs(row.rank),
        snippets: Object.keys(snippets).length > 0 ? snippets : undefined,
      };
    });

    return { stashes, total: countRow.count, query };
  }
}
