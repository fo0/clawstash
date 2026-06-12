import { useCallback, useEffect, useState } from 'react';
import type { BackupStatusResponse, Stash } from '../types';
import { api } from '../api';
import RelativeTime from './shared/RelativeTime';

interface Props {
  stash: Stash;
  onStashUpdated?: (stash: Stash) => void;
}

const STATE_LABELS: Record<string, string> = {
  idle: 'Backed up',
  pending: 'Backup pending',
  syncing: 'Backing up…',
  error: 'Backup error',
};

/**
 * Per-stash backup status bar shown in the viewer when the GitHub backup
 * is configured: state badge, last sync time + commit link, "Back up now"
 * and the per-stash opt-out toggle. Renders nothing while the backup
 * feature is unconfigured so the viewer stays untouched for everyone else.
 */
export default function StashBackupControls({ stash, onStashUpdated }: Props) {
  const [status, setStatus] = useState<BackupStatusResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.getBackupStatus(stash.id));
    } catch {
      setStatus(null); // e.g. no read access — hide the bar
    }
  }, [stash.id]);

  useEffect(() => {
    setMessage(null);
    refresh();
  }, [refresh]);

  if (!status || !status.configured) return null;

  const state = status.states.find((s) => s.stash_id === stash.id) ?? null;

  const handleBackupNow = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.triggerBackupSync({ stashId: stash.id });
      setMessage({
        ok: result.status !== 'error',
        text: result.status === 'skipped' ? 'Already up to date.' : result.message,
      });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Backup failed.' });
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const handleToggleEnabled = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await api.setStashBackupEnabled(stash.id, !stash.backup_enabled);
      onStashUpdated?.(updated);
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Update failed.' });
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const badge = !stash.backup_enabled ? (
    <span className="backup-state-badge backup-state-off" title="Excluded from the GitHub backup">
      Backup off
    </span>
  ) : state ? (
    <span
      className={`backup-state-badge backup-state-${state.state}`}
      title={state.error || undefined}
    >
      {STATE_LABELS[state.state] || state.state}
    </span>
  ) : (
    <span className="backup-state-badge backup-state-pending">Not backed up yet</span>
  );

  return (
    <div className="viewer-backup-bar">
      <span className="viewer-backup-label">GitHub backup:</span>
      {badge}
      {stash.backup_enabled && state?.last_synced_at && (
        <span className="viewer-backup-info">
          synced <RelativeTime dateStr={state.last_synced_at} />
          {state.last_commit_sha && status.repoFullName && (
            <>
              {' · '}
              <a
                href={`https://github.com/${status.repoFullName}/commit/${state.last_commit_sha}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Open the last backup commit on GitHub"
              >
                <code>{state.last_commit_sha.slice(0, 7)}</code>
              </a>
            </>
          )}
        </span>
      )}
      {stash.backup_enabled && (
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleBackupNow}
          disabled={busy}
          title="Push this stash to the backup repository now"
        >
          {busy ? 'Backing up…' : 'Back up now'}
        </button>
      )}
      <button
        className="btn btn-ghost btn-sm"
        onClick={handleToggleEnabled}
        disabled={busy}
        title={
          stash.backup_enabled
            ? 'Exclude this stash from the GitHub backup (removes its mirrored copy on the next sync)'
            : 'Include this stash in the GitHub backup again'
        }
      >
        {stash.backup_enabled ? 'Exclude' : 'Include in backup'}
      </button>
      {state?.error && stash.backup_enabled && (
        <span className="backup-error-text">{state.error}</span>
      )}
      {message && (
        <span className={message.ok ? 'viewer-backup-ok' : 'backup-error-text'}>
          {message.text}
        </span>
      )}
    </div>
  );
}
