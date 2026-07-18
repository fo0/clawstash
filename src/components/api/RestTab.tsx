import Spinner from '../shared/Spinner';
import SwaggerViewer from './SwaggerViewer';
import CodeExample from './CodeExample';
import { getRestConfigText } from './api-data';
import { BookIcon, KeyIcon, CopyIcon, ChevronIcon, CheckIcon } from './icons';
import { useCopyToast, useExpandableSpecs } from './useCopyToast';

interface Props {
  baseUrl: string;
  openApiJson: string;
  /** True when a spec fetch failed — show an error instead of an endless spinner. */
  specLoadFailed?: boolean;
}

export default function RestTab({ baseUrl, openApiJson, specLoadFailed }: Props) {
  const { copyNotice, handleCopy } = useCopyToast();
  const { expandedSpecs, toggleSpecPreview } = useExpandableSpecs();

  return (
    <div className="api-tab-content">
      {/* REST API Overview */}
      <section className="api-section">
        <div className="api-section-header">
          <span className="api-section-icon blue">
            <BookIcon />
          </span>
          <h2>REST API</h2>
        </div>
        <p className="api-hint">
          Full REST API for programmatic access to all stash operations. Authentication via Bearer
          token in the Authorization header.
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
            Copies complete REST API reference with purpose description, all endpoints, and the full
            OpenAPI 3.0 specification.
          </span>
          {expandedSpecs.has('rest-tab') && (
            <pre className="api-code-block api-spec-preview">
              {getRestConfigText(baseUrl, openApiJson)}
            </pre>
          )}
        </div>
      </section>

      {/* Swagger Explorer */}
      <section className="api-section">
        <div className="api-section-header">
          <span className="api-section-icon blue">
            <BookIcon />
          </span>
          <h2>API Explorer (Swagger UI)</h2>
        </div>
        <p className="api-hint">
          Interactive API documentation with live testing. Click on an endpoint, then "Try it out"
          to execute requests directly.
        </p>
        <SwaggerViewer />
      </section>

      {/* OpenAPI JSON */}
      <section className="api-section">
        <div className="api-section-header">
          <span className="api-section-icon blue">
            <BookIcon />
          </span>
          <h2>OpenAPI (Swagger) Schema</h2>
        </div>
        <p className="api-hint">Import this schema into Swagger UI or other API tools.</p>
        <div className="api-section-actions">
          <button
            className="btn btn-secondary"
            onClick={() => handleCopy(openApiJson, 'OpenAPI JSON')}
            disabled={!openApiJson}
          >
            Copy OpenAPI JSON
          </button>
          <a
            href="/api/openapi"
            className="btn btn-primary"
            target="_blank"
            rel="noopener noreferrer"
          >
            Download JSON
          </a>
        </div>
        {openApiJson ? (
          <pre className="api-code-block api-code-block-scroll">{openApiJson}</pre>
        ) : specLoadFailed ? (
          <div className="api-loading" role="alert">
            Failed to load the OpenAPI schema — use Retry above.
          </div>
        ) : (
          <div className="api-loading">
            <Spinner /> Loading schema...
          </div>
        )}
      </section>

      {/* REST Examples */}
      <section className="api-section">
        <div className="api-section-header">
          <span className="api-section-icon green">
            <KeyIcon />
          </span>
          <h2>Examples</h2>
        </div>
        <div className="api-mgr-examples">
          <CodeExample
            title="cURL - List Stashes"
            onCopy={handleCopy}
            code={`curl -H "Authorization: Bearer YOUR_TOKEN" \\
  ${baseUrl}/api/stashes`}
          />
          <CodeExample
            title="cURL - Get Stash with Token"
            onCopy={handleCopy}
            code={`curl -H "Authorization: Bearer YOUR_TOKEN" \\
  ${baseUrl}/api/stashes/STASH_ID`}
          />
          <CodeExample
            title="cURL - Create Stash"
            onCopy={handleCopy}
            code={`curl -X POST ${baseUrl}/api/stashes \\
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
  }'`}
          />
          <CodeExample
            title="cURL - Create API Token"
            onCopy={handleCopy}
            code={`curl -X POST ${baseUrl}/api/tokens \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \\
  -d '{"label": "My Token", "scopes": ["read", "write"]}'`}
          />
          <CodeExample
            title="JavaScript - List Stashes"
            onCopy={handleCopy}
            code={`const response = await fetch('${baseUrl}/api/stashes', {
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' },
});
const data = await response.json();
console.log(data.stashes);`}
          />
          <CodeExample
            title="JavaScript - Create Stash"
            onCopy={handleCopy}
            code={`const response = await fetch('${baseUrl}/api/stashes', {
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
const stash = await response.json();`}
          />
          <CodeExample
            title="Python - Search Stashes"
            onCopy={handleCopy}
            code={`import requests

response = requests.get(
    '${baseUrl}/api/stashes',
    params={'search': 'hello'},
    headers={'Authorization': 'Bearer YOUR_TOKEN'}
)
data = response.json()
print(f"Found {data['total']} stashes")`}
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
