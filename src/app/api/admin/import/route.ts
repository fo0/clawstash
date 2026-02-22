import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import { getDb } from '@/server/singleton';
import { checkAdmin } from '@/app/api/_helpers';
import { MAX_IMPORT_SIZE } from '@/server/validation';

export async function POST(req: NextRequest) {
  const admin = checkAdmin(req);
  if (!admin.ok) return admin.response;

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (file.size > MAX_IMPORT_SIZE) {
      return NextResponse.json({ error: 'Import file too large (max 100MB)' }, { status: 413 });
    }
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    const readJson = (name: string): unknown[] => {
      const entry = entries.find(e => e.entryName === name);
      if (!entry) return [];
      return JSON.parse(entry.getData().toString('utf8'));
    };

    const stashes = readJson('stashes.json') as Record<string, unknown>[];
    const stash_files = readJson('stash_files.json') as Record<string, unknown>[];
    const stash_versions = readJson('stash_versions.json') as Record<string, unknown>[];
    const stash_version_files = readJson('stash_version_files.json') as Record<string, unknown>[];

    if (stashes.length === 0) {
      return NextResponse.json({ error: 'No stash data found in ZIP file' }, { status: 400 });
    }

    const result = getDb().importAllData({ stashes, stash_files, stash_versions, stash_version_files });
    return NextResponse.json({ message: 'Import successful', imported: result });
  } catch (err) {
    console.error('Import error:', err);
    return NextResponse.json({ error: 'Failed to import data. Make sure the ZIP file is a valid ClawStash export.' }, { status: 400 });
  }
}
