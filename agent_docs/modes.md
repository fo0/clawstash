# Modes — model, output style, orchestration, planning

Session-level switches. None of them changes what the code does; they change how the agent works this session.
Offloaded from `CLAUDE.md` (context budget) — the one-line pointer there is the entry point.

## Model

**Default model:** whatever the session resolves to. Don't pin one in `CLAUDE.md` or in `.claude/settings.json` —
`/model` switches mid-session, and a pinned value silently overrides the user's choice on every future run.

**Fast mode** (`/fast`): the **same** Opus model with faster output — not a smaller model and not a downgrade. Use it
when latency beats reasoning depth; switch back for anything where a wrong answer costs more than a slow one.

## Caveman mode (chat compression)

`caveman lite|full|ultra` turns it on, `stop caveman` turns it off. It compresses **chat replies only** — generated
files (`CLAUDE.md`, `agent_docs/*`, `MEMORY.md`, `SCRATCHPAD.md`, `BACKLOG.md`, skills, commit messages, PR bodies,
issue comments) always stay in full prose in the language `CLAUDE.md → Output Languages` assigns them.

Technical terms stay English and verbatim in every mode — compression never reaches them.

## Orca mode (orchestrator-only)

`/orca` toggles it, `/orca <N>` sets the parallel width (default 5), `/orca status` reports state without changing it.
While on, the agent itself does no task work — every unit goes to a subagent at the session's model and effort.

**Off by default:** the skill file existing changes nothing until someone types `/orca`. Full contract — what the
orchestrator keeps, quality parity, disjoint write scopes, the wave report: `.claude/skills/orca/SKILL.md`.

## Plan mode

For non-trivial implementation strategy: the `Plan` subagent or `EnterPlanMode`. Not for single-step tasks — a plan for
a one-file edit costs a round trip and buys nothing. Delegation thresholds: `agent_docs/review_process.md → Subagent
Delegation`.
