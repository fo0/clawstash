import { NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';

export async function GET() {
  try {
    const db = getDb();
    const stats = db.getStats();
    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        stashes: stats.totalStashes,
        files: stats.totalFiles,
      },
    });
  } catch {
    return NextResponse.json(
      { status: 'error', timestamp: new Date().toISOString(), database: { connected: false } },
      { status: 503 },
    );
  }
}
