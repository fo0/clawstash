// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  CODE_COPY_STATE_ATTR,
  CODE_COPY_TITLE,
  findCodeCopyTarget,
  setCodeCopyState,
  wrapCodeBlockWithCopy,
} from '../code-copy';

/** Render an HTML string into a detached-but-connected container. */
function mount(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

describe('wrapCodeBlockWithCopy', () => {
  it('wraps a code block in the copy scaffold', () => {
    const html = wrapCodeBlockWithCopy('<pre><code>const a = 1;\n</code></pre>', 'const a = 1;');
    const root = mount(html);
    const button = root.querySelector('.code-copy-btn');
    expect(button).not.toBeNull();
    expect(button!.getAttribute('type')).toBe('button');
    // Icon-only button — the accessible name must come from aria-label.
    expect(button!.getAttribute('aria-label')).toBe(CODE_COPY_TITLE);
    expect(root.querySelector('.code-block > pre > code')?.textContent).toBe('const a = 1;\n');
  });

  it('leaves empty fences untouched so no dead button appears', () => {
    expect(wrapCodeBlockWithCopy('<pre><code>\n</code></pre>', '   \n')).toBe(
      '<pre><code>\n</code></pre>',
    );
  });
});

describe('findCodeCopyTarget', () => {
  const root = () => mount(wrapCodeBlockWithCopy('<pre><code>npm test\n</code></pre>', 'npm test'));

  it('resolves the code text, without the renderer trailing newline', () => {
    const container = root();
    const button = container.querySelector<HTMLElement>('.code-copy-btn')!;
    expect(findCodeCopyTarget(button, container)).toEqual({ button, code: 'npm test' });
  });

  it('resolves clicks that land on the icon inside the button', () => {
    const container = root();
    const icon = container.querySelector<HTMLElement>('.code-copy-icon')!;
    expect(findCodeCopyTarget(icon, container)?.code).toBe('npm test');
  });

  it('ignores clicks outside a copy button', () => {
    const container = root();
    const code = container.querySelector<HTMLElement>('code')!;
    expect(findCodeCopyTarget(code, container)).toBeNull();
    expect(findCodeCopyTarget(null, container)).toBeNull();
  });

  it('ignores a button outside the handler root', () => {
    const container = root();
    const other = mount('<div></div>');
    expect(findCodeCopyTarget(container.querySelector('.code-copy-btn'), other)).toBeNull();
  });

  it('ignores a stray copy button that has no code block (raw HTML in Markdown)', () => {
    const container = mount('<button class="code-copy-btn"></button>');
    expect(findCodeCopyTarget(container.querySelector('button'), container)).toBeNull();
  });

  it('keeps interior newlines of multi-line blocks', () => {
    const container = mount(wrapCodeBlockWithCopy('<pre><code>a\nb\n</code></pre>', 'a\nb'));
    expect(findCodeCopyTarget(container.querySelector('.code-copy-btn'), container)?.code).toBe(
      'a\nb',
    );
  });
});

describe('setCodeCopyState', () => {
  it('reflects and clears the transient copy feedback', () => {
    const button = mount('<button class="code-copy-btn"></button>').querySelector('button')!;

    setCodeCopyState(button, 'copied');
    expect(button.getAttribute(CODE_COPY_STATE_ATTR)).toBe('copied');
    expect(button.getAttribute('title')).toBe('Copied!');

    setCodeCopyState(button, 'failed');
    expect(button.getAttribute(CODE_COPY_STATE_ATTR)).toBe('failed');
    expect(button.getAttribute('title')).toBe('Copy failed');

    setCodeCopyState(button, null);
    expect(button.hasAttribute(CODE_COPY_STATE_ATTR)).toBe(false);
    expect(button.getAttribute('title')).toBe(CODE_COPY_TITLE);
  });
});
