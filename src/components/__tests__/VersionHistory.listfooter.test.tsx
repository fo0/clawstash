// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import VersionHistory from '../VersionHistory';
import { api } from '../../api';
import type { StashVersionListItem } from '../../types';

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

/** Newest first, matching the server's ordering. */
function versions(count: number): StashVersionListItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `v-${count - i}`,
    stash_id: 'abc',
    name: `Version ${count - i}`,
    description: '',
    version: count - i,
    created_by: 'admin',
    created_at: '2026-01-01T00:00:00.000Z',
    file_count: 1,
    total_size: 10,
  }));
}

async function renderHistory(count: number) {
  mockedApi.getVersions.mockResolvedValue(versions(count));
  render(<VersionHistory stashId="abc" currentVersion={count} onRestore={vi.fn()} />);
  await screen.findByText(`Version ${count}`);
}

describe('VersionHistory truncation footer', () => {
  it('asks the server for one page instead of the whole history', async () => {
    await renderHistory(10);
    expect(mockedApi.getVersions).toHaveBeenCalledWith('abc', 50);
  });

  it('stays silent when the history fits in one page', async () => {
    await renderHistory(10);
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
    expect(screen.queryByText(/most recent versions/)).toBeNull();
  });

  it('admits the truncation and offers the next page on a full page', async () => {
    await renderHistory(50);
    expect(screen.getByText('Showing the 50 most recent versions.')).toBeTruthy();

    mockedApi.getVersions.mockResolvedValue(versions(72));
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

    await waitFor(() => expect(mockedApi.getVersions).toHaveBeenLastCalledWith('abc', 100));
    // The shorter second page is the whole history — the footer goes away.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull());
  }, 15_000);

  it('keeps the compare selection across a "Show more"', async () => {
    await renderHistory(50);
    const from = screen.getByRole('radio', { name: 'Compare from version 48' });
    fireEvent.click(from);
    expect((from as HTMLInputElement).checked).toBe(true);

    mockedApi.getVersions.mockResolvedValue(versions(72));
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

    await waitFor(() => expect(mockedApi.getVersions).toHaveBeenLastCalledWith('abc', 100));
    await waitFor(() =>
      expect(
        (screen.getByRole('radio', { name: 'Compare from version 48' }) as HTMLInputElement)
          .checked,
      ).toBe(true),
    );
  }, 15_000);
});
