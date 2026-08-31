// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import VersionHistory from '../VersionHistory';
import type { StashVersion, StashVersionListItem } from '../../types';

const getVersions = vi.fn();
const getVersion = vi.fn();
vi.mock('../../api', () => ({
  api: {
    getVersions: (...args: unknown[]) => getVersions(...args),
    getVersion: (...args: unknown[]) => getVersion(...args),
  },
}));

let anchorClick: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  anchorClick = vi.fn<() => void>();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => anchorClick());
  // jsdom implements no blob URLs.
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} });
});

afterEach(() => {
  cleanup();
  getVersions.mockReset();
  getVersion.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function listItem(version: number): StashVersionListItem {
  return {
    id: `v${version}`,
    stash_id: 'abc',
    name: 'My stash',
    description: '',
    version,
    created_by: 'system',
    created_at: '2026-01-01T00:00:00.000Z',
    file_count: 1,
    total_size: 10,
  };
}

const VERSION_3: StashVersion = {
  id: 'v3',
  stash_id: 'abc',
  name: 'My stash',
  description: '',
  tags: [],
  metadata: {},
  version: 3,
  created_by: 'system',
  created_at: '2026-01-01T00:00:00.000Z',
  files: [{ filename: 'config.yml', content: 'a: 1', language: 'yaml', sort_order: 0 }],
};

/** Render the history and open the detail view of version 3. */
async function openVersionDetail() {
  getVersions.mockResolvedValue([listItem(3), listItem(2)]);
  getVersion.mockResolvedValue(VERSION_3);

  render(<VersionHistory stashId="abc" currentVersion={3} onRestore={vi.fn()} />);
  const viewButtons = await screen.findAllByRole('button', { name: 'View' });
  fireEvent.click(viewButtons[0]);
  await waitFor(() => expect(screen.getByText('config.yml')).toBeTruthy());
}

describe('VersionHistory file download', () => {
  it('offers Download next to Copy in the version detail view', async () => {
    await openVersionDetail();
    const download = screen.getByRole('button', {
      name: 'Download config.yml as of version 3',
    });
    // The saved name carries the version so revisions do not overwrite each
    // other in the download folder.
    expect(download.getAttribute('title')).toBe('Download config.v3.yml');
    expect(screen.getByRole('button', { name: 'Copy content of config.yml' })).toBeTruthy();
  });

  it('triggers a download when clicked', async () => {
    await openVersionDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Download config.yml as of version 3' }));
    expect(anchorClick).toHaveBeenCalledTimes(1);
  });
});
