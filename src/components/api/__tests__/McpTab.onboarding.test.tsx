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

const BASE = 'https://stash.example.com';

function renderTab() {
  render(
    <McpTab
      baseUrl={BASE}
      mcpSpec="{}"
      mcpTools={[{ name: 'list_stashes', description: 'List stashes' }]}
    />,
  );
}

describe('McpTab agent onboarding', () => {
  it('copies a prompt that names this instance, its skill and get_server_info', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /copy onboarding prompt for your agent/i }));

    expect(mockedCopy).toHaveBeenCalledTimes(1);
    const copied = mockedCopy.mock.calls[0]![0];
    expect(copied).toContain(`${BASE}/api/agent-skill`);
    expect(copied).toContain(`${BASE}/mcp`);
    expect(copied).toContain('get_server_info');
    expect(copied).toContain('YOUR_API_TOKEN');
    expect(await screen.findByText(/"Agent onboarding prompt" copied/)).toBeTruthy();
  });

  it('links to the SKILL.md this instance serves', () => {
    renderTab();
    const link = screen.getByRole('link', { name: /open skill\.md/i });
    expect(link.getAttribute('href')).toBe(`${BASE}/api/agent-skill`);
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('previews the prompt on demand', () => {
    renderTab();
    expect(screen.queryByText(/Connect to my ClawStash instance/)).toBeNull();
    // Several sections carry a Preview toggle; the onboarding one comes first.
    fireEvent.click(screen.getAllByRole('button', { name: /preview/i })[0]!);
    expect(screen.getByText(/Connect to my ClawStash instance/)).toBeTruthy();
  });
});
