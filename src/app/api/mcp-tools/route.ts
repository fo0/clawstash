import { NextResponse } from 'next/server';
import { getToolSummaries } from '@/server/tool-defs';

export async function GET() {
  return NextResponse.json(getToolSummaries());
}
