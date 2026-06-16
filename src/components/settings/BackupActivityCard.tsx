import { useCallback, useEffect, useState } from 'react';
import type { BackupStatusResponse, BackupSyncState } from '../../types';
import { api } from '../../api';
import { formatDateTime } from '../../utils/format';
import Spinner from '../shared/Spinner';
import CommitLink from '../shared/CommitLink';

const STATE_LABELS: Record<BackupSyncState, string> = {
  idle: 'Synced',
  pending: 'Pending',
  syncing: 'Syncing',
  error: 'Error',
};

// The status endpoint returns one row per stash unbounded; with hundreds of
// stashes the table would grow the Settings card to thousands of pixels.
// Render a capped slice by default and let the operator expand on demand
// (mirrors the server-side limit on the sync log). BACKLOG #113.
const STATE_ROW_CAP = 50;

interface Props {
  /** Called after a manual run so sibling tabs (sync log) can refetch. */
  onSyncRan?: () => void;
}

/**
 * Sync activity: health summary, "Back up all now" and per-stash states.
 * Self-refreshing after manual runs.
 */
export default function BackupActivityCard({ onSyncRan }: Props) {
  const [status, setStatus] = useState<BackupStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showAllStates, setShowAllStates] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const statusData = await api.getBackupStatus();
      setStatus(statusData);
      setLoadFailed(false);
    } catch (err) {
      console.error('Failed to load backup status:', err);
      setLoadFailed(true);
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
      // Both success and failure produce log entries.
      onSyncRan?.();
    }
  };

  if (loading) {
    return (
      <div className="settings-card">
        <Spinner />
      </div>
    );
  }
  if (!status) {
    // Never loaded successfully — show the failure instead of silently
    // dropping the whole card.
    if (!loadFailed) return null;
    return (
      <div className="settings-card">
        <div className="settings-card-header">
          <h3>Sync Activity</h3>
        </div>
        <div className="settings-import-error">Could not load the backup status.</div>
        <div className="settings-option-group">
          <button className="btn btn-secondary btn-sm" onClick={refresh}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { health } = status;
  const visibleStates =
    showAllStates || status.states.length <= STATE_ROW_CAP
      ? status.states
      : status.states.slice(0, STATE_ROW_CAP);

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <h3>Sync Activity</h3>
      </div>

      {loadFailed && (
        <div role="status" className="settings-import-error">
          Could not refresh the backup status — the data below may be stale.
        </div>
      )}

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
        <div
          role="status"
          className={result.ok ? 'settings-import-success' : 'settings-import-error'}
        >
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
              {visibleStates.map((s) => (
                <tr key={s.stash_id}>
                  <td>{s.stash_name || s.stash_id}</td>
                  <td>
                    <span className={`backup-state-badge backup-state-${s.state}`}>
                      {s.pending_delete ? 'Pending delete' : STATE_LABELS[s.state] || s.state}
                    </span>
                    {s.error && <div className="backup-error-text">{s.error}</div>}
                  </td>
                  <td>{s.last_synced_at ? formatDateTime(s.last_synced_at) : '—'}</td>
                  <td>
                    {s.last_commit_sha ? (
                      <CommitLink repoFullName={status.repoFullName} sha={s.last_commit_sha} />
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {status.states.length > STATE_ROW_CAP && (
            <div className="settings-option-group">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowAllStates((v) => !v)}
              >
                {showAllStates ? 'Show fewer' : `Show all ${status.states.length} stashes`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
