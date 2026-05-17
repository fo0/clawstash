import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { detectLanguage } from './detect-language';
import { INITIAL_SCHEMA_SQL } from './db-schema';
import { applyPendingMigrations } from './db-migrations';
import { TokenStore } from './stores/token-store';
import { SessionStore } from './stores/session-store';
import { VersionStore } from './stores/version-store';
import { SearchStore } from './stores/search-store';
import type {
  Stash,
  StashFile,
  StashVersion,
  StashVersionFile,
  StashVersionListItem,
  StashFileInfo,
  StashListItem,
  StashMeta,
  AccessLogEntry,
  TokenScope,
  ApiToken,
  ApiTokenListItem,
  CreateStashInput,
  UpdateStashInput,
  ListStashesOptions,
  SearchStashItem,
  SearchStashesResult,
  TagGraphOptions,
  TagGraphResult,
  StashGraphOptions,
  StashGraphNode,
  StashGraphEdge,
  StashGraphResult,
} from './db-types';

// Re-export the data model so existing importers (`import { Stash } from
// './db'`) keep working unchanged. The actual declarations now live in
// db-types.ts. See refactor PR for #129.
export type {
  Stash,
  StashFile,
  StashVersionFile,
  StashVersion,
  StashVersionListItem,
  StashFileInfo,
  StashListItem,
  StashMeta,
  AccessLogEntry,
  TokenScope,
  ApiToken,
  ApiTokenListItem,
  CreateStashInput,
  UpdateStashInput,
  ListStashesOptions,
  SearchStashItem,
  SearchStashesResult,
  TagGraphOptions,
  TagGraphResult,
  StashGraphOptions,
  StashGraphNode,
  StashGraphEdge,
  StashGraphResult,
} from './db-types';

export class ClawStashDB {
  private db: Database.Database;
  private tokens: TokenStore;
  private sessions: SessionStore;
  private versions: VersionStore;
  private search: SearchStore;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || process.env.DATABASE_PATH || './data/clawstash.db';
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.init();
    this.tokens = new TokenStore(this.db);
    this.sessions = new SessionStore(this.db);
    // VersionStore takes a stash-updater callback for restoreStashVersion
    // (which has to round-trip through updateStash to keep stash_files +
    // FTS sync atomic). Wired here so the store stays DB-only.
    this.versions = new VersionStore(this.db, (id, input, createdBy) =>
      this.updateStash(id, input, createdBy),
    );
    // SearchStore takes a listStashes callback for the LIKE-fallback path
    // on malformed FTS5 input. listStashes still lives on ClawStashDB —
    // it touches stashes + stash_files with its own pagination / filter
    // SQL that we don't duplicate.
    this.search = new SearchStore(this.db, (options) => this.listStashes(options));
  }

  private init() {
    this.db.exec(INITIAL_SCHEMA_SQL);
    applyPendingMigrations(this.db);
  }

  private safeParseTags(raw: unknown): string[] {
    if (typeof raw !== 'string') return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string') : [];
    } catch {
      return [];
    }
  }

  private safeParseMetadata(raw: unknown): Record<string, unknown> {
    if (typeof raw !== 'string') return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private rowToStash(row: Record<string, unknown>): Omit<Stash, 'files'> {
    return {
      id: row.id as string,
      name: (row.name as string) || '',
      description: (row.description as string) || '',
      tags: this.safeParseTags(row.tags),
      metadata: this.safeParseMetadata(row.metadata),
      version: (row.version as number) || 1,
      archived: (row.archived as number) === 1,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }

  private rowToListItem(row: Record<string, unknown>): Omit<StashListItem, 'files' | 'total_size'> {
    return {
      id: row.id as string,
      name: (row.name as string) || '',
      description: (row.description as string) || '',
      tags: this.safeParseTags(row.tags),
      version: (row.version as number) || 1,
      archived: (row.archived as number) === 1,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }

  logAccess(
    stashId: string,
    source: 'api' | 'mcp' | 'ui',
    action: string,
    ip?: string,
    userAgent?: string,
  ): void {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      INSERT INTO access_log (id, stash_id, source, action, timestamp, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(id, stashId, source, action, now, ip || null, userAgent || null);
  }

  getAccessLog(stashId: string, limit = 100): AccessLogEntry[] {
    return this.db
      .prepare('SELECT * FROM access_log WHERE stash_id = ? ORDER BY timestamp DESC LIMIT ?')
      .all(stashId, limit) as AccessLogEntry[];
  }

  createStash(input: CreateStashInput): Stash {
    const id = uuidv4();
    const now = new Date().toISOString();

    const insertStash = this.db.prepare(`
      INSERT INTO stashes (id, name, description, tags, metadata, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertFile = this.db.prepare(`
      INSERT INTO stash_files (id, stash_id, filename, content, language, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      const name = input.name || '';
      const description = input.description || '';
      const tagsJson = JSON.stringify(input.tags || []);
      const metadataJson = JSON.stringify(input.metadata || {});

      insertStash.run(id, name, description, tagsJson, metadataJson, 1, now, now);

      const files: StashFile[] = [];
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        const fileId = uuidv4();
        const language = file.language || detectLanguage(file.filename);
        insertFile.run(fileId, id, file.filename, file.content, language, i);
        files.push({
          id: fileId,
          stash_id: id,
          filename: file.filename,
          content: file.content,
          language,
          sort_order: i,
        });
      }

      // Store initial version (v1) so it can be compared with future updates.
      // Delegated to VersionStore (refs #144) — same INSERT statements,
      // moved next to the version read paths.
      this.versions.insertVersionSnapshot({
        stashId: id,
        name,
        description,
        tagsJson,
        metadataJson,
        version: 1,
        createdBy: 'system',
        createdAt: now,
        changeSummaryJson: '{}',
        files,
      });

      // Keep stash relations + FTS index inside the same transaction as the
      // stash/file/version inserts. If any post-insert step fails, everything
      // rolls back together and we never end up with a stash that has stale
      // relations or a missing FTS row.
      this.updateStashRelations(id, input.tags || []);
      this.syncFtsIndex(id);

      return files;
    });

    const files = transaction();

    return {
      id,
      name: input.name || '',
      description: input.description || '',
      tags: input.tags || [],
      metadata: input.metadata || {},
      version: 1,
      archived: false,
      created_at: now,
      updated_at: now,
      files,
    };
  }

  stashExists(id: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM stashes WHERE id = ?').get(id);
    return !!row;
  }

  getStash(id: string): Stash | null {
    const row = this.db.prepare('SELECT * FROM stashes WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;

    const files = this.db
      .prepare('SELECT * FROM stash_files WHERE stash_id = ? ORDER BY sort_order')
      .all(id) as StashFile[];

    return { ...this.rowToStash(row), files };
  }

  getStashMeta(id: string): StashMeta | null {
    const row = this.db.prepare('SELECT * FROM stashes WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;

    const files = this.db
      .prepare(
        'SELECT filename, language, LENGTH(content) as size FROM stash_files WHERE stash_id = ? ORDER BY sort_order',
      )
      .all(id) as StashFileInfo[];

    const total_size = files.reduce((sum, f) => sum + f.size, 0);
    return { ...this.rowToStash(row), total_size, files };
  }

  getStashFile(stashId: string, filename: string): StashFile | null {
    const row = this.db
      .prepare('SELECT * FROM stash_files WHERE stash_id = ? AND filename = ?')
      .get(stashId, filename) as StashFile | undefined;
    return row || null;
  }

  listStashes(options: ListStashesOptions = {}): { stashes: StashListItem[]; total: number } {
    const { search, tag, archived } = options;
    // Clamp at the DB layer so callers that bypass parsePositiveInt (MCP,
    // direct DB) cannot send `page=0`/negative/non-int and produce a
    // SQLite "OFFSET should be non-negative" error or a `LIMIT 0` page.
    const { limit, offset } = this.clampPagination(options.page, options.limit, 50);
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (search) {
      conditions.push(`(g.name LIKE ? ESCAPE '\\' OR g.description LIKE ? ESCAPE '\\' OR EXISTS (
        SELECT 1 FROM stash_files gf WHERE gf.stash_id = g.id AND (gf.content LIKE ? ESCAPE '\\' OR gf.filename LIKE ? ESCAPE '\\')
      ))`);
      const escaped = search.replace(/[\\%_]/g, '\\$&');
      const term = `%${escaped}%`;
      params.push(term, term, term, term);
    }

    if (tag) {
      conditions.push(`g.tags LIKE ? ESCAPE '\\'`);
      const escapedTag = tag.replace(/[\\%_]/g, '\\$&');
      params.push(`%"${escapedTag}"%`);
    }

    if (archived !== undefined) {
      conditions.push('g.archived = ?');
      params.push(archived ? 1 : 0);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = this.db
      .prepare(`SELECT COUNT(*) as count FROM stashes g ${where}`)
      .get(...params) as { count: number };

    const rows = this.db
      .prepare(`SELECT g.* FROM stashes g ${where} ORDER BY g.updated_at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as Record<string, unknown>[];

    const stashes: StashListItem[] = rows.map((row) => {
      const item = this.rowToListItem(row);
      const files = this.db
        .prepare(
          'SELECT filename, language, LENGTH(content) as size FROM stash_files WHERE stash_id = ? ORDER BY sort_order',
        )
        .all(item.id) as StashFileInfo[];
      const total_size = files.reduce((sum, f) => sum + f.size, 0);
      return { ...item, total_size, files };
    });

    return { stashes, total: countRow.count };
  }

  // === FTS5 Full-Text Search ===
  // Delegated to SearchStore (src/server/stores/search-store.ts).

  private syncFtsIndex(stashId: string): void {
    this.search.syncIndex(stashId);
  }

  private removeFtsIndex(stashId: string): void {
    this.search.removeIndex(stashId);
  }

  rebuildFtsIndex(): void {
    this.search.rebuildIndex();
  }

  // Clamp pagination params at the DB layer so callers that bypass the REST
  // route's parsePositiveInt (MCP tool layer, direct DB consumers, future
  // callers) can never produce SQLite OFFSET errors or empty `LIMIT 0` pages.
  // Returns sane positive integers with the documented defaults.
  private clampPagination(
    page: unknown,
    limit: unknown,
    defaultLimit: number,
  ): { page: number; limit: number; offset: number } {
    const safePage = typeof page === 'number' && Number.isInteger(page) && page > 0 ? page : 1;
    const safeLimit =
      typeof limit === 'number' && Number.isInteger(limit) && limit > 0 ? limit : defaultLimit;
    return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit };
  }

  searchStashes(
    query: string,
    options: { tag?: string; archived?: boolean; limit?: number; page?: number } = {},
  ): SearchStashesResult {
    return this.search.searchStashes(query, options);
  }

  updateStash(id: string, input: UpdateStashInput, createdBy = 'system'): Stash | null {
    const existing = this.getStash(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const newVersion = existing.version + 1;

    // Compute change summary
    const changeSummary: Record<string, unknown> = {};
    if (input.name !== undefined && input.name !== existing.name) changeSummary.name = true;
    if (input.description !== undefined && input.description !== existing.description)
      changeSummary.description = true;
    if (input.tags !== undefined) {
      const oldTags = new Set(existing.tags);
      const newTags = new Set(input.tags);
      const added = input.tags.filter((t) => !oldTags.has(t));
      const removed = existing.tags.filter((t) => !newTags.has(t));
      if (added.length || removed.length) {
        changeSummary.tags = true;
        changeSummary.tags_added = added;
        changeSummary.tags_removed = removed;
      }
    }
    if (input.files !== undefined) changeSummary.files = true;
    if (input.metadata !== undefined) changeSummary.metadata = true;

    const transaction = this.db.transaction(() => {
      // Snapshot current state into stash_versions before applying changes
      // Skip if this version was already recorded (e.g. v1 stored during creation)
      const existingVersionRecord = this.db
        .prepare('SELECT id FROM stash_versions WHERE stash_id = ? AND version = ?')
        .get(id, existing.version) as { id: string } | undefined;

      if (!existingVersionRecord) {
        // Snapshot via VersionStore (refs #144). Identical INSERT semantics,
        // moved next to the read paths.
        this.versions.insertVersionSnapshot({
          stashId: id,
          name: existing.name,
          description: existing.description,
          tagsJson: JSON.stringify(existing.tags),
          metadataJson: JSON.stringify(existing.metadata),
          version: existing.version,
          createdBy,
          createdAt: now,
          changeSummaryJson: JSON.stringify(changeSummary),
          files: existing.files,
        });
      }

      // Apply the update
      const updates: string[] = ['updated_at = ?', 'version = ?'];
      const params: unknown[] = [now, newVersion];

      if (input.name !== undefined) {
        updates.push('name = ?');
        params.push(input.name);
      }
      if (input.description !== undefined) {
        updates.push('description = ?');
        params.push(input.description);
      }
      if (input.tags !== undefined) {
        updates.push('tags = ?');
        params.push(JSON.stringify(input.tags));
      }
      if (input.metadata !== undefined) {
        updates.push('metadata = ?');
        params.push(JSON.stringify(input.metadata));
      }
      // Allow `archived` to be flipped inside the same transaction so the
      // route handler can apply archive + content changes atomically (a
      // thrown content update cannot half-flip the archive flag).
      if (input.archived !== undefined) {
        updates.push('archived = ?');
        params.push(input.archived ? 1 : 0);
      }

      params.push(id);
      this.db.prepare(`UPDATE stashes SET ${updates.join(', ')} WHERE id = ?`).run(...params);

      if (input.files !== undefined) {
        this.db.prepare('DELETE FROM stash_files WHERE stash_id = ?').run(id);
        const insertFile = this.db.prepare(`
          INSERT INTO stash_files (id, stash_id, filename, content, language, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (let i = 0; i < input.files.length; i++) {
          const file = input.files[i];
          const language = file.language || detectLanguage(file.filename);
          insertFile.run(uuidv4(), id, file.filename, file.content, language, i);
        }
      }

      // Keep stash relations + FTS index inside the same transaction as the
      // version snapshot and stash mutation. A failure in either step now
      // rolls the whole update back, instead of leaving the stash in a
      // half-updated state where files changed but the FTS index still
      // points at the old content.
      const finalTags = input.tags !== undefined ? input.tags : existing.tags;
      this.updateStashRelations(id, finalTags);
      this.syncFtsIndex(id);
    });

    transaction();

    return this.getStash(id);
  }

  deleteStash(id: string): boolean {
    // Wrap the row delete + FTS cleanup so a mid-operation failure does not
    // leave the FTS index pointing at a stash row that no longer exists.
    const tx = this.db.transaction((stashId: string) => {
      const result = this.db.prepare('DELETE FROM stashes WHERE id = ?').run(stashId);
      if (result.changes > 0) {
        this.removeFtsIndex(stashId);
      }
      return result.changes > 0;
    });
    return tx(id);
  }

  archiveStash(id: string, archived: boolean): Stash | null {
    // Wrap existence check + UPDATE in a transaction so a concurrent DELETE
    // landing between the SELECT and the UPDATE cannot produce a "stash
    // archived OK" return for a row that no longer exists. The UPDATE alone
    // is idempotent (changes = 0 if the row vanished), so the practical
    // race window is small, but the contract is now correct.
    const tx = this.db.transaction((stashId: string, flag: number): boolean => {
      const exists = this.db.prepare('SELECT 1 FROM stashes WHERE id = ?').get(stashId);
      if (!exists) return false;
      this.db.prepare('UPDATE stashes SET archived = ? WHERE id = ?').run(flag, stashId);
      return true;
    });
    const ok = tx(id, archived ? 1 : 0);
    if (!ok) return null;
    return this.getStash(id);
  }

  getAllTags(): { tag: string; count: number }[] {
    const rows = this.db.prepare('SELECT tags FROM stashes').all() as { tags: string }[];
    const tagMap = new Map<string, number>();
    for (const row of rows) {
      const tags = this.safeParseTags(row.tags);
      for (const tag of tags) {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      }
    }
    return Array.from(tagMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  getAllMetadataKeys(): string[] {
    const rows = this.db.prepare("SELECT metadata FROM stashes WHERE metadata != '{}'").all() as {
      metadata: string;
    }[];
    const keySet = new Set<string>();
    for (const row of rows) {
      const meta = this.safeParseMetadata(row.metadata);
      for (const key of Object.keys(meta)) {
        keySet.add(key);
      }
    }
    return Array.from(keySet).sort();
  }

  getTagGraph(options: TagGraphOptions = {}): TagGraphResult {
    const { tag, depth, min_weight, min_count, limit } = options;
    const safeDepth = Number.isFinite(depth) ? depth! : 1;
    const clampedDepth = Math.max(1, Math.min(safeDepth, 5));

    const rows = this.db.prepare('SELECT tags FROM stashes').all() as { tags: string }[];
    const tagCounts = new Map<string, number>();
    const edgeMap = new Map<string, number>();

    for (const row of rows) {
      const tags = this.safeParseTags(row.tags);
      for (const t of tags) {
        tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
      }
      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          const key = JSON.stringify([tags[i], tags[j]].sort());
          edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
        }
      }
    }

    // Parse all edges
    const allEdges: { source: string; target: string; weight: number }[] = [];
    for (const [key, weight] of edgeMap) {
      const [source, target] = JSON.parse(key) as [string, string];
      allEdges.push({ source, target, weight });
    }

    // Build adjacency for BFS traversal
    let includedTags: Set<string> | null = null;

    if (tag) {
      if (!tagCounts.has(tag)) {
        return {
          nodes: [],
          edges: [],
          stash_count: rows.length,
          filter: { tag, depth: clampedDepth },
        };
      }

      // BFS from focus tag up to clampedDepth hops
      includedTags = new Set<string>();
      let frontier = new Set<string>([tag]);
      for (let d = 0; d <= clampedDepth; d++) {
        for (const t of frontier) {
          includedTags.add(t);
        }
        if (d === clampedDepth) break;
        const nextFrontier = new Set<string>();
        for (const edge of allEdges) {
          // Use explicit > 0 check: `min_weight = 0` is falsy but still a
          // legitimate "no minimum" value passed by MCP callers (the REST
          // route layer's parsePositiveInt converts 0 → undefined, but the
          // Zod schema for MCP tools accepts 0 directly).
          if (typeof min_weight === 'number' && min_weight > 0 && edge.weight < min_weight)
            continue;
          if (frontier.has(edge.source) && !includedTags.has(edge.target)) {
            nextFrontier.add(edge.target);
          }
          if (frontier.has(edge.target) && !includedTags.has(edge.source)) {
            nextFrontier.add(edge.source);
          }
        }
        frontier = nextFrontier;
      }
    }

    // Filter nodes
    let nodes = Array.from(tagCounts.entries()).map(([t, count]) => ({ tag: t, count }));

    if (includedTags) {
      nodes = nodes.filter((n) => includedTags!.has(n.tag));
    }
    if (typeof min_count === 'number' && min_count > 0) {
      nodes = nodes.filter((n) => n.count >= min_count);
    }
    nodes.sort((a, b) => b.count - a.count);
    if (typeof limit === 'number' && limit > 0) {
      nodes = nodes.slice(0, limit);
    }

    // Filter edges to only include nodes in the result set
    const nodeSet = new Set(nodes.map((n) => n.tag));
    let edges = allEdges.filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target));
    if (typeof min_weight === 'number' && min_weight > 0) {
      edges = edges.filter((e) => e.weight >= min_weight);
    }
    edges.sort((a, b) => b.weight - a.weight);

    const result: TagGraphResult = { nodes, edges, stash_count: rows.length };
    if (tag) {
      result.filter = { tag, depth: clampedDepth };
    }
    return result;
  }

  // === Stash Relations ===

  private updateStashRelations(stashId: string, tags: string[]): void {
    // Delete old shared_tags relations for this stash
    this.db
      .prepare(
        "DELETE FROM stash_relations WHERE (source_stash_id = ? OR target_stash_id = ?) AND relation_type = 'shared_tags'",
      )
      .run(stashId, stashId);

    if (tags.length === 0) return;

    const rows = this.db.prepare('SELECT id, tags FROM stashes WHERE id != ?').all(stashId) as {
      id: string;
      tags: string;
    }[];
    const tagSet = new Set(tags);

    const insert = this.db.prepare(`
      INSERT INTO stash_relations (id, source_stash_id, target_stash_id, relation_type, weight, metadata)
      VALUES (?, ?, ?, 'shared_tags', ?, ?)
    `);

    for (const row of rows) {
      const otherTags = this.safeParseTags(row.tags);
      const shared = otherTags.filter((t) => tagSet.has(t));
      if (shared.length > 0) {
        const [src, tgt] = [stashId, row.id].sort();
        insert.run(uuidv4(), src, tgt, shared.length, JSON.stringify({ shared_tags: shared }));
      }
    }
  }

  private rebuildStashRelations(): void {
    const rebuild = this.db.transaction(() => {
      try {
        this.db.exec("DELETE FROM stash_relations WHERE relation_type = 'shared_tags'");
      } catch (_) {
        /* table may not exist */
      }

      const stashes = this.db.prepare('SELECT id, tags FROM stashes').all() as {
        id: string;
        tags: string;
      }[];
      const parsed = stashes.map((s) => ({ id: s.id, tags: this.safeParseTags(s.tags) }));

      const insert = this.db.prepare(`
        INSERT INTO stash_relations (id, source_stash_id, target_stash_id, relation_type, weight, metadata)
        VALUES (?, ?, ?, 'shared_tags', ?, ?)
      `);

      for (let i = 0; i < parsed.length; i++) {
        for (let j = i + 1; j < parsed.length; j++) {
          const shared = parsed[i].tags.filter((t) => parsed[j].tags.includes(t));
          if (shared.length > 0) {
            const [src, tgt] = [parsed[i].id, parsed[j].id].sort();
            insert.run(uuidv4(), src, tgt, shared.length, JSON.stringify({ shared_tags: shared }));
          }
        }
      }
    });
    rebuild();
  }

  // === Stash Graph ===

  getStashGraph(options: StashGraphOptions = {}): StashGraphResult {
    const {
      mode = 'relations',
      since,
      until,
      tag,
      limit = 200,
      include_versions = false,
      min_shared_tags = 1,
    } = options;

    // Fetch stashes with optional filters
    let query =
      'SELECT s.id, s.name, s.tags, s.created_at, s.updated_at, s.version, COUNT(sf.id) as file_count, COALESCE(SUM(LENGTH(sf.content)), 0) as total_size FROM stashes s LEFT JOIN stash_files sf ON sf.stash_id = s.id';
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (since) {
      conditions.push('s.created_at >= ?');
      params.push(since);
    }
    if (until) {
      conditions.push('s.created_at <= ?');
      params.push(until);
    }
    if (tag) {
      conditions.push("s.tags LIKE ? ESCAPE '\\'");
      const escapedTag = tag.replace(/[\\%_]/g, '\\$&');
      params.push(`%"${escapedTag}"%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' GROUP BY s.id ORDER BY s.updated_at DESC';
    if (limit > 0) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const stashRows = this.db.prepare(query).all(...params) as {
      id: string;
      name: string;
      tags: string;
      created_at: string;
      updated_at: string;
      version: number;
      file_count: number;
      total_size: number;
    }[];

    if (stashRows.length === 0) {
      return { nodes: [], edges: [], time_range: { min: '', max: '' }, total_stashes: 0 };
    }

    const stashIds = new Set(stashRows.map((r) => r.id));
    const nodes: StashGraphNode[] = [];
    const edges: StashGraphEdge[] = [];

    // Time range
    const timestamps = stashRows.map((r) => r.created_at).sort();
    const timeRange = { min: timestamps[0], max: timestamps[timestamps.length - 1] };

    // Add stash nodes
    const tagCounts = new Map<string, number>();
    const stashTagMap = new Map<string, string[]>();

    for (const row of stashRows) {
      const stashTags = this.safeParseTags(row.tags);
      stashTagMap.set(row.id, stashTags);

      nodes.push({
        id: row.id,
        type: 'stash',
        label: row.name || 'Untitled',
        created_at: row.created_at,
        updated_at: row.updated_at,
        version: row.version,
        file_count: row.file_count,
        total_size: row.total_size,
        tags: stashTags,
      });

      for (const t of stashTags) {
        tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
      }
    }

    // Add tag nodes (only tags used by multiple stashes or in focus)
    for (const [tagName, count] of tagCounts) {
      nodes.push({
        id: `tag:${tagName}`,
        type: 'tag',
        label: tagName,
        count,
      });
    }

    // Add stash→tag edges
    for (const row of stashRows) {
      const stashTags = stashTagMap.get(row.id) || [];
      for (const t of stashTags) {
        edges.push({
          source: row.id,
          target: `tag:${t}`,
          type: 'has_tag',
          weight: 1,
        });
      }
    }

    // Add shared_tags edges from precomputed relations
    const relations = this.db
      .prepare(
        `
      SELECT source_stash_id, target_stash_id, weight, metadata
      FROM stash_relations
      WHERE relation_type = 'shared_tags' AND weight >= ?
    `,
      )
      .all(min_shared_tags) as {
      source_stash_id: string;
      target_stash_id: string;
      weight: number;
      metadata: string;
    }[];

    for (const rel of relations) {
      if (stashIds.has(rel.source_stash_id) && stashIds.has(rel.target_stash_id)) {
        const meta = this.safeParseMetadata(rel.metadata);
        const sharedTags = Array.isArray(meta.shared_tags)
          ? ((meta.shared_tags as unknown[]).filter((t) => typeof t === 'string') as string[])
          : [];
        edges.push({
          source: rel.source_stash_id,
          target: rel.target_stash_id,
          type: 'shared_tags',
          weight: rel.weight,
          metadata: { shared_tags: sharedTags },
        });
      }
    }

    // Temporal proximity edges (stashes created/updated within 24h of each other)
    if (mode === 'timeline' || mode === 'relations') {
      const TEMPORAL_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
      for (let i = 0; i < stashRows.length; i++) {
        for (let j = i + 1; j < stashRows.length; j++) {
          const t1 = new Date(stashRows[i].created_at).getTime();
          const t2 = new Date(stashRows[j].created_at).getTime();
          const delta = Math.abs(t1 - t2);
          if (delta <= TEMPORAL_WINDOW_MS && delta > 0) {
            edges.push({
              source: stashRows[i].id,
              target: stashRows[j].id,
              type: 'temporal_proximity',
              weight: Math.max(0.1, 1 - delta / TEMPORAL_WINDOW_MS),
              metadata: { time_delta_hours: Math.round((delta / (60 * 60 * 1000)) * 10) / 10 },
            });
          }
        }
      }
    }

    // Version nodes & edges
    if (include_versions) {
      for (const row of stashRows) {
        const versions = this.db
          .prepare(
            `
          SELECT id, version, created_by, created_at, change_summary
          FROM stash_versions WHERE stash_id = ? ORDER BY version ASC
        `,
          )
          .all(row.id) as {
          id: string;
          version: number;
          created_by: string;
          created_at: string;
          change_summary: string;
        }[];

        let prevNodeId = row.id; // current stash is the "head"
        for (let vi = versions.length - 1; vi >= 0; vi--) {
          const v = versions[vi];
          const vNodeId = `version:${v.id}`;
          nodes.push({
            id: vNodeId,
            type: 'version',
            label: `v${v.version}`,
            version_number: v.version,
            created_by: v.created_by,
            created_at: v.created_at,
            change_summary: this.safeParseMetadata(v.change_summary),
          });
          edges.push({
            source: vNodeId,
            target: prevNodeId,
            type: 'version_of',
            weight: 1,
          });
          prevNodeId = vNodeId;
        }
      }
    }

    const totalStashes = (
      this.db.prepare('SELECT COUNT(*) as c FROM stashes').get() as { c: number }
    ).c;

    return { nodes, edges, time_range: timeRange, total_stashes: totalStashes };
  }

  getStats(): {
    totalStashes: number;
    totalFiles: number;
    topLanguages: { language: string; count: number }[];
  } {
    const totalStashes = (
      this.db.prepare('SELECT COUNT(*) as c FROM stashes').get() as { c: number }
    ).c;
    const totalFiles = (
      this.db.prepare('SELECT COUNT(*) as c FROM stash_files').get() as { c: number }
    ).c;

    const langRows = this.db
      .prepare(
        "SELECT language, COUNT(*) as count FROM stash_files WHERE language != '' GROUP BY language ORDER BY count DESC LIMIT 10",
      )
      .all() as { language: string; count: number }[];

    return { totalStashes, totalFiles, topLanguages: langRows };
  }

  // === Version History ===
  // Delegated to VersionStore (src/server/stores/version-store.ts).

  getStashVersions(stashId: string): StashVersionListItem[] {
    return this.versions.getStashVersions(stashId);
  }

  getStashVersion(stashId: string, version: number): StashVersion | null {
    return this.versions.getStashVersion(stashId, version, (id) => this.getStash(id));
  }

  restoreStashVersion(stashId: string, version: number, createdBy = 'system'): Stash | null {
    return this.versions.restoreStashVersion(
      stashId,
      version,
      (id) => this.getStash(id),
      createdBy,
    );
  }

  // === API Token Management ===
  // Delegated to TokenStore (src/server/stores/token-store.ts).

  createApiToken(label: string, scopes: TokenScope[]) {
    return this.tokens.createApiToken(label, scopes);
  }

  listApiTokens(): ApiTokenListItem[] {
    return this.tokens.listApiTokens();
  }

  deleteApiToken(id: string): boolean {
    return this.tokens.deleteApiToken(id);
  }

  validateApiToken(token: string) {
    return this.tokens.validateApiToken(token);
  }

  // === Admin Session Management ===
  // Delegated to SessionStore (src/server/stores/session-store.ts).

  createAdminSession(hours: number) {
    return this.sessions.createAdminSession(hours);
  }

  validateAdminSession(token: string) {
    return this.sessions.validateAdminSession(token);
  }

  deleteAdminSession(token: string): boolean {
    return this.sessions.deleteAdminSession(token);
  }

  cleanExpiredSessions(): number {
    return this.sessions.cleanExpiredSessions();
  }

  // === Data Export/Import ===

  exportAllData(): {
    stashes: Record<string, unknown>[];
    stash_files: Record<string, unknown>[];
    stash_versions: Record<string, unknown>[];
    stash_version_files: Record<string, unknown>[];
  } {
    const stashes = this.db.prepare('SELECT * FROM stashes').all() as Record<string, unknown>[];
    const stash_files = this.db.prepare('SELECT * FROM stash_files').all() as Record<
      string,
      unknown
    >[];
    const stash_versions = this.db.prepare('SELECT * FROM stash_versions').all() as Record<
      string,
      unknown
    >[];
    const stash_version_files = this.db
      .prepare('SELECT * FROM stash_version_files')
      .all() as Record<string, unknown>[];
    return { stashes, stash_files, stash_versions, stash_version_files };
  }

  importAllData(data: {
    stashes: Record<string, unknown>[];
    stash_files: Record<string, unknown>[];
    stash_versions?: Record<string, unknown>[];
    stash_version_files?: Record<string, unknown>[];
  }): { stashes: number; files: number; versions: number; versionFiles: number } {
    const tx = this.db.transaction(() => {
      // Clear existing data (order matters for foreign keys)
      this.db.exec('DELETE FROM stash_version_files');
      this.db.exec('DELETE FROM stash_versions');
      this.db.exec('DELETE FROM access_log');
      this.db.exec('DELETE FROM stash_files');
      this.db.exec('DELETE FROM stashes');

      // Also clear stash_relations and FTS index
      try {
        this.db.exec('DELETE FROM stash_relations');
      } catch (_) {
        /* table may not exist */
      }
      try {
        this.db.exec('DELETE FROM stashes_fts');
      } catch (_) {
        /* table may not exist */
      }

      let stashCount = 0;
      let fileCount = 0;
      let versionCount = 0;
      let versionFileCount = 0;

      // Prepare statements once outside loops for performance
      const insertStash = this.db.prepare(`
        INSERT INTO stashes (id, name, description, tags, metadata, version, archived, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertFile = this.db.prepare(`
        INSERT INTO stash_files (id, stash_id, filename, content, language, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertVersion = this.db.prepare(`
        INSERT INTO stash_versions (id, stash_id, name, description, tags, metadata, version, created_by, created_at, change_summary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertVersionFile = this.db.prepare(`
        INSERT INTO stash_version_files (id, version_id, filename, content, language, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      // Insert stashes
      // Coerce archived strictly: only true/1 mean archived. Strings like
      // "false" / "0" must NOT be treated as truthy (they are by `?:`).
      for (const s of data.stashes) {
        const archivedFlag = s.archived === true || s.archived === 1 ? 1 : 0;
        insertStash.run(
          s.id,
          s.name,
          s.description,
          s.tags,
          s.metadata,
          s.version ?? 1,
          archivedFlag,
          s.created_at,
          s.updated_at,
        );
        stashCount++;
      }

      // Insert stash files
      for (const f of data.stash_files) {
        insertFile.run(f.id, f.stash_id, f.filename, f.content, f.language, f.sort_order);
        fileCount++;
      }

      // Insert stash versions (including change_summary)
      if (data.stash_versions) {
        for (const v of data.stash_versions) {
          insertVersion.run(
            v.id,
            v.stash_id,
            v.name,
            v.description,
            v.tags,
            v.metadata,
            v.version,
            v.created_by,
            v.created_at,
            v.change_summary ?? '{}',
          );
          versionCount++;
        }
      }

      // Insert stash version files
      if (data.stash_version_files) {
        for (const vf of data.stash_version_files) {
          insertVersionFile.run(
            vf.id,
            vf.version_id,
            vf.filename,
            vf.content,
            vf.language,
            vf.sort_order,
          );
          versionFileCount++;
        }
      }

      return {
        stashes: stashCount,
        files: fileCount,
        versions: versionCount,
        versionFiles: versionFileCount,
      };
    });

    const result = tx();
    this.rebuildFtsIndex();
    this.rebuildStashRelations();
    return result;
  }

  close() {
    this.db.close();
  }
}

export default ClawStashDB;
