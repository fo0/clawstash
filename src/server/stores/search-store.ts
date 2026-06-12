import type Database from 'better-sqlite3';
import type {
  SearchStashItem,
  SearchStashesResult,
  StashFileInfo,
  StashListItem,
  ListStashesOptions,
} from '../db-types';
import { safeParseTags, clampPagination } from './_parsers';

function rowToListItem(row: Record<string, unknown>): Omit<StashListItem, 'files' | 'total_size'> {
  return {
    id: row.id as string,
    name: (row.name as string) || '',
    description: (row.description as string) || '',
    tags: safeParseTags(row.tags),
    version: (row.version as number) || 1,
    archived: (row.archived as number) === 1,
    backup_enabled: (row.backup_enabled as number) === 1,
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
  // The snippet text may contain literal "**" that the user typed into their
  // content (markdown bold, `**kwargs`, …). When such literal markers sit
  // directly next to a highlighted match, naively converting the sentinels
  // produces ambiguous output like "****kwargs**" (#75). Strip the user's
  // literal "**" first so the only "**" left are the genuine highlight markers,
  // then apply the public markers. Single match-marker chars the user typed are
  // harmless and left untouched. The sentinels themselves cannot appear in user
  // content (private-use Unicode + stripped from queries), so this only ever
  // removes user-authored "**".
  return raw
    .replaceAll('**', '')
    .replaceAll(FTS_SNIPPET_OPEN, '**')
    .replaceAll(FTS_SNIPPET_CLOSE, '**');
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

      // Load every file once (grouped by stash, preserving sort_order) instead
      // of one query per stash (former N+1 pattern). Closes BACKLOG #21.
      const fileRows = this.db
        .prepare(
          'SELECT stash_id, filename, content FROM stash_files ORDER BY stash_id, sort_order',
        )
        .all() as { stash_id: string; filename: string; content: string }[];

      const filesByStash = new Map<string, { filename: string; content: string }[]>();
      for (const { stash_id, filename, content } of fileRows) {
        let list = filesByStash.get(stash_id);
        if (!list) {
          list = [];
          filesByStash.set(stash_id, list);
        }
        list.push({ filename, content });
      }

      for (const s of stashes) {
        const files = filesByStash.get(s.id) ?? [];
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

    // Build the shared WHERE clauses (tag + archived) that are appended
    // identically to both the COUNT and the row-fetch queries. Extracting
    // them once prevents count/rows from diverging when filters are added.
    const filterSuffix = { sql: '', params: [] as unknown[] };
    if (tag) {
      filterSuffix.sql += ` AND s.tags LIKE ? ESCAPE '\\'`;
      filterSuffix.params.push(`%"${tag.replace(/[\\%_]/g, '\\$&')}"%`);
    }
    if (archived !== undefined) {
      filterSuffix.sql += ' AND s.archived = ?';
      filterSuffix.params.push(archived ? 1 : 0);
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
      const countSql = `
        SELECT COUNT(*) as count
        FROM stashes_fts f
        JOIN stashes s ON s.id = f.stash_id
        WHERE stashes_fts MATCH ?${filterSuffix.sql}
      `;
      countRow = this.db.prepare(countSql).get(ftsQuery, ...filterSuffix.params) as {
        count: number;
      };

      // Use private-use Unicode markers (U+E000 / U+E001) so we can detect
      // a real FTS hit without confusing it with literal "**" the user wrote
      // (markdown bold, `**kwargs`, etc.). Replaced with "**" before return.
      const O = FTS_SNIPPET_OPEN;
      const C = FTS_SNIPPET_CLOSE;
      const sql = `
        SELECT f.stash_id, f.rank,
          snippet(stashes_fts, 1, '${O}', '${C}', '…', 32) as name_snippet,
          snippet(stashes_fts, 2, '${O}', '${C}', '…', 64) as desc_snippet,
          snippet(stashes_fts, 3, '${O}', '${C}', '…', 32) as tags_snippet,
          snippet(stashes_fts, 4, '${O}', '${C}', '…', 32) as filenames_snippet,
          snippet(stashes_fts, 5, '${O}', '${C}', '…', 64) as content_snippet
        FROM stashes_fts f
        JOIN stashes s ON s.id = f.stash_id
        WHERE stashes_fts MATCH ?${filterSuffix.sql}
        ORDER BY f.rank LIMIT ? OFFSET ?
      `;
      rows = this.db
        .prepare(sql)
        .all(ftsQuery, ...filterSuffix.params, limit, offset) as typeof rows;
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

    // Build results with full stash list info (outside try/catch so real DB errors propagate).
    // Batch-load the stash rows and their files in two IN(...) queries instead
    // of two queries per result row (former N+1 pattern). Bounded by the search
    // limit (default 20). Closes BACKLOG #45.
    const ids = rows.map((row) => row.stash_id);
    const placeholders = ids.map(() => '?').join(', ');

    const stashRowsById = new Map<string, Record<string, unknown>>();
    const filesByStash = new Map<string, StashFileInfo[]>();
    if (ids.length > 0) {
      const stashRows = this.db
        .prepare(`SELECT * FROM stashes WHERE id IN (${placeholders})`)
        .all(...ids) as Record<string, unknown>[];
      for (const stashRow of stashRows) {
        stashRowsById.set(stashRow.id as string, stashRow);
      }

      const fileRows = this.db
        .prepare(
          `SELECT stash_id, filename, language, LENGTH(content) as size FROM stash_files WHERE stash_id IN (${placeholders}) ORDER BY stash_id, sort_order`,
        )
        .all(...ids) as (StashFileInfo & { stash_id: string })[];
      for (const { stash_id, filename, language, size } of fileRows) {
        let list = filesByStash.get(stash_id);
        if (!list) {
          list = [];
          filesByStash.set(stash_id, list);
        }
        list.push({ filename, language, size });
      }
    }

    const stashes: SearchStashItem[] = rows.map((row) => {
      const stashRow = stashRowsById.get(row.stash_id) as Record<string, unknown>;
      const item = rowToListItem(stashRow);
      const files = filesByStash.get(item.id) ?? [];
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
