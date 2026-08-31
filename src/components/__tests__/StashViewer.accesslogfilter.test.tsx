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

// jsdom has no layout engine, so neither `scrollIntoView` nor `matchMedia`
// exists by default.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  // The viewer restores its last tab from localStorage — open straight on the
  // Access Log instead of clicking through the tab bar.
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

function entry(id: string, source: AccessLogEntry['source'], action: string): AccessLogEntry {
  return {
    id,
    stash_id: 'abc',
    source,
    action,
    timestamp: '2026-01-01T00:00:00.000Z',
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

/** The action label of every access-log row currently rendered. */
function renderedActions(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.access-log-action')].map((el) => el.textContent ?? '');
}

const MIXED = [
  entry('1', 'api', 'read-api'),
  entry('2', 'mcp', 'read-mcp'),
  entry('3', 'ui', 'read-ui'),
  entry('4', 'api', 'read-api-2'),
];

describe('StashViewer access-log source filter', () => {
  it('offers a chip per channel with its count once the log mixes sources', async () => {
    const { container } = await renderWithLog(MIXED);
    await waitFor(() => expect(container.querySelector('.access-log-filter')).toBeTruthy());

    const group = screen.getByRole('group', { name: /filter access log by source/i });
    const chips = [...group.querySelectorAll('button')].map((b) => b.textContent);
    expect(chips).toEqual(['All 4', 'API2', 'MCP1', 'UI1']);
  });

  it('narrows the list to the chosen channel and back', async () => {
    const { container } = await renderWithLog(MIXED);
    await waitFor(() => expect(renderedActions(container).length).toBe(4));

    fireEvent.click(screen.getByTitle('Show only access via API'));
    expect(renderedActions(container)).toEqual(['read-api', 'read-api-2']);

    fireEvent.click(screen.getByTitle('Show access from every channel'));
    expect(renderedActions(container)).toEqual(['read-api', 'read-mcp', 'read-ui', 'read-api-2']);
  });

  it('marks the active chip with aria-pressed', async () => {
    await renderWithLog(MIXED);
    const mcp = await screen.findByTitle('Show only access via MCP');
    expect(mcp.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(mcp);
    expect(mcp.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTitle('Show access from every channel').getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('disables a channel the loaded page has no entries for', async () => {
    await renderWithLog([entry('1', 'api', 'a'), entry('2', 'mcp', 'b')]);
    const ui = await screen.findByTitle('Show only access via UI');
    expect((ui as HTMLButtonElement).disabled).toBe(true);
  });

  it('hides the chip row entirely for a single-channel log', async () => {
    const { container } = await renderWithLog([entry('1', 'ui', 'a'), entry('2', 'ui', 'b')]);
    await waitFor(() => expect(renderedActions(container).length).toBe(2));
    expect(container.querySelector('.access-log-filter')).toBeNull();
  });
});
