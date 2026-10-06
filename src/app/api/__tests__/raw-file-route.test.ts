import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/server/singleton';
import { GET } from '@/app/api/stashes/[id]/files/[filename]/raw/route';

vi.mock('@/server/singleton', async () => {
  const { ClawStashDB } = await import('@/server/db');
  const db = new ClawStashDB(':memory:');
  return { getDb: () => db };
});

// Open mode, whatever the shell exports: the handler is under test, not auth.
vi.stubEnv('ADMIN_PASSWORD', '');

/**
 * Next.js passes dynamic route params already percent-decoded (verified
 * against `next start`: `/files/50%25off.md/raw` arrives as `50%off.md`), so
 * the handler must use `filename` verbatim. A second decode broke every
 * filename containing `%`.
 */
describe('GET /api/stashes/:id/files/:filename/raw', () => {
  const get = (id: string, filename: string) =>
    GET(new NextRequest(`http://localhost:3000/api/stashes/${id}/files/x/raw`), {
      params: Promise.resolve({ id, filename }),
    });

  it('serves files whose name contains a literal percent sign', async () => {
    const stash = getDb().createStash({
      files: [
        { filename: '50%off.md', content: 'sale' },
        { filename: 'a%41.txt', content: 'literal' },
      ],
    });
    const sale = await get(stash.id, '50%off.md');
    expect(sale.status).toBe(200);
    expect(await sale.text()).toBe('sale');
    const literal = await get(stash.id, 'a%41.txt');
    expect(literal.status).toBe(200);
    expect(await literal.text()).toBe('literal');
  });

  it('serves files whose name is not ASCII', async () => {
    const stash = getDb().createStash({ files: [{ filename: '日本.md', content: 'hi' }] });
    const res = await get(stash.id, '日本.md');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hi');
    expect(res.headers.get('Content-Disposition')).toBe(
      `inline; filename="__.md"; filename*=UTF-8''${encodeURIComponent('日本.md')}`,
    );
  });
});
