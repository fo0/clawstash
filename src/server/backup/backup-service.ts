import crypto from 'crypto';
import type { BackupLogEntry, BackupTrigger, ClawStashDB, Stash } from '../db';
import { decryptSecret, encryptSecret, redactSecrets } from './backup-crypto';
import { GitHubApiError, GitHubClient, type TreeEntry } from './github-client';

/**
 * GitHub backup sync engine (refs #108).
 *
 * Mirrors stashes into a configured GitHub repository via the Git Data API:
 * one commit per changed stash (`stash: <action> <name>`), chained onto the
 * branch head, with a single ref update per run. Change detection is a
 * SHA-256 content hash per stash, so a run with no changes performs no
 * GitHub write calls at all (idempotent).
 *
 * Conflict policy: last-writer-wins. On a non-fast-forward ref update the
 * run re-reads the branch head and rebuilds its commits on top — ClawStash
 * is the source of truth for the mirrored paths.
 *
 * Repo layout (under the configured path prefix, default `stashes`):
 *   <prefix>/INDEX.md                  — human-readable index
 *   <prefix>/<stash-id>/stash.json     — metadata envelope
 *   <prefix>/<stash-id>/files/<name>   — raw file contents
 */

// === Settings storage keys (app_settings table) ===
const SETTINGS_KEY = 'github_backup_settings';
const TOKEN_KEY = 'github_backup_token';
const CONNECTION_KEY = 'github_backup_connection';
const HEALTH_KEY = 'github_backup_health';

/** Consecutive failed runs after which the status surface reports unhealthy. */
export const BACKUP_UNHEALTHY_THRESHOLD = 3;

const MAX_REF_UPDATE_ATTEMPTS = 3;

export const BACKUP_INTERVAL_PRESETS = [0, 5, 15, 60, 360, 1440] as const;

export interface BackupSettings {
  enabled: boolean;
  repoOwner: string;
  repoName: string;
  branch: string;
  pathPrefix: string;
  intervalMinutes: number;
  deleteMode: 'remove' | 'keep';
  commitAuthorName: string;
  commitAuthorEmail: string;
  oauthClientId: string;
}

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  enabled: false,
  repoOwner: '',
  repoName: '',
  branch: 'main',
  pathPrefix: 'stashes',
  intervalMinutes: 0,
  deleteMode: 'remove',
  commitAuthorName: 'ClawStash Backup',
  commitAuthorEmail: 'backup@clawstash.local',
  oauthClientId: '',
};

export interface BackupConnection {
  method: 'oauth' | 'pat';
  login: string;
  connectedAt: string;
}

export interface BackupHealth {
  consecutiveFailures: number;
  lastRunAt: string | null;
  lastRunStatus: 'success' | 'error' | 'skipped' | null;
  lastError: string | null;
}

const DEFAULT_HEALTH: BackupHealth = {
  consecutiveFailures: 0,
  lastRunAt: null,
  lastRunStatus: null,
  lastError: null,
};

export interface RunBackupOptions {
  /** Restrict the run to these stashes (pending deletions are always processed). */
  stashIds?: string[];
  /** Re-push even when the content hash is unchanged. */
  force?: boolean;
}

export interface BackupRunResult {
  status: 'success' | 'error' | 'skipped' | 'not_configured';
  message: string;
  synced: number;
  removed: number;
  commitSha: string | null;
}

// === Settings / connection / health persistence ===

export function readBackupSettings(db: ClawStashDB): BackupSettings {
  const raw = db.getAppSetting(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_BACKUP_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<BackupSettings>;
    return { ...DEFAULT_BACKUP_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_BACKUP_SETTINGS };
  }
}

export function writeBackupSettings(db: ClawStashDB, settings: BackupSettings): void {
  db.setAppSetting(SETTINGS_KEY, JSON.stringify(settings));
}

export function readBackupConnection(db: ClawStashDB): BackupConnection | null {
  const raw = db.getAppSetting(CONNECTION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BackupConnection;
  } catch {
    return null;
  }
}

export function storeBackupToken(
  db: ClawStashDB,
  token: string,
  connection: BackupConnection,
): void {
  db.setAppSetting(TOKEN_KEY, encryptSecret(token));
  db.setAppSetting(CONNECTION_KEY, JSON.stringify(connection));
}

export function clearBackupToken(db: ClawStashDB): void {
  db.deleteAppSetting(TOKEN_KEY);
  db.deleteAppSetting(CONNECTION_KEY);
}

/**
 * Decrypted backup token, or null when unset. A token that fails to decrypt
 * (changed encryption key) is treated as disconnected rather than fatal.
 */
export function readBackupToken(db: ClawStashDB): string | null {
  const raw = db.getAppSetting(TOKEN_KEY);
  if (!raw) return null;
  try {
    return decryptSecret(raw);
  } catch {
    console.error(
      '[backup] stored GitHub token could not be decrypted (encryption key changed?) — reconnect required',
    );
    return null;
  }
}

export function readBackupHealth(db: ClawStashDB): BackupHealth {
  const raw = db.getAppSetting(HEALTH_KEY);
  if (!raw) return { ...DEFAULT_HEALTH };
  try {
    return { ...DEFAULT_HEALTH, ...(JSON.parse(raw) as Partial<BackupHealth>) };
  } catch {
    return { ...DEFAULT_HEALTH };
  }
}

function writeBackupHealth(db: ClawStashDB, patch: Partial<BackupHealth>): void {
  db.setAppSetting(HEALTH_KEY, JSON.stringify({ ...readBackupHealth(db), ...patch }));
}

export function isBackupConfigured(db: ClawStashDB): boolean {
  const settings = readBackupSettings(db);
  return Boolean(readBackupToken(db) && settings.repoOwner && settings.repoName);
}

// === Content hashing / repo layout ===

/**
 * Stable content hash per stash. Excludes `version` and timestamps on
 * purpose: a no-op update (same content, bumped version) is not a logical
 * change and must not produce a commit. File order follows sort_order
 * (getStash returns files ordered).
 */
export function computeStashContentHash(stash: Stash): string {
  const payload = JSON.stringify({
    name: stash.name,
    description: stash.description,
    tags: stash.tags,
    metadata: stash.metadata,
    archived: stash.archived,
    files: stash.files.map((f) => [f.filename, f.language, f.content]),
  });
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function normalizePathPrefix(prefix: string): string {
  return prefix
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join('/');
}

function joinRepoPath(prefix: string, ...parts: string[]): string {
  return [prefix, ...parts].filter((p) => p.length > 0).join('/');
}

function buildStashEnvelope(stash: Stash): string {
  const envelope = {
    id: stash.id,
    name: stash.name,
    description: stash.description,
    tags: stash.tags,
    metadata: stash.metadata,
    version: stash.version,
    archived: stash.archived,
    created_at: stash.created_at,
    updated_at: stash.updated_at,
    files: stash.files.map((f) => ({
      filename: f.filename,
      language: f.language,
      sort_order: f.sort_order,
      size: f.content.length,
    })),
  };
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

/**
 * Tree entries for one stash: envelope + raw files, plus deletions for
 * files that exist in the repo but no longer in the stash.
 */
function stashTreeEntries(stash: Stash, prefix: string, existingPaths: Set<string>): TreeEntry[] {
  const dir = joinRepoPath(prefix, stash.id);
  const entries: TreeEntry[] = [{ path: `${dir}/stash.json`, content: buildStashEnvelope(stash) }];
  const currentPaths = new Set<string>([`${dir}/stash.json`]);
  for (const file of stash.files) {
    // Filenames are validated at the trust boundary (isValidFilename: no
    // path separators, no '..'), so they are safe as single git path
    // segments.
    const p = `${dir}/files/${file.filename}`;
    currentPaths.add(p);
    entries.push({ path: p, content: file.content });
  }
  for (const p of existingPaths) {
    if (p.startsWith(`${dir}/`) && !currentPaths.has(p)) {
      entries.push({ path: p, sha: null });
    }
  }
  return entries;
}

function removalTreeEntries(
  stashId: string,
  prefix: string,
  existingPaths: Set<string>,
): TreeEntry[] {
  const dir = joinRepoPath(prefix, stashId);
  const entries: TreeEntry[] = [];
  for (const p of existingPaths) {
    if (p.startsWith(`${dir}/`)) entries.push({ path: p, sha: null });
  }
  return entries;
}

function buildIndexMarkdown(stashes: { id: string; name: string }[], generatedAt: string): string {
  const sorted = [...stashes].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  const lines = [
    '# ClawStash Backup',
    '',
    `Mirrored by [ClawStash](https://github.com/fo0/clawstash) GitHub backup. Last sync: ${generatedAt}.`,
    '',
    '| Stash | Directory |',
    '| ----- | --------- |',
  ];
  for (const s of sorted) {
    const name = (s.name || '(unnamed)').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
    lines.push(`| ${name} | [\`${s.id}\`](./${s.id}/stash.json) |`);
  }
  return `${lines.join('\n')}\n`;
}

// === Sync run ===

interface PlannedChange {
  id: string;
  name: string;
  action: 'create' | 'update';
  hash: string;
  stash: Stash;
  commitSha: string | null;
}

interface PlannedRemoval {
  id: string;
  name: string;
  commitSha: string | null;
  filesKept: boolean;
}

export async function runBackupSync(
  db: ClawStashDB,
  trigger: BackupTrigger,
  opts: RunBackupOptions = {},
): Promise<BackupRunResult> {
  const startedAt = new Date().toISOString();
  const settings = readBackupSettings(db);
  const token = readBackupToken(db);

  if (!token || !settings.repoOwner || !settings.repoName) {
    return {
      status: 'not_configured',
      message: 'GitHub backup is not configured (connect an account and choose a repository)',
      synced: 0,
      removed: 0,
      commitSha: null,
    };
  }
  // The master switch gates automatic syncs only — an explicit manual
  // "Back up now" still works while automation is paused.
  if (trigger !== 'manual' && !settings.enabled) {
    return {
      status: 'not_configured',
      message: 'GitHub backup is disabled',
      synced: 0,
      removed: 0,
      commitSha: null,
    };
  }

  const runId = crypto.randomUUID();
  const scope = opts.stashIds && opts.stashIds.length > 0 ? new Set(opts.stashIds) : null;

  // --- Plan: detect changes + removals ---
  const candidates = db.listBackupCandidates();
  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  const states = db.listBackupStates();
  const stateById = new Map(states.map((s) => [s.stash_id, s]));

  const changes: PlannedChange[] = [];
  for (const candidate of candidates) {
    if (!candidate.backup_enabled) continue;
    if (scope && !scope.has(candidate.id)) continue;
    const stash = db.getStash(candidate.id);
    if (!stash) continue;
    const hash = computeStashContentHash(stash);
    const state = stateById.get(candidate.id);
    if (!state || state.content_hash !== hash || opts.force) {
      changes.push({
        id: candidate.id,
        name: stash.name,
        action: state?.last_synced_at ? 'update' : 'create',
        hash,
        stash,
        commitSha: null,
      });
    } else if (state.state !== 'idle' && !state.pending_delete) {
      // Content is identical to the last sync but the row is stuck in
      // pending/error (e.g. a no-op update marked it). Normalize to idle
      // without touching the repo.
      db.recordBackupSuccess(candidate.id, {
        stashName: stash.name,
        contentHash: hash,
        commitSha: state.last_commit_sha,
        syncedAt: state.last_synced_at ?? startedAt,
      });
    }
  }
  changes.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  const removals: PlannedRemoval[] = [];
  for (const state of states) {
    const candidate = candidateById.get(state.stash_id);
    if (state.pending_delete || !candidate) {
      // Explicit deletions (and rows whose stash vanished, e.g. deleted via
      // the stdio MCP process) are processed regardless of run scope.
      removals.push({
        id: state.stash_id,
        name: state.stash_name || state.stash_id,
        commitSha: null,
        filesKept: false,
      });
    } else if (!candidate.backup_enabled && state.last_synced_at) {
      // Opted out after having been synced → remove the mirrored copy.
      if (scope && !scope.has(state.stash_id)) continue;
      removals.push({
        id: state.stash_id,
        name: state.stash_name || candidate.name,
        commitSha: null,
        filesKept: false,
      });
    }
  }

  const finishRun = (
    status: 'success' | 'error' | 'skipped',
    message: string,
    commitSha: string | null,
    perStashEntries: Omit<
      BackupLogEntry,
      'id' | 'run_id' | 'trigger' | 'started_at' | 'finished_at'
    >[],
  ): void => {
    const finishedAt = new Date().toISOString();
    const base = { run_id: runId, trigger, started_at: startedAt, finished_at: finishedAt };
    db.insertBackupLogEntries([
      ...perStashEntries.map((e) => ({ ...base, ...e })),
      {
        ...base,
        stash_id: null,
        stash_name: null,
        status,
        action: null,
        message,
        commit_sha: commitSha,
      },
    ]);
  };

  if (changes.length === 0 && removals.length === 0) {
    writeBackupHealth(db, { lastRunAt: startedAt, lastRunStatus: 'skipped' });
    finishRun('skipped', 'No changes', null, []);
    return { status: 'skipped', message: 'No changes', synced: 0, removed: 0, commitSha: null };
  }

  db.setBackupStatesSyncing(changes.map((c) => c.id));

  const client = new GitHubClient(token);
  const { repoOwner: owner, repoName: repo, branch } = settings;
  const prefix = normalizePathPrefix(settings.pathPrefix);
  const author = { name: settings.commitAuthorName, email: settings.commitAuthorEmail };

  // INDEX.md reflects the repo content after this run: everything already
  // synced (minus removals) plus the stashes synced now.
  const removalIds = new Set(removals.map((r) => r.id));
  const indexStashes = new Map<string, string>();
  for (const state of states) {
    if (state.last_synced_at && !removalIds.has(state.stash_id)) {
      indexStashes.set(state.stash_id, state.stash_name);
    }
  }
  for (const change of changes) {
    indexStashes.set(change.id, change.name);
  }
  const indexEntry: TreeEntry = {
    path: joinRepoPath(prefix, 'INDEX.md'),
    content: buildIndexMarkdown(
      [...indexStashes].map(([id, name]) => ({ id, name })),
      startedAt,
    ),
  };

  try {
    let lastCommitSha: string | null = null;

    for (let attempt = 1; ; attempt++) {
      const headSha = await client.getBranchHeadSha(owner, repo, branch);
      let baseTreeSha = headSha ? await client.getCommitTreeSha(owner, repo, headSha) : undefined;
      let existingPaths = new Set<string>();
      if (baseTreeSha) {
        const tree = await client.getTreePaths(owner, repo, baseTreeSha);
        existingPaths = tree.paths;
        if (tree.truncated) {
          // Without the full path list we cannot compute stale-file
          // deletions safely; additions/updates still work.
          console.warn(
            '[backup] repo tree listing truncated — stale file cleanup skipped this run',
          );
        }
      }

      // Build the commit plan against the current head.
      const commitPlans: {
        message: string;
        entries: TreeEntry[];
        record: (sha: string) => void;
      }[] = [];
      for (const change of changes) {
        commitPlans.push({
          message: `stash: ${change.action} ${change.name || change.id}`,
          entries: stashTreeEntries(change.stash, prefix, existingPaths),
          record: (sha) => {
            change.commitSha = sha;
          },
        });
      }
      for (const removal of removals) {
        const entries = removalTreeEntries(removal.id, prefix, existingPaths);
        if (settings.deleteMode === 'keep' || entries.length === 0) {
          // Nothing to commit — either by policy or already absent.
          removal.filesKept = settings.deleteMode === 'keep' && entries.length > 0;
          continue;
        }
        commitPlans.push({
          message: `stash: delete ${removal.name || removal.id}`,
          entries,
          record: (sha) => {
            removal.commitSha = sha;
          },
        });
      }

      if (commitPlans.length === 0) break; // state-only cleanup, no commits

      commitPlans[commitPlans.length - 1].entries.push(indexEntry);

      let parentSha = headSha;
      for (const plan of commitPlans) {
        const treeSha = await client.createTree(owner, repo, plan.entries, baseTreeSha);
        const commitSha = await client.createCommit(owner, repo, {
          message: plan.message,
          treeSha,
          parents: parentSha ? [parentSha] : [],
          author,
        });
        plan.record(commitSha);
        parentSha = commitSha;
        baseTreeSha = treeSha;
        lastCommitSha = commitSha;
      }

      try {
        if (headSha) {
          await client.updateRef(owner, repo, branch, parentSha as string);
        } else {
          await client.createRef(owner, repo, branch, parentSha as string);
        }
        break;
      } catch (err) {
        // 422 = non-fast-forward (concurrent push) or ref already created.
        // Last-writer-wins: re-read the head and rebuild our commits on top.
        if (
          err instanceof GitHubApiError &&
          err.status === 422 &&
          attempt < MAX_REF_UPDATE_ATTEMPTS
        ) {
          continue;
        }
        throw err;
      }
    }

    // --- Persist success ---
    const syncedAt = new Date().toISOString();
    const perStashEntries: Omit<
      BackupLogEntry,
      'id' | 'run_id' | 'trigger' | 'started_at' | 'finished_at'
    >[] = [];
    for (const change of changes) {
      db.recordBackupSuccess(change.id, {
        stashName: change.name,
        contentHash: change.hash,
        commitSha: change.commitSha,
        syncedAt,
      });
      perStashEntries.push({
        stash_id: change.id,
        stash_name: change.name,
        status: 'success',
        action: change.action,
        message: '',
        commit_sha: change.commitSha,
      });
    }
    for (const removal of removals) {
      db.deleteBackupState(removal.id);
      perStashEntries.push({
        stash_id: removal.id,
        stash_name: removal.name,
        status: 'success',
        action: 'delete',
        message: removal.filesKept ? 'Files kept in repo (delete mode: keep)' : '',
        commit_sha: removal.commitSha,
      });
    }

    writeBackupHealth(db, {
      consecutiveFailures: 0,
      lastRunAt: syncedAt,
      lastRunStatus: 'success',
      lastError: null,
    });
    const message = `Synced ${changes.length} stash(es), removed ${removals.length}`;
    finishRun('success', message, lastCommitSha, perStashEntries);
    return {
      status: 'success',
      message,
      synced: changes.length,
      removed: removals.length,
      commitSha: lastCommitSha,
    };
  } catch (err) {
    const message = redactSecrets(err instanceof Error ? err.message : String(err), [token]);
    db.recordBackupErrors(
      changes.map((c) => c.id),
      message,
    );
    const previous = readBackupHealth(db);
    writeBackupHealth(db, {
      consecutiveFailures: previous.consecutiveFailures + 1,
      lastRunAt: startedAt,
      lastRunStatus: 'error',
      lastError: message,
    });
    finishRun('error', message, null, []);
    return { status: 'error', message, synced: 0, removed: 0, commitSha: null };
  }
}
