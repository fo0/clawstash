export interface StashFile {
  id: string;
  stash_id: string;
  filename: string;
  content: string;
  language: string;
  sort_order: number;
}

export interface Stash {
  id: string;
  name: string;
  description: string;
  tags: string[];
  metadata: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
  files: StashFile[];
}

export interface StashListItem {
  id: string;
  name: string;
  description: string;
  tags: string[];
  version: number;
  created_at: string;
  updated_at: string;
  total_size: number;
  files: { filename: string; language: string; size: number }[];
}

export interface StashListResponse {
  stashes: StashListItem[];
  total: number;
}

export interface CreateStashInput {
  name?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  files: { filename: string; content: string; language?: string }[];
}

export interface UpdateStashInput {
  name?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  files?: { filename: string; content: string; language?: string }[];
}

export interface AccessLogEntry {
  id: string;
  stash_id: string;
  source: 'api' | 'mcp' | 'ui';
  action: string;
  timestamp: string;
  ip?: string;
  user_agent?: string;
}

export interface TagInfo {
  tag: string;
  count: number;
}

export interface Stats {
  totalStashes: number;
  totalFiles: number;
  topLanguages: { language: string; count: number }[];
}

export interface FileInput {
  filename: string;
  content: string;
  language: string;
}

export type ViewMode = 'home' | 'view' | 'edit' | 'new' | 'settings' | 'graph';
export type LayoutMode = 'grid' | 'list';
export type SettingsSection = 'welcome' | 'general' | 'api' | 'storage' | 'about';
export type ApiTab = 'tokens' | 'rest' | 'mcp';
export type TokenScope = 'read' | 'write' | 'admin' | 'mcp';

export interface TokenListItem {
  id: string;
  label: string;
  tokenPrefix: string;
  scopes: TokenScope[];
  createdAt: string;
}

export interface NewlyCreatedToken {
  id: string;
  token: string;
  label: string;
  scopes: TokenScope[];
}

export interface AdminSessionInfo {
  authenticated: boolean;
  authRequired: boolean;
  source?: string;
  scopes?: string[];
  expiresAt?: string | null;
}

export interface AdminLoginResponse {
  token: string;
  expiresAt: string | null;
}

export interface TagGraphNode {
  tag: string;
  count: number;
}

export interface TagGraphEdge {
  source: string;
  target: string;
  weight: number;
}

export interface TagGraphResult {
  nodes: TagGraphNode[];
  edges: TagGraphEdge[];
  stash_count: number;
  filter?: { tag: string; depth: number };
}

export interface StashGraphNode {
  id: string;
  type: 'stash' | 'tag' | 'version';
  label: string;
  created_at?: string;
  updated_at?: string;
  version?: number;
  file_count?: number;
  total_size?: number;
  tags?: string[];
  count?: number;
  version_number?: number;
  created_by?: string;
  change_summary?: Record<string, unknown>;
}

export interface StashGraphEdge {
  source: string;
  target: string;
  type: 'has_tag' | 'shared_tags' | 'version_of' | 'temporal_proximity';
  weight: number;
  metadata?: {
    shared_tags?: string[];
    time_delta_hours?: number;
  };
}

export interface StashGraphResult {
  nodes: StashGraphNode[];
  edges: StashGraphEdge[];
  time_range: { min: string; max: string };
  total_stashes: number;
}

export interface StashVersionListItem {
  id: string;
  stash_id: string;
  name: string;
  description: string;
  version: number;
  created_by: string;
  created_at: string;
  file_count: number;
  total_size: number;
}

export interface StashVersionFile {
  filename: string;
  content: string;
  language: string;
  sort_order: number;
}

export interface StashVersion {
  id: string;
  stash_id: string;
  name: string;
  description: string;
  tags: string[];
  metadata: Record<string, unknown>;
  version: number;
  created_by: string;
  created_at: string;
  files: StashVersionFile[];
}
