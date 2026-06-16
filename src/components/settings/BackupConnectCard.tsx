import { useEffect, useRef, useState } from 'react';
import type { BackupSettingsResponse } from '../../types';
import { api } from '../../api';
import Spinner from '../shared/Spinner';

interface Props {
  response: BackupSettingsResponse;
  onUpdated: (response: BackupSettingsResponse) => void;
}

interface PendingLogin {
  sessionId: string;
  userCode: string;
  verificationUri: string;
}

/** GitHub's documented minimum device-flow poll interval. */
const DEVICE_POLL_MIN_INTERVAL_SEC = 5;
/**
 * Transient browser→server poll failures tolerated before aborting the
 * login. The device code stays valid on GitHub's side, and the server
 * likewise treats upstream hiccups as 'pending' — a single network blip
 * must not force the user to restart with a fresh code.
 */
const DEVICE_POLL_MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Pre-filled GitHub creation forms. GitHub ignores unknown query params, so
 * if the pre-fill contract ever drifts these degrade to the empty form
 * instead of breaking.
 */
const OAUTH_APP_CREATE_URL = `https://github.com/settings/applications/new?${new URLSearchParams({
  'oauth_application[name]': 'ClawStash Backup',
  'oauth_application[url]': 'https://github.com/fo0/clawstash',
  // Required by the form but never called by the device flow.
  'oauth_application[callback_url]': 'http://localhost',
})}`;

const PAT_CREATE_URL = `https://github.com/settings/personal-access-tokens/new?${new URLSearchParams(
  {
    name: 'ClawStash Backup',
    description: 'Mirrors ClawStash stashes into the backup repository.',
    contents: 'write',
  },
)}`;

/**
 * GitHub connection card: "Sign in with GitHub" via OAuth device flow
 * (user code + github.com/login/device) with a PAT field as the headless
 * fallback. The token never reaches this component — the server stores it
 * encrypted and only reports the connected account login.
 */
export default function BackupConnectCard({ response, onUpdated }: Props) {
  const [clientId, setClientId] = useState(response.settings.oauthClientId);
  const [pat, setPat] = useState('');
  const [showPat, setShowPat] = useState(false);
  const [pending, setPending] = useState<PendingLogin | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const stopPolling = () => {
    cancelledRef.current = true;
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  };

  useEffect(() => stopPolling, []);

  const poll = (sessionId: string, intervalSec: number, failures = 0) => {
    pollTimer.current = setTimeout(async () => {
      if (cancelledRef.current) return;
      try {
        const result = await api.pollBackupDeviceFlow(sessionId);
        if (cancelledRef.current) return;
        if (result.status === 'connected') {
          setPending(null);
          setError(null);
          try {
            onUpdated(await api.getBackupSettings());
          } catch {
            // The connection itself succeeded; a failed settings reload
            // must not surface as a login error — reopening the section
            // shows the connected state.
          }
          return;
        }
        if (result.status === 'error') {
          setPending(null);
          setError(result.error || 'GitHub login failed.');
          return;
        }
        poll(sessionId, intervalSec);
      } catch (err) {
        if (cancelledRef.current) return;
        if (failures + 1 < DEVICE_POLL_MAX_CONSECUTIVE_FAILURES) {
          poll(sessionId, intervalSec, failures + 1);
          return;
        }
        setPending(null);
        setError(err instanceof Error ? err.message : 'GitHub login failed.');
      }
    }, intervalSec * 1000);
  };

  const handleDeviceLogin = async () => {
    setBusy(true);
    setError(null);
    // Reset BEFORE the await: if the card unmounts mid-request, the cleanup
    // sets the flag and the resolved handler below must not re-arm polling
    // against an unmounted component.
    cancelledRef.current = false;
    try {
      const start = await api.startBackupDeviceFlow(clientId.trim() || undefined);
      if (cancelledRef.current) return;
      setPending({
        sessionId: start.sessionId,
        userCode: start.userCode,
        verificationUri: start.verificationUri,
      });
      poll(start.sessionId, Math.max(start.interval, DEVICE_POLL_MIN_INTERVAL_SEC));
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'Could not start GitHub login.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCancelLogin = () => {
    stopPolling();
    setPending(null);
  };

  const handlePatConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.connectBackupPat(pat.trim());
      setPat('');
      setShowPat(false);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect with the token.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      onUpdated(await api.disconnectBackup());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed.');
    } finally {
      setBusy(false);
    }
  };

  const { connection, tokenSet } = response;

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <h3>GitHub Connection</h3>
      </div>

      {tokenSet && connection ? (
        <>
          <p className="api-hint">
            Connected as <strong>{connection.login}</strong>{' '}
            {connection.method === 'oauth' ? '(GitHub login)' : '(personal access token)'}.
          </p>
          <div className="settings-option-group">
            <button className="btn btn-danger btn-sm" onClick={handleDisconnect} disabled={busy}>
              Disconnect
            </button>
          </div>
        </>
      ) : pending ? (
        <div className="backup-device-pending">
          <p className="api-hint">
            Open{' '}
            <a href={pending.verificationUri} target="_blank" rel="noopener noreferrer">
              {pending.verificationUri}
            </a>{' '}
            and enter this code:
          </p>
          <div className="backup-device-code">{pending.userCode}</div>
          <p className="api-hint backup-device-waiting">
            <Spinner /> Waiting for authorization…
          </p>
          <button className="btn btn-secondary btn-sm" onClick={handleCancelLogin}>
            Cancel
          </button>
        </div>
      ) : (
        <>
          <p className="api-hint">
            Sign in with GitHub (recommended):{' '}
            <a href={OAUTH_APP_CREATE_URL} target="_blank" rel="noopener noreferrer">
              create a GitHub OAuth app
            </a>{' '}
            once — the form opens pre-filled, just tick <em>Enable Device Flow</em> — and paste its
            client ID here. No client secret needed; the callback URL is an unused placeholder.
          </p>
          <div className="backup-form-row">
            <input
              className="form-input"
              placeholder="OAuth app client ID (e.g. Ov23li…)"
              aria-label="OAuth app client ID"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
            <button
              className="btn btn-primary"
              onClick={handleDeviceLogin}
              disabled={busy || !clientId.trim()}
            >
              Sign in with GitHub
            </button>
          </div>
          <p className="api-hint">
            Alternatively,{' '}
            <button className="backup-link-btn" onClick={() => setShowPat((v) => !v)}>
              connect with a personal access token
            </button>{' '}
            (fine-grained, “Contents: Read and write” on the target repository —{' '}
            <a href={PAT_CREATE_URL} target="_blank" rel="noopener noreferrer">
              create one on GitHub
            </a>
            ).
          </p>
          {showPat && (
            <div className="backup-form-row">
              <input
                className="form-input"
                type="password"
                placeholder="github_pat_… or ghp_…"
                aria-label="Personal access token"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                autoComplete="off"
              />
              <button
                className="btn btn-primary"
                onClick={handlePatConnect}
                disabled={busy || pat.trim().length < 8}
              >
                Connect
              </button>
            </div>
          )}
        </>
      )}

      {error && (
        <div role="status" className="settings-import-error">
          {error}
        </div>
      )}
    </div>
  );
}
