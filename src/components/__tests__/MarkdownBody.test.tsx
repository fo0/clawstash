// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import MarkdownBody from '../MarkdownBody';

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
