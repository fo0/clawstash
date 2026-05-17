import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ClawStashDB } from '../db';

/**
 * Characterization tests for stash CRUD + FTS sync (refs #144).
 *
 * Written as a safety net BEFORE the VersionStore / SearchStore split so
 * any regression in:
 *
 * - row insertion / deletion
 * - file storage (multi-file, sort_order)
 * - FTS index synchronization
 * - cascade behaviour
 *
 * shows up immediately after the refactor. The tests use an in-memory
 * SQLite path so they are deterministic and zero-cost (no fs writes).
 */
function makeDb(): ClawStashDB {
  // ClawStashDB resolves dbPath via better-sqlite3 directly when given
  // ':memory:'. `path.dirname(':memory:')` is '.', so the mkdir guard
  // is a no-op for the cwd.
  return new ClawStashDB(':memory:');
}

function ftsCount(db: ClawStashDB, stashId: string): number {
  const inner = (db as unknown as { db: Database.Database }).db;
  return (
    inner.prepare('SELECT COUNT(*) AS c FROM stashes_fts WHERE stash_id = ?').get(stashId) as {
      c: number;
    }
  ).c;
}

function ftsRow(
  db: ClawStashDB,
  stashId: string,
): { name: string; description: string; tags: string; filenames: string; file_content: string } {
  const inner = (db as unknown as { db: Database.Database }).db;
  return inner
    .prepare(
      'SELECT name, description, tags, filenames, file_content FROM stashes_fts WHERE stash_id = ?',
    )
    .get(stashId) as {
    name: string;
    description: string;
    tags: string;
    filenames: string;
    file_content: string;
  };
}

describe('ClawStashDB stash CRUD + FTS sync', () => {
  let db: ClawStashDB;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('createStash', () => {
    it('persists row with provided metadata', () => {
      const s = db.createStash({
        name: 'Hello',
        description: 'desc',
        tags: ['t1', 't2'],
        metadata: { foo: 'bar' },
        files: [{ filename: 'a.md', content: 'aaa' }],
      });
      const fetched = db.getStash(s.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.name).toBe('Hello');
      expect(fetched!.description).toBe('desc');
      expect(fetched!.tags).toEqual(['t1', 't2']);
      expect(fetched!.metadata).toEqual({ foo: 'bar' });
      expect(fetched!.version).toBe(1);
      expect(fetched!.files).toHaveLength(1);
      expect(fetched!.files[0].filename).toBe('a.md');
      expect(fetched!.files[0].content).toBe('aaa');
    });

    it('inserts one FTS row per stash containing name/description/tags/files', () => {
      const s = db.createStash({
        name: 'Searchable Title',
        description: 'rocket-science notes',
        tags: ['python', 'ml'],
        files: [
          { filename: 'main.py', content: 'def neural(): pass' },
          { filename: 'README.md', content: 'docs' },
        ],
      });
      expect(ftsCount(db, s.id)).toBe(1);
      const fts = ftsRow(db, s.id);
      expect(fts.name).toBe('Searchable Title');
      expect(fts.description).toBe('rocket-science notes');
      expect(fts.tags).toBe('python ml');
      expect(fts.filenames).toContain('main.py');
      expect(fts.filenames).toContain('README.md');
      expect(fts.file_content).toContain('def neural()');
      expect(fts.file_content).toContain('docs');
    });

    it('preserves file sort_order based on input array index', () => {
      const s = db.createStash({
        name: 'order-test',
        files: [
          { filename: 'b.txt', content: '2' },
          { filename: 'a.txt', content: '1' },
          { filename: 'c.txt', content: '3' },
        ],
      });
      const fetched = db.getStash(s.id)!;
      expect(fetched.files.map((f) => f.filename)).toEqual(['b.txt', 'a.txt', 'c.txt']);
      expect(fetched.files.map((f) => f.sort_order)).toEqual([0, 1, 2]);
    });

    it('records the initial version (v1) automatically', () => {
      const s = db.createStash({ name: 'v1', files: [{ filename: 'x.txt', content: 'x' }] });
      const versions = db.getStashVersions(s.id);
      // Either one stored v1 OR a "current-" pseudo-entry plus stored v1;
      // we require that at least one v1 record exists.
      const v1 = versions.find((v) => v.version === 1);
      expect(v1).toBeTruthy();
      expect(v1!.name).toBe('v1');
    });
  });

  describe('updateStash', () => {
    it('updates name + content and syncs FTS', () => {
      const s = db.createStash({
        name: 'old',
        files: [{ filename: 'f.txt', content: 'old-content' }],
      });
      const updated = db.updateStash(s.id, {
        name: 'new',
        files: [{ filename: 'f.txt', content: 'new-content' }],
      });
      expect(updated!.name).toBe('new');
      expect(updated!.version).toBe(2);
      expect(updated!.files[0].content).toBe('new-content');

      const fts = ftsRow(db, s.id);
      expect(fts.name).toBe('new');
      expect(fts.file_content).toContain('new-content');
      expect(fts.file_content).not.toContain('old-content');
    });

    it('returns null when stash does not exist', () => {
      expect(db.updateStash('does-not-exist', { name: 'x' })).toBeNull();
    });

    it('preserves unrelated fields on partial update', () => {
      const s = db.createStash({
        name: 'n',
        description: 'd',
        tags: ['k'],
        files: [{ filename: 'x.md', content: 'hi' }],
      });
      const updated = db.updateStash(s.id, { name: 'n2' });
      expect(updated!.name).toBe('n2');
      expect(updated!.description).toBe('d');
      expect(updated!.tags).toEqual(['k']);
      expect(updated!.files[0].content).toBe('hi');
    });

    it('snapshots previous state into stash_versions before applying', () => {
      const s = db.createStash({
        name: 'pre',
        files: [{ filename: 'f.txt', content: 'one' }],
      });
      db.updateStash(s.id, { name: 'post', files: [{ filename: 'f.txt', content: 'two' }] });
      const v1 = db.getStashVersion(s.id, 1);
      expect(v1).not.toBeNull();
      expect(v1!.name).toBe('pre');
      expect(v1!.files[0].content).toBe('one');
    });
  });

  describe('deleteStash', () => {
    it('removes the row and the FTS entry', () => {
      const s = db.createStash({
        name: 'doomed',
        files: [{ filename: 'x.txt', content: 'bye' }],
      });
      expect(ftsCount(db, s.id)).toBe(1);
      expect(db.deleteStash(s.id)).toBe(true);
      expect(db.getStash(s.id)).toBeNull();
      expect(ftsCount(db, s.id)).toBe(0);
    });

    it('returns false for unknown stash id', () => {
      expect(db.deleteStash('nope')).toBe(false);
    });

    it('cascades to stash_files (FK ON DELETE CASCADE)', () => {
      const s = db.createStash({
        name: 'parent',
        files: [
          { filename: 'a.txt', content: 'a' },
          { filename: 'b.txt', content: 'b' },
        ],
      });
      const inner = (db as unknown as { db: Database.Database }).db;
      const beforeFiles = (
        inner.prepare('SELECT COUNT(*) AS c FROM stash_files WHERE stash_id = ?').get(s.id) as {
          c: number;
        }
      ).c;
      expect(beforeFiles).toBe(2);
      db.deleteStash(s.id);
      const afterFiles = (
        inner.prepare('SELECT COUNT(*) AS c FROM stash_files WHERE stash_id = ?').get(s.id) as {
          c: number;
        }
      ).c;
      expect(afterFiles).toBe(0);
    });

    it('cascades to stash_versions and stash_version_files', () => {
      const s = db.createStash({
        name: 'parent',
        files: [{ filename: 'a.txt', content: 'a' }],
      });
      // Force an extra version
      db.updateStash(s.id, { name: 'parent2' });

      const inner = (db as unknown as { db: Database.Database }).db;
      const versionsBefore = (
        inner.prepare('SELECT COUNT(*) AS c FROM stash_versions WHERE stash_id = ?').get(s.id) as {
          c: number;
        }
      ).c;
      expect(versionsBefore).toBeGreaterThanOrEqual(1);

      db.deleteStash(s.id);
      const versionsAfter = (
        inner.prepare('SELECT COUNT(*) AS c FROM stash_versions WHERE stash_id = ?').get(s.id) as {
          c: number;
        }
      ).c;
      expect(versionsAfter).toBe(0);

      const versionFilesAfter = (
        inner
          .prepare(
            'SELECT COUNT(*) AS c FROM stash_version_files WHERE version_id IN (SELECT id FROM stash_versions WHERE stash_id = ?)',
          )
          .get(s.id) as { c: number }
      ).c;
      expect(versionFilesAfter).toBe(0);
    });
  });

  describe('stash files multi-file behaviour', () => {
    it('replaces full file list on update when files key is provided', () => {
      const s = db.createStash({
        name: 'multi',
        files: [
          { filename: 'a.txt', content: 'a' },
          { filename: 'b.txt', content: 'b' },
        ],
      });
      const updated = db.updateStash(s.id, {
        files: [{ filename: 'only.txt', content: 'only' }],
      });
      expect(updated!.files).toHaveLength(1);
      expect(updated!.files[0].filename).toBe('only.txt');
    });

    it('keeps file list when files key is absent on update', () => {
      const s = db.createStash({
        name: 'keep-files',
        files: [{ filename: 'a.txt', content: 'a' }],
      });
      const updated = db.updateStash(s.id, { name: 'still-here' });
      expect(updated!.files).toHaveLength(1);
      expect(updated!.files[0].content).toBe('a');
    });
  });
});
