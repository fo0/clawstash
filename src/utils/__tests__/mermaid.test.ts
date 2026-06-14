import { beforeEach, describe, expect, it, vi } from 'vitest';

// Controllable stand-in for the lazily-imported `mermaid` library. `vi.hoisted`
// guarantees the spies exist before the hoisted `vi.mock` factory references
// them. The dynamic `import('mermaid')` inside the module under test resolves
// to this mock.
const { renderImpl, initializeImpl } = vi.hoisted(() => ({
  renderImpl: vi.fn(),
  initializeImpl: vi.fn(),
}));

vi.mock('mermaid', () => ({
  default: {
    initialize: initializeImpl,
    render: (...args: unknown[]) => renderImpl(...args),
  },
}));

// Resolve all pending microtasks (and let timers fire) by crossing a macrotask
// boundary — enough for the lazy import + render chain to advance fully.
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('renderMermaid', () => {
  beforeEach(() => {
    // Fresh module instance per test so the module-level singletons
    // (`mermaidPromise`, `renderChain`) don't leak across cases.
    vi.resetModules();
    renderImpl.mockReset();
    initializeImpl.mockReset();
  });

  it('returns an error for blank source without touching the library', async () => {
    const { renderMermaid } = await import('../mermaid');
    expect(await renderMermaid('   ')).toEqual({ error: 'Empty diagram source' });
    expect(renderImpl).not.toHaveBeenCalled();
  });

  it('returns the rendered svg on success', async () => {
    renderImpl.mockResolvedValue({ svg: '<svg>ok</svg>' });
    const { renderMermaid } = await import('../mermaid');
    expect(await renderMermaid('graph TD; A-->B')).toEqual({ svg: '<svg>ok</svg>' });
  });

  it('maps a thrown render error to {error} without throwing', async () => {
    renderImpl.mockRejectedValue(new Error('boom'));
    const { renderMermaid } = await import('../mermaid');
    expect(await renderMermaid('bad source')).toEqual({ error: 'boom' });
  });

  it('serializes concurrent renders so they never overlap', async () => {
    let active = 0;
    let maxActive = 0;
    const resolvers: Array<() => void> = [];
    renderImpl.mockImplementation((_id: string, code: string) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      return new Promise((resolve) => {
        resolvers.push(() => {
          active -= 1;
          resolve({ svg: `<svg>${code}</svg>` });
        });
      });
    });

    const { renderMermaid } = await import('../mermaid');
    const p1 = renderMermaid('a');
    const p2 = renderMermaid('b');
    const p3 = renderMermaid('c');

    // Only the first render may be in flight after the queue drains.
    await flush();
    expect(renderImpl).toHaveBeenCalledTimes(1);
    expect(active).toBe(1);

    // Each completion lets exactly one more render begin.
    resolvers.shift()!();
    await flush();
    expect(renderImpl).toHaveBeenCalledTimes(2);
    expect(active).toBe(1);

    resolvers.shift()!();
    await flush();
    expect(renderImpl).toHaveBeenCalledTimes(3);

    resolvers.shift()!();
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    // Results stay matched to their own source despite shared global state.
    expect(r1).toEqual({ svg: '<svg>a</svg>' });
    expect(r2).toEqual({ svg: '<svg>b</svg>' });
    expect(r3).toEqual({ svg: '<svg>c</svg>' });
    expect(maxActive).toBe(1);
  });

  it('keeps the chain alive after a failed render', async () => {
    renderImpl
      .mockRejectedValueOnce(new Error('first failed'))
      .mockResolvedValueOnce({ svg: '<svg>second</svg>' });

    const { renderMermaid } = await import('../mermaid');
    const first = renderMermaid('one');
    const second = renderMermaid('two');

    expect(await first).toEqual({ error: 'first failed' });
    expect(await second).toEqual({ svg: '<svg>second</svg>' });
  });
});
