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

## GitNexus-Assisted Refactoring

When GitNexus is available, always use it for refactoring tasks:

1. **Before refactoring:** `gitnexus_impact` to map the blast radius
2. **For renames:** `gitnexus_rename` with `dry_run: true` first, review, then apply
3. **After refactoring:** `gitnexus_detect_changes` to verify only expected files changed
4. **For extraction:** `gitnexus_context` to understand all incoming/outgoing references

See `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` for detailed workflows.
