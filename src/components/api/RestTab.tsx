import Spinner from '../shared/Spinner';
import SwaggerViewer from './SwaggerViewer';
import { getRestConfigText } from './api-data';
import { BookIcon, KeyIcon, CopyIcon, ChevronIcon, CheckIcon } from './icons';
import { useCopyToast, useExpandableSpecs } from './useCopyToast';

interface Props {
  baseUrl: string;
  openApiJson: string;
}

export default function RestTab({ baseUrl, openApiJson }: Props) {
  const { copyNotice, handleCopy } = useCopyToast();
  const { expandedSpecs, toggleSpecPreview } = useExpandableSpecs();

  return (
    <div className="api-tab-content">
      {/* REST API Overview */}
      <section className="api-section">
        <div className="api-section-header">
          <span className="api-section-icon blue"><BookIcon /></span>
          <h2>REST API</h2>
        </div>
        <p className="api-hint">
          Full REST API for programmatic access to all stash operations.
          Authentication via Bearer token in the Authorization header.
        </p>
        <div className="api-copy-config-section">
          <div className="api-spec-copy-buttons">
            <button
              className="btn btn-primary api-copy-config-btn"
              onClick={() => handleCopy(getRestConfigText(baseUrl, openApiJson), 'REST API Spec')}
              title="Copy complete REST API reference with OpenAPI schema for AI agents"
            >
              <CopyIcon size={16} /> Copy REST API Spec for AI
            </button>
            <button
              className="btn btn-ghost btn-sm api-spec-preview-toggle"
              onClick={() => toggleSpecPreview('rest-tab')}
              title={expandedSpecs.has('rest-tab') ? 'Hide preview' : 'Show preview'}
            >
              <ChevronIcon expanded={expandedSpecs.has('rest-tab')} /> Preview
            </button>
          </div>
          <span className="api-hint" style={{ marginBottom: 0 }}>
            Copies complete REST API reference with purpose description, all endpoints, and the full OpenAPI 3.0 specification.
          </span>
          {expandedSpecs.has('rest-tab') && (
            <pre className="api-code-block api-spec-preview">{getRestConfigText(baseUrl, openApiJson)}</pre>
          )}
        </div>
      </section>

      {/* Swagger Explorer */}
      <section className="api-section">
        <div className="api-section-header">
          <span className="api-section-icon blue"><BookIcon /></span>
          <h2>API Explorer (Swagger UI)</h2>
        </div>
        <p className="api-hint">
          Interactive API documentation with live testing. Click on an endpoint, then "Try it out" to execute requests directly.
        </p>
        <SwaggerViewer />
      </section>

      {/* OpenAPI JSON */}
      <section className="api-section">
        <div className="api-section-header">
          <span className="api-section-icon blue"><BookIcon /></span>
          <h2>OpenAPI (Swagger) Schema</h2>
        </div>
        <p className="api-hint">
          Import this schema into Swagger UI or other API tools.
        </p>
        <div className="api-section-actions">
          <button
            className="btn btn-secondary"
            onClick={() => handleCopy(openApiJson, 'OpenAPI JSON')}
            disabled={!openApiJson}
          >
            Copy OpenAPI JSON
          </button>
          <a href="/api/openapi" className="btn btn-primary" target="_blank" rel="noopener noreferrer">
            Download JSON
          </a>
        </div>
        {openApiJson ? (
          <pre className="api-code-block api-code-block-scroll">{openApiJson}</pre>
        ) : (
          <div className="api-loading"><Spinner /> Loading schema...</div>
        )}
      </section>

      {/* REST Examples */}
      <section className="api-section">
        <div className="api-section-header">
          <span className="api-section-icon green"><KeyIcon /></span>
          <h2>Examples</h2>
        </div>
        <div className="api-mgr-examples">
          <div className="api-example-item">
            <div className="api-example-title">cURL - List Stashes</div>
            <pre className="api-code-block">{`curl -H "Authorization: Bearer YOUR_TOKEN" \\
  ${baseUrl}/api/stashes`}</pre>
          </div>
          <div className="api-example-item">
            <div className="api-example-title">cURL - Get Stash with Token</div>
            <pre className="api-code-block">{`curl -H "Authorization: Bearer YOUR_TOKEN" \\
  ${baseUrl}/api/stashes/STASH_ID`}</pre>
          </div>
          <div className="api-example-item">
            <div className="api-example-title">cURL - Create Stash</div>
            <pre className="api-code-block">{`curl -X POST ${baseUrl}/api/stashes \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -d '{
    "description": "My Stash",
    "tags": ["example"],
    "files": [
      {
        "filename": "hello.py",
        "content": "print('Hello World')"
      }
    ]
  }'`}</pre>
          </div>
          <div className="api-example-item">
            <div className="api-example-title">cURL - Create API Token</div>
            <pre className="api-code-block">{`curl -X POST ${baseUrl}/api/tokens \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \\
  -d '{"label": "My Token", "scopes": ["read", "write"]}'`}</pre>
          </div>
          <div className="api-example-item">
            <div className="api-example-title">JavaScript - List Stashes</div>
            <pre className="api-code-block">{`const response = await fetch('${baseUrl}/api/stashes', {
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' },
});
const data = await response.json();
console.log(data.stashes);`}</pre>
          </div>
          <div className="api-example-item">
            <div className="api-example-title">JavaScript - Create Stash</div>
            <pre className="api-code-block">{`const response = await fetch('${baseUrl}/api/stashes', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN',
  },
  body: JSON.stringify({
    description: 'My Stash',
    files: [{ filename: 'note.md', content: '# Hello' }],
    tags: ['notes'],
  }),
});
const stash = await response.json();`}</pre>
          </div>
          <div className="api-example-item">
            <div className="api-example-title">Python - Search Stashes</div>
            <pre className="api-code-block">{`import requests

response = requests.get(
    '${baseUrl}/api/stashes',
    params={'search': 'hello'},
    headers={'Authorization': 'Bearer YOUR_TOKEN'}
)
data = response.json()
print(f"Found {data['total']} stashes")`}</pre>
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
