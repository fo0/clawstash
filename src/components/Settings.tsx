import { useState, useEffect, type ReactNode } from 'react';
import type { SettingsSection, LayoutMode, Stats, TagInfo } from '../types';
import { api } from '../api';
import ApiManager from './api/ApiManager';
import Spinner from './shared/Spinner';

// --- Welcome Section ---

const WELCOME_CARDS: { section: SettingsSection; title: string; description: string; color: string; icon: ReactNode }[] = [
  {
    section: 'general',
    title: 'General',
    description: 'Customize application preferences and default layout.',
    color: 'var(--accent-orange)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" x2="4" y1="21" y2="14" /><line x1="4" x2="4" y1="10" y2="3" />
        <line x1="12" x2="12" y1="21" y2="12" /><line x1="12" x2="12" y1="8" y2="3" />
        <line x1="20" x2="20" y1="21" y2="16" /><line x1="20" x2="20" y1="12" y2="3" />
        <line x1="2" x2="6" y1="14" y2="14" /><line x1="10" x2="14" y1="8" y2="8" /><line x1="18" x2="22" y1="16" y2="16" />
      </svg>
    ),
  },
  {
    section: 'api',
    title: 'API & Tokens',
    description: 'Manage API tokens, REST API docs, and MCP configuration.',
    color: '#3bc9db',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m15 7-6.5 6.5a1.5 1.5 0 0 0 3 3L18 10" />
        <path d="m18 10 2-2a1.5 1.5 0 0 0-3-3l-2 2" />
        <path d="m8 16-1.5 1.5" />
        <path d="M2 2l4 4" />
      </svg>
    ),
  },
  {
    section: 'storage',
    title: 'Storage',
    description: 'Database statistics, languages, and tag overview.',
    color: '#b197fc',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5V19A9 3 0 0 0 21 19V5" />
        <path d="M3 12A9 3 0 0 0 21 12" />
      </svg>
    ),
  },
  {
    section: 'about',
    title: 'About',
    description: 'Application information, features, and tech stack.',
    color: 'var(--accent-green)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" /><path d="M12 8h.01" />
      </svg>
    ),
  },
];

interface WelcomeSectionProps {
  onNavigate: (section: SettingsSection) => void;
}

function WelcomeSection({ onNavigate }: WelcomeSectionProps) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getStats().then((data) => {
      if (!cancelled) setStats(data);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="settings-section-content">
      <div className="settings-welcome-header">
        <div className="settings-welcome-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </div>
        <div>
          <h2 className="settings-welcome-title">Admin Dashboard</h2>
          <p className="settings-welcome-subtitle">Administration and configuration for ClawStash</p>
        </div>
      </div>

      <div className="settings-welcome-status">
        <span className="settings-welcome-status-dot" />
        <span>System running normally</span>
        {stats && (
          <span className="settings-welcome-status-stats">
            &mdash; {stats.totalStashes} stashes, {stats.totalFiles} files
          </span>
        )}
      </div>

      <div className="settings-welcome-grid">
        {WELCOME_CARDS.map((card) => (
          <button
            key={card.section}
            className="settings-welcome-card"
            style={{ '--card-accent': card.color } as React.CSSProperties}
            onClick={() => onNavigate(card.section)}
          >
            <div className="settings-welcome-card-icon" style={{ color: card.color }}>
              {card.icon}
            </div>
            <div className="settings-welcome-card-body">
              <h3>{card.title}</h3>
              <p>{card.description}</p>
            </div>
            <div className="settings-welcome-card-arrow">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </div>
          </button>
        ))}
      </div>

      <div className="settings-welcome-hint">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" /><path d="M12 8h.01" />
        </svg>
        <span>
          ClawStash is AI-optimized stash storage with REST API, MCP support, and a web dashboard.
          Access is secured when <code>ADMIN_PASSWORD</code> is configured.
        </span>
      </div>
    </div>
  );
}

// --- SVG Icons ---

function SlidersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" x2="4" y1="21" y2="14" /><line x1="4" x2="4" y1="10" y2="3" />
      <line x1="12" x2="12" y1="21" y2="12" /><line x1="12" x2="12" y1="8" y2="3" />
      <line x1="20" x2="20" y1="21" y2="16" /><line x1="20" x2="20" y1="12" y2="3" />
      <line x1="2" x2="6" y1="14" y2="14" /><line x1="10" x2="14" y1="8" y2="8" /><line x1="18" x2="22" y1="16" y2="16" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5V19A9 3 0 0 0 21 19V5" />
      <path d="M3 12A9 3 0 0 0 21 12" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" /><path d="M12 8h.01" />
    </svg>
  );
}

// --- Section: General ---

interface GeneralSectionProps {
  layout: LayoutMode;
  onLayoutChange: (mode: LayoutMode) => void;
}

function GeneralSection({ layout, onLayoutChange }: GeneralSectionProps) {
  return (
    <div className="settings-section-content">
      <div className="settings-section-title">
        <span className="settings-section-title-icon"><SlidersIcon /></span>
        <h2>General</h2>
      </div>
      <p className="settings-section-desc">Application preferences.</p>

      {/* Default Layout */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h3>Default Layout</h3>
        </div>
        <p className="api-hint">
          Choose the default layout for the dashboard stash list.
        </p>
        <div className="settings-option-group">
          <button
            className={`settings-option-btn ${layout === 'grid' ? 'active' : ''}`}
            onClick={() => onLayoutChange('grid')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z" />
            </svg>
            Grid
          </button>
          <button
            className={`settings-option-btn ${layout === 'list' ? 'active' : ''}`}
            onClick={() => onLayoutChange('list')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3.75-1.5a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5zm0 5a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5zm0 5a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5zM3 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-1 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
            </svg>
            List
          </button>
        </div>
      </div>

    </div>
  );
}

// --- Section: Storage ---

function StorageSection() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [statsData, tagsData] = await Promise.all([
          api.getStats(),
          api.getTags(),
        ]);
        if (!cancelled) {
          setStats(statsData);
          setTags(tagsData);
        }
      } catch (err) {
        console.error('Failed to load storage stats:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleExport = async () => {
    setExporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const blob = await api.exportData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.download = `clawstash-export-${timestamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!confirm('This will replace ALL existing stash data. Are you sure?')) return;

    setImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const result = await api.importData(file);
      setImportResult(`Import successful: ${result.imported.stashes} stashes, ${result.imported.files} files, ${result.imported.versions} versions imported.`);
      // Reload stats
      const [statsData, tagsData] = await Promise.all([api.getStats(), api.getTags()]);
      setStats(statsData);
      setTags(tagsData);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-section-content">
        <div className="api-loading"><Spinner /> Loading storage info...</div>
      </div>
    );
  }

  return (
    <div className="settings-section-content">
      <div className="settings-section-title">
        <span className="settings-section-title-icon"><DatabaseIcon /></span>
        <h2>Storage</h2>
      </div>
      <p className="settings-section-desc">Database statistics and storage overview.</p>

      {stats && (
        <>
          {/* Stats Overview */}
          <div className="settings-card">
            <div className="settings-card-header">
              <h3>Overview</h3>
            </div>
            <div className="settings-stats-grid">
              <div className="settings-stat-item">
                <div className="settings-stat-value">{stats.totalStashes}</div>
                <div className="settings-stat-label">Total Stashes</div>
              </div>
              <div className="settings-stat-item">
                <div className="settings-stat-value">{stats.totalFiles}</div>
                <div className="settings-stat-label">Total Files</div>
              </div>
            </div>
          </div>

          {/* Top Languages */}
          {stats.topLanguages.length > 0 && (
            <div className="settings-card">
              <div className="settings-card-header">
                <h3>Top Languages</h3>
              </div>
              <div className="settings-lang-list">
                {stats.topLanguages.map((lang) => (
                  <div key={lang.language} className="settings-lang-item">
                    <span className="settings-lang-name">{lang.language || 'Unknown'}</span>
                    <div className="settings-lang-bar-bg">
                      <div
                        className="settings-lang-bar"
                        style={{ width: `${Math.max(4, (lang.count / stats.totalFiles) * 100)}%` }}
                      />
                    </div>
                    <span className="settings-lang-count">{lang.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div className="settings-card">
              <div className="settings-card-header">
                <h3>Tags ({tags.length})</h3>
              </div>
              <div className="settings-tags-cloud">
                {tags.map((t) => (
                  <span key={t.tag} className="settings-tag">
                    {t.tag} <span className="settings-tag-count">{t.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Data Export / Import */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h3>Data Export / Import</h3>
        </div>
        <p className="api-hint">
          Export all stash data as a ZIP archive or import a previously exported ZIP to restore data.
          Import will <strong>replace all existing data</strong>.
        </p>

        <div className="settings-export-import-actions">
          <button
            className="settings-option-btn active"
            onClick={handleExport}
            disabled={exporting || importing}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" x2="12" y1="15" y2="3" />
            </svg>
            {exporting ? 'Exporting…' : 'Export Data'}
          </button>

          <label
            className={`settings-option-btn${importing ? ' active' : ''}`}
            style={{ cursor: importing ? 'wait' : 'pointer' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" x2="12" y1="3" y2="15" />
            </svg>
            {importing ? 'Importing…' : 'Import Data'}
            <input
              type="file"
              accept=".zip"
              onChange={handleImport}
              disabled={exporting || importing}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        {importResult && (
          <div className="settings-import-success">{importResult}</div>
        )}
        {importError && (
          <div className="settings-import-error">{importError}</div>
        )}
      </div>

      {!stats && (
        <div className="settings-card">
          <p className="api-hint">No storage data available.</p>
        </div>
      )}
    </div>
  );
}

// --- Section: About ---

function AboutSection() {
  return (
    <div className="settings-section-content">
      <div className="settings-section-title">
        <span className="settings-section-title-icon"><InfoIcon /></span>
        <h2>About</h2>
      </div>
      <p className="settings-section-desc">Application information.</p>

      <div className="settings-card">
        <div className="settings-about-header">
          <span className="settings-about-logo">CS</span>
          <div>
            <h3>ClawStash</h3>
            <p className="api-hint" style={{ marginBottom: 0 }}>AI-optimized Stash Storage System</p>
          </div>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-header">
          <h3>Features</h3>
        </div>
        <ul className="settings-feature-list">
          <li>Text &amp; file storage with multi-file support</li>
          <li>REST API for programmatic access</li>
          <li>MCP Server for AI agent integration</li>
          <li>Web dashboard with dark theme</li>
          <li>Tags and metadata for AI context</li>
          <li>Full-text search across names, filenames and content</li>
          <li>Access logging per API, MCP and UI</li>
          <li>API token management with scopes</li>
          <li>Password-based login with session management</li>
        </ul>
      </div>

      <div className="settings-card">
        <div className="settings-card-header">
          <h3>Tech Stack</h3>
        </div>
        <div className="settings-tech-grid">
          <div className="settings-tech-item">
            <span className="settings-tech-label">Frontend</span>
            <span className="settings-tech-value">React 19, Next.js 16</span>
          </div>
          <div className="settings-tech-item">
            <span className="settings-tech-label">Backend</span>
            <span className="settings-tech-value">Next.js 16, Node.js</span>
          </div>
          <div className="settings-tech-item">
            <span className="settings-tech-label">Database</span>
            <span className="settings-tech-value">SQLite (better-sqlite3)</span>
          </div>
          <div className="settings-tech-item">
            <span className="settings-tech-label">MCP</span>
            <span className="settings-tech-value">@modelcontextprotocol/sdk</span>
          </div>
          <div className="settings-tech-item">
            <span className="settings-tech-label">Language</span>
            <span className="settings-tech-value">TypeScript</span>
          </div>
          <div className="settings-tech-item">
            <span className="settings-tech-label">Validation</span>
            <span className="settings-tech-value">Zod</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Main Settings Component ---

interface Props {
  activeSection: SettingsSection;
  layout: LayoutMode;
  onLayoutChange: (mode: LayoutMode) => void;
  onSettingsSection: (section: SettingsSection) => void;
}

export default function Settings({ activeSection, layout, onLayoutChange, onSettingsSection }: Props) {
  return (
    <div className="settings">
      {activeSection === 'welcome' && (
        <WelcomeSection onNavigate={onSettingsSection} />
      )}
      {activeSection === 'general' && (
        <GeneralSection
          layout={layout}
          onLayoutChange={onLayoutChange}
        />
      )}
      {activeSection === 'api' && (
        <ApiManager embedded />
      )}
      {activeSection === 'storage' && (
        <StorageSection />
      )}
      {activeSection === 'about' && (
        <AboutSection />
      )}
    </div>
  );
}
