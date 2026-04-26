import { useState, useEffect, useCallback, useRef } from 'react';
import type { Stash, StashListItem, ViewMode, LayoutMode, SettingsSection, AdminSessionInfo, TagInfo } from './types';
import { api, setAuthToken } from './api';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import StashViewer from './components/StashViewer';
import StashEditor from './components/editor/StashEditor';
import Settings from './components/Settings';
import GraphViewer from './components/GraphViewer';
import LoginScreen from './components/LoginScreen';
import SearchOverlay from './components/SearchOverlay';
import Footer from './components/Footer';

function getStoredPreference<T extends string>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  return (localStorage.getItem(key) as T) || fallback;
}

function getStoredAdminToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('clawstash_admin_token') || '';
}

function getInitialRoute(): { view: ViewMode; stashId: string | null; analyzeStashId: string | null } {
  const path = window.location.pathname;
  const analyzeMatch = path.match(/^\/stash\/([a-f0-9-]+)\/graph$/i);
  if (analyzeMatch) return { view: 'graph', stashId: null, analyzeStashId: analyzeMatch[1] };
  // Edit must be checked BEFORE the generic /stash/:id match so that
  // pushUrl(`/stash/${id}/edit`) round-trips correctly via popstate /
  // direct deep-link load (otherwise the user is silently dropped into
  // 'view' mode after pressing browser-back from the editor).
  const editMatch = path.match(/^\/stash\/([a-f0-9-]+)\/edit$/i);
  if (editMatch) return { view: 'edit', stashId: editMatch[1], analyzeStashId: null };
  const match = path.match(/^\/stash\/([a-f0-9-]+)/i);
  if (match) return { view: 'view', stashId: match[1], analyzeStashId: null };
  if (path === '/new') return { view: 'new', stashId: null, analyzeStashId: null };
  if (path === '/settings') return { view: 'settings', stashId: null, analyzeStashId: null };
  if (path === '/graph') return { view: 'graph', stashId: null, analyzeStashId: null };
  return { view: 'home', stashId: null, analyzeStashId: null };
}

function pushUrl(path: string) {
  if (window.location.pathname !== path) {
    window.history.pushState(null, '', path);
  }
}

export default function App() {
  const [stashes, setStashes] = useState<StashListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [view, setView] = useState<ViewMode>('home');
  const [layout, setLayout] = useState<LayoutMode>(() => getStoredPreference('clawstash_layout', 'grid'));
  const [selectedStash, setSelectedStash] = useState<Stash | null>(null);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [recentTags, setRecentTags] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('clawstash_recent_tags');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(true);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('welcome');
  const [adminToken, setAdminToken] = useState<string>(getStoredAdminToken);
  const [adminSession, setAdminSession] = useState<AdminSessionInfo | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [analyzeStashId, setAnalyzeStashId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Global Alt+K shortcut for quick search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Keep api module in sync with current token
  useEffect(() => {
    setAuthToken(adminToken);
  }, [adminToken]);

  // Generation guard for popstate-triggered stash fetches. A user that mashes
  // browser-back several times must not see the SLOWEST `getStash` resolution
  // overwrite the freshest selection. Same pattern as `loadStashesGenRef`.
  const popstateGenRef = useRef(0);

  // Handle initial URL route on mount
  useEffect(() => {
    let cancelled = false;
    const route = getInitialRoute();
    if ((route.view === 'view' || route.view === 'edit') && route.stashId) {
      // Load the stash so the editor / viewer have data to work with.
      // For 'edit', we fetch then transition straight into editor mode.
      // The `cancelled` flag prevents a slow initial fetch from clobbering a
      // user-driven selection (e.g. they click another stash from the sidebar
      // before the URL-derived stash finishes loading).
      api.getStash(route.stashId)
        .then((stash) => {
          if (cancelled) return;
          setSelectedStash(stash);
          setView(route.view);
        })
        .catch((err) => {
          if (cancelled) return;
          console.error('Failed to load stash from URL:', err);
          setView('home');
        });
    } else {
      setView(route.view);
      if (route.analyzeStashId) setAnalyzeStashId(route.analyzeStashId);
    }
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle browser back/forward navigation
  useEffect(() => {
    const onPopState = () => {
      const route = getInitialRoute();
      // Bump the generation for every popstate so an older in-flight fetch
      // cannot land after a newer popstate's fetch has resolved. Without this,
      // back-back-forward could leave the UI on the second-to-last stash.
      const gen = ++popstateGenRef.current;
      if (route.view === 'view' && route.stashId) {
        api.getStash(route.stashId)
          .then((stash) => {
            if (gen !== popstateGenRef.current) return;
            setSelectedStash(stash);
            setView('view');
            setSidebarOpen(false);
          })
          .catch((err) => {
            if (gen !== popstateGenRef.current) return;
            console.error('Failed to load stash from popstate:', err);
          });
      } else if (route.view === 'edit' && route.stashId) {
        // Back-navigation into /stash/:id/edit must rehydrate the editor,
        // not silently fall through to view mode.
        api.getStash(route.stashId)
          .then((stash) => {
            if (gen !== popstateGenRef.current) return;
            setSelectedStash(stash);
            setView('edit');
          })
          .catch((err) => {
            if (gen !== popstateGenRef.current) return;
            console.error('Failed to load stash from popstate:', err);
            setView('home');
          });
      } else {
        setView(route.view);
        if (route.view === 'home') setSelectedStash(null);
        setAnalyzeStashId(route.analyzeStashId);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-close mobile sidebar on viewport resize to desktop. Without this,
  // a user who opens the sidebar on mobile then resizes (or rotates) up to
  // desktop width would leave `sidebarOpen=true`, and the invisible
  // .sidebar-overlay backdrop continues to intercept clicks on desktop.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 640px)');
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setSidebarOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Check admin session on mount and when token changes.
  // Guard against the in-flight session check from a previous token resolving
  // AFTER the new token's check (out-of-order responses) — without the
  // `cancelled` flag, the stale resolution would overwrite the fresh one and
  // briefly flip the UI back to authenticated:false (or vice-versa).
  useEffect(() => {
    let cancelled = false;
    api.adminCheckSession()
      .then((session) => { if (!cancelled) setAdminSession(session); })
      .catch(() => {
        if (!cancelled) setAdminSession({ authenticated: false, authRequired: true });
      });
    return () => { cancelled = true; };
  }, [adminToken]);

  const handleLogin = useCallback(async (password: string) => {
    const result = await api.adminLogin(password);
    localStorage.setItem('clawstash_admin_token', result.token);
    setAdminToken(result.token);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await api.adminLogout();
    } catch {
      // Ignore logout errors
    }
    localStorage.removeItem('clawstash_admin_token');
    setAdminToken('');
    setAdminSession({ authenticated: false, authRequired: true });
  }, []);

  const loadTags = useCallback(async () => {
    try {
      const tagList = await api.getTags();
      setTags(tagList);
    } catch {
      // Ignore tag loading errors
    }
  }, []);

  // Generation counter so an older in-flight listStashes() resolution
  // cannot overwrite results from a newer typed-search. Without this, a
  // fast typer's earlier (slower) request can win the race and the UI
  // shows results for a stale prefix.
  const loadStashesGenRef = useRef(0);

  const loadStashes = useCallback(async () => {
    const gen = ++loadStashesGenRef.current;
    setLoading(true);
    try {
      const result = await api.listStashes({
        search: search || undefined,
        tag: filterTag || undefined,
        // undefined = show all (active + archived), false = show only active (hide archived)
        archived: showArchived ? undefined : false,
      });
      if (gen !== loadStashesGenRef.current) return;
      setStashes(result.stashes);
      setTotal(result.total);
    } catch (err) {
      if (gen !== loadStashesGenRef.current) return;
      console.error('Failed to load stashes:', err);
    } finally {
      if (gen === loadStashesGenRef.current) setLoading(false);
    }
  }, [search, filterTag, showArchived]);

  useEffect(() => {
    // Only load stashes when authenticated or in open mode.
    // Debounce the call so each keystroke in the sidebar search field does
    // not fire a fresh request — without this, typing "react" issues five
    // overlapping fetches and the slowest one wins the race (last-wins).
    if (!adminSession || (!adminSession.authenticated && adminSession.authRequired)) return;
    const timer = setTimeout(() => {
      loadStashes();
    }, 200);
    return () => clearTimeout(timer);
  }, [loadStashes, adminSession]);

  // Load tags once on auth, then refresh via loadTags() in save/delete handlers
  useEffect(() => {
    if (adminSession && (adminSession.authenticated || !adminSession.authRequired)) {
      loadTags();
    }
  }, [loadTags, adminSession]);

  // Clear stale tag filter when the active tag no longer exists
  useEffect(() => {
    if (filterTag && tags.length > 0 && !tags.some(t => t.tag === filterTag)) {
      setFilterTag('');
    }
  }, [tags, filterTag]);

  // Remove stale entries from recent tags
  useEffect(() => {
    if (tags.length === 0) return;
    const tagNames = new Set(tags.map(t => t.tag));
    setRecentTags(prev => {
      const cleaned = prev.filter(t => tagNames.has(t));
      if (cleaned.length !== prev.length) {
        localStorage.setItem('clawstash_recent_tags', JSON.stringify(cleaned));
      }
      return cleaned.length !== prev.length ? cleaned : prev;
    });
  }, [tags]);

  const handleSelectStash = async (id: string) => {
    try {
      const stash = await api.getStash(id);
      setSelectedStash(stash);
      setView('view');
      pushUrl(`/stash/${id}`);
      setSidebarOpen(false);
    } catch (err) {
      console.error('Failed to load stash:', err);
    }
  };

  const handleNewStash = () => {
    setSelectedStash(null);
    setView('new');
    pushUrl('/new');
    setSidebarOpen(false);
  };

  const handleEditStash = () => {
    setView('edit');
    if (selectedStash) pushUrl(`/stash/${selectedStash.id}/edit`);
  };

  const handleArchiveStash = async (id: string, archived: boolean) => {
    try {
      const updated = await api.archiveStash(id, archived);
      if (selectedStash?.id === id) {
        setSelectedStash(updated);
      }
      loadStashes();
    } catch (err) {
      console.error('Failed to archive stash:', err);
    }
  };

  const handleDeleteStash = async (id: string) => {
    try {
      await api.deleteStash(id);
      setSelectedStash(null);
      setView('home');
      pushUrl('/');
      loadStashes();
      loadTags();
    } catch (err) {
      console.error('Failed to delete stash:', err);
    }
  };

  const handleSaveStash = async (savedId?: string) => {
    try {
      const stashId = savedId || selectedStash?.id;
      if (stashId) {
        const updated = await api.getStash(stashId);
        setSelectedStash(updated);
        setView('view');
        pushUrl(`/stash/${stashId}`);
      } else {
        setView('home');
        pushUrl('/');
      }
      loadStashes();
      loadTags();
    } catch (err) {
      console.error('Failed to reload stash after save:', err);
      setView('home');
      pushUrl('/');
      loadStashes();
    }
  };

  const handleGoHome = () => {
    setSelectedStash(null);
    setView('home');
    pushUrl('/');
    setSidebarOpen(false);
  };

  const handleFilterTag = (tag: string) => {
    const newTag = tag === filterTag ? '' : tag;
    setFilterTag(newTag);
    if (newTag) {
      setRecentTags(prev => {
        const updated = [newTag, ...prev.filter(t => t !== newTag)].slice(0, 3);
        localStorage.setItem('clawstash_recent_tags', JSON.stringify(updated));
        return updated;
      });
    }
  };

  const handleGraphFilterTag = (tag: string) => {
    handleFilterTag(tag);
    setView('home');
    pushUrl('/');
  };

  const handleGraphView = () => {
    setSelectedStash(null);
    setAnalyzeStashId(null);
    setView('graph');
    pushUrl('/graph');
    setSidebarOpen(false);
  };

  const handleAnalyzeStash = (id: string) => {
    setSelectedStash(null);
    setAnalyzeStashId(id);
    setView('graph');
    pushUrl(`/stash/${id}/graph`);
  };

  const handleSettingsView = () => {
    setSelectedStash(null);
    setSettingsSection('welcome');
    setView('settings');
    pushUrl('/settings');
    setSidebarOpen(false);
  };

  const handleLayoutChange = (mode: LayoutMode) => {
    setLayout(mode);
    localStorage.setItem('clawstash_layout', mode);
  };

  // Show login screen if auth is required and user is not authenticated
  if (adminSession === null) {
    // Still loading session info
    return null;
  }

  if (adminSession.authRequired && !adminSession.authenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="app">
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <Sidebar
        stashes={stashes}
        selectedId={selectedStash?.id || null}
        search={search}
        onSearch={setSearch}
        filterTag={filterTag}
        onFilterTag={handleFilterTag}
        tags={tags}
        recentTags={recentTags}
        showArchived={showArchived}
        onToggleShowArchived={() => setShowArchived(prev => !prev)}
        onSelectStash={handleSelectStash}
        onNewStash={handleNewStash}
        onGoHome={handleGoHome}
        onGraphView={handleGraphView}
        onSettingsView={handleSettingsView}
        isSettingsView={view === 'settings'}
        settingsSection={settingsSection}
        onSettingsSection={setSettingsSection}
        onLogout={adminSession.authRequired ? handleLogout : undefined}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="main-wrapper">
        <header className="mobile-header">
          <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="mobile-header-title" onClick={handleGoHome}>ClawStash</span>
          <button className="mobile-search-btn" onClick={() => setSearchOpen(prev => !prev)} aria-label="Search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        </header>
        <main className="main-content">
          {view === 'home' && (
            <Dashboard
              stashes={stashes}
              total={total}
              layout={layout}
              loading={loading}
              filterTag={filterTag}
              showArchived={showArchived}
              onToggleShowArchived={() => setShowArchived(prev => !prev)}
              onLayoutChange={handleLayoutChange}
              onSelectStash={handleSelectStash}
              onNewStash={handleNewStash}
              onFilterTag={handleFilterTag}
            />
          )}
          {view === 'view' && selectedStash && (
            <StashViewer
              stash={selectedStash}
              onEdit={handleEditStash}
              onDelete={handleDeleteStash}
              onArchive={handleArchiveStash}
              onBack={handleGoHome}
              onAnalyzeStash={handleAnalyzeStash}
              onStashUpdated={(stash) => {
                setSelectedStash(stash);
                loadStashes();
              }}
            />
          )}
          {(view === 'new' || view === 'edit') && (
            <StashEditor
              stash={view === 'edit' ? selectedStash : null}
              onSave={handleSaveStash}
              onCancel={selectedStash ? () => { setView('view'); if (selectedStash) pushUrl(`/stash/${selectedStash.id}`); } : handleGoHome}
            />
          )}
          {view === 'settings' && (
            <Settings
              activeSection={settingsSection}
              layout={layout}
              onLayoutChange={handleLayoutChange}
              onSettingsSection={setSettingsSection}
            />
          )}
          {view === 'graph' && (
            <GraphViewer
              stashes={stashes}
              tags={tags}
              onFilterTag={handleGraphFilterTag}
              onSelectStash={handleSelectStash}
              onGoHome={handleGoHome}
              analyzeStashId={analyzeStashId}
              onAnalyzeStashConsumed={() => setAnalyzeStashId(null)}
            />
          )}
        </main>
        <Footer />
      </div>
      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectStash={handleSelectStash}
      />
    </div>
  );
}
