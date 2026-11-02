import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { linkSessionsToLog } from '@/lib/velocity-link';

/**
 * 이미 저장한 투구 기록에 구속 측정을 다시 잇는다 — 기록은 저장됐는데 측정 연결을 확인하지 못했을 때(앱 퀵스텝의 '연결 다시 시도').
 * 기록을 새로 만들지 않는다(같은 공이 부하에 두 번 들어가지 않게). 본인 기록 · 그 기록과 같은 날 세션만 잇는다(lib/velocity-link.ts).
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 });
  try {
    const body = await req.json();
    const id = typeof body?.id === 'string' ? body.id : '';
    const ids = Array.isArray(body?.sessionIds)
      ? body.sessionIds.filter((x: unknown): x is string => typeof x === 'string').slice(0, 20)
      : [];
    if (!id || ids.length === 0) return NextResponse.json({ error: '이을 기록과 측정이 필요해요' }, { status: 400 });
    const log = await prisma.pitchLog.findFirst({ where: { id, userId: user.id }, select: { id: true, date: true } });
    if (!log) return NextResponse.json({ error: '기록을 찾을 수 없어요' }, { status: 404 });
    return NextResponse.json(await linkSessionsToLog(ids, user.id, log.date, log.id));
  } catch (error) {
    console.error('[POST /api/pitch-log/link]', error);
    return NextResponse.json({ error: '측정을 잇지 못했어요' }, { status: 500 });
  }
}
