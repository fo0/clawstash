import { useState, useEffect, useMemo } from 'react';
import type { ApiTab } from '../../types';
import { api } from '../../api';
import TokensTab from './TokensTab';
import RestTab from './RestTab';
import McpTab from './McpTab';

interface Props {
  onBack?: () => void;
  embedded?: boolean;
}

export default function ApiManager({ onBack, embedded }: Props) {
  const [activeTab, setActiveTab] = useState<ApiTab>('tokens');
  const [openApiJson, setOpenApiJson] = useState('');
  const [mcpSpec, setMcpSpec] = useState('');
  const [mcpTools, setMcpTools] = useState<Array<{ name: string; description: string }> | null>(
    null,
  );
  // Failed spec/tool loads previously only console.error'd, leaving the
  // consumers' "Loading..." spinners spinning forever. Track failures so the
  // tabs can show an error + Retry instead.
  const [loadFailed, setLoadFailed] = useState(false);
  // Bumped by Retry — the load effects below re-run and re-attempt whatever
  // is still missing.
  const [retryNonce, setRetryNonce] = useState(0);

  const retryLoads = () => {
    setLoadFailed(false);
    setRetryNonce((n) => n + 1);
  };

  // Load OpenAPI JSON when REST or tokens tab is selected
  useEffect(() => {
    if ((activeTab === 'rest' || activeTab === 'tokens') && !openApiJson) {
      let cancelled = false;
      api
        .getOpenApiSchema()
        .then((schema) => {
          if (!cancelled) setOpenApiJson(JSON.stringify(schema, null, 2));
        })
        .catch((err) => {
          console.error('Failed to load OpenAPI schema:', err);
          if (!cancelled) setLoadFailed(true);
        });
      return () => {
        cancelled = true;
      };
    }
  }, [activeTab, openApiJson, retryNonce]);

  // Load MCP spec when MCP or tokens tab is selected
  useEffect(() => {
    if ((activeTab === 'mcp' || activeTab === 'tokens') && !mcpSpec) {
      let cancelled = false;
      api
        .getMcpSpec()
        .then((spec) => {
          if (!cancelled) setMcpSpec(spec);
        })
        .catch((err) => {
          console.error('Failed to load MCP spec:', err);
          if (!cancelled) setLoadFailed(true);
        });
      return () => {
        cancelled = true;
      };
    }
  }, [activeTab, mcpSpec, retryNonce]);

  // Load MCP tool summaries when MCP tab is selected
  useEffect(() => {
    if (activeTab === 'mcp' && mcpTools === null) {
      let cancelled = false;
      api
        .getMcpTools()
        .then((tools) => {
          if (!cancelled) setMcpTools(tools);
        })
        .catch((err) => {
          console.error('Failed to load MCP tools:', err);
          if (!cancelled) setLoadFailed(true);
        });
      return () => {
        cancelled = true;
      };
    }
  }, [activeTab, mcpTools, retryNonce]);

  const baseUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'https://your-host';
    return `${window.location.protocol}//${window.location.host}`;
  }, []);

  const tabs: { id: ApiTab; label: string }[] = [
    { id: 'tokens', label: 'API Tokens' },
    { id: 'rest', label: 'REST API' },
    { id: 'mcp', label: 'MCP API' },
  ];

  return (
    <div className={`api-manager ${embedded ? 'api-manager-embedded' : ''}`}>
      {/* Header - only shown in standalone mode */}
      {!embedded && (
        <div className="api-header">
          <button className="btn btn-ghost" onClick={onBack} title="Back to dashboard">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 1.06L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z" />
            </svg>
            Back
          </button>
          <div className="api-header-title">
            <span className="api-header-icon">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
              </svg>
            </span>
            <h1>API Documentation</h1>
          </div>
          <p className="api-header-desc">
            REST API and MCP Server share the same API tokens. Create a token and use it for both
            REST requests and MCP connections.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="api-tabs" role="tablist" aria-label="API documentation">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`api-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Spec/tool load failure: one shared banner with Retry. Token CRUD and
          the code examples keep working — only the spec previews are affected. */}
      {loadFailed && (
        <div className="error-banner" role="alert">
          Some API documentation failed to load.{' '}
          <button className="btn btn-secondary btn-sm" onClick={retryLoads}>
            Retry
          </button>
        </div>
      )}

      {activeTab === 'tokens' && (
        <TokensTab
          baseUrl={baseUrl}
          openApiJson={openApiJson}
          mcpSpec={mcpSpec}
          specLoadFailed={loadFailed}
        />
      )}
      {activeTab === 'rest' && (
        <RestTab baseUrl={baseUrl} openApiJson={openApiJson} specLoadFailed={loadFailed} />
      )}
      {activeTab === 'mcp' && (
        <McpTab
          baseUrl={baseUrl}
          mcpSpec={mcpSpec}
          mcpTools={mcpTools ?? []}
          specLoadFailed={loadFailed}
        />
      )}
    </div>
  );
}
