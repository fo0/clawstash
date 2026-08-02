// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import MarkdownBody from '../MarkdownBody';
import { wrapCodeBlockWithCopy } from '../../utils/code-copy';

afterEach(cleanup);

const PLACEHOLDER_HTML =
  '<p>intro</p><div class="mermaid-placeholder" data-mermaid-source="eA=="></div>';

describe('MarkdownBody (memo) — #286 regression', () => {
  it('does NOT re-apply innerHTML on parent re-renders with unchanged html, so hydrated content survives', () => {
    let bump!: () => void;
    function Parent({ html }: { html: string }) {
      const [, setN] = useState(0);
      bump = () => setN((n) => n + 1);
      return <MarkdownBody html={html} />;
    }

    const { container } = render(<Parent html={PLACEHOLDER_HTML} />);
    const placeholder = container.querySelector('.mermaid-placeholder')!;
    expect(placeholder).not.toBeNull();

    // Simulate the imperative hydration writing an SVG into the placeholder.
    placeholder.setAttribute('data-mermaid-rendered', '1');
    placeholder.innerHTML = '<svg><text>chart</text></svg>';

    // The F5 failure mode: the parent re-renders many times during page boot.
    for (let i = 0; i < 6; i++) act(() => bump());

    const after = container.querySelector('.mermaid-placeholder')!;
    // Same DOM node — React did not tear down + recreate the subtree...
    expect(after).toBe(placeholder);
    // ...so the hydrated SVG is still there.
    expect(after.querySelector('svg')).not.toBeNull();
  });

  it('DOES re-render when the html actually changes', () => {
    const { container, rerender } = render(<MarkdownBody html={PLACEHOLDER_HTML} />);
    const first = container.querySelector('.mermaid-placeholder')!;
    first.innerHTML = '<svg>old</svg>';

    rerender(
      <MarkdownBody html='<div class="mermaid-placeholder" data-mermaid-source="eQ=="></div>' />,
    );
    const second = container.querySelector('.mermaid-placeholder')!;
    expect(second.getAttribute('data-mermaid-source')).toBe('eQ==');
    // Fresh node from the new blob — not the hydrated one.
    expect(second.querySelector('svg')).toBeNull();
  });
});

const CODE_HTML = wrapCodeBlockWithCopy('<pre><code>npm test\n</code></pre>', 'npm test');

/** Stub the Clipboard API — jsdom ships neither it nor `execCommand`. */
function mockClipboard(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

describe('MarkdownBody — code block copy button', () => {
  it('copies the code block a clicked button belongs to', async () => {
    const writeText = mockClipboard();
    const { container } = render(<MarkdownBody html={CODE_HTML} />);
    const button = container.querySelector<HTMLElement>('.code-copy-btn')!;

    await act(async () => {
      fireEvent.click(button);
    });

    expect(writeText).toHaveBeenCalledWith('npm test');
    expect(button.getAttribute('data-copy-state')).toBe('copied');
    expect(container.querySelector('[aria-live]')?.textContent).toBe('Code copied to clipboard');
  });

  it('reports a failed copy instead of claiming success', async () => {
    const writeText = mockClipboard();
    writeText.mockRejectedValueOnce(new Error('denied'));
    const { container } = render(<MarkdownBody html={CODE_HTML} />);
    const button = container.querySelector<HTMLElement>('.code-copy-btn')!;

    await act(async () => {
      fireEvent.click(button);
    });

    expect(button.getAttribute('data-copy-state')).toBe('failed');
    expect(container.querySelector('[aria-live]')?.textContent).toBe('Copy failed');
  });

  it('keeps the HTML blob intact across the copy — the #286 memo still holds', async () => {
    mockClipboard();
    const { container } = render(
      <MarkdownBody html={`<div class="mermaid-placeholder"></div>${CODE_HTML}`} />,
    );
    const placeholder = container.querySelector('.mermaid-placeholder')!;
    placeholder.innerHTML = '<svg><text>chart</text></svg>';

    await act(async () => {
      fireEvent.click(container.querySelector<HTMLElement>('.code-copy-btn')!);
    });

    // The copy sets state in the wrapper; the memoised blob must not re-apply.
    expect(container.querySelector('.mermaid-placeholder')).toBe(placeholder);
    expect(placeholder.querySelector('svg')).not.toBeNull();
  });
});
