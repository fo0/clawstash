# MCP Catalog

This file documents:

1. **This project's intended MCPs** -- declared by the user, not detected from the host.
2. The mechanics that are **not** general knowledge: which servers survive into an unattended run, and how to stop trigger tools from prompting.

> **Cross-machine rule:** the optimizer never auto-detects which MCPs are installed locally. The catalog reflects intent + reference, not host probe. If a listed MCP isn't installed on the current machine, the agent silently falls back to non-MCP equivalents (Read / Bash / WebFetch / etc.) and notes once: `MCP <name> not available locally -- falling back to standard tools.`

## Project MCPs (intended for this project)

> Edit this list when adding/removing MCP integrations from the project. The optimizer preserves user edits on re-run.

| MCP                        | Purpose in this project                                                                                                | Notes                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `gitnexus`                 | Code intelligence -- symbol graph, impact, refactor for the clawstash TS/Next.js code                                  | Read-only per CLAUDE.md policy. Rebuild only when needed: `npx gitnexus analyze --skip-agents-md`. Index lives in `.gitnexus/` (gitignored). |
| `github`                   | Repo / issue / PR metadata when the `gh` CLI is unavailable in the host environment                                    | Skill files (`pr`, `ci`) prefer `gh` CLI when available; MCP is a fallback only.                                                             |
| Clawstash's own MCP server | The application under development exposes its own MCP server at `/mcp` (Streamable HTTP) and via `npm run mcp` (stdio) | Used for end-to-end testing of MCP tools the project ships -- not for agent task automation.                                                 |

## Servers the agent will meet anyway

One entry, because it is the only one whose behavior is not general knowledge:

| MCP                  | Why it is written down                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claude-code-remote` | Claude Code web/remote session management -- scheduled Routines/triggers, `send_later` self check-ins, PR-activity subscriptions. Pre-approved in `.claude/settings.json` -> `permissions.allow` via a per-spelling `mcp__<server>__*` glob (the PR-activity pair may register under `github` instead -- both spellings are covered). That block reaches the local CLI once the workspace is trusted, **not** a cloud/web session. See _Allowlist shape_ and _Prompt-free triggers everywhere_ below |

Every other server (filesystem, github, database, browser-automation, error-tracking, work-tracking, cloud-provider ...) needs no catalog here: what it does is evident from its name and tool list at the moment it is connected, and a list of them in this file would only go stale. Two rules cover them all -- **fall back silently** when a server is absent (_Selection Heuristic_ below), and **never call a cost-incurring one** unbidden. Servers this project actually intends are in the table above.

## Allowlist shape (`.claude/settings.json` -> `permissions.allow`)

The list is glob-first and deliberately minimal:

- **Keep exactly one `mcp__<server>__*` glob per Claude Code Remote spelling** (`claude-code-remote`, `Claude_Code_Remote`, `claude_code_remote`). A glob covers every current and future tool of that server, so autonomous check-ins never stall on an approval prompt.
- **Per-tool entries already matched by a glob in the same list are redundant** -- they were pruned (2026-08-02, owner decision) and **must not be re-added**. Only `mcp__github__subscribe_pr_activity` / `mcp__github__unsubscribe_pr_activity` remain per-tool, because there is no `mcp__github__*` glob; if such a glob is ever added, those two become redundant too and go with it.
- **Self-heal by appending a glob -- local sessions only.** Where the block applies (local CLI, workspace trusted), a tool that still prompts means its server spelling is missing from the list -- append `mcp__<that server>__*` and commit it on the current branch/PR. Never widen by adding individual tool names. In a web/cloud session (`$CLAUDE_CODE_REMOTE=true`) append **nothing**: the entry could not take effect there in any session, so committing it would manufacture dead config -- name the one-time user-scope fix below once instead and carry on.
- **Never write `deny`/`ask`** in this file. Re-gating is the user's call in their own settings (below), never the agent's in the repo.
- Never remove a glob, and never touch entries for a server you are not fixing.

> `.prettierignore` excludes `.claude/`, so a format run never reaches this file -- keep the JSON hand-formatted (2-space indent) and keep that exclusion.

## Prompt-free triggers everywhere (one-time)

This repo's `.claude/settings.json` pre-approves every Claude Code Remote trigger tool -- but a **project** allowlist grants capability, so Claude Code applies it only after this repo's **workspace-trust dialog** has been accepted. That single fact splits the two surfaces:

| Surface                                                             | What actually happens                                                                                                                                                                                                                                                        | The one-time fix                                                                                                     |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Local CLI**                                                       | The trust dialog appears on the first interactive run in the repo; accept it and the repo block is live                                                                                                                                                                      | Accept the dialog -- or put the rules in user settings below and cover every repo at once                            |
| **Claude Code web / cloud** (routines, Claude Tag, mobile included) | No trust dialog exists and every session starts from a fresh container, so the block is dropped at startup -- `Ignoring N permissions.allow entries from .claude/settings.json: this workspace has not been trusted` -- and `delete_trigger` & friends prompt on every merge | User settings, installed by the environment's **setup script** (below). Nothing inside the repo can fix this surface |

Same rules either way, in `~/.claude/settings.json` -- user scope carries no trust gate and applies to every repo:

```json
{
  "permissions": {
    "allow": [
      "mcp__claude-code-remote__*",
      "mcp__Claude_Code_Remote__*",
      "mcp__claude_code_remote__*",
      "mcp__github__subscribe_pr_activity",
      "mcp__github__unsubscribe_pr_activity"
    ]
  }
}
```

**Cloud/web -- paste this into the environment's _Setup script_** (claude.ai -> Claude Code -> cloud environment settings). It runs as root before Claude Code launches, and what it writes survives in the environment snapshot, so later sessions start with the file already in place. Merge-safe: it adds only what is missing.

```bash
python3 - <<'PY'
import json, os, pathlib
d = pathlib.Path(os.environ.get("CLAUDE_CONFIG_DIR") or (pathlib.Path.home() / ".claude"))
d.mkdir(parents=True, exist_ok=True)
f = d / "settings.json"
cfg = json.loads(f.read_text()) if f.exists() else {}
allow = cfg.setdefault("permissions", {}).setdefault("allow", [])
for rule in ["mcp__claude-code-remote__*", "mcp__Claude_Code_Remote__*", "mcp__claude_code_remote__*",
             "mcp__github__subscribe_pr_activity", "mcp__github__unsubscribe_pr_activity"]:
    if rule not in allow:
        allow.append(rule)
f.write_text(json.dumps(cfg, indent=2))
PY
```

Editing the setup script re-runs it and rebuilds the snapshot; the cache also expires after roughly seven days. Verify in the next session with `cat ~/.claude/settings.json`. **Why not a `SessionStart` hook in the repo:** hooks do run in an untrusted workspace, but settings are read _before_ hooks fire -- the rules would apply to the session _after_ the one that wrote them, and in the cloud there is no session after: each gets a new container. The web surface pre-approves the GitHub MCP server on its own, which is why the prompts that survive there are the Claude Code Remote ones.

Merge into an existing file without clobbering rules you did not add; the same glob-first shape applies (per-tool entries a glob already covers are redundant). To re-gate a single tool (e.g. `add_repo`), add it to `permissions.ask` -- `ask` is evaluated before `allow`, so it prompts despite the glob. **The agent never writes this file on its own, and never writes `deny`/`ask` anywhere** -- this file lives outside the repo, so applying it is the user's call.

Two more keys earn their place in that same user-level file:

| Key                                             | Effect on unattended work                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"askUserQuestionTimeout": "5m"`                | An unanswered `AskUserQuestion` auto-continues after 5 minutes with whatever was preselected, instead of holding the session open. The default `"never"` waits forever -- that is what turns one ambiguous moment into a dead overnight run. Values: `"60s"`, `"5m"`, `"10m"`, `"never"`. **Read from user settings only** -- a repo cannot set it, which is why the optimizer never writes it |
| `"permissions": {"defaultMode": "acceptEdits"}` | Optional. File edits and common filesystem commands stop prompting; every other rule still applies. Project settings _can_ carry this, but how much a machine may do unsupervised is the owner's call, not the repo's -- so it is left to you. `bypassPermissions` skips nearly all prompts and belongs only in a container or VM you are willing to lose                                      |

## MCPs in cloud and routine runs

A cloud session -- every routine run included -- starts from a fresh clone of the repository. Nothing added locally with `claude mcp add` travels with it, because that configuration lives on the machine, not in the repo. Two paths make a server reachable in an unattended run:

1. **A committed `.mcp.json` at the repo root** (project scope). It is part of the clone, so it applies everywhere the repo goes:

   ```json
   {
     "mcpServers": {
       "example": { "type": "http", "url": "https://mcp.example.com/mcp" }
     }
   }
   ```

   stdio servers use `"command"` + `"args"` instead of `"type"`/`"url"`. `${VAR}` and `${VAR:-default}` expand in `command`, `args` and `env` -- **use them for every credential**; a token committed in `.mcp.json` is a leaked token. Project servers need approval before they connect: `.claude/settings.json` -> `enableAllProjectMcpServers: true` grants it, and like every project-level allow rule it applies only after the workspace-trust dialog is accepted.

   > ClawStash has **no committed `.mcp.json`**, so `enableAllProjectMcpServers` is deliberately absent from `.claude/settings.json` -- it would approve an empty set. Add the key in the same commit that adds the file, never before.

2. **claude.ai connectors.** A routine includes the account's connectors, and its own form is where you narrow them to what the run needs. Connector traffic goes through Anthropic's servers, so it is unaffected by the environment's allowed-domains list.

Neither path is a hard requirement -- Selection Heuristic rule 3 still holds. A run whose MCP is missing falls back and says so once.

## Selection Heuristic for the Agent

1. **Project MCPs first.** If the project intends an MCP for a task, use it.
2. **Common-MCP fallback.** For tasks that fit a common MCP, try it; if unavailable, fall back to standard tools.
3. **Never make MCP usage a hard requirement.** All workflows must work without MCPs (autonomy + cross-machine rule).
4. **Never call cost-incurring MCPs** (cloud, paid APIs) unless explicitly requested by the user.

## Adding a New Project MCP

1. Add a row to the **Project MCPs** table above with purpose + notes.
2. If the MCP needs setup, document the install/auth steps in CLAUDE.md "External Integrations" section.
3. If a workflow becomes MCP-dependent, add a fallback path that works without it.
