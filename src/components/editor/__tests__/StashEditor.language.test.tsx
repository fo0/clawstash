// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import StashEditor from '../StashEditor';
import { LANGUAGE_NAME_SUGGESTIONS, resolvePrismLanguage } from '../../../languages';

// The language field is free text. It now suggests the names that resolve to
// a grammar and, while blank, says what auto-detection will pick.

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('[]', { status: 200 }))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

function renderNew() {
  return render(<StashEditor stash={null} onSave={vi.fn()} onCancel={vi.fn()} />);
}

const languageField = () => screen.getByLabelText('File 1 language') as HTMLInputElement;
const filenameField = () => screen.getByLabelText('File 1 filename') as HTMLInputElement;

describe('StashEditor language field', () => {
  it('offers the known language names as suggestions', () => {
    const { container } = renderNew();
    const listId = languageField().getAttribute('list');
    expect(listId).toBeTruthy();
    const options = [...container.querySelectorAll(`datalist#${listId} option`)].map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(options).toEqual([...LANGUAGE_NAME_SUGGESTIONS]);
    expect(options).toContain('python');
    expect(options).toContain('yaml');
  });

  it('suggests only names that resolve to a grammar', () => {
    for (const name of LANGUAGE_NAME_SUGGESTIONS) {
      // `text` / `plain` are the deliberate "no highlighting" choice.
      if (name === 'text' || name === 'plain') continue;
      expect(resolvePrismLanguage(name)).not.toBe('text');
    }
  });

  it('names the auto-detected language in the placeholder while blank', () => {
    renderNew();
    expect(languageField().placeholder).toBe('language (auto)');
    fireEvent.change(filenameField(), { target: { value: 'deploy.py' } });
    expect(languageField().placeholder).toBe('auto: Python');
    fireEvent.change(filenameField(), { target: { value: 'notes' } });
    expect(languageField().placeholder).toBe('language (auto)');
  });
});
