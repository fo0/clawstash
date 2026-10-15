// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TokensTab from '../TokensTab';
import { api } from '../../../api';

vi.mock('../../../api', () => ({
  api: {
    listTokens: vi.fn(),
    createToken: vi.fn(),
    deleteToken: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderTab() {
  render(<TokensTab baseUrl="https://stash.example.com" openApiJson="{}" mcpSpec="{}" />);
}

describe('TokensTab failed token list load', () => {
  it('does not claim "No tokens created yet." when the list could not be loaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedApi.listTokens.mockRejectedValue(new Error('HTTP 500'));
    renderTab();

    expect(await screen.findByText('The token list could not be loaded.')).toBeTruthy();
    expect(screen.queryByText('No tokens created yet.')).toBeNull();
    expect(screen.getByRole('alert').textContent).toMatch(/could not load tokens/i);
  });

  it('loads the list again from the Retry button', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedApi.listTokens.mockRejectedValueOnce(new Error('HTTP 500')).mockResolvedValueOnce({
      tokens: [
        {
          id: 'tok_1',
          label: 'Monitoring',
          tokenPrefix: 'cs_abcd',
          scopes: ['read'],
          createdAt: '2026-10-01T10:00:00.000Z',
        },
      ],
    });
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Monitoring')).toBeTruthy();
    expect(mockedApi.listTokens).toHaveBeenCalledTimes(2);
    // The successful reload clears the failure: no stale banner, no Retry.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('keeps the honest empty state when the list loads and is empty', async () => {
    mockedApi.listTokens.mockResolvedValue({ tokens: [] });
    renderTab();

    expect(await screen.findByText('No tokens created yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});
