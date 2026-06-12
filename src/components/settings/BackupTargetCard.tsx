import { useEffect, useRef, useState } from 'react';
import type { BackupRepoInfo, BackupSettings, BackupSettingsResponse } from '../../types';
import { api } from '../../api';

interface Props {
  response: BackupSettingsResponse;
  onSaved: (response: BackupSettingsResponse) => void;
}

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

/**
 * Target & Schedule form: repo/branch/path, sync interval, delete mode,
 * commit author and the enable toggle. Owns the form state so unsaved
 * edits survive tab switches; saved settings flow back via onSaved.
 */
export default function BackupTargetCard({ response, onSaved }: Props) {
  const [form, setForm] = useState<BackupSettings>(response.settings);
  // Raw text of the repository input. Kept separately from the derived
  // repoOwner/repoName so a trailing "/" survives while typing — deriving
  // the input value from the parsed halves would swallow the slash and make
  // manual "owner/repo" entry impossible.
  const [repoInput, setRepoInput] = useState(() => formatRepoTarget(response.settings));
  const [repos, setRepos] = useState<BackupRepoInfo[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  // Drops out-of-order branch responses (rapid repo switches).
  const branchRequestGen = useRef(0);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Adopt server-side settings changes (connect/disconnect on the connection
  // tab updates the stored oauthClientId) while keeping unsaved target and
  // schedule edits.
  const lastResponse = useRef(response);
  useEffect(() => {
    if (lastResponse.current === response) return;
    lastResponse.current = response;
    setForm((prev) => ({
      ...response.settings,
      repoOwner: prev.repoOwner,
      repoName: prev.repoName,
      branch: prev.branch,
      pathPrefix: prev.pathPrefix,
      intervalMinutes: prev.intervalMinutes,
      deleteMode: prev.deleteMode,
      commitAuthorName: prev.commitAuthorName,
      commitAuthorEmail: prev.commitAuthorEmail,
      enabled: prev.enabled,
    }));
  }, [response]);

  // Repo suggestions once connected.
  const tokenSet = response.tokenSet;
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
      setForm((prev) => (!prev.branch ? { ...prev, branch: data.defaultBranch } : prev));
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
    setForm((prev) => ({ ...prev, repoOwner: owner.trim(), repoName: name.trim() }));
    const match = repos.find((r) => r.fullName === value);
    if (match) {
      setForm((prev) => ({ ...prev, branch: match.defaultBranch }));
      loadBranches(owner.trim(), name.trim());
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      // The OAuth client ID is owned by the connection tab / server — submit
      // the latest known value so saving cannot clobber it.
      const saved = await api.saveBackupSettings({
        ...form,
        branch: form.branch.trim() || 'main',
        oauthClientId: response.settings.oauthClientId,
      });
      setForm(saved.settings);
      setRepoInput(formatRepoTarget(saved.settings));
      onSaved(saved);
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
          onChange={(e) => setForm({ ...form, deleteMode: e.target.value as 'remove' | 'keep' })}
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
  );
}
