import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkAdmin, parseJsonBody } from '@/app/api/_helpers';
import { BackupSettingsSchema, formatZodError } from '@/server/validation';
import { writeBackupSettings } from '@/server/backup/backup-service';
import { notifyBackupSettingsChanged } from '@/server/backup/backup-scheduler';
import { buildBackupSettingsResponse } from '../_helpers';

// GET /api/backup/settings — current backup configuration (admin)
export async function GET(req: NextRequest) {
  const admin = checkAdmin(req);
  if (!admin.ok) return admin.response;
  return NextResponse.json(buildBackupSettingsResponse(getDb()));
}

// PUT /api/backup/settings — replace backup configuration (admin)
export async function PUT(req: NextRequest) {
  const admin = checkAdmin(req);
  if (!admin.ok) return admin.response;

  const body = await parseJsonBody(req);
  if ('error' in body) return body.error;

  const parsed = BackupSettingsSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }

  const db = getDb();
  writeBackupSettings(db, parsed.data);
  notifyBackupSettingsChanged();
  return NextResponse.json(buildBackupSettingsResponse(db));
}
