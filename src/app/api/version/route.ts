import { NextResponse } from 'next/server';
import { checkVersion } from '@/server/version';

export async function GET() {
  const info = await checkVersion();
  return NextResponse.json(info);
}
