# CI Formatting Guard — auto-format staged files on commit (husky + lint-staged)

Stops the recurring CI failure of the form `prettier --check` → "Code style issues found".

## When this applies

- ClawStash has a `package.json`, uses **Prettier** as its formatter (`prettier` is a devDependency, `format` / `format:check` scripts exist) and CI runs `npm run format:check` (= `prettier --check .`).
- **Skip or adapt** if the repo ever switches formatter (Biome, dprint, gofmt, ruff) — only the command in step 4 changes.
- **Non-Node stacks** (no `package.json`): use the `pre-commit` framework (https://pre-commit.com) as the analog — same idea (auto-format staged files on commit), different runner. Not relevant here.
- **Idempotent:** if `lint-staged` + `.husky/pre-commit` already exist, only reconcile the config; do not reinstall.

## Problem

Hand-edited files — especially long Markdown tables (e.g. `BACKLOG.md`, the env-var table in `CLAUDE.md`) — drift from Prettier's normalization (column padding, line wrapping). They get committed unformatted and CI's `prettier --check .` fails. There is no local guard, so the failure only surfaces after the push. Recurring, disruptive, blocks the green build (CI gate: type-check → build → Docker push, with `format:check` matching the Prettier run).

## Goal

- Unformatted files can **never enter a commit**.
- CI `format:check` is always green.
- **No manual discipline required** — no need to remember to run `npm run format`.
- **Self-installing** for every fresh clone and every teammate.

## Solution — auto-format on pre-commit

Run in the repo root:

```bash
# 1. Tooling — husky MUST be >= 9.1 (see pitfalls)
npm install -D husky lint-staged

# 2. Self-installing hook: 'husky init' creates .husky/, sets core.hooksPath
#    and adds "prepare": "husky" to package.json (re-runs on every npm install / npm ci)
npx husky init

# 3. Switch the hook to lint-staged (replaces the 'npm test' sample).
#    LF line ending, no shebang and no +x needed in husky v9 (the wrapper sources the file).
printf '%s\n' 'npx lint-staged' > .husky/pre-commit

# 4. lint-staged config — Prettier's official recommendation
printf '%s\n' '{' '  "*": "prettier --write --ignore-unknown"' '}' > .lintstagedrc.json

# 5. Pay down existing formatting debt ONCE so the first CI run is green (review the diff!)
npx prettier --write .

# 6. Verify exactly what CI runs
npx prettier --check .
```

**Commit:** `package.json`, `package-lock.json`, `.husky/pre-commit`, `.lintstagedrc.json` (plus every file reformatted in step 5). `.husky/_/` is auto-gitignored by husky — never commit it.

**Result:** every `git commit` runs `prettier --write --ignore-unknown` over the staged files and re-stages them. `--ignore-unknown` skips files Prettier can't parse and respects `.prettierignore`.

## ClawStash-specific: the `.claude/` and `data/` exclusions stay

`.prettierignore` deliberately excludes `.claude` (GitNexus rewrites its skill files non-Prettier-formatted, which would otherwise break `format:check` in CI) plus runtime/data paths (`data`, `*.db`, `*.sqlite`, `build-info.json`, `.gitnexus`, etc.). `prettier --write --ignore-unknown` **honors `.prettierignore`**, so the pre-commit hook will never touch those files — no conflict with the GitNexus analyze flow or the SQLite data dir. Keep both the `.prettierignore` exclusions and this guard; they are complementary.

## Critical pitfalls (do not skip)

- **husky >= 9.1 is mandatory.** `prepare: "husky"` runs on every `npm ci` — including the Docker `deps` stage that `COPY package*.json` then `RUN npm ci` **without `.git`** (ClawStash's Dockerfile is multi-stage, Node 26-slim). husky >= 9.1 only prints a warning and **exits 0** when `.git` is missing; older husky versions abort with an error and break the Docker build. Verify: run `node node_modules/husky/bin.js` in a non-git directory → expect exit 0.
- **`.husky/pre-commit` must use LF**, not CRLF (it runs on Linux/CI). Generate it via `printf`, not an editor that writes CRLF.
- **Only commit `.husky/pre-commit`.** husky writes `.husky/_/.gitignore` (`*`), which ignores the wrapper directory. In husky v9 the hook file needs no `+x` and no shebang.
- **`prettier --check .` silently skips files without a parser in directory mode** (shell hook scripts, `.gitignore`, etc.), so the hook scripts never break the check. (Errors occur only for *explicitly named* unknown files — CI passes a directory, so this is harmless.)
- **Never bypass with `git commit --no-verify`.**
- The guard auto-corrects on **commit**. If commits via external GUIs are a concern, add a `pre-push` mirror that runs `npm run format:check` as a hard gate.

## Customization

- Different formatter → change step 4, e.g. `"*": "biome format --write --no-errors-on-unmatched"`.
- Want type-check on commit too → add a targeted entry like `"*.{ts,tsx}": "tsc --noEmit"` — but note `tsc --noEmit` checks the whole project, not just staged files, so this can be slow; keep pre-commit **fast**. ClawStash currently has no ESLint configured (Prettier-only), so there is no `eslint --fix` entry to add yet.

## CLAUDE.md pointer (one-liner)

> **Formatting guard:** staged files are auto-formatted on commit (husky + lint-staged). Setup + pitfalls: `agent_docs/ci_formatting_guard.md`. Never bypass with `--no-verify`.
