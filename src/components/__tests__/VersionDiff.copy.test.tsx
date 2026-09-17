// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import VersionDiff from '../VersionDiff';
import type { StashVersion } from '../../types';

// The diff table is not copyable by selection (line numbers, markers and
// content are separate cells), so the Copy diff button is the only way a
// comparison leaves the app. Pin that it is offered, that what lands on the
// clipboard is a real unified diff, and that a clipboard failure is reported
// rather than swallowed.

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  // jsdom implements neither the async clipboard nor execCommand.
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function version(n: number, files: Record<string, string>): StashVersion {
  return {
    id: `v-${n}`,
    stash_id: 'abc',
    name: 'Stash',
    description: '',
    tags: [],
    metadata: {},
    version: n,
    created_by: 'admin',
    created_at: '2026-01-01T00:00:00.000Z',
    files: Object.entries(files).map(([filename, content], i) => ({
      filename,
      content,
      language: 'text',
      sort_order: i,
    })),
  };
}

const COPY = { name: 'Copy this comparison as a unified diff' };

describe('VersionDiff copy', () => {
  it('copies the comparison as a unified diff', async () => {
    render(
      <VersionDiff
        v1={version(1, { 'a.txt': 'one\ntwo' })}
        v2={version(2, { 'a.txt': 'one\nTWO' })}
      />,
    );

    fireEvent.click(screen.getByRole('button', COPY));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain('--- a/a.txt');
    expect(copied).toContain('+++ b/a.txt');
    expect(copied).toContain('-two');
    expect(copied).toContain('+TWO');
  });

  it('confirms the copy on the button itself', async () => {
    render(<VersionDiff v1={version(1, { 'a.txt': 'one' })} v2={version(2, { 'a.txt': 'two' })} />);

    fireEvent.click(screen.getByRole('button', COPY));

    await waitFor(() => expect(screen.getByRole('button', COPY).textContent).toContain('Copied!'));
  });

  it('reports a failed copy instead of silently doing nothing', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    // The util falls back to execCommand when the clipboard API rejects.
    // jsdom does not implement it at all, so define it rather than spy on it.
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn(() => false),
      configurable: true,
    });

    render(<VersionDiff v1={version(1, { 'a.txt': 'one' })} v2={version(2, { 'a.txt': 'two' })} />);

    fireEvent.click(screen.getByRole('button', COPY));

    await waitFor(() => expect(screen.getByRole('button', COPY).textContent).toContain('Failed'));
  });

  it('offers no copy button when only metadata differs', () => {
    const v1 = version(1, { 'a.txt': 'same' });
    const v2 = { ...version(2, { 'a.txt': 'same' }), name: 'Renamed' };

    render(<VersionDiff v1={v1} v2={v2} />);

    // Nothing to put in a patch — the file is byte-identical.
    expect(screen.queryByRole('button', COPY)).toBeNull();
  });
});
