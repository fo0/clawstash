import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type {
  Stash,
  StashVersion,
  StashVersionFile,
  StashVersionListItem,
  UpdateStashInput,
} from '../db-types';

// Defensive parsers — duplicated from ClawStashDB (intentionally, to keep
// this module self-contained). Both surfaces enforce the same contract:
// corrupted JSON in tags / metadata columns must NOT throw out of the
// version-history endpoint; it falls back to an empty value instead.
function safeParseTags(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

function safeParseMetadata(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Stash version history and restore (refs #144).
 *
 * Extracted from ClawStashDB as the second of two store splits. The
 * behaviour is bit-for-bit identical to the prior inlined implementation
 * — characterization tests in src/server/__tests__/db-versions.test.ts
 * pin the contract.
 *
 * `restoreStashVersion` needs to call `updateStash` (which still lives on
 * ClawStashDB because it touches stashes / stash_files / FTS sync). The
 * store therefore accepts an `update` callback in its constructor; the
 * caller wires it to ClawStashDB.updateStash.bind(db).
 */
export type StashUpdater = (
  stashId: string,
  input: UpdateStashInput,
  createdBy?: string,
) => Stash | null;

export class VersionStore {
  constructor(
    private readonly db: Database.Database,
    private readonly update: StashUpdater,
  ) {}

  getStashVersions(stashId: string): StashVersionListItem[] {
    const rows = this.db
      .prepare(
        `
      SELECT sv.*, COUNT(svf.id) as file_count, COALESCE(SUM(LENGTH(svf.content)), 0) as total_size
      FROM stash_versions sv
      LEFT JOIN stash_version_files svf ON svf.version_id = sv.id
      WHERE sv.stash_id = ?
      GROUP BY sv.id
      ORDER BY sv.version DESC
    `,
      )
      .all(stashId) as Record<string, unknown>[];

    const versions = rows.map((row) => ({
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
    const stashRow = this.db
      .prepare('SELECT id, name, description, version, updated_at FROM stashes WHERE id = ?')
      .get(stashId) as
      | { id: string; name: string; description: string; version: number; updated_at: string }
      | undefined;

    if (stashRow) {
      const latestStoredVersion = versions.length > 0 ? versions[0].version : 0;
      if (stashRow.version > latestStoredVersion) {
        const fileStats = this.db
          .prepare(
            'SELECT COUNT(*) as file_count, COALESCE(SUM(LENGTH(content)), 0) as total_size FROM stash_files WHERE stash_id = ?',
          )
          .get(stashId) as { file_count: number; total_size: number };

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

  getStashVersion(
    stashId: string,
    version: number,
    getStash: (id: string) => Stash | null,
  ): StashVersion | null {
    const row = this.db
      .prepare('SELECT * FROM stash_versions WHERE stash_id = ? AND version = ?')
      .get(stashId, version) as Record<string, unknown> | undefined;

    if (row) {
      const files = this.db
        .prepare(
          'SELECT filename, content, language, sort_order FROM stash_version_files WHERE version_id = ? ORDER BY sort_order',
        )
        .all(row.id as string) as StashVersionFile[];

      return {
        id: row.id as string,
        stash_id: row.stash_id as string,
        name: (row.name as string) || '',
        description: (row.description as string) || '',
        tags: safeParseTags(row.tags),
        metadata: safeParseMetadata(row.metadata),
        version: row.version as number,
        created_by: (row.created_by as string) || '',
        created_at: row.created_at as string,
        files,
      };
    }

    // If not in version history, check if it matches the current live version.
    // Delegated to a getStash callback so this module does not need to
    // duplicate the stash-row → Stash mapping. The caller wires it to
    // ClawStashDB.getStash.bind(db).
    const stash = getStash(stashId);
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
        files: stash.files.map((f) => ({
          filename: f.filename,
          content: f.content,
          language: f.language,
          sort_order: f.sort_order,
        })),
      };
    }

    return null;
  }

  /**
   * Helper used internally by ClawStashDB.createStash + .updateStash to
   * snapshot a version row + its files inside the caller's transaction.
   * Kept on the store so the SQL lives next to the read paths.
   *
   * The caller is responsible for being inside a db.transaction() — this
   * method does NOT open its own.
   */
  insertVersionSnapshot(args: {
    stashId: string;
    name: string;
    description: string;
    tagsJson: string;
    metadataJson: string;
    version: number;
    createdBy: string;
    createdAt: string;
    changeSummaryJson: string;
    files: { filename: string; content: string; language: string; sort_order: number }[];
  }): string {
    const versionId = uuidv4();
    this.db
      .prepare(
        `
      INSERT INTO stash_versions (id, stash_id, name, description, tags, metadata, version, created_by, created_at, change_summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        versionId,
        args.stashId,
        args.name,
        args.description,
        args.tagsJson,
        args.metadataJson,
        args.version,
        args.createdBy,
        args.createdAt,
        args.changeSummaryJson,
      );

    const insertVersionFile = this.db.prepare(`
      INSERT INTO stash_version_files (id, version_id, filename, content, language, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const file of args.files) {
      insertVersionFile.run(
        uuidv4(),
        versionId,
        file.filename,
        file.content,
        file.language,
        file.sort_order,
      );
    }
    return versionId;
  }

  restoreStashVersion(
    stashId: string,
    version: number,
    getStash: (id: string) => Stash | null,
    createdBy = 'system',
  ): Stash | null {
    // Wrap fetch + write in a single transaction so a concurrent updateStash
    // between the version snapshot read and the restore write cannot silently
    // win (which would leave the user with neither the requested version nor
    // their previous content).
    return this.db.transaction(() => {
      const versionData = this.getStashVersion(stashId, version, getStash);
      if (!versionData) return null;
      return this.update(
        stashId,
        {
          name: versionData.name,
          description: versionData.description,
          tags: versionData.tags,
          metadata: versionData.metadata,
          files: versionData.files.map((f) => ({
            filename: f.filename,
            content: f.content,
            language: f.language,
          })),
        },
        createdBy,
      );
    })();
  }
}
