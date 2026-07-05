import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Use server-side external packages for native modules
  serverExternalPackages: ['better-sqlite3'],
  // Output standalone build for Docker
  output: 'standalone',
  // Don't advertise the framework via `X-Powered-By: Next.js` (response-header
  // fingerprinting hygiene — complements the security headers set in
  // src/middleware.ts, which adds but cannot remove this Next-added header).
  poweredByHeader: false,
};

export default nextConfig;
