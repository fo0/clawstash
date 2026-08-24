import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level crash guard around the whole SPA.
 *
 * Without a boundary anywhere in the tree, a render-time exception in any
 * component — the viewer, the graph canvas, a Mermaid diagram — unmounts React
 * to a blank white page. There is no message, no way back, and no hint that a
 * reload is what is needed.
 *
 * The fallback names what happened, keeps the details available for a bug
 * report, and offers the three recoveries that actually exist: re-render the
 * tree, reload the page, or go back to the dashboard.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The browser console is the only sink here — ClawStash ships no client
    // error-reporting endpoint, and inventing one would be a new interface.
    console.error('ClawStash crashed while rendering:', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="app-crash" role="alert">
        <div className="app-crash-box">
          <h1>Something went wrong</h1>
          <p>
            The interface hit an unexpected error and stopped rendering. Your stashes are stored on
            the server and are not affected.
          </p>
          <div className="app-crash-actions">
            {/* Clearing the error re-renders the same tree: enough for a
                transient failure, and harmless when it is not — the boundary
                simply catches again. */}
            <button className="btn btn-secondary" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <button className="btn btn-secondary" onClick={() => window.location.reload()}>
              Reload page
            </button>
            <button className="btn btn-ghost" onClick={() => window.location.assign('/')}>
              Back to dashboard
            </button>
          </div>
          <details className="app-crash-details">
            <summary>Error details</summary>
            <pre>{error.stack || error.message}</pre>
          </details>
        </div>
      </div>
    );
  }
}
