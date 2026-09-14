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

let downloadName: string | null;
let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  downloadName = null;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLElement) {
    downloadName = this.getAttribute('download');
  });
  // jsdom implements neither blob URLs nor the async clipboard.
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} });
  writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
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
    name: 'Deploy Notes',
    description: '',
    version,
    created_by: 'system',
    created_at: '2026-01-01T00:00:00.000Z',
    file_count: 2,
    total_size: 10,
  };
}

function version(files: StashVersion['files']): StashVersion {
  return {
    id: 'v3',
    stash_id: 'abc',
    name: 'Deploy Notes',
    description: '',
    tags: [],
    metadata: {},
    version: 3,
    created_by: 'system',
    created_at: '2026-01-01T00:00:00.000Z',
    files,
  };
}

const TWO_FILES: StashVersion['files'] = [
  { filename: 'a.yml', content: 'a: 1', language: 'yaml', sort_order: 0 },
  { filename: 'b.yml', content: 'b: 2', language: 'yaml', sort_order: 1 },
];

async function openDetail(detail: StashVersion) {
  getVersions.mockResolvedValue([listItem(3), listItem(2)]);
  getVersion.mockResolvedValue(detail);
  render(<VersionHistory stashId="abc" currentVersion={3} onRestore={vi.fn()} />);
  fireEvent.click((await screen.findAllByRole('button', { name: 'View' }))[0]);
  await waitFor(() => expect(screen.getByText(detail.files[0].filename)).toBeTruthy());
}

describe('VersionHistory bundle actions', () => {
  it('stays out of the way for a single-file version', async () => {
    await openDetail(version([TWO_FILES[0]]));
    expect(screen.queryByRole('button', { name: 'Copy all files of version 3' })).toBeNull();
  });

  it('downloads every file of the version as one versioned text file', async () => {
    await openDetail(version(TWO_FILES));
    fireEvent.click(
      screen.getByRole('button', { name: 'Download all files of version 3 as one text file' }),
    );
    // Slug of the version's own name, with the version so revisions of the
    // same stash land side by side instead of overwriting each other.
    expect(downloadName).toBe('deploy-notes.v3.txt');
  });

  it('copies the same bundle the viewer builds', async () => {
    await openDetail(version(TWO_FILES));
    fireEvent.click(screen.getByRole('button', { name: 'Copy all files of version 3' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toBe('// === a.yml ===\na: 1\n\n// === b.yml ===\nb: 2');
  });
});
