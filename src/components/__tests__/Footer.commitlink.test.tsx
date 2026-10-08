// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Footer from '../Footer';
import type { VersionResponse } from '../../types';

// Build Info names the running commit. Pin that the SHA links to that commit
// on GitHub, and that only a real SHA under the server's GitHub URL does.

const getBuildVersion = vi.fn();
vi.mock('../../api', () => ({
  api: { getBuildVersion: (...args: unknown[]) => getBuildVersion(...args) },
}));

afterEach(() => {
  cleanup();
  getBuildVersion.mockReset();
});

const REPO = 'https://github.com/fo0/clawstash';
const SHA = '0427966';

function versionResponse(
  commitSha: string,
  overrides: Partial<VersionResponse> = {},
): VersionResponse {
  return {
    current: {
      version: 'v20260101-1200',
      commit_sha: commitSha,
      build_date: '2026-01-01T12:00:00.000Z',
      branch: 'main',
    },
    latest: null,
    update_available: false,
    upgrade: null,
    github_url: REPO,
    checked_at: '2026-01-02T12:00:00.000Z',
    ...overrides,
  };
}

async function openDetails() {
  fireEvent.click(await screen.findByRole('button', { name: 'Build info' }));
}

describe('Footer build commit link', () => {
  it('links the commit SHA to the commit on GitHub', async () => {
    getBuildVersion.mockResolvedValue(versionResponse(SHA));
    render(<Footer />);
    await openDetails();

    // Desktop row and phone-width panel are both in the DOM; CSS picks one.
    const links = screen.getAllByRole('link', { name: SHA });
    expect(links.length).toBe(2);
    for (const link of links) {
      expect(link.getAttribute('href')).toBe(`${REPO}/commit/${SHA}`);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });

  it('leaves a hash that is not a SHA as plain text', async () => {
    getBuildVersion.mockResolvedValue(versionResponse('unknown'));
    render(<Footer />);
    await openDetails();

    expect(screen.getAllByText('unknown').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'unknown' })).toBeNull();
  });

  it('does not link outside GitHub', async () => {
    getBuildVersion.mockResolvedValue(
      versionResponse(SHA, { github_url: 'https://example.com/fo0/clawstash' }),
    );
    render(<Footer />);
    await openDetails();

    expect(screen.getAllByText(SHA).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: SHA })).toBeNull();
  });
});
