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

// `X-Frame-Options: DENY` blocks the admin UI from being rendered inside
// a third-party `<iframe>`, defending against clickjacking against the
// login form and any admin-scoped action surface. We use the legacy
// header (rather than CSP `frame-ancestors`) because it is universally
// honored by older browsers and is sufficient here — ClawStash never
// needs to be embedded.
//
// The Content-Security-Policy below is intentionally MINIMAL and ADDITIVE.
// It omits `script-src` / `style-src` / `default-src` on purpose so the
// Next.js inline runtime, React hydration, PrismJS highlighting, and the
// inline-SVG/style Mermaid rendering keep working WITHOUT a per-request
// nonce pipeline (a full script-restricting CSP needs nonces and is a
// larger, separately-tracked hardening task). The directives set here are
// pure defense-in-depth that cannot break current functionality:
//   - `base-uri 'self'`        blocks `<base>` href hijacking (reinforces the
//                              markdown sanitiser, which already strips <base>)
//   - `object-src 'none'`      blocks legacy plugin / <object>/<embed> vectors
//                              (the app never renders them)
//   - `frame-ancestors 'none'` modern clickjacking defense, complementing the
//                              legacy `X-Frame-Options: DENY` on browsers that
//                              prefer CSP over the legacy header
//   - `form-action 'self'`     stops an injected <form> from exfiltrating to a
//                              third-party origin
const CONTENT_SECURITY_POLICY = [
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

// `Permissions-Policy` restricts access to browser features the app never
// needs. Disabling camera, microphone, geolocation, and payment prevents a
// compromised dependency or injected script from silently accessing them.
// The header has no effect on ClawStash's functionality.
const PERMISSIONS_POLICY =
  'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()';

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-DNS-Prefetch-Control': 'off',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Permissions-Policy': PERMISSIONS_POLICY,
};

// `Strict-Transport-Security` pins the host to HTTPS in every browser that
// has seen the header once. ClawStash is documented/designed for plain-HTTP
// LAN deployments (Docker serves http://host:3000), so emitting HSTS
// unconditionally would lock those browsers out of legitimate plain-HTTP
// access for `max-age`. It is therefore sent ONLY when the request
// demonstrably arrived over HTTPS — either terminated by this server
// directly, or behind a trusted TLS-terminating reverse proxy
// (`TRUST_PROXY=1` + `x-forwarded-proto: https`). Browsers ignore HSTS
// received over plain HTTP anyway, so the gate costs nothing.
const STRICT_TRANSPORT_SECURITY = 'max-age=31536000'; // 1 year

function isHttpsRequest(req: NextRequest): boolean {
  if (req.nextUrl.protocol === 'https:') return true;
  // Mirrors isTrustedProxy() in src/server/auth-rate-limit.ts. That module
  // is Node-runtime-only (module-scope cleanup timer + node:crypto), so the
  // two-value check is inlined here instead of imported into the Edge
  // runtime — keep the condition in sync with isTrustedProxy().
  const trustProxy = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';
  if (!trustProxy) return false;
  // First (client-most) value wins in multi-hop chains; case-insensitive
  // because header values are proxy-controlled ('https' vs 'HTTPS').
  return req.headers.get('x-forwarded-proto')?.split(',')[0].trim().toLowerCase() === 'https';
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApiRoute = pathname.startsWith('/api/') || pathname === '/mcp';
  const isHttps = isHttpsRequest(req);

  // Handle CORS preflight for API/MCP routes
  if (isApiRoute && req.method === 'OPTIONS') {
    const headers: Record<string, string> = { ...CORS_HEADERS, ...SECURITY_HEADERS };
    if (isHttps) headers['Strict-Transport-Security'] = STRICT_TRANSPORT_SECURITY;
    return new NextResponse(null, { status: 204, headers });
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

  // HSTS only over genuine HTTPS (see STRICT_TRANSPORT_SECURITY above)
  if (isHttps) {
    response.headers.set('Strict-Transport-Security', STRICT_TRANSPORT_SECURITY);
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
