import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

export interface StashFile {
  id: string;
  stash_id: string;
  filename: string;
  content: string;
  language: string;
  sort_order: number;
}

export interface Stash {
  id: string;
  name: string;
  description: string;
  tags: string[];
  metadata: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
  files: StashFile[];
}

export interface StashVersionFile {
  filename: string;
  content: string;
  language: string;
  sort_order: number;
}

export interface StashVersion {
  id: string;
  stash_id: string;
  name: string;
  description: string;
  tags: string[];
  metadata: Record<string, unknown>;
  version: number;
  created_by: string;
  created_at: string;
  files: StashVersionFile[];
}

export interface StashVersionListItem {
  id: string;
  stash_id: string;
  name: string;
  description: string;
  version: number;
  created_by: string;
  created_at: string;
  file_count: number;
  total_size: number;
}

export interface StashFileInfo {
  filename: string;
  language: string;
  size: number;
}

export interface StashListItem {
  id: string;
  name: string;
  description: string;
  tags: string[];
  version: number;
  created_at: string;
  updated_at: string;
  total_size: number;
  files: StashFileInfo[];
}

export interface StashMeta {
  id: string;
  name: string;
  description: string;
  tags: string[];
  metadata: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
  total_size: number;
  files: StashFileInfo[];
}

export interface AccessLogEntry {
  id: string;
  stash_id: string;
  source: 'api' | 'mcp' | 'ui';
  action: string;
  timestamp: string;
  ip?: string;
  user_agent?: string;
}

export type TokenScope = 'read' | 'write' | 'admin' | 'mcp';

export interface ApiToken {
  id: string;
  label: string;
  token_hash: string;
  token_prefix: string;
  scopes: TokenScope[];
  created_at: string;
}

export interface ApiTokenListItem {
  id: string;
  label: string;
  tokenPrefix: string;
  scopes: TokenScope[];
  createdAt: string;
}

export interface CreateStashInput {
  name?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  files: { filename: string; content: string; language?: string }[];
}

export interface UpdateStashInput {
  name?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  files?: { filename: string; content: string; language?: string }[];
}

export interface ListStashesOptions {
  search?: string;
  tag?: string;
  page?: number;
  limit?: number;
}

export interface SearchStashItem extends StashListItem {
  relevance: number;
  snippets?: Record<string, string>;
}

export interface SearchStashesResult {
  stashes: SearchStashItem[];
  total: number;
  query: string;
}

export interface TagGraphOptions {
  tag?: string;
  depth?: number;
  min_weight?: number;
  min_count?: number;
  limit?: number;
}

export interface TagGraphResult {
  nodes: { tag: string; count: number }[];
  edges: { source: string; target: string; weight: number }[];
  stash_count: number;
  filter?: { tag: string; depth: number };
}

export interface StashGraphOptions {
  mode?: 'relations' | 'timeline' | 'versions';
  since?: string;
  until?: string;
  tag?: string;
  limit?: number;
  include_versions?: boolean;
  min_shared_tags?: number;
}

export interface StashGraphNode {
  id: string;
  type: 'stash' | 'tag' | 'version';
  label: string;
  created_at?: string;
  updated_at?: string;
  version?: number;
  file_count?: number;
  total_size?: number;
  tags?: string[];
  count?: number;
  version_number?: number;
  created_by?: string;
  change_summary?: Record<string, unknown>;
}

export interface StashGraphEdge {
  source: string;
  target: string;
  type: 'has_tag' | 'shared_tags' | 'version_of' | 'temporal_proximity';
  weight: number;
  metadata?: {
    shared_tags?: string[];
    time_delta_hours?: number;
  };
}

export interface StashGraphResult {
  nodes: StashGraphNode[];
  edges: StashGraphEdge[];
  time_range: { min: string; max: string };
  total_stashes: number;
}

interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'add_stashes_version_column',
    up: (db) => {
      const columns = db.prepare("PRAGMA table_info(stashes)").all() as { name: string }[];
      if (!columns.some(c => c.name === 'version')) {
        db.exec('ALTER TABLE stashes ADD COLUMN version INTEGER NOT NULL DEFAULT 1');
      }
    }
  },
  {
    version: 2,
    name: 'add_stash_change_summary',
    up: (db) => {
      const columns = db.prepare("PRAGMA table_info(stash_versions)").all() as { name: string }[];
      if (!columns.some(c => c.name === 'change_summary')) {
        db.exec("ALTER TABLE stash_versions ADD COLUMN change_summary TEXT NOT NULL DEFAULT '{}'");
      }
    }
  },
  {
    version: 3,
    name: 'add_stash_graph_indexes',
    up: (db) => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_stashes_tags ON stashes(tags);
        CREATE INDEX IF NOT EXISTS idx_stash_versions_created_at ON stash_versions(created_at);
      `);
    }
  },
  {
    version: 4,
    name: 'add_stash_relations_table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS stash_relations (
          id TEXT PRIMARY KEY,
          source_stash_id TEXT NOT NULL REFERENCES stashes(id) ON DELETE CASCADE,
          target_stash_id TEXT NOT NULL REFERENCES stashes(id) ON DELETE CASCADE,
          relation_type TEXT NOT NULL CHECK(relation_type IN ('shared_tags', 'temporal', 'manual')),
          weight REAL NOT NULL DEFAULT 1.0,
          metadata TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(source_stash_id, target_stash_id, relation_type)
        );

        CREATE INDEX IF NOT EXISTS idx_stash_relations_source ON stash_relations(source_stash_id);
        CREATE INDEX IF NOT EXISTS idx_stash_relations_target ON stash_relations(target_stash_id);
        CREATE INDEX IF NOT EXISTS idx_stash_relations_type ON stash_relations(relation_type);
      `);
    }
  },
  {
    version: 5,
    name: 'add_graph_cache_table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS graph_cache (
          cache_key TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          expires_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_graph_cache_expires ON graph_cache(expires_at);
      `);
    }
  },
  {
    version: 6,
    name: 'backfill_stash_relations',
    up: (db) => {
      const stashes = db.prepare('SELECT id, tags FROM stashes').all() as { id: string; tags: string }[];
      const parsed = stashes.map(s => ({ id: s.id, tags: JSON.parse(s.tags) as string[] }));

      const insert = db.prepare(`
        INSERT OR IGNORE INTO stash_relations (id, source_stash_id, target_stash_id, relation_type, weight, metadata)
        VALUES (?, ?, ?, 'shared_tags', ?, ?)
      `);

      for (let i = 0; i < parsed.length; i++) {
        for (let j = i + 1; j < parsed.length; j++) {
          const shared = parsed[i].tags.filter(t => parsed[j].tags.includes(t));
          if (shared.length > 0) {
            const [src, tgt] = [parsed[i].id, parsed[j].id].sort();
            insert.run(uuidv4(), src, tgt, shared.length, JSON.stringify({ shared_tags: shared }));
          }
        }
      }
    }
  },
  {
    version: 7,
    name: 'backfill_initial_version_records',
    up: (db) => {
      // Find stashes that have NO version records at all (never updated, or created before versioning)
      const stashes = db.prepare(`
        SELECT s.id, s.name, s.description, s.tags, s.metadata, s.created_at
        FROM stashes s
        WHERE NOT EXISTS (
          SELECT 1 FROM stash_versions sv WHERE sv.stash_id = s.id
        )
      `).all() as { id: string; name: string; description: string; tags: string; metadata: string; created_at: string }[];

      if (stashes.length === 0) return;

      const insertVersion = db.prepare(`
        INSERT INTO stash_versions (id, stash_id, name, description, tags, metadata, version, created_by, created_at, change_summary)
        VALUES (?, ?, ?, ?, ?, ?, 1, 'system', ?, '{}')
      `);

      const insertVersionFile = db.prepare(`
        INSERT INTO stash_version_files (id, version_id, filename, content, language, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const s of stashes) {
        const versionId = uuidv4();
        insertVersion.run(versionId, s.id, s.name, s.description, s.tags, s.metadata, s.created_at);

        const files = db.prepare('SELECT filename, content, language, sort_order FROM stash_files WHERE stash_id = ? ORDER BY sort_order').all(s.id) as { filename: string; content: string; language: string; sort_order: number }[];
        for (const f of files) {
          insertVersionFile.run(uuidv4(), versionId, f.filename, f.content, f.language, f.sort_order);
        }
      }

      console.log(`[DB] Backfilled initial version records for ${stashes.length} stash(es)`);
    }
  },
  {
    version: 8,
    name: 'add_fts5_search_index',
    up: (db) => {
      // Create FTS5 virtual table for ranked full-text search
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS stashes_fts USING fts5(
          stash_id UNINDEXED,
          name,
          description,
          tags,
          filenames,
          file_content,
          tokenize='porter unicode61'
        );
      `);

      // Backfill existing stashes
      const stashes = db.prepare('SELECT id, name, description, tags FROM stashes').all() as {
        id: string; name: string; description: string; tags: string;
      }[];

      const insertFts = db.prepare(`
        INSERT INTO stashes_fts (stash_id, name, description, tags, filenames, file_content)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const s of stashes) {
        const files = db.prepare('SELECT filename, content FROM stash_files WHERE stash_id = ? ORDER BY sort_order').all(s.id) as {
          filename: string; content: string;
        }[];
        const filenames = files.map(f => f.filename).join(' ');
        const fileContent = files.map(f => f.content).join('\n');
        const tags = (JSON.parse(s.tags) as string[]).join(' ');
        insertFts.run(s.id, s.name, s.description, tags, filenames, fileContent);
      }

      console.log(`[DB] FTS5 search index created and backfilled for ${stashes.length} stash(es)`);
    }
  },
];

export class ClawStashDB {
  private db: Database.Database;

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
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS stashes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS stash_files (
        id TEXT PRIMARY KEY,
        stash_id TEXT NOT NULL REFERENCES stashes(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        language TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS access_log (
        id TEXT PRIMARY KEY,
        stash_id TEXT NOT NULL REFERENCES stashes(id) ON DELETE CASCADE,
        source TEXT NOT NULL CHECK(source IN ('api', 'mcp', 'ui')),
        action TEXT NOT NULL DEFAULT 'read',
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        ip TEXT,
        user_agent TEXT
      );

      CREATE TABLE IF NOT EXISTS api_tokens (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL DEFAULT '',
        token_hash TEXT NOT NULL UNIQUE,
        token_prefix TEXT NOT NULL,
        scopes TEXT NOT NULL DEFAULT '["read"]',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_stashes_created_at ON stashes(created_at);
      CREATE INDEX IF NOT EXISTS idx_stashes_updated_at ON stashes(updated_at);
      CREATE INDEX IF NOT EXISTS idx_stash_files_stash_id ON stash_files(stash_id);
      CREATE INDEX IF NOT EXISTS idx_access_log_stash_id ON access_log(stash_id);
      CREATE INDEX IF NOT EXISTS idx_access_log_timestamp ON access_log(timestamp);
      CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash);

      CREATE TABLE IF NOT EXISTS admin_sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_admin_sessions_hash ON admin_sessions(token_hash);

      CREATE TABLE IF NOT EXISTS stash_versions (
        id TEXT PRIMARY KEY,
        stash_id TEXT NOT NULL REFERENCES stashes(id) ON DELETE CASCADE,
        name TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        metadata TEXT NOT NULL DEFAULT '{}',
        version INTEGER NOT NULL,
        created_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS stash_version_files (
        id TEXT PRIMARY KEY,
        version_id TEXT NOT NULL REFERENCES stash_versions(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        language TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_stash_versions_stash_id ON stash_versions(stash_id);
      CREATE INDEX IF NOT EXISTS idx_stash_versions_version ON stash_versions(stash_id, version);
      CREATE INDEX IF NOT EXISTS idx_stash_version_files_version_id ON stash_version_files(version_id);
    `);

    this.migrate();
  }

  private migrate() {
    // Ensure schema_migrations table exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Load already-applied versions
    const applied = new Set(
      (this.db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[])
        .map(r => r.version)
    );

    // Run pending migrations in a transaction
    const pending = MIGRATIONS.filter(m => !applied.has(m.version))
      .sort((a, b) => a.version - b.version);

    if (pending.length === 0) return;

    const runMigrations = this.db.transaction(() => {
      for (const migration of pending) {
        console.log(`[DB] Running migration ${migration.version}: ${migration.name}`);
        migration.up(this.db);
        this.db.prepare(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
        ).run(migration.version, migration.name, new Date().toISOString());
      }
    });

    runMigrations();
    console.log(`[DB] ${pending.length} migration(s) applied successfully`);
  }

  private rowToStash(row: Record<string, unknown>): Omit<Stash, 'files'> {
    return {
      id: row.id as string,
      name: (row.name as string) || '',
      description: row.description as string,
      tags: JSON.parse(row.tags as string),
      metadata: JSON.parse(row.metadata as string),
      version: (row.version as number) || 1,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }

  private rowToListItem(row: Record<string, unknown>): Omit<StashListItem, 'files' | 'total_size'> {
    return {
      id: row.id as string,
      name: (row.name as string) || '',
      description: row.description as string,
      tags: JSON.parse(row.tags as string),
      version: (row.version as number) || 1,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }

  logAccess(stashId: string, source: 'api' | 'mcp' | 'ui', action: string, ip?: string, userAgent?: string): void {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO access_log (id, stash_id, source, action, timestamp, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, stashId, source, action, now, ip || null, userAgent || null);
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

    const insertVersion = this.db.prepare(`
      INSERT INTO stash_versions (id, stash_id, name, description, tags, metadata, version, created_by, created_at, change_summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertVersionFile = this.db.prepare(`
      INSERT INTO stash_version_files (id, version_id, filename, content, language, sort_order)
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

      // Store initial version (v1) so it can be compared with future updates
      const versionId = uuidv4();
      insertVersion.run(versionId, id, name, description, tagsJson, metadataJson, 1, 'system', now, '{}');
      for (const file of files) {
        insertVersionFile.run(uuidv4(), versionId, file.filename, file.content, file.language, file.sort_order);
      }

      return files;
    });

    const files = transaction();

    // Update stash relations and FTS index for new stash
    this.updateStashRelations(id, input.tags || []);
    this.syncFtsIndex(id);

    return {
      id,
      name: input.name || '',
      description: input.description || '',
      tags: input.tags || [],
      metadata: input.metadata || {},
      version: 1,
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
    const row = this.db.prepare('SELECT * FROM stashes WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;

    const files = this.db
      .prepare('SELECT * FROM stash_files WHERE stash_id = ? ORDER BY sort_order')
      .all(id) as StashFile[];

    return { ...this.rowToStash(row), files };
  }

  getStashMeta(id: string): StashMeta | null {
    const row = this.db.prepare('SELECT * FROM stashes WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;

    const files = this.db
      .prepare('SELECT filename, language, LENGTH(content) as size FROM stash_files WHERE stash_id = ? ORDER BY sort_order')
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
    const { search, tag, page = 1, limit = 50 } = options;
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

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const countRow = this.db
      .prepare(`SELECT COUNT(*) as count FROM stashes g ${where}`)
      .get(...params) as { count: number };

    const rows = this.db
      .prepare(`SELECT g.* FROM stashes g ${where} ORDER BY g.updated_at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as Record<string, unknown>[];

    const stashes: StashListItem[] = rows.map((row) => {
      const item = this.rowToListItem(row);
      const files = this.db
        .prepare('SELECT filename, language, LENGTH(content) as size FROM stash_files WHERE stash_id = ? ORDER BY sort_order')
        .all(item.id) as StashFileInfo[];
      const total_size = files.reduce((sum, f) => sum + f.size, 0);
      return { ...item, total_size, files };
    });

    return { stashes, total: countRow.count };
  }

  // === FTS5 Full-Text Search ===

  private syncFtsIndex(stashId: string): void {
    this.db.prepare('DELETE FROM stashes_fts WHERE stash_id = ?').run(stashId);

    const stash = this.db.prepare('SELECT name, description, tags FROM stashes WHERE id = ?').get(stashId) as {
      name: string; description: string; tags: string;
    } | undefined;
    if (!stash) return;

    const files = this.db.prepare('SELECT filename, content FROM stash_files WHERE stash_id = ? ORDER BY sort_order').all(stashId) as {
      filename: string; content: string;
    }[];

    const filenames = files.map(f => f.filename).join(' ');
    const fileContent = files.map(f => f.content).join('\n');
    const tags = (JSON.parse(stash.tags) as string[]).join(' ');

    this.db.prepare(`
      INSERT INTO stashes_fts (stash_id, name, description, tags, filenames, file_content)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(stashId, stash.name, stash.description, tags, filenames, fileContent);
  }

  private removeFtsIndex(stashId: string): void {
    this.db.prepare('DELETE FROM stashes_fts WHERE stash_id = ?').run(stashId);
  }

  rebuildFtsIndex(): void {
    this.db.prepare('DELETE FROM stashes_fts').run();

    const stashes = this.db.prepare('SELECT id, name, description, tags FROM stashes').all() as {
      id: string; name: string; description: string; tags: string;
    }[];

    const insertFts = this.db.prepare(`
      INSERT INTO stashes_fts (stash_id, name, description, tags, filenames, file_content)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const s of stashes) {
      const files = this.db.prepare('SELECT filename, content FROM stash_files WHERE stash_id = ? ORDER BY sort_order').all(s.id) as {
        filename: string; content: string;
      }[];
      const filenames = files.map(f => f.filename).join(' ');
      const fileContent = files.map(f => f.content).join('\n');
      const tags = (JSON.parse(s.tags) as string[]).join(' ');
      insertFts.run(s.id, s.name, s.description, tags, filenames, fileContent);
    }
  }

  private buildFtsQuery(input: string): string {
    // Guard against excessively long queries
    const trimmed = input.trim();
    if (trimmed.length > 2000) return '';

    const tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || tokens.length > 50) return '';

    return tokens.map(t => {
      // Strip FTS5 special syntax characters (including +/- operators) to prevent query errors
      const cleaned = t.replace(/['"()*{}[\]:^~!@#$%&\\<>+\-,;./|]/g, '');
      if (!cleaned) return null;
      // Prefix matching: "pyth" matches "python"
      return cleaned + '*';
    }).filter(Boolean).join(' ');
  }

  searchStashes(query: string, options: { tag?: string; limit?: number; page?: number } = {}): SearchStashesResult {
    const { tag, limit = 20, page = 1 } = options;
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

      countRow = this.db.prepare(countSql).get(...countParams) as { count: number };

      let sql = `
        SELECT f.stash_id, f.rank,
          snippet(stashes_fts, 1, '**', '**', '…', 32) as name_snippet,
          snippet(stashes_fts, 2, '**', '**', '…', 64) as desc_snippet,
          snippet(stashes_fts, 3, '**', '**', '…', 32) as tags_snippet,
          snippet(stashes_fts, 4, '**', '**', '…', 32) as filenames_snippet,
          snippet(stashes_fts, 5, '**', '**', '…', 64) as content_snippet
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

      const offset = (page - 1) * limit;
      sql += ` ORDER BY f.rank LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      rows = this.db.prepare(sql).all(...params) as typeof rows;
    } catch {
      // FTS5 MATCH syntax error → fall back to LIKE-based search
      const fallback = this.listStashes({ search: query, tag, limit, page });
      return {
        stashes: fallback.stashes.map(s => ({ ...s, relevance: 0 })),
        total: fallback.total,
        query,
      };
    }

    // Build results with full stash list info (outside try/catch so real DB errors propagate)
    const stashes: SearchStashItem[] = rows.map(row => {
      const stashRow = this.db.prepare('SELECT * FROM stashes WHERE id = ?').get(row.stash_id) as Record<string, unknown>;
      const item = this.rowToListItem(stashRow);
      const files = this.db
        .prepare('SELECT filename, language, LENGTH(content) as size FROM stash_files WHERE stash_id = ? ORDER BY sort_order')
        .all(item.id) as StashFileInfo[];
      const total_size = files.reduce((sum, f) => sum + f.size, 0);

      // Only include snippets that contain highlighted matches
      const snippets: Record<string, string> = {};
      if (row.name_snippet && row.name_snippet.includes('**')) snippets.name = row.name_snippet;
      if (row.desc_snippet && row.desc_snippet.includes('**')) snippets.description = row.desc_snippet;
      if (row.tags_snippet && row.tags_snippet.includes('**')) snippets.tags = row.tags_snippet;
      if (row.filenames_snippet && row.filenames_snippet.includes('**')) snippets.filenames = row.filenames_snippet;
      if (row.content_snippet && row.content_snippet.includes('**')) snippets.file_content = row.content_snippet;

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

  updateStash(id: string, input: UpdateStashInput, createdBy = 'system'): Stash | null {
    const existing = this.getStash(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const newVersion = existing.version + 1;

    // Compute change summary
    const changeSummary: Record<string, unknown> = {};
    if (input.name !== undefined && input.name !== existing.name) changeSummary.name = true;
    if (input.description !== undefined && input.description !== existing.description) changeSummary.description = true;
    if (input.tags !== undefined) {
      const oldTags = new Set(existing.tags);
      const newTags = new Set(input.tags);
      const added = input.tags.filter(t => !oldTags.has(t));
      const removed = existing.tags.filter(t => !newTags.has(t));
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
      const existingVersionRecord = this.db.prepare(
        'SELECT id FROM stash_versions WHERE stash_id = ? AND version = ?'
      ).get(id, existing.version) as { id: string } | undefined;

      if (!existingVersionRecord) {
        const versionId = uuidv4();
        this.db.prepare(`
          INSERT INTO stash_versions (id, stash_id, name, description, tags, metadata, version, created_by, created_at, change_summary)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          versionId, id,
          existing.name, existing.description,
          JSON.stringify(existing.tags), JSON.stringify(existing.metadata),
          existing.version, createdBy, now,
          JSON.stringify(changeSummary)
        );
        const insertVersionFile = this.db.prepare(`
          INSERT INTO stash_version_files (id, version_id, filename, content, language, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const file of existing.files) {
          insertVersionFile.run(uuidv4(), versionId, file.filename, file.content, file.language, file.sort_order);
        }
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
    });

    transaction();

    // Update stash relations and FTS index
    const finalTags = input.tags !== undefined ? input.tags : existing.tags;
    this.updateStashRelations(id, finalTags);
    this.syncFtsIndex(id);

    return this.getStash(id);
  }

  deleteStash(id: string): boolean {
    const result = this.db.prepare('DELETE FROM stashes WHERE id = ?').run(id);
    if (result.changes > 0) {
      this.removeFtsIndex(id);
    }
    return result.changes > 0;
  }

  getAllTags(): { tag: string; count: number }[] {
    const rows = this.db.prepare('SELECT tags FROM stashes').all() as { tags: string }[];
    const tagMap = new Map<string, number>();
    for (const row of rows) {
      const tags: string[] = JSON.parse(row.tags);
      for (const tag of tags) {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      }
    }
    return Array.from(tagMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  getAllMetadataKeys(): string[] {
    const rows = this.db.prepare('SELECT metadata FROM stashes WHERE metadata != \'{}\'').all() as { metadata: string }[];
    const keySet = new Set<string>();
    for (const row of rows) {
      const meta = JSON.parse(row.metadata);
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
      const tags: string[] = JSON.parse(row.tags);
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
        return { nodes: [], edges: [], stash_count: rows.length, filter: { tag, depth: clampedDepth } };
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
          if (min_weight && edge.weight < min_weight) continue;
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
    let nodes = Array.from(tagCounts.entries())
      .map(([t, count]) => ({ tag: t, count }));

    if (includedTags) {
      nodes = nodes.filter(n => includedTags!.has(n.tag));
    }
    if (min_count) {
      nodes = nodes.filter(n => n.count >= min_count);
    }
    nodes.sort((a, b) => b.count - a.count);
    if (limit && limit > 0) {
      nodes = nodes.slice(0, limit);
    }

    // Filter edges to only include nodes in the result set
    const nodeSet = new Set(nodes.map(n => n.tag));
    let edges = allEdges.filter(e => nodeSet.has(e.source) && nodeSet.has(e.target));
    if (min_weight) {
      edges = edges.filter(e => e.weight >= min_weight);
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
    this.db.prepare(
      "DELETE FROM stash_relations WHERE (source_stash_id = ? OR target_stash_id = ?) AND relation_type = 'shared_tags'"
    ).run(stashId, stashId);

    if (tags.length === 0) return;

    const rows = this.db.prepare('SELECT id, tags FROM stashes WHERE id != ?').all(stashId) as { id: string; tags: string }[];
    const tagSet = new Set(tags);

    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO stash_relations (id, source_stash_id, target_stash_id, relation_type, weight, metadata)
      VALUES (?, ?, ?, 'shared_tags', ?, ?)
    `);

    for (const row of rows) {
      const otherTags: string[] = JSON.parse(row.tags);
      const shared = otherTags.filter(t => tagSet.has(t));
      if (shared.length > 0) {
        const [src, tgt] = [stashId, row.id].sort();
        insert.run(uuidv4(), src, tgt, shared.length, JSON.stringify({ shared_tags: shared }));
      }
    }
  }

  // === Stash Graph ===

  getStashGraph(options: StashGraphOptions = {}): StashGraphResult {
    const { mode = 'relations', since, until, tag, limit = 200, include_versions = false, min_shared_tags = 1 } = options;

    // Fetch stashes with optional filters
    let query = 'SELECT s.id, s.name, s.tags, s.created_at, s.updated_at, s.version, COUNT(sf.id) as file_count, COALESCE(SUM(LENGTH(sf.content)), 0) as total_size FROM stashes s LEFT JOIN stash_files sf ON sf.stash_id = s.id';
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
      id: string; name: string; tags: string; created_at: string; updated_at: string;
      version: number; file_count: number; total_size: number;
    }[];

    if (stashRows.length === 0) {
      return { nodes: [], edges: [], time_range: { min: '', max: '' }, total_stashes: 0 };
    }

    const stashIds = new Set(stashRows.map(r => r.id));
    const nodes: StashGraphNode[] = [];
    const edges: StashGraphEdge[] = [];

    // Time range
    const timestamps = stashRows.map(r => r.created_at).sort();
    const timeRange = { min: timestamps[0], max: timestamps[timestamps.length - 1] };

    // Add stash nodes
    const tagCounts = new Map<string, number>();
    const stashTagMap = new Map<string, string[]>();

    for (const row of stashRows) {
      const stashTags: string[] = JSON.parse(row.tags);
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
    const relations = this.db.prepare(`
      SELECT source_stash_id, target_stash_id, weight, metadata
      FROM stash_relations
      WHERE relation_type = 'shared_tags' AND weight >= ?
    `).all(min_shared_tags) as { source_stash_id: string; target_stash_id: string; weight: number; metadata: string }[];

    for (const rel of relations) {
      if (stashIds.has(rel.source_stash_id) && stashIds.has(rel.target_stash_id)) {
        const meta = JSON.parse(rel.metadata);
        edges.push({
          source: rel.source_stash_id,
          target: rel.target_stash_id,
          type: 'shared_tags',
          weight: rel.weight,
          metadata: { shared_tags: meta.shared_tags },
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
              metadata: { time_delta_hours: Math.round(delta / (60 * 60 * 1000) * 10) / 10 },
            });
          }
        }
      }
    }

    // Version nodes & edges
    if (include_versions) {
      for (const row of stashRows) {
        const versions = this.db.prepare(`
          SELECT id, version, created_by, created_at, change_summary
          FROM stash_versions WHERE stash_id = ? ORDER BY version ASC
        `).all(row.id) as { id: string; version: number; created_by: string; created_at: string; change_summary: string }[];

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
            change_summary: JSON.parse(v.change_summary || '{}'),
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

    const totalStashes = (this.db.prepare('SELECT COUNT(*) as c FROM stashes').get() as { c: number }).c;

    return { nodes, edges, time_range: timeRange, total_stashes: totalStashes };
  }

  getStats(): { totalStashes: number; totalFiles: number; topLanguages: { language: string; count: number }[] } {
    const totalStashes = (this.db.prepare('SELECT COUNT(*) as c FROM stashes').get() as { c: number }).c;
    const totalFiles = (this.db.prepare('SELECT COUNT(*) as c FROM stash_files').get() as { c: number }).c;

    const langRows = this.db
      .prepare("SELECT language, COUNT(*) as count FROM stash_files WHERE language != '' GROUP BY language ORDER BY count DESC LIMIT 10")
      .all() as { language: string; count: number }[];

    return { totalStashes, totalFiles, topLanguages: langRows };
  }

  // === Version History ===

  getStashVersions(stashId: string): StashVersionListItem[] {
    const rows = this.db.prepare(`
      SELECT sv.*, COUNT(svf.id) as file_count, COALESCE(SUM(LENGTH(svf.content)), 0) as total_size
      FROM stash_versions sv
      LEFT JOIN stash_version_files svf ON svf.version_id = sv.id
      WHERE sv.stash_id = ?
      GROUP BY sv.id
      ORDER BY sv.version DESC
    `).all(stashId) as (Record<string, unknown>)[];

    const versions = rows.map(row => ({
      id: row.id as string,
      stash_id: row.stash_id as string,
      name: (row.name as string) || '',
      description: (row.description as string) || '',
      version: row.version as number,
      created_by: (row.created_by as string) || '',
      created_at: row.created_at as string,
      file_count: row.file_count as number,
      total_size: row.total_size as number,
    }));

    // Include the current (live) version at the top if it's newer than the latest stored version
    const stashRow = this.db.prepare(
      'SELECT id, name, description, version, updated_at FROM stashes WHERE id = ?'
    ).get(stashId) as { id: string; name: string; description: string; version: number; updated_at: string } | undefined;

    if (stashRow) {
      const latestStoredVersion = versions.length > 0 ? versions[0].version : 0;
      if (stashRow.version > latestStoredVersion) {
        const fileStats = this.db.prepare(
          'SELECT COUNT(*) as file_count, COALESCE(SUM(LENGTH(content)), 0) as total_size FROM stash_files WHERE stash_id = ?'
        ).get(stashId) as { file_count: number; total_size: number };

        versions.unshift({
          id: `current-${stashId}`,
          stash_id: stashId,
          name: stashRow.name || '',
          description: stashRow.description || '',
          version: stashRow.version,
          created_by: 'current',
          created_at: stashRow.updated_at,
          file_count: fileStats.file_count,
          total_size: fileStats.total_size,
        });
      }
    }

    return versions;
  }

  getStashVersion(stashId: string, version: number): StashVersion | null {
    const row = this.db.prepare(
      'SELECT * FROM stash_versions WHERE stash_id = ? AND version = ?'
    ).get(stashId, version) as Record<string, unknown> | undefined;

    if (row) {
      const files = this.db.prepare(
        'SELECT filename, content, language, sort_order FROM stash_version_files WHERE version_id = ? ORDER BY sort_order'
      ).all(row.id as string) as StashVersionFile[];

      return {
        id: row.id as string,
        stash_id: row.stash_id as string,
        name: (row.name as string) || '',
        description: (row.description as string) || '',
        tags: JSON.parse(row.tags as string),
        metadata: JSON.parse(row.metadata as string),
        version: row.version as number,
        created_by: (row.created_by as string) || '',
        created_at: row.created_at as string,
        files,
      };
    }

    // If not in version history, check if it matches the current live version
    const stash = this.getStash(stashId);
    if (stash && stash.version === version) {
      return {
        id: `current-${stashId}`,
        stash_id: stashId,
        name: stash.name,
        description: stash.description,
        tags: stash.tags,
        metadata: stash.metadata,
        version: stash.version,
        created_by: 'current',
        created_at: stash.updated_at,
        files: stash.files.map(f => ({
          filename: f.filename,
          content: f.content,
          language: f.language,
          sort_order: f.sort_order,
        })),
      };
    }

    return null;
  }

  restoreStashVersion(stashId: string, version: number, createdBy = 'system'): Stash | null {
    const versionData = this.getStashVersion(stashId, version);
    if (!versionData) return null;

    return this.updateStash(stashId, {
      name: versionData.name,
      description: versionData.description,
      tags: versionData.tags,
      metadata: versionData.metadata,
      files: versionData.files.map(f => ({
        filename: f.filename,
        content: f.content,
        language: f.language,
      })),
    }, createdBy);
  }

  // === API Token Management ===

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  createApiToken(label: string, scopes: TokenScope[]): { id: string; token: string; label: string; scopes: TokenScope[] } {
    const id = uuidv4();
    const now = new Date().toISOString();
    const rawToken = `cs_${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = this.hashToken(rawToken);
    const tokenPrefix = rawToken.substring(0, 7);

    this.db.prepare(`
      INSERT INTO api_tokens (id, label, token_hash, token_prefix, scopes, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, label || '', tokenHash, tokenPrefix, JSON.stringify(scopes), now);

    return { id, token: rawToken, label: label || '', scopes };
  }

  listApiTokens(): ApiTokenListItem[] {
    const rows = this.db.prepare('SELECT * FROM api_tokens ORDER BY created_at DESC').all() as {
      id: string; label: string; token_prefix: string; scopes: string; created_at: string;
    }[];
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      tokenPrefix: row.token_prefix,
      scopes: JSON.parse(row.scopes),
      createdAt: row.created_at,
    }));
  }

  deleteApiToken(id: string): boolean {
    const result = this.db.prepare('DELETE FROM api_tokens WHERE id = ?').run(id);
    return result.changes > 0;
  }

  validateApiToken(token: string): { valid: boolean; scopes: TokenScope[]; tokenId?: string } {
    const tokenHash = this.hashToken(token);
    const row = this.db.prepare('SELECT id, scopes FROM api_tokens WHERE token_hash = ?').get(tokenHash) as { id: string; scopes: string } | undefined;
    if (!row) return { valid: false, scopes: [] };
    return { valid: true, scopes: JSON.parse(row.scopes), tokenId: row.id };
  }

  hasAnyTokens(): boolean {
    const row = this.db.prepare('SELECT COUNT(*) as c FROM api_tokens').get() as { c: number };
    return row.c > 0;
  }

  // === Admin Session Management ===

  createAdminSession(hours: number): { token: string; expiresAt: string | null } {
    const id = uuidv4();
    const now = new Date();
    const rawToken = `csa_${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = this.hashToken(rawToken);
    let expiresAt: string | null = null;
    if (hours > 0) {
      expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
    }

    this.db.prepare(`
      INSERT INTO admin_sessions (id, token_hash, created_at, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(id, tokenHash, now.toISOString(), expiresAt);

    return { token: rawToken, expiresAt };
  }

  validateAdminSession(token: string): { valid: boolean; expiresAt?: string | null } {
    const tokenHash = this.hashToken(token);
    const row = this.db.prepare('SELECT expires_at FROM admin_sessions WHERE token_hash = ?').get(tokenHash) as { expires_at: string | null } | undefined;
    if (!row) return { valid: false };
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      // Expired - clean up
      this.db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(tokenHash);
      return { valid: false };
    }
    return { valid: true, expiresAt: row.expires_at };
  }

  deleteAdminSession(token: string): boolean {
    const tokenHash = this.hashToken(token);
    const result = this.db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(tokenHash);
    return result.changes > 0;
  }

  cleanExpiredSessions(): number {
    const now = new Date().toISOString();
    const result = this.db.prepare("DELETE FROM admin_sessions WHERE expires_at IS NOT NULL AND expires_at < ?").run(now);
    return result.changes;
  }

  // === Data Export/Import ===

  exportAllData(): {
    stashes: Record<string, unknown>[];
    stash_files: Record<string, unknown>[];
    stash_versions: Record<string, unknown>[];
    stash_version_files: Record<string, unknown>[];
  } {
    const stashes = this.db.prepare('SELECT * FROM stashes').all() as Record<string, unknown>[];
    const stash_files = this.db.prepare('SELECT * FROM stash_files').all() as Record<string, unknown>[];
    const stash_versions = this.db.prepare('SELECT * FROM stash_versions').all() as Record<string, unknown>[];
    const stash_version_files = this.db.prepare('SELECT * FROM stash_version_files').all() as Record<string, unknown>[];
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
      try { this.db.exec('DELETE FROM stash_relations'); } catch (_) { /* table may not exist */ }
      try { this.db.exec('DELETE FROM stashes_fts'); } catch (_) { /* table may not exist */ }

      let stashCount = 0;
      let fileCount = 0;
      let versionCount = 0;
      let versionFileCount = 0;

      // Insert stashes
      for (const s of data.stashes) {
        this.db.prepare(`
          INSERT INTO stashes (id, name, description, tags, metadata, version, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(s.id, s.name, s.description, s.tags, s.metadata, s.version ?? 1, s.created_at, s.updated_at);
        stashCount++;
      }

      // Insert stash files
      for (const f of data.stash_files) {
        this.db.prepare(`
          INSERT INTO stash_files (id, stash_id, filename, content, language, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(f.id, f.stash_id, f.filename, f.content, f.language, f.sort_order);
        fileCount++;
      }

      // Insert stash versions
      if (data.stash_versions) {
        for (const v of data.stash_versions) {
          this.db.prepare(`
            INSERT INTO stash_versions (id, stash_id, name, description, tags, metadata, version, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(v.id, v.stash_id, v.name, v.description, v.tags, v.metadata, v.version, v.created_by, v.created_at);
          versionCount++;
        }
      }

      // Insert stash version files
      if (data.stash_version_files) {
        for (const vf of data.stash_version_files) {
          this.db.prepare(`
            INSERT INTO stash_version_files (id, version_id, filename, content, language, sort_order)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(vf.id, vf.version_id, vf.filename, vf.content, vf.language, vf.sort_order);
          versionFileCount++;
        }
      }

      return { stashes: stashCount, files: fileCount, versions: versionCount, versionFiles: versionFileCount };
    });

    const result = tx();
    this.rebuildFtsIndex();
    return result;
  }

  close() {
    this.db.close();
  }
}

function detectLanguage(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.kt': 'kotlin',
    '.cs': 'csharp',
    '.cpp': 'cpp',
    '.c': 'c',
    '.h': 'c',
    '.hpp': 'cpp',
    '.php': 'php',
    '.swift': 'swift',
    '.sh': 'bash',
    '.bash': 'bash',
    '.zsh': 'bash',
    '.fish': 'bash',
    '.ps1': 'powershell',
    '.sql': 'sql',
    '.html': 'html',
    '.htm': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.sass': 'sass',
    '.less': 'less',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.xml': 'xml',
    '.md': 'markdown',
    '.markdown': 'markdown',
    '.txt': 'text',
    '.toml': 'toml',
    '.ini': 'ini',
    '.cfg': 'ini',
    '.conf': 'ini',
    '.env': 'bash',
    '.dockerfile': 'docker',
    '.lua': 'lua',
    '.r': 'r',
    '.dart': 'dart',
    '.scala': 'scala',
    '.zig': 'zig',
    '.v': 'v',
    '.nim': 'nim',
    '.ex': 'elixir',
    '.exs': 'elixir',
    '.erl': 'erlang',
    '.hs': 'haskell',
    '.ml': 'ocaml',
    '.clj': 'clojure',
    '.lisp': 'lisp',
    '.vue': 'markup',
    '.svelte': 'markup',
  };
  return map[ext] || '';
}

export default ClawStashDB;
