// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SwaggerViewer from '../SwaggerViewer';

// jsdom does not fetch external subresources, so the tags the component
// appends never fire load or error on their own — the failure is simulated by
// dispatching the event the component itself listens for.
function bundleScript(): Element | null {
  return document.querySelector('script[src*="swagger-ui-bundle.js"]');
}

function removeSwaggerAssets(): void {
  document
    .querySelectorAll('script[src*="swagger-ui-bundle.js"], link[href*="swagger-ui.css"]')
    .forEach((el) => el.remove());
}

afterEach(() => {
  cleanup();
  // The tags live on document.head, outside the render container.
  removeSwaggerAssets();
  // The bundle installs itself as a global; a leftover one would make the next
  // render initialize immediately instead of appending a script.
  delete (window as unknown as { SwaggerUIBundle?: unknown }).SwaggerUIBundle;
});

describe('SwaggerViewer load failure', () => {
  it('offers a retry instead of dead-ending on the error banner', () => {
    render(<SwaggerViewer />);

    const script = bundleScript();
    expect(script).toBeTruthy();
    fireEvent.error(script!);

    expect(screen.getByRole('alert').textContent).toContain('could not be loaded');
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
  });

  it('re-requests the assets with fresh tags when Retry is clicked', () => {
    render(<SwaggerViewer />);

    const first = bundleScript();
    fireEvent.error(first!);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    expect(screen.queryByRole('alert')).toBeNull();
    const second = bundleScript();
    expect(second).toBeTruthy();
    // A tag that already errored never fires again, so the retry has to append
    // a new one rather than re-listen on the dead one.
    expect(second).not.toBe(first);
    expect(document.querySelector('link[href*="swagger-ui.css"]')).toBeTruthy();
  });

  it('actually initializes Swagger UI when the retry succeeds', () => {
    render(<SwaggerViewer />);

    fireEvent.error(bundleScript()!);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    // The CDN answers this time: the bundle installs its global, then the
    // fresh tag fires the load event the component is waiting for.
    const bundle = vi.fn();
    (window as unknown as { SwaggerUIBundle?: unknown }).SwaggerUIBundle = bundle;
    fireEvent.load(bundleScript()!);

    expect(bundle).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Loading Swagger UI/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('can fail again after a retry and still offer another one', () => {
    render(<SwaggerViewer />);

    fireEvent.error(bundleScript()!);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    fireEvent.error(bundleScript()!);

    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
  });
});
