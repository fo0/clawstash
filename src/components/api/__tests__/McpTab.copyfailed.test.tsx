// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import McpTab from '../McpTab';
import { copyToClipboard } from '../../../utils/clipboard';

vi.mock('../../../utils/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

const mockedCopy = vi.mocked(copyToClipboard);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderTab() {
  render(
    <McpTab
      baseUrl="https://stash.example.com"
      mcpSpec="{}"
      mcpTools={[{ name: 'list_stashes', description: 'List stashes' }]}
    />,
  );
}

describe('API copy toast outcome', () => {
  it('names the item and drops the success styling when the clipboard refuses', async () => {
    mockedCopy.mockResolvedValueOnce(false);
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /copy the mcp endpoint url/i }));

    const toast = await screen.findByText(/Copying "MCP Endpoint" failed/);
    const box = toast.closest('.api-copy-notice-toast');
    expect(box?.classList.contains('api-copy-notice-toast-failed')).toBe(true);
    expect(screen.queryByText(/"MCP Endpoint" copied/)).toBeNull();
  });

  it('keeps the success toast for a successful copy', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /copy the mcp endpoint url/i }));

    const toast = await screen.findByText(/"MCP Endpoint" copied/);
    const box = toast.closest('.api-copy-notice-toast');
    expect(box?.classList.contains('api-copy-notice-toast-failed')).toBe(false);
  });
});
