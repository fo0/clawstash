# Scratchpad -- Short-Term

Temporary working context. **Clean up aggressively -- delete when resolved.**

## Current Work

- Agent onboarding sweep (2026-09-06) on `claude/upbeat-cori-u5j792`: new `src/server/agent-guide.ts` (limits from constants, endpoint map, shared prose, MCP `instructions`, SKILL.md, `/llms.txt`), MCP server hands out `instructions` + two guide resources + `get_server_info`, `check_version` / `/api/version` gained `upgrade` (instructions + compare URL), `/api/mcp-onboarding` restructured (guide first, spec second), `refresh_tools` / `list_stashes` / `search_stashes` descriptions corrected (real paging max 1000, ordering, "not periodically"). GUI: "Copy onboarding prompt for your agent" + "Open SKILL.md" on the MCP tab, prompt-with-token button in the new-token banner. Side quest fixed: graph view's back button / Escape return to the stash the graph was opened from. Chain green (tsc, lint, 668 tests, build); browser verification of graph-back + MCP tab pending at time of writing. Open (not done, deliberately): MCP `prompts` primitive (no client demand yet), REST-only "meta" variant of `GET /api/stashes/{id}` (MCP `read_stash` has one, REST returns full content).

- UX refine sweep (2026-08-27) on `claude/upbeat-ramanujan-54jukj` (issue #543, PR #544): three existing features sharpened, no new ones — per-stash GitHub backup bar ("Exclude" now takes the app's two-click armed confirm, since it drops the mirrored copy on the next sync), viewer History tab (50 per page + "Showing the N most recent versions." + "Show more", compare selection preserved across a widen; `api.getVersions` gained the `limit` the route already accepted), version diff view (per-file collapse + Collapse/Expand all, folded files keep their +N / -M). Full local chain green. Cut by the tie-breaker, all still open: sync-log truncation footer, footer build-commit link, `aria-label` on the version-list restore confirm, sort/archived preference in Settings → General.

- UX refine sweep (2026-08-20) on `claude/confident-euler-v5xv8t`: three existing features sharpened, no new ones — sidebar list (honest empty state + "Load more", new `Sidebar.listfooter.test.tsx`), Settings → Storage (export result/error of its own, import confirm names the data at risk), viewer Access Log (truncation footer + "Show more" up to the server's 1000). Full chain green. Rejected as too large for the sweep: settings deep-links (#458), roving tabindex (#457), graph keyboard path (#465).

- Copy button on Markdown code blocks (2026-08-02) on `claude/markdown-code-copy-button-5skt9n`: emitted into the rendered blob + delegated handler; verified in a real browser (hover/keyboard/touch, clipboard content, no overlap at max h-scroll, Mermaid + memo intact after F5). Decision recorded in MEMORY.md.

- Whole-app UI/UX review + bugfix sweep (2026-07-26) on `claude/ui-ux-review-bugfixes-hnuu1q`: 5 parallel review agents (shell / viewer / editor / settings+API / graph) + real-browser walkthrough (Playwright, dev server on :3100, scratch DB). 13 P1s fixed (armed delete-confirm surviving stash switch, useClickOutside Escape contract, select-stash race, hotkeys on login screen, editor silent data loss, StrictMode mountedRef bugs, broken cURL example, tag graph built from filtered page-1 list, silent focus-fetch failure) + ~40 trivial P2s; non-trivial P2s deferred to BACKLOG #131-#148.

- Backlog sweep (2026-08-05): closed #127 (client-side 10MB pre-submit block + readable Zod issue paths). Everything else still open was re-checked against the code — nothing obsolete, and all 15 remaining entries are sized above a sweep-sized change (>3 files or >50 LoC) or need a dependency bump (#119) / new dependency (#105). #133's roving tabindex needs a shared hook + 3 tab bars + a hook test, so it stays deferred.

- Backlog sweep (2026-07-29): closed #140, #136, #132, #142, #126, #139. Everything still open was re-checked against the code and is current — nothing was obsolete. #54 (DOMPurify) stays closed by the settled decision in MEMORY.md; #119 needs a `next` bump, which is a dependency change.

## Temporary Notes

- #108 follow-ups deliberately out of scope (per issue): restore-from-repo, multi-repo targets, pull-based sync, at-rest encryption inside the backup repo, GitHub App auth.
