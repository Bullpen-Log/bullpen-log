import 'server-only';
import { prisma } from '@/lib/prisma';
import { notifyMany, type NotifyInput } from '@/lib/notify';
import { eventMemberIds, planMemberIds } from '@/lib/org/team';

/**
 * 팀 · 레슨장 알림 받는 사람(계약 9-6 ③-1) — 서버 동작 파일이 아니다(권한을 확인한 서버 코드만 부른다).
 * 일정은 그 일정의 선수, 메뉴는 그 메뉴의 선수, 공유 바꿈 · 나감은 대표 · 코치. 앱에 연결된(계정 있는) 활동 선수만 받는다.
 */

/** 일정(또는 그 일정의 메뉴) 대상 선수의 계정 — memberIds 를 주면 그 메뉴 대상만 */
export async function eventPlayerUsers(orgId: string, event: { memberId: string | null }, planMembers?: readonly string[]): Promise<string[]> {
  const players = await prisma.orgMember.findMany({ where: { orgId, role: 'PLAYER', status: 'ACTIVE' }, select: { id: true, userId: true } });
  const targets = eventMemberIds(event, players.map((p) => p.id));
  const ids = planMembers ? planMemberIds(planMembers, targets) : targets;
  return players.filter((p) => ids.includes(p.id) && p.userId).map((p) => p.userId!);
}

export async function notifyEventPlayers(orgId: string, event: { memberId: string | null }, input: NotifyInput, planMembers?: readonly string[]): Promise<void> {
  await notifyMany(await eventPlayerUsers(orgId, event, planMembers), input);
}

/** 대표 · 코치 — 조직 주인과 활동 중인 대표 · 코치 줄 */
export async function notifyCoaches(orgId: string, input: NotifyInput): Promise<void> {
  const [org, staff] = await Promise.all([
    prisma.org.findUnique({ where: { id: orgId }, select: { ownerId: true } }),
    prisma.orgMember.findMany({ where: { orgId, role: { in: ['MASTER', 'STAFF'] }, status: 'ACTIVE', userId: { not: null } }, select: { userId: true } }),
  ]);
  await notifyMany([org?.ownerId, ...staff.map((s) => s.userId)].filter((x): x is string => !!x), input);
}

/** '10월 28일(화) 19:00 훈련' — 알림 본문 한 줄 */
export function eventLine(e: { date: Date; time: string | null; title: string }): string {
  const d = e.date;
  const wd = ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()];
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${wd})${e.time ? ` ${e.time}` : ''} ${e.title}`;
}
