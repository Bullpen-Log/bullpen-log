import 'server-only';
import { prisma } from '@/lib/prisma';
import { coachPaid } from '@/lib/coach-access';
import { notify } from '@/lib/notify';

const REVIEW_TITLE = '이번 주 돌아보기가 왔어요';

/**
 * 주간 리뷰 알림(U37) — 일요일 18시, 코치 진행 중 · 유료인 사람에게 한 번. 크론이 두 번 돌아도 20시간 안에 같은 알림이 있으면 안 보낸다.
 * 보낸 수를 돌려준다. 알림을 누르면 코치 화면(앱은 코치 탭, PC 는 /coach — 리뷰 카드가 맨 위).
 */
export async function sendWeeklyReviewNotices(): Promise<number> {
  const since = new Date(Date.now() - 20 * 3_600_000);
  const rows = await prisma.coachProfile.findMany({
    where: { status: 'active' },
    select: { user: { select: { id: true, role: true } } },
  });
  let sent = 0;
  for (const { user } of rows) {
    if (!(await coachPaid(user))) continue;
    const dup = await prisma.notification.findFirst({ where: { userId: user.id, kind: 'coach', title: REVIEW_TITLE, createdAt: { gte: since } }, select: { id: true } });
    if (dup) continue;
    await notify(user.id, { kind: 'coach', title: REVIEW_TITLE, body: '한 주를 확인하고 다음 주를 맞춰요.', link: '/coach' });
    sent++;
  }
  return sent;
}
