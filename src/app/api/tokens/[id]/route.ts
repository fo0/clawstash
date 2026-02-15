import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkAdmin } from '@/app/api/_helpers';

type Params = { params: Promise<{ id: string }> };

// DELETE /api/tokens/:id
export async function DELETE(req: NextRequest, { params }: Params) {
  const admin = checkAdmin(req);
  if (!admin.ok) return admin.response;

  const { id } = await params;
  const deleted = getDb().deleteApiToken(id);
  if (!deleted) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
