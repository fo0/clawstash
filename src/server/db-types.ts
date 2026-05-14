// Type and interface declarations for the ClawStashDB layer. Extracted from
// db.ts (Round 1/3 — refs #129) so the data model is independently
// reviewable and so tests / stores can import types without pulling the
// whole 1800-LoC database class.
//
// These declarations are pure type artifacts — no runtime behaviour.

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
  archived: boolean;
  created_at: string;
  updated_at: string;
  files: StashFile[];
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

export interface StashFileInfo {
  filename: string;
  language: string;
  size: number;
}

export interface StashListItem {
  id: string;
  name: string;
  description: string;
  tags: string[];
  version: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
  total_size: number;
  files: StashFileInfo[];
}

export interface StashMeta {
  id: string;
  name: string;
  description: string;
  tags: string[];
  metadata: Record<string, unknown>;
  version: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
  total_size: number;
  files: StashFileInfo[];
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

export type TokenScope = 'read' | 'write' | 'admin' | 'mcp';

export interface ApiToken {
  id: string;
  label: string;
  token_hash: string;
  token_prefix: string;
  scopes: TokenScope[];
  created_at: string;
}

export interface ApiTokenListItem {
  id: string;
  label: string;
  tokenPrefix: string;
  scopes: TokenScope[];
  createdAt: string;
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
  // When set alongside content fields, the archive flag flip is applied
  // inside the SAME transaction as the content update, so a thrown content
  // update cannot leave the archive flag flipped (or vice-versa). When set
  // alone, callers should use `archiveStash()` instead — that path skips
  // the version snapshot per the documented archive semantics.
  archived?: boolean;
}

export interface ListStashesOptions {
  search?: string;
  tag?: string;
  archived?: boolean;
  page?: number;
  limit?: number;
}

export interface SearchStashItem extends StashListItem {
  relevance: number;
  snippets?: Record<string, string>;
}

export interface SearchStashesResult {
  stashes: SearchStashItem[];
  total: number;
  query: string;
}

export interface TagGraphOptions {
  tag?: string;
  depth?: number;
  min_weight?: number;
  min_count?: number;
  limit?: number;
}

export interface TagGraphResult {
  nodes: { tag: string; count: number }[];
  edges: { source: string; target: string; weight: number }[];
  stash_count: number;
  filter?: { tag: string; depth: number };
}

export interface StashGraphOptions {
  mode?: 'relations' | 'timeline' | 'versions';
  since?: string;
  until?: string;
  tag?: string;
  limit?: number;
  include_versions?: boolean;
  min_shared_tags?: number;
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
