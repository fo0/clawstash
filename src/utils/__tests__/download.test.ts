// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadTextFile, versionedFilename } from '../download';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('versionedFilename', () => {
  it('inserts the version before the extension', () => {
    expect(versionedFilename('config.yml', 3)).toBe('config.v3.yml');
  });

  it('keeps a multi-dot name intact, splitting on the last dot only', () => {
    expect(versionedFilename('archive.tar.gz', 12)).toBe('archive.tar.v12.gz');
  });

  it('appends to an extensionless name', () => {
    expect(versionedFilename('Dockerfile', 2)).toBe('Dockerfile.v2');
  });

  it('treats a leading dot as part of a dotfile name, not an extension', () => {
    expect(versionedFilename('.env', 5)).toBe('.env.v5');
  });
});

describe('downloadTextFile', () => {
  function stubObjectUrl() {
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
    return { createObjectURL, revokeObjectURL };
  }

  it('clicks a download anchor carrying the filename and removes it again', () => {
    stubObjectUrl();
    const click = vi.fn();
    const created: HTMLAnchorElement[] = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') {
        (el as HTMLAnchorElement).click = click;
        created.push(el as HTMLAnchorElement);
      }
      return el;
    });

    downloadTextFile('notes.md', '# hello');

    expect(created).toHaveLength(1);
    expect(created[0].download).toBe('notes.md');
    expect(created[0].getAttribute('href')).toBe('blob:mock');
    expect(click).toHaveBeenCalledTimes(1);
    // The anchor must not be left behind in the document.
    expect(document.body.contains(created[0])).toBe(false);

    vi.unstubAllGlobals();
  });

  it('revokes the object URL once the download has had time to start', () => {
    vi.useFakeTimers();
    const { revokeObjectURL } = stubObjectUrl();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadTextFile('notes.md', 'body');

    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');

    vi.unstubAllGlobals();
  });
});
