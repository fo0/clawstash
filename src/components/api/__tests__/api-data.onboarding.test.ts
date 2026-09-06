import { describe, it, expect } from 'vitest';
import { AGENT_TOKEN_PLACEHOLDER, buildAgentOnboardingPrompt } from '../api-data';

/**
 * The onboarding prompt is the one artifact a user hands their agent. It has
 * to name this instance's URLs, carry the token when one is given (and a
 * visible placeholder when not), and point the agent at the server's own
 * guides instead of duplicating them.
 */
describe('buildAgentOnboardingPrompt', () => {
  const base = 'https://stash.example.com';

  it('uses a visible placeholder when no token is given', () => {
    const prompt = buildAgentOnboardingPrompt(base);
    expect(prompt).toContain(`API token: ${AGENT_TOKEN_PLACEHOLDER}`);
    expect(prompt).toContain(`Bearer ${AGENT_TOKEN_PLACEHOLDER}`);
  });

  it('fills the token in everywhere the placeholder would appear', () => {
    const prompt = buildAgentOnboardingPrompt(base, 'cs_secret123');
    expect(prompt).not.toContain(AGENT_TOKEN_PLACEHOLDER);
    expect(prompt).toContain('API token: cs_secret123');
    expect(prompt).toContain('"Authorization":"Bearer cs_secret123"');
  });

  it('points the agent at the skill, the MCP endpoint, the REST base and get_server_info', () => {
    const prompt = buildAgentOnboardingPrompt(base);
    expect(prompt).toContain(`${base}/api/agent-skill`);
    expect(prompt).toContain(`${base}/mcp`);
    expect(prompt).toContain(`${base}/api/openapi`);
    expect(prompt).toContain('get_server_info');
    expect(prompt).toContain('scopes: read, write, mcp');
  });

  it('embeds a valid MCP client config for this instance', () => {
    const prompt = buildAgentOnboardingPrompt(base, 'cs_x');
    const line = prompt.split('\n').find((l) => l.trim().startsWith('{"mcpServers"'));
    expect(line).toBeTruthy();
    const config = JSON.parse(line!.trim());
    expect(config.mcpServers.clawstash.url).toBe(`${base}/mcp`);
    expect(config.mcpServers.clawstash.type).toBe('streamable-http');
  });
});
