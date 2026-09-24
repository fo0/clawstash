// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import VersionHistory from '../VersionHistory';
import { api } from '../../api';
import type { StashVersionListItem } from '../../types';

// Every row of the version list carried a "View" and a "Restore" button whose
// accessible names were exactly those words, so a screen reader listing the
// buttons heard "View, Restore, View, Restore, ..." with no version attached,
// and the armed "Confirm?" did not say which version it was about to restore.
// These pin the per-row names — each starting with the visible text.

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

async function renderList() {
  mockedApi.getVersions.mockResolvedValue(versions(3));
  render(<VersionHistory stashId="abc" currentVersion={3} onRestore={vi.fn()} />);
  await screen.findByText('Version 3');
}

describe('VersionHistory row button names', () => {
  it('names the version on every View button', async () => {
    await renderList();

    for (const version of [3, 2, 1]) {
      const view = screen.getByRole('button', { name: `View version ${version}` });
      expect(view.textContent).toBe('View');
    }
  });

  it('names the version on every Restore button, except the current one', async () => {
    await renderList();

    expect(screen.getByRole('button', { name: 'Restore version 2' }).textContent).toBe('Restore');
    expect(screen.getByRole('button', { name: 'Restore version 1' }).textContent).toBe('Restore');
    // The current version has nothing to restore — no button at all.
    expect(screen.queryByRole('button', { name: 'Restore version 3' })).toBeNull();
  });

  it('says which version the armed confirm will restore', async () => {
    await renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Restore version 2' }));

    const armed = screen.getByRole('button', { name: 'Confirm restore of version 2' });
    expect(armed.textContent).toBe('Confirm?');
    expect(mockedApi.restoreVersion).not.toHaveBeenCalled();
    // Only the clicked row is armed.
    expect(screen.getByRole('button', { name: 'Restore version 1' })).toBeTruthy();
  });
});
