import { NextRequest, NextResponse } from 'next/server';
import archiver from 'archiver';
import { getDb } from '@/server/singleton';
import { checkAdmin } from '@/app/api/_helpers';

export async function GET(req: NextRequest) {
  const admin = checkAdmin(req);
  if (!admin.ok) return admin.response;

  try {
    const db = getDb();
    const data = db.exportAllData();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    // Build ZIP in memory using archiver
    const chunks: Buffer[] = [];
    const archive = archiver('zip', { zlib: { level: 9 } });

    await new Promise<void>((resolve, reject) => {
      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('end', resolve);
      archive.on('error', reject);

      archive.append(JSON.stringify(data.stashes, null, 2), { name: 'stashes.json' });
      archive.append(JSON.stringify(data.stash_files, null, 2), { name: 'stash_files.json' });
      archive.append(JSON.stringify(data.stash_versions, null, 2), { name: 'stash_versions.json' });
      archive.append(JSON.stringify(data.stash_version_files, null, 2), { name: 'stash_version_files.json' });
      archive.append(JSON.stringify({ exportedAt: new Date().toISOString(), version: '1.0' }), { name: 'manifest.json' });
      archive.finalize();
    });

    const buffer = Buffer.concat(chunks);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="clawstash-export-${timestamp}.zip"`,
      },
    });
  } catch (err) {
    console.error('Export error:', err);
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
  }
}
