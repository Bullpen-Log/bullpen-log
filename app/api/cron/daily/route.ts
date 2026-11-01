import { NextResponse } from 'next/server';
import { appNow } from '@/lib/clock';
import { prisma } from '@/lib/prisma';
import { toDateKey } from '@/lib/pitch-stats';
import { weekdayOf } from '@/lib/coach/week';
import { sendWeeklyReviewNotices } from '@/lib/coach/notices';

/**
 * 매일 18시(한국 = UTC 09:00) 정해진 시각 작업 — vercel.json crons(docs/designs/ai-coach.md 10-5). Vercel 이 `Authorization: Bearer <CRON_SECRET>` 를 붙여 부른다.
 * CRON_SECRET 이 없거나 머리가 다르면 401 — 밖에서 부를 수 없다(사용자가 Vercel 환경변수에 CRON_SECRET 을 넣어야 돈다).
 * 지금 하는 일: ① 코치 AI 대화 30일 지난 줄 지우기(U44) ② 일요일이면 코치 진행 중인 사람에게 주간 리뷰 알림 한 번.
 * (설계의 '만 14세 미만 7일 지나 지우기'는 보호자 동의 화면(B2 · B3)과 같이)
 */
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new NextResponse('unauthorized', { status: 401 });
  const today = toDateKey(appNow());
  const oldChats = await prisma.coachMessage.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } });
  const reviewNotices = weekdayOf(today) === 6 ? await sendWeeklyReviewNotices() : 0;
  return NextResponse.json({ ok: true, today, oldChats: oldChats.count, reviewNotices });
}
