import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import type { TokenScope } from '@/server/db';
import { checkAdmin } from '@/app/api/_helpers';
import { CreateTokenSchema, formatZodError } from '@/server/validation';

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

  const parsed = CreateTokenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }

  const { label, scopes } = parsed.data;
  const resolvedScopes: TokenScope[] = scopes && scopes.length > 0
    ? scopes
    : ['read'];

  const result = getDb().createApiToken(
    label?.trim() || '',
    resolvedScopes,
  );

  return NextResponse.json(result, { status: 201 });
}
