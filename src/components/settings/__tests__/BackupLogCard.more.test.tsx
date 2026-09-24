// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import BackupLogCard from '../BackupLogCard';
import { api } from '../../../api';
import type { BackupLogEntry } from '../../../types';

// The sync log was fetched with a fixed `limit: 50` and rendered as if it were
// the whole log, so a busy instance's older runs were unreachable and nothing
// said they existed. These pin the truncation footer and its "Show more" up to
// the route's 200-row ceiling.

vi.mock('../../../api', () => ({
  api: {
    getBackupLog: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function runs(count: number): BackupLogEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `log-${i}`,
    run_id: `run-${i}`,
    stash_id: null,
    stash_name: null,
    trigger: 'scheduled',
    status: 'skipped',
    action: null,
    message: `run ${i}`,
    commit_sha: null,
    started_at: '2026-09-01T00:00:00.000Z',
    finished_at: '2026-09-01T00:00:01.000Z',
  }));
}

/** Answer every request with as many runs as it asked for, capped at `total`. */
function serveLog(total: number) {
  mockedApi.getBackupLog.mockImplementation(async (params) => ({
    entries: runs(Math.min(params?.limit ?? 50, total)),
  }));
}

describe('BackupLogCard truncation footer', () => {
  it('shows no footer when the log fits on one page', async () => {
    serveLog(12);
    render(<BackupLogCard repoFullName={null} refreshToken={0} />);

    await screen.findByText('run 11');
    expect(screen.queryByText(/most recent runs/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
    expect(mockedApi.getBackupLog).toHaveBeenCalledWith({ limit: 50 });
  });

  it('admits a full page and widens it by 50 on "Show more"', async () => {
    serveLog(120);
    render(<BackupLogCard repoFullName={null} refreshToken={0} />);

    expect(await screen.findByText('Showing the 50 most recent runs.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

    expect(await screen.findByText('Showing the 100 most recent runs.')).toBeTruthy();
    expect(mockedApi.getBackupLog).toHaveBeenLastCalledWith({ limit: 100 });
    expect(screen.getByText('run 99')).toBeTruthy();
  });

  it('drops the footer once a wider page comes back short', async () => {
    serveLog(70);
    render(<BackupLogCard repoFullName={null} refreshToken={0} />);

    await screen.findByText('Showing the 50 most recent runs.');
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

    await screen.findByText('run 69');
    expect(screen.queryByText(/most recent runs/)).toBeNull();
  });

  it('stops offering more at the route ceiling of 200', async () => {
    serveLog(1000);
    render(<BackupLogCard repoFullName={null} refreshToken={0} />);

    for (const shown of [50, 100, 150]) {
      await screen.findByText(`Showing the ${shown} most recent runs.`);
      fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    }

    await waitFor(() =>
      expect(
        screen.getByText(/Showing the 200 most recent runs\. This is the maximum/),
      ).toBeTruthy(),
    );
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
    expect(mockedApi.getBackupLog).toHaveBeenLastCalledWith({ limit: 200 });
  });

  it('keeps the widened page when the parent triggers a refetch', async () => {
    serveLog(120);
    const { rerender } = render(<BackupLogCard repoFullName={null} refreshToken={0} />);

    await screen.findByText('Showing the 50 most recent runs.');
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await screen.findByText('Showing the 100 most recent runs.');

    rerender(<BackupLogCard repoFullName={null} refreshToken={1} />);

    await waitFor(() => expect(mockedApi.getBackupLog).toHaveBeenCalledTimes(3));
    expect(mockedApi.getBackupLog).toHaveBeenLastCalledWith({ limit: 100 });
  });
});
