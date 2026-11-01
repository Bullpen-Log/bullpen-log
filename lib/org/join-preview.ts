import type { AccountType } from '@prisma/client';
import type { OrgRole } from '@/lib/org/capabilities';
import { planMembership, type MemberStatus } from '@/lib/org/membership-transitions';
import { inviteUsable } from '@/lib/org/rules';

/**
 * 참여 화면의 미리보기 계약(2026-11-01 2차 검토 G01) — 서버가 초대 · 내 회원 줄을 읽어 어떤 화면을 그릴지 정한다. 순수 함수라 셀프테스트가 역할 픽스처로 돈다.
 * 최종 판정은 트랜잭션(membership-transitions.ts redeemInviteTx)이 다시 한다 — 여기 상태는 '무엇을 보여 줄지'다.
 *
 *   player        선수(회원) 등록 — 공유 범위를 고르고 참여
 *   staff         코치 임명 수락 — 조직 · 코치 업무를 보이고 수락(기록 공유 동의가 아니다)
 *   already       이미 그 조직의 활동 중인 같은 자격(코드를 쓰지 않는다)
 *   role_conflict 다른 자격으로 있어 이 코드로 못 들어감(활동 중인 선수에게 코치 코드 · 활동 중인 코치에게 선수 코드)
 *   master        마스터 계정이 선수 코드를
 *   used          남이 쓴 한 번 코드
 *   expired       없거나 기한이 지난 코드(소유자 코드 포함)
 */
export type JoinPreview =
  | { state: 'player' | 'staff'; rejoin: boolean }
  | { state: 'already'; role: OrgRole }
  | { state: 'role_conflict'; role: OrgRole }
  | { state: 'master' | 'used' | 'expired' };

export function invitePreview(a: {
  invite: { role: OrgRole; memberId?: string | null; expiresAt: Date; usedAt: Date | null; usedById: string | null } | null;
  /** 그 조직에 있는 내 회원 줄 */
  mine: { id: string; role: OrgRole; status: MemberStatus } | null;
  user: { id: string; accountType: AccountType };
  now: Date;
}): JoinPreview {
  const { invite, mine, user } = a;
  if (!invite || invite.role === 'MASTER') return { state: 'expired' };
  if (!inviteUsable(invite, a.now)) {
    if (invite.usedAt && invite.usedById === user.id && mine?.status === 'ACTIVE') return { state: 'already', role: mine.role };
    return { state: invite.usedAt ? 'used' : 'expired' };
  }
  if (invite.role === 'PLAYER' && user.accountType === 'MASTER') return { state: 'master' };
  const incoming = invite.role === 'STAFF' ? 'STAFF' : 'PLAYER';
  const plan = planMembership(mine, incoming);
  if (plan.action === 'conflict') return { state: 'role_conflict', role: mine!.role };
  if (plan.action === 'none') return { state: 'already', role: mine!.role };
  return { state: incoming === 'STAFF' ? 'staff' : 'player', rejoin: plan.action === 'reactivate' };
}
