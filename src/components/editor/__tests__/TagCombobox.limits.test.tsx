// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import TagCombobox from '../TagCombobox';
import type { TagComboboxHandle } from '../TagCombobox';

// The server caps tags at MAX_TAGS (50) per stash and MAX_TAG_LENGTH (100)
// characters per tag (`src/server/validation.ts`). The combobox used to let
// both be exceeded silently, so the limit only surfaced as a rejected save
// after the whole stash had been composed. These pin the client-side guard:
// what still gets through, what is refused, and that the refusal says why.

afterEach(cleanup);

/** `count` distinct tags — enough to sit at or just under the cap. */
function manyTags(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `tag-${i}`);
}

function commit(ref: React.RefObject<TagComboboxHandle | null>, value: string): string[] {
  fireEvent.change(screen.getByRole('combobox'), { target: { value } });
  let committed: string[] = [];
  act(() => {
    committed = ref.current!.commitPending();
  });
  return committed;
}

describe('TagCombobox limits', () => {
  it('refuses a tag past the 50-tag cap and says why', () => {
    const ref = createRef<TagComboboxHandle>();
    const onChange = vi.fn();

    render(<TagCombobox ref={ref} tags={manyTags(50)} onChange={onChange} availableTags={[]} />);

    expect(commit(ref, 'one-too-many')).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('Tag limit reached (50)');
  });

  it('commits the part of a paste that fits and reports the rest', () => {
    const ref = createRef<TagComboboxHandle>();
    const onChange = vi.fn();

    // 49 existing tags leaves room for exactly one of the three pasted.
    render(<TagCombobox ref={ref} tags={manyTags(49)} onChange={onChange} availableTags={[]} />);

    expect(commit(ref, 'alpha, beta, gamma')).toEqual(['alpha']);
    expect(onChange).toHaveBeenCalledWith([...manyTags(49), 'alpha']);
    expect(screen.getByRole('status').textContent).toContain('2 tags not added');
  });

  it('skips a pasted tag longer than 100 characters but keeps the valid ones', () => {
    const ref = createRef<TagComboboxHandle>();
    const onChange = vi.fn();

    render(<TagCombobox ref={ref} tags={[]} onChange={onChange} availableTags={[]} />);

    // `maxLength` bounds typed text only — a paste arrives as one field value,
    // so the over-long part has to be caught on commit.
    const tooLong = 'x'.repeat(101);
    expect(commit(ref, `ops, ${tooLong}, release`)).toEqual(['ops', 'release']);
    expect(onChange).toHaveBeenCalledWith(['ops', 'release']);
    expect(screen.getByRole('status').textContent).toContain('longer than 100 characters');
  });

  it('caps typed input at 100 characters and offers no suggestions at the tag limit', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <TagCombobox tags={[]} onChange={onChange} availableTags={[{ tag: 'ops', count: 3 }]} />,
    );

    const input = screen.getByRole('combobox');
    expect(input).toHaveProperty('maxLength', 100);

    // Below the cap the suggestion listbox opens as before.
    fireEvent.focus(input);
    expect(screen.queryByRole('listbox')).not.toBeNull();

    rerender(
      <TagCombobox
        tags={manyTags(50)}
        onChange={onChange}
        availableTags={[{ tag: 'ops', count: 3 }]}
      />,
    );
    fireEvent.focus(screen.getByRole('combobox'));
    // At the cap every option would be an add commitTag is about to refuse.
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('combobox')).toHaveProperty('placeholder', 'Tag limit reached (50)');
  });
});
