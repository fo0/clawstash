import type { Stash, StashListResponse, CreateStashInput, UpdateStashInput, TagInfo, Stats, AccessLogEntry, TokenListItem, NewlyCreatedToken, TokenScope, AdminSessionInfo, AdminLoginResponse, TagGraphResult } from './types';

const BASE = '/api/stashes';

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

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

export const api = {
  listStashes(params?: { search?: string; tag?: string; page?: number; limit?: number }): Promise<StashListResponse> {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.tag) qs.set('tag', params.tag);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    return request(`${BASE}${qs.toString() ? `?${qs}` : ''}`, { headers: getHeaders() });
  },

  getStash(id: string): Promise<Stash> {
    return request(`${BASE}/${id}`, { headers: getHeaders() });
  },

  createStash(input: CreateStashInput): Promise<Stash> {
    return request(BASE, { method: 'POST', headers: getHeaders(), body: JSON.stringify(input) });
  },

  updateStash(id: string, input: UpdateStashInput): Promise<Stash> {
    return request(`${BASE}/${id}`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify(input) });
  },

  deleteStash(id: string): Promise<void> {
    return request(`${BASE}/${id}`, { method: 'DELETE', headers: getHeaders() });
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
    return request(`${BASE}/${id}/access-log${qs}`, { headers: getHeaders() });
  },

  getTagGraph(params?: { tag?: string; depth?: number; min_weight?: number; min_count?: number; limit?: number }): Promise<TagGraphResult> {
    const qs = new URLSearchParams();
    if (params?.tag) qs.set('tag', params.tag);
    if (params?.depth) qs.set('depth', String(params.depth));
    if (params?.min_weight) qs.set('min_weight', String(params.min_weight));
    if (params?.min_count) qs.set('min_count', String(params.min_count));
    if (params?.limit) qs.set('limit', String(params.limit));
    return request(`${BASE}/graph${qs.toString() ? `?${qs}` : ''}`, { headers: getHeaders() });
  },

  // Token management
  listTokens(): Promise<{ tokens: TokenListItem[] }> {
    return request('/api/tokens', { headers: getHeaders() });
  },

  createToken(label: string, scopes: TokenScope[]): Promise<NewlyCreatedToken> {
    return request('/api/tokens', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ label, scopes }) });
  },

  deleteToken(id: string): Promise<void> {
    return request(`/api/tokens/${id}`, { method: 'DELETE', headers: getHeaders() });
  },

  // Admin auth
  adminLogin(password: string): Promise<AdminLoginResponse> {
    return request('/api/admin/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
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
    const res = await fetch('/api/mcp-spec');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  },

  // MCP tool summaries (structured, derived from server tool-defs.ts)
  getMcpTools(): Promise<Array<{ name: string; description: string }>> {
    return request('/api/mcp-tools');
  },
};
