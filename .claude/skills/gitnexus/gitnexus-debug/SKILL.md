---
name: gitnexus-debug
description: "Use when the user is debugging an issue, tracing an error, or trying to understand why something is broken. Examples: \"Why is X returning null?\", \"Where does this error come from?\", \"Trace the data flow for Y\", \"Find where this value gets modified\""
---

# Debugging with GitNexus

## When to Use

- "Why is X returning null?"
- "Where does this error come from?"
- "Trace the data flow for Y"
- "Find where this value gets modified"
- "Something broke after changing Z"
- Any task involving tracing errors, unexpected behavior, or data flow issues

## Workflow

1. **Locate the symptom** -- `gitnexus_query({query: "error/symptom description"})` to find relevant code
2. **Map context** -- `gitnexus_context({name: "affectedSymbol"})` to see all inputs and outputs
3. **Trace upstream** -- `gitnexus_impact({target: "affectedSymbol", direction: "downstream"})` to find data sources
4. **Trace downstream** -- `gitnexus_impact({target: "suspectedCause", direction: "upstream"})` to see what it affects
5. **Verify after fix** -- `gitnexus_detect_changes()` to confirm fix scope

> If "Index is stale" -> run `npx gitnexus analyze` in terminal.

## Debugging Patterns

### Trace an error source
```
gitnexus_context({name: "getUserProfile"})
-> Incoming: ProfileController.show(), SettingsController.load()
-> Outgoing: UserRepository.findById(), CacheService.get()
-> Key: check if UserRepository.findById() can return null

gitnexus_impact({target: "UserRepository.findById", direction: "upstream"})
-> d=1: getUserProfile, deleteUser, updateUser
-> All these callers need null-handling!
```

### Find what changed
```
gitnexus_detect_changes({scope: "all"})
-> Changed: 3 files, 5 symbols
-> Affected processes: AuthFlow, ProfileFlow
-> Risk: LOW

# Cross-reference with the bug: is AuthFlow or ProfileFlow involved?
```

### Trace data flow
```
gitnexus_cypher({query: "MATCH path=(source)-[:CodeRelation*1..4]->(target:Function {name: 'saveOrder'}) RETURN path"})
-> Shows all paths that lead to saveOrder -- find where data gets transformed
```
