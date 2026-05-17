import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ClawStashDB } from '../db';

/**
 * Characterization tests for searchStashes / FTS5 / LIKE fallback (refs #144).
 *
 * Written before the SearchStore split so the upcoming refactor cannot
 * regress:
 *
 * - FTS5 MATCH path with BM25 ranking (`relevance > 0`)
 * - Prefix match (`pyth` -> `python`)
 * - Special-character handling (no throw)
 * - LIKE-fallback path when buildFtsQuery returns an empty string
 * - Filter combinations (tag, archived)
 */
function makeDb(): ClawStashDB {
  return new ClawStashDB(':memory:');
}

describe('ClawStashDB searchStashes', () => {
  let db: ClawStashDB;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('FTS5 BM25 path', () => {
    it('finds a stash by exact word match in name', () => {
      db.createStash({
        name: 'kubernetes-pod-spec',
        files: [{ filename: 'pod.yaml', content: 'kind: Pod' }],
      });
      db.createStash({
        name: 'unrelated',
        files: [{ filename: 'x.txt', content: 'lorem ipsum' }],
      });
      const r = db.searchStashes('kubernetes');
      expect(r.total).toBeGreaterThanOrEqual(1);
      expect(r.stashes.some((s) => s.name === 'kubernetes-pod-spec')).toBe(true);
    });

    it('finds a stash by word match in file content', () => {
      db.createStash({
        name: 'silent',
        files: [{ filename: 'src.py', content: 'def hardcore_search(): return 42' }],
      });
      const r = db.searchStashes('hardcore');
      expect(r.total).toBeGreaterThanOrEqual(1);
      expect(r.stashes.some((s) => s.name === 'silent')).toBe(true);
    });

    it('supports prefix matching (2+ char prefix gets a star)', () => {
      db.createStash({
        name: 'python-notes',
        files: [{ filename: 'a.py', content: 'print()' }],
      });
      const r = db.searchStashes('pyth');
      expect(r.total).toBeGreaterThanOrEqual(1);
      expect(r.stashes.some((s) => s.name === 'python-notes')).toBe(true);
    });

    it('returns relevance scores on hits', () => {
      db.createStash({
        name: 'rocket science',
        description: 'about rockets',
        files: [{ filename: 'a.txt', content: 'rockets are cool' }],
      });
      const r = db.searchStashes('rocket');
      expect(r.stashes.length).toBeGreaterThan(0);
      // FTS5 BM25 returns negative ranks; the DB layer applies Math.abs
      expect(r.stashes[0].relevance).toBeGreaterThan(0);
    });

    it('ranks tighter matches higher than looser ones', () => {
      db.createStash({
        name: 'unrelated',
        description: 'random',
        files: [{ filename: 'a.txt', content: 'a passing mention of kubernetes here' }],
      });
      db.createStash({
        name: 'kubernetes deep dive',
        description: 'all about kubernetes',
        files: [
          { filename: 'k.md', content: 'kubernetes kubernetes kubernetes deployment manifest' },
        ],
      });
      const r = db.searchStashes('kubernetes');
      expect(r.stashes.length).toBe(2);
      // first hit should be the deep dive (more matches in indexed columns)
      expect(r.stashes[0].name).toBe('kubernetes deep dive');
      expect(r.stashes[0].relevance).toBeGreaterThan(r.stashes[1].relevance);
    });

    it('returns empty result for empty query (buildFtsQuery returns "")', () => {
      db.createStash({
        name: 'whatever',
        files: [{ filename: 'a.txt', content: 'x' }],
      });
      const r = db.searchStashes('');
      expect(r).toEqual({ stashes: [], total: 0, query: '' });
    });

    it('returns empty result for query made entirely of FTS-special chars', () => {
      db.createStash({
        name: 'whatever',
        files: [{ filename: 'a.txt', content: 'x' }],
      });
      // All chars stripped by buildFtsQuery sanitizer
      const r = db.searchStashes('()+-*"');
      expect(r.total).toBe(0);
      expect(r.stashes).toEqual([]);
    });

    it('strips FTS5 operator characters from the query without throwing', () => {
      db.createStash({
        name: 'specialchars',
        files: [{ filename: 'a.txt', content: 'searchable content here' }],
      });
      // Operators / quotes / NOT / parens inside the query — the sanitizer
      // strips them so FTS5 MATCH never sees a malformed expression. The
      // sanitizer must not throw or return malformed SQL — `total` may be
      // 0 because FTS5 implicit-AND requires every cleaned token to match.
      expect(() => {
        db.searchStashes('"" + () - * ^ ~');
      }).not.toThrow();
      // A query with only operators yields an empty cleaned-query and
      // therefore an empty result set (not a thrown error).
      const r = db.searchStashes('"" + () - * ^ ~');
      expect(r.total).toBe(0);
    });

    it('respects tag filter', () => {
      db.createStash({
        name: 'a',
        tags: ['keep'],
        files: [{ filename: 'a.txt', content: 'match' }],
      });
      db.createStash({
        name: 'b',
        tags: ['skip'],
        files: [{ filename: 'b.txt', content: 'match' }],
      });
      const r = db.searchStashes('match', { tag: 'keep' });
      expect(r.total).toBe(1);
      expect(r.stashes[0].name).toBe('a');
    });

    it('respects archived filter', () => {
      const a = db.createStash({
        name: 'live',
        files: [{ filename: 'a.txt', content: 'sharedword' }],
      });
      const b = db.createStash({
        name: 'archived',
        files: [{ filename: 'b.txt', content: 'sharedword' }],
      });
      db.archiveStash(b.id, true);

      const onlyLive = db.searchStashes('sharedword', { archived: false });
      expect(onlyLive.total).toBe(1);
      expect(onlyLive.stashes[0].id).toBe(a.id);

      const onlyArchived = db.searchStashes('sharedword', { archived: true });
      expect(onlyArchived.total).toBe(1);
      expect(onlyArchived.stashes[0].id).toBe(b.id);
    });

    it('does not include the FTS sentinel U+E000 / U+E001 in snippets', () => {
      db.createStash({
        name: 'snippety',
        files: [{ filename: 'a.txt', content: 'the rocket flew far and fast' }],
      });
      const r = db.searchStashes('rocket');
      const json = JSON.stringify(r.stashes);
      // Public marker
      expect(json).toContain('**');
      // Private-use sentinels must never leak
      expect(json).not.toContain('');
      expect(json).not.toContain('');
    });
  });

  describe('pagination', () => {
    it('clamps invalid page/limit values to safe defaults', () => {
      db.createStash({
        name: 'paginated',
        files: [{ filename: 'a.txt', content: 'paginated content' }],
      });
      // Negative + zero should NOT throw an OFFSET error
      const r1 = db.searchStashes('paginated', { page: 0, limit: 0 });
      expect(r1.total).toBeGreaterThanOrEqual(1);
      const r2 = db.searchStashes('paginated', { page: -3, limit: -7 });
      expect(r2.total).toBeGreaterThanOrEqual(1);
    });

    it('honours limit', () => {
      for (let i = 0; i < 5; i++) {
        db.createStash({
          name: `multi-${i}`,
          files: [{ filename: 'a.txt', content: 'manymatches' }],
        });
      }
      const r = db.searchStashes('manymatches', { limit: 2 });
      expect(r.stashes).toHaveLength(2);
      expect(r.total).toBe(5);
    });
  });

  describe('buildFtsQuery escape behaviour', () => {
    // buildFtsQuery is private — we exercise it via searchStashes outcomes.
    it('drops 1-char tokens from prefix expansion to avoid expensive scans', () => {
      db.createStash({
        name: 'apple banana',
        files: [{ filename: 'a.txt', content: 'apple banana' }],
      });
      // The 'a' token cannot be 'a*' (would match everything); the longer
      // 'banana' token still matches.
      const r = db.searchStashes('a banana');
      expect(r.total).toBeGreaterThanOrEqual(1);
    });

    it('rejects queries with more than 50 tokens by returning empty', () => {
      db.createStash({
        name: 'tokenized',
        files: [{ filename: 'a.txt', content: 'tokenized content' }],
      });
      const many = Array.from({ length: 60 }, (_, i) => `tok${i}`).join(' ');
      const r = db.searchStashes(many);
      expect(r).toEqual({ stashes: [], total: 0, query: many });
    });

    it('rejects queries longer than 2000 chars by returning empty', () => {
      const longQuery = 'a'.repeat(2001);
      const r = db.searchStashes(longQuery);
      expect(r).toEqual({ stashes: [], total: 0, query: longQuery });
    });
  });
});
