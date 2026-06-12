import fs from 'fs';

/**
 * Fail fast with an actionable message when the SQLite database cannot be
 * written. SQLite's documented READWRITE fallback silently opens
 * write-protected files in read-only mode, so without this check the first
 * symptom is a cryptic `SQLITE_READONLY: attempt to write a readonly
 * database` thrown by an unrelated write much later (e.g. session cleanup
 * or admin login) while the server otherwise starts up fine.
 *
 * The classic trigger is a Docker bind mount: on Linux hosts Docker creates
 * the mount source (e.g. `./data`) owned by root:root, while the container
 * process runs as the unprivileged `node` user (uid 1000). The container
 * entrypoint repairs ownership automatically when it starts as root, but a
 * custom `user:` override, an old root-created database file, or a
 * read-only mount can still produce an unwritable database — this check
 * turns all of those into one clear startup error.
 */
export function assertDatabaseWritable(dir: string, dbPath: string): void {
  let problem: string | null = null;

  try {
    // W_OK: create the database + WAL/SHM journal files; X_OK: traverse.
    fs.accessSync(dir, fs.constants.W_OK | fs.constants.X_OK);
  } catch {
    problem = `the database directory '${dir}' is not writable`;
  }

  if (!problem) {
    // A stale root-owned -wal/-shm next to a writable main file breaks
    // writes just the same, so probe the sidecar files too.
    for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      if (!fs.existsSync(file)) continue;
      try {
        fs.accessSync(file, fs.constants.W_OK);
      } catch {
        problem = `the database file '${file}' is not writable`;
        break;
      }
    }
  }

  if (!problem) return;

  const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  const gid = typeof process.getgid === 'function' ? process.getgid() : undefined;
  const who = uid !== undefined ? `this process (uid ${uid})` : 'this process';
  const owner = uid !== undefined ? `${uid}:${gid ?? uid}` : '1000:1000';
  throw new Error(
    [
      `ClawStash cannot start: ${problem} by ${who}.`,
      'SQLite needs write access to the database file AND its directory (WAL journal files).',
      'If you run ClawStash in Docker with a bind mount (e.g. ./data:/app/data), make the',
      'mounted host directory writable for the container user:',
      `  sudo chown -R ${owner} ./data   # host directory mounted to ${dir}`,
      'then restart the container. Details: docs/deployment.md ("Bind mounts & file permissions").',
    ].join('\n'),
  );
}
