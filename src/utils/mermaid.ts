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
    mermaidPromise = import('mermaid')
      .then((mod) => {
        const mermaid = mod.default;
        // Initialized exactly once with the dark theme. Mermaid applies the
        // theme at `initialize()` time, so a future light/auto theme toggle
        // cannot just flip a CSS variable — it would need a re-`initialize()`
        // plus a forced re-render (re-hydration) of every already-rendered
        // diagram. No theme toggle exists today, so this is a known
        // limitation, not a behavioral bug.
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'strict',
          fontFamily: 'inherit',
        });
        return mermaid;
      })
      .catch((err) => {
        // Reset the cache so a future render can retry the dynamic import.
        // Without this, a transient chunk-load failure poisons all subsequent
        // calls until full page reload.
        mermaidPromise = null;
        throw err;
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

// Every render is funneled through this single promise chain so that at most
// one `mermaid.render()` runs at a time across the whole app. Mermaid keeps
// mutable global state for the duration of a render (it mounts a temporary
// measuring container and swaps the active config/theme), so two renders that
// overlap can clobber each other and emit a blank or corrupted SVG. Inline
// markdown diagrams hydrate several placeholders back-to-back and the
// side-by-side table layout renders multiple at once — exactly the parallel
// pattern that triggers the corruption. Serializing keeps every caller correct
// (the inline hydrator and the standalone .mmd viewer alike). See #286.
let renderChain: Promise<unknown> = Promise.resolve();

/**
 * Render a Mermaid diagram source string to an SVG string.
 * Returns `{svg}` on success, `{error}` on parse/render failure (no throw).
 *
 * Calls are serialized globally: a render only starts once the previous one
 * has settled, so concurrent callers cannot corrupt Mermaid's shared state.
 */
export async function renderMermaid(code: string): Promise<MermaidRenderResult> {
  const trimmed = code.trim();
  if (!trimmed) return { error: 'Empty diagram source' };
  const run = renderChain.then(async (): Promise<MermaidRenderResult> => {
    try {
      const mermaid = await loadMermaid();
      const { svg } = await mermaid.render(uniqueId(), trimmed);
      return { svg };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
  // Keep the chain alive for the next caller regardless of this outcome. `run`
  // itself always resolves (failures are mapped to `{error}` above), so the
  // swallow here is purely defensive.
  renderChain = run.catch(() => undefined);
  return run;
}
