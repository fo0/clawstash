// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import VersionHistory from '../VersionHistory';
import { api } from '../../api';
import type { Stash, StashVersionListItem } from '../../types';

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

/** Arms the two-click confirm on version 2 and fires the second click. */
async function startRestoreOfVersion2() {
  mockedApi.getVersions.mockResolvedValue(versions(3));
  const onRestore = vi.fn();
  render(<VersionHistory stashId="abc" currentVersion={3} onRestore={onRestore} />);
  await screen.findByText('Version 3');

  fireEvent.click(screen.getByTitle('Restore version 2 as the current state'));
  fireEvent.click(screen.getByTitle('Click again to restore version 2 as the current state'));
  return onRestore;
}

describe('VersionHistory restore feedback', () => {
  it('names the row it is restoring while the request is in flight', async () => {
    let settle: (stash: Stash) => void = () => {};
    mockedApi.restoreVersion.mockReturnValue(
      new Promise<Stash>((resolve) => {
        settle = resolve;
      }),
    );

    const onRestore = await startRestoreOfVersion2();

    const busy = screen.getByTitle('Restoring version 2...');
    expect(busy.textContent).toContain('Restoring...');
    expect(busy.getAttribute('aria-busy')).toBe('true');
    // The other rows are disabled for the duration — say why.
    const waiting = screen.getByTitle('Restoring version 2 — please wait');
    expect((waiting as HTMLButtonElement).disabled).toBe(true);

    settle({ id: 'abc' } as Stash);
    await waitFor(() => expect(onRestore).toHaveBeenCalled());
  });

  it('returns the row to "Restore" when the restore fails', async () => {
    mockedApi.restoreVersion.mockRejectedValue(new Error('boom'));

    await startRestoreOfVersion2();

    expect(await screen.findByText('Failed to restore version')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTitle('Restore version 2 as the current state').textContent).toBe(
        'Restore',
      ),
    );
  });
});
