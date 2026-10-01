// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Settings from '../Settings';
import { api } from '../../api';
import type { Stats } from '../../types';

vi.mock('../../api', () => ({
  api: {
    getStats: vi.fn(),
    getTags: vi.fn(),
    importData: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

const STATS: Stats = {
  totalStashes: 12,
  totalFiles: 30,
  totalBytes: 4096,
  topLanguages: [],
};

const IMPORTED = {
  message: 'Import completed',
  imported: { stashes: 3, files: 5, versions: 7, versionFiles: 9 },
};

beforeEach(() => {
  mockedApi.getStats.mockResolvedValue(STATS);
  mockedApi.getTags.mockResolvedValue([]);
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function renderStorage() {
  const onDataImported = vi.fn();
  const view = render(
    <Settings
      activeSection="storage"
      layout="grid"
      onLayoutChange={vi.fn()}
      onSettingsSection={vi.fn()}
      onDataImported={onDataImported}
    />,
  );
  await screen.findByRole('heading', { name: 'Data Export / Import' });
  return { onDataImported, ...view };
}

/** Pick a ZIP through the section's hidden file input. */
function pickImportFile(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['zip'], 'clawstash-export.zip', { type: 'application/zip' });
  fireEvent.change(input, { target: { files: [file] } });
}

describe('Settings storage import refreshes the app', () => {
  it('tells the app once the import has replaced the data', async () => {
    mockedApi.importData.mockResolvedValue(IMPORTED);
    const { onDataImported, container } = await renderStorage();

    pickImportFile(container);

    await screen.findByText(/Import successful/);
    expect(onDataImported).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when the confirmation is declined', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    );
    const { onDataImported, container } = await renderStorage();

    pickImportFile(container);

    expect(mockedApi.importData).not.toHaveBeenCalled();
    expect(onDataImported).not.toHaveBeenCalled();
  });

  it('stays quiet when the import fails', async () => {
    mockedApi.importData.mockRejectedValue(new Error('Invalid export archive'));
    const { onDataImported, container } = await renderStorage();

    pickImportFile(container);

    await screen.findByText('Invalid export archive');
    expect(onDataImported).not.toHaveBeenCalled();
  });

  it('still tells the app when the section was left mid-import', async () => {
    let finishImport: (value: typeof IMPORTED) => void = () => {};
    mockedApi.importData.mockReturnValue(
      new Promise((resolve) => {
        finishImport = resolve;
      }),
    );
    const { onDataImported, container, unmount } = await renderStorage();

    pickImportFile(container);
    await waitFor(() => expect(mockedApi.importData).toHaveBeenCalledTimes(1));
    unmount();
    finishImport(IMPORTED);

    // The data on the server is replaced either way — the app's lists are stale.
    await waitFor(() => expect(onDataImported).toHaveBeenCalledTimes(1));
  });
});
