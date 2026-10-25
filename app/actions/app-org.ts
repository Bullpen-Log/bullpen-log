'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, isMasterUser } from '@/lib/dal';
import { appNow } from '@/lib/clock';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { dbDate } from '@/lib/nutrition/days';
import { memberScope } from '@/lib/org/access';
import { CONSENT_SCOPES, type Consent, type OrgKind } from '@/lib/org/rules';
import { ARM_MISSING_TEXT, armUnknown, type CoachArmStatus } from '@/lib/org/arm-view';
import { joinWithCode } from '@/lib/org/join';
import { createInviteCode } from '@/lib/org/invite';
import { loadMember, loadPlayers, memberCardOf, pitcherBoardOf, type MemberCard } from '@/lib/org/player-data';
import { coachOrg, myMember } from '@/lib/org/app-access';
import { formatExercise, readExercises } from '@/lib/org/lesson-work';
import { noteKey } from '@/lib/org/lesson-pitch';

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


export type OrgToday = {
  org: { id: string; kind: OrgKind; name: string };
  todayKey: string;
  events: { id: string; time: string | null; kind: string; title: string; status: string; memberId: string | null; memberName: string | null }[];
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
      select: { id: true, time: true, kind: true, title: true, status: true, memberId: true },
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
  /** 코치가 투구를 대신 적을 수 있나 — 가입했고 투구 공유를 켬(app/actions/org-record.ts createPitchLogs 와 같은 선) */
  pitchOk: boolean;
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
      pitchOk: !!m.user && memberScope(m.consent, true).pitch,
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
  /** 보는 사람이 쓴 일지 — 지우기는 쓴 사람만(웹 org-notes.ts deleteLessonNote 와 같은 선) */
  mine: boolean;
  /** 던진 공이 선수 투구 기록에 어떻게 들어갔나(2단계) — 'own' 일지가 남김 · 'link' 선수 기록에 이음 · null 안 들어감 */
  pitchLog: 'own' | 'link' | null;
};

async function notesOf(memberId: string, take: number, viewerId: string): Promise<LessonNoteView[]> {
  const notes = await prisma.lessonNote.findMany({
    where: { memberId },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take,
    select: { id: true, date: true, body: true, homework: true, pitchCount: true, intensity: true, authorId: true, eventId: true },
  });
  const events = notes.map((n) => n.eventId).filter((e): e is string => !!e);
  const [authors, logs] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: [...new Set(notes.map((n) => n.authorId))] } },
      select: { id: true, nickname: true },
    }),
    prisma.pitchLog.findMany({
      where: { OR: [{ clientKey: { in: notes.map((n) => noteKey(n.id)) } }, ...(events.length ? [{ orgEventId: { in: events }, enteredById: null }] : [])] },
      select: { clientKey: true, orgEventId: true },
    }),
  ]);
  const nameOf = new Map(authors.map((a) => [a.id, a.nickname]));
  const ownKeys = new Set(logs.map((l) => l.clientKey));
  const linkedEvents = new Set(logs.filter((l) => !l.clientKey?.startsWith('note:')).map((l) => l.orgEventId));
  const pitchLogOf = (n: (typeof notes)[number]): LessonNoteView['pitchLog'] =>
    ownKeys.has(noteKey(n.id)) ? 'own' : n.eventId && linkedEvents.has(n.eventId) ? 'link' : null;
  return notes.map((n) => ({
    id: n.id,
    key: n.date.toISOString().slice(0, 10),
    body: n.body,
    homework: n.homework,
    pitchCount: n.pitchCount,
    intensity: n.intensity,
    author: nameOf.get(n.authorId) ?? null,
    mine: n.authorId === viewerId,
    pitchLog: pitchLogOf(n),
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
  const [card, notes] = await Promise.all([memberCardOf(member, appNow()), notesOf(member.id, 20, c.user.id)]);
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

export type InviteView = { code: string; until: string } | null;

async function liveInvite(orgId: string, role: 'PLAYER' | 'STAFF'): Promise<InviteView> {
  const invite = await prisma.orgInvite.findFirst({
    where: { orgId, role, memberId: null, expiresAt: { gt: new Date() }, ...(role === 'STAFF' ? { usedAt: null } : {}) },
    orderBy: { expiresAt: 'desc' },
    select: { code: true, expiresAt: true },
  });
  return invite ? { code: invite.code, until: toDateKey(invite.expiresAt) } : null;
}

/** 코치(스태프) 초대 코드는 만든 대표와 관리자만 — 코치는 코치를 못 부른다(웹 org.createInvite 와 같은 규칙) */
const canInviteCoach = (c: NonNullable<Awaited<ReturnType<typeof coachOrg>>>) => c.user.role === 'ADMIN' || c.org.ownerId === c.user.id;

/**
 * 지금 쓸 수 있는 초대 코드 — 회원(선수) 코드는 기한까지 여럿이, 코치 코드는 한 번 쓰면 끝(안 쓴 것만). 코치 코드 칸은 대표 · 관리자만 받는다.
 */
export async function loadInvite(
  orgId: string
): Promise<{ ok: false; to: string } | { ok: true; player: InviteView; staff: InviteView; canInviteCoach: boolean }> {
  const c = await coachOrg(orgId);
  if (!c) return NO_ACCESS;
  const coach = canInviteCoach(c);
  const [player, staff] = await Promise.all([liveInvite(orgId, 'PLAYER'), coach ? liveInvite(orgId, 'STAFF') : null]);
  return { ok: true, player, staff, canInviteCoach: coach };
}

/**
 * 초대 코드 만들기(앱) — 웹 설정의 org.createInvite 와 같은 lib/org/invite.ts. 앱의 폼 호출(rpcForm)은 늘 앞에 지난 상태(null)를 붙여
 * 폼 하나만 받는 createInvite 를 못 불렀다(2026-10-25 팀 관리자 '코드를 만들지 못했어요') — 그래서 JSON 동작을 따로 둔다.
 */
export async function makeInvite(
  orgId: string,
  role: unknown,
  /** 가입 전 자리(OrgMember.id) — 주면 그 자리를 이어받는 한 번 쓰는 회원 코드 */
  memberId?: string | null
): Promise<{ ok: true; code: string; until: string } | { ok: false; error: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  const r = role === 'STAFF' ? 'STAFF' : 'PLAYER';
  if (r === 'STAFF' && !canInviteCoach(c)) return { ok: false, error: '코치 초대는 대표만 할 수 있어요.' };
  if (memberId) {
    const spot = await prisma.orgMember.findFirst({ where: { id: memberId, orgId, userId: null, status: 'ACTIVE' }, select: { id: true } });
    if (!spot || r !== 'PLAYER') return { ok: false, error: '가입 전 자리를 찾을 수 없어요.' };
  }
  const made = await createInviteCode(orgId, r, memberId ?? null);
  if (!made) return { ok: false, error: '코드를 만들지 못했어요. 다시 해 주세요.' };
  revalidatePath('/manage/settings');
  return { ok: true, code: made.code, until: toDateKey(made.expiresAt) };
}

/* ── 일정 · 공지 · 회원 한 명 · 대신 적은 투구(1.5단계 — 쓰기는 웹과 같은 폼 동작을 앱이 그대로 부른다) ── */

export type OrgEventView = {
  id: string;
  date: string;
  time: string | null;
  kind: string;
  title: string;
  memo: string | null;
  /** 지도 활동 상태(2단계) — 'planned' · 'done' · 'canceled' */
  status: string;
  memberId: string | null;
  memberName: string | null;
};

/** 코치 '일정' — from 부터 days 날(최대 42). 레슨 회원 고르기용 회원 이름도 같이 */
export async function loadOrgEvents(
  orgId: string,
  fromKey: string,
  days: number
): Promise<{ ok: false; to: string } | { ok: true; kind: OrgKind; todayKey: string; members: { id: string; nickname: string }[]; events: OrgEventView[] }> {
  const c = await coachOrg(orgId);
  if (!c) return NO_ACCESS;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromKey) ? fromKey : toDateKey(appNow());
  const span = Math.min(42, Math.max(1, Math.floor(Number(days) || 7)));
  const [events, members] = await Promise.all([
    prisma.orgEvent.findMany({
      where: { orgId, date: { gte: dbDate(from), lte: dbDate(shiftDateKey(from, span - 1)) } },
      orderBy: [{ date: 'asc' }, { time: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, date: true, time: true, kind: true, title: true, memo: true, status: true, memberId: true },
    }),
    prisma.orgMember.findMany({
      where: { orgId, role: 'PLAYER', status: 'ACTIVE' },
      orderBy: { nickname: 'asc' },
      select: { id: true, nickname: true },
    }),
  ]);
  const nameOf = new Map(members.map((m) => [m.id, m.nickname]));
  return {
    ok: true,
    kind: c.org.kind,
    todayKey: toDateKey(appNow()),
    members,
    events: events.map((e) => ({ ...e, date: toDateKey(e.date), memberName: e.memberId ? (nameOf.get(e.memberId) ?? null) : null })),
  };
}

export type NoticeView = { id: string; title: string; body: string; pinned: boolean; key: string; author: string | null };

async function noticesOf(orgId: string, take: number): Promise<NoticeView[]> {
  const rows = await prisma.orgNotice.findMany({
    where: { orgId },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    take,
    select: { id: true, title: true, body: true, pinned: true, createdAt: true, authorId: true },
  });
  const authors = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.authorId).filter((a): a is string => !!a))] } },
    select: { id: true, nickname: true },
  });
  const nameOf = new Map(authors.map((a) => [a.id, a.nickname]));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    pinned: r.pinned,
    key: toDateKey(r.createdAt),
    author: r.authorId ? (nameOf.get(r.authorId) ?? null) : null,
  }));
}

/** 코치 '공지' — 고정 먼저, 새 것부터 */
export async function loadOrgNotices(orgId: string): Promise<{ ok: false; to: string } | { ok: true; notices: NoticeView[] }> {
  const c = await coachOrg(orgId);
  if (!c) return NO_ACCESS;
  return { ok: true, notices: await noticesOf(orgId, 50) };
}

/** 회원 고치기 화면 — 조직 안 이름 · 태그 · 메모, 가입 전 자리인가 */
export async function loadOrgMember(
  orgId: string,
  memberId: string
): Promise<{ ok: false; to: string } | { ok: true; member: { id: string; nickname: string; tags: string[]; memo: string | null; hasUser: boolean } }> {
  const c = await coachOrg(orgId);
  if (!c) return NO_ACCESS;
  const m = await prisma.orgMember.findFirst({
    where: { id: memberId, orgId, role: 'PLAYER', status: 'ACTIVE' },
    select: { id: true, nickname: true, tags: true, memo: true, userId: true },
  });
  if (!m) return NO_ACCESS;
  return { ok: true, member: { id: m.id, nickname: m.nickname, tags: m.tags, memo: m.memo, hasUser: m.userId != null } };
}

/** 이 조직에서 코치가 대신 적은 투구 — 새 것부터 15줄(잘못 적었으면 지우기, 웹 org-record.ts deleteProxyPitchLog) */
export async function loadProxyLogs(
  orgId: string
): Promise<{ ok: false; to: string } | { ok: true; logs: { id: string; key: string; nickname: string; sessionType: string; pitchCount: number; effortPct: number | null }[] }> {
  const c = await coachOrg(orgId);
  if (!c) return NO_ACCESS;
  const [logs, members] = await Promise.all([
    prisma.pitchLog.findMany({
      /* 일지가 만든 줄(clientKey note:…)은 일지에서 고치고 지운다 */
      where: { orgId, enteredById: { not: null }, OR: [{ clientKey: null }, { NOT: { clientKey: { startsWith: 'note:' } } }] },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { id: true, userId: true, date: true, sessionType: true, pitchCount: true, effortPct: true },
    }),
    prisma.orgMember.findMany({ where: { orgId, userId: { not: null } }, select: { userId: true, nickname: true } }),
  ]);
  const nameOf = new Map(members.map((m) => [m.userId!, m.nickname]));
  return {
    ok: true,
    logs: logs.map((l) => ({
      id: l.id,
      key: toDateKey(l.date),
      nickname: nameOf.get(l.userId) ?? '떠난 회원',
      sessionType: l.sessionType,
      pitchCount: l.pitchCount,
      effortPct: l.effortPct,
    })),
  };
}

/* ── 일지 쓰기 · 고치기(2단계) ── */

export type DayPitchLog = { id: string; sessionType: string; pitchCount: number; effortPct: number | null };

/**
 * 일지에 던진 공을 적을 때 — 선수 투구 기록에 쓸 수 있나(가입 · 투구 공유), 그날 선수가 직접 남긴 기록(이을 후보).
 * 같은 공을 두 번 세지 않게 코치가 그 줄에 잇거나 '따로 던진 공'을 고른다(lib/org/lesson-pitch.ts planNotePitch).
 */
export async function loadNotePitchDay(
  orgId: string,
  memberId: string,
  dateKey: string
): Promise<{ ok: false; to: string } | { ok: true; canWrite: boolean; why: string | null; logs: DayPitchLog[] }> {
  const c = await coachOrg(orgId);
  if (!c) return NO_ACCESS;
  const m = await prisma.orgMember.findFirst({
    where: { id: memberId, orgId, role: 'PLAYER', status: 'ACTIVE' },
    select: { userId: true, consent: { select: { pitch: true, training: true, checkin: true, video: true, nutrition: true, weight: true } } },
  });
  if (!m) return NO_ACCESS;
  if (!m.userId) return { ok: true, canWrite: false, why: '가입 전 자리라 던진 공은 일지에만 남아요.', logs: [] };
  if (!memberScope(m.consent, true).pitch) return { ok: true, canWrite: false, why: '투구 기록 공유를 안 켜서 던진 공은 일지에만 남아요.', logs: [] };
  const day = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : toDateKey(appNow());
  const logs = await prisma.pitchLog.findMany({
    where: { userId: m.userId, date: dbDate(day), enteredById: null, pitchCount: { gt: 0 } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, sessionType: true, pitchCount: true, effortPct: true },
  });
  return { ok: true, canWrite: true, why: null, logs };
}

/** 일지 고치기 화면 — 적은 값 그대로 + 던진 공이 지금 어디에 들어가 있나(link: 'new' 일지가 남김 · 선수 기록 id · '' 안 들어감) */
export async function loadLessonNote(
  orgId: string,
  noteId: string
): Promise<
  | { ok: false; to: string }
  | {
      ok: true;
      note: {
        id: string;
        memberId: string;
        key: string;
        body: string;
        homework: string | null;
        exercises: string;
        pitchCount: number | null;
        intensity: number | null;
        sessionType: string;
        link: string;
      };
    }
> {
  const c = await coachOrg(orgId);
  if (!c) return NO_ACCESS;
  const n = await prisma.lessonNote.findFirst({
    where: { id: noteId, member: { orgId } },
    select: { id: true, memberId: true, date: true, body: true, homework: true, exercises: true, pitchCount: true, intensity: true, eventId: true, member: { select: { userId: true } } },
  });
  if (!n) return NO_ACCESS;
  const userId = n.member.userId;
  const [own, linked] = userId
    ? await Promise.all([
        prisma.pitchLog.findUnique({ where: { userId_clientKey: { userId, clientKey: noteKey(n.id) } }, select: { sessionType: true } }),
        n.eventId ? prisma.pitchLog.findFirst({ where: { userId, orgEventId: n.eventId, enteredById: null }, select: { id: true, sessionType: true } }) : null,
      ])
    : [null, null];
  return {
    ok: true,
    note: {
      id: n.id,
      memberId: n.memberId,
      key: toDateKey(n.date),
      body: n.body === '(숙제만)' ? '' : n.body,
      homework: n.homework,
      exercises: readExercises(n.exercises).map(formatExercise).join('\n'),
      pitchCount: n.pitchCount,
      intensity: n.intensity,
      sessionType: own?.sessionType ?? linked?.sessionType ?? '불펜',
      link: own ? 'new' : linked ? linked.id : '',
    },
  };
}

/* ── 선수 쪽 ── */


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
      notices: NoticeView[];
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
    notes: await notesOf(r.m.id, 50, r.user.id),
    notices: await noticesOf(r.m.org.id, 10),
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
