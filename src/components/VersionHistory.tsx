import { useState, useEffect } from 'react';
import type { Stash, StashVersionListItem, StashVersion } from '../types';
import { api } from '../api';
import { formatRelativeTime } from '../utils/format';
import VersionDiff from './VersionDiff';
import { highlightCode, resolvePrismLanguage } from '../languages';
import Spinner from './shared/Spinner';

interface Props {
  stashId: string;
  currentVersion: number;
  onRestore: (stash: Stash) => void;
}

type SubView = 'list' | 'detail' | 'diff';

export default function VersionHistory({ stashId, currentVersion, onRestore }: Props) {
  const [versions, setVersions] = useState<StashVersionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [subView, setSubView] = useState<SubView>('list');
  const [selectedVersion, setSelectedVersion] = useState<StashVersion | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null);

  // Confluence-style inline comparison: "From" (older) and "To" (newer)
  const [compareFrom, setCompareFrom] = useState<number | null>(null);
  const [compareTo, setCompareTo] = useState<number | null>(null);
  const [diffData, setDiffData] = useState<{ v1: StashVersion; v2: StashVersion } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.getVersions(stashId)
      .then((v) => {
        setVersions(v);
        // Auto-select the two most recent versions for quick comparison
        if (v.length >= 2) {
          setCompareTo(v[0].version);
          setCompareFrom(v[1].version);
        }
      })
      .catch(() => setVersions([]))
      .finally(() => setLoading(false));
  }, [stashId, currentVersion]);

  const handleViewVersion = async (version: number) => {
    setDetailLoading(true);
    try {
      const data = await api.getVersion(stashId, version);
      setSelectedVersion(data);
      setSubView('detail');
    } catch {
      // ignore
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCompare = async () => {
    if (compareFrom === null || compareTo === null || compareFrom === compareTo) return;
    setDiffLoading(true);
    try {
      const data = await api.getVersionDiff(stashId, Math.min(compareFrom, compareTo), Math.max(compareFrom, compareTo));
      setDiffData(data);
      setSubView('diff');
    } catch {
      // ignore
    } finally {
      setDiffLoading(false);
    }
  };

  const handleRestore = async (version: number) => {
    if (confirmRestore !== version) {
      setConfirmRestore(version);
      setTimeout(() => setConfirmRestore(null), 3000);
      return;
    }
    setRestoring(true);
    try {
      const stash = await api.restoreVersion(stashId, version);
      onRestore(stash);
    } catch {
      // ignore
    } finally {
      setRestoring(false);
      setConfirmRestore(null);
    }
  };

  const handleBack = () => {
    setSubView('list');
    setSelectedVersion(null);
    setDiffData(null);
  };

  // Handle "From" radio change: ensure From < To
  const handleFromChange = (version: number) => {
    setCompareFrom(version);
    // If From >= To, clear To
    if (compareTo !== null && version >= compareTo) {
      setCompareTo(null);
    }
  };

  // Handle "To" radio change: ensure To > From
  const handleToChange = (version: number) => {
    setCompareTo(version);
    // If To <= From, clear From
    if (compareFrom !== null && version <= compareFrom) {
      setCompareFrom(null);
    }
  };

  if (loading) return <div className="loading"><Spinner /> Loading version history...</div>;

  if (versions.length === 0) {
    return (
      <div className="version-empty">
        <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor" style={{ marginBottom: 8 }}>
          <path d="M1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm.5 4.75a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 .37.65l2.5 1.5a.75.75 0 1 0 .77-1.29L8.5 7.94Z" />
        </svg>
        <p>No version history available.</p>
      </div>
    );
  }

  if (subView === 'detail' && selectedVersion) {
    return (
      <div className="version-detail">
        <div className="version-detail-header">
          <button className="btn btn-ghost btn-sm" onClick={handleBack}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z" />
            </svg>
            Back to versions
          </button>
          <span className="version-badge">v{selectedVersion.version}</span>
          <button
            className={`btn btn-sm ${confirmRestore === selectedVersion.version ? 'btn-danger' : 'btn-secondary'}`}
            onClick={() => handleRestore(selectedVersion.version)}
            disabled={restoring || selectedVersion.version === currentVersion}
            title={selectedVersion.version === currentVersion ? 'This is the current version' : 'Restore this version as the current state'}
          >
            {restoring ? 'Restoring...' : confirmRestore === selectedVersion.version ? 'Confirm Restore?' : 'Restore this version'}
          </button>
        </div>
        <div className="version-detail-meta">
          <span><strong>Name:</strong> {selectedVersion.name || '(untitled)'}</span>
          <span><strong>By:</strong> {selectedVersion.created_by || 'system'}</span>
          <span><strong>Date:</strong> {new Date(selectedVersion.created_at).toLocaleString()}</span>
          {selectedVersion.tags.length > 0 && (
            <span><strong>Tags:</strong> {selectedVersion.tags.join(', ')}</span>
          )}
        </div>
        {selectedVersion.description && (
          <p className="version-detail-desc">{selectedVersion.description}</p>
        )}
        <div className="version-detail-files">
          {selectedVersion.files.map((file, i) => {
            const lang = resolvePrismLanguage(file.language, file.filename);
            return (
              <div key={i} className="viewer-file">
                <div className="file-header">
                  <span className="file-name">{file.filename}</span>
                  {file.language && <span className="lang-tag">{file.language}</span>}
                </div>
                <pre className="file-content"><code dangerouslySetInnerHTML={{ __html: highlightCode(file.content, lang) }} /></pre>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (subView === 'diff' && diffData) {
    return (
      <div className="version-diff-view">
        <div className="version-detail-header">
          <button className="btn btn-ghost btn-sm" onClick={handleBack}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z" />
            </svg>
            Back to versions
          </button>
          <span className="version-badge">v{diffData.v1.version}</span>
          <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>&rarr;</span>
          <span className="version-badge">v{diffData.v2.version}</span>
        </div>
        <VersionDiff v1={diffData.v1} v2={diffData.v2} />
      </div>
    );
  }

  // Confluence-style list view with inline radio buttons
  const canCompare = compareFrom !== null && compareTo !== null && compareFrom !== compareTo;
  const hasMultipleVersions = versions.length >= 2;

  return (
    <div className="version-history">
      {/* Compare action bar */}
      {hasMultipleVersions && (
        <div className="version-compare-bar">
          <button
            className="btn btn-sm btn-secondary"
            onClick={handleCompare}
            disabled={!canCompare || diffLoading}
          >
            {diffLoading ? (
              <><Spinner size={12} /> Comparing...</>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M9.573.677A.25.25 0 0 1 10 .854V4.5h3.25a.75.75 0 0 1 0 1.5H9.25a.75.75 0 0 1-.75-.75V1.104l-5.427 5.15a.25.25 0 0 0 0 .362l5.427 5.15V8.25a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 0 1.5H10v3.646a.25.25 0 0 1-.427.177l-6.39-6.064a1.75 1.75 0 0 1 0-2.539l6.39-6.064Z" />
                </svg>
                Compare
              </>
            )}
          </button>
          <div className="version-compare-info">
            {canCompare ? (
              <span>
                Comparing <strong>v{compareFrom}</strong> <span className="version-compare-arrow">&rarr;</span> <strong>v{compareTo}</strong>
              </span>
            ) : (
              <span className="version-compare-hint">Select two versions to compare</span>
            )}
          </div>
        </div>
      )}

      {/* Version list with inline comparison radios */}
      <div className="version-list">
        {/* Table header for radio columns */}
        {hasMultipleVersions && (
          <div className="version-item version-list-header">
            <div className="version-radios">
              <span className="version-radio-label" title="Select the older version (From)">From</span>
              <span className="version-radio-label" title="Select the newer version (To)">To</span>
            </div>
            <div className="version-item-left">
              <span className="version-list-header-text">Version</span>
            </div>
            <div className="version-item-actions">
              <span className="version-list-header-text">Actions</span>
            </div>
          </div>
        )}

        {versions.map((v, index) => {
          const isCurrent = v.version === currentVersion;
          const isFirst = index === versions.length - 1; // oldest version (list is desc)
          const isLast = index === 0; // newest version (list is desc)

          return (
            <div
              key={v.id}
              className={`version-item ${isCurrent ? 'version-current' : ''}`}
            >
              {/* Comparison radio buttons */}
              {hasMultipleVersions && (
                <div className="version-radios">
                  {/* "From" radio — disabled for the newest version (nothing newer to compare to) */}
                  <label className="version-radio" title={`Compare from v${v.version}`}>
                    <input
                      type="radio"
                      name="compare-from"
                      checked={compareFrom === v.version}
                      onChange={() => handleFromChange(v.version)}
                      disabled={isLast || (compareTo !== null && v.version >= compareTo)}
                    />
                  </label>
                  {/* "To" radio — disabled for the oldest version (nothing older to compare from) */}
                  <label className="version-radio" title={`Compare to v${v.version}`}>
                    <input
                      type="radio"
                      name="compare-to"
                      checked={compareTo === v.version}
                      onChange={() => handleToChange(v.version)}
                      disabled={isFirst || (compareFrom !== null && v.version <= compareFrom)}
                    />
                  </label>
                </div>
              )}

              <div className="version-item-left">
                <span className="version-badge">v{v.version}</span>
                <div className="version-item-info">
                  <span className="version-item-name">
                    {v.name || '(untitled)'}
                    {isCurrent && <span className="version-current-tag">current</span>}
                  </span>
                  <span className="version-item-meta">
                    {v.created_by === 'current' ? 'live' : v.created_by || 'system'} &middot; {formatRelativeTime(v.created_at)} &middot; {v.file_count} file{v.file_count !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <div className="version-item-actions">
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => handleViewVersion(v.version)}
                  disabled={detailLoading}
                >
                  View
                </button>
                {!isCurrent && (
                  <button
                    className={`btn btn-sm ${confirmRestore === v.version ? 'btn-danger' : 'btn-ghost'}`}
                    onClick={() => handleRestore(v.version)}
                    disabled={restoring}
                  >
                    {confirmRestore === v.version ? 'Confirm?' : 'Restore'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
