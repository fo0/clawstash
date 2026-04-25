/**
 * Shared Mermaid renderer used by both the standalone .mmd file viewer
 * and the inline ```mermaid``` markdown blocks.
 *
 * The `mermaid` library is loaded lazily via dynamic import so it stays
 * out of the initial JS bundle (Next.js auto-code-splits dynamic imports).
 * The lib is initialized exactly once on first use.
 */
import type { default as MermaidApi } from 'mermaid';

let mermaidPromise: Promise<typeof MermaidApi> | null = null;

async function loadMermaid(): Promise<typeof MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'strict',
        fontFamily: 'inherit',
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

export interface MermaidRenderResult {
  svg?: string;
  error?: string;
}

let counter = 0;

function uniqueId(): string {
  counter += 1;
  return `mermaid-${Date.now().toString(36)}-${counter.toString(36)}`;
}

/**
 * Render a Mermaid diagram source string to an SVG string.
 * Returns `{svg}` on success, `{error}` on parse/render failure (no throw).
 */
export async function renderMermaid(code: string): Promise<MermaidRenderResult> {
  const trimmed = code.trim();
  if (!trimmed) return { error: 'Empty diagram source' };
  try {
    const mermaid = await loadMermaid();
    const { svg } = await mermaid.render(uniqueId(), trimmed);
    return { svg };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
