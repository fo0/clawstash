# Coding Conventions

Full convention list. CLAUDE.md keeps the five an agent violates most easily; the rest -- component style, CSS conventions, error handling and the TS compiler settings -- is here.

- **Language**: All UI text and documentation in English.
- **Module System**: ESM (`"type": "module"` in `package.json`).
- **Formatting**: 2-space indentation, single quotes in TS. `.claude/` is excluded via `.prettierignore` (tool-managed files; GitNexus rewrites its skill files non-Prettier-formatted) -- keep that exclusion.
- **Imports**: Named imports, `@/*` path aliases for server-side imports in route handlers.
- **Components**: Functional React components with TypeScript interfaces for props.
- **Component Organization**: Complex features split into sub-directories (`api/`, `editor/`) with focused, single-responsibility files. Shared components in `shared/`, utilities in `utils/`.
- **API Route Handlers**: Use `checkScope()` / `checkAdmin()` helper functions for auth instead of Express middleware.
- **CSS**: Global CSS with CSS custom properties (no CSS-in-JS), BEM-like class naming. Responsive breakpoints: 640px (mobile), 768px (tablet), 1200px (medium), 1600px / 2000px (large / extra-large).
- **Error Handling**: Try/catch in async handlers, error state in UI components. Validation errors go through `formatZodError()` for human-readable strings.
- **TypeScript**: Strict mode enabled, `noEmit`, target ES2022, Next.js plugin.
- **Max file length**: ~300 lines (split), ~500 lines (strongly recommended) -- TS/JS extension defaults.

## Never-translate term list

Offloaded from `CLAUDE.md → Output Languages` (context budget) — the rule itself stays there, this is the vocabulary it covers.

Technical terms keep the English word verbatim in every surface, chat included, and the German sentence inflects around them: "2 Bugs gefixt", "Code Smell in `db.ts`", "PR gemerged", "Build ist rot" — never "Programmfehler", "Code-Geruch", "Zusammenführungsantrag".

Covered vocabulary: bug · smell · lint · build · commit · merge · rebase · branch · PR · review · refactoring · deployment · rollback · issue · breaking change · hotfix · coverage · flaky test · regression · edge case · stack trace · dependency · tech debt.

Plus everything that names something real: file paths, commands, tool / skill / hook names, status labels, and error strings (quoted verbatim).

Test: English in code, a commit or a PR → English in chat.
