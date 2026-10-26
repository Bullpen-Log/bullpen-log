import 'server-only';
import { prisma } from '@/lib/prisma';
import { OUTING_CALENDAR_TITLE, PITCHING_ROLES, isOutingRole } from '@/lib/org/team';
import type { TeamOuting } from '@/lib/org/outing-check';

/**
 * 팀이 확정한 등판(OrgOuting status 'confirmed', 선발 · 불펜) — 어느 조직 · 일정 · 역할 · 한도인지 그대로(계약 9-6 ①-5 E). 떠난 팀 · 취소한 일정은 안 읽는다.
 * 선수 오늘 '팀 등판 확인' 카드(lib/org/outing-check.ts)가 쓰고, 엔진에는 아래 confirmedOutingEvents 가 달력 모양으로 넘긴다.
 */
export async function teamOutingsOf(userId: string, from: Date, to: Date): Promise<TeamOuting[]> {
  const members = await prisma.orgMember.findMany({ where: { userId, role: 'PLAYER', status: 'ACTIVE' }, select: { id: true } });
  if (members.length === 0) return [];
  const outings = await prisma.orgOuting.findMany({
    where: { memberId: { in: members.map((m) => m.id) }, status: 'confirmed', role: { in: [...PITCHING_ROLES] } },
    select: { eventId: true, role: true, pitchLimit: true },
  });
  if (outings.length === 0) return [];
  const events = await prisma.orgEvent.findMany({
    where: { id: { in: outings.map((o) => o.eventId) }, date: { gte: from, lte: to }, status: { not: 'canceled' } },
    select: { id: true, date: true, org: { select: { id: true, name: true } } },
  });
  return events.flatMap((e) => {
    const o = outings.find((x) => x.eventId === e.id);
    return o && isOutingRole(o.role)
      ? [{ orgId: e.org.id, orgName: e.org.name, eventId: e.id, date: e.date.toISOString().slice(0, 10), role: o.role, pitchLimit: o.pitchLimit }]
      : [];
  });
}

/**
 * 팀 확정 등판을 달력 일정 모양으로 — 엔진이 홈 캘린더의 내 일정과 같은 출처로 읽는다(lib/report/gather.ts → facts.condition.outingCalendar,
 * 규칙은 lib/engine/outing.ts). 체크인 답이 먼저라 덮지 않고, 짐작한 출처(soft)라 가볍게 하는 쪽에만 쓰인다. 이름은 '등판'이 든 OUTING_CALENDAR_TITLE.
 * 날이 다른 것은 엔진이 조용히 고르지 않고 선수 화면이 묻는다(outing-check).
 */
export async function confirmedOutingEvents(userId: string, from: Date, to: Date): Promise<{ date: Date; title: string }[]> {
  return (await teamOutingsOf(userId, from, to)).map((o) => ({ date: new Date(`${o.date}T00:00:00.000Z`), title: OUTING_CALENDAR_TITLE }));
}

/** 공지 열어 봄 — 앱에 연결된 활동 선수 수와 공지마다 그 공지를 열어 본 사람 수(코치 공지 목록 · 웹 /manage, 계약 9-6 ①-4) */
export async function noticeReads(orgId: string, noticeIds: readonly string[]): Promise<{ players: number; reads: Record<string, number> }> {
  const [players, rows] = await Promise.all([
    prisma.orgMember.count({ where: { orgId, role: 'PLAYER', status: 'ACTIVE', userId: { not: null } } }),
    noticeIds.length
      ? prisma.orgNoticeRead.groupBy({ by: ['noticeId'], where: { noticeId: { in: [...noticeIds] } }, _count: { _all: true } })
      : Promise.resolve([]),
  ]);
  return { players, reads: Object.fromEntries(rows.map((r) => [r.noticeId, r._count._all])) };
}
