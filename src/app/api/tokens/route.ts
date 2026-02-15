import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import type { TokenScope } from '@/server/db';
import { checkAdmin } from '@/app/api/_helpers';

const VALID_SCOPES: TokenScope[] = ['read', 'write', 'admin', 'mcp'];

function isValidScope(scope: string): scope is TokenScope {
  return VALID_SCOPES.includes(scope as TokenScope);
}

// GET /api/tokens - List tokens
export async function GET(req: NextRequest) {
  const admin = checkAdmin(req);
  if (!admin.ok) return admin.response;
  return NextResponse.json({ tokens: getDb().listApiTokens() });
}

// POST /api/tokens - Create token
export async function POST(req: NextRequest) {
  const admin = checkAdmin(req);
  if (!admin.ok) return admin.response;

  const body = await req.json();
  const { label, scopes } = body;

  if (scopes && !Array.isArray(scopes)) {
    return NextResponse.json({ error: 'Scopes must be an array' }, { status: 400 });
  }

  const resolvedScopes: TokenScope[] = scopes && scopes.length > 0
    ? scopes.filter((s: string) => isValidScope(s))
    : ['read'];

  if (resolvedScopes.length === 0) {
    return NextResponse.json({ error: 'At least one valid scope is required' }, { status: 400 });
  }

  const result = getDb().createApiToken(
    typeof label === 'string' ? label.trim() : '',
    resolvedScopes,
  );

  return NextResponse.json(result, { status: 201 });
}
