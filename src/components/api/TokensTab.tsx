import { useState, useEffect, useCallback, useRef } from 'react';
import type { TokenListItem, TokenScope, NewlyCreatedToken } from '../../types';
import { api } from '../../api';
import { formatDateTime } from '../../utils/format';
import Spinner from '../shared/Spinner';
import { SCOPE_LABELS, SCOPE_OPTIONS, getRestConfigText } from './api-data';
import { BookIcon, KeyIcon, CopyIcon, PlusIcon, TrashIcon, WarningIcon, ChevronIcon, CheckIcon } from './icons';
import { useCopyToast, useExpandableSpecs } from './useCopyToast';

interface Props {
  baseUrl: string;
  openApiJson: string;
  mcpSpec: string;
}

export default function TokensTab({ baseUrl, openApiJson, mcpSpec }: Props) {
  const [tokens, setTokens] = useState<TokenListItem[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [tokensError, setTokensError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<TokenScope[]>(['read']);
  const [creating, setCreating] = useState(false);
  const [newlyCreated, setNewlyCreated] = useState<NewlyCreatedToken | null>(null);
  const { copyNotice, handleCopy } = useCopyToast();
  const { expandedSpecs, toggleSpecPreview } = useExpandableSpecs();
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const loadTokens = useCallback(async () => {
    setTokensLoading(true);
    setTokensError(null);
    try {
      const result = await api.listTokens();
      if (mountedRef.current) setTokens(result.tokens || []);
    } catch (err) {
      if (mountedRef.current) {
        setTokensError('Could not load tokens. Login as admin to manage tokens.');
        console.error('Failed to load tokens:', err);
      }
    } finally {
      if (mountedRef.current) setTokensLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  const handleCreateToken = useCallback(async () => {
    setCreating(true);
    setNewlyCreated(null);
    try {
      const result = await api.createToken(
        label.trim() || '',
        selectedScopes.length > 0 ? selectedScopes : ['read'],
      );
      if (mountedRef.current) {
        setNewlyCreated(result);
        setLabel('');
        setSelectedScopes(['read']);
      }
      await loadTokens();
    } catch (err) {
      if (mountedRef.current) {
        setTokensError('Failed to create token');
        console.error('Failed to create token:', err);
      }
    } finally {
      if (mountedRef.current) setCreating(false);
    }
  }, [label, selectedScopes, loadTokens]);

  const handleDeleteToken = useCallback(async (id: string) => {
    try {
      await api.deleteToken(id);
      if (mountedRef.current) {
        if (newlyCreated?.id === id) setNewlyCreated(null);
      }
      await loadTokens();
    } catch (err) {
      if (mountedRef.current) {
        setTokensError('Failed to delete token');
        console.error('Failed to delete token:', err);
      }
    }
  }, [loadTokens, newlyCreated]);

  const toggleScope = useCallback((scope: TokenScope) => {
    setSelectedScopes((current) =>
      current.includes(scope)
        ? current.filter((s) => s !== scope)
        : [...current, scope]
    );
  }, []);

  return (
    <div className="api-tab-content">
      {/* Quick Access: Copy Spec Data */}
      <section className="api-section">
        <div className="api-section-header">
          <span className="api-section-icon blue"><BookIcon /></span>
          <h2>Quick Access</h2>
        </div>
        <p className="api-hint">
          Copy complete API specs for implementing REST or MCP integrations.
        </p>
        <div className="api-quick-copy-row">
          <div className="api-spec-copy-group">
            <div className="api-spec-copy-buttons">
              <button
                className="btn btn-primary api-copy-config-btn"
                onClick={() => handleCopy(getRestConfigText(baseUrl, openApiJson), 'REST API Spec')}
                title="Copy complete REST API reference with all endpoints, OpenAPI schema, and purpose description"
              >
                <CopyIcon size={14} /> Copy REST API Spec
              </button>
              <button
                className="btn btn-ghost btn-sm api-spec-preview-toggle"
                onClick={() => toggleSpecPreview('rest-quick')}
                title={expandedSpecs.has('rest-quick') ? 'Hide preview' : 'Show preview'}
              >
                <ChevronIcon expanded={expandedSpecs.has('rest-quick')} /> Preview
              </button>
            </div>
            {expandedSpecs.has('rest-quick') && (
              <pre className="api-code-block api-spec-preview">{getRestConfigText(baseUrl, openApiJson)}</pre>
            )}
          </div>
          <div className="api-spec-copy-group">
            <div className="api-spec-copy-buttons">
              <button
                className="btn btn-primary api-copy-config-btn api-copy-mcp-btn"
                onClick={() => handleCopy(mcpSpec, 'MCP API Spec')}
                title="Copy complete MCP specification with tool schemas, data types, and purpose description"
                disabled={!mcpSpec}
              >
                <CopyIcon size={14} /> Copy MCP API Spec
              </button>
              <button
                className="btn btn-ghost btn-sm api-spec-preview-toggle"
                onClick={() => toggleSpecPreview('mcp-quick')}
                title={expandedSpecs.has('mcp-quick') ? 'Hide preview' : 'Show preview'}
              >
                <ChevronIcon expanded={expandedSpecs.has('mcp-quick')} /> Preview
              </button>
            </div>
            {expandedSpecs.has('mcp-quick') && (
              mcpSpec
                ? <pre className="api-code-block api-spec-preview">{mcpSpec}</pre>
                : <div className="api-loading"><Spinner /> Loading spec...</div>
            )}
          </div>
        </div>
      </section>

      {/* API Tokens */}
      <section className="api-section">
        <div className="api-section-header">
          <span className="api-section-icon amber"><KeyIcon /></span>
          <h2>API Tokens</h2>
        </div>
        <p className="api-hint">
          Tokens are stored server-side and work for both the REST API and MCP Server.
          The token value is only shown once upon creation.
        </p>

        {/* Create Token Form */}
        <div className="api-token-form">
          <div className="form-group">
            <label htmlFor="token-label">Token Label</label>
            <input
              id="token-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Monitoring, Claude Desktop, etc."
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label>Scopes</label>
            <div className="api-scope-buttons">
              {SCOPE_OPTIONS.map((scope) => (
                <button
                  key={scope}
                  className={`api-scope-btn ${selectedScopes.includes(scope) ? 'active' : ''}`}
                  onClick={() => toggleScope(scope)}
                >
                  {SCOPE_LABELS[scope]}
                </button>
              ))}
            </div>
            <div className="api-scope-hierarchy">
              <div className="api-scope-hierarchy-item"><strong>Read</strong> &mdash; Read-only access (GET requests)</div>
              <div className="api-scope-hierarchy-item"><strong>Write</strong> &mdash; Read + write access (POST, PATCH, DELETE)</div>
              <div className="api-scope-hierarchy-item"><strong>Admin</strong> &mdash; Full access including token management (implies all scopes)</div>
              <div className="api-scope-hierarchy-item"><strong>MCP</strong> &mdash; MCP server access (/mcp endpoint)</div>
            </div>
          </div>
          <button
            className="btn btn-primary api-create-token-btn"
            onClick={handleCreateToken}
            disabled={creating}
          >
            <PlusIcon />
            {creating ? 'Creating...' : 'Create Token'}
          </button>
        </div>

        {/* Newly Created Token */}
        {newlyCreated && (
          <div className="api-new-token-banner">
            <div className="api-new-token-header">
              <WarningIcon />
              <span>Token created - copy it now!</span>
            </div>
            <p className="api-hint">The token value is only shown this one time. Copy and store it securely.</p>
            <div className="api-new-token-value">
              <code>{newlyCreated.token}</code>
              <button
                className="btn btn-sm api-copy-btn"
                onClick={() => handleCopy(newlyCreated.token, newlyCreated.label || 'Token')}
                title="Copy token"
              >
                <CopyIcon />
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {tokensError && (
          <div className="api-error-banner">{tokensError}</div>
        )}

        {/* Token List */}
        <div className="api-token-list">
          {tokensLoading ? (
            <div className="api-token-empty">
              <Spinner /> Loading tokens...
            </div>
          ) : tokens.length === 0 ? (
            <div className="api-token-empty">No tokens created yet.</div>
          ) : (
            tokens.map((token) => (
              <div key={token.id} className="api-token-item">
                <div className="api-token-info">
                  <div className="api-token-label">{token.label || 'Unnamed Token'}</div>
                  <div className="api-token-meta">Created: {formatDateTime(token.createdAt)}</div>
                  <div className="api-token-scopes">
                    {token.scopes.map((scope) => (
                      <span key={scope} className="api-scope-badge">{SCOPE_LABELS[scope]}</span>
                    ))}
                  </div>
                </div>
                <div className="api-token-actions">
                  <div className="api-token-prefix">
                    <code>{token.tokenPrefix}••••••••••••</code>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleCopy(
                        newlyCreated?.id === token.id ? newlyCreated.token : token.tokenPrefix,
                        token.label
                      )}
                      title={newlyCreated?.id === token.id ? 'Copy full token' : 'Copy prefix'}
                    >
                      <CopyIcon size={12} />
                    </button>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm api-delete-btn"
                    onClick={() => handleDeleteToken(token.id)}
                    title="Delete token"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))
          )}
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
