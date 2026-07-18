/**
 * Next.js instrumentation hook — runs once when the server boots (dev,
 * `next start`, and standalone output alike). Used to start the GitHub
 * backup scheduler so scheduled syncs run even when no request ever
 * arrives. Refs #108.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!process.env.ADMIN_PASSWORD) {
    console.warn(
      '[security] ADMIN_PASSWORD is not set: ClawStash is running in OPEN MODE. All REST/MCP routes (including admin data export, token CRUD, and GitHub-backup config) are reachable without authentication. Set ADMIN_PASSWORD to require login.',
    );
  }
  try {
    // Dynamic import: keeps better-sqlite3 (native addon) out of the
    // edge/client bundles that also evaluate this module's exports.
    const { initBackupScheduler } = await import('./server/backup/backup-scheduler');
    initBackupScheduler();
  } catch (err) {
    // Backup must never prevent the app from booting.
    console.error('[backup] scheduler init failed:', err);
  }
}
