import type Database from 'better-sqlite3';
import crypto from 'crypto';
import type {
  Stash,
  StashVersion,
  StashVersionFile,
  StashVersionListItem,
  UpdateStashInput,
} from '../db-types';
import { safeParseTags, safeParseMetadata } from './_parsers';

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

  /**
   * List a stash's versions, newest first.
   *
   * The optional `limit` / `offset` enable pagination for stashes with a very
   * large version history (BACKLOG #8). When neither is supplied the full list
   * is returned (backward compatible — SQLite reads `LIMIT -1` as "no limit").
   *
   * The synthetic "current" (live) row — prepended when the live stash is
   * newer than the latest stored snapshot — only belongs at the very top, so
   * it is added on the first page (offset 0) only. To keep paging consistent,
   * that synthetic row occupies one logical slot: on the first page it consumes
   * one slot of the requested `limit`, and on any later page the SQL `OFFSET`
   * is shifted back by one to account for it. `LIMIT`/`OFFSET` are pushed into
   * SQL so the `GROUP BY` aggregation stays bounded by the page size on later
   * pages instead of scanning the whole version history.
   */
  getStashVersions(
    stashId: string,
    options?: { limit?: number; offset?: number },
  ): StashVersionListItem[] {
    const offset = options?.offset !== undefined && options.offset > 0 ? options.offset : 0;
    const limit = options?.limit !== undefined && options.limit > 0 ? options.limit : undefined;

    // Determine whether a synthetic "current" row belongs at the top. It does
    // when the live stash is newer than the latest stored snapshot. Computed
    // up front so the SQL window can reserve its slot.
    const stashRow = this.db
      .prepare('SELECT id, name, description, version, updated_at FROM stashes WHERE id = ?')
      .get(stashId) as
      | { id: string; name: string; description: string; version: number; updated_at: string }
      | undefined;

    const latestStored = this.db
      .prepare('SELECT MAX(version) as v FROM stash_versions WHERE stash_id = ?')
      .get(stashId) as { v: number | null };

    const hasCurrentRow = !!stashRow && stashRow.version > (latestStored.v ?? 0);

    // The synthetic row sits in one logical slot at the very top. On the first
    // page (offset 0) it consumes one slot of the limit; on later pages the SQL
    // offset must be shifted back by one to keep the page boundaries aligned.
    const sqlOffset = hasCurrentRow && offset > 0 ? offset - 1 : offset;
    let sqlLimit = limit;
    if (hasCurrentRow && limit !== undefined && offset === 0) {
      sqlLimit = limit - 1;
    }

    const rows =
      sqlLimit === 0
        ? []
        : (this.db
            .prepare(
              `
      SELECT sv.*, COUNT(svf.id) as file_count, COALESCE(SUM(LENGTH(svf.content)), 0) as total_size
      FROM stash_versions sv
      LEFT JOIN stash_version_files svf ON svf.version_id = sv.id
      WHERE sv.stash_id = ?
      GROUP BY sv.id
      ORDER BY sv.version DESC
      LIMIT ? OFFSET ?
    `,
            )
            .all(stashId, sqlLimit ?? -1, sqlOffset) as Record<string, unknown>[]);

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

    // Prepend the live row on the first page only.
    if (hasCurrentRow && stashRow && offset === 0) {
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
    const versionId = crypto.randomUUID();
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
        crypto.randomUUID(),
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
