import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/server/singleton';
import { PATCH } from '@/app/api/stashes/[id]/route';

vi.mock('@/server/singleton', async () => {
  const { ClawStashDB } = await import('@/server/db');
  const db = new ClawStashDB(':memory:');
  return { getDb: () => db };
});

// Open mode, whatever the shell exports: the handler is under test, not auth.
vi.stubEnv('ADMIN_PASSWORD', '');

describe('PATCH /api/stashes/:id access log', () => {
  it('records a backup flag flip sent alongside a content change', async () => {
    const stash = getDb().createStash({ files: [{ filename: 'a.txt', content: 'x' }] });
    const req = new NextRequest(`http://localhost:3000/api/stashes/${stash.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'renamed', backup_enabled: false }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: stash.id }) });
    expect(res.status).toBe(200);
    const actions = getDb()
      .getAccessLog(stash.id)
      .map((e) => e.action);
    expect(actions.sort()).toEqual(['backup_disable', 'update']);
  });
});
