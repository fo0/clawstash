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
  created_at: string;
  updated_at: string;
  files: StashFile[];
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
    `);
  }

  private rowToStash(row: Record<string, unknown>): Omit<Stash, 'files'> {
    return {
      id: row.id as string,
      name: (row.name as string) || '',
      description: row.description as string,
      tags: JSON.parse(row.tags as string),
      metadata: JSON.parse(row.metadata as string),
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
      INSERT INTO stashes (id, name, description, tags, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertFile = this.db.prepare(`
      INSERT INTO stash_files (id, stash_id, filename, content, language, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      insertStash.run(
        id,
        input.name || '',
        input.description || '',
        JSON.stringify(input.tags || []),
        JSON.stringify(input.metadata || {}),
        now,
        now
      );

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

      return files;
    });

    const files = transaction();

    return {
      id,
      name: input.name || '',
      description: input.description || '',
      tags: input.tags || [],
      metadata: input.metadata || {},
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

  updateStash(id: string, input: UpdateStashInput): Stash | null {
    const existing = this.getStash(id);
    if (!existing) return null;

    const now = new Date().toISOString();

    const transaction = this.db.transaction(() => {
      const updates: string[] = ['updated_at = ?'];
      const params: unknown[] = [now];

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
    return this.getStash(id);
  }

  deleteStash(id: string): boolean {
    const result = this.db.prepare('DELETE FROM stashes WHERE id = ?').run(id);
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

  getStats(): { totalStashes: number; totalFiles: number; topLanguages: { language: string; count: number }[] } {
    const totalStashes = (this.db.prepare('SELECT COUNT(*) as c FROM stashes').get() as { c: number }).c;
    const totalFiles = (this.db.prepare('SELECT COUNT(*) as c FROM stash_files').get() as { c: number }).c;

    const langRows = this.db
      .prepare("SELECT language, COUNT(*) as count FROM stash_files WHERE language != '' GROUP BY language ORDER BY count DESC LIMIT 10")
      .all() as { language: string; count: number }[];

    return { totalStashes, totalFiles, topLanguages: langRows };
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
