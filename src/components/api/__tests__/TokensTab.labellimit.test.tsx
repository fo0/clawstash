// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TokensTab from '../TokensTab';
import { api } from '../../../api';
import { CreateTokenSchema } from '../../../server/validation';

// The label field mirrors the server's cap instead of letting an over-long
// label surface as a rejected create. The component copies the number (it
// must not import server code), so pin that the copy still matches what the
// schema accepts.
vi.mock('../../../api', () => ({
  api: {
    listTokens: vi.fn(),
    createToken: vi.fn(),
    deleteToken: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TokensTab label limit', () => {
  it('caps the label field at the length the server accepts', async () => {
    vi.mocked(api.listTokens).mockResolvedValue({ tokens: [] });
    render(<TokensTab baseUrl="https://stash.example.com" openApiJson="{}" mcpSpec="{}" />);

    const input = (await screen.findByLabelText('Token Label')) as HTMLInputElement;
    const max = input.maxLength;

    expect(max).toBeGreaterThan(0);
    expect(CreateTokenSchema.safeParse({ label: 'x'.repeat(max) }).success).toBe(true);
    expect(CreateTokenSchema.safeParse({ label: 'x'.repeat(max + 1) }).success).toBe(false);
  });
});
