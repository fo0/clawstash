import { useEffect, useState } from 'react';
import type { BackupSettingsResponse } from '../../types';
import { api } from '../../api';
import Spinner from '../shared/Spinner';
import BackupConnectCard from './BackupConnectCard';
import BackupTargetCard from './BackupTargetCard';
import BackupActivityCard from './BackupActivityCard';
import BackupLogCard from './BackupLogCard';

type BackupTab = 'connection' | 'target' | 'activity' | 'log';

const TABS: { id: BackupTab; label: string }[] = [
  { id: 'connection', label: 'Connection' },
  { id: 'target', label: 'Target & Schedule' },
  { id: 'activity', label: 'Activity' },
  { id: 'log', label: 'Sync Log' },
];

function CloudIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M12 12v9" />
      <path d="m16 16-4-4-4 4" />
    </svg>
  );
}

/**
 * Settings → GitHub Backup, split into tabs: connect an account (device
 * flow or PAT), pick the target repo/branch and schedule, trigger manual
 * syncs, and inspect the sync log. All endpoints are admin-gated
 * server-side; without admin access the API errors are surfaced inline
 * (same pattern as the token manager).
 */
export default function BackupSection() {
  const [response, setResponse] = useState<BackupSettingsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<BackupTab>('connection');
  // Bumped after "Back up all now" so the sync-log tab refetches.
  const [logRefresh, setLogRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .getBackupSettings()
      .then((data) => {
        if (cancelled) return;
        setResponse(data);
        // Land where the setup funnel left off: connect → pick a target →
        // watch activity.
        setActiveTab(
          !data.tokenSet
            ? 'connection'
            : data.settings.repoOwner && data.settings.repoName
              ? 'activity'
              : 'target',
        );
      })
      .catch((err) => {
        if (cancelled) return;
        // 401 (not logged in) and 403 (no admin) both mean "log in first".
        setLoadError(
          err instanceof Error && /admin|authentication required/i.test(err.message)
            ? 'Login as admin to manage the GitHub backup.'
            : err instanceof Error
              ? err.message
              : 'Could not load backup settings.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const settings = response?.settings;
  const repoFullName =
    settings && settings.repoOwner && settings.repoName
      ? `${settings.repoOwner}/${settings.repoName}`
      : null;

  return (
    <div className="settings-section-content">
      <div className="settings-section-title">
        <span className="settings-section-title-icon">
          <CloudIcon />
        </span>
        <h2>GitHub Backup</h2>
      </div>
      <p className="settings-section-desc">
        Mirror stashes into a GitHub repository — on a schedule, shortly after every change, and on
        demand. ClawStash is the source of truth: the configured branch is overwritten on conflict
        (last writer wins).
      </p>

      {loadError && (
        <div role="status" className="settings-import-error">
          {loadError}
        </div>
      )}

      {!loadError && !response && (
        <div className="settings-card">
          <Spinner />
        </div>
      )}

      {!loadError && response && (
        <>
          <div className="api-tabs backup-tabs" role="tablist" aria-label="GitHub backup sections">
            {TABS.map((tab) => {
              const showAlert = tab.id === 'activity' && response.unhealthy;
              return (
                <button
                  key={tab.id}
                  id={`backup-tab-${tab.id}`}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  // The alert dot is visual-only — mirror it for screen readers.
                  aria-label={showAlert ? `${tab.label} — has sync failures` : undefined}
                  className={`api-tab ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                  {showAlert && (
                    <span className="backup-tab-alert" title="The backup has sync failures" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Panels are hidden, not unmounted: a pending device-flow login
              keeps polling and unsaved form edits survive tab switches. */}
          <div
            role="tabpanel"
            aria-labelledby="backup-tab-connection"
            hidden={activeTab !== 'connection'}
          >
            <BackupConnectCard response={response} onUpdated={setResponse} />
          </div>
          <div role="tabpanel" aria-labelledby="backup-tab-target" hidden={activeTab !== 'target'}>
            <BackupTargetCard response={response} onSaved={setResponse} />
          </div>
          <div
            role="tabpanel"
            aria-labelledby="backup-tab-activity"
            hidden={activeTab !== 'activity'}
          >
            <BackupActivityCard onSyncRan={() => setLogRefresh((n) => n + 1)} />
          </div>
          <div role="tabpanel" aria-labelledby="backup-tab-log" hidden={activeTab !== 'log'}>
            <BackupLogCard repoFullName={repoFullName} refreshToken={logRefresh} />
          </div>
        </>
      )}
    </div>
  );
}
