// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TokensTab from '../TokensTab';
import { api } from '../../../api';
import { copyToClipboard } from '../../../utils/clipboard';
import { AGENT_TOKEN_PLACEHOLDER } from '../api-data';

// The banner under test only exists while `newlyCreated` is set, i.e. after a
// real `api.createToken` round trip. TokensTab imports the `api` singleton
// directly, so the module is mocked rather than injected — the same seam the
// component would need for any other list/create test.
vi.mock('../../../api', () => ({
  api: {
    listTokens: vi.fn(),
    createToken: vi.fn(),
    deleteToken: vi.fn(),
  },
}));

vi.mock('../../../utils/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

const mockedApi = vi.mocked(api);
const mockedCopy = vi.mocked(copyToClipboard);

const BASE = 'https://stash.example.com';
const FRESH_TOKEN = 'cs_freshly_minted_secret_value';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderTab() {
  mockedApi.listTokens.mockResolvedValue({ tokens: [] });
  mockedApi.createToken.mockResolvedValue({
    id: 'tok_1',
    token: FRESH_TOKEN,
    label: 'Agent token',
    scopes: ['read', 'write', 'mcp'],
  });
  render(<TokensTab baseUrl={BASE} openApiJson="{}" mcpSpec="{}" />);
}

/** Create a token and wait for the one-time banner that carries its value. */
async function createToken() {
  fireEvent.click(await screen.findByRole('button', { name: /create token/i }));
  expect(await screen.findByText(FRESH_TOKEN)).toBeTruthy();
}

describe('TokensTab one-time token banner', () => {
  it('copies an onboarding prompt carrying the freshly created token', async () => {
    renderTab();
    await createToken();

    fireEvent.click(
      screen.getByRole('button', { name: /copy agent onboarding prompt \(with this token\)/i }),
    );

    await waitFor(() => expect(mockedCopy).toHaveBeenCalledTimes(1));
    const copied = mockedCopy.mock.calls[0]![0];
    // The point of this button: the token is on screen exactly once, so the
    // prompt has to ship with it filled in rather than with the placeholder the
    // MCP tab's copy uses.
    expect(copied).toContain(FRESH_TOKEN);
    expect(copied).not.toContain(AGENT_TOKEN_PLACEHOLDER);
    // ...and it has to point the agent at THIS instance.
    expect(copied).toContain(`${BASE}/api/agent-skill`);
    expect(copied).toContain(`${BASE}/mcp`);
    expect(copied).toContain('get_server_info');
    expect(await screen.findByText(/"Agent onboarding prompt" copied/)).toBeTruthy();
  });

  it('copies the bare token value from the adjacent copy button', async () => {
    renderTab();
    await createToken();

    fireEvent.click(screen.getByRole('button', { name: /copy token/i }));

    await waitFor(() => expect(mockedCopy).toHaveBeenCalledTimes(1));
    expect(mockedCopy.mock.calls[0]![0]).toBe(FRESH_TOKEN);
  });

  it('offers neither button before a token has been created', async () => {
    renderTab();
    // Wait for the initial token list to settle so the assertion cannot pass
    // merely because the component is still loading.
    await screen.findByRole('button', { name: /create token/i });

    expect(
      screen.queryByRole('button', { name: /copy agent onboarding prompt \(with this token\)/i }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /copy token/i })).toBeNull();
  });
});
