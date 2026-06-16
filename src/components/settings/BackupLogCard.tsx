import { useCallback, useEffect, useState } from 'react';
import type { BackupLogEntry } from '../../types';
import { api } from '../../api';
import { formatDateTime } from '../../utils/format';
import Spinner from '../shared/Spinner';
import CommitLink from '../shared/CommitLink';

interface Props {
  /** Saved backup target for commit links (null when no repo is configured). */
  repoFullName: string | null;
  /** Bumped by the parent after a manual sync so the log refetches. */
  refreshToken: number;
}

/**
 * Recent sync log: every scheduled / mutation / manual run, including
 * skipped no-change runs, with trigger, result, and commit link.
 */
export default function BackupLogCard({ repoFullName, refreshToken }: Props) {
  const [log, setLog] = useState<BackupLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getBackupLog({ limit: 50 });
      setLog(data.entries);
      setLoadFailed(false);
    } catch (err) {
      console.error('Failed to load backup log:', err);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, refreshToken]);

  if (loading) {
    return (
      <div className="settings-card">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <h3>Recent Sync Log</h3>
      </div>

      {loadFailed && (
        <div role="status" className="settings-import-error">
          Could not load the sync log{log.length > 0 ? ' — the entries below may be stale' : ''}.
        </div>
      )}

      <div className="settings-option-group">
        <button className="btn btn-secondary btn-sm" onClick={refresh}>
          Refresh
        </button>
      </div>

      {log.length === 0 && !loadFailed && <p className="api-hint">No sync runs recorded yet.</p>}

      {log.length > 0 && (
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
                    {entry.message}{' '}
                    <CommitLink repoFullName={repoFullName} sha={entry.commit_sha} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
