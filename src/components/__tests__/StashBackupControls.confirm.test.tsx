// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StashBackupControls from '../StashBackupControls';
import { api } from '../../api';
import type { Stash } from '../../types';

vi.mock('../../api', () => ({
  api: {
    getBackupStatus: vi.fn(),
    setStashBackupEnabled: vi.fn(),
    triggerBackupSync: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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

/** Render the bar and wait for the status fetch that makes it appear. */
async function renderBar(stash: Stash = STASH) {
  mockedApi.getBackupStatus.mockResolvedValue({
    configured: true,
    enabled: true,
    repoFullName: 'fo0/backup',
    branch: 'main',
    intervalMinutes: 60,
    health: {
      consecutiveFailures: 0,
      lastRunAt: null,
      lastRunStatus: null,
      lastError: null,
    },
    unhealthy: false,
    states: [],
  });
  render(<StashBackupControls stash={stash} onStashUpdated={vi.fn()} />);
  return screen.findByRole('button', {
    name: /(exclude|include) this stash/i,
  });
}

describe('StashBackupControls exclude confirm', () => {
  it('arms a confirm on the first click instead of excluding right away', async () => {
    const button = await renderBar();
    expect(button.textContent).toContain('Exclude');

    fireEvent.click(button);

    expect(mockedApi.setStashBackupEnabled).not.toHaveBeenCalled();
    const armed = await screen.findByRole('button', {
      name: /confirm excluding this stash/i,
    });
    expect(armed.textContent).toContain('Confirm exclude?');
  });

  it('excludes on the second click', async () => {
    const button = await renderBar();
    mockedApi.setStashBackupEnabled.mockResolvedValue({ ...STASH, backup_enabled: false });

    fireEvent.click(button);
    const armed = await screen.findByRole('button', {
      name: /confirm excluding this stash/i,
    });
    fireEvent.click(armed);

    await waitFor(() => expect(mockedApi.setStashBackupEnabled).toHaveBeenCalledWith('abc', false));
  });

  it('re-including a stash needs no confirm', async () => {
    const button = await renderBar({ ...STASH, backup_enabled: false });
    mockedApi.setStashBackupEnabled.mockResolvedValue({ ...STASH, backup_enabled: true });

    expect(button.textContent).toContain('Include in backup');
    fireEvent.click(button);

    await waitFor(() => expect(mockedApi.setStashBackupEnabled).toHaveBeenCalledWith('abc', true));
  });
});
