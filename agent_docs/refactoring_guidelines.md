# Refactoring Guidelines

Refactoring does NOT happen automatically. Only when:
- Explicit user request
- Repeated code smells across multiple files in review
- Feature implementation is significantly hindered by code structure

## Principles

1. **No over-engineering** — Only refactor what provides measurable benefit
2. **AI-optimized structure** — Code is primarily maintained by AI agents:
   - Explicit > implicit (easier for AI to parse)
   - Focused files: >300 lines -> evaluate split, >500 lines -> split strongly recommended
   - Descriptive names > clever abstractions
   - Consistent patterns across similar components (AI can pattern-match)
   - Inline comments for non-obvious decisions (AI has no project history context)
3. **Follow framework idioms** — Use Next.js App Router and React 19 best practices, no custom abstractions
4. **Incremental** — Small chunks, each goes through the full review cycle
5. **Extract, don't abstract** — Prefer extracting into focused files over building abstract base classes
6. **Verify** — Every refactoring step must pass all automated checks before the next one begins
