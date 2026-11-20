import 'server-only';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { effortPctOf, shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { EVENT_KINDS } from '@/lib/org/rules';
import { parseProgram } from '@/lib/program/program';
import { mechFocusFrom, readProgramState } from '@/lib/mechanics/program';
import { loadReportSummaries } from '@/lib/pitch-lab';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';
import { decideAccess, type Capability } from '@/lib/release-access';
import { releaseStage } from '@/lib/release-gate';
import { CARDS_MAX, type CoachCard } from '@/lib/coach/card';
import { READ_NAMES, WRITE_NAMES, addCard, calendarKindOf, noticeLine, norm, parseToolInput, propose, proposeToday, type ProposeCtx, type TodayWork } from '@/lib/coach/tool-defs';
export type { TodayWork } from '@/lib/coach/tool-defs';
import type { Toolbox } from '@/lib/coach/ai';
import { ASSIST_TOOLS, proposeAssist } from '@/lib/coach/assist';
import { visibleExercises, visibleGuides } from '@/lib/library-cache';
import { scrubNames } from '@/lib/coach/ai-prompt';
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

const EVENT_LABEL: Record<string, string> = Object.fromEntries(EVENT_KINDS.map((k) => [k.key, k.label]));
const PROGRAM_STATUS: Record<string, string> = { active: '진행 중', done: '마침', ended: '그만둠' };

/** 운동 시간 — 판을 안 닫아 몇 시간으로 남은 것(10-21 895분 같은)은 숫자를 안 준다(AI 가 그대로 읽어 '15시간 했다'고 말하지 않게) */
const minutesText = (sec: number | null | undefined) => (!sec ? '모름' : sec > 4 * 3600 ? '모름(시간 기록이 이상해요)' : `${Math.round(sec / 60)}분`);

/** 운동 설명을 AI 에 실을 때의 글자 상한 — 라이브러리 글은 대개 이보다 짧다 */
const INFO_MAX = 1500;
const rxOf = (x: { sets: number | null; reps: number | null; holdSeconds: number | null; restSeconds: number | null; perSide: boolean }) =>
  x.sets
    ? `${x.sets}세트 × ${x.reps ? `${x.reps}회` : x.holdSeconds ? `${x.holdSeconds}초` : '?'}${x.perSide ? '(좌우 각각)' : ''}${x.restSeconds ? ` · 쉬기 ${x.restSeconds}초` : ''}`
    : '없음';

const READERS: Record<string, Reader> = {
  async read_workouts(s, input) {
    if (!canUse(s, 'training')) return { text: '이 사람은 지금 트레이닝을 쓸 수 없어요.', error: true };
    const r = rangeOf(input, s.today, 31);
    if (typeof r === 'string') return { text: r, error: true };
    const where = { userId: s.user.id, date: { gte: dbDate(r.from), lte: dbDate(r.to) } };
    const [logs, sessions, notes] = await Promise.all([
      prisma.userExerciseLog.findMany({
        where: { ...where, completed: true, exercise: { category: { not: '암케어' } } },
        orderBy: { date: 'asc' },
        select: { date: true, setsDone: true, repsDone: true, holdSecondsDone: true, weightKg: true, exercise: { select: { title: true } } },
      }),
      prisma.trainingSession.findMany({ where, select: { date: true, themeKey: true, status: true, activeSeconds: true } }),
      prisma.dailyTrainingNote.findMany({ where, select: { date: true, intensity: true } }),
    ]);
    const days = [...new Set([...logs, ...sessions].map((x) => keyOfDbDate(x.date)))].sort();
    if (!days.length) return { text: `${r.from} ~ ${r.to}: 운동 기록 없음(안 했다는 뜻은 아님)` };
    const amount = (l: (typeof logs)[number]) =>
      [l.setsDone ? `${l.setsDone}세트` : '', l.repsDone ? `${l.repsDone}회` : l.holdSecondsDone ? `${l.holdSecondsDone}초` : '', l.weightKg ? `${l.weightKg}kg` : '']
        .filter(Boolean)
        .join(' × ');
    return {
      text: [
        `운동 기록 ${r.from} ~ ${r.to} (날짜 | 분 | 운동 힘듦 1~10 | 한 운동):`,
        ...days.map((d) => {
          const sess = sessions.find((x) => keyOfDbDate(x.date) === d);
          const note = notes.find((x) => keyOfDbDate(x.date) === d);
          const done = logs.filter((l) => keyOfDbDate(l.date) === d).map((l) => `${l.exercise.title}${amount(l) ? `(${amount(l)})` : ''}`);
          return `- ${d} | ${minutesText(sess?.activeSeconds)} | ${note?.intensity ?? '없음'} | ${done.join(' · ') || '체크한 운동 없음'}`;
        }),
      ].join('\n'),
    };
  },
  async read_armcare(s, input) {
    if (!canUse(s, 'armcare')) return { text: '이 사람은 지금 암케어를 쓸 수 없어요.', error: true };
    const r = rangeOf(input, s.today, 31);
    if (typeof r === 'string') return { text: r, error: true };
    const logs = await prisma.userExerciseLog.findMany({
      where: { userId: s.user.id, completed: true, date: { gte: dbDate(r.from), lte: dbDate(r.to) }, exercise: { category: '암케어' } },
      orderBy: { date: 'asc' },
      select: { date: true, exercise: { select: { title: true } } },
    });
    if (!logs.length) return { text: `${r.from} ~ ${r.to}: 암케어 기록 없음` };
    const days = [...new Set(logs.map((l) => keyOfDbDate(l.date)))];
    return { text: [`암케어 ${r.from} ~ ${r.to} (${days.length}일):`, ...days.map((d) => `- ${d} | ${logs.filter((l) => keyOfDbDate(l.date) === d).map((l) => l.exercise.title).join(' · ')}`)].join('\n') };
  },
  async read_calendar(s, input) {
    const { from, to } = input as { from: string; to: string };
    if (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to) return { text: '날짜는 YYYY-MM-DD 로, 시작 날이 먼저예요.', error: true };
    if (daysBetween(from, to) >= 60 || to > shiftDateKey(s.today, 60) || from < shiftDateKey(s.today, -365)) return { text: '한 번에 60일, 오늘부터 60일 뒤까지 읽을 수 있어요.', error: true };
    const range = { gte: dbDate(from), lte: dbDate(to) };
    const [own, team] = await Promise.all([
      prisma.calendarEvent.findMany({ where: { userId: s.user.id, date: range }, orderBy: { date: 'asc' }, select: { date: true, time: true, title: true } }),
      prisma.orgEvent.findMany({
        where: { date: range, status: { not: 'cancelled' }, org: { members: { some: { userId: s.user.id, status: 'ACTIVE' } } } },
        orderBy: { date: 'asc' },
        select: { date: true, time: true, kind: true },
      }),
    ]);
    const rows = [
      ...own.map((e) => ({ d: keyOfDbDate(e.date), t: e.time, k: calendarKindOf(e.title), from: '내 달력' })),
      ...team.map((e) => ({ d: keyOfDbDate(e.date), t: e.time, k: EVENT_LABEL[e.kind] ?? '기타', from: '팀 · 레슨' })),
    ].sort((a, b) => (a.d === b.d ? (a.t ?? '').localeCompare(b.t ?? '') : a.d < b.d ? -1 : 1));
    if (!rows.length) return { text: `${from} ~ ${to}: 일정 없음` };
    return { text: [`일정 ${from} ~ ${to} (날짜 | 시각 | 종류 | 어디):`, ...rows.map((e) => `- ${e.d} | ${e.t ?? '시각 없음'} | ${e.k} | ${e.from}`)].join('\n') };
  },
  async read_program(s) {
    const [programs, mech] = await Promise.all([
      prisma.userTrainingProgram.findMany({ where: { userId: s.user.id }, orderBy: { startedAt: 'desc' }, take: 4, select: { programKey: true, status: true, nextDay: true, lastDoneDate: true, startedAt: true, endReason: true } }),
      prisma.mechanicsProgram.findUnique({ where: { userId: s.user.id }, select: { progress: true, sessionsDone: true, lastSessionOn: true } }),
    ]);
    const prog = programs.map((p) => {
      const plan = parseProgram(p.programKey);
      return `- ${plan?.def.name ?? p.programKey} | ${PROGRAM_STATUS[p.status] ?? p.status} | ${p.nextDay}번째 세션 차례 | 마지막 한 날 ${p.lastDoneDate ? keyOfDbDate(p.lastDoneDate) : '없음'} | 시작 ${toDateKey(p.startedAt)}`;
    });
    const state = mech ? readProgramState(mech.progress) : null;
    const focus = state?.focus?.rx[0] ? mechFocusFrom(state.focus) : null;
    return {
      text: [
        '근력 · 파워 프로그램(최근 4개):',
        ...(prog.length ? prog : ['- 없음']),
        `메커니즘: ${mech ? `세션 ${mech.sessionsDone}번 · 마지막 ${mech.lastSessionOn ? keyOfDbDate(mech.lastSessionOn) : '없음'}${focus ? ` | 처방 ${focus.element} · ${focus.total == null ? `${focus.done}회` : `${focus.done}/${focus.total}회`}${focus.stage ? ` · 단계 ${focus.stage}` : ''}${focus.finished ? ' · 마침' : ''}` : ' | 처방 없음'}` : '시작 안 함'}`,
      ].join('\n'),
    };
  },
  async read_3d_history(s) {
    if (!canUse(s, 'pitch3d')) return { text: '이 사람은 지금 3D 동작 분석을 쓸 수 없어요.', error: true };
    const list = (await loadReportSummaries(s.user.id)).slice(0, 10);
    if (!list.length) return { text: '3D 동작 분석을 한 적이 없어요.' };
    const verdict = ({ summary: m }: (typeof list)[number]) =>
      !m.judged ? '판정 못 함(영상 조건)' : m.bad.length ? m.bad.map((b) => `${b.element} ${b.level === 'improve' ? '고칠 점' : '경계'}`).join(' · ') : '고칠 점 없음';
    return {
      text: [
        `3D 동작 분석 ${list.length}개(가까운 날부터 | 판정):`,
        ...list.map((a) => `- ${a.finishedAt ? toDateKey(new Date(a.finishedAt)) : '모름'} | ${verdict(a)}`),
      ].join('\n'),
    };
  },
  async read_settings(s) {
    const [u, notes] = await Promise.all([
      prisma.user.findUnique({ where: { id: s.user.id }, select: { throwingHand: true, dailyWorkoutMinutes: true, trainingLevel: true, trainingGoal: true, ownedEquipment: true } }),
      prisma.notification.findMany({ where: { userId: s.user.id }, orderBy: { createdAt: 'desc' }, take: 10, select: { kind: true, createdAt: true, readAt: true } }),
    ]);
    if (!u) return { text: '설정을 못 읽었어요.', error: true };
    return {
      text: [
        `설정: 던지는 손 ${u.throwingHand ?? '모름'} | 하루 운동 시간 ${u.dailyWorkoutMinutes ?? '기본'}분 | 웨이트 경력 ${u.trainingLevel ?? '모름'} | 목표 ${u.trainingGoal ?? '없음'} | 가진 장비 ${u.ownedEquipment.join(' · ') || '없음'}`,
        '최근 알림(날짜 | 종류 | 읽음 — 내용은 알림 화면에서):',
        ...(notes.length ? notes.map((n) => noticeLine({ date: toDateKey(n.createdAt), kind: n.kind, read: !!n.readAt })) : ['- 없음']),
      ].join('\n'),
    };
  },
  async read_exercise_info(s, input) {
    const drill = input.kind === '드릴';
    if (!canUse(s, drill ? 'mechanics' : 'training')) return { text: `이 사람은 지금 ${drill ? '메커니즘 드릴' : '트레이닝'}을 쓸 수 없어요.`, error: true };
    const list = drill ? await visibleGuides() : await visibleExercises();
    const q = norm(String(input.name ?? ''));
    if (!q) return { text: '이름을 주세요.', error: true };
    const exact = list.find((x) => norm(x.title) === q);
    const some = exact ? [exact] : list.filter((x) => norm(x.title).includes(q));
    if (!some.length) return { text: `그 이름의 ${input.kind}을 앱에서 못 찾았어요.` };
    if (some.length > 1) return { text: `이름이 맞는 ${input.kind}이 여럿이에요(정확한 이름으로 다시): ${some.slice(0, 8).map((x) => x.title).join(' · ')}` };
    const x = some[0];
    /* 설명은 앱 라이브러리 글(우리가 다듬은 것) — 기관 이름은 한 번 더 지우고, 길면 자른다 */
    const desc = scrubNames(x.description.trim()).slice(0, INFO_MAX);
    const head =
      'focusPoints' in x
        ? `${x.title} | 드릴 · ${x.category} | 요소 ${x.focusPoints.join(' · ') || '없음'} | 단계 ${x.stage ?? '모름'} | 장비 ${x.equipment.join(' · ') || '없음'}`
        : `${x.title} | ${x.category} | 강도 ${x.intensity} | 난이도 ${x.difficulty ?? '모름'} | 부위 ${x.bodyParts.join(' · ') || '없음'} | 장비 ${x.equipment.join(' · ') || '맨몸'} | 기본 처방 ${rxOf(x)}`;
    return { text: `${head}\n설명(앱 라이브러리 — 이 글 안에서만 답한다):\n${desc || '설명 없음'}` };
  },
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
      const p = name === 'change_today' ? await proposeTodayRaw(s.todayWork, raw) : ASSIST_TOOLS.has(name) ? await proposeAssist(s.user, s.today, name, raw) : propose(name, ctx, raw);
      if ('refuse' in p) return { text: `카드를 못 만들었어요: ${p.refuse}`, error: true };
      const card = name === 'change_week' ? { ...p.card, args: { ...(p.card.args as object), token: slotsKey(s.week) } } : p.card;
      const added = addCard(s.cards, card, CARDS_MAX);
      if ('refuse' in added) return { text: `카드를 못 만들었어요: ${added.refuse}`, error: true };
      return { text: `카드를 만들었어요(${card.title}). 사용자가 눌러야 바뀌어요 — 바꿨다고 말하지 마세요.` };
    },
  };
}
