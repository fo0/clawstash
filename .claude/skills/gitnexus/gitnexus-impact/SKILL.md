---
name: gitnexus-impact
description: 'Use when the user needs to assess the impact or blast radius of a change before making it. Examples: "What would break if I change X?", "Show me everything that depends on Y", "Impact analysis for removing Z", "Is it safe to modify this?"'
---

# Impact Analysis with GitNexus

## When to Use

- "What would break if I change X?"
- "Show me everything that depends on Y"
- "Impact analysis for removing Z"
- "Is it safe to modify this?"
- Before any significant code change to assess risk

## Workflow

1. `gitnexus_impact({target: "X", direction: "upstream"})` -> Who depends on X? (callers, importers)
2. `gitnexus_impact({target: "X", direction: "downstream"})` -> What does X depend on? (callees, imports)
3. `gitnexus_context({name: "X"})` -> Full picture: all incoming and outgoing references
4. Assess risk based on dependency count, cross-area references, and process involvement

> If "Index is stale" -> run `npx gitnexus analyze` in terminal.

## Reading Impact Results

```
gitnexus_impact({target: "AuthService.validateToken", direction: "upstream"})
-> d=1: LoginController.login, ApiMiddleware.authenticate, WebSocketHandler.onConnect
-> d=2: App.bootstrap, TestHelper.mockAuth
-> Affected Processes: LoginFlow, ApiAuth, WebSocketAuth
```

**Interpretation:**

- **d=1** -- Direct dependents. These MUST be checked/updated.
- **d=2** -- Indirect dependents. Check if change propagates this far.
- **Affected Processes** -- Business flows that need testing.

## Risk Matrix

| Factor                  | Low Risk | Medium Risk  | High Risk    |
| ----------------------- | -------- | ------------ | ------------ |
| Direct dependents (d=1) | 1-3      | 4-8          | >8           |
| Affected processes      | 1        | 2-3          | >3           |
| Cross-area references   | None     | Same layer   | Cross-layer  |
| Public/external API     | No       | Internal API | External API |

## Common Patterns

### Before modifying a function signature

```
gitnexus_impact({target: "functionName", direction: "upstream"})
# -> All callers that need parameter updates

gitnexus_context({name: "functionName"})
# -> Check if it implements an interface (interface callers also affected)
```

### Before removing a module

```
gitnexus_impact({target: "ModuleName", direction: "upstream"})
# -> Everything that imports from this module

gitnexus_query({query: "ModuleName"})
# -> Find string references, dynamic imports, config references
```

### Before changing a type/interface

```
gitnexus_impact({target: "TypeName", direction: "upstream"})
# -> All implementations and usages

gitnexus_cypher({query: "MATCH (n)-[:CodeRelation {type: 'IMPLEMENTS'}]->(t {name: 'TypeName'}) RETURN n"})
# -> All concrete implementations
```
