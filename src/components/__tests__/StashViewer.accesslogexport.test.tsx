// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StashViewer from '../StashViewer';
import type { AccessLogEntry, Stash } from '../../types';

const getAccessLog = vi.fn();
vi.mock('../../api', () => ({
  api: {
    getAccessLog: (...args: unknown[]) => getAccessLog(...args),
  },
}));

const downloadTextFile = vi.fn();
vi.mock('../../utils/download', () => ({
  downloadTextFile: (...args: unknown[]) => downloadTextFile(...args),
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
  downloadTextFile.mockReset();
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

const exportButton = () => screen.getByRole('button', { name: 'Export CSV' });

describe('StashViewer access-log CSV export', () => {
  it('downloads the loaded entries as CSV', async () => {
    await renderWithLog([
      entry('1', 'api', 'read', { ip: '10.0.0.1', user_agent: 'curl/8.5.0' }),
      entry('2', 'mcp', 'update'),
    ]);
    await waitFor(() => expect(exportButton()).toHaveProperty('disabled', false));

    fireEvent.click(exportButton());

    expect(downloadTextFile).toHaveBeenCalledTimes(1);
    const [filename, content, mimeType] = downloadTextFile.mock.calls[0];
    expect(filename).toMatch(/^clawstash-access-log-abc-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(mimeType).toBe('text/csv;charset=utf-8');
    expect(content).toBe(
      'timestamp,source,action,ip,user_agent\r\n' +
        '2026-01-01T00:00:00.000Z,api,read,10.0.0.1,curl/8.5.0\r\n' +
        '2026-01-01T00:00:00.000Z,mcp,update,,\r\n',
    );
  });

  it('exports only the rows the source chip leaves on screen', async () => {
    await renderWithLog([entry('1', 'api', 'read-api'), entry('2', 'mcp', 'read-mcp')]);
    fireEvent.click(await screen.findByTitle('Show only access via MCP'));

    fireEvent.click(exportButton());

    const content = downloadTextFile.mock.calls[0][1] as string;
    expect(content).toContain('read-mcp');
    expect(content).not.toContain('read-api');
  });

  it('is disabled while there is nothing to export', async () => {
    await renderWithLog([]);
    await screen.findByText('No access recorded yet.');
    expect(exportButton()).toHaveProperty('disabled', true);
  });
});
