---
name: gitnexus-refactoring
description: 'Use when planning a rename, extraction, split, move, or restructure — to map references and blast radius before editing. Examples: "What references this function?", "Plan a safe rename", "What does extracting this affect?"'
---

# Refactoring with GitNexus (read-only analysis)

> **GitNexus is read-only.** Use it to *plan and verify* refactors — map references, blast radius, and affected flows. It must **never** edit files: there is no `gitnexus_rename` step here. You perform all edits yourself with normal tools, then use `gitnexus_detect_changes` to verify scope. See the Read-Only Analysis Policy in CLAUDE.md / AGENTS.md.

## When to Use

- "Rename this function safely"
- "Extract this into a module"
- "Split this service"
- "Move this to a new file"
- Any task involving renaming, extracting, splitting, or restructuring code

## Workflow

```
1. gitnexus_impact({target: "X", direction: "upstream"})  → Map all dependents
2. gitnexus_query({query: "X"})                            → Find execution flows involving X
3. gitnexus_context({name: "X"})                           → See all incoming/outgoing refs
4. Plan update order: interfaces → implementations → callers → tests
```

> If the index is reported stale, rebuilding is **not routine** — run `npx gitnexus analyze --skip-agents-md` only if the task needs a fresh index, then `git status` + `git checkout --` any tracked file it touched (read-only policy).

## Checklists

### Rename Symbol

```
- [ ] gitnexus_context({name: "oldName"}) — list every incoming/outgoing reference
- [ ] gitnexus_impact({target: "oldName", direction: "upstream"}) — find all callers/importers
- [ ] gitnexus_query({query: "oldName"}) — catch string/dynamic references the graph may miss
- [ ] Edit every reference yourself (normal Edit tool): interfaces → implementations → callers → tests
- [ ] gitnexus_detect_changes() — verify only expected files changed
- [ ] Run tests for affected processes
```

### Extract Module

```
- [ ] gitnexus_context({name: target}) — see all incoming/outgoing refs
- [ ] gitnexus_impact({target, direction: "upstream"}) — find all external callers
- [ ] Define new module interface
- [ ] Extract code, update imports
- [ ] gitnexus_detect_changes() — verify affected scope
- [ ] Run tests for affected processes
```

### Split Function/Service

```
- [ ] gitnexus_context({name: target}) — understand all callees
- [ ] Group callees by responsibility
- [ ] gitnexus_impact({target, direction: "upstream"}) — map callers to update
- [ ] Create new functions/services
- [ ] Update callers
- [ ] gitnexus_detect_changes() — verify affected scope
- [ ] Run tests for affected processes
```

## Tools

**gitnexus_context** — enumerate every reference before you edit (read-only):

```
gitnexus_context({name: "validateUser"})
→ Incoming: loginHandler, apiMiddleware, testUtils
→ Outgoing: checkToken, getUserById
→ Processes: LoginFlow (step 2/5), TokenRefresh (step 1/3)
```

**gitnexus_impact** — map all dependents first:

```
gitnexus_impact({target: "validateUser", direction: "upstream"})
→ d=1: loginHandler, apiMiddleware, testUtils
→ Affected Processes: LoginFlow, TokenRefresh
```

**gitnexus_detect_changes** — verify your changes after refactoring:

```
gitnexus_detect_changes({scope: "all"})
→ Changed: 8 files, 12 symbols
→ Affected processes: LoginFlow, TokenRefresh
→ Risk: MEDIUM
```

**gitnexus_cypher** — custom reference queries:

```cypher
MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(f:Function {name: "validateUser"})
RETURN caller.name, caller.filePath ORDER BY caller.filePath
```

## Risk Rules

| Risk Factor         | Mitigation                                |
| ------------------- | ----------------------------------------- |
| Many callers (>5)   | gitnexus_impact to enumerate every caller, then edit each yourself |
| Cross-area refs     | gitnexus_detect_changes after to verify scope                      |
| String/dynamic refs | gitnexus_query to find them                                        |
| External/public API | Version and deprecate properly                                     |

## Example: Rename `validateUser` to `authenticateUser` (read-only plan + manual edits)

```
1. gitnexus_context({name: "validateUser"}) + gitnexus_impact({target: "validateUser", direction: "upstream"})
   → References in: validator.ts, login.ts, middleware.ts, auth tests
2. gitnexus_query({query: "validateUser"})
   → Also a dynamic reference in config.json — the graph alone would miss it
3. Edit each reference yourself (Edit tool): definition → callers → tests → config.json
4. gitnexus_detect_changes({scope: "all"})
   → Affected: LoginFlow, TokenRefresh
   → Risk: MEDIUM — run tests for these flows
```
