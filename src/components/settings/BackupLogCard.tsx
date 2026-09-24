import { useCallback, useEffect, useRef, useState } from 'react';
import type { BackupLogEntry } from '../../types';
import { api } from '../../api';
import { formatDateTime } from '../../utils/format';
import Spinner from '../shared/Spinner';
import CommitLink from '../shared/CommitLink';

/**
 * How many sync-log runs the card requests at once, and how far "Show more"
 * may widen it. `LOG_MAX` mirrors the route's own ceiling
 * (`Math.min(limit, 200)` in `api/backup/log/route.ts`) — asking for more
 * would silently return the same page and leave the button useless.
 */
const LOG_PAGE_SIZE = 50;
const LOG_MAX = 200;

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
  // Separate from `loading`: the initial load swaps the whole card for a
  // spinner, whereas a manual refresh keeps the table on screen and only
  // needs to mark the button busy.
  const [refreshing, setRefreshing] = useState(false);
  // A manual refresh and a `refreshToken` bump (parent ran a sync) can be in
  // flight at the same time — order of resolution is not guaranteed, so the
  // older one must not overwrite the newer. BACKLOG #139.
  const logRequestGen = useRef(0);
  // How many runs the card asks for. Pinned at 50, the table rendered the
  // newest page as if it were the whole log, so older runs were unreachable
  // and — worse — invisible.
  const [limit, setLimit] = useState(LOG_PAGE_SIZE);
  // The limit the rows on screen were fetched with, kept apart from `limit`
  // so the footer describes the rendered list rather than the request in
  // flight (otherwise it would vanish under the cursor on "Show more").
  const [loadedLimit, setLoadedLimit] = useState(LOG_PAGE_SIZE);

  const refresh = useCallback(async () => {
    const gen = ++logRequestGen.current;
    setRefreshing(true);
    try {
      const data = await api.getBackupLog({ limit });
      if (gen !== logRequestGen.current) return;
      setLog(data.entries);
      setLoadedLimit(limit);
      setLoadFailed(false);
    } catch (err) {
      if (gen !== logRequestGen.current) return;
      console.error('Failed to load backup log:', err);
      setLoadFailed(true);
    } finally {
      if (gen === logRequestGen.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [limit]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshToken]);

  if (loading) {
    return (
      <div className="settings-card" role="status" aria-live="polite">
        <Spinner />
        <span className="sr-only">Loading sync log…</span>
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
        <button
          className="btn btn-secondary btn-sm"
          onClick={refresh}
          disabled={refreshing}
          aria-busy={refreshing}
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {log.length === 0 && !loadFailed && <p className="api-hint">No sync runs recorded yet.</p>}

      {/* Focusable scroll container — see BackupActivityCard (WCAG 2.1.1). */}
      {log.length > 0 && (
        <div
          className="backup-table-wrap"
          // Deliberate: see BackupActivityCard (WCAG 2.1.1).
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable scroll region
          tabIndex={0}
          role="region"
          aria-label="Sync log"
        >
          <table className="backup-table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Trigger</th>
                <th scope="col">Status</th>
                <th scope="col">Details</th>
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

      {/* A full page means older runs exist that are NOT on screen — say how
          many are shown and offer the next page, up to the route's ceiling.
          Same footer as the access log and the version history. */}
      {log.length >= loadedLimit && (
        <div className="backup-log-footer">
          <span className="backup-log-hint">
            Showing the {log.length} most recent runs.
            {loadedLimit >= LOG_MAX && ' This is the maximum the server returns.'}
          </span>
          {loadedLimit < LOG_MAX && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setLimit((current) => Math.min(current + LOG_PAGE_SIZE, LOG_MAX))}
              disabled={refreshing}
              aria-busy={refreshing || undefined}
            >
              {refreshing ? 'Loading…' : 'Show more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
