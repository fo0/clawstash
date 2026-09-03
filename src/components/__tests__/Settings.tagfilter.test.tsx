// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Settings from '../Settings';
import { api } from '../../api';
import type { Stats, TagInfo } from '../../types';

vi.mock('../../api', () => ({
  api: {
    getStats: vi.fn(),
    getTags: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const STATS: Stats = {
  totalStashes: 12,
  totalFiles: 30,
  totalBytes: 4096,
  topLanguages: [],
};

/** 12 tags — above the threshold that grows the search field. */
const MANY_TAGS: TagInfo[] = [
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'zeta',
  'eta',
  'theta',
  'iota',
  'kappa',
  'lambda',
  'notes-archive',
].map((tag, i) => ({ tag, count: 12 - i }));

async function renderStorage(tags: TagInfo[]) {
  mockedApi.getStats.mockResolvedValue(STATS);
  mockedApi.getTags.mockResolvedValue(tags);
  render(
    <Settings
      activeSection="storage"
      layout="grid"
      onLayoutChange={vi.fn()}
      onSettingsSection={vi.fn()}
      onFilterTag={vi.fn()}
    />,
  );
  return screen.findByRole('heading', { name: /^Tags \(/ });
}

describe('Settings storage tag filter', () => {
  it('stays out of the way while the cloud is short', async () => {
    await renderStorage(MANY_TAGS.slice(0, 4));
    expect(screen.queryByRole('textbox', { name: /search tags/i })).toBeNull();
  });

  it('narrows the cloud to the matching tags', async () => {
    await renderStorage(MANY_TAGS);
    const field = screen.getByRole('textbox', { name: /search tags/i });

    expect(screen.getByRole('button', { name: /filter stashes by tag alpha/i })).toBeTruthy();

    fireEvent.change(field, { target: { value: 'ta' } });

    // beta, delta, zeta, eta, theta, iota — every tag containing "ta".
    expect(screen.getByRole('button', { name: /filter stashes by tag beta/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /filter stashes by tag alpha/i })).toBeNull();
    expect(screen.getByText('6 of 12 tags')).toBeTruthy();
  });

  it('explains an empty cloud and offers a way back', async () => {
    await renderStorage(MANY_TAGS);
    const field = screen.getByRole('textbox', { name: /search tags/i });

    fireEvent.change(field, { target: { value: 'nothing-matches-this' } });
    expect(screen.getByText(/No tags match/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /clear filter/i }));

    expect(screen.queryByText(/No tags match/)).toBeNull();
    expect(screen.getByRole('button', { name: /filter stashes by tag alpha/i })).toBeTruthy();
  });
});
