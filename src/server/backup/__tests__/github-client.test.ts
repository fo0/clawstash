import { describe, it, expect, afterEach, vi } from 'vitest';
import { GitHubApiError, GitHubClient } from '../github-client';

type FetchHandler = (url: string, init: RequestInit) => Response | Promise<Response>;

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function stubFetch(handler: FetchHandler) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      return handler(String(url), init);
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('device flow', () => {
  it('startDeviceFlow returns the code bundle', async () => {
    stubFetch((url) => {
      expect(url).toBe('https://github.com/login/device/code');
      return jsonResponse(200, {
        device_code: 'dev123',
        user_code: 'ABCD-1234',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900,
        interval: 5,
      });
    });
    const flow = await new GitHubClient(null).startDeviceFlow('client123456');
    expect(flow).toEqual({
      deviceCode: 'dev123',
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      expiresIn: 900,
      interval: 5,
    });
  });

  it('startDeviceFlow surfaces an actionable error for bad client IDs', async () => {
    stubFetch(() => jsonResponse(200, { error: 'unauthorized_client' }));
    await expect(new GitHubClient(null).startDeviceFlow('bad')).rejects.toThrow(
      /Device Flow is enabled/,
    );
  });

  it('pollDeviceFlow maps pending / slow_down / expired / denied / success', async () => {
    const client = new GitHubClient(null);
    stubFetch(() => jsonResponse(200, { error: 'authorization_pending' }));
    expect(await client.pollDeviceFlow('c', 'd')).toEqual({ status: 'pending', interval: 0 });

    stubFetch(() => jsonResponse(200, { error: 'slow_down', interval: 10 }));
    expect(await client.pollDeviceFlow('c', 'd')).toEqual({ status: 'pending', interval: 10 });

    stubFetch(() => jsonResponse(200, { error: 'expired_token' }));
    expect(await client.pollDeviceFlow('c', 'd')).toEqual({
      status: 'error',
      error: expect.stringMatching(/expired/i),
    });

    stubFetch(() => jsonResponse(200, { error: 'access_denied' }));
    expect((await client.pollDeviceFlow('c', 'd')).status).toBe('error');

    stubFetch(() => jsonResponse(200, { access_token: 'gho_tok' }));
    expect(await client.pollDeviceFlow('c', 'd')).toEqual({
      status: 'connected',
      token: 'gho_tok',
    });
  });
});

describe('REST requests', () => {
  it('sends the token as Bearer and the GitHub headers', async () => {
    const calls = stubFetch(() => jsonResponse(200, { login: 'octocat' }));
    await new GitHubClient('token-abc').getAuthenticatedUser();
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer token-abc');
    expect(headers.Accept).toBe('application/vnd.github+json');
    expect(headers['X-GitHub-Api-Version']).toBeTruthy();
  });

  it('throws GitHubApiError with status + message — never the token', async () => {
    stubFetch(() => jsonResponse(401, { message: 'Bad credentials' }));
    const token = 'ghp_supersecret_value';
    try {
      await new GitHubClient(token).getAuthenticatedUser();
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(GitHubApiError);
      const apiErr = err as GitHubApiError;
      expect(apiErr.status).toBe(401);
      expect(apiErr.message).toContain('Bad credentials');
      expect(apiErr.message).not.toContain(token);
    }
  });

  it('flags an exhausted rate limit', async () => {
    stubFetch(() =>
      jsonResponse(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0' }),
    );
    await expect(new GitHubClient('t').getAuthenticatedUser()).rejects.toThrow(
      /rate limit exhausted/,
    );
  });

  it('getBranchHeadSha returns null for missing branches and empty repos', async () => {
    stubFetch(() => jsonResponse(404, { message: 'Not Found' }));
    expect(await new GitHubClient('t').getBranchHeadSha('o', 'r', 'main')).toBeNull();

    stubFetch(() => jsonResponse(409, { message: 'Git Repository is empty.' }));
    expect(await new GitHubClient('t').getBranchHeadSha('o', 'r', 'main')).toBeNull();
  });

  it('listRepos paginates until a short page', async () => {
    const page = (n: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        full_name: `o/repo-${n}-${i}`,
        default_branch: 'main',
        private: false,
        permissions: { push: true },
      }));
    let call = 0;
    stubFetch(() => jsonResponse(200, call++ === 0 ? page(1, 100) : page(2, 3)));
    const repos = await new GitHubClient('t').listRepos();
    expect(repos).toHaveLength(103);
    expect(repos[0].canPush).toBe(true);
  });
});

describe('createTree', () => {
  it('inlines small content, uploads large/empty content as blobs, and passes deletions', async () => {
    const bodies: Record<string, unknown>[] = [];
    stubFetch((url, init) => {
      if (url.endsWith('/git/blobs')) {
        bodies.push({ blob: JSON.parse(String(init.body)) });
        return jsonResponse(201, { sha: `blob-${bodies.length}` });
      }
      bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return jsonResponse(201, { sha: 'tree-1' });
    });

    const big = 'x'.repeat(300 * 1024);
    const sha = await new GitHubClient('t').createTree(
      'o',
      'r',
      [
        { path: 'small.txt', content: 'hello' },
        { path: 'big.txt', content: big },
        { path: 'empty.txt', content: '' },
        { path: 'gone.txt', sha: null },
      ],
      'base-tree',
    );
    expect(sha).toBe('tree-1');

    const treeBody = bodies.find((b) => 'tree' in b) as {
      tree: { path: string; content?: string; sha?: string | null }[];
      base_tree?: string;
    };
    expect(treeBody.base_tree).toBe('base-tree');
    const byPath = Object.fromEntries(treeBody.tree.map((e) => [e.path, e]));
    expect(byPath['small.txt'].content).toBe('hello');
    expect(byPath['big.txt'].sha).toMatch(/^blob-/);
    expect(byPath['empty.txt'].sha).toMatch(/^blob-/);
    expect(byPath['gone.txt'].sha).toBeNull();
  });
});
