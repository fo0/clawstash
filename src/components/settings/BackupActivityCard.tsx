import { useCallback, useEffect, useState } from 'react';
import type { BackupLogEntry, BackupStatusResponse } from '../../types';
import { api } from '../../api';
import { formatDateTime } from '../../utils/format';
import Spinner from '../shared/Spinner';

const STATE_LABELS: Record<string, string> = {
  idle: 'Synced',
  pending: 'Pending',
  syncing: 'Syncing',
  error: 'Error',
};

function commitLink(repoFullName: string | null, sha: string | null) {
  if (!sha) return null;
  const short = sha.slice(0, 7);
  if (!repoFullName) return <code>{short}</code>;
  return (
    <a
      href={`https://github.com/${repoFullName}/commit/${sha}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      <code>{short}</code>
    </a>
  );
}

/**
 * Sync activity: health summary, "Back up all now", per-stash states and
 * the recent sync log. Self-refreshing after manual runs.
 */
export default function BackupActivityCard() {
  const [status, setStatus] = useState<BackupStatusResponse | null>(null);
  const [log, setLog] = useState<BackupLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [statusData, logData] = await Promise.all([
        api.getBackupStatus(),
        api.getBackupLog({ limit: 50 }),
      ]);
      setStatus(statusData);
      setLog(logData.entries);
    } catch (err) {
      console.error('Failed to load backup status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleBackupNow = async () => {
    setSyncing(true);
    setResult(null);
    try {
      const run = await api.triggerBackupSync();
      setResult({
        ok: run.status === 'success' || run.status === 'skipped',
        message: run.status === 'skipped' ? 'Everything is up to date.' : run.message,
      });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Backup failed.' });
    } finally {
      setSyncing(false);
      refresh();
    }
  };

  if (loading) {
    return (
      <div className="settings-card">
        <Spinner />
      </div>
    );
  }
  if (!status) return null;

  const { health } = status;

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <h3>Sync Activity</h3>
      </div>

      {status.unhealthy && (
        <div className="settings-import-error">
          {health.consecutiveFailures} consecutive sync failures — last error:{' '}
          {health.lastError || 'unknown'}
        </div>
      )}

      <p className="api-hint">
        {health.lastRunAt
          ? `Last run: ${formatDateTime(health.lastRunAt)} (${health.lastRunStatus})`
          : 'No sync has run yet.'}
        {status.intervalMinutes > 0 && status.enabled
          ? ` — scheduled every ${status.intervalMinutes >= 60 ? `${status.intervalMinutes / 60} h` : `${status.intervalMinutes} min`}`
          : ' — schedule off'}
      </p>

      <div className="settings-option-group">
        <button
          className="btn btn-primary"
          onClick={handleBackupNow}
          disabled={syncing || !status.configured}
        >
          {syncing ? 'Backing up…' : 'Back up all now'}
        </button>
        <button className="btn btn-secondary" onClick={refresh} disabled={syncing}>
          Refresh
        </button>
      </div>
      {result && (
        <div className={result.ok ? 'settings-import-success' : 'settings-import-error'}>
          {result.message}
        </div>
      )}

      {status.states.length > 0 && (
        <div className="backup-table-wrap">
          <table className="backup-table">
            <thead>
              <tr>
                <th>Stash</th>
                <th>State</th>
                <th>Last sync</th>
                <th>Commit</th>
              </tr>
            </thead>
            <tbody>
              {status.states.map((s) => (
                <tr key={s.stash_id}>
                  <td>{s.stash_name || s.stash_id}</td>
                  <td>
                    <span className={`backup-state-badge backup-state-${s.state}`}>
                      {s.pending_delete ? 'Pending delete' : STATE_LABELS[s.state] || s.state}
                    </span>
                    {s.error && <div className="backup-error-text">{s.error}</div>}
                  </td>
                  <td>{s.last_synced_at ? formatDateTime(s.last_synced_at) : '—'}</td>
                  <td>{commitLink(status.repoFullName, s.last_commit_sha) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {log.length > 0 && (
        <>
          <div className="settings-card-header backup-log-header">
            <h3>Recent Sync Log</h3>
          </div>
          <div className="backup-table-wrap">
            <table className="backup-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Trigger</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {log.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDateTime(entry.started_at)}</td>
                    <td>{entry.trigger}</td>
                    <td>
                      <span className={`backup-state-badge backup-log-${entry.status}`}>
                        {entry.status}
                      </span>
                    </td>
                    <td>
                      {entry.stash_name ? `${entry.action ?? 'sync'} ${entry.stash_name} ` : ''}
                      {entry.message} {commitLink(status.repoFullName, entry.commit_sha)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
