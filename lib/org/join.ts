import 'server-only';
import type { AccountType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { inviteUsable, normalizeInviteCode, type Consent } from '@/lib/org/rules';
import type { OrgRole } from '@/lib/org/capabilities';
import { MembershipConflict, redeemInviteTx } from '@/lib/org/membership-transitions';

/**
 * 초대 코드로 조직에 들어가기 — 웹 참여 화면(app/actions/org-join.ts joinOrg)과 앱(app/actions/app-org.ts joinOrgApp)이 같이 쓴다.
 * 전이 · 코드 차지는 lib/org/membership-transitions.ts(2026-11-01 2차 검토 G02 · G03) — 한 트랜잭션 안에서 코드를 다시 읽고(기한 · 역할), 한 번 쓰는
 * 코드는 조건부로 차지하고(두 사람이 같은 STAFF 코드를 동시에 넣으면 하나만), 회원 줄의 역할 · 상태를 표대로 옮긴다(나간 코치가 선수 코드로 들어오면
 * 선수로 — 코치 권한은 되살리지 않는다). 여기서 하는 선검사는 안내용이고 최종 판정은 트랜잭션 안이다.
 * 코치가 대신 만든 자리(초대의 memberId)는 아직 아무도 안 이었을 때만 이어받고, 공유 범위는 선수 자격일 때만 저장한다(코치 임명은 동의가 아니다).
 */
export type JoinError = 'code' | 'expired' | 'used' | 'staff' | 'master' | 'role_conflict' | 'conflict';
export type JoinOutcome = 'joined' | 'rejoined' | 'appointed' | 'already';
export type JoinResult = { ok: true; orgId: string; memberId: string; role: OrgRole; outcome: JoinOutcome } | { ok: false; error: JoinError };

/** 들어온 사람에게 보이는 글 — 웹 · 앱이 같이 쓴다 */
export const JOIN_ERROR_TEXT: Record<JoinError, string> = {
  code: '초대 코드 여섯 글자를 확인해 주세요.',
  expired: '코드가 맞지 않거나 기한이 지났어요. 코치에게 새 코드를 받아 주세요.',
  used: '이미 다른 사람이 쓴 코드예요. 코치에게 새 코드를 받아 주세요.',
  staff: '이 코드로는 들어갈 수 없어요. 코치 · 선수 코드를 받아 주세요.',
  master: '선수 코드는 선수 계정으로 넣어 주세요. 이 계정은 팀 · 레슨장 관리용이에요.',
  role_conflict: '이 조직에 이미 다른 자격으로 있어요. 선수 줄 하나로는 코치 일을 더할 수 없어요. 감독에게 명단에서 뺀 뒤 새 코드를 받거나 다른 계정으로 들어가 주세요.',
  conflict: '그새 이 자리를 다른 사람이 이어받았어요. 코치에게 새 코드를 받아 주세요.',
};

export async function joinWithCode(
  user: { id: string; nickname: string; accountType: AccountType },
  rawCode: unknown,
  consent: Consent
): Promise<JoinResult> {
  const code = normalizeInviteCode(rawCode);
  if (!code) return { ok: false, error: 'code' };
  const invite = await prisma.orgInvite.findUnique({
    where: { code },
    select: { id: true, orgId: true, role: true, memberId: true, expiresAt: true, usedAt: true, usedById: true },
  });
  /* 안내용 선검사 — 제가 쓴 한 번 코드는 트랜잭션이 'already' 로 이어 준다 */
  if (!invite) return { ok: false, error: 'expired' };
  if (!inviteUsable(invite, new Date()) && invite.usedById !== user.id) return { ok: false, error: invite.usedAt ? 'used' : 'expired' };
  /*
   * 스태프(코치) 코드는 어느 계정이든 받는다(2026-11-01 교정 F03 — 코치인가는 계정 종류가 아니라 조직 역할). 소유자(MASTER 역할) 코드는 없다.
   * 마스터 계정엔 내 싱커가 없다(결정 3) — 선수로도 뛰는 코치는 선수 계정을 따로 쓴다(계약 8-2)
   */
  if (invite.role === 'MASTER') return { ok: false, error: 'staff' };
  if (invite.role === 'PLAYER' && user.accountType === 'MASTER') return { ok: false, error: 'master' };

  try {
    const r = await prisma.$transaction((tx) => redeemInviteTx(tx, { inviteId: invite.id, user, consent, now: new Date() }));
    return { ok: true, orgId: r.orgId, memberId: r.memberId, role: r.role, outcome: r.outcome };
  } catch (e) {
    if (e instanceof MembershipConflict) return { ok: false, error: e.reason };
    throw e;
  }
}
