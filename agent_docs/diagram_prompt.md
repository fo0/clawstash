# Architecture Diagram Generation

## When to generate
- On explicit user request ("generate architecture diagram", "update diagram")
- After major structural changes (new modules, changed data flow, new external dependencies)
- NOT on every code change — only when the high-level architecture shifts

## Output files
- `docs/ARCHITECTURE.mmd` — Raw Mermaid code (no markdown fences)
- `docs/ARCHITECTURE.svg` — Rendered SVG (validate with: `npx mmdc -i docs/ARCHITECTURE.mmd -o docs/ARCHITECTURE.svg`)

## Generation Instructions

Analyze the repository and produce a single, valid Mermaid.js architecture diagram.

### Phase 1 — Repository Analysis

Gather context:
1. Read the file tree. Exclude: `.git`, `node_modules`, `dist`, `build`, `.next`, `__pycache__`, `.venv`, `vendor`, `target`, `.idea`, `.vscode`, `.gitnexus`.
2. Read README and key config files to identify the tech stack.
3. If GitNexus is available: use `gitnexus_query("project architecture overview")` to supplement file-tree analysis.

Determine:
- **Project type**: full-stack app (Next.js App Router, single process)
- **Main components**: React frontend, Next.js API routes, MCP server, SQLite database
- **Relationships**: data flow, API calls, MCP tool invocations
- **Architecture patterns**: monolithic Next.js app with server/client separation

### Phase 2 — Component Mapping

Map each identified component to its concrete file or directory:
- Only map where a clear match exists
- Prefer directories for modules, specific files for entry points
- Use exact paths from the file tree
- Aim for 10–30 mappings

### Phase 3 — Mermaid Diagram Generation

Use `flowchart TD` (top-down, vertical orientation).

**Node shapes:**
- `("Label")` — rounded rectangle for services/components
- `[("Label")]` — cylinder for databases
- `["Label"]` — rectangle for generic modules
- `{{"Label"}}` — hexagon for external services
- `(["Label"])` — stadium for queues/caches

**Requirements:**
- Group related components in `subgraph` blocks
- Show data flow with labeled arrows: `A -->|"description"| B` (only label when meaningful)
- Add `click NodeID "relative/path"` for every mapped component
- Apply `classDef` styles to every node — colors are mandatory
- Aim for 15–35 nodes total

**Suggested color palette:**
```
classDef frontend fill:#42b883,stroke:#35495e,color:#fff
classDef backend fill:#3178c6,stroke:#265a8f,color:#fff
classDef database fill:#336791,stroke:#264d73,color:#fff
classDef mcp fill:#ff6600,stroke:#cc5200,color:#fff
classDef server fill:#7b42bc,stroke:#5e338f,color:#fff
classDef external fill:#ff6347,stroke:#cc4f39,color:#fff
```

### Syntax Rules (CRITICAL — parser is strict)

1. QUOTE all labels with special characters: `EX["/api/process (Backend)"]:::api`
2. QUOTE all edge labels with special chars: `A -->|"calls Process()"| B`
3. NO spaces between pipes and quotes: `A -->|"text"| B` (not `| "text" |`)
4. NO `:::class` on subgraph declarations
5. NO subgraph aliases: use `subgraph "Name"` not `subgraph ID "Name"`
6. NO `%%{init: ...}%%` blocks
7. NEVER use `end` as a node ID (reserved keyword)
8. Node IDs must NOT start with a digit
9. NO semicolons at line ends
10. NO empty subgraphs
11. NO nested quotes in labels

### Self-check before writing

- [ ] Every node has a classDef applied
- [ ] Every label with special chars is quoted
- [ ] No subgraph has :::class or an alias
- [ ] No node ID is `end` or starts with a digit
- [ ] No `%%{init}` block
- [ ] Diagram is predominantly vertical
- [ ] 15–35 nodes
- [ ] Click events use relative paths, not in visible labels

### Validation

```bash
npx @mermaid-js/mermaid-cli mmdc -i docs/ARCHITECTURE.mmd -o docs/ARCHITECTURE.svg
```

If syntax errors occur, fix the Mermaid code without changing diagram meaning. Keep all click events and vertical orientation.
