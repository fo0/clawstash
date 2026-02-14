import { buildMcpStreamableConfig, buildMcpStdioConfig } from './api-data';
import { ServerIcon, WifiIcon, KeyIcon, CopyIcon, ChevronIcon, CheckIcon } from './icons';
import { useCopyToast, useExpandableSpecs } from './useCopyToast';
import Spinner from '../shared/Spinner';

interface Props {
  baseUrl: string;
  mcpSpec: string;
  mcpTools: Array<{ name: string; description: string }>;
}

export default function McpTab({ baseUrl, mcpSpec, mcpTools }: Props) {
  const { copyNotice, handleCopy } = useCopyToast();
  const { expandedSpecs, toggleSpecPreview } = useExpandableSpecs();

  const streamableConfigJson = JSON.stringify(buildMcpStreamableConfig(baseUrl), null, 2);
  const stdioConfigJson = JSON.stringify(buildMcpStdioConfig(), null, 2);

  return (
    <div className="api-tab-content">
      {/* MCP Server Overview */}
      <section className="api-section">
        <div className="api-section-header">
          <span className="api-section-icon purple"><ServerIcon /></span>
          <h2>MCP Server</h2>
        </div>
        <p className="api-hint">
          ClawStash provides a remote MCP Server (Model Context Protocol) via Streamable HTTP.
          AI assistants like Claude Desktop, Cursor, or any MCP client can access your stashes directly.
        </p>

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
            Copies complete MCP specification with tool definitions (JSON Schema), data types, token-efficient usage patterns, and purpose description.
          </span>
          {expandedSpecs.has('mcp-tab') && (
            mcpSpec
              ? <pre className="api-code-block api-spec-preview">{mcpSpec}</pre>
              : <div className="api-loading"><Spinner /> Loading spec...</div>
          )}
        </div>
      </section>

      {/* Connection Info */}
      <section className="api-section">
        <div className="api-section-header">
          <span className="api-section-icon purple"><WifiIcon /></span>
          <h2>Connection Details</h2>
        </div>
        <div className="api-mcp-details">
          <div className="api-mcp-row">
            <span className="api-mcp-label">Transport:</span>
            <span>Streamable HTTP (remote)</span>
          </div>
          <div className="api-mcp-row">
            <span className="api-mcp-label">Endpoint:</span>
            <code>{baseUrl}/mcp</code>
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
          <span className="api-section-icon purple"><ServerIcon /></span>
          <h2>Client Configuration</h2>
        </div>

        {/* Streamable HTTP */}
        <div className="api-mcp-config">
          <div className="api-section-label">Streamable HTTP (remote)</div>
          <p className="api-hint">
            Add this to your MCP client configuration (e.g. Claude Desktop, Cursor, etc.).
            Replace YOUR_API_TOKEN with an API token that has the MCP scope.
          </p>
          <div className="api-code-block-wrapper">
            <pre className="api-code-block">{streamableConfigJson}</pre>
            <button
              className="btn btn-ghost btn-sm api-code-copy-btn"
              onClick={() => handleCopy(streamableConfigJson, 'MCP Config')}
              title="Copy configuration"
            >
              <CopyIcon />
            </button>
          </div>
        </div>

        {/* Stdio fallback */}
        <div className="api-mcp-config">
          <div className="api-section-label">Stdio Transport (local alternative)</div>
          <p className="api-hint">
            For local use, you can also run the MCP server via stdio:
          </p>
          <div className="api-code-block-wrapper">
            <pre className="api-code-block">{stdioConfigJson}</pre>
            <button
              className="btn btn-ghost btn-sm api-code-copy-btn"
              onClick={() => handleCopy(stdioConfigJson, 'Stdio MCP Config')}
              title="Copy configuration"
            >
              <CopyIcon />
            </button>
          </div>
        </div>
      </section>

      {/* Available Tools */}
      <section className="api-section">
        <div className="api-section-header">
          <span className="api-section-icon purple"><ServerIcon /></span>
          <h2>Available Tools ({mcpTools.length})</h2>
        </div>
        {mcpTools.length > 0 ? (
          <div className="api-mcp-tool-list">
            {mcpTools.map((tool) => (
              <div key={tool.name} className="api-mcp-tool">
                <code>{tool.name}</code>
                <span>{tool.description}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="api-loading"><Spinner /> Loading tools...</div>
        )}
      </section>

      {/* MCP Examples */}
      <section className="api-section">
        <div className="api-section-header">
          <span className="api-section-icon green"><KeyIcon /></span>
          <h2>Examples</h2>
        </div>
        <div className="api-mgr-examples">
          <div className="api-example-item">
            <div className="api-example-title">Claude Desktop / Cursor - Streamable HTTP Config</div>
            <pre className="api-code-block">{streamableConfigJson}</pre>
          </div>
          <div className="api-example-item">
            <div className="api-example-title">MCP Tool Call - Create Stash</div>
            <pre className="api-code-block">{`Tool: create_stash
Parameters: {
  "description": "My Notes",
  "files": [
    {
      "filename": "notes.md",
      "content": "# Meeting Notes\\n\\n- Item 1\\n- Item 2"
    }
  ],
  "tags": ["meeting", "notes"]
}`}</pre>
          </div>
          <div className="api-example-item">
            <div className="api-example-title">MCP Tool Call - Search Stashes</div>
            <pre className="api-code-block">{`Tool: search_stashes
Parameters: {
  "query": "meeting notes",
  "limit": 10
}`}</pre>
          </div>
          <div className="api-example-item">
            <div className="api-example-title">MCP Tool Call - List by Tag</div>
            <pre className="api-code-block">{`Tool: list_stashes
Parameters: {
  "tag": "important",
  "limit": 20
}`}</pre>
          </div>
        </div>
      </section>

      {copyNotice && (
        <div className="api-copy-notice-toast">
          <CheckIcon /> {copyNotice}
        </div>
      )}
    </div>
  );
}
