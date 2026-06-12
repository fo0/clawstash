import { useEffect, useRef, useState } from 'react';
import type { BackupRepoInfo, BackupSettings, BackupSettingsResponse } from '../../types';
import { api } from '../../api';
import Spinner from '../shared/Spinner';
import BackupConnectCard from './BackupConnectCard';
import BackupActivityCard from './BackupActivityCard';

/** Display form of the saved repo target ("owner/name", or a lone owner). */
function formatRepoTarget(settings: { repoOwner: string; repoName: string }): string {
  return settings.repoOwner && settings.repoName
    ? `${settings.repoOwner}/${settings.repoName}`
    : settings.repoOwner;
}

const INTERVAL_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Off (manual / on change only)' },
  { value: 5, label: 'Every 5 minutes' },
  { value: 15, label: 'Every 15 minutes' },
  { value: 60, label: 'Every hour' },
  { value: 360, label: 'Every 6 hours' },
  { value: 1440, label: 'Every 24 hours' },
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
 * Settings → GitHub Backup. Connect an account (device flow or PAT), pick
 * the target repo/branch, configure the schedule, trigger manual syncs and
 * inspect the sync log. All endpoints are admin-gated server-side; without
 * admin access the API errors are surfaced inline (same pattern as the
 * token manager).
 */
export default function BackupSection() {
  const [response, setResponse] = useState<BackupSettingsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<BackupSettings | null>(null);
  // Raw text of the repository input. Kept separately from the derived
  // repoOwner/repoName so a trailing "/" survives while typing — deriving
  // the input value from the parsed halves would swallow the slash and make
  // manual "owner/repo" entry impossible.
  const [repoInput, setRepoInput] = useState('');
  const [repos, setRepos] = useState<BackupRepoInfo[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  // Drops out-of-order branch responses (rapid repo switches).
  const branchRequestGen = useRef(0);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);

  const applyResponse = (data: BackupSettingsResponse) => {
    setResponse(data);
    setForm((prev) => ({
      ...data.settings,
      // Keep unsaved target/schedule edits when only the connection changed.
      ...(prev
        ? {
            repoOwner: prev.repoOwner,
            repoName: prev.repoName,
            branch: prev.branch,
            pathPrefix: prev.pathPrefix,
            intervalMinutes: prev.intervalMinutes,
            deleteMode: prev.deleteMode,
            commitAuthorName: prev.commitAuthorName,
            commitAuthorEmail: prev.commitAuthorEmail,
            enabled: prev.enabled,
          }
        : {}),
    }));
  };

  useEffect(() => {
    let cancelled = false;
    api
      .getBackupSettings()
      .then((data) => {
        if (cancelled) return;
        setResponse(data);
        setForm(data.settings);
        setRepoInput(formatRepoTarget(data.settings));
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

  // Repo suggestions once connected.
  const tokenSet = response?.tokenSet ?? false;
  useEffect(() => {
    if (!tokenSet) {
      setRepos([]);
      return;
    }
    let cancelled = false;
    api
      .listBackupRepos()
      .then((data) => {
        if (!cancelled) setRepos(data.repos);
      })
      .catch(() => {
        /* dropdown stays empty — manual entry still works */
      });
    return () => {
      cancelled = true;
    };
  }, [tokenSet]);

  const loadBranches = async (owner: string, repo: string) => {
    if (!owner || !repo) return;
    const gen = ++branchRequestGen.current;
    try {
      const data = await api.listBackupBranches(owner, repo);
      if (gen !== branchRequestGen.current) return;
      setBranches(data.branches);
      setForm((prev) => (prev && !prev.branch ? { ...prev, branch: data.defaultBranch } : prev));
    } catch {
      if (gen === branchRequestGen.current) setBranches([]);
    }
  };

  const handleRepoInput = (value: string) => {
    setRepoInput(value);
    // Any change invalidates the previously loaded branch list.
    branchRequestGen.current++;
    setBranches([]);
    const [owner = '', name = ''] = value.split('/', 2);
    setForm((prev) => (prev ? { ...prev, repoOwner: owner.trim(), repoName: name.trim() } : prev));
    const match = repos.find((r) => r.fullName === value);
    if (match) {
      setForm((prev) => (prev ? { ...prev, branch: match.defaultBranch } : prev));
      loadBranches(owner.trim(), name.trim());
    }
  };

  const handleSave = async () => {
    if (!form || !response) return;
    setSaving(true);
    setSaveResult(null);
    try {
      // The OAuth client ID is owned by the connect card / server — submit
      // the latest known value so saving cannot clobber it.
      const saved = await api.saveBackupSettings({
        ...form,
        branch: form.branch.trim() || 'main',
        oauthClientId: response.settings.oauthClientId,
      });
      setResponse(saved);
      setForm(saved.settings);
      setRepoInput(formatRepoTarget(saved.settings));
      setSaveResult({
        ok: true,
        message:
          saved.settings.enabled && !saved.tokenSet
            ? 'Settings saved. Connect a GitHub account to activate the backup.'
            : 'Settings saved.',
      });
    } catch (err) {
      setSaveResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Saving failed.',
      });
    } finally {
      setSaving(false);
    }
  };

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

      {loadError && <div className="settings-import-error">{loadError}</div>}

      {!loadError && (!response || !form) && (
        <div className="settings-card">
          <Spinner />
        </div>
      )}

      {!loadError && response && form && (
        <>
          <BackupConnectCard response={response} onUpdated={applyResponse} />

          <div className="settings-card">
            <div className="settings-card-header">
              <h3>Target & Schedule</h3>
            </div>

            <label className="backup-field-label" htmlFor="backup-repo">
              Repository
            </label>
            <div className="backup-form-row">
              <input
                id="backup-repo"
                className="form-input"
                placeholder="owner/repository"
                list="backup-repo-list"
                value={repoInput}
                onChange={(e) => handleRepoInput(e.target.value)}
                // Locked until a connection exists or a target was saved —
                // without a token the repo cannot be listed or synced anyway.
                disabled={!tokenSet && repos.length === 0 && !form.repoOwner && !repoInput}
              />
              <datalist id="backup-repo-list">
                {repos.map((r) => (
                  <option key={r.fullName} value={r.fullName} />
                ))}
              </datalist>
            </div>

            <label className="backup-field-label" htmlFor="backup-branch">
              Branch
            </label>
            <div className="backup-form-row">
              <input
                id="backup-branch"
                className="form-input"
                placeholder="main"
                list="backup-branch-list"
                value={form.branch}
                onFocus={() => {
                  if (branches.length === 0) loadBranches(form.repoOwner, form.repoName);
                }}
                onChange={(e) => setForm({ ...form, branch: e.target.value })}
              />
              <datalist id="backup-branch-list">
                {branches.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>

            <label className="backup-field-label" htmlFor="backup-prefix">
              Path prefix in repository
            </label>
            <div className="backup-form-row">
              <input
                id="backup-prefix"
                className="form-input"
                placeholder="stashes"
                value={form.pathPrefix}
                onChange={(e) => setForm({ ...form, pathPrefix: e.target.value })}
              />
            </div>

            <label className="backup-field-label" htmlFor="backup-interval">
              Scheduled sync
            </label>
            <div className="backup-form-row">
              <select
                id="backup-interval"
                className="form-input"
                value={form.intervalMinutes}
                onChange={(e) => setForm({ ...form, intervalMinutes: Number(e.target.value) })}
              >
                {INTERVAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="api-hint">
              Changes are additionally pushed ~10 seconds after every create / update / delete.
            </p>

            <label className="backup-field-label" htmlFor="backup-delete-mode">
              When a stash is deleted
            </label>
            <div className="backup-form-row">
              <select
                id="backup-delete-mode"
                className="form-input"
                value={form.deleteMode}
                onChange={(e) =>
                  setForm({ ...form, deleteMode: e.target.value as 'remove' | 'keep' })
                }
              >
                <option value="remove">Remove its files from the repo (history keeps them)</option>
                <option value="keep">Keep its files in the repo</option>
              </select>
            </div>

            <label className="backup-field-label" htmlFor="backup-author-name">
              Commit author
            </label>
            <div className="backup-form-row">
              <input
                id="backup-author-name"
                className="form-input"
                placeholder="Name"
                aria-label="Commit author name"
                value={form.commitAuthorName}
                onChange={(e) => setForm({ ...form, commitAuthorName: e.target.value })}
              />
              <input
                className="form-input"
                placeholder="email@example.com"
                aria-label="Commit author email"
                value={form.commitAuthorEmail}
                onChange={(e) => setForm({ ...form, commitAuthorEmail: e.target.value })}
              />
            </div>

            <label className="backup-toggle-row">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              />
              <span>Enable automatic backups (scheduled + on change)</span>
            </label>

            <div className="settings-option-group">
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || !form.commitAuthorName.trim() || !form.commitAuthorEmail.trim()}
              >
                {saving ? 'Saving…' : 'Save settings'}
              </button>
            </div>
            {saveResult && (
              <div className={saveResult.ok ? 'settings-import-success' : 'settings-import-error'}>
                {saveResult.message}
              </div>
            )}
          </div>

          <BackupActivityCard />
        </>
      )}
    </div>
  );
}
