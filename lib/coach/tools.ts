import 'server-only';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { effortPctOf, shiftDateKey } from '@/lib/pitch-stats';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';
import { decideAccess, type Capability } from '@/lib/release-access';
import { releaseStage } from '@/lib/release-gate';
import { CARDS_MAX, type CoachCard } from '@/lib/coach/card';
import { READ_NAMES, WRITE_NAMES, addCard, norm, parseToolInput, propose, proposeToday, type ProposeCtx, type TodayWork } from '@/lib/coach/tool-defs';
export type { TodayWork } from '@/lib/coach/tool-defs';
import type { Toolbox } from '@/lib/coach/ai';
import type { DaySlot } from '@/lib/coach/week';

/**
 * 코치 도구 실행(개인 비서 1단계) — 읽기는 DB 에서 앱이 정한 값만 글로(메모 글 · 영상 · 이름은 안 넣는다), 바꾸기는 카드만 모은다.
 * 쓸 수 있나는 앱과 같은 판정(lib/release-access.ts decideAccess)으로, 건강정보는 건강 동의가 있을 때만. 도구 이름 · 입력은 lib/coach/tool-defs.ts.
 */

export type ToolSession = {
  user: { id: string; role: string | null | undefined; pilot?: boolean };
  today: string;
  said: string;
  /** 건강정보 동의 — 체크인 신호 · 통증 같은 건강정보 읽기 */
  health: boolean;
  week: readonly DaySlot[];
  locked: (date: string) => boolean;
  goalOpen: boolean;
  /** 이번 답에 모인 카드 */
  cards: CoachCard[];
  /** 오늘 운동 바꾸기(change_today)의 확인 재료 — 없으면(옛 호출) 그 도구는 못 쓴다 */
  todayWork?: TodayWork;
};



/** 이번 주 틀의 지문 — 카드를 만든 그 틀일 때만 일정 바꾸기를 실행한다(그새 바뀌었으면 다시 말해 달라고) */
export const slotsKey = (slots: unknown) => createHash('sha1').update(JSON.stringify(slots)).digest('hex').slice(0, 16);

const canUse = (s: ToolSession, cap: Capability) => decideAccess(s.user, cap, { stage: releaseStage() }).allowed;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** 날짜 범위 확인 — 앞날 · 거꾸로 · 너무 긴 범위 · 1년 넘게 지난 날은 안 된다 */
function rangeOf(input: Record<string, unknown>, today: string, maxDays: number): { from: string; to: string } | string {
  const { from, to } = input as { from: string; to: string };
  if (!DAY_RE.test(from) || !DAY_RE.test(to)) return '날짜는 YYYY-MM-DD 로 주세요.';
  if (from > to) return '시작 날이 끝 날보다 뒤예요.';
  if (to > today) return '앞날 기록은 없어요.';
  if (daysBetween(from, to) >= maxDays) return `한 번에 ${maxDays}일까지 읽을 수 있어요.`;
  if (from < shiftDateKey(today, -365)) return '1년 안 기록만 읽을 수 있어요.';
  return { from, to };
}

type Reader = (s: ToolSession, input: Record<string, unknown>) => Promise<{ text: string; error?: boolean }>;

const READERS: Record<string, Reader> = {
  async find_exercises(s, input) {
    if (!s.todayWork) return { text: '지금은 운동을 찾을 수 없어요.', error: true };
    const q = norm(String(input.query ?? ''));
    if (!q) return { text: '찾을 말을 주세요.', error: true };
    const hits = (await s.todayWork.picker()).filter((p) => !p.inPlan && !p.unsafe && (norm(p.title).includes(q) || p.bodyParts.some((b) => norm(b).includes(q)) || norm(p.category).includes(q)));
    if (!hits.length) return { text: `'${input.query}'로 오늘 더할 수 있는 운동이 없어요.` };
    return {
      text: [
        `오늘 더할 수 있는 운동(이름 | 분류 | 부위 | 처방) ${Math.min(hits.length, 12)}개:`,
        ...hits.slice(0, 12).map((p) => `- ${p.title} | ${p.category} | ${p.bodyParts.join(' · ')} | ${p.prescription ?? '처방 없음'}`),
      ].join('\n'),
    };
  },
  async read_pitch_logs(s, input) {
    if (!canUse(s, 'records')) return { text: '이 사람은 지금 투구 기록을 쓸 수 없어요.', error: true };
    const r = rangeOf(input, s.today, 60);
    if (typeof r === 'string') return { text: r, error: true };
    const logs = await prisma.pitchLog.findMany({
      where: { userId: s.user.id, date: { gte: dbDate(r.from), lte: dbDate(r.to) } },
      orderBy: { date: 'asc' },
      select: { date: true, sessionType: true, pitchCount: true, intensity: true, effortPct: true, satisfaction: true },
    });
    if (!logs.length) return { text: `${r.from} ~ ${r.to}: 투구 기록 없음(안 던졌다는 뜻은 아님)` };
    return {
      text: [
        `투구 기록 ${r.from} ~ ${r.to} (날짜 | 종류 | 구수 | 체감 강도 | 만족도 1~5):`,
        ...logs.map(
          (l) => `- ${keyOfDbDate(l.date)} | ${l.sessionType} | ${l.pitchCount}구 | ${effortPctOf(l)}% | ${l.satisfaction ?? '없음'}`
        ),
      ].join('\n'),
    };
  },
  async read_checkins(s, input) {
    if (!s.health) return { text: '건강정보 동의가 없어 체크인을 볼 수 없어요. 몸 상태를 묻거나 짐작하지 말아 주세요.', error: true };
    const r = rangeOf(input, s.today, 30);
    if (typeof r === 'string') return { text: r, error: true };
    const rows = await prisma.dailyCheckin.findMany({
      where: { userId: s.user.id, date: { gte: dbDate(r.from), lte: dbDate(r.to) } },
      orderBy: { date: 'asc' },
      select: { date: true, condition: true, sleepQuality: true, shoulder: true, elbow: true },
    });
    if (!rows.length) return { text: `${r.from} ~ ${r.to}: 체크인 없음(괜찮았다는 뜻은 아님)` };
    return {
      text: [
        `체크인 ${r.from} ~ ${r.to} (날짜 | 컨디션 1~10 | 잠의 질 1~5 | 어깨 | 팔꿈치):`,
        ...rows.map((c) => `- ${keyOfDbDate(c.date)} | ${c.condition} | ${c.sleepQuality ?? '없음'} | ${c.shoulder ?? '없음'} | ${c.elbow ?? '없음'}`),
      ].join('\n'),
    };
  },
};

async function proposeTodayRaw(w: TodayWork | undefined, raw: unknown) {
  const input = parseToolInput('change_today', raw);
  return input ? proposeToday(w, input) : { refuse: '입력 모양이 틀렸어요.' };
}

/** 한 답의 도구 실행기 — 읽기는 바로 읽어 돌려주고, 바꾸기는 확인을 통과한 것만 카드로 모은다(실행은 선수가 누를 때) */
export function toolboxOf(s: ToolSession): Toolbox {
  const ctx: ProposeCtx = { today: s.today, said: s.said, week: s.week, locked: s.locked, goalOpen: s.goalOpen };
  return {
    async run(name, raw) {
      if (READ_NAMES.has(name)) {
        const input = parseToolInput(name, raw);
        if (!input) return { text: '입력 모양이 틀렸어요.', error: true };
        return READERS[name](s, input);
      }
      if (!WRITE_NAMES.has(name)) return { text: '모르는 도구예요.', error: true };
      const p = name === 'change_today' ? await proposeTodayRaw(s.todayWork, raw) : propose(name, ctx, raw);
      if ('refuse' in p) return { text: `카드를 못 만들었어요: ${p.refuse}`, error: true };
      const card = name === 'change_week' ? { ...p.card, args: { ...(p.card.args as object), token: slotsKey(s.week) } } : p.card;
      const added = addCard(s.cards, card, CARDS_MAX);
      if ('refuse' in added) return { text: `카드를 못 만들었어요: ${added.refuse}`, error: true };
      return { text: `카드를 만들었어요(${card.title}). 사용자가 눌러야 바뀌어요 — 바꿨다고 말하지 마세요.` };
    },
  };
}
