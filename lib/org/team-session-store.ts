import 'server-only';
import { prisma } from '@/lib/prisma';
import { appNow } from '@/lib/clock';
import { notify } from '@/lib/notify';
import { exercisesByIds } from '@/lib/library-cache';
import { memberScope } from '@/lib/org/rules';
import { eventLine } from '@/lib/org/notify-org';
import { orgOpenHref } from '@/lib/org/space-nav';
import { eventMemberIds } from '@/lib/org/team';
import { clearEventWork, writeOrgWork } from '@/lib/org/team-work-store';
import { effortFields } from '@/lib/pitch-effort';
import { toDateKey } from '@/lib/pitch-stats';
import {
  isPlanScope,
  isValueMode,
  memberWork,
  readException,
  readValues,
  teamPitchKey,
  workHash,
  type Defaults,
  type SessionPlan,
  type WorkLine,
  type WorkStatus,
} from '@/lib/org/team-session';

/**
 * 팀 훈련 실제 확인의 저장(규칙은 lib/org/team-session.ts, 계약 11절). 서버 동작 파일이 아니다 — 코치(coachOrg) · 선수(myMember)를 확인한 서버 코드만 부른다.
 * 선수 한 명씩 따로 쓴다 — 한 선수가 실패해도 다른 선수는 그대로, 실패한 선수만 다시 보낸다. 지문이 같으면 다시 안 쓴다(몇 번 눌러도 한 벌).
 */

const CONSENT = { pitch: true, training: true, checkin: true, video: true, nutrition: true, weight: true } as const;

export type SessionEvent = { id: string; orgId: string; date: Date; time: string | null; title: string; kind: string; memberId: string | null; rosterAt: Date | null };

export async function activePlayerIds(orgId: string): Promise<string[]> {
  const rows = await prisma.orgMember.findMany({ where: { orgId, role: 'PLAYER', status: 'ACTIVE' }, orderBy: { nickname: 'asc' }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** 훈련 명단 — 담았으면 그 줄들(그 뒤 들어오고 나간 선수와 무관), 안 담은 옛 일정은 지금 활동 선수 전부 */
export async function rosterOf(event: Pick<SessionEvent, 'id' | 'memberId' | 'rosterAt'>, active: readonly string[]): Promise<string[]> {
  if (!event.rosterAt) return eventMemberIds(event, active);
  const rows = await prisma.orgEventAttendee.findMany({ where: { eventId: event.id }, select: { memberId: true } });
  const ids = new Set(rows.map((r) => r.memberId));
  /* 이름 차례(활동 선수 차례) 먼저, 떠난 선수는 뒤에 */
  return [...active.filter((id) => ids.has(id)), ...[...ids].filter((id) => !active.includes(id))];
}

/** 명단 담기 — 처음 한 번만(그 순간의 활동 선수). 이미 담았으면 그대로 */
export async function ensureRoster(event: Pick<SessionEvent, 'id' | 'memberId' | 'rosterAt'>, active: readonly string[]): Promise<void> {
  if (event.rosterAt) return;
  await prisma.$transaction(async (tx) => {
    const won = await tx.orgEvent.updateMany({ where: { id: event.id, rosterAt: null }, data: { rosterAt: appNow() } });
    if (!won.count) return;
    const ids = eventMemberIds(event, active);
    if (ids.length) await tx.orgEventAttendee.createMany({ data: ids.map((memberId) => ({ eventId: event.id, memberId })), skipDuplicates: true });
  });
}

const readLines = (raw: unknown): WorkLine[] => (Array.isArray(raw) ? raw.filter((x): x is WorkLine => !!x && typeof x === 'object' && ('exerciseId' in x || 'guideId' in x)) : []);

export async function readSessionPlans(eventId: string): Promise<SessionPlan[]> {
  const rows = await prisma.orgPlan.findMany({ where: { eventId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
  return rows.map((p) => ({
    id: p.id,
    title: p.title,
    scope: isPlanScope(p.scope) ? p.scope : 'all',
    groupName: p.groupName,
    memberIds: p.memberIds,
    replacesPlanId: p.replacesPlanId,
    valueMode: isValueMode(p.valueMode) ? p.valueMode : 'shared',
    position: p.position,
    items: readLines(p.items),
    actualItems: p.actualItems == null ? null : readLines(p.actualItems),
  }));
}

export async function defaultsFor(lines: readonly WorkLine[]): Promise<Defaults> {
  const ex = await exercisesByIds([...new Set(lines.map((l) => l.exerciseId).filter((x): x is string => !!x))]);
  return new Map(ex.map((e) => [e.id, { sets: e.sets, reps: e.reps, holdSeconds: e.holdSeconds }]));
}

export type MemberResult = { memberId: string; status: WorkStatus; reasons: string[]; changed: boolean };

/** 선수마다 지금 셈한 실제(쓰기 전) — 훈련 화면 미리보기와 쓰기가 같이 쓴다 */
export async function computeTeamWork(event: SessionEvent, memberIds?: readonly string[]) {
  const active = await activePlayerIds(event.orgId);
  const roster = await rosterOf(event, active);
  const want = memberIds ? roster.filter((id) => memberIds.includes(id)) : roster;
  const [plans, members, attendees] = await Promise.all([
    readSessionPlans(event.id),
    want.length
      ? prisma.orgMember.findMany({ where: { id: { in: want } }, select: { id: true, nickname: true, tags: true, userId: true, status: true, consent: { select: CONSENT } } })
      : [],
    want.length ? prisma.orgEventAttendee.findMany({ where: { eventId: event.id, memberId: { in: want } } }) : [],
  ]);
  const att = new Map(attendees.map((x) => [x.memberId, x]));
  const exceptions = new Map(want.map((id) => [id, readException(att.get(id)?.exception)]));
  const defaults = await defaultsFor([
    ...plans.flatMap((p) => [...p.items, ...(p.actualItems ?? [])]),
    ...[...exceptions.values()].flatMap((e) => [...(e?.items.flatMap((i) => i.items ?? []) ?? []), ...(e?.extra.flatMap((x) => x.items) ?? [])]),
  ]);
  const userIds = members.map((m) => m.userId).filter((x): x is string => !!x);
  const own = userIds.length
    ? await prisma.userExerciseSet.findMany({
        where: { userId: { in: userIds }, enteredById: null, OR: [{ orgEventId: event.id }, { date: event.date, orgEventId: null }] },
        select: { userId: true, exerciseId: true, orgEventId: true },
      })
    : [];
  const rows = want.map((id) => {
    const m = members.find((x) => x.id === id) ?? null;
    const prev = att.get(id) ?? null;
    const scope = m ? memberScope(m.consent, true) : null;
    const mine = own.filter((s) => !!m?.userId && s.userId === m.userId);
    const linked = mine.filter((s) => s.orgEventId === event.id);
    const w = memberWork({
      memberId: id,
      roster,
      plans,
      exception: exceptions.get(id) ?? null,
      values: readValues(prev?.values),
      defaults,
      linked: new Set(linked.map((s) => s.exerciseId)),
      sameDay: new Set(mine.filter((s) => s.orgEventId == null).map((s) => s.exerciseId)),
      hasUser: !!m?.userId,
      active: m?.status === 'ACTIVE',
      canTrain: !!scope?.training,
      canPitch: !!scope?.pitch,
    });
    return { id, member: m, scope, prev, exception: exceptions.get(id) ?? null, w, hash: workHash(w), linkedSets: scope?.training ? linked.length : 0 };
  });
  return { roster, plans, defaults, rows };
}

/** 확인 뒤 다시 써야 하나 — 지문이 바뀌었거나 지난번에 실패했다 */
export const needsWrite = (r: { prev: { workHash: string | null; workStatus: string | null } | null; hash: string }) =>
  !r.prev || r.prev.workHash !== r.hash || r.prev.workStatus === 'failed';

/**
 * 선수마다 실제를 셈해 개인 기록에 쓴다 — memberIds 를 주면 그 선수만(다시 보내기 · 선수 '팀 훈련이었나요' 답).
 * 코치 세트는 writeOrgWork(통째 교체), 투구는 열쇠 team:<훈련>:<활동>(고침 · 빈 값은 지움). 남길 수 없는 선수는 지금 기록을 그대로 둔다.
 */
export async function applyTeamWork(a: { event: SessionEvent; coachId: string; memberIds?: readonly string[]; notifyChanges?: boolean }): Promise<MemberResult[]> {
  const { event } = a;
  const { rows } = await computeTeamWork(event, a.memberIds);
  const dateKey = toDateKey(event.date);
  const out: MemberResult[] = [];
  for (const r of rows) {
    const { id, member: m, prev, w, hash } = r;
    const reason = w.reasons.join(',') || null;
    const key = { eventId_memberId: { eventId: event.id, memberId: id } };
    if (!needsWrite(r)) {
      if (prev && (prev.workStatus !== w.status || prev.workReason !== reason)) await prisma.orgEventAttendee.update({ where: key, data: { workStatus: w.status, workReason: reason } });
      out.push({ memberId: id, status: w.status, reasons: w.reasons, changed: false });
      continue;
    }
    try {
      if (m?.userId && w.writeTraining) await writeOrgWork({ userId: m.userId, dateKey, orgEventId: event.id, enteredById: a.coachId, items: w.work });
      if (m?.userId && w.writePitch) await writeTeamPitch({ userId: m.userId, event, coachId: a.coachId, pitch: w.pitch });
      const data = { workStatus: w.status, workReason: reason, workHash: hash, workAt: appNow() };
      await prisma.orgEventAttendee.upsert({ where: key, create: { eventId: event.id, memberId: id, ...data }, update: data });
      out.push({ memberId: id, status: w.status, reasons: w.reasons, changed: true });
      if (m?.userId) {
        /* 코치가 다시 확인해 바뀐 선수의 정정 요청은 풀린다 */
        await prisma.orgComment.updateMany({ where: { eventId: event.id, memberId: id, kind: 'fix', resolvedAt: null }, data: { resolvedAt: appNow() } });
        const had = prev?.workHash != null;
        const something = w.work.length > 0 || w.pitch.length > 0 || w.reconciled.length > 0 || w.held.length > 0;
        /* 남길 수 없는 선수(떠남 · 비공개)는 기록이 그대로라 안 알린다 */
        if (a.notifyChanges !== false && w.status !== 'blocked' && (had || something))
          await notify(m.userId, {
            kind: 'team',
            title: w.status === 'needs_check' ? '팀 훈련 기록을 확인해 주세요' : had ? '팀 훈련 기록이 바뀌었어요' : '팀 훈련 기록이 올라왔어요',
            body: eventLine(event),
            link: orgOpenHref(event.orgId, 'p', 'schedule', { kind: 'event', id: event.id }),
          });
      }
    } catch {
      const data = { workStatus: 'failed', workReason: 'write_failed', workHash: null, workAt: appNow() };
      await prisma.orgEventAttendee.upsert({ where: key, create: { eventId: event.id, memberId: id, ...data }, update: data }).catch(() => undefined);
      out.push({ memberId: id, status: 'failed', reasons: ['write_failed'], changed: false });
    }
  }
  return out;
}

/** 팀 훈련의 투구 — 활동마다 한 줄(열쇠로 고침). 이 훈련의 다른 열쇠 줄(빠진 활동 · 지운 값)은 지운다 */
async function writeTeamPitch(a: { userId: string; event: SessionEvent; coachId: string; pitch: readonly { planId: string; pitchCount: number; effortPct: number; maxVelocity: number | null }[] }) {
  const keys = a.pitch.map((v) => teamPitchKey(a.event.id, v.planId));
  await prisma.pitchLog.deleteMany({ where: { userId: a.userId, clientKey: { startsWith: `team:${a.event.id}:`, notIn: keys } } });
  for (const v of a.pitch) {
    const clientKey = teamPitchKey(a.event.id, v.planId);
    const data = {
      date: a.event.date,
      sessionType: a.event.kind === 'game' ? '경기' : '불펜',
      pitchCount: v.pitchCount,
      ...effortFields(v.effortPct),
      maxVelocity: v.maxVelocity,
      enteredById: a.coachId,
      orgId: a.event.orgId,
      orgEventId: a.event.id,
    };
    await prisma.pitchLog.upsert({ where: { userId_clientKey: { userId: a.userId, clientKey } }, create: { userId: a.userId, clientKey, ...data }, update: data });
  }
}

/** 훈련을 지우거나 취소하며 '기록도 빼기'를 고른 때 — 코치 세트(clearEventWork) · 팀 투구 줄을 빼고, 다시 확인하면 새로 쓰게 결과를 비운다 */
export async function clearTeamWork(eventId: string, byId: string): Promise<void> {
  await clearEventWork(eventId, byId);
  await prisma.pitchLog.deleteMany({ where: { clientKey: { startsWith: `team:${eventId}:` } } });
  await prisma.orgEventAttendee.updateMany({ where: { eventId }, data: { workStatus: null, workReason: null, workHash: null, workAt: null } });
}

/** 그 훈련의 팀 투구 줄 수 — 지우기 · 취소 전에 묻는 데(결정 4) */
export async function teamPitchOf(eventId: string): Promise<{ rows: number; userIds: string[] }> {
  const rows = await prisma.pitchLog.findMany({ where: { clientKey: { startsWith: `team:${eventId}:` } }, select: { userId: true } });
  return { rows: rows.length, userIds: [...new Set(rows.map((r) => r.userId))] };
}
