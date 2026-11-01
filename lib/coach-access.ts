import { prisma } from '@/lib/prisma';
import { isOwner } from '@/lib/permissions';

/** 코치 권한의 상품 이름(Entitlement.product) */
export const COACH_PRODUCT = 'coach';

/** 지금 켜진 권한만 — 시작했고 · 안 끝났고 · 안 거둔 줄. 화면 목록 · 아래 coachPaid 가 같은 조건을 쓴다 */
export const activeEntitlementWhere = (now: Date) => ({
  product: COACH_PRODUCT,
  revokedAt: null,
  startsAt: { lte: now },
  OR: [{ endsAt: null }, { endsAt: { gt: now } }],
});

/**
 * 코치 탭을 쓸 수 있나(유료 요금제 — docs/designs/ai-coach.md U2 · U10 · U14). 웹 화면 · 서버 동작 · 앱(loadAppMe 의 coachPaid)이 이것 하나만 본다.
 * 대표관리자는 늘(시험하려고) · 그 밖은 켜진 권한(Entitlement — 지금은 관리자가 켜고, 인앱결제가 붙으면 같은 표, R7)이 있을 때.
 */
export async function coachPaid(user: { id: string; role: string | null | undefined }): Promise<boolean> {
  if (isOwner(user.role)) return true;
  return (await prisma.entitlement.count({ where: { userId: user.id, ...activeEntitlementWhere(new Date()) } })) > 0;
}
