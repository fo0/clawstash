import {
  buildAgentOnboardingPrompt,
  buildMcpStreamableConfig,
  buildMcpStdioConfig,
} from './api-data';
import { ServerIcon, WifiIcon, KeyIcon, CopyIcon, ChevronIcon, CheckIcon } from './icons';
import { useCopyToast, useExpandableSpecs } from './useCopyToast';
import CodeExample from './CodeExample';
import SpecPreview from './SpecPreview';
import Spinner from '../shared/Spinner';

interface Props {
  baseUrl: string;
  mcpSpec: string;
  /** null while the tool list is still loading; [] is a legitimately empty list. */
  mcpTools: Array<{ name: string; description: string }> | null;
  /** True when the MCP spec fetch failed — show an error instead of an endless spinner. */
  mcpSpecFailed?: boolean;
  /** True when the tool-summary fetch failed — show an error instead of an endless spinner. */
  mcpToolsFailed?: boolean;
}

export default function McpTab({
  baseUrl,
  mcpSpec,
  mcpTools,
  mcpSpecFailed,
  mcpToolsFailed,
}: Props) {
  const { copyNotice, handleCopy } = useCopyToast();
  const { expandedSpecs, toggleSpecPreview } = useExpandableSpecs();

  const mcpEndpoint = `${baseUrl}/mcp`;
  const streamableConfigJson = JSON.stringify(buildMcpStreamableConfig(baseUrl), null, 2);
  const stdioConfigJson = JSON.stringify(buildMcpStdioConfig(), null, 2);

  return (
    <div className="api-tab-content">
      {/* MCP Server Overview */}
      <section className="api-section">
        <div className="api-section-header">
          <span className="api-section-icon purple">
            <ServerIcon />
          </span>
          <h2>MCP Server</h2>
        </div>
        <p className="api-hint">
          ClawStash provides a remote MCP Server (Model Context Protocol) via Streamable HTTP. AI
          assistants like Claude Desktop, Cursor, or any MCP client can access your stashes
          directly.
        </p>

        {/* Agent onboarding — the one thing to hand an agent. Sits above the
            spec copy because a short prompt that points the agent at the
            server's own guides is what most users need; the full spec below
            stays for clients that cannot fetch URLs themselves. */}
        <div className="api-copy-config-section">
          <div className="api-spec-copy-buttons">
            <button
              className="btn btn-primary api-copy-config-btn"
              onClick={() =>
                handleCopy(buildAgentOnboardingPrompt(baseUrl), 'Agent onboarding prompt')
              }
              title="Copy a ready-to-paste prompt that tells your agent how to connect to this instance and how to use it"
            >
              <CopyIcon size={16} /> Copy onboarding prompt for your agent
            </button>
            <a
              className="btn btn-ghost btn-sm"
              href={`${baseUrl}/api/agent-skill`}
              target="_blank"
              rel="noreferrer"
              title="Open the SKILL.md this instance serves to agents (new tab)"
              // The global anchor rule underlines it; as a .btn it should read
              // like its button siblings.
              style={{ textDecoration: 'none' }}
            >
              Open SKILL.md
            </a>
            <button
              className="btn btn-ghost btn-sm api-spec-preview-toggle"
              onClick={() => toggleSpecPreview('mcp-onboarding-prompt')}
              title={expandedSpecs.has('mcp-onboarding-prompt') ? 'Hide preview' : 'Show preview'}
            >
              <ChevronIcon expanded={expandedSpecs.has('mcp-onboarding-prompt')} /> Preview
            </button>
          </div>
          <span className="api-hint" style={{ marginBottom: 0 }}>
            Paste the prompt into your agent and replace YOUR_API_TOKEN. It points the agent at{' '}
            <code>/api/agent-skill</code> (the operational guide: when to store, workflow,
            conventions, limits), the MCP endpoint and the REST API, and asks it to orient itself
            with <code>get_server_info</code>. The token banner under API Tokens offers the same
            prompt with a freshly created token filled in.
          </span>
          {expandedSpecs.has('mcp-onboarding-prompt') && (
            <SpecPreview
              content={buildAgentOnboardingPrompt(baseUrl)}
              failed={false}
              label="Onboarding prompt"
            />
          )}
        </div>

        {/* Copy Config for AI */}
        <div className="api-copy-config-section">
          <div className="api-spec-copy-buttons">
            <button
              className="btn btn-primary api-copy-config-btn api-copy-mcp-btn"
              onClick={() => handleCopy(mcpSpec, 'MCP API Spec')}
              title="Copy complete MCP specification with tool schemas and data types for AI agents"
              disabled={!mcpSpec}
            >
              <CopyIcon size={16} /> Copy MCP API Spec for AI
            </button>
            <button
              className="btn btn-ghost btn-sm api-spec-preview-toggle"
              onClick={() => toggleSpecPreview('mcp-tab')}
              title={expandedSpecs.has('mcp-tab') ? 'Hide preview' : 'Show preview'}
            >
              <ChevronIcon expanded={expandedSpecs.has('mcp-tab')} /> Preview
            </button>
          </div>
          <span className="api-hint" style={{ marginBottom: 0 }}>
            Copies complete MCP specification with tool definitions (JSON Schema), data types,
            token-efficient usage patterns, and purpose description.
          </span>
          {expandedSpecs.has('mcp-tab') && (
            <SpecPreview content={mcpSpec} failed={mcpSpecFailed} label="MCP spec" />
          )}
        </div>
      </section>

      {/* Connection Info */}
      <section className="api-section">
        <div className="api-section-header">
          <span className="api-section-icon purple">
            <WifiIcon />
          </span>
          <h2>Connection Details</h2>
        </div>
        <div className="api-mcp-details">
          <div className="api-mcp-row">
            <span className="api-mcp-label">Transport:</span>
            <span>Streamable HTTP (remote)</span>
          </div>
          <div className="api-mcp-row">
            <span className="api-mcp-label">Endpoint:</span>
            {/* The endpoint is the one value on this page a user actually has
                to paste somewhere (an MCP client config, a curl call), and it
                was the only bare <code> without a copy button — every config
                snippet below has one. Selecting a URL out of a styled <code>
                by hand is exactly the fiddly step the rest of the tab avoids. */}
            <span className="api-mcp-endpoint">
              <code>{mcpEndpoint}</code>
              <button
                className="btn btn-ghost btn-sm api-mcp-endpoint-copy"
                onClick={() => handleCopy(mcpEndpoint, 'MCP Endpoint')}
                title="Copy the MCP endpoint URL"
                aria-label="Copy the MCP endpoint URL"
              >
                <CopyIcon size={12} />
              </button>
            </span>
          </div>
          <div className="api-mcp-row">
            <span className="api-mcp-label">Method:</span>
            <code>POST</code>
          </div>
        </div>
      </section>

      {/* MCP Client Configuration */}
      <section className="api-section">
        <div className="api-section-header">
          <span className="api-section-icon purple">
            <ServerIcon />
          </span>
          <h2>Client Configuration</h2>
        </div>

        {/* Streamable HTTP */}
        <div className="api-mcp-config">
          <div className="api-section-label">Streamable HTTP (remote)</div>
          <p className="api-hint">
            Add this to your MCP client configuration (e.g. Claude Desktop, Cursor, etc.). Replace
            YOUR_API_TOKEN with an API token that has the MCP scope plus the scopes its tools need
            &mdash; Read to read stashes, Write to create, change or delete them.
          </p>
          <div className="api-code-block-wrapper">
            <pre className="api-code-block">{streamableConfigJson}</pre>
            <button
              className="btn btn-ghost btn-sm api-code-copy-btn"
              onClick={() => handleCopy(streamableConfigJson, 'MCP Config')}
              title="Copy configuration"
              aria-label="Copy Streamable HTTP configuration"
            >
              <CopyIcon />
            </button>
          </div>
        </div>

        {/* Stdio fallback */}
        <div className="api-mcp-config">
          <div className="api-section-label">Stdio Transport (local alternative)</div>
          <p className="api-hint">
            For local use, you can also run the MCP server via stdio. <strong>Replace</strong>{' '}
            <code>&lt;ABSOLUTE_PATH_TO_CLAWSTASH_REPO&gt;</code> with the absolute path to your
            cloned ClawStash checkout — the snippet will not work as-is.
          </p>
          <div className="api-code-block-wrapper">
            <pre className="api-code-block">{stdioConfigJson}</pre>
            <button
              className="btn btn-ghost btn-sm api-code-copy-btn"
              onClick={() => handleCopy(stdioConfigJson, 'Stdio MCP Config')}
              title="Copy configuration"
              aria-label="Copy stdio transport configuration"
            >
              <CopyIcon />
            </button>
          </div>
        </div>
      </section>

      {/* Available Tools */}
      <section className="api-section">
        <div className="api-section-header">
          <span className="api-section-icon purple">
            <ServerIcon />
          </span>
          {/* Show the count only once the list actually loaded — "(0)" while
              loading would misreport a server with tools as having none. */}
          <h2>Available Tools{mcpTools !== null ? ` (${mcpTools.length})` : ''}</h2>
        </div>
        {mcpTools === null ? (
          mcpToolsFailed ? (
            <div className="api-loading" role="alert">
              Failed to load the tool list — use Retry above.
            </div>
          ) : (
            // The spinner is aria-hidden, so without a live region the wait is
            // silent for screen readers — the error sibling already announces.
            <div className="api-loading" role="status" aria-live="polite">
              <Spinner /> Loading tools...
            </div>
          )
        ) : mcpTools.length > 0 ? (
          <div className="api-mcp-tool-list">
            {mcpTools.map((tool) => (
              <div key={tool.name} className="api-mcp-tool">
                <code>{tool.name}</code>
                <span>{tool.description}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="api-hint">The MCP server currently exposes no tools.</p>
        )}
      </section>

      {/* MCP Examples */}
      <section className="api-section">
        <div className="api-section-header">
          <span className="api-section-icon green">
            <KeyIcon />
          </span>
          <h2>Examples</h2>
        </div>
        <div className="api-mgr-examples">
          <CodeExample
            title="MCP Tool Call - Create Stash"
            onCopy={handleCopy}
            code={`Tool: create_stash
Parameters: {
  "description": "My Notes",
  "files": [
    {
      "filename": "notes.md",
      "content": "# Meeting Notes\\n\\n- Item 1\\n- Item 2"
    }
  ],
  "tags": ["meeting", "notes"]
}`}
          />
          <CodeExample
            title="MCP Tool Call - Search Stashes"
            onCopy={handleCopy}
            code={`Tool: search_stashes
Parameters: {
  "query": "meeting notes",
  "limit": 10
}`}
          />
          <CodeExample
            title="MCP Tool Call - List by Tag"
            onCopy={handleCopy}
            code={`Tool: list_stashes
Parameters: {
  "tag": "important",
  "limit": 20
}`}
          />
        </div>
      </section>

      {copyNotice && (
        <div className="api-copy-notice-toast" role="status" aria-live="polite">
          <CheckIcon /> {copyNotice}
        </div>
      )}
    </div>
  );
}
