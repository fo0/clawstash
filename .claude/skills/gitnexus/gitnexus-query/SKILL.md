---
name: gitnexus-query
description: 'Use when the user wants to run custom or advanced queries against the code graph. Examples: "Find all unused exports", "Show circular dependencies", "List all functions longer than 100 lines", "Custom Cypher query"'
---

# Advanced Queries with GitNexus

## When to Use

- "Find all unused exports"
- "Show circular dependencies"
- "List all functions that match X pattern"
- Custom relationship queries beyond what other skills cover
- Complex cross-referencing or code metrics

## Tools

### gitnexus_query -- Natural Language Search

Best for: Finding code by description, not by exact name.

```
gitnexus_query({query: "error handling middleware"})
-> Found: errorHandler.ts, apiMiddleware.ts, errorBoundary.tsx
-> Processes: ErrorHandlingFlow, ApiRequestFlow
```

### gitnexus_cypher -- Raw Cypher Queries

Best for: Complex relationship queries, metrics, pattern detection.

**Find all callers of a function:**

```cypher
MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(f:Function {name: "targetFunction"})
RETURN caller.name, caller.filePath
ORDER BY caller.filePath
```

**Find circular dependencies between modules:**

```cypher
MATCH path=(a:Module)-[:CodeRelation {type: 'IMPORTS'}]->(b:Module)-[:CodeRelation {type: 'IMPORTS'}]->(a)
RETURN a.name, b.name, length(path)
```

**Find functions with many dependencies (potential god functions):**

```cypher
MATCH (f:Function)-[r:CodeRelation {type: 'CALLS'}]->(target)
WITH f, count(target) AS deps
WHERE deps > 10
RETURN f.name, f.filePath, deps
ORDER BY deps DESC
```

**Find unused exports:**

```cypher
MATCH (e:Export)
WHERE NOT EXISTS { MATCH ()-[:CodeRelation {type: 'IMPORTS'}]->(e) }
RETURN e.name, e.filePath
```

**Find all implementations of an interface:**

```cypher
MATCH (impl)-[:CodeRelation {type: 'IMPLEMENTS'}]->(iface {name: "InterfaceName"})
RETURN impl.name, impl.filePath
```

**Find cross-layer dependencies (e.g. controller -> repository directly):**

```cypher
MATCH (c:Function)-[:CodeRelation {type: 'CALLS'}]->(r:Function)
WHERE c.filePath CONTAINS 'controller' AND r.filePath CONTAINS 'repository'
RETURN c.name, r.name, c.filePath, r.filePath
```

## Tips

- Node types depend on the analyzed project: `Function`, `Class`, `Module`, `Export`, `Type`, etc.
- Relationship types: `CALLS`, `IMPORTS`, `IMPLEMENTS`, `EXTENDS`, `REFERENCES`
- Use `gitnexus_query` first for discovery, then `gitnexus_cypher` for precise queries
- If Cypher query returns empty: check node/relationship type names with a broad query first

> If "Index is stale" -> run `npx gitnexus analyze` in terminal.
