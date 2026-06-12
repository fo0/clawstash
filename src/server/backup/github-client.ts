/**
 * Minimal GitHub REST client for the backup feature (refs #108).
 *
 * Uses global fetch only — no SDK dependency, no git binary. Two API
 * surfaces:
 *  - OAuth device flow (github.com/login/...) for "Sign in with GitHub"
 *  - REST + Git Data API (api.github.com) for repo metadata and commits
 *
 * Error messages never include the Authorization header or token; the
 * backup service additionally redacts stored messages (backup-crypto.ts).
 */

const DEFAULT_API_BASE = 'https://api.github.com';
const DEFAULT_OAUTH_BASE = 'https://github.com';
const USER_AGENT = 'ClawStash-Backup';
const API_VERSION = '2022-11-28';
const REQUEST_TIMEOUT_MS = 30_000;
// Tree entries below this size are inlined as `content` (one less API call);
// larger files go through the blob endpoint as base64.
const INLINE_CONTENT_MAX_CHARS = 256 * 1024;

export class GitHubApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

export interface GitHubClientOptions {
  apiBaseUrl?: string;
  oauthBaseUrl?: string;
  timeoutMs?: number;
}

export interface DeviceFlowStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export type DeviceFlowPollResult =
  | { status: 'connected'; token: string }
  | { status: 'pending'; interval: number }
  | { status: 'error'; error: string };

export interface RepoInfo {
  fullName: string;
  defaultBranch: string;
  private: boolean;
  canPush: boolean;
}

export interface TreeEntry {
  path: string;
  /** null = delete this path from the base tree. */
  sha?: string | null;
  content?: string;
}

export interface CommitAuthor {
  name: string;
  email: string;
}

export class GitHubClient {
  private readonly apiBase: string;
  private readonly oauthBase: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly token: string | null,
    options: GitHubClientOptions = {},
  ) {
    this.apiBase = options.apiBaseUrl ?? DEFAULT_API_BASE;
    this.oauthBase = options.oauthBaseUrl ?? DEFAULT_OAUTH_BASE;
    this.timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  // === OAuth device flow ===

  async startDeviceFlow(clientId: string): Promise<DeviceFlowStart> {
    const data = (await this.oauthRequest('/login/device/code', {
      client_id: clientId,
      scope: 'repo',
    })) as {
      device_code?: string;
      user_code?: string;
      verification_uri?: string;
      expires_in?: number;
      interval?: number;
      error?: string;
      error_description?: string;
    };
    if (!data.device_code || !data.user_code || !data.verification_uri) {
      throw new GitHubApiError(
        400,
        `GitHub device flow failed: ${data.error_description || data.error || 'unexpected response'}. ` +
          `Check that the OAuth client ID is correct and Device Flow is enabled for the app.`,
      );
    }
    return {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      expiresIn: data.expires_in ?? 900,
      interval: data.interval ?? 5,
    };
  }

  async pollDeviceFlow(clientId: string, deviceCode: string): Promise<DeviceFlowPollResult> {
    const data = (await this.oauthRequest('/login/oauth/access_token', {
      client_id: clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    })) as { access_token?: string; error?: string; interval?: number };

    if (data.access_token) return { status: 'connected', token: data.access_token };
    switch (data.error) {
      case 'authorization_pending':
        return { status: 'pending', interval: 0 };
      case 'slow_down':
        return { status: 'pending', interval: data.interval ?? 5 };
      case 'expired_token':
        return { status: 'error', error: 'The device code expired. Start the login again.' };
      case 'access_denied':
        return { status: 'error', error: 'GitHub login was denied.' };
      default:
        return { status: 'error', error: `GitHub login failed: ${data.error || 'unknown error'}` };
    }
  }

  // === Account / repo metadata ===

  async getAuthenticatedUser(): Promise<{ login: string }> {
    const data = (await this.request('GET', '/user')) as { login: string };
    return { login: data.login };
  }

  async getRepo(owner: string, repo: string): Promise<RepoInfo> {
    const data = (await this.request('GET', `/repos/${owner}/${repo}`)) as {
      full_name: string;
      default_branch: string;
      private: boolean;
      permissions?: { push?: boolean };
    };
    return {
      fullName: data.full_name,
      defaultBranch: data.default_branch,
      private: data.private,
      canPush: data.permissions?.push ?? false,
    };
  }

  async listRepos(): Promise<RepoInfo[]> {
    const repos: RepoInfo[] = [];
    // Bounded pagination: 3 pages × 100 keeps the settings dropdown useful
    // without hammering the API for accounts with thousands of repos.
    for (let page = 1; page <= 3; page++) {
      const data = (await this.request(
        'GET',
        `/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`,
      )) as {
        full_name: string;
        default_branch: string;
        private: boolean;
        permissions?: { push?: boolean };
      }[];
      for (const r of data) {
        repos.push({
          fullName: r.full_name,
          defaultBranch: r.default_branch,
          private: r.private,
          canPush: r.permissions?.push ?? false,
        });
      }
      if (data.length < 100) break;
    }
    return repos;
  }

  async listBranches(owner: string, repo: string): Promise<string[]> {
    const data = (await this.request('GET', `/repos/${owner}/${repo}/branches?per_page=100`)) as {
      name: string;
    }[];
    return data.map((b) => b.name);
  }

  // === Git Data API ===

  /** Head commit SHA of a branch, or null when the branch does not exist. */
  async getBranchHeadSha(owner: string, repo: string, branch: string): Promise<string | null> {
    try {
      const data = (await this.request(
        'GET',
        `/repos/${owner}/${repo}/git/ref/${encodeURIComponent(`heads/${branch}`)}`,
      )) as { object: { sha: string } };
      return data.object.sha;
    } catch (err) {
      // 404: branch missing; 409: repository has no commits at all.
      if (err instanceof GitHubApiError && (err.status === 404 || err.status === 409)) return null;
      throw err;
    }
  }

  async getCommitTreeSha(owner: string, repo: string, commitSha: string): Promise<string> {
    const data = (await this.request(
      'GET',
      `/repos/${owner}/${repo}/git/commits/${commitSha}`,
    )) as { tree: { sha: string } };
    return data.tree.sha;
  }

  /** All blob paths reachable from a tree (recursive). */
  async getTreePaths(
    owner: string,
    repo: string,
    treeSha: string,
  ): Promise<{ paths: Set<string>; truncated: boolean }> {
    const data = (await this.request(
      'GET',
      `/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
    )) as { tree: { path: string; type: string }[]; truncated: boolean };
    const paths = new Set<string>();
    for (const entry of data.tree) {
      if (entry.type === 'blob') paths.add(entry.path);
    }
    return { paths, truncated: data.truncated };
  }

  async createBlob(owner: string, repo: string, content: string): Promise<string> {
    const data = (await this.request('POST', `/repos/${owner}/${repo}/git/blobs`, {
      content: Buffer.from(content, 'utf8').toString('base64'),
      encoding: 'base64',
    })) as { sha: string };
    return data.sha;
  }

  /**
   * Create a tree from entries. Small text entries are inlined; large ones
   * are uploaded as blobs first. Entries with `sha: null` delete the path
   * (requires baseTreeSha).
   */
  async createTree(
    owner: string,
    repo: string,
    entries: TreeEntry[],
    baseTreeSha?: string,
  ): Promise<string> {
    const tree: Record<string, unknown>[] = [];
    for (const entry of entries) {
      if (entry.sha === null) {
        tree.push({ path: entry.path, mode: '100644', type: 'blob', sha: null });
      } else if (
        entry.content !== undefined &&
        (entry.content.length === 0 || entry.content.length > INLINE_CONTENT_MAX_CHARS)
      ) {
        // Empty files also go through the blob endpoint — the tree API
        // treats an inline empty `content` inconsistently.
        const sha = await this.createBlob(owner, repo, entry.content);
        tree.push({ path: entry.path, mode: '100644', type: 'blob', sha });
      } else if (entry.content !== undefined) {
        tree.push({ path: entry.path, mode: '100644', type: 'blob', content: entry.content });
      } else {
        tree.push({ path: entry.path, mode: '100644', type: 'blob', sha: entry.sha });
      }
    }
    const data = (await this.request('POST', `/repos/${owner}/${repo}/git/trees`, {
      tree,
      ...(baseTreeSha ? { base_tree: baseTreeSha } : {}),
    })) as { sha: string };
    return data.sha;
  }

  async createCommit(
    owner: string,
    repo: string,
    input: { message: string; treeSha: string; parents: string[]; author: CommitAuthor },
  ): Promise<string> {
    const data = (await this.request('POST', `/repos/${owner}/${repo}/git/commits`, {
      message: input.message,
      tree: input.treeSha,
      parents: input.parents,
      author: { ...input.author, date: new Date().toISOString() },
    })) as { sha: string };
    return data.sha;
  }

  async createRef(owner: string, repo: string, branch: string, sha: string): Promise<void> {
    await this.request('POST', `/repos/${owner}/${repo}/git/refs`, {
      ref: `refs/heads/${branch}`,
      sha,
    });
  }

  /** Fast-forward the branch. Throws GitHubApiError(422) on conflict. */
  async updateRef(owner: string, repo: string, branch: string, sha: string): Promise<void> {
    await this.request(
      'PATCH',
      `/repos/${owner}/${repo}/git/refs/${encodeURIComponent(`heads/${branch}`)}`,
      { sha, force: false },
    );
  }

  // === Internals ===

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': USER_AGENT,
      'X-GitHub-Api-Version': API_VERSION,
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(`${this.apiBase}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      let apiMessage = '';
      try {
        const data = (await res.json()) as { message?: string };
        apiMessage = data.message || '';
      } catch {
        /* non-JSON error body */
      }
      const rateLimited = res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0';
      // Strip the query string — it never carries secrets today, but error
      // messages end up in the persisted sync log, so keep them minimal.
      const cleanPath = path.split('?')[0];
      throw new GitHubApiError(
        res.status,
        `GitHub API ${method} ${cleanPath} failed (${res.status})` +
          (apiMessage ? `: ${apiMessage}` : '') +
          (rateLimited ? ' [rate limit exhausted]' : ''),
      );
    }

    if (res.status === 204) return null;
    return res.json();
  }

  private async oauthRequest(path: string, body: Record<string, string>): Promise<unknown> {
    const res = await fetch(`${this.oauthBase}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      throw new GitHubApiError(res.status, `GitHub OAuth request failed (${res.status})`);
    }
    return res.json();
  }
}
