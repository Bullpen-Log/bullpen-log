import 'server-only';
import { UNREAD_NUDGE } from './unread';
import { prisma } from '@/lib/prisma';
import { appNow } from '@/lib/clock';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';
import { notify } from '@/lib/notify';
import { coachPaid } from '@/lib/coach-access';
import { coachAiConsentFor, healthConsentFor } from '@/lib/analysis-consent-store';
import { GOAL_TRIGGERS } from '@/lib/coach/goal';
import { goalLogsOf, goalStateOf } from '@/lib/coach/goal-db';
import {
  NUDGE_TITLE,
  RECHECK_EVERY_DAYS,
  RECHECK_PUSH,
  goalDayNudge,
  goalLogNudge,
  nudgeAllowed,
  painNudge,
  recheckNudge,
  type Nudge,
  type PainPart,
} from '@/lib/coach/nudge';
import { mechFocusFrom, readProgramState } from '@/lib/mechanics/program';

/**
 * 코치가 먼저 말 걸기 보내기(자비스 3단계, 글은 lib/coach/nudge.ts). 저장 · 체크인 동작은 after() 로 부른다 — 실패는 삼킨다(본 동작을 막지 않는다).
 * 받는 사람: 코치 진행 중 · 유료 · 먼저 말 걸기 켬. 대화에 남기는 말은 AI 동의가 있을 때만, 건강정보가 든 말(통증)은 건강 동의도 있어야.
 */
async function send(userId: string, n: Nudge): Promise<boolean> {
  const [user, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } }),
    prisma.coachProfile.findUnique({ where: { userId }, select: { status: true, nudges: true } }),
  ]);
  if (!user || profile?.status !== 'active' || !profile.nudges || !(await coachPaid(user))) return false;
  /* 하루는 실제 한국 날짜(알림 시각이 실제 시각이라 — app/actions/coach-chat.ts windowsOf 와 같은 까닭) */
  const kst = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const sent = await prisma.notification.findMany({
    where: { userId, kind: 'coach', title: NUDGE_TITLE, createdAt: { gte: new Date(`${kst}T00:00:00+09:00`) } },
    select: { body: true },
  });
  /* ponytail: 같은 사람 두 사건이 동시에 오면 상한을 하나 넘을 수 있다 — 드물어서 잠그지 않는다 */
  if (!nudgeAllowed(sent.map((s) => s.body), n)) return false;
  if (n.chat) {
    const [ai, health] = await Promise.all([coachAiConsentFor(userId), healthConsentFor(userId)]);
    if (!ai.valid || (n.health && !health.valid)) return false;
    await prisma.coachMessage.create({ data: { userId, role: 'coach', adjusts: UNREAD_NUDGE, text: n.chat.text, act: n.chat.act ?? undefined } });
  }
  await notify(userId, { kind: 'coach', title: NUDGE_TITLE, body: n.push, link: n.link });
  return true;
}

const quiet = async (what: string, run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (e) {
    console.error(`[coach nudge ${what}]`, e);
  }
};

/** 투구 기록을 새로 남긴 뒤 — 목표로 정한 종류면 '어땠어요?' */
export function nudgeAfterPitchLog(userId: string, savedDate: string, sessionType: string) {
  if (!(GOAL_TRIGGERS as readonly string[]).includes(sessionType)) return Promise.resolve();
  return quiet('pitch-log', async () => {
    const goal = goalStateOf(await prisma.coachGoal.findUnique({ where: { userId } }));
    if (!goal) return;
    const today = toDateKey(appNow());
    const n = goalLogNudge(goal, await goalLogsOf(userId, goal, today), today, savedDate);
    if (n) await send(userId, n);
  });
}

/** 체크인을 저장한 뒤 — 어깨 · 팔꿈치 통증이면 */
export function nudgeAfterCheckin(userId: string, parts: PainPart[]) {
  const n = painNudge(parts);
  if (!n) return Promise.resolve();
  return quiet('checkin', () => send(userId, n));
}

/** 매일 18시 크론 — 확인할 날이 오늘 · 어제인 열린 목표. 보낸 수 */
export async function sendGoalDayNudges(today: string): Promise<number> {
  const yesterday = shiftDateKey(today, -1);
  const rows = await prisma.coachGoal.findMany({ where: { status: 'open', checkOn: { gte: dbDate(yesterday), lte: dbDate(today) } } });
  let sent = 0;
  for (const row of rows) {
    await quiet('goal-day', async () => {
      const goal = goalStateOf(row);
      if (!goal) return;
      const n = goalDayNudge(goal, await goalLogsOf(row.userId, goal, today), today);
      if (n && (await send(row.userId, n))) sent++;
    });
  }
  return sent;
}

/**
 * 매일 18시 크론 — 3D 다시 재기(lib/coach/nudge.ts recheckNudge). 최근 4주 안에 메커니즘 세션을 한 사람만 본다. 보낸 수.
 * ponytail: 사람마다 줄 둘을 더 읽는다 — 메커니즘을 하는 사람이 많아지면 알림 · 체크인을 한 번에 묶어 읽기
 */
export async function sendRecheckNudges(today: string): Promise<number> {
  const rows = await prisma.mechanicsProgram.findMany({
    where: { lastSessionOn: { gte: dbDate(shiftDateKey(today, -RECHECK_EVERY_DAYS)) }, user: { coachProfile: { status: 'active', nudges: true } } },
    select: { userId: true, progress: true, lastSessionOn: true },
  });
  let sent = 0;
  for (const row of rows) {
    await quiet('recheck', async () => {
      const focus = readProgramState(row.progress).focus;
      if (!focus) return;
      const [last, pain] = await Promise.all([
        prisma.notification.findFirst({
          where: { userId: row.userId, kind: 'coach', title: NUDGE_TITLE, body: RECHECK_PUSH },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        prisma.dailyCheckin.findFirst({
          where: { userId: row.userId, date: { gte: dbDate(shiftDateKey(today, -2)) }, OR: [{ shoulder: '통증' }, { elbow: '통증' }] },
          select: { id: true },
        }),
      ]);
      const r = focus.review;
      const n = recheckNudge(
        {
          startedOn: focus.startedOn,
          finished: mechFocusFrom(focus).finished,
          baselineOn: r ? toDateKey(new Date(r.baseline.savedAt)) : null,
          followupOns: r ? r.followups.map((f) => toDateKey(new Date(f.linkedAt))) : [],
          lastSessionOn: row.lastSessionOn ? keyOfDbDate(row.lastSessionOn) : null,
        },
        today,
        last ? toDateKey(last.createdAt) : null,
        !!pain
      );
      if (n && (await send(row.userId, n))) sent++;
    });
  }
  return sent;
}
