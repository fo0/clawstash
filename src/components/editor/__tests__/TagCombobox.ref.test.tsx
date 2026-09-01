// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import TagCombobox from '../TagCombobox';
import type { TagComboboxHandle } from '../TagCombobox';

// TagCombobox takes `ref` as a plain prop (React 19) instead of going through
// `forwardRef`. The imperative handle is what StashEditor's Ctrl+S flush calls
// to commit a half-typed tag, and nothing else covers that path — so pin it
// here: the ref must be populated, and `commitPending()` must both return the
// committed tag and push it through `onChange`.

afterEach(cleanup);

describe('TagCombobox imperative handle', () => {
  it('exposes commitPending through a plain `ref` prop', () => {
    const ref = createRef<TagComboboxHandle>();
    const onChange = vi.fn();

    render(<TagCombobox ref={ref} tags={['ops']} onChange={onChange} availableTags={[]} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Release' } });

    expect(ref.current).not.toBeNull();
    let committed: string[] = [];
    act(() => {
      committed = ref.current!.commitPending();
    });

    expect(committed).toEqual(['release']);
    expect(onChange).toHaveBeenCalledWith(['ops', 'release']);
  });

  it('commits nothing when the input is empty', () => {
    const ref = createRef<TagComboboxHandle>();
    const onChange = vi.fn();

    render(<TagCombobox ref={ref} tags={['ops']} onChange={onChange} availableTags={[]} />);

    let committed: string[] = [];
    act(() => {
      committed = ref.current!.commitPending();
    });

    expect(committed).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });
});
