---
name: verify
description: Drive the running ClawStash app in a real browser to verify UI/UX changes end-to-end. Use after nontrivial frontend changes, before committing — tests and tsc alone have missed lifecycle/timing bugs in this repo before (see MEMORY.md #286).
---

# Verify ClawStash in a real browser

## Launch

```bash
npm install                # fresh containers start without node_modules
DATABASE_PATH=/tmp/verify.db PORT=3100 npm run dev   # isolated scratch DB, non-default port
# server is up when: curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/ -> 200 (~1-5 s)
```

Use a scratch `DATABASE_PATH` outside the repo — never let a verification run
create or touch `./data/`.

## Drive

Chromium is pre-installed for Playwright in remote sessions
(`/opt/pw-browsers/chromium-*/chrome-linux/chrome`; `ls /opt/pw-browsers/`).
The repo does not depend on Playwright — install `playwright-core` into a
scratch dir (NOT the repo) and point `chromium.launch({ executablePath })` at
the pre-installed binary. Do not run `playwright install`.

Useful selectors/flows that exist today:

- Create stash: `.btn-new-stash` → `#stash-name`, `.file-name-input`,
  `.code-editor-wrapper textarea`, `button:has-text("Save Stash")`.
- Viewer URL shape: `/stash/<uuid>`; editor: `/stash/<uuid>/edit`.
- Overlays: `?` → `.shortcuts-help-dialog`, `Alt+K` → `.search-overlay`.
- Global hotkeys (`n`, `e`, `a`, Escape) are inert while typing in inputs —
  to exercise them, focus a button/heading first.
- Dirty-editor guards use `window.confirm` — handle Playwright `dialog` events.
- Graph: `/graph`, canvas `.graph-canvas`; hit-test nodes by probing a small
  click grid around the canvas center.

## Gotchas

- Run `npm run format` (pinned Prettier from node_modules) before judging
  `git status` — hooks/other Prettier versions can reformat files you never
  touched; the pinned run restores them.
- `npm install` with a different npm major may churn `package-lock.json`
  (e.g. `libc` fields). If you added no dependency, `git checkout -- package-lock.json`.
- Kill the dev server before committing (`pkill -f "next dev"`).
