// Initial table creation for ClawStashDB. Extracted from db.ts (Round 1/3 —
// refs #129) so the schema is independently diff-reviewable and so it
// cannot drift away from the migrations module silently.
//
// This is a pure SQL constant — no runtime behaviour, no imports. Loaded
// once at startup by ClawStashDB.init() before applyPendingMigrations()
// runs the per-version migrations from db-migrations.ts.

export const INITIAL_SCHEMA_SQL = `
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
`;
