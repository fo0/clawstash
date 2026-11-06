// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import VersionHistory from '../VersionHistory';
import { api } from '../../api';
import type { StashVersion, StashVersionListItem } from '../../types';

// View, Compare and "Back to versions" each replace the sub-view they sit in,
// so the activated button unmounts. Without focus management keyboard focus
// fell to <body> on every one of them (WCAG 2.4.3). These pin where it lands.

vi.mock('../../api', () => ({
  api: {
    getVersions: vi.fn(),
    getVersion: vi.fn(),
    getVersionDiff: vi.fn(),
    restoreVersion: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function listItem(version: number): StashVersionListItem {
  return {
    id: `v-${version}`,
    stash_id: 'abc',
    name: `Version ${version}`,
    description: '',
    version,
    created_by: 'admin',
    created_at: '2026-01-01T00:00:00.000Z',
    file_count: 1,
    total_size: 10,
  };
}

function detail(version: number): StashVersion {
  return {
    id: `v-${version}`,
    stash_id: 'abc',
    name: `Version ${version}`,
    description: '',
    tags: [],
    metadata: {},
    version,
    created_by: 'admin',
    created_at: '2026-01-01T00:00:00.000Z',
    files: [{ filename: 'a.txt', content: `v${version}`, language: 'text', sort_order: 0 }],
  };
}

async function renderList() {
  mockedApi.getVersions.mockResolvedValue([listItem(3), listItem(2), listItem(1)]);
  render(<VersionHistory stashId="abc" currentVersion={3} onRestore={vi.fn()} />);
  await screen.findByText('Version 3');
}

describe('VersionHistory focus across sub-views', () => {
  it('focuses Back when a version opens and the View button when going back', async () => {
    mockedApi.getVersion.mockResolvedValue(detail(2));
    await renderList();

    fireEvent.click(screen.getByRole('button', { name: 'View version 2' }));
    const back = await screen.findByRole('button', { name: 'Back to versions' });
    await waitFor(() => expect(document.activeElement).toBe(back));

    fireEvent.click(back);
    const view = await screen.findByRole('button', { name: 'View version 2' });
    await waitFor(() => expect(document.activeElement).toBe(view));
  });

  it('focuses Back when a comparison opens and Compare when going back', async () => {
    mockedApi.getVersionDiff.mockResolvedValue({ v1: detail(2), v2: detail(3) });
    await renderList();

    fireEvent.click(screen.getByRole('button', { name: /Compare/ }));
    const back = await screen.findByRole('button', { name: 'Back to versions' });
    await waitFor(() => expect(document.activeElement).toBe(back));

    fireEvent.click(back);
    const compare = await screen.findByRole('button', { name: /Compare/ });
    await waitFor(() => expect(document.activeElement).toBe(compare));
  });
});
