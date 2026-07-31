// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useBodyScrollLock } from '../useBodyScrollLock';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

function Locker({ active }: { active: boolean }) {
  useBodyScrollLock(active);
  return null;
}

describe('useBodyScrollLock', () => {
  it('locks while active and restores the previous value on release', () => {
    document.body.style.overflow = 'auto';
    const view = render(<Locker active={true} />);
    expect(document.body.style.overflow).toBe('hidden');

    view.rerender(<Locker active={false} />);
    expect(document.body.style.overflow).toBe('auto');
  });

  it('does nothing while inactive', () => {
    document.body.style.overflow = 'auto';
    render(<Locker active={false} />);
    expect(document.body.style.overflow).toBe('auto');
  });

  it('restores on unmount', () => {
    document.body.style.overflow = 'auto';
    const view = render(<Locker active={true} />);
    expect(document.body.style.overflow).toBe('hidden');
    view.unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('keeps the lock until the last of two stacked modals releases it', () => {
    document.body.style.overflow = 'auto';
    const outer = render(<Locker active={true} />);
    const inner = render(<Locker active={true} />);
    expect(document.body.style.overflow).toBe('hidden');

    // Inner dialog closes first — the outer one is still open.
    inner.unmount();
    expect(document.body.style.overflow).toBe('hidden');

    outer.unmount();
    expect(document.body.style.overflow).toBe('auto');
  });
});
