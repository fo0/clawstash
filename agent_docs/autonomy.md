# Autonomy -- full wording

Offloaded from `CLAUDE.md` (context budget) -- the compact rules there are the entry point; this file carries the full wording, moved verbatim.

Which session you are in is resolvable, so it is a rule and not a guess: `$CLAUDE_CODE_REMOTE` is `"true"` in Claude Code web/cloud sessions -- routine runs included -- and unset in the local CLI.

- **Unattended** (`CLAUDE_CODE_REMOTE=true`, or the session's initial instructions are a routine): nobody is there to answer. Never end a turn with a question -- decide under an assumption you state, finish every part that isn't blocked, and carry the open point into the final report or `BACKLOG.md`. A routine run has no permission prompts, so a session that "waits for approval" waits forever.
- **Interactive** (local CLI): asking is cheap. Ask when two readings of the task produce materially different work; otherwise decide and mention the call.
- **Both:** an action that is destructive _and_ not ordered _and_ not standard practice gets the same answer either way -- skip it, report it with the recommendation, finish everything it does not block. Gates stay where they are: merges -> `.claude/skills/pr/SKILL.md -> /pr merge`, reversals and force operations -> `.claude/skills/rollback/SKILL.md`, deploys and secrets -> `CLAUDE.md -> Deployment` and `agent_docs/env-vars.md`.
