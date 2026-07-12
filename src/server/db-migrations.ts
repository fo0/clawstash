import type Database from 'better-sqlite3';
import crypto from 'crypto';

// Versioned schema migrations for ClawStashDB. Extracted from db.ts
// (Round 1/3 — refs #129) so each migration is independently
// diff-reviewable and so the runner is reusable.
//
// Each migration is applied at most once; the schema_migrations table
// tracks which versions have already run. Ordering is enforced by
// `version` (ascending). All pending migrations apply inside a single
// transaction so a partial failure cannot leave the schema half-migrated.

export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'add_stashes_version_column',
    up: (db) => {
      const columns = db.prepare('PRAGMA table_info(stashes)').all() as { name: string }[];
      if (!columns.some((c) => c.name === 'version')) {
        db.exec('ALTER TABLE stashes ADD COLUMN version INTEGER NOT NULL DEFAULT 1');
      }
    },
  },
  {
    version: 2,
    name: 'add_stash_change_summary',
    up: (db) => {
      const columns = db.prepare('PRAGMA table_info(stash_versions)').all() as { name: string }[];
      if (!columns.some((c) => c.name === 'change_summary')) {
        db.exec("ALTER TABLE stash_versions ADD COLUMN change_summary TEXT NOT NULL DEFAULT '{}'");
      }
    },
  },
  {
    version: 3,
    name: 'add_stash_graph_indexes',
    up: (db) => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_stashes_tags ON stashes(tags);
        CREATE INDEX IF NOT EXISTS idx_stash_versions_created_at ON stash_versions(created_at);
      `);
    },
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
    },
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
    },
  },
  {
    version: 6,
    name: 'backfill_stash_relations',
    up: (db) => {
      const stashes = db.prepare('SELECT id, tags FROM stashes').all() as {
        id: string;
        tags: string;
      }[];
      const parsed: { id: string; tags: string[] }[] = [];
      for (const s of stashes) {
        try {
          parsed.push({ id: s.id, tags: JSON.parse(s.tags) as string[] });
        } catch {
          /* skip stashes with corrupted tags JSON */
        }
      }

      const insert = db.prepare(`
        INSERT OR IGNORE INTO stash_relations (id, source_stash_id, target_stash_id, relation_type, weight, metadata)
        VALUES (?, ?, ?, 'shared_tags', ?, ?)
      `);

      for (let i = 0; i < parsed.length; i++) {
        for (let j = i + 1; j < parsed.length; j++) {
          const shared = parsed[i].tags.filter((t) => parsed[j].tags.includes(t));
          if (shared.length > 0) {
            const [src, tgt] = [parsed[i].id, parsed[j].id].sort();
            insert.run(
              crypto.randomUUID(),
              src,
              tgt,
              shared.length,
              JSON.stringify({ shared_tags: shared }),
            );
          }
        }
      }
    },
  },
  {
    version: 7,
    name: 'backfill_initial_version_records',
    up: (db) => {
      // Find stashes that have NO version records at all (never updated, or created before versioning)
      const stashes = db
        .prepare(
          `
        SELECT s.id, s.name, s.description, s.tags, s.metadata, s.created_at
        FROM stashes s
        WHERE NOT EXISTS (
          SELECT 1 FROM stash_versions sv WHERE sv.stash_id = s.id
        )
      `,
        )
        .all() as {
        id: string;
        name: string;
        description: string;
        tags: string;
        metadata: string;
        created_at: string;
      }[];

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
        const versionId = crypto.randomUUID();
        insertVersion.run(versionId, s.id, s.name, s.description, s.tags, s.metadata, s.created_at);

        const files = db
          .prepare(
            'SELECT filename, content, language, sort_order FROM stash_files WHERE stash_id = ? ORDER BY sort_order',
          )
          .all(s.id) as {
          filename: string;
          content: string;
          language: string;
          sort_order: number;
        }[];
        for (const f of files) {
          insertVersionFile.run(
            crypto.randomUUID(),
            versionId,
            f.filename,
            f.content,
            f.language,
            f.sort_order,
          );
        }
      }

      console.log(`[DB] Backfilled initial version records for ${stashes.length} stash(es)`);
    },
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
        id: string;
        name: string;
        description: string;
        tags: string;
      }[];

      const insertFts = db.prepare(`
        INSERT INTO stashes_fts (stash_id, name, description, tags, filenames, file_content)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const s of stashes) {
        const files = db
          .prepare(
            'SELECT filename, content FROM stash_files WHERE stash_id = ? ORDER BY sort_order',
          )
          .all(s.id) as {
          filename: string;
          content: string;
        }[];
        const filenames = files.map((f) => f.filename).join(' ');
        const fileContent = files.map((f) => f.content).join('\n');
        // Defensive parse — a corrupt tags row should not abort the migration
        let tags = '';
        try {
          const parsed = JSON.parse(s.tags);
          if (Array.isArray(parsed))
            tags = parsed.filter((t: unknown) => typeof t === 'string').join(' ');
        } catch {
          /* leave tags empty */
        }
        insertFts.run(s.id, s.name, s.description, tags, filenames, fileContent);
      }

      console.log(`[DB] FTS5 search index created and backfilled for ${stashes.length} stash(es)`);
    },
  },
  {
    version: 9,
    name: 'add_stashes_archived_column',
    up: (db) => {
      const columns = db.prepare('PRAGMA table_info(stashes)').all() as { name: string }[];
      if (!columns.some((c) => c.name === 'archived')) {
        db.exec('ALTER TABLE stashes ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
        db.exec('CREATE INDEX IF NOT EXISTS idx_stashes_archived ON stashes(archived)');
      }
    },
  },
  {
    version: 10,
    name: 'add_github_backup_tables',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS backup_state (
          stash_id TEXT PRIMARY KEY,
          stash_name TEXT NOT NULL DEFAULT '',
          content_hash TEXT NOT NULL DEFAULT '',
          state TEXT NOT NULL DEFAULT 'idle' CHECK(state IN ('idle', 'pending', 'syncing', 'error')),
          pending_delete INTEGER NOT NULL DEFAULT 0,
          last_synced_at TEXT,
          last_commit_sha TEXT,
          error TEXT,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS backup_log (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          stash_id TEXT,
          stash_name TEXT,
          trigger_type TEXT NOT NULL CHECK(trigger_type IN ('scheduled', 'mutation', 'manual')),
          status TEXT NOT NULL CHECK(status IN ('success', 'error', 'skipped')),
          action TEXT,
          message TEXT NOT NULL DEFAULT '',
          commit_sha TEXT,
          started_at TEXT NOT NULL,
          finished_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_backup_log_stash_id ON backup_log(stash_id);
        CREATE INDEX IF NOT EXISTS idx_backup_log_started_at ON backup_log(started_at);
      `);
      // backup_state has NO foreign key to stashes on purpose: rows for
      // deleted stashes must survive until the deletion has been mirrored
      // to the backup repository (pending_delete = 1).
      const columns = db.prepare('PRAGMA table_info(stashes)').all() as { name: string }[];
      if (!columns.some((c) => c.name === 'backup_enabled')) {
        db.exec('ALTER TABLE stashes ADD COLUMN backup_enabled INTEGER NOT NULL DEFAULT 1');
      }
    },
  },
  {
    version: 11,
    name: 'add_deletion_audit_table',
    up: (db) => {
      // deletion_audit has NO foreign key to stashes on purpose: access_log
      // carries `ON DELETE CASCADE`, so a stash deletion erases its own access
      // trail. This table records the deletion itself and must survive the
      // stash row it refers to. Closes BACKLOG #42.
      db.exec(`
        CREATE TABLE IF NOT EXISTS deletion_audit (
          id TEXT PRIMARY KEY,
          stash_id TEXT NOT NULL,
          stash_name TEXT NOT NULL DEFAULT '',
          source TEXT NOT NULL CHECK(source IN ('api', 'mcp', 'ui')),
          timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          ip TEXT,
          user_agent TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_deletion_audit_timestamp ON deletion_audit(timestamp);
        CREATE INDEX IF NOT EXISTS idx_deletion_audit_stash_id ON deletion_audit(stash_id);
      `);
    },
  },
];

/**
 * Apply all not-yet-applied migrations in a single transaction. Returns the
 * number of migrations actually run. Idempotent: calling it on an already
 * up-to-date database is a no-op (returns 0).
 */
export function applyPendingMigrations(db: Database.Database): number {
  // Ensure schema_migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Load already-applied versions
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(
      (r) => r.version,
    ),
  );

  // Run pending migrations in a transaction
  const pending = MIGRATIONS.filter((m) => !applied.has(m.version)).sort(
    (a, b) => a.version - b.version,
  );

  if (pending.length === 0) return 0;

  const runMigrations = db.transaction(() => {
    for (const migration of pending) {
      console.log(`[DB] Running migration ${migration.version}: ${migration.name}`);
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      );
    }
  });

  runMigrations();
  console.log(`[DB] ${pending.length} migration(s) applied successfully`);
  return pending.length;
}
