import { useState, useEffect, useRef } from 'react';
import Spinner from '../shared/Spinner';

export default function SwaggerViewer() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef(false);
  const mountedRef = useRef(true);
  const [hasError, setHasError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (initializedRef.current || !containerRef.current) return;

    // Load CSS
    if (!document.querySelector('link[href*="swagger-ui.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/swagger-ui-dist@5/swagger-ui.css';
      link.onerror = () => {
        if (mountedRef.current) setHasError(true);
      };
      document.head.appendChild(link);
    }

    // Shared init: find SwaggerUIBundle on window and initialize
    const initSwagger = () => {
      if (!mountedRef.current) return;
      const SwaggerUIBundle = (window as unknown as Record<string, unknown>).SwaggerUIBundle as ((
        config: Record<string, unknown>,
      ) => void) & {
        presets?: { apis?: unknown };
      };
      if (SwaggerUIBundle && containerRef.current) {
        SwaggerUIBundle({
          url: '/api/openapi',
          domNode: containerRef.current,
          deepLinking: true,
          presets: [SwaggerUIBundle.presets?.apis].filter(Boolean),
          layout: 'BaseLayout',
          defaultModelsExpandDepth: -1,
          docExpansion: 'list',
          filter: true,
          tryItOutEnabled: true,
        });
        initializedRef.current = true;
      }
      if (mountedRef.current) setLoading(false);
    };

    // Check if already loaded
    const w = window as unknown as Record<string, unknown>;
    if (typeof w.SwaggerUIBundle === 'function') {
      initSwagger();
      return;
    }

    const existingScript = document.querySelector('script[src*="swagger-ui-bundle.js"]');

    // Track listeners attached to existing script so cleanup can remove them.
    let attachedScript: Element | null = null;
    const onLoadListener = () => initSwagger();
    const onErrorListener = () => {
      if (mountedRef.current) {
        setHasError(true);
        setLoading(false);
      }
    };

    if (existingScript) {
      // Script tag exists — may have already loaded (race condition)
      if (typeof w.SwaggerUIBundle === 'function') {
        initSwagger();
        return;
      }
      existingScript.addEventListener('load', onLoadListener);
      existingScript.addEventListener('error', onErrorListener);
      attachedScript = existingScript;
    } else {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js';
      script.onload = initSwagger;
      script.onerror = () => {
        if (mountedRef.current) {
          setHasError(true);
          setLoading(false);
        }
      };
      document.head.appendChild(script);
    }

    return () => {
      initializedRef.current = false;
      // Remove listeners attached to any *pre-existing* script tag — without
      // this, repeated mounts (e.g. tab-switching) leak listeners on the same
      // script element.
      if (attachedScript) {
        attachedScript.removeEventListener('load', onLoadListener);
        attachedScript.removeEventListener('error', onErrorListener);
      }
    };
  }, []);

  if (hasError) {
    return (
      <div className="api-error-banner">
        Swagger UI could not be loaded. Check your network connection or use the OpenAPI JSON
        section.
      </div>
    );
  }

  return (
    <div className="swagger-ui-container">
      {loading && (
        <div className="api-loading">
          <Spinner />
          <span>Loading Swagger UI...</span>
        </div>
      )}
      <div
        ref={containerRef}
        className="swagger-ui-wrapper"
        style={{ display: loading ? 'none' : 'block' }}
      />
    </div>
  );
}
