// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Footer from '../Footer';
import type { VersionResponse } from '../../types';

const getBuildVersion = vi.fn();
vi.mock('../../api', () => ({
  api: { getBuildVersion: (...args: unknown[]) => getBuildVersion(...args) },
}));

afterEach(() => {
  cleanup();
  getBuildVersion.mockReset();
});

const REPO = 'https://github.com/fo0/clawstash';
const CHANGELOG = `${REPO}/blob/main/CHANGELOG.md`;

function versionResponse(overrides: Partial<VersionResponse> = {}): VersionResponse {
  return {
    current: {
      version: 'v20260101-1200',
      commit_sha: 'aaaaaaa',
      build_date: '2026-01-01T12:00:00.000Z',
      branch: 'main',
    },
    latest: null,
    update_available: false,
    upgrade: { image: '', instructions: '', compare_url: null, changelog_url: CHANGELOG },
    github_url: REPO,
    checked_at: '2026-01-02T12:00:00.000Z',
    ...overrides,
  };
}

describe('Footer update indicator', () => {
  it('stays silent while the instance is up to date', async () => {
    getBuildVersion.mockResolvedValue(versionResponse());
    render(<Footer />);
    // Wait for the response to land, so the assertion is not merely early.
    await screen.findByText('Build Info');
    expect(screen.queryByRole('link', { name: 'Update available' })).toBeNull();
  });

  it('links the badge to the compare view and names the newer commit', async () => {
    getBuildVersion.mockResolvedValue(
      versionResponse({
        latest: {
          commit_sha: 'bbbbbbb',
          commit_date: '2026-01-02T12:00:00.000Z',
          commit_message: 'Add a thing',
        },
        update_available: true,
        upgrade: {
          image: '',
          instructions: '',
          compare_url: `${REPO}/compare/aaaaaaa...bbbbbbb`,
          changelog_url: CHANGELOG,
        },
      }),
    );
    render(<Footer />);
    const badge = await screen.findByRole('link', { name: 'Update available' });
    expect(badge.getAttribute('href')).toBe(`${REPO}/compare/aaaaaaa...bbbbbbb`);
    expect(badge.getAttribute('title')).toContain('bbbbbbb');
    expect(badge.getAttribute('title')).toContain('Add a thing');
  });

  it('falls back to the changelog when no compare URL was built', async () => {
    getBuildVersion.mockResolvedValue(
      versionResponse({
        latest: { commit_sha: null, commit_date: null, commit_message: null },
        update_available: true,
      }),
    );
    render(<Footer />);
    const badge = await screen.findByRole('link', { name: 'Update available' });
    expect(badge.getAttribute('href')).toBe(CHANGELOG);
  });

  it('still reports the update when the local build date is unusable', async () => {
    getBuildVersion.mockResolvedValue(
      versionResponse({
        current: { version: 'unknown', commit_sha: '', build_date: 'nope', branch: '' },
        update_available: true,
      }),
    );
    render(<Footer />);
    await screen.findByRole('link', { name: 'Update available' });
    expect(screen.queryByText('Build Info')).toBeNull();
  });
});
