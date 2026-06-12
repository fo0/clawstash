import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ClawStashDB } from '../../db';
import {
  BACKUP_UNHEALTHY_THRESHOLD,
  DEFAULT_BACKUP_SETTINGS,
  computeStashContentHash,
  readBackupHealth,
  runBackupSync,
  storeBackupToken,
  writeBackupSettings,
} from '../backup-service';
import { resetEncryptionKeyCache } from '../backup-crypto';

const TEST_TOKEN = `ghp_${'x'.repeat(36)}`;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Minimal in-memory implementation of the GitHub Git Data API surface the
 * sync engine uses: refs, commits, trees (with base_tree + deletions) and
 * blobs. Tracks call counts so tests can assert idempotence.
 */
class FakeGitHub {
  refs = new Map<string, string>();
  commits = new Map<
    string,
    {
      treeSha: string;
      message: string;
      parents: string[];
      author: { name: string; email: string } | null;
    }
  >();
  trees = new Map<string, Map<string, string>>();
  blobs = new Map<string, string>();
  totalCalls = 0;
  refUpdateCalls = 0;
  failNextRefUpdates = 0;
  failure: { match: RegExp; status: number; message: string } | null = null;
  private counter = 0;

  install() {
    vi.stubGlobal('fetch', async (url: string | URL, init: RequestInit = {}) =>
      this.handle(String(url), init),
    );
  }

  headPaths(branch: string): Map<string, string> {
    const head = this.refs.get(branch);
    if (!head) return new Map();
    const commit = this.commits.get(head)!;
    return new Map(this.trees.get(commit.treeSha)!);
  }

  commitMessages(branch: string): string[] {
    const messages: string[] = [];
    let sha = this.refs.get(branch);
    while (sha) {
      const commit = this.commits.get(sha)!;
      messages.push(commit.message);
      sha = commit.parents[0];
    }
    return messages;
  }

  private async handle(url: string, init: RequestInit): Promise<Response> {
    this.totalCalls++;
    const method = (init.method || 'GET').toUpperCase();
    const u = new URL(url);
    const path = u.pathname;
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

    if (this.failure && this.failure.match.test(`${method} ${path}`)) {
      return jsonResponse(this.failure.status, { message: this.failure.message });
    }

    let m = path.match(/\/git\/ref\/(.+)$/);
    if (method === 'GET' && m) {
      const branch = decodeURIComponent(m[1]).replace(/^heads\//, '');
      const sha = this.refs.get(branch);
      return sha
        ? jsonResponse(200, { object: { sha } })
        : jsonResponse(404, { message: 'Not Found' });
    }

    m = path.match(/\/git\/commits\/([^/]+)$/);
    if (method === 'GET' && m) {
      const commit = this.commits.get(m[1]);
      if (!commit) return jsonResponse(404, { message: 'Not Found' });
      return jsonResponse(200, { tree: { sha: commit.treeSha } });
    }

    m = path.match(/\/git\/trees\/([^/]+)$/);
    if (method === 'GET' && m) {
      const tree = this.trees.get(m[1]);
      if (!tree) return jsonResponse(404, { message: 'Not Found' });
      return jsonResponse(200, {
        truncated: false,
        tree: [...tree.keys()].map((p) => ({ path: p, type: 'blob' })),
      });
    }

    if (method === 'POST' && path.endsWith('/git/blobs')) {
      const sha = `blob-${++this.counter}`;
      this.blobs.set(sha, Buffer.from(String(body.content), 'base64').toString('utf8'));
      return jsonResponse(201, { sha });
    }

    if (method === 'POST' && path.endsWith('/git/trees')) {
      const base = body.base_tree ? this.trees.get(String(body.base_tree)) : undefined;
      const tree = new Map(base ?? []);
      for (const entry of body.tree as {
        path: string;
        sha?: string | null;
        content?: string;
      }[]) {
        if (entry.sha === null) tree.delete(entry.path);
        else if (entry.content !== undefined) tree.set(entry.path, entry.content);
        else tree.set(entry.path, this.blobs.get(entry.sha!) ?? '');
      }
      const sha = `tree-${++this.counter}`;
      this.trees.set(sha, tree);
      return jsonResponse(201, { sha });
    }

    if (method === 'POST' && path.endsWith('/git/commits')) {
      const sha = `commit-${++this.counter}`;
      this.commits.set(sha, {
        treeSha: String(body.tree),
        message: String(body.message),
        parents: (body.parents as string[]) ?? [],
        author: (body.author as { name: string; email: string } | undefined) ?? null,
      });
      return jsonResponse(201, { sha });
    }

    if (method === 'POST' && path.endsWith('/git/refs')) {
      const branch = String(body.ref).replace(/^refs\/heads\//, '');
      if (this.refs.has(branch)) {
        return jsonResponse(422, { message: 'Reference already exists' });
      }
      this.refs.set(branch, String(body.sha));
      return jsonResponse(201, {});
    }

    m = path.match(/\/git\/refs\/(.+)$/);
    if (method === 'PATCH' && m) {
      this.refUpdateCalls++;
      if (this.failNextRefUpdates > 0) {
        this.failNextRefUpdates--;
        return jsonResponse(422, { message: 'Update is not a fast forward' });
      }
      const branch = decodeURIComponent(m[1]).replace(/^heads\//, '');
      this.refs.set(branch, String(body.sha));
      return jsonResponse(200, {});
    }

    return jsonResponse(500, { message: `FakeGitHub: unhandled ${method} ${path}` });
  }
}

let db: ClawStashDB;
let fake: FakeGitHub;

function configureBackup(overrides: Partial<typeof DEFAULT_BACKUP_SETTINGS> = {}) {
  writeBackupSettings(db, {
    ...DEFAULT_BACKUP_SETTINGS,
    enabled: true,
    repoOwner: 'owner',
    repoName: 'repo',
    ...overrides,
  });
  storeBackupToken(db, TEST_TOKEN, {
    method: 'pat',
    login: 'octo',
    connectedAt: new Date().toISOString(),
  });
}

beforeEach(() => {
  vi.stubEnv('CLAWSTASH_ENCRYPTION_KEY', 'cd'.repeat(32));
  resetEncryptionKeyCache();
  db = new ClawStashDB(':memory:');
  fake = new FakeGitHub();
  fake.install();
});

afterEach(() => {
  db.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetEncryptionKeyCache();
});

describe('runBackupSync', () => {
  it('first sync creates the branch with envelope, raw files and INDEX.md', async () => {
    configureBackup();
    const stash = db.createStash({
      name: 'Alpha',
      description: 'first',
      tags: ['t1'],
      files: [
        { filename: 'a.txt', content: 'hello' },
        { filename: 'b.md', content: '# hi' },
      ],
    });

    const result = await runBackupSync(db, 'manual');
    expect(result.status).toBe('success');
    expect(result.synced).toBe(1);

    const paths = fake.headPaths('main');
    expect(paths.get(`stashes/${stash.id}/files/a.txt`)).toBe('hello');
    expect(paths.get(`stashes/${stash.id}/files/b.md`)).toBe('# hi');
    expect(paths.has('stashes/INDEX.md')).toBe(true);
    expect(paths.get('stashes/INDEX.md')).toContain('Alpha');

    const envelope = JSON.parse(paths.get(`stashes/${stash.id}/stash.json`)!);
    expect(envelope.id).toBe(stash.id);
    expect(envelope.name).toBe('Alpha');
    expect(envelope.files).toHaveLength(2);

    expect(fake.commitMessages('main')).toEqual(['stash: create Alpha']);

    const state = db.getBackupState(stash.id)!;
    expect(state.state).toBe('idle');
    expect(state.content_hash).toBe(computeStashContentHash(db.getStash(stash.id)!));
    expect(state.last_commit_sha).toBe(result.commitSha);

    const log = db.getBackupLog();
    expect(log.some((e) => e.stash_id === stash.id && e.action === 'create')).toBe(true);
    expect(log.some((e) => e.stash_id === null && e.status === 'success')).toBe(true);
    expect(readBackupHealth(db).lastRunStatus).toBe('success');
  });

  it('a run without changes is a no-op without any GitHub calls', async () => {
    configureBackup();
    db.createStash({ name: 'Alpha', files: [{ filename: 'a.txt', content: 'x' }] });
    await runBackupSync(db, 'manual');

    const callsBefore = fake.totalCalls;
    const result = await runBackupSync(db, 'scheduled');
    expect(result.status).toBe('skipped');
    expect(fake.totalCalls).toBe(callsBefore);
    expect(db.getBackupLog().some((e) => e.status === 'skipped')).toBe(true);
  });

  it('updates commit once and clean up files removed from the stash', async () => {
    configureBackup();
    const stash = db.createStash({
      name: 'Alpha',
      files: [
        { filename: 'a.txt', content: 'old' },
        { filename: 'b.txt', content: 'keep?' },
      ],
    });
    await runBackupSync(db, 'manual');

    db.updateStash(stash.id, { name: 'Alpha2', files: [{ filename: 'c.txt', content: 'new' }] });
    const result = await runBackupSync(db, 'mutation');
    expect(result.status).toBe('success');

    const paths = fake.headPaths('main');
    expect(paths.has(`stashes/${stash.id}/files/a.txt`)).toBe(false);
    expect(paths.has(`stashes/${stash.id}/files/b.txt`)).toBe(false);
    expect(paths.get(`stashes/${stash.id}/files/c.txt`)).toBe('new');
    expect(paths.get('stashes/INDEX.md')).toContain('Alpha2');
    expect(fake.commitMessages('main')[0]).toBe('stash: update Alpha2');
  });

  it('removes deleted stashes from the repo (catch-up without mutation hook)', async () => {
    configureBackup();
    const a = db.createStash({ name: 'Keep', files: [{ filename: 'k.txt', content: 'k' }] });
    const b = db.createStash({ name: 'Gone', files: [{ filename: 'g.txt', content: 'g' }] });
    await runBackupSync(db, 'manual');

    db.deleteStash(b.id); // no listener attached → next run detects the orphaned state row
    const result = await runBackupSync(db, 'scheduled');
    expect(result.status).toBe('success');
    expect(result.removed).toBe(1);

    const paths = fake.headPaths('main');
    expect(paths.has(`stashes/${a.id}/files/k.txt`)).toBe(true);
    expect([...paths.keys()].some((p) => p.includes(b.id))).toBe(false);
    expect(paths.get('stashes/INDEX.md')).not.toContain('Gone');
    expect(db.getBackupState(b.id)).toBeNull();
    expect(fake.commitMessages('main')[0]).toBe('stash: delete Gone');
  });

  it('delete mode "keep" clears state but leaves the mirrored files', async () => {
    configureBackup({ deleteMode: 'keep' });
    const stash = db.createStash({ name: 'Kept', files: [{ filename: 'k.txt', content: 'k' }] });
    await runBackupSync(db, 'manual');
    const messagesBefore = fake.commitMessages('main').length;

    db.deleteStash(stash.id);
    const result = await runBackupSync(db, 'manual');
    expect(result.status).toBe('success');
    expect(result.removed).toBe(1);
    expect(fake.headPaths('main').has(`stashes/${stash.id}/files/k.txt`)).toBe(true);
    expect(fake.commitMessages('main')).toHaveLength(messagesBefore);
    expect(db.getBackupState(stash.id)).toBeNull();
  });

  it('opting a stash out removes its mirror; opting back in re-adds it', async () => {
    configureBackup();
    const stash = db.createStash({ name: 'Toggle', files: [{ filename: 't.txt', content: 't' }] });
    await runBackupSync(db, 'manual');

    db.setStashBackupEnabled(stash.id, false);
    await runBackupSync(db, 'manual');
    expect([...fake.headPaths('main').keys()].some((p) => p.includes(stash.id))).toBe(false);

    db.setStashBackupEnabled(stash.id, true);
    const result = await runBackupSync(db, 'manual');
    expect(result.synced).toBe(1);
    expect(fake.headPaths('main').get(`stashes/${stash.id}/files/t.txt`)).toBe('t');
  });

  it('retries on a non-fast-forward ref update (last writer wins)', async () => {
    configureBackup();
    const stash = db.createStash({ name: 'Race', files: [{ filename: 'r.txt', content: '1' }] });
    await runBackupSync(db, 'manual');

    db.updateStash(stash.id, { files: [{ filename: 'r.txt', content: '2' }] });
    fake.failNextRefUpdates = 1;
    const result = await runBackupSync(db, 'manual');
    expect(result.status).toBe('success');
    expect(fake.refUpdateCalls).toBe(2);
    expect(fake.headPaths('main').get(`stashes/${stash.id}/files/r.txt`)).toBe('2');
  });

  it('gives up after exhausting the ref-update retries', async () => {
    configureBackup();
    const stash = db.createStash({ name: 'Lost', files: [{ filename: 'l.txt', content: '1' }] });
    await runBackupSync(db, 'manual'); // first run creates the branch + state row

    db.updateStash(stash.id, { files: [{ filename: 'l.txt', content: '2' }] });
    fake.failNextRefUpdates = 3; // MAX_REF_UPDATE_ATTEMPTS
    const result = await runBackupSync(db, 'manual');
    expect(result.status).toBe('error');
    expect(fake.refUpdateCalls).toBe(3);
    expect(db.getBackupState(stash.id)!.state).toBe('error');
    expect(readBackupHealth(db).consecutiveFailures).toBe(1);
  });

  it('reports unhealthy after three consecutive failed runs', async () => {
    configureBackup();
    db.createStash({ name: 'Sick', files: [{ filename: 's.txt', content: 's' }] });
    fake.failure = { match: /POST .*\/git\/trees$/, status: 500, message: 'down' };
    for (let i = 0; i < BACKUP_UNHEALTHY_THRESHOLD; i++) {
      expect((await runBackupSync(db, 'scheduled')).status).toBe('error');
    }
    expect(readBackupHealth(db).consecutiveFailures).toBe(BACKUP_UNHEALTHY_THRESHOLD);
  });

  it('records redacted errors and recovers on the next successful run', async () => {
    configureBackup();
    const stash = db.createStash({ name: 'Boom', files: [{ filename: 'b.txt', content: 'b' }] });
    await runBackupSync(db, 'manual');

    db.updateStash(stash.id, { files: [{ filename: 'b.txt', content: 'b2' }] });
    fake.failure = {
      match: /POST .*\/git\/trees$/,
      status: 500,
      message: `server exploded ${TEST_TOKEN}`,
    };
    const result = await runBackupSync(db, 'scheduled');
    expect(result.status).toBe('error');
    expect(result.message).not.toContain(TEST_TOKEN);
    expect(result.message).toContain('[redacted]');

    const state = db.getBackupState(stash.id)!;
    expect(state.state).toBe('error');
    expect(state.error).not.toContain(TEST_TOKEN);
    const health = readBackupHealth(db);
    expect(health.consecutiveFailures).toBe(1);
    expect(health.lastError).not.toContain(TEST_TOKEN);

    fake.failure = null;
    const retry = await runBackupSync(db, 'scheduled');
    expect(retry.status).toBe('success');
    expect(db.getBackupState(stash.id)!.state).toBe('idle');
    expect(readBackupHealth(db).consecutiveFailures).toBe(0);
  });

  it('reports not_configured without a token/repo and gates automatic runs on the master switch', async () => {
    expect((await runBackupSync(db, 'manual')).status).toBe('not_configured');

    configureBackup({ enabled: false });
    db.createStash({ name: 'X', files: [{ filename: 'x.txt', content: 'x' }] });
    expect((await runBackupSync(db, 'scheduled')).status).toBe('not_configured');
    expect((await runBackupSync(db, 'mutation')).status).toBe('not_configured');
    // Manual runs work while automation is paused.
    expect((await runBackupSync(db, 'manual')).status).toBe('success');
  });

  it('a scoped run only pushes the requested stash', async () => {
    configureBackup();
    const g = db.createStash({ name: 'G', files: [{ filename: 'g.txt', content: 'g' }] });
    const h = db.createStash({ name: 'H', files: [{ filename: 'h.txt', content: 'h' }] });

    const scoped = await runBackupSync(db, 'manual', { stashIds: [g.id] });
    expect(scoped.synced).toBe(1);
    const paths = fake.headPaths('main');
    expect(paths.has(`stashes/${g.id}/files/g.txt`)).toBe(true);
    expect([...paths.keys()].some((p) => p.includes(h.id))).toBe(false);

    const full = await runBackupSync(db, 'manual');
    expect(full.synced).toBe(1);
    expect(fake.headPaths('main').has(`stashes/${h.id}/files/h.txt`)).toBe(true);
  });

  it('escapes markdown metacharacters in INDEX.md stash names (backslash first)', async () => {
    configureBackup();
    db.createStash({ name: 'A|B\\', files: [{ filename: 'x.txt', content: 'x' }] });
    await runBackupSync(db, 'manual');
    const index = fake.headPaths('main').get('stashes/INDEX.md')!;
    // `A|B\` → backslash doubled, pipe escaped: `A\|B\\` — the cell cannot
    // break the table or re-arm the delimiter pipe.
    expect(index).toContain('| A\\|B\\\\ |');
    expect(index).not.toContain('| A|B');
  });

  it('uses the configured path prefix and commit author', async () => {
    configureBackup({ pathPrefix: 'mirror/clawstash', commitAuthorName: 'Backup Bot' });
    db.createStash({ name: 'P', files: [{ filename: 'p.txt', content: 'p' }] });
    await runBackupSync(db, 'manual');
    const paths = fake.headPaths('main');
    expect([...paths.keys()].every((p) => p.startsWith('mirror/clawstash/'))).toBe(true);
    expect(paths.has('mirror/clawstash/INDEX.md')).toBe(true);
    // toMatchObject: the client adds a `date` field to the author payload.
    const head = fake.commits.get(fake.refs.get('main')!)!;
    expect(head.author).toMatchObject({
      name: 'Backup Bot',
      email: DEFAULT_BACKUP_SETTINGS.commitAuthorEmail,
    });
  });
});
