---
name: gitnexus-review
description: 'Use when reviewing code changes, pull requests, or verifying the impact of modifications. Examples: "Review this PR", "What did my changes affect?", "Check if this change is safe", "Verify no regressions"'
---

# Code Review with GitNexus

## When to Use

- "Review this PR"
- "What did my changes affect?"
- "Check if this change is safe"
- "Verify no regressions"
- During the mandatory review process after every implementation

## Workflow

1. `gitnexus_detect_changes({scope: "all"})` -> See all changed files and affected processes
2. For each changed symbol: `gitnexus_impact({target, direction: "upstream"})` -> Find dependents
3. `gitnexus_context({name: "changedSymbol"})` -> Verify all callers are updated
4. Cross-reference affected processes with test coverage

> If "Index is stale" -> run `npx gitnexus analyze` in terminal.

## Review Checklist

### Step 1: Scope Assessment

```
gitnexus_detect_changes({scope: "all"})
-> Changed: N files, M symbols
-> Affected processes: [list]
-> Risk: LOW/MEDIUM/HIGH
```

### Step 2: Impact Verification (for each high-risk change)

```
gitnexus_impact({target: "changedFunction", direction: "upstream"})
-> Verify all upstream callers handle the change correctly
-> Check if return types, parameters, or behavior contracts changed
```

### Step 3: Dependency Check

```
gitnexus_context({name: "changedFunction"})
-> Verify outgoing dependencies still valid
-> Check if new dependencies were introduced
```

### Step 4: Cross-cutting Concerns

```
gitnexus_cypher({query: "MATCH (f:Function)-[:CodeRelation]->(changed:Function {name: 'X'}) WHERE f.filePath CONTAINS 'test' RETURN f"})
-> Verify test coverage exists for affected code
```

## Risk Assessment

| Risk Level | Criteria                                       | Action                                        |
| ---------- | ---------------------------------------------- | --------------------------------------------- |
| LOW        | <=3 files, 1 process affected                  | Standard review                               |
| MEDIUM     | 4-10 files, 2-3 processes                      | Review + run affected process tests           |
| HIGH       | >10 files, >3 processes, or cross-area changes | Full review + all tests + manual verification |
