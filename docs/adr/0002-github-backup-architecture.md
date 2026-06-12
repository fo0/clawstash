# ADR-0002: GitHub backup via Git Data API with device-flow login

- **Status:** Accepted
- **Date:** 2026-06-12
- **Decider(s):** fo0 (auth path), implementation session for #108
- **Tags:** backup, integration, security

## Context

Issue #108 asks for a GitHub repository as a backup target for stashes: configured once, then mirrored on a schedule, on mutations, and manually. Open questions were the auth path (GitHub App vs. PAT), commit granularity, the on-disk format in the repo, and how to push commits from a single-container Next.js app without bloating the image.

The user explicitly wanted a "login with GitHub, then pick a repo" experience. ClawStash is self-hosted (often on `localhost` or a LAN address), so any redirect-based OAuth flow would require a per-instance callback URL registered on GitHub — brittle and confusing.

## Decision

We will implement the backup with:

1. **Auth: OAuth device flow + PAT fallback.** "Sign in with GitHub" uses the device flow against a user-created OAuth app (client ID only — no secret, no callback URL, works on localhost). A PAT field remains for headless/minimal-scope setups. GitHub App auth is deferred.
2. **Sync engine: GitHub Git Data API over `fetch`** (blobs → trees → commits → ref update). No `git` binary in the image, no working tree, no new npm dependency. Multi-commit runs chain commits and update the ref once.
3. **Change detection: SHA-256 content hash per stash** persisted in a `backup_state` table; unchanged stashes cause zero API calls. Version/timestamps are excluded from the hash so no-op updates don't commit.
4. **Commit granularity: one commit per changed stash per run** (`stash: <create|update|delete> <name>`), also when the scheduler catches up on several changes.
5. **Repo format: JSON envelope + raw files** (`<prefix>/<id>/stash.json` + `<prefix>/<id>/files/<filename>`, plus a generated `<prefix>/INDEX.md`). Directories are keyed by immutable stash ID; the envelope carries the human name.
6. **Conflict policy: last-writer-wins** on the configured branch with a bounded retry that rebases the run onto the new head (422 non-fast-forward).
7. **Token storage: AES-256-GCM at rest** with a key from `CLAWSTASH_ENCRYPTION_KEY` or an auto-generated `data/.clawstash-key` file; responses/logs never carry the token, and stored error messages are redacted.
8. **Triggers: in-process scheduler** (globalThis singleton started from `src/instrumentation.ts`) + a DB-level mutation listener (covers REST, MCP HTTP, and import) with ~10 s debounce + manual endpoints. The stdio MCP process runs no scheduler; its writes are caught up by hash diffing.

## Consequences

### Positive

- Zero new runtime dependencies and no git binary in the Docker image.
- The device flow gives the requested login UX on any host without callback-URL setup.
- Hash-based planning makes every trigger idempotent and cheap when idle.
- DB-level mutation events benefit any future feature needing change notifications.

### Negative / Trade-offs

- OAuth-app tokens carry the coarse `repo` scope; minimal scoping requires the PAT path (documented).
- Users must create their own OAuth app once (self-hosted ClawStash has no central client ID).
- Git Data API chained commits are not atomic with the ref update; a crash mid-run leaves unreferenced objects on GitHub (harmless, GC'd) and the run retries cleanly.
- Mutations via the stdio MCP server only sync on the next scheduled/manual run.

### Neutral

- `app_settings` is a new generic key/value table; future instance-level settings should reuse it.
- The encryption key file lives in the data volume; volume backups therefore include it (documented in docs/backup.md).

## Alternatives Considered

- **GitHub App auth** — better security and rate limits, but installation flow + private-key handling is heavy for self-hosted bootstrap; deferred as follow-up.
- **Redirect-based OAuth web flow** — needs a client secret and a fixed callback URL per instance; breaks on localhost/changing hosts.
- **Shelling out to `git`** — requires git in the image, a persistent clone in the volume, and state repair logic; the Git Data API is stateless.
- **Coalesced batch commits per run** — fewer commits, but loses the per-change history that motivates the feature.
- **Raw-files-only format (no envelope)** — loses tags/metadata/description in the mirror; envelope+raw keeps both machine- and human-readable views.

## References

- Issue: https://github.com/fo0/clawstash/issues/108
- Implementation: `src/server/backup/`, `src/server/stores/backup-store.ts`, migration v10 in `src/server/db-migrations.ts`
- User-facing docs: `docs/backup.md`
