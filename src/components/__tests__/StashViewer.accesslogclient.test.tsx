// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import StashViewer from '../StashViewer';
import type { AccessLogEntry, Stash } from '../../types';

const getAccessLog = vi.fn();
vi.mock('../../api', () => ({
  api: {
    getAccessLog: (...args: unknown[]) => getAccessLog(...args),
  },
}));

// jsdom has no layout engine, so neither `scrollIntoView` nor `matchMedia`
// exists by default.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  // Open straight on the Access Log (the viewer restores its last tab).
  localStorage.setItem('clawstash-viewer-tab', 'access-log');
});

afterEach(() => {
  cleanup();
  getAccessLog.mockReset();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const STASH: Stash = {
  id: 'abc',
  name: 'My stash',
  description: '',
  tags: [],
  metadata: {},
  version: 1,
  archived: false,
  backup_enabled: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  files: [],
};

function entry(
  id: string,
  source: AccessLogEntry['source'],
  action: string,
  extra: Partial<AccessLogEntry> = {},
): AccessLogEntry {
  return {
    id,
    stash_id: 'abc',
    source,
    action,
    timestamp: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

async function renderWithLog(entries: AccessLogEntry[]) {
  getAccessLog.mockResolvedValue(entries);
  const view = render(
    <StashViewer
      stash={STASH}
      onEdit={vi.fn()}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
      onArchive={vi.fn()}
      onBack={vi.fn()}
      onAnalyzeStash={vi.fn()}
      onFilterTag={vi.fn()}
      isFavorite={false}
      onToggleFavorite={vi.fn()}
    />,
  );
  await waitFor(() => expect(getAccessLog).toHaveBeenCalled());
  return view;
}

const CURL = 'curl/8.5.0';
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0';

describe('StashViewer access-log client', () => {
  it('labels each row with the client and keeps the raw values in the tooltip', async () => {
    await renderWithLog([
      entry('1', 'api', 'read', { ip: '10.0.0.1', user_agent: CURL }),
      entry('2', 'ui', 'read', { user_agent: FIREFOX }),
    ]);

    const curl = await screen.findByText(CURL);
    expect(curl.className).toBe('access-log-client');
    expect(curl.getAttribute('title')).toBe(`IP: 10.0.0.1\nUser agent: ${CURL}`);
    expect(screen.getByText('Firefox 131').getAttribute('title')).toBe(`User agent: ${FIREFOX}`);
  });

  it('falls back to the IP when no user agent was recorded', async () => {
    await renderWithLog([entry('1', 'api', 'read', { ip: '10.0.0.2' })]);
    expect((await screen.findByText('10.0.0.2')).getAttribute('title')).toBe('IP: 10.0.0.2');
  });

  it('renders no client for an entry without either (MCP)', async () => {
    const { container } = await renderWithLog([
      // The server sends SQL NULLs, not missing keys.
      entry('1', 'mcp', 'read', { ip: null, user_agent: null } as unknown as AccessLogEntry),
    ]);
    await waitFor(() => expect(container.querySelector('.access-log-entry')).toBeTruthy());
    expect(container.querySelector('.access-log-client')).toBeNull();
  });
});
