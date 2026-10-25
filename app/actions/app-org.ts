'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, isMasterUser } from '@/lib/dal';
import { appNow } from '@/lib/clock';
import { toDateKey } from '@/lib/pitch-stats';
import { dbDate } from '@/lib/nutrition/days';
import { memberScope, orgsFor } from '@/lib/org/access';
import { CONSENT_SCOPES, type Consent, type OrgKind } from '@/lib/org/rules';
import { ARM_MISSING_TEXT, armUnknown, type CoachArmStatus } from '@/lib/org/arm-view';
import { joinWithCode } from '@/lib/org/join';
import { loadMember, loadPlayers, memberCardOf, pitcherBoardOf, type MemberCard } from '@/lib/org/player-data';

/**
 * 아이폰 앱(native/src/app/org/*)의 팀 · 레슨장 공간 — 1단계(docs/designs/sinker-team-lesson-contract.md 2-1).
 * 웹 마스터 화면(app/(master))의 폼 동작과 달리 JSON 인자 · JSON 답이고, 지금 보는 조직은 쿠키가 아니라 인자(orgId)로 받는다.
 * 코치 쪽은 마스터 계정 · 관리자만(isMasterUser) + 그 조직을 볼 권한(orgsFor). 선수 쪽은 제 회원 줄(userId 가 나)만.
 * 공유 동의가 끈 범위는 서버에서 아예 읽지 않는다(lib/org/player-data.ts memberCardOf). /api/rpc/app-org.<함수> 로 부른다.
 */

type OrgRole = 'MASTER' | 'STAFF' | 'PLAYER';

export type MySpace = {
  orgId: string;
  kind: OrgKind;
  name: string;
  role: OrgRole;
  /** 선수 쪽 회원 줄(OrgMember.id) — 코치 쪽은 null */
  memberId: string | null;
  /** 계정이 이어졌는데 공유 범위를 아직 안 고름(예약 확정으로 연결된 회원) */
  consentPending: boolean;
  /** 떠난 조직 — 받은 일지만 읽기로 남는다(결정 8) */
  left: boolean;
};

/** 팔 상태 한 줄 — missing 은 못 읽은 까닭 글(lib/org/arm-view.ts ARM_MISSING_TEXT, 앱이 엔진 파일을 안 싣게 서버에서 글로) */
export type ArmLine = { level: CoachArmStatus['level']; unknown: boolean; headline: string; missing: string[] };

const armLine = (s: CoachArmStatus): ArmLine => ({
  level: s.level,
  unknown: armUnknown(s),
  headline: s.headline,
  missing: s.missing.map((m) => ARM_MISSING_TEXT[m]),
});

/** 로그인한 사람의 공간 — 마스터 계정은 내 싱커가 없다(결정 3), 코치로 든 조직과 선수로 든 조직을 함께 */
export async function loadMySpaces(): Promise<{ ok: false; to: string } | { ok: true; hasSinker: boolean; spaces: MySpace[] }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, to: '/login' };
  /* 관리자도 제가 만들었거나 코치로 든 조직만 — 웹 orgsFor 처럼 모든 조직(더미 코치 포함)을 고르개에 늘어놓지 않는다 */
  const [coachOrgs, memberships] = await Promise.all([
    isMasterUser(user)
      ? prisma.org.findMany({
          where: {
            OR: [
              { ownerId: user.id },
              { members: { some: { userId: user.id, role: { in: ['MASTER', 'STAFF'] }, status: 'ACTIVE' } } },
            ],
          },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            kind: true,
            name: true,
            ownerId: true,
            members: { where: { userId: user.id }, select: { role: true } },
          },
        })
      : [],
    prisma.orgMember.findMany({
      where: { userId: user.id, role: 'PLAYER', status: { in: ['ACTIVE', 'LEFT'] } },
      orderBy: { joinedAt: 'asc' },
      select: {
        id: true,
        status: true,
        consent: { select: { memberId: true } },
        org: { select: { id: true, kind: true, name: true } },
      },
    }),
  ]);
  const spaces: MySpace[] = [
    ...coachOrgs.map((o) => ({
      orgId: o.id,
      kind: o.kind,
      name: o.name,
      role: (o.ownerId === user.id ? 'MASTER' : (o.members[0]?.role ?? 'STAFF')) as OrgRole,
      memberId: null,
      consentPending: false,
      left: false,
    })),
    ...memberships.map((m) => ({
      orgId: m.org.id,
      kind: m.org.kind,
      name: m.org.name,
      role: 'PLAYER' as const,
      memberId: m.id,
      consentPending: m.status === 'ACTIVE' && !m.consent,
      left: m.status === 'LEFT',
    })),
  ];
  return { ok: true, hasSinker: user.accountType !== 'MASTER', spaces };
}

/* ── 코치 쪽 ── */

/** 볼 권한이 없거나 없는 곳 — 앱(useLoad)은 to 로 보낸다. 마스터 계정은 /today 가 다시 /manage(→ 앱 /org)로 */
const NO_ACCESS = { ok: false as const, to: '/today' };

async function coachOrg(orgId: string) {
  const user = await getCurrentUser();
  if (!user || !isMasterUser(user)) return null;
  const org = (await orgsFor(user)).find((o) => o.id === orgId);
  return org ? { user, org } : null;
}

export type OrgToday = {
  org: { id: string; kind: OrgKind; name: string };
  todayKey: string;
  events: { id: string; time: string | null; kind: string; title: string; memberId: string | null; memberName: string | null }[];
  counts: { members: number; pending: number; placeholders: number };
  /** 팔 상태가 주의 · 위험인 회원 — 위험부터 */
  alerts: ({ memberId: string; nickname: string } & ArmLine)[];
};

/** 코치 '오늘' — 오늘 조직 일정 · 공유 대기 회원 수 · 팔 상태 주의 회원 */
export async function loadOrgToday(orgId: string): Promise<{ ok: false; to: string } | ({ ok: true } & OrgToday)> {
  const c = await coachOrg(orgId);
  if (!c) return NO_ACCESS;
  const now = appNow();
  const todayKey = toDateKey(now);
  const [events, members, board] = await Promise.all([
    prisma.orgEvent.findMany({
      where: { orgId, date: dbDate(todayKey) },
      orderBy: [{ time: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, time: true, kind: true, title: true, memberId: true },
    }),
    loadPlayers(orgId),
    pitcherBoardOf(orgId, now),
  ]);
  const nameOf = new Map(members.map((m) => [m.id, m.nickname]));
  return {
    ok: true,
    org: { id: c.org.id, kind: c.org.kind, name: c.org.name },
    todayKey,
    events: events.map((e) => ({ ...e, memberName: e.memberId ? (nameOf.get(e.memberId) ?? null) : null })),
    counts: {
      members: members.length,
      pending: members.filter((m) => m.user && !m.consent).length,
      placeholders: members.filter((m) => !m.user).length,
    },
    alerts: board.rows
      .filter((r) => r.status.level !== 'safe')
      .map((r) => ({ memberId: r.memberId, nickname: r.nickname, ...armLine(r.status) })),
  };
}

export type OrgMemberRow = {
  memberId: string;
  nickname: string;
  tags: string[];
  hasUser: boolean;
  consentPending: boolean;
  /** 투구 공유를 켠 회원만 — 나머지는 null */
  arm: ArmLine | null;
};

/** 코치 '회원' — 활동 중인 회원 전부, 이름순 */
export async function loadOrgMembers(orgId: string): Promise<{ ok: false; to: string } | { ok: true; kind: OrgKind; members: OrgMemberRow[] }> {
  const c = await coachOrg(orgId);
  if (!c) return NO_ACCESS;
  const [members, board] = await Promise.all([loadPlayers(orgId), pitcherBoardOf(orgId, appNow())]);
  const armOf = new Map(board.rows.map((r) => [r.memberId, armLine(r.status)]));
  return {
    ok: true,
    kind: c.org.kind,
    members: members.map((m) => ({
      memberId: m.id,
      nickname: m.nickname,
      tags: m.tags,
      hasUser: !!m.user,
      consentPending: !!m.user && !m.consent,
      arm: armOf.get(m.id) ?? null,
    })),
  };
}

export type LessonNoteView = {
  id: string;
  key: string;
  body: string;
  homework: string | null;
  pitchCount: number | null;
  intensity: number | null;
  author: string | null;
};

async function notesOf(memberId: string, take: number): Promise<LessonNoteView[]> {
  const notes = await prisma.lessonNote.findMany({
    where: { memberId },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take,
    select: { id: true, date: true, body: true, homework: true, pitchCount: true, intensity: true, authorId: true },
  });
  const authors = await prisma.user.findMany({
    where: { id: { in: [...new Set(notes.map((n) => n.authorId))] } },
    select: { id: true, nickname: true },
  });
  const nameOf = new Map(authors.map((a) => [a.id, a.nickname]));
  return notes.map((n) => ({
    id: n.id,
    key: n.date.toISOString().slice(0, 10),
    body: n.body,
    homework: n.homework,
    pitchCount: n.pitchCount,
    intensity: n.intensity,
    author: nameOf.get(n.authorId) ?? null,
  }));
}

/** 코치 '회원 카드' — 공유한 항목만(card 의 각 칸이 null 이면 공유 안 함) · 일지 */
export async function loadMemberCard(
  orgId: string,
  memberId: string
): Promise<
  | { ok: false; to: string }
  | {
      ok: true;
      kind: OrgKind;
      member: { id: string; nickname: string; tags: string[]; memo: string | null; hasUser: boolean; consentPending: boolean };
      scope: Consent;
      card: MemberCard | null;
      notes: LessonNoteView[];
    }
> {
  const c = await coachOrg(orgId);
  if (!c) return NO_ACCESS;
  const member = await loadMember(orgId, memberId);
  if (!member || member.role !== 'PLAYER' || member.status !== 'ACTIVE') return NO_ACCESS;
  const [card, notes] = await Promise.all([memberCardOf(member, appNow()), notesOf(member.id, 20)]);
  return {
    ok: true,
    kind: c.org.kind,
    member: {
      id: member.id,
      nickname: member.nickname,
      tags: member.tags,
      memo: member.memo,
      hasUser: !!member.user,
      consentPending: !!member.user && !member.consent,
    },
    scope: memberScope(member.consent, !!member.user),
    card,
    notes,
  };
}

/** 지금 쓸 수 있는 회원 초대 코드(가장 늦게 끝나는 것) — 만들기는 웹과 같은 org.createInvite(폼) */
export async function loadInvite(orgId: string): Promise<{ ok: false; to: string } | { ok: true; code: string | null; until: string | null }> {
  const c = await coachOrg(orgId);
  if (!c) return NO_ACCESS;
  const invite = await prisma.orgInvite.findFirst({
    where: { orgId, role: 'PLAYER', expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: 'desc' },
    select: { code: true, expiresAt: true },
  });
  return { ok: true, code: invite?.code ?? null, until: invite ? toDateKey(invite.expiresAt) : null };
}

/* ── 선수 쪽 ── */

async function myMember(memberId: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const m = await prisma.orgMember.findFirst({
    where: { id: memberId, userId: user.id, role: 'PLAYER' },
    select: {
      id: true,
      status: true,
      consent: { select: { pitch: true, training: true, checkin: true, video: true, nutrition: true, weight: true } },
      org: { select: { id: true, kind: true, name: true } },
    },
  });
  return m ? { user, m } : null;
}

/** 선수 '받은 일지' — 조직 이름 · 지금 공유 범위 · 받은 일지. 떠난 조직도 일지는 읽기만으로 남는다(결정 8) */
export async function loadMyMembership(memberId: string): Promise<
  | { ok: false; to: string }
  | {
      ok: true;
      org: { id: string; kind: OrgKind; name: string };
      left: boolean;
      consentPending: boolean;
      scope: Consent | null;
      notes: LessonNoteView[];
    }
> {
  const r = await myMember(memberId);
  if (!r) return NO_ACCESS;
  return {
    ok: true,
    org: r.m.org,
    left: r.m.status === 'LEFT',
    consentPending: r.m.status === 'ACTIVE' && !r.m.consent,
    scope: r.m.consent,
    notes: await notesOf(r.m.id, 50),
  };
}

/** 앱에서 받은 값을 동의로 — 모르는 칸은 버리고 없는 칸은 끔 */
function readConsent(raw: unknown): Consent {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = {} as Consent;
  for (const s of CONSENT_SCOPES) out[s.key] = src[s.key] === true;
  return out;
}

/** 공유 범위 저장 — 첫 저장이 동의다. 떠난 조직에는 저장하지 않는다 */
export async function saveConsent(memberId: string, consent: unknown): Promise<{ ok: boolean; error?: string }> {
  const r = await myMember(memberId);
  if (!r) return { ok: false, error: '회원 정보를 찾을 수 없어요.' };
  if (r.m.status !== 'ACTIVE') return { ok: false, error: '떠난 곳이에요.' };
  const value = readConsent(consent);
  await prisma.shareConsent.upsert({
    where: { memberId },
    update: { ...value, byUserId: r.user.id },
    create: { memberId, ...value, byUserId: r.user.id },
  });
  revalidatePath('/manage', 'layout');
  return { ok: true };
}

/** 조직 떠나기 — 상태만 LEFT. 받은 일지는 남고(결정 8), 조직은 이 뒤의 개인 기록을 못 본다(memberCardOf · loadPlayers 가 ACTIVE 만) */
export async function leaveOrg(memberId: string): Promise<{ ok: boolean; error?: string }> {
  const r = await myMember(memberId);
  if (!r) return { ok: false, error: '회원 정보를 찾을 수 없어요.' };
  if (r.m.status === 'LEFT') return { ok: true };
  await prisma.orgMember.update({ where: { id: memberId }, data: { status: 'LEFT', leftAt: new Date() } });
  revalidatePath('/manage', 'layout');
  return { ok: true };
}

const JOIN_ERROR: Record<'code' | 'expired' | 'staff', string> = {
  code: '초대 코드 여섯 글자를 확인해 주세요.',
  expired: '코드가 맞지 않거나 기한이 지났어요. 코치에게 새 코드를 받아 주세요.',
  staff: '코치 초대 코드예요. 선수 코드를 받아 주세요.',
};

/** 초대 코드로 들어가기 — 공유 범위를 함께 고른다(웹 joinOrg 와 같은 lib/org/join.ts) */
export async function joinOrgApp(
  code: string,
  consent: unknown
): Promise<{ ok: true; orgId: string; memberId: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const res = await joinWithCode(user, code, readConsent(consent));
  if (!res.ok) return { ok: false, error: JOIN_ERROR[res.error] };
  revalidatePath('/manage', 'layout');
  return res;
}
