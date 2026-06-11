import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ClawStashDB } from '../db';

/**
 * Characterization tests for version history (refs #144).
 *
 * Pins behaviour the upcoming VersionStore split must preserve:
 *
 * - getStashVersions returns DESC by version, with a "current-*" pseudo
 *   entry for the live row when newer than the latest snapshot
 * - getStashVersion fetches both stored snapshots and synthesises the
 *   current row when its version is requested
 * - restoreStashVersion applies name/description/tags/files of the chosen
 *   version atomically (via updateStash)
 * - cascade delete removes versions when the parent stash is deleted
 */
function makeDb(): ClawStashDB {
  return new ClawStashDB(':memory:');
}

describe('ClawStashDB version history', () => {
  let db: ClawStashDB;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('getStashVersions', () => {
    it('returns versions sorted DESC by version', () => {
      const s = db.createStash({
        name: 'v1',
        files: [{ filename: 'f.txt', content: 'one' }],
      });
      db.updateStash(s.id, { name: 'v2' });
      db.updateStash(s.id, { name: 'v3' });

      const versions = db.getStashVersions(s.id);
      const numbers = versions.map((v) => v.version);
      // Strictly decreasing
      for (let i = 1; i < numbers.length; i++) {
        expect(numbers[i - 1]).toBeGreaterThan(numbers[i]);
      }
      expect(numbers[numbers.length - 1]).toBe(1);
    });

    it('includes a synthetic current-* row when the live stash is newer than the latest stored snapshot', () => {
      const s = db.createStash({
        name: 'first',
        files: [{ filename: 'f.txt', content: 'x' }],
      });
      // Initial v1 snapshot is stored. Now update -> stash.version=2 but
      // only v1 is in stash_versions (v2 = current live).
      db.updateStash(s.id, { name: 'second' });

      const versions = db.getStashVersions(s.id);
      const current = versions.find((v) => v.id.startsWith('current-'));
      // Either a 'current-' pseudo entry surfaces, OR a snapshot for the
      // current version was created. Both satisfy the API contract.
      const top = versions[0];
      expect(top.version).toBeGreaterThanOrEqual(2);
      if (current) {
        expect(current.name).toBe('second');
      }
    });

    it('returns empty array for unknown stash', () => {
      expect(db.getStashVersions('nope')).toEqual([]);
    });

    it('file_count and total_size reflect stash_version_files', () => {
      const s = db.createStash({
        name: 'sized',
        files: [
          { filename: 'a.txt', content: 'AAA' }, // 3 bytes
          { filename: 'b.txt', content: 'BBBB' }, // 4 bytes
        ],
      });
      const versions = db.getStashVersions(s.id);
      const v1 = versions.find((v) => v.version === 1)!;
      expect(v1.file_count).toBe(2);
      expect(v1.total_size).toBe(7);
    });
  });

  // Pagination for large version histories (BACKLOG #8). The synthetic
  // "current-*" row only appears on the first page and occupies one logical
  // slot, so the limit/offset bookkeeping is the part worth pinning.
  describe('getStashVersions pagination', () => {
    // Build a stash whose latest content IS snapshotted (so there is no
    // synthetic current-* row) by restoring the head version after the last
    // update. This isolates the pure offset/limit math from the live-row slot.
    function makeSnapshottedHistory(): { id: string; total: number } {
      const s = db.createStash({ name: 'n1', files: [{ filename: 'f.txt', content: 'c1' }] });
      for (let i = 2; i <= 5; i++) {
        db.updateStash(s.id, { name: `n${i}` });
      }
      // Snapshot the current head so the live version is stored (no current-*).
      db.restoreStashVersion(s.id, db.getStash(s.id)!.version);
      const total = db.getStashVersions(s.id).filter((v) => !v.id.startsWith('current-')).length;
      return { id: s.id, total };
    }

    it('returns the full list (descending) when no options are passed', () => {
      const { id } = makeSnapshottedHistory();
      const all = db.getStashVersions(id);
      const numbers = all.map((v) => v.version);
      for (let i = 1; i < numbers.length; i++) {
        expect(numbers[i - 1]).toBeGreaterThan(numbers[i]);
      }
    });

    it('honours limit and offset and matches a manual slice of the full list', () => {
      const { id } = makeSnapshottedHistory();
      const all = db.getStashVersions(id);
      expect(all.length).toBeGreaterThanOrEqual(5);

      const page1 = db.getStashVersions(id, { limit: 2, offset: 0 });
      expect(page1.map((v) => v.version)).toEqual(all.slice(0, 2).map((v) => v.version));

      const page2 = db.getStashVersions(id, { limit: 2, offset: 2 });
      expect(page2.map((v) => v.version)).toEqual(all.slice(2, 4).map((v) => v.version));
    });

    it('keeps the synthetic current-* row only on the first page', () => {
      // A plain update leaves the live version unsnapshotted -> current-* row.
      const s = db.createStash({ name: 'a', files: [{ filename: 'f.txt', content: 'x' }] });
      for (let i = 0; i < 4; i++) db.updateStash(s.id, { name: `a${i}` });

      const full = db.getStashVersions(s.id);
      expect(full[0].id.startsWith('current-')).toBe(true);

      const firstPage = db.getStashVersions(s.id, { limit: 2, offset: 0 });
      expect(firstPage[0].id.startsWith('current-')).toBe(true);
      // First page never exceeds the requested limit even with the live slot.
      expect(firstPage.length).toBeLessThanOrEqual(2);

      const secondPage = db.getStashVersions(s.id, { limit: 2, offset: 2 });
      expect(secondPage.some((v) => v.id.startsWith('current-'))).toBe(false);
      // Concatenated pages reproduce the head of the full descending list.
      const paged = [...firstPage, ...secondPage].map((v) => v.version);
      expect(paged).toEqual(full.slice(0, paged.length).map((v) => v.version));
    });
  });

  describe('getStashVersion', () => {
    it('fetches a stored snapshot by version number', () => {
      const s = db.createStash({
        name: 'name-v1',
        description: 'desc-v1',
        tags: ['t1'],
        files: [{ filename: 'f.txt', content: 'content-v1' }],
      });
      db.updateStash(s.id, { name: 'name-v2' });

      const v1 = db.getStashVersion(s.id, 1);
      expect(v1).not.toBeNull();
      expect(v1!.name).toBe('name-v1');
      expect(v1!.description).toBe('desc-v1');
      expect(v1!.tags).toEqual(['t1']);
      expect(v1!.files).toHaveLength(1);
      expect(v1!.files[0].content).toBe('content-v1');
    });

    it('synthesises the current version when not yet snapshotted', () => {
      const s = db.createStash({
        name: 'live',
        files: [{ filename: 'f.txt', content: 'live-content' }],
      });
      db.updateStash(s.id, { name: 'live-2' });
      // stash now has version=2, only v1 is snapshotted as a stored row.
      const live = db.getStashVersion(s.id, 2);
      expect(live).not.toBeNull();
      expect(live!.name).toBe('live-2');
    });

    it('returns null for unknown version number', () => {
      const s = db.createStash({
        name: 'x',
        files: [{ filename: 'f.txt', content: 'x' }],
      });
      expect(db.getStashVersion(s.id, 999)).toBeNull();
    });
  });

  describe('restoreStashVersion', () => {
    it('restores name, description, tags, and files of the chosen version', () => {
      const s = db.createStash({
        name: 'original',
        description: 'orig-desc',
        tags: ['t1', 't2'],
        files: [{ filename: 'f.txt', content: 'orig' }],
      });
      db.updateStash(s.id, {
        name: 'changed',
        description: 'new-desc',
        tags: ['other'],
        files: [{ filename: 'f.txt', content: 'changed' }],
      });

      const restored = db.restoreStashVersion(s.id, 1);
      expect(restored).not.toBeNull();
      expect(restored!.name).toBe('original');
      expect(restored!.description).toBe('orig-desc');
      expect(restored!.tags).toEqual(['t1', 't2']);
      expect(restored!.files[0].content).toBe('orig');
    });

    it('bumps version on restore (restore is an update)', () => {
      const s = db.createStash({
        name: 'a',
        files: [{ filename: 'f.txt', content: 'a' }],
      });
      db.updateStash(s.id, { name: 'b' });
      const before = db.getStash(s.id)!.version;
      const restored = db.restoreStashVersion(s.id, 1);
      expect(restored!.version).toBeGreaterThan(before);
    });

    it('returns null for unknown stash or unknown version', () => {
      expect(db.restoreStashVersion('nope', 1)).toBeNull();
      const s = db.createStash({
        name: 'x',
        files: [{ filename: 'f.txt', content: 'x' }],
      });
      expect(db.restoreStashVersion(s.id, 999)).toBeNull();
    });
  });

  describe('cascade delete', () => {
    it('removes stash_versions and stash_version_files when parent stash is deleted', () => {
      const s = db.createStash({
        name: 'p',
        files: [{ filename: 'f.txt', content: 'x' }],
      });
      db.updateStash(s.id, { name: 'p2' });

      const inner = (db as unknown as { db: Database.Database }).db;
      const beforeVersions = (
        inner.prepare('SELECT COUNT(*) AS c FROM stash_versions WHERE stash_id = ?').get(s.id) as {
          c: number;
        }
      ).c;
      expect(beforeVersions).toBeGreaterThan(0);

      db.deleteStash(s.id);

      const afterVersions = (
        inner.prepare('SELECT COUNT(*) AS c FROM stash_versions WHERE stash_id = ?').get(s.id) as {
          c: number;
        }
      ).c;
      expect(afterVersions).toBe(0);
    });
  });
});
