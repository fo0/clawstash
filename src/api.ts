import type {
  Stash,
  StashListResponse,
  CreateStashInput,
  UpdateStashInput,
  TagInfo,
  Stats,
  AccessLogEntry,
  TokenListItem,
  NewlyCreatedToken,
  TokenScope,
  AdminSessionInfo,
  AdminLoginResponse,
  TagGraphResult,
  StashGraphResult,
  StashVersionListItem,
  StashVersion,
  BackupSettings,
  BackupSettingsResponse,
  BackupRepoInfo,
  BackupBranchesResponse,
  BackupDeviceStartResponse,
  BackupDevicePollResponse,
  BackupStatusResponse,
  BackupLogEntry,
  BackupRunResult,
  VersionResponse,
} from './types';

const BASE = '/api/stashes';

/**
 * Encode a value for use as a single URL path segment.
 *
 * Stash and token ids are server-generated UUIDs and versions are numbers, so
 * this is a no-op for every call the app makes today. It is here because
 * interpolating an unescaped value into a path is a latent bug the moment an
 * id can carry `/`, `?` or `#` — and because `getBackupStatus` already encodes
 * its query parameter, so the path segments were the one inconsistent surface.
 */
const seg = (value: string | number): string => encodeURIComponent(String(value));

/**
 * Default per-request timeout for every call in this module (refs #535).
 *
 * Without one, a proxy that accepts a connection and then goes silent leaves
 * the UI spinning forever — `fetch` has no built-in timeout. Ten seconds is
 * comfortably above a healthy local round-trip while still failing fast enough
 * that a user sees an error instead of a hang.
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

/**
 * Multiplier applied to the base timeout for calls that are legitimately slow:
 * full data export/import (a ZIP of the whole database) and everything that
 * makes ClawStash talk to the GitHub API on the caller's behalf. These share
 * the single env var rather than adding a second knob.
 */
const SLOW_CALL_FACTOR = 6;

/**
 * Resolve `NEXT_PUBLIC_CLAWSTASH_FETCH_TIMEOUT_MS` into an effective timeout.
 *
 * - unset / empty -> `DEFAULT_FETCH_TIMEOUT_MS`
 * - `0` -> no timeout (today's behaviour: wait forever)
 * - any other non-negative integer -> that many milliseconds
 * - anything else (negative, fractional, NaN, `"abc"`) -> the default
 */
export function resolveFetchTimeoutMs(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_FETCH_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return DEFAULT_FETCH_TIMEOUT_MS;
  return parsed;
}

// Read once at module scope. This is a client module, so Next.js inlines the
// `NEXT_PUBLIC_*` member access at build time — the value is fixed for the
// lifetime of the bundle (see docs/deployment.md → Environment Variables).
export const FETCH_TIMEOUT_MS = resolveFetchTimeoutMs(
  process.env.NEXT_PUBLIC_CLAWSTASH_FETCH_TIMEOUT_MS,
);

/** Timeout for the slow calls described on `SLOW_CALL_FACTOR`. 0 stays 0. */
const SLOW_FETCH_TIMEOUT_MS = FETCH_TIMEOUT_MS === 0 ? 0 : FETCH_TIMEOUT_MS * SLOW_CALL_FACTOR;

/**
 * Thrown when a request exceeded its timeout, so callers can tell "the server
 * never answered" apart from "the server answered with an error". A typed
 * error, never an unhandled rejection from an aborted `fetch`.
 */
export class ApiTimeoutError extends Error {
  readonly url: string;
  readonly timeoutMs: number;

  constructor(url: string, timeoutMs: number) {
    super(`Request timed out after ${timeoutMs} ms: ${url}`);
    this.name = 'ApiTimeoutError';
    this.url = url;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * `fetch` with a deadline. `AbortSignal.timeout` rejects the request with a
 * `TimeoutError` DOMException, which is translated into `ApiTimeoutError`;
 * every other rejection (offline, DNS, a caller-supplied abort) passes
 * through untouched. `timeoutMs === 0` disables the deadline.
 *
 * Exported so tests can drive the timeout path directly.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<Response> {
  if (timeoutMs <= 0) return fetch(url, init);

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  // Preserve a caller-supplied signal instead of dropping it: whichever fires
  // first wins. `AbortSignal.any` is baseline in every runtime this app
  // supports (Node >= 20.9, and the browsers Next.js 16 targets).
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;

  try {
    return await fetch(url, { ...init, signal });
  } catch (err) {
    // Only the deadline produces a TimeoutError here; a caller abort is an
    // AbortError and stays the caller's business.
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new ApiTimeoutError(url, timeoutMs);
    }
    throw err;
  }
}

let _authToken = '';

export function setAuthToken(token: string) {
  _authToken = token;
}

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Access-Source': 'ui',
  };
  if (_authToken) {
    h['Authorization'] = `Bearer ${_authToken}`;
  }
  return h;
}

async function request<T>(url: string, init?: RequestInit, timeoutMs?: number): Promise<T>;
async function request(url: string, init?: RequestInit, timeoutMs?: number): Promise<unknown> {
  const res = await fetchWithTimeout(url, init, timeoutMs);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined;
  return res.json();
}

export const api = {
  listStashes(params?: {
    search?: string;
    tag?: string;
    archived?: boolean;
    page?: number;
    limit?: number;
  }): Promise<StashListResponse> {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.tag) qs.set('tag', params.tag);
    if (params?.archived !== undefined) qs.set('archived', String(params.archived));
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    return request(`${BASE}${qs.toString() ? `?${qs}` : ''}`, { headers: getHeaders() });
  },

  getStash(id: string): Promise<Stash> {
    return request(`${BASE}/${seg(id)}`, { headers: getHeaders() });
  },

  createStash(input: CreateStashInput): Promise<Stash> {
    return request(BASE, { method: 'POST', headers: getHeaders(), body: JSON.stringify(input) });
  },

  updateStash(id: string, input: UpdateStashInput): Promise<Stash> {
    return request(`${BASE}/${seg(id)}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(input),
    });
  },

  deleteStash(id: string): Promise<void> {
    return request(`${BASE}/${seg(id)}`, { method: 'DELETE', headers: getHeaders() });
  },

  archiveStash(id: string, archived: boolean): Promise<Stash> {
    return request(`${BASE}/${seg(id)}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ archived }),
    });
  },

  getTags(): Promise<TagInfo[]> {
    return request(`${BASE}/tags`, { headers: getHeaders() });
  },

  getStats(): Promise<Stats> {
    return request(`${BASE}/stats`, { headers: getHeaders() });
  },

  getMetadataKeys(): Promise<string[]> {
    return request(`${BASE}/metadata-keys`, { headers: getHeaders() });
  },

  getAccessLog(id: string, limit?: number): Promise<AccessLogEntry[]> {
    const qs = limit ? `?limit=${limit}` : '';
    return request(`${BASE}/${seg(id)}/access-log${qs}`, { headers: getHeaders() });
  },

  getVersions(id: string): Promise<StashVersionListItem[]> {
    return request(`${BASE}/${seg(id)}/versions`, { headers: getHeaders() });
  },

  getVersion(id: string, version: number): Promise<StashVersion> {
    return request(`${BASE}/${seg(id)}/versions/${seg(version)}`, { headers: getHeaders() });
  },

  getVersionDiff(
    id: string,
    v1: number,
    v2: number,
  ): Promise<{ v1: StashVersion; v2: StashVersion }> {
    return request(`${BASE}/${seg(id)}/versions/diff?v1=${seg(v1)}&v2=${seg(v2)}`, {
      headers: getHeaders(),
    });
  },

  restoreVersion(id: string, version: number): Promise<Stash> {
    return request(`${BASE}/${seg(id)}/versions/${seg(version)}/restore`, {
      method: 'POST',
      headers: getHeaders(),
    });
  },

  getTagGraph(params?: {
    tag?: string;
    depth?: number;
    min_weight?: number;
    min_count?: number;
    limit?: number;
  }): Promise<TagGraphResult> {
    const qs = new URLSearchParams();
    if (params?.tag) qs.set('tag', params.tag);
    if (params?.depth !== undefined) qs.set('depth', String(params.depth));
    if (params?.min_weight !== undefined) qs.set('min_weight', String(params.min_weight));
    if (params?.min_count !== undefined) qs.set('min_count', String(params.min_count));
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    return request(`${BASE}/graph${qs.toString() ? `?${qs}` : ''}`, { headers: getHeaders() });
  },

  getStashGraph(params?: {
    mode?: string;
    since?: string;
    until?: string;
    tag?: string;
    limit?: number;
    include_versions?: boolean;
    min_shared_tags?: number;
  }): Promise<StashGraphResult> {
    const qs = new URLSearchParams();
    if (params?.mode) qs.set('mode', params.mode);
    if (params?.since) qs.set('since', params.since);
    if (params?.until) qs.set('until', params.until);
    if (params?.tag) qs.set('tag', params.tag);
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    if (params?.include_versions !== undefined)
      qs.set('include_versions', String(params.include_versions));
    if (params?.min_shared_tags !== undefined)
      qs.set('min_shared_tags', String(params.min_shared_tags));
    return request(`${BASE}/graph/stashes${qs.toString() ? `?${qs}` : ''}`, {
      headers: getHeaders(),
    });
  },

  // Token management
  listTokens(): Promise<{ tokens: TokenListItem[] }> {
    return request('/api/tokens', { headers: getHeaders() });
  },

  createToken(label: string, scopes: TokenScope[]): Promise<NewlyCreatedToken> {
    return request('/api/tokens', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ label, scopes }),
    });
  },

  deleteToken(id: string): Promise<void> {
    return request(`/api/tokens/${seg(id)}`, { method: 'DELETE', headers: getHeaders() });
  },

  // Admin auth
  adminLogin(password: string): Promise<AdminLoginResponse> {
    return request('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
  },

  adminLogout(): Promise<void> {
    return request('/api/admin/logout', { method: 'POST', headers: getHeaders() });
  },

  adminCheckSession(): Promise<AdminSessionInfo> {
    return request('/api/admin/session', { headers: getHeaders() });
  },

  // OpenAPI
  getOpenApiSchema(): Promise<unknown> {
    return request('/api/openapi');
  },

  // MCP spec (text/markdown format with data types and tool schemas)
  async getMcpSpec(): Promise<string> {
    const res = await fetchWithTimeout('/api/mcp-spec');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  },

  // MCP tool summaries (structured, derived from server tool-defs.ts)
  getMcpTools(): Promise<Array<{ name: string; description: string }>> {
    return request('/api/mcp-tools');
  },

  // Data export (returns blob)
  async exportData(): Promise<Blob> {
    const headers: Record<string, string> = {};
    if (_authToken) {
      headers['Authorization'] = `Bearer ${_authToken}`;
    }
    // Whole-database ZIP — legitimately slow, so it gets the slow-call budget.
    const res = await fetchWithTimeout('/api/admin/export', { headers }, SLOW_FETCH_TIMEOUT_MS);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.blob();
  },

  // Data import (upload ZIP file)
  async importData(file: File): Promise<{
    message: string;
    imported: { stashes: number; files: number; versions: number; versionFiles: number };
  }> {
    const formData = new FormData();
    formData.append('file', file);
    const headers: Record<string, string> = {};
    if (_authToken) {
      headers['Authorization'] = `Bearer ${_authToken}`;
    }
    const res = await fetchWithTimeout(
      '/api/admin/import',
      { method: 'POST', headers, body: formData },
      SLOW_FETCH_TIMEOUT_MS,
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  // GitHub backup (refs #108)
  getBackupSettings(): Promise<BackupSettingsResponse> {
    return request('/api/backup/settings', { headers: getHeaders() });
  },

  saveBackupSettings(settings: BackupSettings): Promise<BackupSettingsResponse> {
    return request('/api/backup/settings', {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(settings),
    });
  },

  // Everything below that reaches GitHub on the server's behalf gets the
  // slow-call budget — a round-trip to api.github.com is not a local request.
  connectBackupPat(token: string): Promise<BackupSettingsResponse> {
    return request(
      '/api/backup/token',
      { method: 'POST', headers: getHeaders(), body: JSON.stringify({ token }) },
      SLOW_FETCH_TIMEOUT_MS,
    );
  },

  disconnectBackup(): Promise<BackupSettingsResponse> {
    return request('/api/backup/token', { method: 'DELETE', headers: getHeaders() });
  },

  startBackupDeviceFlow(clientId?: string): Promise<BackupDeviceStartResponse> {
    return request(
      '/api/backup/device/start',
      {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(clientId ? { clientId } : {}),
      },
      SLOW_FETCH_TIMEOUT_MS,
    );
  },

  pollBackupDeviceFlow(sessionId: string): Promise<BackupDevicePollResponse> {
    return request(
      '/api/backup/device/poll',
      { method: 'POST', headers: getHeaders(), body: JSON.stringify({ sessionId }) },
      SLOW_FETCH_TIMEOUT_MS,
    );
  },

  listBackupRepos(): Promise<{ repos: BackupRepoInfo[] }> {
    return request('/api/backup/github/repos', { headers: getHeaders() }, SLOW_FETCH_TIMEOUT_MS);
  },

  listBackupBranches(owner: string, repo: string): Promise<BackupBranchesResponse> {
    const qs = new URLSearchParams({ owner, repo });
    return request(
      `/api/backup/github/branches?${qs}`,
      { headers: getHeaders() },
      SLOW_FETCH_TIMEOUT_MS,
    );
  },

  triggerBackupSync(opts?: { stashId?: string; force?: boolean }): Promise<BackupRunResult> {
    return request(
      '/api/backup/sync',
      { method: 'POST', headers: getHeaders(), body: JSON.stringify(opts ?? {}) },
      SLOW_FETCH_TIMEOUT_MS,
    );
  },

  getBackupStatus(stashId?: string): Promise<BackupStatusResponse> {
    const qs = stashId ? `?stashId=${seg(stashId)}` : '';
    return request(`/api/backup/status${qs}`, { headers: getHeaders() });
  },

  getBackupLog(params?: { stashId?: string; limit?: number }): Promise<{
    entries: BackupLogEntry[];
  }> {
    const qs = new URLSearchParams();
    if (params?.stashId) qs.set('stashId', params.stashId);
    if (params?.limit) qs.set('limit', String(params.limit));
    return request(`/api/backup/log${qs.toString() ? `?${qs}` : ''}`, { headers: getHeaders() });
  },

  // Named `getBuildVersion` to stay distinct from `getVersion(id, version)`,
  // which fetches a stash's version history entry.
  getBuildVersion(): Promise<VersionResponse> {
    return request('/api/version', { headers: getHeaders() });
  },

  setStashBackupEnabled(id: string, enabled: boolean): Promise<Stash> {
    return request(`${BASE}/${seg(id)}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ backup_enabled: enabled }),
    });
  },
};
