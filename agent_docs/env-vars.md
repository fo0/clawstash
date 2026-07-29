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
| `ADMIN_SESSION_HOURS`      | Admin session duration in hours (0 = unlimited)                                                                                                                                         | `24`                  | No                                      |
| `TRUST_PROXY`              | Trust `X-Forwarded-*` headers (set to `1` or `true` when behind nginx, Traefik, Cloudflare, etc.)                                                                                       | off                   | No (recommended behind a reverse proxy) |
| `CLAWSTASH_ENCRYPTION_KEY` | Key for secrets at rest (GitHub backup token), 64 hex chars. Unset = auto-generated key file next to the DB (`data/.clawstash-key`)                                                     | auto-generated        | No                                      |

> `CLAWSTASH_ENCRYPTION_KEY` is the only variable whose loss is unrecoverable: without it the encrypted GitHub-backup token cannot be read back. Back it up together with the database.

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
