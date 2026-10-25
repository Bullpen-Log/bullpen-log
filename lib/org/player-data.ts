import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { groupByDay, shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { dbDate } from '@/lib/nutrition/days';
import { gatherFactsAndPlan } from '@/lib/report/gather';
import { armStatusOf, type ArmLevel, type ArmStatus } from '@/lib/report/arm-status';
import { loadVelocityHistory } from '@/lib/velocity-load';
import { CHECKIN_PARTS, SHORT_SLEEP_QUALITY, hasPain, sleepQualityOf } from '@/lib/checkin';
import { loadActiveRehab } from '@/lib/armcare/rehab-store';
import { findArmcareArea } from '@/lib/armcare/anatomy';
import { createPlaybackUrls } from '@/lib/storage';
import { isPhoneVideoPath } from '@/lib/phone-video-path';
import { memberScope } from '@/lib/org/access';
import type { Consent } from '@/lib/org/rules';
import { coachArmStatusOf, type CoachArmStatus } from '@/lib/org/arm-view';

/**
 * 코치가 보는 선수(회원) 자료(2단계) — 선수 화면이 쓰는 같은 함수로 읽는다. 팔 상태는 lib/report/arm-status.ts armStatusOf(판정을 새로
 * 만들지 않는다), 구속은 lib/velocity-load.ts, 체크인 신호는 lib/checkin.ts. 공유 동의(ShareConsent)가 끈 범위는 아예 읽지 않는다 —
 * 화면에서 숨기는 것이 아니라 서버에서 안 읽는다.
 */

export const USER_FOR_FACTS = {
  id: true,
  nickname: true,
  birthDate: true,
  heightCm: true,
  baselineFreq: true,
  baselineVolume: true,
  baselineIntensity: true,
  trainingLevel: true,
} as const;

export const MEMBER_SELECT = {
  id: true,
  orgId: true,
  userId: true,
  role: true,
  status: true,
  nickname: true,
  tags: true,
  memo: true,
  joinedAt: true,
  consent: {
    select: { pitch: true, training: true, checkin: true, video: true, nutrition: true, weight: true },
  },
  user: { select: USER_FOR_FACTS },
} as const;

export type MemberWithUser = Prisma.OrgMemberGetPayload<{ select: typeof MEMBER_SELECT }>;
export type UserForFacts = Prisma.UserGetPayload<{ select: typeof USER_FOR_FACTS }>;

export async function loadMember(orgId: string, memberId: string): Promise<MemberWithUser | null> {
  return prisma.orgMember.findFirst({ where: { id: memberId, orgId }, select: MEMBER_SELECT });
}

/** 조직의 활동 중인 선수(회원) 전부 — 이름순 */
export async function loadPlayers(orgId: string): Promise<MemberWithUser[]> {
  return prisma.orgMember.findMany({
    where: { orgId, role: 'PLAYER', status: 'ACTIVE' },
    orderBy: { nickname: 'asc' },
    select: MEMBER_SELECT,
  });
}

/* ── 투구 — 최근 28일 ── */

export type PitchSummary = {
  /** 28일, 오래된 날부터 */
  days: { key: string; pitches: number }[];
  last7: number;
  last28: number;
  lastOuting: { key: string; pitches: number; sessionType: string } | null;
  /** 최근 기록 여섯 — 새 것부터 */
  logs: {
    id: string;
    key: string;
    sessionType: string;
    pitchCount: number;
    effortPct: number | null;
    intensity: number;
    maxVelocity: number | null;
    memo: string | null;
    byCoach: boolean;
  }[];
};

export async function pitchSummaryOf(userId: string, todayKey: string): Promise<PitchSummary> {
  const from = shiftDateKey(todayKey, -27);
  const logs = await prisma.pitchLog.findMany({
    where: { userId, date: { gte: dbDate(from), lte: dbDate(todayKey) } },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      date: true,
      sessionType: true,
      pitchCount: true,
      intensity: true,
      effortPct: true,
      maxVelocity: true,
      avgVelocity: true,
      memo: true,
      enteredById: true,
    },
  });
  const keyed = logs.map((l) => ({ ...l, key: l.date.toISOString().slice(0, 10) }));
  const byDay = groupByDay(
    keyed.map((l) => ({
      date: l.key,
      sessionType: l.sessionType,
      pitchCount: l.pitchCount,
      intensity: l.intensity,
      effortPct: l.effortPct,
      maxVelocity: l.maxVelocity,
      avgVelocity: l.avgVelocity,
    }))
  );
  const days = Array.from({ length: 28 }, (_, i) => {
    const key = shiftDateKey(from, i);
    return { key, pitches: byDay.get(key)?.pitchCount ?? 0 };
  });
  const last7 = days.slice(-7).reduce((a, d) => a + d.pitches, 0);
  const last28 = days.reduce((a, d) => a + d.pitches, 0);
  const thrownDays = days.filter((d) => d.pitches > 0);
  const lastDay = thrownDays[thrownDays.length - 1] ?? null;
  const lastOuting = lastDay
    ? {
        key: lastDay.key,
        pitches: lastDay.pitches,
        sessionType:
          [...keyed]
            .filter((l) => l.key === lastDay.key)
            .sort((a, b) => b.pitchCount - a.pitchCount)[0]?.sessionType ?? '',
      }
    : null;
  return {
    days,
    last7,
    last28,
    lastOuting,
    logs: [...keyed]
      .reverse()
      .slice(0, 6)
      .map((l) => ({
        id: l.id,
        key: l.key,
        sessionType: l.sessionType,
        pitchCount: l.pitchCount,
        effortPct: l.effortPct,
        intensity: l.intensity,
        maxVelocity: l.maxVelocity,
        memo: l.memo,
        byCoach: l.enteredById != null,
      })),
  };
}

/** 지금 팔 상태 — 선수 홈 · 투구 탭과 같은 함수(gatherFactsAndPlan → armStatusOf). 오늘 기록까지 넣는다 */
export async function armStatusFor(user: UserForFacts, now: Date): Promise<ArmStatus> {
  const g = await gatherFactsAndPlan(user, now);
  return armStatusOf(g.facts);
}

/** 코치 · 보호자가 보는 팔 상태 — 공유 안 한 범위는 판정에서 뺀다(lib/org/arm-view.ts) */
export async function coachArmStatusFor(user: UserForFacts, now: Date, scope: Consent): Promise<CoachArmStatus> {
  const g = await gatherFactsAndPlan(user, now);
  return coachArmStatusOf(g.facts, scope, toDateKey(now));
}

/* ── 구속 ── */

export type VelocitySummary = {
  /** 최근 세션 열둘, 오래된 것부터 */
  sessions: { key: string; max: number; avg: number; n: number }[];
  best: number | null;
  latest: { key: string; max: number; avg: number; n: number } | null;
  total: number;
};

export async function velocitySummaryOf(userId: string): Promise<VelocitySummary> {
  const hist = await loadVelocityHistory(userId);
  const sessions = hist.slice(-12).map((h) => ({ key: h.date, max: h.maxKmh, avg: h.avgKmh, n: h.n }));
  return {
    sessions,
    best: hist.length ? Math.max(...hist.map((h) => h.maxKmh)) : null,
    latest: sessions[sessions.length - 1] ?? null,
    total: hist.length,
  };
}

/* ── 체크인 ── */

export type CheckinToday = {
  condition: number;
  sleepQuality: number | null;
  shortSleep: boolean;
  painParts: string[];
  stiffParts: string[];
  note: string | null;
};

const CHECKIN_SELECT = {
  userId: true,
  condition: true,
  sleep: true,
  sleepQuality: true,
  sleepHours: true,
  shoulder: true,
  elbow: true,
  wrist: true,
  lowerBack: true,
  lowerBody: true,
  note: true,
} as const;

function readCheckin(c: Prisma.DailyCheckinGetPayload<{ select: typeof CHECKIN_SELECT }>): CheckinToday {
  const q = sleepQualityOf(c);
  return {
    condition: c.condition,
    sleepQuality: q,
    shortSleep: q != null && q <= SHORT_SLEEP_QUALITY,
    painParts: CHECKIN_PARTS.filter((p) => c[p.key] === '통증').map((p) => p.label),
    stiffParts: CHECKIN_PARTS.filter((p) => c[p.key] === '뻐근').map((p) => p.label),
    note: c.note,
  };
}

export async function checkinTodayOf(userId: string, todayKey: string): Promise<CheckinToday | null> {
  const c = await prisma.dailyCheckin.findFirst({ where: { userId, date: dbDate(todayKey) }, select: CHECKIN_SELECT });
  return c ? readCheckin(c) : null;
}

export type CheckinSummary = {
  asked: number;
  answered: number;
  pain: { userId: string; parts: string[] }[];
  shortSleep: string[];
  lowCondition: string[];
};

/** 팀 홈의 아침 체크인 요약 — 체크인 공유에 동의한 선수들의 오늘 줄만 */
export async function checkinSummaryOf(userIds: string[], todayKey: string): Promise<CheckinSummary> {
  if (userIds.length === 0) return { asked: 0, answered: 0, pain: [], shortSleep: [], lowCondition: [] };
  const rows = await prisma.dailyCheckin.findMany({
    where: { userId: { in: userIds }, date: dbDate(todayKey) },
    select: CHECKIN_SELECT,
  });
  const out: CheckinSummary = { asked: userIds.length, answered: rows.length, pain: [], shortSleep: [], lowCondition: [] };
  for (const r of rows) {
    const c = readCheckin(r);
    if (hasPain(r)) out.pain.push({ userId: r.userId, parts: c.painParts });
    if (c.shortSleep) out.shortSleep.push(r.userId);
    if (c.condition <= 4) out.lowCondition.push(r.userId);
  }
  return out;
}

/* ── 재활 ── */

export type RehabStatus = { area: string; stage: number; severity: string; startedOn: string };

export async function rehabStatusOf(userId: string): Promise<RehabStatus | null> {
  const r = await loadActiveRehab(userId);
  if (!r) return null;
  return {
    area: findArmcareArea(r.program.area)?.label ?? r.program.area,
    stage: r.program.stage,
    severity: r.program.severity,
    startedOn: r.program.startedOn,
  };
}

/* ── 영상 · 체중 ── */

export type Clip = { key: string; url: string };

/** 최근 투구 영상 넷 — 저장소 영상만(폰 안에 둔 영상은 주소가 없다). 구속 측정 클립은 그날 화면의 몫 */
export async function recentClipsOf(userId: string): Promise<Clip[]> {
  const logs = await prisma.pitchLog.findMany({
    where: { userId, videoPaths: { isEmpty: false } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 3,
    select: { date: true, videoPaths: true },
  });
  const paths = logs.flatMap((l) => l.videoPaths.filter((p) => !isPhoneVideoPath(p))).slice(0, 4);
  if (paths.length === 0) return [];
  const urls = await createPlaybackUrls(paths).catch(() => ({}) as Record<string, string>);
  return logs.flatMap((l) =>
    l.videoPaths
      .filter((p) => urls[p])
      .map((p) => ({ key: l.date.toISOString().slice(0, 10), url: urls[p] }))
  );
}

export type Point = { key: string; value: number };

export async function weightSeriesOf(userId: string, todayKey: string): Promise<Point[]> {
  const rows = await prisma.dailyNutrition.findMany({
    where: { userId, weightKg: { not: null }, date: { gte: dbDate(shiftDateKey(todayKey, -89)) } },
    orderBy: { date: 'asc' },
    select: { date: true, weightKg: true },
  });
  return rows.map((r) => ({ key: r.date.toISOString().slice(0, 10), value: r.weightKg as number }));
}

/* ── 선수 카드 한 장 ── */

export type MemberCard = {
  scope: Consent;
  arm: CoachArmStatus | null;
  pitch: PitchSummary | null;
  velocity: VelocitySummary | null;
  checkin: CheckinToday | null;
  rehab: RehabStatus | null;
  clips: Clip[];
  weight: Point[];
};

/** 가입한 회원의 카드 — 동의한 범위만 읽는다. 코치가 만든 자리(user 없음) · 떠난 회원은 null(떠난 뒤의 개인 기록은 조직이 못 본다) */
export async function memberCardOf(member: MemberWithUser, now: Date): Promise<MemberCard | null> {
  if (!member.user || member.status !== 'ACTIVE') return null;
  const scope = memberScope(member.consent, !!member.user);
  const todayKey = toDateKey(now);
  const u = member.user;
  const [arm, pitch, velocity, checkin, rehab, clips, weight] = await Promise.all([
    scope.pitch ? coachArmStatusFor(u, now, scope) : null,
    scope.pitch ? pitchSummaryOf(u.id, todayKey) : null,
    scope.pitch ? velocitySummaryOf(u.id) : null,
    scope.checkin ? checkinTodayOf(u.id, todayKey) : null,
    scope.training ? rehabStatusOf(u.id) : null,
    scope.video ? recentClipsOf(u.id) : [],
    scope.weight ? weightSeriesOf(u.id, todayKey) : [],
  ]);
  return { scope, arm, pitch, velocity, checkin, rehab, clips, weight };
}

/* ── 투수 부하판(팀 홈) ── */

export type BoardRow = {
  memberId: string;
  nickname: string;
  tags: string[];
  status: CoachArmStatus;
  lastOuting: { key: string; pitches: number } | null;
};

const RANK: Record<ArmLevel, number> = { danger: 0, caution: 1, safe: 2 };

/** 투구 공유에 동의한 가입 선수마다 팔 상태 — 위험부터. 동시에 넷씩(연결 풀이 작다, lib/prisma.ts) */
export async function pitcherBoardOf(orgId: string, now: Date): Promise<{ rows: BoardRow[]; hidden: number }> {
  const members = await loadPlayers(orgId);
  const consenting = members.filter((m) => m.user && memberScope(m.consent, true).pitch);
  const todayKey = toDateKey(now);
  const rows = await mapLimit(consenting, 4, async (m) => {
    const g = await gatherFactsAndPlan(m.user!, now);
    const p = g.facts.patterns;
    return {
      memberId: m.id,
      nickname: m.nickname,
      tags: m.tags,
      status: coachArmStatusOf(g.facts, memberScope(m.consent, true), todayKey),
      lastOuting: p.lastThrowDate ? { key: p.lastThrowDate, pitches: p.lastOutingPitches ?? 0 } : null,
    };
  });
  rows.sort((a, b) => RANK[a.status.level] - RANK[b.status.level] || a.nickname.localeCompare(b.nickname, 'ko'));
  return { rows, hidden: members.filter((m) => m.user).length - consenting.length };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
