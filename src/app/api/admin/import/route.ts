import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import { getDb } from '@/server/singleton';
import { checkAdmin } from '@/app/api/_helpers';
import { MAX_IMPORT_SIZE } from '@/server/validation';

export async function POST(req: NextRequest) {
  const admin = checkAdmin(req);
  if (!admin.ok) return admin.response;

  try {
    // Reject oversized uploads before buffering the entire body into memory.
    // formData() reads the whole stream — without this guard a malicious admin
    // token could OOM the process by uploading a multi-GB body. We require an
    // explicit Content-Length header so chunked uploads (which would bypass
    // the size guard) are rejected up-front.
    const contentLengthHeader = req.headers.get('content-length');
    if (contentLengthHeader === null) {
      return NextResponse.json(
        { error: 'Content-Length header required for import' },
        { status: 411 },
      );
    }
    const contentLength = parseInt(contentLengthHeader, 10);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      return NextResponse.json(
        { error: 'Invalid Content-Length header' },
        { status: 400 },
      );
    }
    if (contentLength > MAX_IMPORT_SIZE) {
      return NextResponse.json({ error: 'Import file too large (max 100MB)' }, { status: 413 });
    }

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

    const readJson = (name: string): Record<string, unknown>[] => {
      const entry = entries.find(e => e.entryName === name);
      if (!entry) return [];
      const parsed: unknown = JSON.parse(entry.getData().toString('utf8'));
      if (!Array.isArray(parsed)) {
        throw new Error(`Expected ${name} to contain a JSON array`);
      }
      return parsed as Record<string, unknown>[];
    };

    const stashes = readJson('stashes.json');
    const stash_files = readJson('stash_files.json');
    const stash_versions = readJson('stash_versions.json');
    const stash_version_files = readJson('stash_version_files.json');

    if (stashes.length === 0) {
      return NextResponse.json({ error: 'No stash data found in ZIP file' }, { status: 400 });
    }

    // Validate stash records have required fields
    for (const s of stashes) {
      if (typeof s.id !== 'string' || !s.id) {
        return NextResponse.json({ error: 'Invalid stash data: each stash must have a string id' }, { status: 400 });
      }
    }

    const result = getDb().importAllData({ stashes, stash_files, stash_versions, stash_version_files });
    return NextResponse.json({ message: 'Import successful', imported: result });
  } catch (err) {
    console.error('Import error:', err);
    return NextResponse.json({ error: 'Failed to import data. Make sure the ZIP file is a valid ClawStash export.' }, { status: 400 });
  }
}
