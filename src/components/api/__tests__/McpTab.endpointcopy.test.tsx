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

describe('McpTab connection details', () => {
  it('offers a copy button for the MCP endpoint URL', () => {
    renderTab();
    expect(screen.getByRole('button', { name: /copy the mcp endpoint url/i })).toBeTruthy();
  });

  it('copies the full endpoint URL, not just the base URL', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /copy the mcp endpoint url/i }));

    expect(mockedCopy).toHaveBeenCalledWith('https://stash.example.com/mcp');
    expect(await screen.findByText(/"MCP Endpoint" copied/)).toBeTruthy();
  });
});
