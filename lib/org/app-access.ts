import 'server-only';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { orgsFor } from '@/lib/org/access';

/**
 * 앱(app/actions/app-org.ts · app-lesson.ts)의 팀 · 레슨장 권한 — 코치 쪽은 **그 조직의 소유자 · 스태프 회원**(orgsFor — 관리자는 전부),
 * 선수 쪽은 제 회원 줄(userId 가 나)만. 웹 마스터 화면은 lib/org/access.ts requireOrg(쿠키 · redirect)를 쓴다.
 *
 * 2026-11-01(팀 · 레슨 통합 1단계, 브리프 2절 알려진 문제 1): 코치 판정에서 계정 종류(accountType MASTER)를 뺐다 — 코치인가는 조직 안의 역할(OrgMember MASTER · STAFF)이
 * 정한다. 그래야 일반(선수 · 학부모) 계정이 스태프로 초대받아 조직 업무를 맡을 수 있다(lib/org/capabilities.ts). 전역 서비스 역할 · 계정 종류는 조직 권한의 근거가 아니다.
 */

/** 이 조직의 코치(소유자 · 스태프)인가 — 아니면 null */
export async function coachOrg(orgId: string) {
  const user = await getCurrentUser();
  if (!user) return null;
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
