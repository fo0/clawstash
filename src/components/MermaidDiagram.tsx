import { useEffect, useState } from 'react';
import { renderMermaid } from '../utils/mermaid';

interface Props {
  code: string;
  className?: string;
}

interface State {
  loading: boolean;
  svg?: string;
  error?: string;
}

/**
 * Renders a Mermaid diagram from a source string.
 * Lazy-loads the `mermaid` library on first use, displays an inline error
 * block on syntax/render failure (no app crash), and re-renders when the
 * `code` prop changes.
 */
export default function MermaidDiagram({ code, className }: Props) {
  const [state, setState] = useState<State>({ loading: true });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true });
    renderMermaid(code).then((result) => {
      if (cancelled) return;
      setState({ loading: false, svg: result.svg, error: result.error });
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (state.loading) {
    return <div className={`mermaid-loading ${className || ''}`}>Rendering diagram…</div>;
  }
  if (state.error) {
    return (
      <div className={`mermaid-error ${className || ''}`} role="alert">
        <div className="mermaid-error-title"><strong>Mermaid syntax error</strong></div>
        <div className="mermaid-error-message">{state.error}</div>
        <pre className="mermaid-error-source">{code}</pre>
      </div>
    );
  }
  return (
    <div
      className={`mermaid-diagram ${className || ''}`}
      dangerouslySetInnerHTML={{ __html: state.svg || '' }}
    />
  );
}
