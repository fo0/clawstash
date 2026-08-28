# CI Formatting Guard -- auto-format staged files on commit

**Status: not installed.** This file is the decision record plus the ClawStash-specific traps, so that whoever installs
the guard does not rediscover them. The CLAUDE.md pointer under _Git Conventions_ marks it optional for the same reason.

## Problem

Hand-edited files -- long Markdown tables especially (`BACKLOG.md`, the env-var table in `CLAUDE.md`) -- drift from
Prettier's normalization and get committed unformatted. Two workflows then catch it, both only after the push:
`docker-publish.yml` runs `npm run format:check` over the whole repo, and `docs-format.yml` runs a pinned Prettier over
`**/*.md` on every push and PR touching Markdown. Running `npm run format` by hand before each commit is the current
guard, and it depends on memory.

## Contract the guard has to satisfy

Not a recipe -- the requirements any implementation is judged against:

| Requirement        | Meaning here                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| Formatter          | whatever `package.json` declares -- today Prettier, via the existing `format` / `format:check` scripts |
| Scope              | staged files only, re-staged after formatting; a whole-repo pass on commit is too slow                 |
| Respects ignores   | `.prettierignore` must still apply (see the exclusions below -- this is the load-bearing part)         |
| Self-installing    | a fresh clone and every `npm ci` gets the hook without a manual step                                   |
| Survives no-`.git` | must not break the Docker build (see pitfalls)                                                         |
| Never bypassed     | `git commit --no-verify` is out, unconditionally -- CLAUDE.md _Git Conventions_ states this            |

Derive the concrete tooling and commands from `package.json` at install time; if the formatter ever changes, the
contract above is what carries over, not a command written here.

## ClawStash-specific: the `.claude/` and `data/` exclusions stay

`.prettierignore` deliberately excludes `.claude` -- GitNexus rewrites its skill files non-Prettier-formatted, which
would otherwise break `format:check` in CI -- plus the runtime/data paths (`data`, `*.db`, `*.sqlite`,
`build-info.json`, `.gitnexus`). Any pre-commit formatter must honor `.prettierignore`, or it will fight the GitNexus
analyze flow and the SQLite data dir on every commit. Keep the exclusions and the guard together; they are
complementary, not alternatives.

## Pitfalls this repo would hit

- **The Docker build has no `.git`.** The multi-stage Dockerfile's `builder` stage (`node:26-slim`) does
  `COPY package.json package-lock.json ./` then `RUN npm ci`. A `prepare` script that installs git hooks runs there
  too, with no repository present -- pick a hook
  installer that exits 0 in that situation instead of aborting, and verify it by running the installer in a non-git
  directory and checking the exit code. Getting this wrong breaks the image build, not the commit.
- **The hook file must be LF.** It executes on Linux and in CI; a CRLF hook fails there while looking fine locally.
  Generate it from the shell, not from an editor that rewrites line endings.
- **Commit only the hook file itself**, never the installer's generated wrapper directory.
- **Keep the hook fast.** `npx tsc --noEmit` and the type-aware ESLint config both check the whole project rather than
  the staged subset -- they belong in `npm run lint` and CI, not in a pre-commit hook.
- **Pay down existing formatting debt once** (`npm run format`, review the diff) before the first commit through the
  guard, otherwise it reformats unrelated files inside someone's next commit.

## CLAUDE.md pointer (one-liner)

> **Formatting guard (optional):** husky + lint-staged auto-format on commit -- `agent_docs/ci_formatting_guard.md`.
> Never bypass with `--no-verify`.
