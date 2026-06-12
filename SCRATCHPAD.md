# Scratchpad -- Short-Term

Temporary working context. **Clean up aggressively -- delete when resolved.**

## Current Work

**Issue #108 — GitHub repo integration for stash backup** (branch `claude/lucid-johnson-2t7pwi`)

User decisions (2026-06-12):

- Auth: GitHub OAuth **Device Flow login** ("Sign in with GitHub", user supplies own OAuth App client ID — no secret, no callback URL) **plus PAT field** as headless fallback.
- GitHub login is for the backup connection only — **no admin SSO** (would be a separate issue).

Design decisions:

- **Sync engine:** GitHub Git Data API (blobs → trees → commits → ref update) via global `fetch`. No new runtime deps, no git binary in the container.
- **Repo layout:** `<prefix>/<stash-id>/stash.json` (JSON envelope: name, description, tags, metadata, timestamps, files list) + `<prefix>/<stash-id>/files/<filename>` (raw content) + `<prefix>/INDEX.md` (human-readable index). Default prefix `stashes`.
- **Change detection:** SHA-256 content hash per stash in `backup_stash_state`; sync is a no-op when nothing changed (idempotent).
- **Commit granularity:** one commit per changed stash per sync run (`stash: create|update|delete <name>`), commits chained, single ref update per run. INDEX.md refreshed in the final commit.
- **Deletions:** `delete_mode` setting: `remove` (default, removal commit) | `keep` (leave files in repo).
- **Triggers:** scheduler tick (presets off/5m/15m/1h/6h/24h stored as minutes), debounced mutation hook (~10 s) registered as DB-level callback, manual sync (global + per stash).
- **Scheduler:** in-process, `globalThis` singleton (HMR-safe), started from `instrumentation.ts`.
- **Status/observability:** per-stash state (idle/pending/syncing/error + last_synced_at + last_commit_sha + last_error), global `backup_log` table (capped), consecutive-failure counter → health indicator.
- **Security:** token AES-256-GCM-encrypted at rest (key auto-generated under `data/`, optional env override), token never returned by API (only `tokenSet` + account login), redaction helper strips token from errors/logs.
- **Per-stash opt-out:** `backup_enabled` column on stashes (default on).

Issue open questions resolved: device-flow+PAT (GitHub App = follow-up), per-stash commits (no batch coalescing), file format = envelope + raw files.

## Open Questions

_(None)_

## Research Notes

_(None)_

## Temporary Notes

- Out of scope (per issue): restore-from-repo, multi-repo, pull sync, at-rest encryption inside the backup repo.
