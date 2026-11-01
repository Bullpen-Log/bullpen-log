import { passUsable } from '@/lib/org/rules';

/**
 * 레슨 예약 끝냄 + 수강권 한 회 차감(2026-11-01, 팀 · 레슨 통합 1단계 — 브리프 2절 알려진 문제 4).
 * 예전(app/actions/lessons.ts finishBooking)은 트랜잭션 **밖**에서 상태를 읽고 안에서 DONE 으로 바꿔 두 요청이 겹치면 둘 다 들어와 수강권이 두 번 줄었다.
 * 이제 상태 바꾸기를 **조건부 갱신**(CONFIRMED 일 때만 → 바뀐 줄 수)으로 하고, 0줄이면 수강권을 건드리지 않는다. 차감도 `used < total` 조건부다.
 * 트랜잭션 클라이언트(또는 같은 모양의 모의)를 받는 순수 함수라 시험(scripts/org-selftest.mts)이 두 요청을 겹쳐 돌려 본다.
 */
export type CompleteTx = {
  lessonBooking: {
    updateMany(a: { where: { id: string; status: string }; data: { status: string } }): Promise<{ count: number }>;
  };
  lessonPass: {
    findMany(a: {
      where: { memberId: string };
      orderBy: ({ expiresAt: 'asc' } | { createdAt: 'asc' })[];
      select: { id: true; total: true; used: true; expiresAt: true };
    }): Promise<{ id: string; total: number; used: number; expiresAt: Date | null }[]>;
    updateMany(a: { where: { id: string; used: { lt: number } }; data: { used: { increment: number } } }): Promise<{ count: number }>;
  };
};

export type CompleteResult =
  /** 이 요청이 끝냈다 · 차감한 수강권(없으면 null — 쓸 수 있는 것이 없었다) */
  | { done: true; passId: string | null }
  /** 이미 끝났거나(겹친 다른 요청) 확정 상태가 아니었다 — 아무것도 안 바꿈 */
  | { done: false };

export async function completeBookingTx(
  tx: CompleteTx,
  a: { bookingId: string; memberId: string | null; lessonDay: string }
): Promise<CompleteResult> {
  const moved = await tx.lessonBooking.updateMany({ where: { id: a.bookingId, status: 'CONFIRMED' }, data: { status: 'DONE' } });
  if (moved.count !== 1) return { done: false };
  if (!a.memberId) return { done: true, passId: null };
  const passes = await tx.lessonPass.findMany({
    where: { memberId: a.memberId },
    orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, total: true, used: true, expiresAt: true },
  });
  /* 기한 가까운 것부터 — 겹친 차감으로 그새 다 쓴 수강권은 조건부 갱신이 0줄이라 다음 것으로 */
  for (const p of passes) {
    if (!passUsable(p, a.lessonDay)) continue;
    const r = await tx.lessonPass.updateMany({ where: { id: p.id, used: { lt: p.total } }, data: { used: { increment: 1 } } });
    if (r.count === 1) return { done: true, passId: p.id };
  }
  return { done: true, passId: null };
}
