// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ApiManager from '../ApiManager';
import { api } from '../../../api';

// ApiManager imports the `api` singleton directly and fetches the spec of
// whichever tab is active on mount — mock the module rather than the network.
vi.mock('../../../api', () => ({
  api: {
    getOpenApiSchema: vi.fn(),
    getMcpSpec: vi.fn(),
    getMcpTools: vi.fn(),
    listTokens: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

beforeEach(() => {
  localStorage.clear();
  mockedApi.getOpenApiSchema.mockResolvedValue({ openapi: '3.0.0' });
  mockedApi.getMcpSpec.mockResolvedValue('# MCP');
  mockedApi.getMcpTools.mockResolvedValue([{ name: 'list_stashes', description: 'List stashes' }]);
  mockedApi.listTokens.mockResolvedValue({ tokens: [] });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe('ApiManager tab preference', () => {
  it('opens on API Tokens when nothing was stored', () => {
    render(<ApiManager embedded />);

    expect(screen.getByRole('tab', { name: 'API Tokens' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('restores the last-used tab from localStorage', async () => {
    localStorage.setItem('clawstash-api-tab', 'mcp');
    render(<ApiManager embedded />);

    expect(screen.getByRole('tab', { name: 'MCP API' }).getAttribute('aria-selected')).toBe('true');
    // The restored tab must also be mounted, not just marked selected — the
    // panel is lazy-mounted on first activation.
    expect(await screen.findByRole('heading', { name: 'MCP Server' })).toBeTruthy();
  });

  it('remembers a tab the user clicks', async () => {
    render(<ApiManager embedded />);

    fireEvent.click(screen.getByRole('tab', { name: 'MCP API' }));

    await waitFor(() => {
      expect(localStorage.getItem('clawstash-api-tab')).toBe('mcp');
    });
  });

  it('ignores a stored value that is not a known tab', () => {
    localStorage.setItem('clawstash-api-tab', 'not-a-tab');
    render(<ApiManager embedded />);

    expect(screen.getByRole('tab', { name: 'API Tokens' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });
});
