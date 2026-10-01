// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import StashViewer from '../StashViewer';
import { getFocusableElements } from '../../hooks/useFocusTrap';
import { canToggleQuickSearch } from '../../utils/quick-search-gate';
import type { Stash, StashFile } from '../../types';

// Stand-in for MermaidDiagram (the real one lazy-loads mermaid, which jsdom
// cannot render). It reproduces just the part the maximize contract has to
// coexist with: an inline fullscreen dialog that consumes Escape through its
// own `document` listener, opened after the file was maximized.
vi.mock('../MermaidDiagram', async () => {
  const { useEffect, useState } = await import('react');
  function MermaidStub() {
    const [fullscreen, setFullscreen] = useState(false);
    useEffect(() => {
      if (!fullscreen) return;
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        setFullscreen(false);
      };
      document.addEventListener('keydown', onKeyDown);
      return () => document.removeEventListener('keydown', onKeyDown);
    }, [fullscreen]);
    return (
      <div
        data-testid="mermaid-stub"
        role={fullscreen ? 'dialog' : undefined}
        aria-modal={fullscreen ? true : undefined}
      >
        <button type="button" onClick={() => setFullscreen(true)}>
          Enter fullscreen
        </button>
      </div>
    );
  }
  return { default: MermaidStub };
});

// jsdom has no layout engine, so neither `scrollIntoView` nor `matchMedia`
// (read for the reduced-motion scroll behaviour) exists by default.
beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});

let windowKeydown: Mock<(e: KeyboardEvent) => void> | null = null;

afterEach(() => {
  cleanup();
  if (windowKeydown) window.removeEventListener('keydown', windowKeydown);
  windowKeydown = null;
  localStorage.clear();
  document.body.style.overflow = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Stands in for App's window-level Escape→home hotkey. */
function spyOnWindowKeydown() {
  const spy = vi.fn<(e: KeyboardEvent) => void>();
  windowKeydown = spy;
  window.addEventListener('keydown', spy);
  return spy;
}

function file(n: number, filename = `file-${n}.txt`, language = 'text'): StashFile {
  return {
    id: `f${n}`,
    stash_id: 'abc',
    filename,
    content: `content ${n}`,
    language,
    sort_order: n,
  };
}

/** A Markdown file whose content carries user-authored raw HTML. */
function markdownFile(n: number, content: string): StashFile {
  return { ...file(n, `notes-${n}.md`, 'markdown'), content };
}

function stashWith(files: StashFile[], id = 'abc'): Stash {
  return {
    id,
    name: 'My stash',
    description: '',
    tags: [],
    metadata: {},
    version: 1,
    archived: false,
    backup_enabled: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    files,
  };
}

function viewer(stash: Stash) {
  return (
    <StashViewer
      stash={stash}
      onEdit={vi.fn()}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
      onArchive={vi.fn()}
      onBack={vi.fn()}
      onAnalyzeStash={vi.fn()}
      onFilterTag={vi.fn()}
      isFavorite={false}
      onToggleFavorite={vi.fn()}
    />
  );
}

function renderViewer(files: StashFile[] = [file(0), file(1)]) {
  return render(viewer(stashWith(files)));
}

function fileBox(container: HTMLElement, index: number): HTMLElement {
  return container.querySelector<HTMLElement>(`#stash-file-${index}`)!;
}

function maximize(filename: string) {
  fireEvent.click(screen.getByRole('button', { name: `Maximize ${filename}` }));
}

/** Waits out the focus guard, which decides one task after a `focusin`. */
async function flushFocusGuard() {
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

function pressEscape() {
  return fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
}

describe('StashViewer per-file maximize', () => {
  it('turns the file box into a modal dialog and flips the button to Restore', () => {
    const { container } = renderViewer();
    const box = fileBox(container, 1);
    expect(box.getAttribute('role')).toBeNull();
    expect(container.querySelector('.viewer-file-backdrop')).toBeNull();

    maximize('file-1.txt');

    expect(box.getAttribute('role')).toBe('dialog');
    expect(box.getAttribute('aria-modal')).toBe('true');
    expect(box.getAttribute('aria-label')).toBe('file-1.txt (maximized)');
    expect(box.classList.contains('viewer-file-maximized')).toBe(true);
    expect(screen.getByRole('dialog', { name: 'file-1.txt (maximized)' })).toBe(box);
    expect(container.querySelector('.viewer-file-backdrop')).toBeTruthy();
    // Focus moved into the dialog; the page behind is scroll-locked.
    expect(document.activeElement).toBe(box);
    expect(document.body.style.overflow).toBe('hidden');

    const restore = screen.getByRole('button', { name: 'Restore file-1.txt' });
    expect(restore.getAttribute('title')).toBe('Restore file-1.txt (Esc)');
    expect(restore.textContent).toContain('Restore');
    // The collapse chevron has nothing to do on a maximized file.
    expect(screen.queryByRole('button', { name: 'Collapse file-1.txt' })).toBeNull();
    // The other file is untouched.
    expect(fileBox(container, 0).getAttribute('role')).toBeNull();
    expect(screen.getByRole('button', { name: 'Maximize file-0.txt' })).toBeTruthy();
  });

  it('keeps the same DOM node (no remount) across the toggle', () => {
    const { container } = renderViewer([file(0, 'page.html', 'html')]);
    const iframe = container.querySelector('iframe.html-preview');
    expect(iframe).toBeTruthy();

    maximize('page.html');
    expect(container.querySelector('iframe.html-preview')).toBe(iframe);

    fireEvent.click(screen.getByRole('button', { name: 'Restore page.html' }));
    expect(container.querySelector('iframe.html-preview')).toBe(iframe);
  });

  it('restores via the Restore button and hands focus back to it', () => {
    const { container } = renderViewer();
    maximize('file-1.txt');
    const button = screen.getByRole('button', { name: 'Restore file-1.txt' });

    fireEvent.click(button);

    const box = fileBox(container, 1);
    expect(box.getAttribute('role')).toBeNull();
    expect(box.classList.contains('viewer-file-maximized')).toBe(false);
    expect(container.querySelector('.viewer-file-backdrop')).toBeNull();
    expect(screen.getByRole('button', { name: 'Maximize file-1.txt' })).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(document.body.style.overflow).toBe('');
  });

  it('restores on a backdrop click', () => {
    const { container } = renderViewer();
    maximize('file-1.txt');
    const button = screen.getByRole('button', { name: 'Restore file-1.txt' });

    fireEvent.click(container.querySelector('.viewer-file-backdrop')!);

    expect(fileBox(container, 1).getAttribute('role')).toBeNull();
    expect(container.querySelector('.viewer-file-backdrop')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('restores on Escape without letting it reach window-level hotkeys', () => {
    const { container } = renderViewer();
    const onWindowKeydown = spyOnWindowKeydown();
    maximize('file-1.txt');
    const button = screen.getByRole('button', { name: 'Restore file-1.txt' });

    expect(pressEscape()).toBe(false); // preventDefault() -> fireEvent returns false

    expect(fileBox(container, 1).getAttribute('role')).toBeNull();
    expect(onWindowKeydown).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);

    // Control: with nothing maximized, Escape is App's again.
    pressEscape();
    expect(onWindowKeydown).toHaveBeenCalledTimes(1);
  });

  it('maximizes only one file at a time', () => {
    const { container } = renderViewer();
    maximize('file-0.txt');
    // The backdrop covers it for a pointer, but the toggle must still be sound.
    maximize('file-1.txt');

    expect(fileBox(container, 0).getAttribute('role')).toBeNull();
    expect(fileBox(container, 0).classList.contains('viewer-file-maximized')).toBe(false);
    expect(fileBox(container, 1).getAttribute('role')).toBe('dialog');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(container.querySelectorAll('.viewer-file-backdrop')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Maximize file-0.txt' })).toBeTruthy();
  });

  it('shows a collapsed file while maximized and leaves it collapsed afterwards', () => {
    const { container } = renderViewer();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse file-1.txt' }));
    expect(container.querySelector('#stash-file-1 .file-content')).toBeNull();

    maximize('file-1.txt');
    expect(container.querySelector('#stash-file-1 .file-content')).toBeTruthy();
    expect(fileBox(container, 1).classList.contains('viewer-file-collapsed')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Restore file-1.txt' }));
    expect(container.querySelector('#stash-file-1 .file-content')).toBeNull();
    expect(screen.getByRole('button', { name: 'Expand file-1.txt' })).toBeTruthy();
  });

  it('ignores header-surface clicks while maximized', () => {
    const { container } = renderViewer();
    const header = container.querySelector<HTMLElement>('#stash-file-1 .file-header')!;
    maximize('file-1.txt');

    fireEvent.click(header);
    // A maximized file shows its content either way, so the click's effect
    // only surfaces once the file is restored: it must still be expanded.
    fireEvent.click(screen.getByRole('button', { name: 'Restore file-1.txt' }));
    expect(container.querySelector('#stash-file-1 .file-content')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Collapse file-1.txt' })).toBeTruthy();

    // Control: restored, the same surface collapses the file again.
    fireEvent.click(header);
    expect(container.querySelector('#stash-file-1 .file-content')).toBeNull();
  });

  it('leaves Escape to a dialog nested inside the maximized file', () => {
    const { container } = renderViewer([file(0, 'diagram.mmd', 'mermaid')]);
    const onWindowKeydown = spyOnWindowKeydown();
    maximize('diagram.mmd');
    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }));
    const stub = screen.getByTestId('mermaid-stub');
    expect(stub.getAttribute('role')).toBe('dialog');

    // First Escape: only the inner fullscreen closes.
    pressEscape();
    expect(stub.getAttribute('role')).toBeNull();
    expect(fileBox(container, 0).getAttribute('role')).toBe('dialog');
    expect(onWindowKeydown).not.toHaveBeenCalled();

    // Second Escape: now the maximized file restores.
    pressEscape();
    expect(fileBox(container, 0).getAttribute('role')).toBeNull();
    expect(onWindowKeydown).not.toHaveBeenCalled();
    // Same diagram instance throughout — the toggle did not remount it.
    expect(screen.getByTestId('mermaid-stub')).toBe(stub);
  });

  it('ignores a role="dialog" written into a maximized Markdown file', () => {
    const { container } = renderViewer([markdownFile(0, '<div role="dialog">x</div>')]);
    const onWindowKeydown = spyOnWindowKeydown();
    maximize('notes-0.md');
    // Fixture check: the sanitiser keeps the attribute, so the spoof is live.
    expect(container.querySelector('#stash-file-0 .markdown-body [role="dialog"]')).toBeTruthy();

    expect(pressEscape()).toBe(false);

    expect(fileBox(container, 0).getAttribute('role')).toBeNull();
    expect(onWindowKeydown).not.toHaveBeenCalled();
  });

  it('keeps trapping Tab when a maximized Markdown file contains aria-modal', () => {
    const { container } = renderViewer([
      markdownFile(0, '<div aria-modal="true">x</div>'),
      file(1),
    ]);
    maximize('notes-0.md');
    expect(
      container.querySelector('#stash-file-0 .markdown-body [aria-modal="true"]'),
    ).toBeTruthy();
    const focusable = getFocusableElements(fileBox(container, 0));
    focusable[focusable.length - 1]!.focus();

    expect(fireEvent.keyDown(document.activeElement!, { key: 'Tab' })).toBe(false);
    expect(document.activeElement).toBe(focusable[0]);
  });

  it('pulls focus that leaves the box back in, unless another modal takes it', async () => {
    const { container } = renderViewer();
    maximize('file-1.txt');
    const box = fileBox(container, 1);

    // What Tab out of the HTML preview iframe does: focus lands behind the
    // backdrop without a keydown the trap could see.
    screen.getByRole('button', { name: 'Maximize file-0.txt' }).focus();
    await flushFocusGuard();
    expect(document.activeElement).toBe(box);

    // A modal of the app's own outside the box keeps the focus it took.
    const other = document.createElement('div');
    other.setAttribute('aria-modal', 'true');
    const inOther = other.appendChild(document.createElement('button'));
    document.body.appendChild(other);
    try {
      inOther.focus();
      await flushFocusGuard();
      expect(document.activeElement).toBe(inOther);
    } finally {
      other.remove();
    }
  });

  it('reaches the Restore button with Shift+Tab right after opening', () => {
    const { container } = renderViewer();
    maximize('file-1.txt');
    expect(document.activeElement).toBe(fileBox(container, 1));

    expect(fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Restore file-1.txt' }));
  });

  it('leaves focus to the clipboard fallback while it copies (plain HTTP)', async () => {
    // No Clipboard API: `copyToClipboard` focuses and selects a hidden
    // textarea on <body> — outside the box — then copies and restores focus.
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    const focusedAtCopy: (Element | null)[] = [];
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn(() => {
        focusedAtCopy.push(document.activeElement);
        return true;
      }),
      configurable: true,
    });
    try {
      const { container } = renderViewer();
      maximize('file-1.txt');
      const box = fileBox(container, 1);

      const copyButton = within(box).getByTitle('Copy file content to clipboard');
      // A real click focuses the button; the fallback hands focus back to it.
      copyButton.focus();
      fireEvent.click(copyButton);

      // Refocusing the box on that focusin would drop the selection.
      expect(focusedAtCopy.map((el) => el?.tagName)).toEqual(['TEXTAREA']);
      expect(await within(box).findByTitle('Copied!')).toBe(copyButton);
      // The guard decides from where focus ended up, not from the focusin
      // that took it outside: the restored button keeps it.
      await flushFocusGuard();
      expect(document.activeElement).toBe(copyButton);
    } finally {
      delete (document as { execCommand?: unknown }).execCommand;
    }
  });

  it('lets the box itself scroll for raw code and rendered Markdown only', () => {
    const { container } = renderViewer([
      file(0),
      markdownFile(1, '# Title'),
      file(2, 'page.html', 'html'),
      file(3, 'diagram.mmd', 'mermaid'),
    ]);
    const scrolls = (index: number) =>
      fileBox(container, index).classList.contains('viewer-file-maximized-scroll');
    const restore = (filename: string) =>
      fireEvent.click(screen.getByRole('button', { name: `Restore ${filename}` }));

    // Nothing maximized, nothing carries it.
    expect(container.querySelector('.viewer-file-maximized-scroll')).toBeNull();

    maximize('file-0.txt');
    expect(scrolls(0)).toBe(true);
    // The scroller holds focus, so keyboard scrolling works right away.
    expect(document.activeElement).toBe(fileBox(container, 0));
    restore('file-0.txt');
    expect(scrolls(0)).toBe(false);

    maximize('notes-1.md');
    expect(container.querySelector('#stash-file-1 .markdown-body')).toBeTruthy();
    expect(scrolls(1)).toBe(true);
    expect(document.activeElement).toBe(fileBox(container, 1));
    restore('notes-1.md');

    maximize('page.html');
    expect(scrolls(2)).toBe(false);
    restore('page.html');

    maximize('diagram.mmd');
    expect(scrolls(3)).toBe(false);
  });

  it('blocks the 1-4 tab hotkeys while maximized', () => {
    renderViewer();
    maximize('file-1.txt');
    fireEvent.keyDown(document.activeElement!, { key: '2' });
    expect(screen.getByRole('tab', { selected: true }).id).toBe('viewer-tab-content');
  });

  it("blocks App's quick-search accelerator while maximized", () => {
    renderViewer();
    const closed = { search: false, help: false };
    expect(canToggleQuickSearch(closed)).toBe(true);

    maximize('file-1.txt');
    // Opening search on top would stack two modals with fighting traps.
    expect(canToggleQuickSearch(closed)).toBe(false);
  });

  it('is cleared when the Content tab is left', () => {
    const { container } = renderViewer();
    maximize('file-1.txt');

    fireEvent.click(screen.getByRole('tab', { name: /Details & API/ }));
    expect(document.body.style.overflow).toBe('');
    fireEvent.click(screen.getByRole('tab', { name: /Content/ }));

    expect(fileBox(container, 1).getAttribute('role')).toBeNull();
    expect(container.querySelector('.viewer-file-backdrop')).toBeNull();
  });

  it('is cleared when the stash changes, even if file ids repeat', () => {
    const files = [file(0), file(1)];
    const { container, rerender } = render(viewer(stashWith(files)));
    maximize('file-1.txt');

    rerender(viewer(stashWith(files, 'other')));
    expect(fileBox(container, 1).getAttribute('role')).toBeNull();
    expect(container.querySelector('.viewer-file-backdrop')).toBeNull();
    expect(document.body.style.overflow).toBe('');

    // Coming back to the first stash does not resurrect it.
    rerender(viewer(stashWith(files)));
    expect(fileBox(container, 1).getAttribute('role')).toBeNull();
  });

  it('is cleared when the maximized file disappears from the stash', () => {
    const { container, rerender } = render(viewer(stashWith([file(0), file(1)])));
    maximize('file-1.txt');

    rerender(viewer(stashWith([file(0)])));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(container.querySelector('.viewer-file-backdrop')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });
});
