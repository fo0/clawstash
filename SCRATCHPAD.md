# Scratchpad -- Short-Term

Temporary working context. **Clean up aggressively -- delete when resolved.**

## Current Work

- Whole-app UI/UX review + bugfix sweep (2026-07-26) on `claude/ui-ux-review-bugfixes-hnuu1q`: 5 parallel review agents (shell / viewer / editor / settings+API / graph) + real-browser walkthrough (Playwright, dev server on :3100, scratch DB). 13 P1s fixed (armed delete-confirm surviving stash switch, useClickOutside Escape contract, select-stash race, hotkeys on login screen, editor silent data loss, StrictMode mountedRef bugs, broken cURL example, tag graph built from filtered page-1 list, silent focus-fetch failure) + ~40 trivial P2s; non-trivial P2s deferred to BACKLOG #131-#148.

- Backlog sweep (2026-07-29): closed #140, #136, #132, #142, #126, #139. Everything still open was re-checked against the code and is current — nothing was obsolete. #54 (DOMPurify) stays closed by the settled decision in MEMORY.md; #119 needs a `next` bump, which is a dependency change.

## Open Questions

_(None)_

## Research Notes

_(None)_

## Temporary Notes

- #108 follow-ups deliberately out of scope (per issue): restore-from-repo, multi-repo targets, pull-based sync, at-rest encryption inside the backup repo, GitHub App auth.
