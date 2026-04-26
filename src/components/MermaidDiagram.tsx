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

  // Compute "fit-to-width" scale based on container vs. natural SVG width.
  const computeFitScale = useCallback((): number => {
    const cont = containerRef.current?.getBoundingClientRect();
    const svg = contentRef.current?.querySelector('svg');
    if (!cont || !svg) return 1;
    const rect = svg.getBoundingClientRect();
    const viewBoxWidth = svg.viewBox?.baseVal?.width;
    // Use natural (un-transformed) width: prefer viewBox over current rect
    // (rect reflects the current transform, viewBox is intrinsic).
    const w = viewBoxWidth || rect.width || cont.width;
    if (!w) return 1;
    const fit = (cont.width - 32) / w; // 32px breathing room on each side
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, fit));
  }, []);

  const fitToWidth = useCallback(() => {
    const s = computeFitScale();
    wrapperRef.current?.setTransform(0, 0, s, ANIMATION_MS);
  }, [computeFitScale]);

  const actualSize = useCallback(() => {
    wrapperRef.current?.setTransform(0, 0, 1, ANIMATION_MS);
  }, []);

  // After SVG injection: restore stored zoom or auto fit-to-width.
  useEffect(() => {
    if (state.loading || state.error || !state.svg) return;
    if (initializedRef.current) return;
    const stored = loadStoredScale(storageKey);
    // Wait one frame so the SVG has its bounding rect available.
    const id = requestAnimationFrame(() => {
      const target = stored ?? computeFitScale();
      wrapperRef.current?.setTransform(0, 0, target, 0);
      setScale(target);
      initializedRef.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [state, storageKey, computeFitScale]);

  // Cleanup persist timer on unmount.
  useEffect(() => {
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, []);

  // Global Escape handler when fullscreen.
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsFullscreen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
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
          fitToWidth();
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
    [fitToWidth],
  );

  const handleTransformed = useCallback(
    (_ref: ReactZoomPanPinchRef, s: { scale: number; positionX: number; positionY: number }) => {
      setScale(s.scale);
      if (storageKey) {
        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        persistTimerRef.current = setTimeout(() => {
          saveScale(storageKey, s.scale);
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
          onClick={fitToWidth}
          title="Fit to width (0)"
          aria-label="Fit to width"
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
          onClick={fitToWidth}
          title="Reset"
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
        onTransformed={handleTransformed}
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

  if (isFullscreen) {
    return (
      <div
        className="mermaid-fullscreen-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="Mermaid diagram fullscreen"
      >
        {viewer}
      </div>
    );
  }
  return viewer;
}
