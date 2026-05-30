import { NextRequest, NextResponse } from 'next/server';
import archiver from 'archiver';
import { getDb } from '@/server/singleton';
import { checkAdmin, getRequestInfo } from '@/app/api/_helpers';
import { formatExportTimestamp } from '@/utils/format';

// archiver + Buffer.concat + better-sqlite3 are Node-only. Pin the runtime so
// a future Next.js default change (or misconfigured edge override) cannot
// silently route this handler to the Edge runtime, where `Buffer.concat` and
// `archiver` would fail. Matches the import-route pin and the convention
// already used by the rate-limit-bound auth routes.
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const admin = checkAdmin(req);
  if (!admin.ok) return admin.response;

  try {
    const { ip, userAgent } = getRequestInfo(req);
    const db = getDb();
    const data = db.exportAllData();
    // Capture a single export timestamp so the filename suffix and the
    // manifest's `exportedAt` field always agree (previously two separate
    // `new Date()` calls could differ by milliseconds — visibly so across
    // a second / minute / day boundary).
    const exportedAt = new Date();
    const timestamp = formatExportTimestamp(exportedAt);
    console.log(
      `[audit] admin export: timestamp=${exportedAt.toISOString()} ip=${ip ?? 'unknown'} ua=${userAgent ?? 'unknown'} stashes=${data.stashes.length}`,
    );

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
      archive.append(JSON.stringify(data.stash_version_files, null, 2), {
        name: 'stash_version_files.json',
      });
      archive.append(JSON.stringify({ exportedAt: exportedAt.toISOString(), version: '1.0' }), {
        name: 'manifest.json',
      });
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
