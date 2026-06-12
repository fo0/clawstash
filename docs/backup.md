# GitHub Backup

ClawStash can mirror all stashes into a GitHub repository — on a schedule, shortly after every change, and on demand. This gives you off-host durability (survives container/volume loss), a versioned history per stash (one commit per logical change), and portability (clone the backup repo to inspect your data anywhere).

> Refs [#108](https://github.com/fo0/clawstash/issues/108). Restore-from-repo is a planned follow-up; the backup is currently one-way (ClawStash → GitHub).

## Quick start

1. Open **Settings → GitHub Backup** (admin login required when `ADMIN_PASSWORD` is set).
2. Connect a GitHub account — pick one of the two paths below.
3. Choose the target repository and branch, set a sync interval, click **Save settings**.
4. Click **Back up all now** for the first full mirror.

### Path A — Sign in with GitHub (recommended)

Uses the GitHub OAuth **device flow**: no client secret, no callback URL, works on `localhost` and behind any firewall.

One-time setup:

1. On GitHub: **Settings → Developer settings → OAuth Apps → New OAuth App** — or click **create a GitHub OAuth app** in ClawStash's connect card, which opens the form pre-filled.
   - Name: anything (e.g. `ClawStash Backup`), Homepage: anything.
   - Authorization callback URL: any placeholder (not used by the device flow; the pre-filled form uses `http://localhost`).
2. Tick **"Enable Device Flow"** (on the creation form, or later in the app settings) and copy the **Client ID**.
3. In ClawStash: paste the Client ID, click **Sign in with GitHub**, open the shown link, and enter the one-time code.

The resulting token has the `repo` scope (GitHub OAuth apps have no narrower repo-level scope). If you want tighter scoping, use a fine-grained PAT instead.

### Path B — Personal access token

Best minimal-scope option and ideal for headless setups:

1. On GitHub: **Settings → Developer settings → Fine-grained tokens → Generate new token** — or click **create one on GitHub** in ClawStash's connect card, which opens the form pre-filled with name, description, and the `Contents` permission.
2. Repository access: **Only select repositories** → your backup repo (cannot be pre-filled — always set this manually).
3. Permissions: **Contents → Read and write**. Nothing else (GitHub automatically adds the mandatory **Metadata → Read**).
4. Paste the token into **connect with a personal access token** in ClawStash.

Classic PATs (`ghp_…`, scope `repo`) also work.

## What lands in the repo

Under the configured path prefix (default `stashes`):

```
stashes/
├── INDEX.md                    # human-readable index of all mirrored stashes
└── <stash-id>/
    ├── stash.json              # metadata envelope: name, description, tags,
    │                           # metadata, version, archived, timestamps, file list
    └── files/
        ├── notes.md            # raw file contents, byte-for-byte
        └── config.yaml
```

Commits are one per logical change with messages like `stash: create My Notes`, `stash: update My Notes`, `stash: delete My Notes`. The commit author is configurable.

## Triggers

| Trigger       | Behaviour                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| **Scheduled** | Runs at the configured interval (off / 5 min / 15 min / 1 h / 6 h / 24 h). No-op when nothing changed.          |
| **On change** | A debounced sync runs ~10 seconds after the last create / update / delete, so bursts coalesce into one run.     |
| **Manual**    | "Back up all now" in Settings, "Back up now" per stash in the viewer, or `POST /api/backup/sync` (write scope). |

Change detection is a SHA-256 content hash per stash — a sync with no changes performs **zero** GitHub API calls. A no-op update (same content, bumped version) does not produce a commit.

> The stdio MCP server (`npm run mcp`) runs in a separate process without the mutation hook; its changes are picked up by the web process's next scheduled or manual sync.

## Semantics & conflict policy

- **Last writer wins.** ClawStash is the source of truth for the mirrored paths. If the branch moved (e.g. you pushed to it manually), the sync re-reads the head and re-applies its commits on top — your unrelated files survive, but manual edits _inside_ the mirrored stash directories are overwritten on the next sync of that stash. Use a dedicated branch (or repo) for backups if you also work in the repo manually.
- **Deletions** are configurable: `remove` (default) commits the file removal — git history still retains the content — or `keep` leaves the mirrored files in place and only stops tracking them.
- **Per-stash opt-out:** every stash is included by default; the viewer's **Exclude** button (or `PATCH /api/stashes/:id` with `{"backup_enabled": false}`) removes it from the mirror on the next sync.

## Observability

- Per-stash status (idle / pending / syncing / error, last sync time, last commit SHA) in **Settings → GitHub Backup** and as a status bar in the stash viewer.
- A bounded sync log (last 500 entries) records every run — including skipped no-change runs — with trigger, result, and commit SHA: `GET /api/backup/log`.
- A health indicator marks the backup unhealthy after 3 consecutive failed runs.

## Security

- **The token is encrypted at rest** (AES-256-GCM) inside the SQLite database. The encryption key comes from the `CLAWSTASH_ENCRYPTION_KEY` env var (64 hex chars) if set, otherwise from an auto-generated key file next to the database (`data/.clawstash-key`, mode 0600). Keep that file with your data volume — without it the stored token cannot be decrypted and you must reconnect.
- **The token never leaves the server.** API responses only carry a `tokenSet` flag and the connected account login; error messages and the sync log are redacted (explicit token value plus anything matching GitHub token patterns).
- The OAuth **device code** stays server-side during login; the browser only sees the user-facing code.
- **Scope guidance:** prefer a fine-grained PAT restricted to a single repository with `Contents: Read and write`. GitHub App support (even tighter scoping + better rate limits) is a planned follow-up.

## API

All backup endpoints are documented in [api-reference.md](api-reference.md#github-backup) and in the OpenAPI spec at `/api/openapi`. Configuration endpoints require admin access; `POST /api/backup/sync` needs write scope; status/log need read scope.

## Out of scope (follow-ups)

- Restore-from-repo flow
- Multi-repo / multi-target backup
- Pull-based sync (repo → ClawStash)
- Client-side encryption of stash content inside the backup repo
