import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Rate limiting for /api/admin/auth and /api/tokens/validate has moved to
// the route handlers themselves (src/server/auth-rate-limit.ts), because:
//   1. Middleware runs in Edge runtime, route handlers in Node runtime —
//      separate `globalThis`, so state cannot be shared.
//   2. We want to RESET the counter on a successful login (so a legitimate
//      user who eventually got the password right isn't locked out for the
//      rest of the 15-min window). The reset must happen in the same
//      runtime that holds the counter.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// CORS headers — permissive for AI agent access from any origin
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Access-Source, X-Requested-With',
  'Access-Control-Max-Age': '86400',
};

// ---------------------------------------------------------------------------
// Security headers — safe defaults that don't break agent/LAN access
// ---------------------------------------------------------------------------

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-DNS-Prefetch-Control': 'off',
};

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApiRoute = pathname.startsWith('/api/') || pathname === '/mcp';

  // Handle CORS preflight for API/MCP routes
  if (isApiRoute && req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: { ...CORS_HEADERS, ...SECURITY_HEADERS },
    });
  }

  // Build response with headers
  const response = NextResponse.next();

  // CORS headers on API/MCP routes
  if (isApiRoute) {
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      response.headers.set(key, value);
    }
  }

  // Security headers on all routes
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  return response;
}

export const config = {
  matcher: [
    // API and MCP routes (CORS + security headers + rate limiting)
    '/api/:path*',
    '/mcp',
    // Pages (security headers only) — excludes static assets
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
