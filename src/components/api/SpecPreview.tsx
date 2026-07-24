import Spinner from '../shared/Spinner';

interface Props {
  /** The spec text to preview; empty while loading or after a failed fetch. */
  content: string;
  /** True when the fetch failed — show the error instead of an endless spinner. */
  failed?: boolean;
  /** Human name of the resource for the failure message (e.g. "OpenAPI schema"). */
  label: string;
}

/**
 * Expandable spec preview body shared by the REST/MCP tabs: renders the spec
 * text when loaded, a Retry hint when its fetch failed (the Retry button
 * lives in the ApiManager banner), and a spinner while still loading.
 * Callers keep the expand/collapse gate (`expandedSpecs`) at the call site.
 */
export default function SpecPreview({ content, failed, label }: Props) {
  if (content) {
    return <pre className="api-code-block api-spec-preview">{content}</pre>;
  }
  if (failed) {
    return (
      <div className="api-loading" role="alert">
        Failed to load the {label} — use Retry above.
      </div>
    );
  }
  return (
    <div className="api-loading">
      <Spinner /> Loading spec...
    </div>
  );
}
