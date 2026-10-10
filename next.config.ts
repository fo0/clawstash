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
  // Switch off the built-in image optimizer. Nothing in the app renders
  // `next/image` and `public/` holds no images, yet `/_next/image` is served
  // by default, unauthenticated and outside the middleware matcher: any caller
  // can make the server fetch a local path of its choosing and, for an image,
  // run sharp on it. That endpoint is the reach path of the Image Optimization
  // SSRF advisory in Next.js and the librsvg advisory in sharp. With
  // `unoptimized: true` Next.js answers `/_next/image` with 404 before any
  // fetch or resize. Re-enable only together with a `next/image` use.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
