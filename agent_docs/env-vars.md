# Environment Variables

Full environment-variable reference. CLAUDE.md carries only the 3-5 variables an agent must know; everything else lives here. Placeholders + comments: `.env.example`.

## All variables

| Variable                   | Description                                                                                                                         | Default               | Required                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------- |
| `PORT`                     | Server port                                                                                                                         | `3000`                | No                                      |
| `DATABASE_PATH`            | Path to SQLite database file                                                                                                        | `./data/clawstash.db` | No                                      |
| `NODE_ENV`                 | Environment mode                                                                                                                    | `development`         | No                                      |
| `ADMIN_PASSWORD`           | Admin password for login (unset = open access)                                                                                      | --                    | No                                      |
| `ADMIN_SESSION_HOURS`      | Admin session duration in hours (0 = unlimited)                                                                                     | `24`                  | No                                      |
| `TRUST_PROXY`              | Trust `X-Forwarded-*` headers (set to `1` or `true` when behind nginx, Traefik, Cloudflare, etc.)                                   | off                   | No (recommended behind a reverse proxy) |
| `CLAWSTASH_ENCRYPTION_KEY` | Key for secrets at rest (GitHub backup token), 64 hex chars. Unset = auto-generated key file next to the DB (`data/.clawstash-key`) | auto-generated        | No                                      |

> `CLAWSTASH_ENCRYPTION_KEY` is the only variable whose loss is unrecoverable: without it the encrypted GitHub-backup token cannot be read back. Back it up together with the database.

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
