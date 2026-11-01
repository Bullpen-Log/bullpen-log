import type { OrgRole } from '@/lib/org/capabilities';
import type { Consent } from '@/lib/org/rules';

/**
 * 조직 회원 줄의 전이 규칙(2026-11-01 2차 검토 G02 · G03) — 초대 코드 받기(lib/org/join.ts)와 예약 확정의 선수 등록(lib/org/booking-transitions.ts)이
 * 같은 표를 쓴다. 순수 규칙 + 트랜잭션 모양(TS 구조 타입)이라 셀프테스트가 메모리 트랜잭션으로 돌린다(scripts/org-selftest.mts).
 *
 * 원칙
 *   - 역할 · 상태를 **트랜잭션 안에서** 읽고 정한다. 선수 초대 · 레슨 등록은 나간(LEFT) 코치 · 소유자의 권한을 되살리지 않는다 — 그 줄은 선수로
 *     다시 들어온다(역할 PLAYER, 결과 'rejoined'). 활동 중인 코치 · 소유자를 선수로 몰래 내리지도 않는다 — 명시적 role_conflict.
 *   - 코치 임명은 감독이 만든 STAFF 코드로만. 활동 중인 선수 줄 하나로는 '선수 + 코치'를 못 적는다(OrgMember.role 하나) — role_conflict 로 알린다.
 *     (선수 + 운영 업무를 더하는 길은 M-A 위임 표 뒤 — stage0 5절.)
 *   - 한 번 쓰는 코드(STAFF · 가입 전 자리)는 트랜잭션 안의 조건부 갱신(usedAt null · 기한 · 역할 · 조직)으로 **한 사람만** 받는다. 같은 사람이 답을
 *     못 받아 다시 넣으면 제 회원 줄로 이어 준다('already'). 회원 전이가 실패하면 코드 차지도 같이 되돌아간다(한 트랜잭션).
 *   - 가입 전 자리(memberId)는 userId null 조건부 갱신으로만 이어받는다 — 남이 이은 자리를 덮지 않는다.
 *   - 선수(회원) 코드(memberId 없음)는 기한까지 여럿이 쓴다 — 차지하지 않고 기한 · 역할만 트랜잭션 안에서 다시 본다.
 */

export type MemberStatus = 'ACTIVE' | 'LEFT' | 'INVITED';
export type Existing = { id: string; role: OrgRole; status: MemberStatus } | null;
/** 들어오려는 자격 — 선수(초대 · 레슨 등록) 또는 코치 임명(STAFF 코드) */
export type Incoming = 'PLAYER' | 'STAFF';

export type MembershipPlan =
  | { action: 'create'; role: Incoming }
  | { action: 'none' }
  | { action: 'reactivate'; role: Incoming; outcome: 'rejoined' | 'appointed' }
  | { action: 'conflict' };

/** 전이 표 — 순수 */
export function planMembership(existing: Existing, incoming: Incoming): MembershipPlan {
  if (!existing) return { action: 'create', role: incoming };
  const { role, status } = existing;
  if (role === 'MASTER') {
    /* 소유자 줄은 바꾸지 않는다 — 활동 중인 소유자가 STAFF 코드를 넣으면 할 일 없음(코드도 안 쓴다), 그 밖은 모두 충돌 */
    return status === 'ACTIVE' && incoming === 'STAFF' ? { action: 'none' } : { action: 'conflict' };
  }
  if (incoming === 'PLAYER') {
    if (status === 'ACTIVE') return role === 'PLAYER' ? { action: 'none' } : { action: 'conflict' };
    /* 나간 선수의 재합류 · 나간 코치의 선수 재합류 — 둘 다 PLAYER 로. 코치 권한은 되살리지 않는다(G02) */
    return { action: 'reactivate', role: 'PLAYER', outcome: 'rejoined' };
  }
  /* incoming STAFF */
  if (status === 'ACTIVE') return role === 'STAFF' ? { action: 'none' } : { action: 'conflict' };
  return { action: 'reactivate', role: 'STAFF', outcome: 'appointed' };
}

/* ── 트랜잭션 모양 ── */
type MemberRow = { id: string; role: OrgRole; status: MemberStatus };
export type MembershipTx = {
  orgMember: {
    findUnique(a: { where: { orgId_userId: { orgId: string; userId: string } }; select: { id: true; role: true; status: true } }): Promise<MemberRow | null>;
    /** 가입 전 자리 이어받기(userId null 조건) · 재합류 — 조건부라 count 로 결과를 본다 */
    updateMany(a: {
      where: { id: string; orgId: string; userId?: null; status?: MemberStatus };
      data: { userId?: string; role?: OrgRole; status: 'ACTIVE'; leftAt: null; joinedAt: Date };
    }): Promise<{ count: number }>;
    create(a: { data: { orgId: string; userId: string; role: OrgRole; status: 'ACTIVE'; nickname: string }; select: { id: true } }): Promise<{ id: string }>;
  };
};
export type InviteTx = MembershipTx & {
  orgInvite: {
    findUnique(a: {
      where: { id: string };
      select: { id: true; orgId: true; role: true; memberId: true; expiresAt: true; usedAt: true; usedById: true };
    }): Promise<{ id: string; orgId: string; role: OrgRole; memberId: string | null; expiresAt: Date; usedAt: Date | null; usedById: string | null } | null>;
    updateMany(a: {
      where: { id: string; orgId: string; role: OrgRole; usedAt: null; expiresAt: { gt: Date } };
      data: { usedById: string; usedAt: Date };
    }): Promise<{ count: number }>;
  };
  shareConsent: {
    upsert(a: { where: { memberId: string }; update: Consent & { byUserId: string }; create: Consent & { memberId: string; byUserId: string } }): Promise<unknown>;
  };
};

/** 회원 전이가 트랜잭션을 되돌려야 할 때 던진다 — 부르는 쪽이 잡아 typed 답으로 */
export type ConflictReason = 'role_conflict' | 'used' | 'expired' | 'conflict';
export class MembershipConflict extends Error {
  readonly reason: ConflictReason;
  constructor(reason: ConflictReason) {
    super(`membership:${reason}`);
    this.name = 'MembershipConflict';
    this.reason = reason;
  }
}

export type EnrollResult = { memberId: string; role: OrgRole; outcome: 'joined' | 'rejoined' | 'appointed' | 'already'; existed: boolean };

/**
 * 회원 줄 전이를 실행한다 — 트랜잭션 안에서 역할 · 상태를 읽고 표대로. 충돌이면 MembershipConflict('role_conflict') 를 던진다(되돌림).
 * placeholderId: 코치가 만든 가입 전 자리 — 아직 아무도 안 이었을 때만(userId null) 이어받고, 이미 남이 이었으면 새 줄을 만들지 않고 conflict.
 */
export async function enrollMemberTx(
  tx: MembershipTx,
  a: { orgId: string; user: { id: string; nickname: string }; incoming: Incoming; placeholderId?: string | null; now: Date }
): Promise<EnrollResult> {
  const existing = await tx.orgMember.findUnique({
    where: { orgId_userId: { orgId: a.orgId, userId: a.user.id } },
    select: { id: true, role: true, status: true },
  });
  const plan = planMembership(existing, a.incoming);
  if (plan.action === 'conflict') throw new MembershipConflict('role_conflict');
  if (plan.action === 'none') return { memberId: existing!.id, role: existing!.role, outcome: 'already', existed: true };
  if (plan.action === 'reactivate') {
    const r = await tx.orgMember.updateMany({
      where: { id: existing!.id, orgId: a.orgId, status: existing!.status },
      data: { role: plan.role, status: 'ACTIVE', leftAt: null, joinedAt: a.now },
    });
    if (r.count !== 1) throw new MembershipConflict('conflict');
    return { memberId: existing!.id, role: plan.role, outcome: plan.outcome, existed: true };
  }
  if (a.placeholderId) {
    const r = await tx.orgMember.updateMany({
      where: { id: a.placeholderId, orgId: a.orgId, userId: null },
      data: { userId: a.user.id, status: 'ACTIVE', leftAt: null, joinedAt: a.now },
    });
    if (r.count === 1) return { memberId: a.placeholderId, role: 'PLAYER', outcome: 'joined', existed: false };
    /* 자리를 남이 이었다(또는 없다) — 코드 차지는 되돌린다. 코치가 자리를 다시 만들어 새 코드를 준다 */
    throw new MembershipConflict('conflict');
  }
  const created = await tx.orgMember.create({
    data: { orgId: a.orgId, userId: a.user.id, role: plan.role, status: 'ACTIVE', nickname: a.user.nickname },
    select: { id: true },
  });
  return { memberId: created.id, role: plan.role, outcome: 'joined', existed: false };
}

export type RedeemResult = { ok: true; orgId: string; memberId: string; role: OrgRole; outcome: EnrollResult['outcome'] };

/**
 * 초대 코드 받기 — 한 트랜잭션: 초대를 다시 읽고(기한 · 역할 · 취소) → 한 번 쓰는 코드면 조건부로 차지 → 회원 전이 → 선수면 공유 동의.
 * 던지는 MembershipConflict: used(남이 먼저 썼다) · expired(기한 · 지워진 코드) · role_conflict · conflict(자리 충돌 · 전이 경합). 모두 되돌림.
 * 같은 사람의 재시도(답을 못 받고 다시 넣음): 코드가 제가 쓴 것이면 제 회원 줄로 'already'.
 */
export async function redeemInviteTx(
  tx: InviteTx,
  a: { inviteId: string; user: { id: string; nickname: string }; consent: Consent; now: Date }
): Promise<RedeemResult> {
  const invite = await tx.orgInvite.findUnique({
    where: { id: a.inviteId },
    select: { id: true, orgId: true, role: true, memberId: true, expiresAt: true, usedAt: true, usedById: true },
  });
  if (!invite || invite.role === 'MASTER') throw new MembershipConflict('expired');
  if (invite.expiresAt.getTime() <= a.now.getTime()) throw new MembershipConflict('expired');
  const singleUse = invite.role !== 'PLAYER' || !!invite.memberId;
  const incoming: Incoming = invite.role === 'STAFF' ? 'STAFF' : 'PLAYER';
  let placeholderId = invite.memberId;
  if (singleUse) {
    if (invite.usedAt) {
      /* 같은 사람이 다시 넣었나 — 제 줄이 있으면 그것으로. 남이 썼으면 used */
      if (invite.usedById !== a.user.id) throw new MembershipConflict('used');
      const mine = await tx.orgMember.findUnique({ where: { orgId_userId: { orgId: invite.orgId, userId: a.user.id } }, select: { id: true, role: true, status: true } });
      if (!mine || mine.status !== 'ACTIVE') throw new MembershipConflict('used');
      return { ok: true, orgId: invite.orgId, memberId: mine.id, role: mine.role, outcome: 'already' };
    }
    const claimed = await tx.orgInvite.updateMany({
      where: { id: invite.id, orgId: invite.orgId, role: invite.role, usedAt: null, expiresAt: { gt: a.now } },
      data: { usedById: a.user.id, usedAt: a.now },
    });
    if (claimed.count !== 1) throw new MembershipConflict('used');
  }
  /* 이미 제 줄이 있으면 자리는 안 이어받는다(기존 줄이 이긴다 — 자리는 코치가 정리) */
  const existing = await tx.orgMember.findUnique({ where: { orgId_userId: { orgId: invite.orgId, userId: a.user.id } }, select: { id: true, role: true, status: true } });
  if (existing) placeholderId = null;
  const m = await enrollMemberTx(tx, { orgId: invite.orgId, user: a.user, incoming, placeholderId, now: a.now });
  /* 공유 동의는 선수 자격에만 — 코치 임명은 기록 공유 동의가 아니다(G01) */
  if (m.role === 'PLAYER' && m.outcome !== 'already')
    await tx.shareConsent.upsert({
      where: { memberId: m.memberId },
      update: { ...a.consent, byUserId: a.user.id },
      create: { memberId: m.memberId, ...a.consent, byUserId: a.user.id },
    });
  return { ok: true, orgId: invite.orgId, memberId: m.memberId, role: m.role, outcome: m.outcome };
}
