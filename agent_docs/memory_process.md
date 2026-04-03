# Memory Process

Session-spanning project knowledge is tracked in `MEMORY.md` in the project root.

## Purpose

MEMORY.md is the agent's long-term memory — for knowledge that must persist between sessions but doesn't belong in CLAUDE.md (technical reference), README.md (user docs) or BACKLOG.md (open findings).

Typical contents:
- **Architecture decisions & reasoning** — Why was X chosen over Y?
- **Gotchas & pitfalls** — Things discovered while working that prevent future mistakes
- **Dependencies & couplings** — Non-obvious connections between components
- **User preferences** — How the user wants certain things solved (style, patterns, priorities)
- **Working context** — State of subtasks, open questions, next steps
- **Failed approaches** — What was tried and why it didn't work
- **External dependencies** — API quirks, library bugs, workarounds

## Rules

1. **Write without being asked** — When relevant context knowledge emerges during work, store it in MEMORY.md. No user prompt needed.
2. **Read at session start** — Read MEMORY.md at every new session to restore context.
3. **Keep compact** — Each entry is a short, concise paragraph. No prose, no redundancy. Max ~200 lines total.
4. **Remove outdated entries** — When entries become obsolete due to code changes, remove or update them.
5. **No duplication** — What's already in CLAUDE.md, README.md or BACKLOG.md doesn't belong here.
6. **Clean up working context** — Completed entries in Working Context get deleted, not marked as done.

## MEMORY.md Format

```markdown
# Memory

Session-spanning project knowledge. **Read at session start, update during work.**

## Architecture Decisions

### {Decision}
- **Date:** YYYY-MM-DD
- **Context:** {Why the decision came up}
- **Decision:** {What was decided}
- **Reason:** {Why this option}

## Gotchas & Pitfalls

- **{Short title}** — {Description, what happens and how to avoid it} ({date})

## Working Context

- **{Topic}** — {Current state, open questions, next steps} ({date})

## Failed Approaches

- **{What was tried}** — {Why it didn't work, what was done instead} ({date})

## External Dependencies

- **{Library/API/Service}** — {Quirk, bug, workaround} ({date})

## User Preferences

- **{Preference}** — {How the user wants things solved} ({date})
```

### Lifecycle
- Entries in **Working Context** are temporary — delete when completed.
- Entries in **Architecture Decisions** and **Gotchas** are long-lived — only remove when code fundamentally changes.
- Entries in **Failed Approaches** remain as long as the alternative exists.
- **Monitor size** — when MEMORY.md exceeds 200 lines: remove oldest Working Context and obsolete entries.
