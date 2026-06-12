/**
 * Next.js instrumentation hook — runs once when the server boots (dev,
 * `next start`, and standalone output alike). Used to start the GitHub
 * backup scheduler so scheduled syncs run even when no request ever
 * arrives. Refs #108.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
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
