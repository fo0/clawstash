// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Controllable stand-in for the lazy Mermaid renderer.
const { mockRender } = vi.hoisted(() => ({ mockRender: vi.fn() }));
vi.mock('../mermaid', () => ({ renderMermaid: mockRender }));

import {
  decodeMermaidSource,
  encodeMermaidSource,
  hydrateMermaidPlaceholders,
} from '../mermaid-hydrate';

// Cross a macrotask boundary so the renderMermaid promise + its `.then` flush.
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

const placeholderHtml = (source: string) =>
  `<div class="mermaid-placeholder" data-mermaid-source="${encodeMermaidSource(source)}"></div>`;

let root: HTMLElement;

beforeEach(() => {
  mockRender.mockReset();
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('encode/decode round-trip', () => {
  it('survives multi-byte characters', () => {
    const s = 'xychart-beta "1M-Return %" — äöü 📈';
    expect(decodeMermaidSource(encodeMermaidSource(s))).toBe(s);
  });
});

describe('hydrateMermaidPlaceholders', () => {
  it('claims a placeholder synchronously and writes the SVG when render resolves', async () => {
    mockRender.mockResolvedValue({ svg: '<svg id="d">chart</svg>' });
    root.innerHTML = placeholderHtml('graph TD; A-->B');
    const el = root.querySelector<HTMLElement>('.mermaid-placeholder')!;

    hydrateMermaidPlaceholders(root);
    // Claimed immediately — before the async render resolves.
    expect(el.getAttribute('data-mermaid-rendered')).toBe('1');
    expect(mockRender).toHaveBeenCalledTimes(1);
    expect(el.querySelector('svg')).toBeNull();

    await flush();
    expect(el.querySelector('svg')).not.toBeNull();
    expect(el.classList.contains('mermaid-diagram')).toBe(true);
  });

  it('renders two side-by-side diagrams nested inside a <table> (#286 repro)', async () => {
    mockRender.mockImplementation((code: string) => Promise.resolve({ svg: `<svg>${code}</svg>` }));
    root.innerHTML =
      '<table><tbody><tr>' +
      `<td>${placeholderHtml('1M')}</td>` +
      `<td>${placeholderHtml('1Y')}</td>` +
      '</tr></tbody></table>';

    hydrateMermaidPlaceholders(root);
    await flush();

    expect(root.querySelectorAll('.mermaid-placeholder svg')).toHaveLength(2);
    expect(root.innerHTML).toContain('<svg>1M</svg>');
    expect(root.innerHTML).toContain('<svg>1Y</svg>');
  });

  it('does not re-process an already-claimed placeholder on a repeat call', async () => {
    mockRender.mockResolvedValue({ svg: '<svg>x</svg>' });
    root.innerHTML = placeholderHtml('g');

    hydrateMermaidPlaceholders(root);
    hydrateMermaidPlaceholders(root); // re-entrant: a second effect run
    await flush();

    expect(mockRender).toHaveBeenCalledTimes(1);
  });

  it('lands the write despite repeated calls before the slow render resolves — orphan-proof (#286)', async () => {
    let resolve!: (r: { svg?: string; error?: string }) => void;
    mockRender.mockImplementation(
      () =>
        new Promise((res) => {
          resolve = res;
        }),
    );
    root.innerHTML = placeholderHtml('xychart-beta');
    const el = root.querySelector<HTMLElement>('.mermaid-placeholder')!;

    hydrateMermaidPlaceholders(root);
    // Simulate page-boot churn: many re-runs while the cold render is pending.
    for (let i = 0; i < 5; i++) hydrateMermaidPlaceholders(root);
    expect(mockRender).toHaveBeenCalledTimes(1); // still exactly one render
    expect(el.querySelector('svg')).toBeNull();

    resolve({ svg: '<svg>late</svg>' });
    await flush();
    // The regression guard: the write lands even after all the churn.
    expect(el.querySelector('svg')).not.toBeNull();
    expect(el.innerHTML).toContain('late');
  });

  it('skips the write if the node was detached before the render resolved', async () => {
    let resolve!: (r: { svg?: string }) => void;
    mockRender.mockImplementation(
      () =>
        new Promise((res) => {
          resolve = res;
        }),
    );
    root.innerHTML = placeholderHtml('g');
    const el = root.querySelector<HTMLElement>('.mermaid-placeholder')!;

    hydrateMermaidPlaceholders(root);
    el.remove(); // a re-render replaced the node
    resolve({ svg: '<svg>x</svg>' });
    await flush();

    expect(el.innerHTML).toBe(''); // nothing written into the detached node
  });

  it('writes an error block when the render fails', async () => {
    mockRender.mockResolvedValue({ error: 'Parse error on line 2' });
    root.innerHTML = placeholderHtml('bad source');
    const el = root.querySelector<HTMLElement>('.mermaid-placeholder')!;

    hydrateMermaidPlaceholders(root);
    await flush();

    expect(el.querySelector('.mermaid-error')).not.toBeNull();
    expect(el.textContent).toContain('Parse error on line 2');
  });

  it('writes an encoding-error block for an undecodable source without calling render', () => {
    root.innerHTML =
      '<div class="mermaid-placeholder" data-mermaid-source="@@ not base64 @@"></div>';
    const el = root.querySelector<HTMLElement>('.mermaid-placeholder')!;

    hydrateMermaidPlaceholders(root);

    expect(el.querySelector('.mermaid-error')).not.toBeNull();
    expect(el.textContent).toContain('Invalid source encoding');
    expect(mockRender).not.toHaveBeenCalled();
  });
});
