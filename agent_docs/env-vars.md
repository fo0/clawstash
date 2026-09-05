# Environment Variables

Full environment-variable reference. CLAUDE.md carries only the 3-5 variables an agent must know; everything else lives here. Placeholders + comments: `.env.example`.

## All variables

| Variable                   | Description                                                                                                                                                                             | Default               | Required                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------- |
| `PORT`                     | Server port                                                                                                                                                                             | `3000`                | No                                      |
| `HOSTNAME`                 | Bind address of the production server (`server.js` reads `process.env.HOSTNAME \|\| '0.0.0.0'`). Docker sets it to the container id, so the `Dockerfile` overrides it back to `0.0.0.0` | `0.0.0.0`             | No                                      |
| `DATABASE_PATH`            | Path to SQLite database file                                                                                                                                                            | `./data/clawstash.db` | No                                      |
| `NODE_ENV`                 | Environment mode                                                                                                                                                                        | `development`         | No                                      |
| `ADMIN_PASSWORD`           | Admin password for login (unset = open access)                                                                                                                                          | --                    | No                                      |
| `ADMIN_SESSION_HOURS`      | Admin session duration in hours (0 = unlimited). Any value that is not a finite number >= 0 falls back to `24`                                                                          | `24`                  | No                                      |
| `TRUST_PROXY`              | Trust `X-Forwarded-*` headers (exactly `1` or `true` when behind nginx, Traefik, Cloudflare, etc.)                                                                                      | off                   | No (recommended behind a reverse proxy) |
| `CLAWSTASH_ENCRYPTION_KEY` | Key for secrets at rest (GitHub backup token), 64 hex chars. Unset = auto-generated key file next to the DB (`data/.clawstash-key`)                                                     | auto-generated        | No                                      |
| `STASH_VERSION_LIMIT`      | Snapshots kept per stash in `stash_versions`. `0` = unlimited (pruning off). **Deletes data** — see the note below                                                                      | `200`                 | No                                      |

> `CLAWSTASH_ENCRYPTION_KEY` is the only variable whose loss is unrecoverable: without it the encrypted GitHub-backup token cannot be read back. Back it up together with the database.

> `STASH_VERSION_LIMIT` is the only variable that deletes user data, so its blast radius is deliberately small (`src/server/stores/version-store.ts` -> `pruneVersions`). Pruning runs **only** while a new snapshot is being inserted for that one stash — `updateStash`, and `restoreStashVersion` through it — inside the caller's transaction, and never touches another stash. There is no start-up sweep, and no migration deletes rows (migrations stay append-only), so upgrading by itself removes nothing: a stash loses its oldest snapshots on its next update, and only once it holds more than the limit. `stash_version_files` rows follow via `ON DELETE CASCADE`. Every prune logs `[DB] Pruned N version snapshot(s) of stash <id> (STASH_VERSION_LIMIT=N)`. Set it to `0` to keep the pre-#535 unbounded behaviour. Admin import (`/api/admin/import`) writes version rows directly and is not pruned — a restored backup arrives intact.

> Both boolean-ish and numeric variables fail silently rather than loudly: `TRUST_PROXY` is an exact string compare against `'1'` / `'true'` (`src/server/auth-rate-limit.ts` -> `isTrustedProxy`, inlined again in `src/middleware.ts` -> `isHttpsRequest` because the Edge runtime cannot import that Node-only module -- change both together), so `yes` / `on` / `TRUE` leave forwarded headers untrusted; `ADMIN_SESSION_HOURS` (`src/server/auth.ts`) rejects NaN, negative and infinite values back to `24`. Verify the effective behaviour after setting them -- a typo looks like the default, not like an error.

## Client-bundle variables (inlined at build time)

| Variable                                 | Description                                                                                                                                 | Default | Required |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------- |
| `NEXT_PUBLIC_CLAWSTASH_FETCH_TIMEOUT_MS` | Deadline in ms for the web UI's own API requests (`src/api.ts`). `0` = no timeout. Export/import and GitHub-backed calls get 6x this budget | `10000` | No       |

> `NEXT_PUBLIC_*` values are inlined into the client bundle by Next.js, so this one is fixed at **build** time — changing it means rebuilding, not restarting. A request that exceeds the deadline rejects with a typed `ApiTimeoutError` (`src/api.ts`), never an unhandled abort. Same fail-safe parsing as the runtime variables: negative, fractional or non-numeric values fall back to `10000`.

## Build-time variables (CI / Docker only)

Read at **build** time, never at runtime: `scripts/generate-build-info.js` (the `prebuild` npm script) bakes them into `build-info.json`, which `src/server/version.ts` serves via `/api/version`. Unset locally, both fall back to the working tree's git information — the image has no `.git` directory, so CI passes them explicitly (`Dockerfile` `ARG`/`ENV`, set from `github.sha` / `github.ref_name` in `docker-publish.yml`).

| Variable           | Description                                                             | Default                           | Required |
| ------------------ | ----------------------------------------------------------------------- | --------------------------------- | -------- |
| `BUILD_COMMIT_SHA` | Commit the build came from; truncated to a 7-char short hash on display | `git rev-parse --short HEAD`      | No       |
| `BUILD_BRANCH`     | Branch name reported by the running container                           | `git rev-parse --abbrev-ref HEAD` | No       |

## Secrets Locations

| Secret class       | Where it lives                                                                     | Never commit |
| ------------------ | ---------------------------------------------------------------------------------- | ------------ |
| Local dev secrets  | `.env` (gitignored), template in `.env.example`                                    | Yes          |
| CI/CD secrets      | GitHub Actions secrets (`gh secret set`)                                           | Yes          |
| Production secrets | Deployment platform's secret store (Docker host env / orchestrator secret manager) | Yes          |
| Test fixtures      | Synthetic values only -- never real credentials                                    | Yes          |

Rules:

- New secret needed -> add to `.env.example` with placeholder + comment, document here, request from user.
- Never `gh secret set` from agent code without explicit user command.
- Audit step in the `security-review` skill scans for committed secrets (gitleaks / trufflehog).

<!-- Generated by claude-code-optimizer v1.37.0 -->
