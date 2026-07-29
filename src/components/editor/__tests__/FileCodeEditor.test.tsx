// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import FileCodeEditor from '../FileCodeEditor';
import type { FileInput } from '../../../types';

afterEach(cleanup);

// Must stay in sync with SYNTAX_HIGHLIGHT_MAX_CHARS in FileCodeEditor.
const MAX = 100_000;

/** Controlled host mirroring StashEditor: content lives in the parent. */
function Host({ initial }: { initial: string }) {
  const [content, setContent] = useState(initial);
  const file: FileInput = { filename: 'big.txt', content, language: '' };
  return (
    <>
      <FileCodeEditor file={file} index={0} updateFile={(_i, _field, value) => setContent(value)} />
      <button data-testid="grow" onClick={() => setContent('x'.repeat(MAX + 10))} />
      <button data-testid="shrink" onClick={() => setContent('x'.repeat(10))} />
    </>
  );
}

function isPlain(container: HTMLElement): boolean {
  return container.querySelector('.code-editor-plain') !== null;
}

describe('FileCodeEditor plain-mode latch (#136)', () => {
  it('uses the highlighting editor below the threshold', () => {
    const { container } = render(<Host initial="small" />);
    expect(isPlain(container)).toBe(false);
  });

  it('starts in plain mode when the file is already large', () => {
    const { container } = render(<Host initial={'x'.repeat(MAX + 1)} />);
    expect(isPlain(container)).toBe(true);
  });

  it('stays in plain mode after the content shrinks back below the threshold', () => {
    const { container } = render(<Host initial="small" />);
    const grow = container.querySelector('[data-testid="grow"]') as HTMLButtonElement;
    const shrink = container.querySelector('[data-testid="shrink"]') as HTMLButtonElement;

    act(() => grow.click());
    expect(isPlain(container)).toBe(true);

    // Without the latch this swapped back to <Editor>, remounting the text
    // field and dropping caret / scroll / undo history mid-typing.
    act(() => shrink.click());
    expect(isPlain(container)).toBe(true);
  });
});
