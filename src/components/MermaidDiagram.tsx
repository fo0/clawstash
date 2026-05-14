import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchContentRef,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch';
import { renderMermaid } from '../utils/mermaid';

interface Props {
  code: string;
  className?: string;
  /**
   * When provided, the current zoom level is persisted to
   * `localStorage["clawstash_mermaid_zoom_${storageKey}"]` and restored on
   * subsequent renders. Omit for transient/preview cases.
   */
  storageKey?: string;
}

interface RenderState {
  loading: boolean;
  svg?: string;
  error?: string;
}

const STORAGE_PREFIX = 'clawstash_mermaid_zoom_';
const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const ANIMATION_MS = 200;
const PERSIST_DEBOUNCE_MS = 300;

function loadStoredScale(key: string | undefined): number | null {
  if (!key || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const n = parseFloat(raw);
    return Number.isFinite(n) && n >= MIN_SCALE && n <= MAX_SCALE ? n : null;
  } catch {
    return null;
  }
}

function saveScale(key: string, scale: number): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, String(scale));
  } catch {
    /* ignore quota / disabled storage */
  }
}

function clearStoredScale(key: string): void {
  try {
    window.localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    /* ignore */
  }
}

/**
 * Renders a Mermaid diagram from a source string with a zoom/pan toolbar,
 * fullscreen toggle and persistent zoom level (per `storageKey`).
 *
 * Lazy-loads the `mermaid` library on first use, displays an inline error
 * block on syntax/render failure (no app crash), and re-renders when the
 * `code` prop changes.
 *
 * Controls:
 * - Toolbar: − / zoom% / + / Fit / 1:1 / Reset / Fullscreen
 * - Mouse wheel zoom (Ctrl/Cmd modifier)
 * - Pinch zoom on touch
 * - Drag to pan
 * - Keyboard (when viewer has focus or is fullscreen):
 *   `+` / `=` zoom in, `-` zoom out, `0` fit, `f` toggle fullscreen, `Esc` exit fullscreen
 */
export default function MermaidDiagram({ code, className, storageKey }: Props) {
  const [state, setState] = useState<RenderState>({ loading: true });
  const [scale, setScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const wrapperRef = useRef<ReactZoomPanPinchContentRef | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingScaleRef = useRef<number | null>(null);
  const initializedRef = useRef(false);

  // Render mermaid SVG (lazy-loaded). Re-runs on `code` change.
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true });
    initializedRef.current = false;
    renderMermaid(code).then((result) => {
      if (cancelled) return;
      setState({ loading: false, svg: result.svg, error: result.error });
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  // Compute the scale that fits the diagram fully within the transform
  // wrapper on BOTH axes. Reads layout (un-transformed) dimensions from the
  // react-zoom-pan-pinch instance so the result is independent of the
  // current zoom level.
  const computeFitScale = useCallback((): number => {
    const instance = wrapperRef.current?.instance;
    const wrapper = instance?.wrapperComponent;
    const content = instance?.contentComponent;
    if (!wrapper || !content) return 1;

    const wrapperWidth = wrapper.offsetWidth;
    const wrapperHeight = wrapper.offsetHeight;
    // offsetWidth/offsetHeight reflect the layout box, never the transform —
    // so this is the natural footprint of the diagram regardless of zoom.
    const contentWidth = content.offsetWidth;
    const contentHeight = content.offsetHeight;
    if (!wrapperWidth || !wrapperHeight || !contentWidth || !contentHeight) {
      return 1;
    }

    const PADDING_PER_SIDE = 16; // breathing room around the diagram
    const scaleX = (wrapperWidth - PADDING_PER_SIDE * 2) / contentWidth;
    const scaleY = (wrapperHeight - PADDING_PER_SIDE * 2) / contentHeight;
    const fit = Math.min(scaleX, scaleY);
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, fit));
  }, []);

  const fitToView = useCallback(() => {
    const s = computeFitScale();
    // centerView positions the content so its center maps to the wrapper's
    // center at the given scale (uses the library's wrapper/content
    // offset dimensions internally). setTransform(0, 0, s) — used previously
    // — anchors the content's top-left to the wrapper origin, which made
    // the diagram appear in a corner instead of centered.
    wrapperRef.current?.centerView(s, ANIMATION_MS);
  }, [computeFitScale]);

  const actualSize = useCallback(() => {
    // Center 1:1 view in the wrapper instead of pinning it to the top-left.
    wrapperRef.current?.centerView(1, ANIMATION_MS);
  }, []);

  // Reset view: clear any persisted custom zoom for this file AND fit to
  // view. Distinguishes from `Fit` (which only re-fits without forgetting
  // the stored value) so the user can return to defaults.
  const resetView = useCallback(() => {
    if (storageKey) {
      clearStoredScale(storageKey);
      pendingScaleRef.current = null;
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    }
    fitToView();
  }, [storageKey, fitToView]);

  // When the storageKey changes mid-life (e.g. file switched while reusing
  // the same component instance), the existing `initializedRef` guard would
  // otherwise prevent the init effect below from picking up the new file's
  // stored zoom. Reset the guard so the init effect re-runs against the new
  // key. The render-effect already does this on `code` change; this covers
  // the storageKey-only case.
  useEffect(() => {
    initializedRef.current = false;
  }, [storageKey]);

  // After SVG injection: restore stored zoom or auto-fit, always centered.
  useEffect(() => {
    if (state.loading || state.error || !state.svg) return;
    if (initializedRef.current) return;
    const stored = loadStoredScale(storageKey);
    // Wait one frame so the SVG has been laid out and the instance has
    // its wrapper/content components attached.
    const id = requestAnimationFrame(() => {
      const target = stored ?? computeFitScale();
      wrapperRef.current?.centerView(target, 0);
      setScale(target);
      initializedRef.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [state, storageKey, computeFitScale]);

  // Cleanup persist timer on unmount AND flush any pending save so a quick
  // unmount within the debounce window does not lose the user's last zoom.
  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      if (storageKey && pendingScaleRef.current != null) {
        saveScale(storageKey, pendingScaleRef.current);
        pendingScaleRef.current = null;
      }
    };
  }, [storageKey]);

  // Global Escape handler + body scroll lock + auto-focus when fullscreen.
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsFullscreen(false);
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Defer focus to next frame so the dialog is in the DOM with its new role.
    const focusId = requestAnimationFrame(() => containerRef.current?.focus());
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = prevOverflow;
      cancelAnimationFrame(focusId);
    };
  }, [isFullscreen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case '+':
        case '=':
          e.preventDefault();
          wrapperRef.current?.zoomIn();
          break;
        case '-':
          e.preventDefault();
          wrapperRef.current?.zoomOut();
          break;
        case '0':
          e.preventDefault();
          fitToView();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          setIsFullscreen((v) => !v);
          break;
        default:
          break;
      }
    },
    [fitToView],
  );

  const handleTransformed = useCallback(
    (_ref: ReactZoomPanPinchRef, s: { scale: number; positionX: number; positionY: number }) => {
      setScale(s.scale);
      if (storageKey) {
        pendingScaleRef.current = s.scale;
        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        persistTimerRef.current = setTimeout(() => {
          if (pendingScaleRef.current != null) {
            saveScale(storageKey, pendingScaleRef.current);
            pendingScaleRef.current = null;
          }
          persistTimerRef.current = null;
        }, PERSIST_DEBOUNCE_MS);
      }
    },
    [storageKey],
  );

  if (state.loading) {
    return <div className={`mermaid-loading ${className || ''}`}>Rendering diagram…</div>;
  }
  if (state.error) {
    return (
      <div className={`mermaid-error ${className || ''}`} role="alert">
        <div className="mermaid-error-title">
          <strong>Mermaid syntax error</strong>
        </div>
        <div className="mermaid-error-message">{state.error}</div>
        <pre className="mermaid-error-source">{code}</pre>
      </div>
    );
  }

  const zoomPct = Math.round(scale * 100);

  const viewer = (
    <div
      ref={containerRef}
      className={`mermaid-viewer${isFullscreen ? ' mermaid-viewer-fullscreen' : ''} ${className || ''}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="region"
      aria-label="Mermaid diagram viewer"
    >
      <div className="mermaid-toolbar" role="toolbar" aria-label="Diagram zoom controls">
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => wrapperRef.current?.zoomOut()}
          title="Zoom out (-)"
          aria-label="Zoom out"
        >
          −
        </button>
        <span className="mermaid-zoom-display" aria-live="polite" aria-label={`Zoom ${zoomPct} percent`}>
          {zoomPct}%
        </span>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => wrapperRef.current?.zoomIn()}
          title="Zoom in (+)"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={fitToView}
          title="Fit to view (0)"
          aria-label="Fit to view"
        >
          Fit
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={actualSize}
          title="Actual size (1:1)"
          aria-label="Actual size"
        >
          1:1
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={resetView}
          title="Reset view (clears saved zoom)"
          aria-label="Reset view"
        >
          ⟳
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => setIsFullscreen((v) => !v)}
          title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen (f)'}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? '⤢' : '⛶'}
        </button>
      </div>
      <TransformWrapper
        ref={wrapperRef}
        initialScale={1}
        minScale={MIN_SCALE}
        maxScale={MAX_SCALE}
        limitToBounds={false}
        centerOnInit={false}
        wheel={{ activationKeys: ['Control', 'Meta'], step: 0.1 }}
        pinch={{ step: 5 }}
        panning={{ velocityDisabled: true }}
        doubleClick={{ disabled: true }}
        onTransform={handleTransformed}
      >
        <TransformComponent
          wrapperClass="mermaid-transform-wrapper"
          contentClass="mermaid-transform-content"
        >
          <div
            ref={contentRef}
            className="mermaid-diagram"
            dangerouslySetInnerHTML={{ __html: state.svg || '' }}
          />
        </TransformComponent>
      </TransformWrapper>
    </div>
  );

  // IMPORTANT: keep the JSX tree shape stable across the fullscreen toggle so
  // React preserves the `TransformWrapper` instance (and therefore the current
  // zoom/pan state). The outer div is `display: contents` when inline (no box,
  // no layout impact) and the fullscreen backdrop when fullscreen.
  return (
    <div
      className={isFullscreen ? 'mermaid-fullscreen-backdrop' : 'mermaid-viewer-shell'}
      role={isFullscreen ? 'dialog' : undefined}
      aria-modal={isFullscreen ? true : undefined}
      aria-label={isFullscreen ? 'Mermaid diagram fullscreen' : undefined}
      onClick={
        isFullscreen
          ? (e) => {
              if (e.target === e.currentTarget) setIsFullscreen(false);
            }
          : undefined
      }
    >
      {viewer}
    </div>
  );
}
