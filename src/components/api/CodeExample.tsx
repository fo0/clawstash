import { CopyIcon } from './icons';

interface Props {
  title: string;
  code: string;
  onCopy: (value: string, label: string) => void;
}

/**
 * A titled code snippet with a one-click copy button, used in the REST and
 * MCP "Examples" sections. Reuses the same `.api-code-block-wrapper` +
 * `.api-code-copy-btn` positioning as the MCP client-config blocks so the
 * copy affordance is consistent across the whole API manager — previously the
 * example snippets were the only code blocks with no copy button and had to be
 * selected by hand. Copy feedback surfaces through the parent tab's shared
 * copy toast via `onCopy` (the `useCopyToast` `handleCopy`).
 */
export default function CodeExample({ title, code, onCopy }: Props) {
  return (
    <div className="api-example-item">
      <div className="api-example-title">{title}</div>
      <div className="api-code-block-wrapper">
        <pre className="api-code-block">{code}</pre>
        <button
          className="btn btn-ghost btn-sm api-code-copy-btn"
          onClick={() => onCopy(code, title)}
          title="Copy example to clipboard"
          aria-label={`Copy example: ${title}`}
        >
          <CopyIcon />
        </button>
      </div>
    </div>
  );
}
