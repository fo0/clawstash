// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { useRef, useState } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { getFocusableElements, useFocusTrap } from '../useFocusTrap';

afterEach(cleanup);

/**
 * Minimal modal: a trigger button outside the dialog (standing in for the page
 * behind the backdrop) plus a dialog with two focusable controls.
 */
function Modal({ restoreFocus = true }: { restoreFocus?: boolean }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open, restoreFocus);
  return (
    <div>
      <button data-testid="trigger" onClick={() => setOpen(true)}>
        Open
      </button>
      <button data-testid="outside">Behind the backdrop</button>
      {open && (
        <div ref={dialogRef} role="dialog" aria-modal="true">
          <input data-testid="first" />
          <button data-testid="last" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}

function tab(shiftKey = false) {
  return fireEvent.keyDown(document.activeElement ?? document, { key: 'Tab', shiftKey });
}

describe('getFocusableElements', () => {
  it('returns focusable descendants in DOM order', () => {
    const root = document.createElement('div');
    root.innerHTML = `<a href="#a">a</a><button>b</button><input /><textarea></textarea>`;
    expect(getFocusableElements(root).map((el) => el.tagName)).toEqual([
      'A',
      'BUTTON',
      'INPUT',
      'TEXTAREA',
    ]);
  });

  it('skips disabled, tabindex="-1" and hidden-subtree controls', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <button disabled>disabled</button>
      <div tabindex="-1">programmatic target</div>
      <div hidden><button>in a hidden panel</button></div>
      <div aria-hidden="true"><button>aria-hidden</button></div>
      <button>reachable</button>`;
    expect(getFocusableElements(root).map((el) => el.textContent)).toEqual(['reachable']);
  });

  it('has no focusable elements for an empty container', () => {
    expect(getFocusableElements(document.createElement('div'))).toEqual([]);
  });
});

describe('useFocusTrap', () => {
  it('wraps Tab from the last control back to the first', () => {
    const { getByTestId } = render(<Modal />);
    act(() => getByTestId('trigger').click());

    const last = getByTestId('last');
    act(() => last.focus());
    expect(tab()).toBe(false); // preventDefault() -> fireEvent returns false
    expect(document.activeElement).toBe(getByTestId('first'));
  });

  it('wraps Shift+Tab from the first control back to the last', () => {
    const { getByTestId } = render(<Modal />);
    act(() => getByTestId('trigger').click());

    act(() => getByTestId('first').focus());
    expect(tab(true)).toBe(false);
    expect(document.activeElement).toBe(getByTestId('last'));
  });

  it('lets Tab move freely between controls inside the dialog', () => {
    const { getByTestId } = render(<Modal />);
    act(() => getByTestId('trigger').click());

    // Not at either edge -> the browser's own Tab handling stays in charge.
    act(() => getByTestId('first').focus());
    expect(tab()).toBe(true);
  });

  it('pulls focus back in when it sits outside the dialog', () => {
    const { getByTestId } = render(<Modal />);
    act(() => getByTestId('trigger').click());

    act(() => getByTestId('outside').focus());
    expect(tab()).toBe(false);
    expect(document.activeElement).toBe(getByTestId('first'));
  });

  it('does nothing while the modal is closed', () => {
    const { getByTestId } = render(<Modal />);
    act(() => getByTestId('outside').focus());
    expect(tab()).toBe(true);
    expect(document.activeElement).toBe(getByTestId('outside'));
  });

  it('restores focus to the trigger on close', () => {
    const { getByTestId } = render(<Modal />);
    const trigger = getByTestId('trigger');
    act(() => trigger.focus());
    act(() => trigger.click());

    act(() => getByTestId('first').focus());
    act(() => getByTestId('last').click()); // closes the dialog
    expect(document.activeElement).toBe(trigger);
  });

  it('leaves focus alone when restoreFocus is false', () => {
    const { getByTestId } = render(<Modal restoreFocus={false} />);
    const trigger = getByTestId('trigger');
    act(() => trigger.focus());
    act(() => trigger.click());

    act(() => getByTestId('first').focus());
    act(() => getByTestId('last').click()); // closes the dialog
    // The focused input was unmounted with the dialog, so focus falls back to
    // <body> — proof the hook did not restore it to the trigger.
    expect(document.activeElement).toBe(document.body);
  });
});
