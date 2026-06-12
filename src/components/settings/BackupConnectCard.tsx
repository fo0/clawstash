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
  interval: number;
}

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

  const poll = (sessionId: string, intervalSec: number) => {
    pollTimer.current = setTimeout(async () => {
      if (cancelledRef.current) return;
      try {
        const result = await api.pollBackupDeviceFlow(sessionId);
        if (cancelledRef.current) return;
        if (result.status === 'connected') {
          setPending(null);
          setError(null);
          onUpdated(await api.getBackupSettings());
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
        setPending(null);
        setError(err instanceof Error ? err.message : 'GitHub login failed.');
      }
    }, intervalSec * 1000);
  };

  const handleDeviceLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      const start = await api.startBackupDeviceFlow(clientId.trim() || undefined);
      cancelledRef.current = false;
      setPending({
        sessionId: start.sessionId,
        userCode: start.userCode,
        verificationUri: start.verificationUri,
        interval: start.interval,
      });
      poll(start.sessionId, Math.max(start.interval, 5));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start GitHub login.');
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
            Sign in with GitHub (recommended): create a GitHub OAuth app once (Settings → Developer
            settings → OAuth Apps, enable <em>Device Flow</em>) and paste its client ID here — no
            client secret, no callback URL needed.
          </p>
          <div className="backup-form-row">
            <input
              className="form-input"
              placeholder="OAuth app client ID (e.g. Ov23li…)"
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
            (fine-grained, “Contents: Read and write” on the target repository).
          </p>
          {showPat && (
            <div className="backup-form-row">
              <input
                className="form-input"
                type="password"
                placeholder="github_pat_… or ghp_…"
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

      {error && <div className="settings-import-error">{error}</div>}
    </div>
  );
}
