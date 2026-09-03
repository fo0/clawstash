// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import VersionHistory from '../VersionHistory';
import { api } from '../../api';
import { formatRelativeTime } from '../../utils/format';
import type { StashVersionListItem } from '../../types';

vi.mock('../../api', () => ({
  api: {
    getVersions: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CREATED_AT = '2026-01-02T03:04:05.000Z';

const VERSIONS: StashVersionListItem[] = [
  {
    id: 'v2',
    stash_id: 'abc',
    name: 'Second',
    description: '',
    version: 2,
    created_by: 'api',
    created_at: CREATED_AT,
    file_count: 1,
    total_size: 10,
  },
  {
    id: 'v1',
    stash_id: 'abc',
    name: 'First',
    description: '',
    version: 1,
    created_by: 'api',
    created_at: CREATED_AT,
    file_count: 1,
    total_size: 10,
  },
];

async function renderHistory() {
  mockedApi.getVersions.mockResolvedValue(VERSIONS);
  render(<VersionHistory stashId="abc" currentVersion={2} onRestore={vi.fn()} />);
  // Named by the relative label it currently renders, so the query stays valid
  // however far in the past the fixture date drifts.
  return screen.findAllByRole('button', { name: formatRelativeTime(CREATED_AT) });
}

describe('VersionHistory row timestamps', () => {
  it('exposes the absolute timestamp of every version row', async () => {
    const times = await renderHistory();
    expect(times).toHaveLength(VERSIONS.length);

    const absolute = new Date(CREATED_AT).toLocaleString();
    // The absolute form is reachable without a click: it rides along in the
    // tooltip, which is what a pointer user hovers for.
    expect(times[0].getAttribute('title')).toContain(absolute);
  });

  it('toggles a row timestamp to its absolute form on click', async () => {
    const times = await renderHistory();
    const absolute = new Date(CREATED_AT).toLocaleString();
    expect(times[0].textContent).not.toBe(absolute);

    fireEvent.click(times[0]);

    expect(times[0].textContent).toBe(absolute);
  });
});
