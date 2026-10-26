import 'server-only';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, isMasterUser } from '@/lib/dal';
import { orgsFor } from '@/lib/org/access';

/**
 * 앱(app/actions/app-org.ts · app-lesson.ts)의 팀 · 레슨장 권한 — 코치 쪽은 마스터 계정 · 관리자 + 그 조직을 볼 권한(orgsFor),
 * 선수 쪽은 제 회원 줄(userId 가 나)만. 웹 마스터 화면은 lib/org/access.ts requireOrg(쿠키 · redirect)를 쓴다.
 */

/** 이 조직의 코치인가 — 아니면 null */
export async function coachOrg(orgId: string) {
  const user = await getCurrentUser();
  if (!user || !isMasterUser(user)) return null;
  const org = (await orgsFor(user)).find((o) => o.id === orgId);
  return org ? { user, org } : null;
}

/** 내 회원 줄인가(떠난 곳 포함) — 아니면 null */
export async function myMember(memberId: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const m = await prisma.orgMember.findFirst({
    where: { id: memberId, userId: user.id, role: 'PLAYER' },
    select: {
      id: true,
      nickname: true,
      status: true,
      consent: { select: { pitch: true, training: true, checkin: true, video: true, nutrition: true, weight: true } },
      org: { select: { id: true, kind: true, name: true } },
    },
  });
  return m ? { user, m } : null;
}
