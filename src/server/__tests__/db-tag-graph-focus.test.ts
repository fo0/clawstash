import { describe, it, expect, afterEach } from 'vitest';
import { ClawStashDB } from '../db';

/**
 * The focus-tag BFS (`getTagGraph({ tag })` -> `getTagGraphFocusRows`) asks
 * SQLite for every stash that carries any tag of the current frontier. It used
 * to send one `tags LIKE ?` term per frontier tag joined by `OR`, and SQLite
 * caps an expression tree at a depth of 1000 — so a frontier of 1000 tags or
 * more threw `Expression tree is too large (maximum depth 1000)` and the tag
 * graph route answered 500.
 */
describe('ClawStashDB getTagGraph focus-tag BFS', () => {
  let db: ClawStashDB;

  afterEach(() => {
    db.close();
  });

  it('handles a frontier of more than 1000 tags', () => {
    db = new ClawStashDB(':memory:');
    // 21 stashes x (hub + 49 own tags) puts 1029 tags one hop from `hub`.
    for (let s = 0; s < 21; s++) {
      const own = Array.from({ length: 49 }, (_, i) => `s${s}-t${i}`);
      db.createStash({
        name: `stash ${s}`,
        tags: ['hub', ...own],
        files: [{ filename: 'a.txt', content: 'x' }],
      });
    }
    // A stash two hops away: reachable only through the 1029-tag frontier.
    db.createStash({
      name: 'far',
      tags: ['s20-t48', 'far-away'],
      files: [{ filename: 'b.txt', content: 'x' }],
    });

    const oneHop = db.getTagGraph({ tag: 'hub', depth: 1 });
    expect(oneHop.nodes).toHaveLength(1 + 21 * 49);

    const twoHops = db.getTagGraph({ tag: 'hub', depth: 2 });
    expect(twoHops.nodes.map((n) => n.tag)).toContain('far-away');
    expect(twoHops.nodes).toHaveLength(1 + 21 * 49 + 1);
  });
});
