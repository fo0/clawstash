#!/bin/sh
set -eu

# ClawStash container entrypoint.
#
# The image starts as root so this script can repair the ownership of the
# data directory before any application code runs, then drops privileges
# to the unprivileged `node` user (uid 1000) — the same pattern the
# official postgres/redis images use.
#
# Why: on Linux hosts Docker auto-creates bind-mount sources (e.g.
# `./data:/app/data`) owned by root:root. Without the chown below the
# `node` user cannot create or write the SQLite database, and every write
# fails with SQLITE_READONLY / SQLITE_CANTOPEN (login breaks while the
# server otherwise appears healthy). Databases created by image versions
# that still ran as root are repaired by the same chown.

DATA_DIR="$(dirname "${DATABASE_PATH:-/app/data/clawstash.db}")"

if [ "$(id -u)" = '0' ]; then
  # Best effort: a failing chown (read-only mount, NFS root_squash, ...)
  # must not abort startup — the app prints an actionable error if the
  # directory is truly unwritable.
  chown -R node:node "$DATA_DIR" 2>/dev/null || true
  exec setpriv --reuid node --regid node --init-groups "$@"
fi

# Container was started with an explicit non-root `user:` override —
# run unchanged; the operator owns mount permissions in that case.
exec "$@"
