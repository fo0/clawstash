import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Use server-side external packages for native modules
  serverExternalPackages: ['better-sqlite3'],
  // Output standalone build for Docker
  output: 'standalone',
};

export default nextConfig;
