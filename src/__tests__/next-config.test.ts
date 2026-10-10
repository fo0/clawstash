import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

// The app renders no `next/image`, so the built-in optimizer at `/_next/image`
// is pure attack surface: unauthenticated, outside the middleware matcher, and
// it fetches a caller-chosen local path server-side and resizes images with sharp.
// `unoptimized: true` makes Next.js answer that route with 404.
describe('next.config', () => {
  it('keeps the built-in image optimizer switched off', () => {
    expect(nextConfig.images?.unoptimized).toBe(true);
  });
});
