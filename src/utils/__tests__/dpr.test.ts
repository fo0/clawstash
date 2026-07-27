import { describe, it, expect, vi } from 'vitest';
import { watchDevicePixelRatio, type DprWindow } from '../dpr';

/**
 * Minimal MediaQueryList double: records the query it was created for and
 * lets a test fire a `change` event at the listeners still attached.
 */
function createFakeWindow(initialDpr: number) {
  const created: { query: string; listeners: Set<() => void> }[] = [];
  const win: DprWindow = {
    devicePixelRatio: initialDpr,
    matchMedia(query: string) {
      const entry = { query, listeners: new Set<() => void>() };
      created.push(entry);
      return {
        matches: true,
        media: query,
        addEventListener: (_: string, cb: () => void) => entry.listeners.add(cb),
        removeEventListener: (_: string, cb: () => void) => entry.listeners.delete(cb),
      } as unknown as MediaQueryList;
    },
  };
  return {
    win,
    created,
    /** Fire `change` on the most recently armed query. */
    fire(newDpr: number) {
      const latest = created[created.length - 1];
      win.devicePixelRatio = newDpr;
      for (const cb of [...latest.listeners]) cb();
    },
    activeListeners: () => created.reduce((n, q) => n + q.listeners.size, 0),
  };
}

describe('watchDevicePixelRatio', () => {
  it('arms a resolution query for the current ratio', () => {
    const fake = createFakeWindow(2);
    watchDevicePixelRatio(vi.fn(), fake.win);
    expect(fake.created).toHaveLength(1);
    expect(fake.created[0].query).toBe('(resolution: 2dppx)');
  });

  it('calls back and re-arms against the new ratio on change', () => {
    const fake = createFakeWindow(1);
    const onChange = vi.fn();
    watchDevicePixelRatio(onChange, fake.win);

    fake.fire(2);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(fake.created[1].query).toBe('(resolution: 2dppx)');

    fake.fire(3);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(fake.created[2].query).toBe('(resolution: 3dppx)');
  });

  it('keeps exactly one live listener across re-arms', () => {
    const fake = createFakeWindow(1);
    watchDevicePixelRatio(vi.fn(), fake.win);
    fake.fire(2);
    fake.fire(3);
    expect(fake.activeListeners()).toBe(1);
  });

  it('detaches every listener on cleanup', () => {
    const fake = createFakeWindow(1);
    const onChange = vi.fn();
    const cleanup = watchDevicePixelRatio(onChange, fake.win);
    fake.fire(2);
    cleanup();
    expect(fake.activeListeners()).toBe(0);

    fake.fire(4);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when matchMedia is unavailable', () => {
    const cleanup = watchDevicePixelRatio(vi.fn(), {
      devicePixelRatio: 1,
    } as unknown as DprWindow);
    expect(() => cleanup()).not.toThrow();
  });
});
