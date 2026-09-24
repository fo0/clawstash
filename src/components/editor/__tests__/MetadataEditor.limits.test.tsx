// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MetadataEditor from '../MetadataEditor';
import type { MetadataEntry } from '../MetadataEditor';

// The server caps a stash's metadata at MAX_METADATA_KEYS (50) keys
// (`src/server/validation.ts`). The editor used to let a 51st row in silently,
// so the limit only surfaced as a rejected save after the whole stash had been
// composed. These pin the client-side guard: what is refused, that the refusal
// says why, and that the typed key survives it.

afterEach(cleanup);

function manyEntries(count: number): MetadataEntry[] {
  return Array.from({ length: count }, (_, i) => ({ key: `key-${i}`, value: `v${i}` }));
}

/** Owns the entries like StashEditor does, so a removal really removes. */
function Harness({ initial }: { initial: MetadataEntry[] }) {
  const [entries, setEntries] = useState(initial);
  return <MetadataEditor entries={entries} onChange={setEntries} availableKeys={[]} />;
}

function addInput(): HTMLInputElement {
  return screen.getByRole('combobox', { name: 'Add metadata key' }) as HTMLInputElement;
}

function typeAndEnter(value: string) {
  const input = addInput();
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

describe('MetadataEditor key limit', () => {
  it('still adds a key below the limit', () => {
    const onChange = vi.fn();
    render(<MetadataEditor entries={manyEntries(49)} onChange={onChange} availableKeys={[]} />);

    typeAndEnter('purpose');

    expect(onChange).toHaveBeenCalledWith([...manyEntries(49), { key: 'purpose', value: '' }]);
    expect(screen.queryByText(/Metadata limit reached/)).toBeNull();
  });

  it('refuses a key past the 50-key limit, says why and keeps the typed key', () => {
    const onChange = vi.fn();
    render(<MetadataEditor entries={manyEntries(50)} onChange={onChange} availableKeys={[]} />);

    typeAndEnter('purpose');

    expect(onChange).not.toHaveBeenCalled();
    const warning = document.getElementById('metadata-add-warning');
    expect(warning?.textContent).toContain('Metadata limit reached (50 keys)');
    expect(warning?.textContent).toContain('"purpose"');
    expect(addInput().value).toBe('purpose');
    expect(addInput().getAttribute('aria-describedby')).toBe('metadata-add-warning');
  });

  it('refuses the blur commit at the limit too', () => {
    const onChange = vi.fn();
    render(<MetadataEditor entries={manyEntries(50)} onChange={onChange} availableKeys={[]} />);

    const input = addInput();
    fireEvent.change(input, { target: { value: 'purpose' } });
    fireEvent.blur(input);

    expect(onChange).not.toHaveBeenCalled();
    expect(document.getElementById('metadata-add-warning')?.textContent).toContain(
      'Metadata limit reached',
    );
  });

  it('names the limit in the placeholder and stands the suggestions down at the cap', () => {
    render(
      <MetadataEditor
        entries={manyEntries(50)}
        onChange={() => {}}
        availableKeys={['model', 'agent_id']}
      />,
    );

    const input = addInput();
    expect(input.getAttribute('placeholder')).toBe('Metadata limit reached (50 keys)');
    fireEvent.focus(input);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('offers the suggestions again below the cap', () => {
    render(
      <MetadataEditor
        entries={manyEntries(49)}
        onChange={() => {}}
        availableKeys={['model', 'agent_id']}
      />,
    );

    const input = addInput();
    expect(input.getAttribute('placeholder')).toBe('Add key...');
    fireEvent.focus(input);
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('clears the limit warning once an entry is removed', () => {
    const onChange = vi.fn();
    render(<MetadataEditor entries={manyEntries(50)} onChange={onChange} availableKeys={[]} />);

    typeAndEnter('purpose');
    expect(document.getElementById('metadata-add-warning')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Remove metadata entry "key-0"' }));

    expect(onChange).toHaveBeenCalledWith(manyEntries(50).slice(1));
    expect(document.getElementById('metadata-add-warning')).toBeNull();
  });

  it('keeps a duplicate-key refusal when an unrelated entry is removed', () => {
    render(<Harness initial={manyEntries(3)} />);

    typeAndEnter('key-0');
    expect(document.getElementById('metadata-add-warning')?.textContent).toBe(
      'Key "key-0" already exists.',
    );

    // key-0 is still there, so the refusal still holds.
    fireEvent.click(screen.getByRole('button', { name: 'Remove metadata entry "key-1"' }));
    expect(document.getElementById('metadata-add-warning')?.textContent).toBe(
      'Key "key-0" already exists.',
    );

    // Removing the duplicate itself resolves it.
    fireEvent.click(screen.getByRole('button', { name: 'Remove metadata entry "key-0"' }));
    expect(document.getElementById('metadata-add-warning')).toBeNull();
  });
});
