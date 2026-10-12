/**
 * 트레이닝 추천 — DB 사용 통계(읽기만).
 *
 *   npm run training:usage
 *
 * 왜 있나. 추천 메커니즘 2판(docs/designs/training-recommendation-engine.md)의 결정 D2(체감 강도 0~100%) ·
 * D3(경기 다음 날을 달력이 아니라 부하로) · D4(성장기 16세 미만)와 P0 는 '지금 사용자가 실제로 무엇을 적고
 * 있나'를 숫자로 알아야 옮길 수 있다 — 등판 질문이 상세 체크인에만 있어 답이 거의 없다는 것, 운동 '마침'을
 * 누르는 날이 드물다는 것, 투구 강도 1~10 이 실제로 어떻게 쓰이는지, 16세 기준이 몇 명을 가르는지. P4 부터는 다음 등판
 * 짐작의 재료(⑦ — 달력 일정 이름의 낱말 · 같은 요일 경기)도 센다.
 * 단계(P1 ~ P6 · Y)마다 같은 도구로 다시 재서 전후를 견준다.
 *
 * 규칙. 운영 DB 를 그대로 읽는다(.env 의 DATABASE_URL — 개발 DB 가 곧 운영 DB 다). count · groupBy ·
 * findMany(select 최소)만 쓰고 아무것도 쓰지 않는다. 개인 정보(이메일 · 이름 · 메모 글)는 읽지도 찍지도
 * 않는다 — 집계 숫자만 stdout 에 마크다운 표로 낸다. 달력 일정 이름(⑦)만 낱말이 들었는지 보려고 메모리에 올리고,
 * 원문은 찍지 않는다. 1분 안에 끝나야 한다.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  effortPctOf,
  outingLoadOf,
  shiftDateKey,
  toDateKey,
} from '../lib/pitch-stats.ts';
import { ageFromBirthDate } from '../lib/profile.ts';
import {
  HARD_OUTING_MIN_LOAD,
  HARD_OUTING_MIN_PITCHES,
  NEAR_MAX_INTENSITY,
  OUTING_CALENDAR_DAYS,
  type ReportFacts,
} from '../lib/report/facts.ts';
import { YOUTH_AGE_THRESHOLD } from '../lib/report/plan.ts';
import { THROW_PLANS } from '../lib/checkin.ts';
import { REST_SESSION_TYPE } from '../lib/session-type.ts';
import { readPlanSwaps } from '../lib/report/plan-swaps.ts';
import {
  OUTING_TITLE_EXCLUDE_WORDS,
  OUTING_TITLE_WORDS,
  isOutingTitle,
} from '../lib/calendar-event.ts';
import {
  ESTIMATE_LOOKBACK_DAYS,
  ESTIMATE_MIN_GAMES,
  outingGuessInputsOf,
} from '../lib/engine/outing.ts';

const startedAt = Date.now();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/* ─────────────────────────── 작은 도구 ─────────────────────────── */

/** 오늘(서비스 시간대) 날짜 키. 날짜 칸(@db.Date)은 UTC 자정으로 저장돼 있어 키를 그대로 UTC 자정으로 만든다. */
const TODAY_KEY = toDateKey(new Date());

function dateOfKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/** n 일 전 날짜 키 */
function daysAgoKey(n: number): string {
  const d = dateOfKey(TODAY_KEY);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * '최근 n 일' 의 시작 키 — 오늘을 넣어 꼭 n 일(n − 1 일 전부터). daysAgoKey(n) 부터 gte 로 세면 n + 1 일이라,
 * 단계마다 견주는 수의 경계가 라벨과 어긋난다.
 */
function recentSinceKey(days: number): string {
  return daysAgoKey(days - 1);
}

function recentLabel(days: number): string {
  return `최근 ${days}일(${recentSinceKey(days)} 부터, 오늘 포함)`;
}

/** 배열 최댓값 — Math.max(...values) 는 수만 줄에서 호출 스택을 넘긴다 */
function maxOf(values: number[]): number {
  return values.reduce((a, b) => Math.max(a, b), 0);
}

/** @db.Date 값의 날짜 키 — facts.ts 가 쓰는 것과 같은 방식(앞 10자리) */
function keyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function pct(n: number, d: number): string {
  if (d <= 0) return '·';
  return `${((n / d) * 100).toFixed(1)}%`;
}

function withPct(n: number, d: number): string {
  return `${n} (${pct(n, d)})`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * q)));
  return s[pos];
}

function fmt(n: number | null, digits = 1): string {
  return n == null ? '·' : Number.isInteger(n) ? String(n) : n.toFixed(digits);
}

/** 마크다운 표 한 장. 표 안의 글자는 '|' 를 쓰지 않는다. */
function table(headers: string[], rows: (string | number)[][]) {
  const line = (cells: (string | number)[]) => `| ${cells.map(String).join(' | ')} |`;
  console.log(line(headers));
  console.log(`| ${headers.map(() => '---').join(' | ')} |`);
  for (const row of rows) console.log(line(row));
  console.log('');
}

function heading(title: string) {
  console.log(`## ${title}\n`);
}

/* ───────────────────── ① 체크인 — 등판 답이 얼마나 오나 ───────────────────── */

/*
 * 상세 전용 칸(지금): app/actions/checkin.ts 가 폼의 detail=1 표시가 있을 때만 쓰는 것 — 몸무게 · 식욕 · 메모 ·
 * 운동 종류 · 하고 싶은 부위. 간편 체크인은 몸 상태 · 컨디션(늘)과 body=1 선택 칸(잔 시간 · 근육통 · 끼니 양 ·
 * 걸른 끼니 · 팔 피로 · 던지는 일정), armpain=1(팔 통증 자리 · 정도)만 쓴다.
 *
 * '상세 줄' 은 **상세 칸이 하나라도 있는 줄**이다 — 하한이다. DB 에 폼 종류 칸이 없고, 상세 폼을 열고 아무것도
 * 안 적으면 detail=1 이라도 null 만 써서 간편 줄과 가를 수 없다. '등판 답 있음(상세 안)' 의 분모도 그래서
 * '상세 폼을 연 줄' 이 아니라 이 수다(등판 답이 있으면 상세 칸이 있으니 분자 ⊆ 분모는 맞다).
 *
 * 옛 상세 칸(전신 피로 · 스트레스 · 기분 · 아침 심박 · 수분 · 끼니)은 2026-09-30 에 화면에서 뺐다. 끼니(nutrition)만
 * 2026-10-07 에 간편의 body=1 칸으로 되살아나 같은 칸에 들어오므로, 날짜가 2026-09-30 전인 줄의 끼니만 옛 상세로
 * 친다(그 사이 일주일은 아무도 못 적었다). 지난 날짜를 나중에 간편으로 고친 줄은 못 가른다 — 어림이다.
 * '간편 선택 칸 있음' 은 칸이 있는 줄을 센다(어느 폼이 적었는지는 안 본다 — 잔 시간 · 근육통도 09-30 전엔 상세 칸이었다).
 *
 * 팔 피로 · 던지는 일정은 2026-10-12 에 간편(body=1)으로 옮겼다(팔 피로는 김민, 던지는 일정은 2판 D1). 끼니와 같은
 * 수법으로 그날 전 줄만 상세로, 그날부터는 간편 선택 칸으로 친다. 배포가 그날보다 늦어지면 QUICK_MOVE_KEY 를 고친다.
 * 그래서 '등판 답 있음(상세 줄 대비)' 은 그날 전 줄의 답만 센다(그날부터의 답은 상세 줄 안에 있지 않다).
 */
const QUICK_MOVE_KEY = '2026-10-12';
const beforeMove = { date: { lt: dateOfKey(QUICK_MOVE_KEY) } };
const sinceMove = { date: { gte: dateOfKey(QUICK_MOVE_KEY) } };
const DETAIL_NOW = {
  OR: [
    { AND: [{ armFatigue: { not: null } }, beforeMove] },
    { bodyWeightKg: { not: null } },
    { appetite: { not: null } },
    { AND: [{ throwPlan: { not: null } }, beforeMove] },
    { NOT: [{ note: null }, { note: '' }] },
    { preferredWorkout: { not: null } },
    { preferredParts: { isEmpty: false } },
  ],
};
const DETAIL_OLD = {
  OR: [
    { fatigue: { not: null } },
    { stress: { not: null } },
    { mood: { not: null } },
    { restingHr: { not: null } },
    { hydration: { not: null } },
    { AND: [{ nutrition: { not: null } }, { date: { lt: dateOfKey('2026-09-30') } }] },
  ],
};
const QUICK_OPTIONAL = {
  OR: [
    { sleepHours: { not: null } },
    { soreness: { not: null } },
    { nutrition: { not: null } },
    { skippedMeals: { isEmpty: false } },
    { AND: [{ armFatigue: { not: null } }, sinceMove] },
    { AND: [{ throwPlan: { not: null } }, sinceMove] },
  ],
};

async function checkinStats(sinceKey: string | null) {
  const range = sinceKey ? { date: { gte: dateOfKey(sinceKey) } } : {};
  /* range 와 옮긴 날 조건을 같이 — 둘 다 date 칸이라 펼치면 한쪽이 지워져서 AND 로 묶는다 */
  const [
    total,
    users,
    detailNow,
    detailAny,
    quickOpt,
    throwAny,
    throwOld,
    totalNew,
    throwNew,
    byPlan,
  ] = await Promise.all([
    prisma.dailyCheckin.count({ where: range }),
    prisma.dailyCheckin.groupBy({ by: ['userId'], where: range }),
    prisma.dailyCheckin.count({ where: { ...range, ...DETAIL_NOW } }),
    prisma.dailyCheckin.count({ where: { ...range, OR: [DETAIL_NOW, DETAIL_OLD] } }),
    prisma.dailyCheckin.count({ where: { ...range, ...QUICK_OPTIONAL } }),
    prisma.dailyCheckin.count({ where: { ...range, throwPlan: { not: null } } }),
    prisma.dailyCheckin.count({
      where: { AND: [range, beforeMove, { throwPlan: { not: null } }] },
    }),
    prisma.dailyCheckin.count({ where: { AND: [range, sinceMove] } }),
    prisma.dailyCheckin.count({
      where: { AND: [range, sinceMove, { throwPlan: { not: null } }] },
    }),
    prisma.dailyCheckin.groupBy({
      by: ['throwPlan'],
      where: { ...range, throwPlan: { not: null } },
      _count: { _all: true },
    }),
  ]);
  return {
    total,
    users: users.length,
    detailNow,
    detailAny,
    quickOpt,
    throwAny,
    throwOld,
    totalNew,
    throwNew,
    byPlan,
  };
}

async function sectionCheckin() {
  heading('① 체크인 — 등판 답(throwPlan)이 얼마나 오나');
  const [all, recent] = await Promise.all([
    checkinStats(null),
    checkinStats(recentSinceKey(30)),
  ]);

  const row = (label: string, s: Awaited<ReturnType<typeof checkinStats>>) => [
    label,
    s.total,
    s.users,
    withPct(s.detailNow, s.total),
    withPct(s.detailAny, s.total),
    withPct(s.quickOpt, s.total),
    withPct(s.throwAny, s.total),
    withPct(s.throwOld, s.detailNow),
    withPct(s.throwNew, s.totalNew),
  ];
  table(
    [
      '기간',
      '체크인 줄',
      '사용자',
      '상세 줄(지금 상세 칸이 하나라도, 하한)',
      '상세 줄(옛 상세 칸 포함, 하한)',
      '간편 선택 칸 있음(칸 기준)',
      '등판 답 있음(전체 대비)',
      `등판 답 있음(상세 줄 대비, ${QUICK_MOVE_KEY} 전 줄)`,
      `등판 답 있음(간편으로 옮긴 ${QUICK_MOVE_KEY} 부터 줄 대비)`,
    ],
    [row('전체', all), row(recentLabel(30), recent)]
  );

  const plans = new Map<string, { all: number; recent: number }>();
  for (const g of all.byPlan) {
    plans.set(g.throwPlan ?? '', { all: g._count._all, recent: 0 });
  }
  for (const g of recent.byPlan) {
    const key = g.throwPlan ?? '';
    const cur = plans.get(key) ?? { all: 0, recent: 0 };
    cur.recent = g._count._all;
    plans.set(key, cur);
  }
  const known = new Set<string>(THROW_PLANS);
  /* 한 줄도 없으면 빈 표가 아니라 '(없음)' 한 줄 — 빈 표는 질의가 깨진 것처럼 보인다 */
  const planRows: (string | number)[][] = [...plans.entries()]
    .sort((a, b) => b[1].all - a[1].all)
    .map(([value, c]) => [value, c.all, c.recent, known.has(value) ? '예' : '아니오']);
  table(
    ['throwPlan 값', '전체', '최근 30일', '목록(lib/checkin.ts THROW_PLANS)에 있나'],
    planRows.length > 0 ? planRows : [['(없음)', 0, 0, '·']]
  );
}

/* ───────────────────── ② 완료율 — 만든 일정 · 연 세션 · 마친 날 ───────────────────── */

/* swaps 는 뺀 · 바꾼 기록(lib/report/plan-swaps.ts, P2 ①) — ⑥ 되먹임 표가 readPlanSwaps 로 센다(countRecordedSwaps) */
type PlanPicks = {
  picks?: { exerciseId: string; manual?: boolean }[];
  swaps?: unknown;
} | null;
type FrozenLike = {
  exercises?: { id: string }[];
  program?: unknown;
  swaps?: unknown;
} | null;

/** 일정 · 세션 판은 이 수를 넘으면 메모리에 올리지 않는다(1분 안에 끝내려고). */
const PLAN_LOAD_LIMIT = 5000;

async function loadSetups() {
  const n = await prisma.dailyTrainingSetup.count();
  if (n > PLAN_LOAD_LIMIT) return { n, rows: null };
  const rows = await prisma.dailyTrainingSetup.findMany({
    select: { userId: true, date: true, plan: true, generatedAt: true },
  });
  return { n, rows };
}

async function loadSessions() {
  const n = await prisma.trainingSession.count();
  if (n > PLAN_LOAD_LIMIT) return { n, rows: null };
  const rows = await prisma.trainingSession.findMany({
    select: { userId: true, date: true, plan: true, status: true, endedAt: true },
  });
  return { n, rows };
}

/**
 * 일정(DailyTrainingSetup, plan 있는 줄만 — plan 이 없으면 아직 안 만든 날이다)과 세션(TrainingSession)을
 * 사용자 · 날짜로 짝짓는다. ② 의 '일정에서 연 세션' 과 ⑥ 의 '목록이 일정과 다른 세션' 이 같은 짝을 쓰게 한 곳에서
 * 센다 — 따로 세면 같은 뜻의 수가 두 곳에서 다르게 나온다. 판이 상한을 넘어 안 올렸으면 null.
 */
function pairSetupsAndSessions(
  setups: Awaited<ReturnType<typeof loadSetups>>,
  sessions: Awaited<ReturnType<typeof loadSessions>>
) {
  if (!setups.rows || !sessions.rows) return null;
  const setupBy = new Map<string, { ids: Set<string>; manual: number }>();
  let manualPicks = 0;
  let setupsWithManual = 0;
  for (const s of setups.rows) {
    if (s.plan == null) continue;
    const picks = (s.plan as PlanPicks)?.picks ?? [];
    const manual = picks.filter((p) => p.manual).length;
    manualPicks += manual;
    if (manual > 0) setupsWithManual += 1;
    setupBy.set(`${s.userId}|${keyOf(s.date)}`, {
      ids: new Set(picks.map((p) => p.exerciseId)),
      manual,
    });
  }
  let matched = 0;
  let changed = 0;
  let added = 0;
  let removed = 0;
  let noSetup = 0;
  for (const s of sessions.rows) {
    const ids = new Set(((s.plan as FrozenLike)?.exercises ?? []).map((e) => e.id));
    const setup = setupBy.get(`${s.userId}|${keyOf(s.date)}`);
    if (!setup) {
      noSetup += 1;
      continue;
    }
    matched += 1;
    const plus = [...ids].filter((id) => !setup.ids.has(id)).length;
    const minus = [...setup.ids].filter((id) => !ids.has(id)).length;
    if (plus > 0 || minus > 0) changed += 1;
    added += plus;
    removed += minus;
  }
  return {
    setupWithPlan: setupBy.size,
    matched,
    noSetup,
    changed,
    added,
    removed,
    manualPicks,
    setupsWithManual,
  };
}

type Pairing = ReturnType<typeof pairSetupsAndSessions>;

async function sectionCompletion(
  setups: Awaited<ReturnType<typeof loadSetups>>,
  sessions: Awaited<ReturnType<typeof loadSessions>>,
  pairing: Pairing
) {
  heading('② 완료율 — 만든 일정 · 연 세션 · 마친 날');

  const [byStatus, ended, finished, logsAll, logsDone, logUsers] = await Promise.all([
    prisma.trainingSession.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.trainingSession.count({ where: { endedAt: { not: null } } }),
    prisma.trainingSession.count({ where: { status: 'FINISHED' } }),
    prisma.userExerciseLog.count(),
    prisma.userExerciseLog.count({ where: { completed: true } }),
    prisma.userExerciseLog.groupBy({ by: ['userId'], where: { completed: true } }),
  ]);

  const setupWithPlan =
    setups.rows?.filter((r) => r.plan != null).length ??
    (await prisma.dailyTrainingSetup.count({ where: { generatedAt: { not: null } } }));
  const setupUsers = new Set(setups.rows?.map((r) => r.userId) ?? []).size;
  const programSessions =
    sessions.rows?.filter((r) => (r.plan as FrozenLike)?.program != null).length ??
    null;

  /*
   * '마침' 은 사람이 [종료]를 누른 판(FINISHED)이다. endedAt 은 떠난 판을 저절로 닫을 때(lib/workout/close-stale.ts,
   * ABANDONED)도 찍히므로 완료율이 아니다 — 라벨에 '버린 판 포함' 을 적어 둔다.
   */
  table(
    ['항목', '수'],
    [
      [
        'DailyTrainingSetup 줄(일정 만든 날, plan 있음)',
        `${setupWithPlan} / ${setups.n}`,
      ],
      ['  일정을 만든 사용자', setups.rows ? setupUsers : '·'],
      ['TrainingSession 줄(운동 시작)', sessions.n],
      ...byStatus.map((g) => [
        `  status = ${g.status}`,
        withPct(g._count._all, sessions.n),
      ]),
      [
        '  마친 세션(status FINISHED, 사람이 종료를 누름)',
        withPct(finished, sessions.n),
      ],
      ['  닫힌 세션(endedAt 있음, 버린 판 포함)', withPct(ended, sessions.n)],
      ['  프로그램 날 세션(plan.program 있음)', programSessions ?? '·'],
      [
        '일정에서 연 세션 / 일정 만든 날(같은 사용자 · 날짜)',
        pairing
          ? `${pairing.matched} / ${pairing.setupWithPlan} (${pct(pairing.matched, pairing.setupWithPlan)})`
          : '·',
      ],
      ['  일정 없이 열린 세션(프로그램 날 · 옛 자료)', pairing ? pairing.noSetup : '·'],
      ['UserExerciseLog 줄(전체)', logsAll],
      ['  completed = true', withPct(logsDone, logsAll)],
      ['  completed 를 남긴 사용자', logUsers.length],
    ]
  );

  /*
   * 던진 날 대비 운동 마친 날 — lib/report/training-review.ts 와 같은 정의(마친 날 = completed 줄이 있는 날,
   * 던진 날 = pitchCount > 0 인 기록이 있는 날). 사람이 [종료]를 누른 세션(FINISHED)으로 센 날도 옆에 둔다 —
   * 세트만 남기고 '마침'을 안 누른 날이 얼마나 되는지 보려고(endedAt 으로 세면 버린 판까지 들어온다).
   */
  const sinceDate = dateOfKey(recentSinceKey(120));
  const [thrown, trainedLog, trainedSession] = await Promise.all([
    prisma.pitchLog.findMany({
      where: { date: { gte: sinceDate }, pitchCount: { gt: 0 } },
      select: { userId: true, date: true },
      distinct: ['userId', 'date'],
    }),
    prisma.userExerciseLog.findMany({
      where: { date: { gte: sinceDate }, completed: true },
      select: { userId: true, date: true },
      distinct: ['userId', 'date'],
    }),
    prisma.trainingSession.findMany({
      where: { date: { gte: sinceDate }, status: 'FINISHED' },
      select: { userId: true, date: true },
    }),
  ]);
  type Per = { thrown: Set<string>; log: Set<string>; session: Set<string> };
  const per = new Map<string, Per>();
  const of = (userId: string) => {
    let p = per.get(userId);
    if (!p) {
      p = { thrown: new Set(), log: new Set(), session: new Set() };
      per.set(userId, p);
    }
    return p;
  };
  for (const r of thrown) of(r.userId).thrown.add(keyOf(r.date));
  for (const r of trainedLog) of(r.userId).log.add(keyOf(r.date));
  for (const r of trainedSession) of(r.userId).session.add(keyOf(r.date));

  const everyone = [...per.values()];
  const throwers = everyone.filter((p) => p.thrown.size > 0);
  const sum = (list: Per[], f: (p: Per) => number) =>
    list.reduce((a, p) => a + f(p), 0);
  const both = (p: Per) => [...p.thrown].filter((d) => p.log.has(d)).length;
  const ratio = throwers.map((p) => p.log.size / p.thrown.size);
  const ratioSession = throwers.map((p) => p.session.size / p.thrown.size);
  const thrownDays = sum(throwers, (p) => p.thrown.size);

  /*
   * '… / 던진 날(던진 사용자만)' 은 분자 · 분모 모두 던진 사용자의 날만 더한다. 분자를 전체 사용자로 더하면
   * 운동만 하고 던진 기록이 없는 사용자의 날이 끼어 비율이 부풀고(100% 를 넘을 수도), 옆의 사용자별 중앙값과 어긋난다.
   */
  table(
    [recentLabel(120), '합계', '사용자별 중앙값', '사용자 수'],
    [
      [
        '던진 날',
        thrownDays,
        fmt(median(throwers.map((p) => p.thrown.size))),
        throwers.length,
      ],
      [
        '운동 마친 날(completed 줄)',
        sum(everyone, (p) => p.log.size),
        fmt(median(everyone.filter((p) => p.log.size > 0).map((p) => p.log.size))),
        everyone.filter((p) => p.log.size > 0).length,
      ],
      [
        '세션 마친 날(status FINISHED)',
        sum(everyone, (p) => p.session.size),
        fmt(
          median(everyone.filter((p) => p.session.size > 0).map((p) => p.session.size))
        ),
        everyone.filter((p) => p.session.size > 0).length,
      ],
      [
        '던지고 같은 날 운동도 마침',
        sum(throwers, both),
        fmt(median(throwers.map(both))),
        '·',
      ],
      [
        '마친 날 / 던진 날(던진 사용자만)',
        pct(
          sum(throwers, (p) => p.log.size),
          thrownDays
        ),
        fmt(median(ratio), 2),
        throwers.length,
      ],
      [
        '세션 마친 날 / 던진 날(던진 사용자만)',
        pct(
          sum(throwers, (p) => p.session.size),
          thrownDays
        ),
        fmt(median(ratioSession), 2),
        throwers.length,
      ],
    ]
  );
}

/* ───────────────────── ③ 투구 강도 — D2 · D3 의 바탕 ───────────────────── */

/**
 * 옛 '세게 던진 날' 규칙의 강도 문턱(1~10) — 2026-10-03 사용자분과 정한 '경기, 또는 강도 9~10'. 앱은 2판 D2(2026-10-12)부터
 * 투구수 × 체감 강도(HARD_OUTING_MIN_LOAD)로 가르고, P3 검토(같은 날)부터 이 옛 규칙도 같이 본다 — 85% × 30 처럼 곱이 2,700 밑인
 * 날이 빠지지 않게(facts.ts isHardOuting 의 nearMaxPitches · NEAR_MAX_INTENSITY). 그래서 '지금 정의'는 둘 중 하나다.
 */
const OLD_NEAR_MAX_INTENSITY = NEAR_MAX_INTENSITY;

async function sectionIntensity() {
  heading(
    `③ 투구 강도(PitchLog.intensity 1~10 · effortPct 5~100%) — '세게 던진 날' 지금 정의(2판 D2 · P3 검토): 그날 투구수 × 체감 강도 ≥ ${HARD_OUTING_MIN_LOAD.toLocaleString('en-US')}(경기 100%) 또는 옛 정의 · 옛 정의: 경기 또는 강도 ${OLD_NEAR_MAX_INTENSITY}~10 으로 그날 합쳐 ${HARD_OUTING_MIN_PITCHES}구 이상`
  );
  /* 휴식 기록은 투구수 · 강도가 0 이라 강도 분포에서 뺀다 — 넣으면 0 이 '약하게 던짐'처럼 보인다. */
  const thrownWhere = {
    sessionType: { not: REST_SESSION_TYPE },
    pitchCount: { gt: 0 },
  };
  /** 던진 기록이 이 수를 넘으면 날 단위 표(기록을 메모리에 올림)는 건너뛴다 */
  const PITCH_LOAD_LIMIT = 50000;
  const [
    total,
    rest,
    thrown,
    zeroNotRest,
    userGroups,
    byIntensity,
    byEffort,
    byType,
    byCount,
  ] = await Promise.all([
    prisma.pitchLog.count(),
    prisma.pitchLog.count({ where: { sessionType: REST_SESSION_TYPE } }),
    prisma.pitchLog.count({ where: thrownWhere }),
    /* 휴식이 아닌데 투구수 0 — API(app/api/pitch-log/route.ts)는 막지만 다른 길(재활 · 구속)이 생기면 여기 잡힌다 */
    prisma.pitchLog.count({
      where: { sessionType: { not: REST_SESSION_TYPE }, pitchCount: { lte: 0 } },
    }),
    prisma.pitchLog.groupBy({ by: ['userId'], where: thrownWhere }),
    prisma.pitchLog.groupBy({
      by: ['intensity'],
      where: thrownWhere,
      _count: { _all: true },
      orderBy: { intensity: 'asc' },
    }),
    /* 체감 강도(%) 분포 — 두 칸을 같이 묶어야 옛 줄(effortPct null)을 intensity × 10 으로 읽을 수 있다 */
    prisma.pitchLog.groupBy({
      by: ['effortPct', 'intensity'],
      where: thrownWhere,
      _count: { _all: true },
    }),
    prisma.pitchLog.groupBy({
      by: ['sessionType'],
      where: thrownWhere,
      _count: { _all: true },
      _avg: { intensity: true, pitchCount: true },
      _sum: { pitchCount: true },
    }),
    prisma.pitchLog.groupBy({
      by: ['pitchCount'],
      where: thrownWhere,
      _count: { _all: true },
    }),
  ]);

  table(
    ['항목', '수'],
    [
      ['PitchLog 줄(전체)', total],
      [`  휴식 기록(${REST_SESSION_TYPE})`, rest],
      ['  던진 기록(투구수 > 0, 휴식 제외)', thrown],
      ['  던지지 않은 기록(휴식 아님 · 투구수 0, 위 둘에 안 듦)', zeroNotRest],
      ['  던진 기록을 남긴 사용자', userGroups.length],
    ]
  );

  table(
    ['강도', '기록 수', '비율'],
    byIntensity.map((g) => [g.intensity, g._count._all, pct(g._count._all, thrown)])
  );

  /*
   * 체감 강도(%) 분포(2판 D2) — 계산이 읽는 값(effortPctOf: % 로 적었으면 그것, 옛 줄은 강도 × 10)으로 모은다. % 로 적은 줄과
   * 옛 줄을 나란히 세서 이행이 얼마나 됐는지 본다(옛 줄 수는 2026-10-12 전 던진 기록 수에서 시작해 늘지 않아야 한다).
   * 5% 단위 칩이라 15 · 85 같은 값은 % 로 적은 줄에서만 나온다.
   */
  const effortRows = new Map<number, { pct: number; old: number }>();
  for (const g of byEffort) {
    const value = effortPctOf(g);
    const row = effortRows.get(value) ?? { pct: 0, old: 0 };
    if (g.effortPct != null) row.pct += g._count._all;
    else row.old += g._count._all;
    effortRows.set(value, row);
  }
  const effortPctCount = byEffort
    .filter((g) => g.effortPct != null)
    .reduce((s, g) => s + g._count._all, 0);
  table(
    ['체감 강도(%)', '기록 수', '% 로 적음', '옛 줄(강도 × 10)', '비율'],
    [
      ...[...effortRows.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([value, r]) => [
          `${value}%`,
          r.pct + r.old,
          r.pct,
          r.old,
          pct(r.pct + r.old, thrown),
        ]),
      [
        '합계',
        thrown,
        effortPctCount,
        thrown - effortPctCount,
        `% 로 적음 ${pct(effortPctCount, thrown)}`,
      ],
    ]
  );

  table(
    ['종류', '기록 수', '평균 강도', '평균 투구수', '투구수 합'],
    byType
      .sort((a, b) => b._count._all - a._count._all)
      .map((g) => [
        g.sessionType,
        g._count._all,
        fmt(g._avg.intensity),
        fmt(g._avg.pitchCount),
        g._sum.pitchCount ?? 0,
      ])
  );

  /* 투구수 10구 단위 — 마지막 칸은 100구 이상을 모은다 */
  const buckets = new Map<number, number>();
  for (const g of byCount) {
    const b = Math.min(100, Math.floor(g.pitchCount / 10) * 10);
    buckets.set(b, (buckets.get(b) ?? 0) + g._count._all);
  }
  table(
    ['투구수', '기록 수', '비율'],
    [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([b, n]) => [b >= 100 ? '100구 이상' : `${b}~${b + 9}구`, n, pct(n, thrown)])
  );

  /*
   * 기록 단위와 날 단위를 따로 센다. 지금 규칙(2판 D2 — facts.ts outingByDay → isHardOuting)은 날 단위다 — 기록마다
   * 투구수 × 체감 강도(%)(경기 100%, pitch-stats.ts outingLoadOf)를 그날 합쳐 2,700 이상이면 '세게 던진 날'. 옛 규칙(경기이거나
   * 강도 9~10 인 기록의 투구수를 그날 합쳐 30구 이상)도 나란히 센다 — 지금 규칙은 옛 규칙의 날도 세게로 본다(P3 검토 — 곱만 보면
   * 85% × 30 이 빠졌다). 새로 세게가 되는 날이 몇인지가 D2 로 달라지는 몫이다.
   *
   * 날 단위는 기록을 메모리에 올려 센다 — 기록이 상한을 넘으면 이 절만 건너뛴다(1분 안에 끝내려고).
   */
  if (thrown > PITCH_LOAD_LIMIT) {
    table(
      ['세게 던진 날 정의에 비춘 것', '수'],
      [['(건너뜀)', `던진 기록이 ${PITCH_LOAD_LIMIT}줄을 넘어 날 단위 표를 안 만든다`]]
    );
    return;
  }
  const logs = await prisma.pitchLog.findMany({
    where: thrownWhere,
    select: {
      userId: true,
      date: true,
      sessionType: true,
      intensity: true,
      effortPct: true,
      pitchCount: true,
    },
  });
  /* 옛 규칙 — 1~10 칸으로 본다(% 로 적은 기록도 저장된 intensity 로) */
  const isNearMax = (l: { sessionType: string; intensity: number }) =>
    l.sessionType === '경기' || Math.round(l.intensity) >= OLD_NEAR_MAX_INTENSITY;
  const nearMaxLogs = logs.filter(isNearMax);
  const nearMaxGame = logs.filter((l) => l.sessionType === '경기');
  const gameBelow = nearMaxGame.filter(
    (l) => Math.round(l.intensity) < OLD_NEAR_MAX_INTENSITY
  );
  const nearMaxNotGame = logs.filter(
    (l) => l.sessionType !== '경기' && Math.round(l.intensity) >= OLD_NEAR_MAX_INTENSITY
  );
  const pctLogs = logs.filter((l) => l.effortPct != null);

  type Day = {
    pitches: number;
    nearMax: number;
    /** 투구수 × 체감 강도(%) — 경기 특례 없음(D3 미리보기) */
    load: number;
    /** 세게 던진 날을 가리는 몫 — 경기 100%(outingLoadOf) */
    hardLoad: number;
  };
  const days = new Map<string, Day>();
  for (const l of logs) {
    const key = `${l.userId}|${keyOf(l.date)}`;
    const d = days.get(key) ?? { pitches: 0, nearMax: 0, load: 0, hardLoad: 0 };
    d.pitches += l.pitchCount;
    if (isNearMax(l)) d.nearMax += l.pitchCount;
    d.load += l.pitchCount * effortPctOf(l);
    d.hardLoad += outingLoadOf(l);
    days.set(key, d);
  }
  const dayList = [...days.values()];
  /* facts.ts isHardOuting 과 같은 판정 — 곱이 문턱 이상이거나 옛 규칙의 재료(nearMaxPitches)가 30구 이상 */
  const hardDays = dayList.filter(
    (d) => d.hardLoad >= HARD_OUTING_MIN_LOAD || d.nearMax >= HARD_OUTING_MIN_PITCHES
  );
  const oldHardDays = dayList.filter((d) => d.nearMax >= HARD_OUTING_MIN_PITCHES);
  const newlyHard = hardDays.filter((d) => d.nearMax < HARD_OUTING_MIN_PITCHES);
  const droppedHard = oldHardDays.filter((d) => d.hardLoad < HARD_OUTING_MIN_LOAD);
  const nearMaxDaysUnder = dayList.filter(
    (d) => d.nearMax > 0 && d.nearMax < HARD_OUTING_MIN_PITCHES
  );

  table(
    ['세게 던진 날 정의에 비춘 것', '수', '비율'],
    [
      [
        '던진 기록 중 % 로 적은 것(effortPct 있음)',
        pctLogs.length,
        pct(pctLogs.length, thrown),
      ],
      [
        '던진 기록 중 경기 또는 강도 9~10',
        nearMaxLogs.length,
        pct(nearMaxLogs.length, thrown),
      ],
      ['  그중 경기 기록', nearMaxGame.length, pct(nearMaxGame.length, thrown)],
      [
        '  경기인데 강도 9 미만(경기라서만 세게로 분류)',
        gameBelow.length,
        pct(gameBelow.length, nearMaxGame.length),
      ],
      [
        '  경기 아닌데 강도 9~10',
        nearMaxNotGame.length,
        pct(nearMaxNotGame.length, thrown),
      ],
      [
        `던진 기록 중 그 기록만으로 지금 정의에 드는 것(투구수 × 체감 강도 ≥ ${HARD_OUTING_MIN_LOAD.toLocaleString('en-US')})`,
        logs.filter((l) => outingLoadOf(l) >= HARD_OUTING_MIN_LOAD).length,
        pct(logs.filter((l) => outingLoadOf(l) >= HARD_OUTING_MIN_LOAD).length, thrown),
      ],
      ['던진 날(사용자 · 날짜)', dayList.length, '·'],
      [
        `  세게 던진 날(지금 정의 — 날 단위, 합쳐 ${HARD_OUTING_MIN_LOAD.toLocaleString('en-US')} 이상 또는 옛 정의)`,
        hardDays.length,
        pct(hardDays.length, dayList.length),
      ],
      [
        `  옛 정의로 세게 던진 날(경기 또는 9~10 을 합쳐 ${HARD_OUTING_MIN_PITCHES}구 이상)`,
        oldHardDays.length,
        pct(oldHardDays.length, dayList.length),
      ],
      [
        '  새로 세게가 된 날(옛 정의로는 아님 — 많이 가볍게 던진 날)',
        newlyHard.length,
        pct(newlyHard.length, dayList.length),
      ],
      [
        '  옛 정의로만 세게 던진 날(곱은 문턱 밑 — % 로 85% 같은 값을 적은 날. 지금 정의가 옛 정의로 지킨다)',
        droppedHard.length,
        pct(droppedHard.length, dayList.length),
      ],
      [
        `  경기 또는 9~10 으로 던졌지만 ${HARD_OUTING_MIN_PITCHES}구 미만(옛 정의로는 세게 아님)`,
        nearMaxDaysUnder.length,
        pct(nearMaxDaysUnder.length, dayList.length),
      ],
    ]
  );

  const loads = dayList.map((d) => d.load);
  const pitches = dayList.map((d) => d.pitches);
  const hardLoads = hardDays.map((d) => d.hardLoad);
  const spread = (label: string, values: number[]) => [
    label,
    fmt(quantile(values, 0.5)),
    fmt(quantile(values, 0.75)),
    fmt(quantile(values, 0.9)),
    fmt(maxOf(values)),
  ];
  table(
    ['하루 단위(D2 · D3 미리보기)', 'p50', 'p75', 'p90', '최대'],
    [
      spread('하루 투구수', pitches),
      spread('하루 투구수 × 체감 강도(%, effortPctOf — 경기 특례 없음)', loads),
      spread('세게 던진 날의 투구수 × 체감 강도(경기 100%)', hardLoads),
    ]
  );
}

/* ───────────────────── ④ 나이 — D4(16세 미만 = 성장기) 가 몇 명을 가르나 ───────────────────── */

async function sectionAge() {
  heading(
    `④ 나이(User.birthDate, 오늘 ${TODAY_KEY} 기준 만 나이) — 지금 성장기 기준 ${YOUTH_AGE_THRESHOLD}세 미만, D4 는 16세 미만`
  );
  const users = await prisma.user.findMany({
    select: { birthDate: true, trainingSetupAt: true, pitchSetupAt: true },
  });
  const today = new Date();
  const bands = new Map<string, { all: number; training: number; pitch: number }>();
  const bandOf = (age: number | null) => {
    if (age == null) return '모름';
    if (age < 13) return '13세 미만';
    if (age <= 15) return '13~15세';
    if (age <= 18) return '16~18세';
    return '19세 이상';
  };
  const order = ['13세 미만', '13~15세', '16~18세', '19세 이상', '모름'];
  for (const b of order) bands.set(b, { all: 0, training: 0, pitch: 0 });
  let age15 = 0;
  let youthNow = 0;
  let youthD4 = 0;
  for (const u of users) {
    const age = u.birthDate ? ageFromBirthDate(u.birthDate, today) : null;
    const band = bands.get(bandOf(age))!;
    band.all += 1;
    if (u.trainingSetupAt) band.training += 1;
    if (u.pitchSetupAt) band.pitch += 1;
    if (age === 15) age15 += 1;
    if (age != null && age < YOUTH_AGE_THRESHOLD) youthNow += 1;
    if (age != null && age < 16) youthD4 += 1;
  }
  table(
    ['나이 띠', '사용자', '그중 트레이닝 첫 설정 마침', '그중 투구 첫 설정 마침'],
    [
      ...order.map((b) => {
        const band = bands.get(b)!;
        return [b, band.all, band.training, band.pitch];
      }),
      [
        '합계',
        users.length,
        users.filter((u) => u.trainingSetupAt).length,
        users.filter((u) => u.pitchSetupAt).length,
      ],
    ]
  );
  table(
    ['성장기로 보는 사용자', '수'],
    [
      [`지금(${YOUTH_AGE_THRESHOLD}세 미만)`, youthNow],
      ['D4(16세 미만)', youthD4],
      ['  그중 만 15세(D4 로 성장기가 되는 사람)', age15],
    ]
  );
}

/* ───────────────────── ⑤ 라이브러리 — 추천이 읽는 칸이 얼마나 채워졌나 ───────────────────── */

async function sectionLibrary() {
  heading('⑤ 운동 라이브러리(ExerciseVideo, hiddenAt null)');
  const [hidden, rows] = await Promise.all([
    prisma.exerciseVideo.count({ where: { hiddenAt: { not: null } } }),
    prisma.exerciseVideo.findMany({
      where: { hiddenAt: null },
      select: {
        category: true,
        intensity: true,
        difficulty: true,
        movementPattern: true,
        targetMuscles: true,
        bodyParts: true,
        equipment: true,
        sets: true,
        reps: true,
        holdSeconds: true,
        restSeconds: true,
        source: true,
        detailsFilledAt: true,
      },
    }),
  ]);
  const n = rows.length;
  const filled = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
  table(
    ['항목', '수', '채움률'],
    [
      ['보이는 운동', n, '·'],
      ['숨긴 운동', hidden, '·'],
      [
        'movementPattern 있음',
        filled((r) => r.movementPattern != null),
        pct(
          filled((r) => r.movementPattern != null),
          n
        ),
      ],
      [
        'difficulty 있음',
        filled((r) => r.difficulty != null),
        pct(
          filled((r) => r.difficulty != null),
          n
        ),
      ],
      [
        'targetMuscles 있음',
        filled((r) => r.targetMuscles.length > 0),
        pct(
          filled((r) => r.targetMuscles.length > 0),
          n
        ),
      ],
      [
        'bodyParts 있음',
        filled((r) => r.bodyParts.length > 0),
        pct(
          filled((r) => r.bodyParts.length > 0),
          n
        ),
      ],
      /*
       * '맨몸' 도 EXERCISE_EQUIPMENT(lib/exercise-meta.ts)의 값이라 맨몸 운동도 ['맨몸'] 으로 채워진다 — equipment 가
       * 빈 줄은 등록 오류다. 그래서 '있음' 대신 맨몸뿐 · 장비 필요로 가른다(장비 거르기 canDo 는 '모두 있어야 함').
       */
      [
        'equipment 비어 있음(등록 오류 — 0 이어야 한다)',
        filled((r) => r.equipment.length === 0),
        pct(
          filled((r) => r.equipment.length === 0),
          n
        ),
      ],
      [
        'equipment 가 맨몸뿐',
        filled((r) => r.equipment.length === 1 && r.equipment[0] === '맨몸'),
        pct(
          filled((r) => r.equipment.length === 1 && r.equipment[0] === '맨몸'),
          n
        ),
      ],
      [
        '장비 필요(맨몸 아닌 것이 하나라도)',
        filled((r) => r.equipment.some((e) => e !== '맨몸')),
        pct(
          filled((r) => r.equipment.some((e) => e !== '맨몸')),
          n
        ),
      ],
      [
        'sets 있음',
        filled((r) => r.sets != null),
        pct(
          filled((r) => r.sets != null),
          n
        ),
      ],
      [
        'reps 또는 holdSeconds 있음',
        filled((r) => r.reps != null || r.holdSeconds != null),
        pct(
          filled((r) => r.reps != null || r.holdSeconds != null),
          n
        ),
      ],
      [
        'sets 와 reps/holdSeconds 둘 다(처방 한 줄이 나옴)',
        filled((r) => r.sets != null && (r.reps != null || r.holdSeconds != null)),
        pct(
          filled((r) => r.sets != null && (r.reps != null || r.holdSeconds != null)),
          n
        ),
      ],
      [
        'restSeconds 있음',
        filled((r) => r.restSeconds != null),
        pct(
          filled((r) => r.restSeconds != null),
          n
        ),
      ],
      [
        'detailsFilledAt 있음(세부 정보 채움)',
        filled((r) => r.detailsFilledAt != null),
        pct(
          filled((r) => r.detailsFilledAt != null),
          n
        ),
      ],
      [
        'source = OWN(직접 찍은 영상)',
        filled((r) => r.source === 'OWN'),
        pct(
          filled((r) => r.source === 'OWN'),
          n
        ),
      ],
    ]
  );

  const countBy = (f: (r: (typeof rows)[number]) => string) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(f(r), (m.get(f(r)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  table(
    ['intensity', '수', '비율'],
    countBy((r) => r.intensity).map(([k, v]) => [k, v, pct(v, n)])
  );
  table(
    ['difficulty', '수', '비율'],
    countBy((r) => r.difficulty ?? '(없음)').map(([k, v]) => [k, v, pct(v, n)])
  );
  table(
    ['movementPattern', '수', '비율'],
    countBy((r) => r.movementPattern ?? '(없음)').map(([k, v]) => [k, v, pct(v, n)])
  );
  table(
    ['category', '수', '비율'],
    countBy((r) => r.category).map(([k, v]) => [k, v, pct(v, n)])
  );
}

/* ───────────────────── ⑥ 되먹임 — 운동 바꾸기 · 힘듦이 어디에 남나 ───────────────────── */

/**
 * 기록된 바꾸기(P2 ①, lib/report/plan-swaps.ts)를 센다. 세션에서 바꾼 것은 세션 판과 그날 일정에 같은 at 으로
 * 적히므로 gather.ts 의 swappedOutRecently 와 같은 열쇠(사용자 · 날짜 · from · kind · at)로 한 번만 센다 —
 * 두 출처를 따로 더하면 세션에서 바꾼 것이 두 번 잡힌다. 판이 상한을 넘어 안 올렸으면 null.
 */
function countRecordedSwaps(
  setups: Awaited<ReturnType<typeof loadSetups>>,
  sessions: Awaited<ReturnType<typeof loadSessions>>
) {
  if (!setups.rows || !sessions.rows) return null;
  const seen = new Set<string>();
  const byKind = new Map<string, number>();
  const byWhere = new Map<string, number>();
  const users = new Set<string>();
  const days = new Set<string>();
  let setupsWith = 0;
  let sessionsWith = 0;
  const tally = (userId: string, date: Date, plan: unknown): boolean => {
    const swaps = readPlanSwaps(plan);
    for (const s of swaps) {
      const key = `${userId}|${keyOf(date)}|${s.from}|${s.kind}|${s.at}`;
      if (seen.has(key)) continue;
      seen.add(key);
      byKind.set(s.kind, (byKind.get(s.kind) ?? 0) + 1);
      byWhere.set(s.where, (byWhere.get(s.where) ?? 0) + 1);
      users.add(userId);
      days.add(`${userId}|${keyOf(date)}`);
    }
    return swaps.length > 0;
  };
  for (const s of setups.rows) if (tally(s.userId, s.date, s.plan)) setupsWith += 1;
  for (const s of sessions.rows) if (tally(s.userId, s.date, s.plan)) sessionsWith += 1;
  return {
    entries: seen.size,
    kind: (k: string) => byKind.get(k) ?? 0,
    where: (w: string) => byWhere.get(w) ?? 0,
    setupsWith,
    sessionsWith,
    users: users.size,
    days: days.size,
  };
}

async function sectionFeedback(
  setups: Awaited<ReturnType<typeof loadSetups>>,
  sessions: Awaited<ReturnType<typeof loadSessions>>,
  pairing: Pairing
) {
  heading('⑥ 되먹임 기록 — 운동 바꾸기 · 힘듦(sRPE) 이 지금 어디에 남나');
  const [notes, noteUsers, noteByIntensity, noteDays, sets, setsWithRir, setUsers] =
    await Promise.all([
      prisma.dailyTrainingNote.count(),
      prisma.dailyTrainingNote.groupBy({ by: ['userId'] }),
      prisma.dailyTrainingNote.groupBy({
        by: ['intensity'],
        _count: { _all: true },
        orderBy: { intensity: 'asc' },
      }),
      /* 힘듦 줄이 있는 날 — 세션 판과 짝지으려고 사용자 · 날짜만(메모 글은 읽지 않는다) */
      prisma.dailyTrainingNote.findMany({ select: { userId: true, date: true } }),
      prisma.userExerciseSet.count(),
      prisma.userExerciseSet.count({ where: { rir: { not: null } } }),
      prisma.userExerciseSet.groupBy({ by: ['userId'] }),
    ]);

  /*
   * 운동 바꾸기는 2026-10-12(P2 ①)부터 기록이 남는다 — 운동 화면의 빼기 · 교체는 세션 판과 그날 일정의 swaps 에,
   * 일정 화면의 빼기는 일정의 swaps 에(lib/report/plan-swaps.ts). 그 전 판에는 칸이 없어 '세션 판의 운동 목록이
   * 그날 일정(DailyTrainingSetup.plan.picks)과 다른가'로 어림한 수를 곁들인다 — 더한 것 · 뺀 것 · 바꾼 것이 모두
   * 잡히지만 무엇이었는지는 모른다. 일정의 picks.manual 은 사용자가 트레이닝 화면에서 직접 더한 것
   * (app/actions/plan-edit.ts)이라 따로 센다. 짝은 ② 와 같은 pairSetupsAndSessions 한 곳에서 맞춘다.
   */
  const recorded = countRecordedSwaps(setups, sessions);
  const skipped = `판이 ${PLAN_LOAD_LIMIT}줄을 넘어 건너뜀`;
  const swapRows: (string | number)[][] = recorded
    ? [
        [
          '운동 바꾸기 기록(swaps, P2 ① 2026-10-12 부터 — 같은 줄은 한 번)',
          recorded.entries,
        ],
        [
          '  교체(replace) · 더하기(add) · 빼기(remove)',
          `${recorded.kind('replace')} · ${recorded.kind('add')} · ${recorded.kind('remove')}`,
        ],
        [
          '  운동 화면(session) · 일정 화면(plan)',
          `${recorded.where('session')} · ${recorded.where('plan')}`,
        ],
        [
          '  기록이 있는 일정 · 세션 판',
          `${recorded.setupsWith} / ${setups.n} · ${recorded.sessionsWith} / ${sessions.n}`,
        ],
        ['  기록을 남긴 사용자 · 날', `${recorded.users} · ${recorded.days}`],
      ]
    : [['운동 바꾸기 기록(swaps, P2 ①)', skipped]];
  let diffRows: (string | number)[][];
  if (pairing) {
    const { matched, noSetup, changed, added, removed, manualPicks, setupsWithManual } =
      pairing;
    diffRows = [
      [
        '  어림(기록 전 판까지): 그날 일정과 짝이 맞는 세션',
        `${matched} / ${sessions.n}`,
      ],
      ['  어림: 일정 없이 열린 세션(프로그램 · 옛 자료)', noSetup],
      ['  어림: 목록이 일정과 다른 세션', withPct(changed, matched)],
      ['  어림: 일정에 없던 운동(더함 · 바꿔 넣음)', added],
      ['  어림: 일정에서 빠진 운동(뺌 · 바꿔 나감)', removed],
      ['일정에 사용자가 직접 더한 운동(picks.manual)', manualPicks],
      ['  직접 더한 운동이 있는 일정', withPct(setupsWithManual, setups.n)],
    ];
  } else {
    diffRows = [['  어림', skipped]];
  }

  /*
   * 마친 판 중 힘듦을 남긴 비율(P2 ②) — 축하 화면의 칩 넷이 누름 수를 줄였으니 이 수가 올라야 한다. 힘듦은 날짜마다
   * 한 줄이라 세션 날짜(keyOf)로 짝짓는다(rateWorkoutEffort · finishWorkout 이 같은 날짜 규칙). 판을 안 올렸으면 '·'.
   */
  const noteDayKeys = new Set(noteDays.map((n) => `${n.userId}|${keyOf(n.date)}`));
  const finishedRows = sessions.rows?.filter((s) => s.status === 'FINISHED') ?? null;
  const withNote = (rows: typeof finishedRows) =>
    rows
      ? rows.filter((s) => noteDayKeys.has(`${s.userId}|${keyOf(s.date)}`)).length
      : null;
  const finishedWithNote = withNote(finishedRows);
  const allWithNote = withNote(sessions.rows);

  table(
    ['항목', '수'],
    [
      ...swapRows,
      ...diffRows,
      ['운동 힘듦(sRPE 꼴): DailyTrainingNote.intensity 1~10, 하루 한 줄', notes],
      ['  적은 사용자', noteUsers.length],
      [
        '  마친 판(FINISHED) 중 그날 힘듦 줄이 있는 판',
        finishedRows && finishedWithNote != null
          ? withPct(finishedWithNote, finishedRows.length)
          : '·',
      ],
      [
        '  세션 판(전체) 중 그날 힘듦 줄이 있는 판',
        sessions.rows && allWithNote != null ? withPct(allWithNote, sessions.n) : '·',
      ],
      ['세트 줄(UserExerciseSet)', sets],
      ['  rir(몇 개 더?) 있는 세트', withPct(setsWithRir, sets)],
      ['  세트를 남긴 사용자', setUsers.length],
    ]
  );
  if (notes > 0) {
    table(
      ['DailyTrainingNote.intensity', '줄 수', '비율'],
      noteByIntensity.map((g) => [
        g.intensity,
        g._count._all,
        pct(g._count._all, notes),
      ])
    );
  }
}

/* ───────────────────── ⑦ 달력 · 같은 요일 — 다음 등판 짐작의 재료 ───────────────────── */

/*
 * 2판 P4 커밋 G(2026-10-12)부터 체크인 답이 다음 등판을 말하지 않는 날에는 홈 캘린더 일정 이름(lib/calendar-event.ts isOutingTitle) →
 * 같은 요일 경기(lib/engine/outing.ts — 최근 ESTIMATE_LOOKBACK_DAYS 일에 같은 요일 경기 ESTIMATE_MIN_GAMES 번 이상) 차례로 다음 등판을
 * 짐작해 일정을 가볍게만 한다. 낱말(경기 · 등판 · 선발) · 빼는 낱말(관람 · 응원)은 '실제 이름을 보고 고친다'고 미뤄 둔 결정이고('시합' ·
 * '대회'는 사용자 결정 전, '경기도' 같은 땅이름은 알고 둔 오탐 — calendar-event.ts 주석), 같은 요일 문턱 3번도 '2번이면 우연이 너무
 * 걸린다'는 어림이다(outing.ts 주석). 그래서 실제 일정 이름에 그 낱말이 얼마나 들고, 짐작이 실제로 몇 사람에게 서는지를 센다.
 *
 * 일정 이름(CalendarEvent.title)은 낱말이 들었는지 보려고 메모리에만 올리고 찍지 않는다 — 원문은 물론 사용자 · 날짜도 같이 내지 않고
 * 낱말별 수만 낸다. 메모(memo)는 읽지 않는다.
 */

/** 아직 안 넣은 후보 낱말 — 넣으면 새로 등판으로 읽힐 이름이 몇인지 미리 센다(사용자 결정 전) */
const CANDIDATE_TITLE_WORDS = ['시합', '대회'] as const;
/** 알고 둔 오탐 — 땅이름의 '경기'. 걸려도 그날을 가볍게 할 뿐이지만 실제로 몇 줄인지 본다 */
const KNOWN_FALSE_TITLE_WORDS = ['경기도'] as const;
/** 일정 · 경기 기록이 이 수를 넘으면 메모리에 올리는 셈을 건너뛴다(1분 안에 끝내려고) */
const CALENDAR_LOAD_LIMIT = 50000;
/** 같은 요일 짐작을 날마다 다시 세 보는 기간 — ② 의 '최근 120일'과 같은 창 */
const ESTIMATE_REPLAY_DAYS = 120;
/** 문턱을 하나 낮추면 몇 사람에게 더 서나 — outing.ts 의 '2번이면 격주 경기도 잡지만 우연이 너무 걸린다'를 숫자로 본다 */
const LOOSER_MIN_GAMES = ESTIMATE_MIN_GAMES - 1;
/** 경기 기록의 거름 — facts.ts gameDatesOf 와 같다(종류 '경기' · 1구 이상) */
const GAME_WHERE = { sessionType: '경기', pitchCount: { gt: 0 } };
const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

/** 'YYYY-MM-DD' 의 요일 — 0 일요일 ~ 6 토요일. UTC 자정으로 읽어 시간대를 안 탄다(outing.ts 의 날 번호 셈과 같은 값) */
function weekdayOfKey(key: string): number {
  return new Date(`${key}T00:00:00.000Z`).getUTCDay();
}

/**
 * asOf 기준 최근 ESTIMATE_LOOKBACK_DAYS 일(어제 ~ 그 날수 전)의 경기 날을 요일마다 센다 — outing.ts sameWeekdayGuesses 와 같은 창.
 * 그 함수는 내보내지 않으니 여기서 다시 세되, 문턱이 ESTIMATE_MIN_GAMES 일 때는 앱 함수(outingGuessInputsOf)와 답이 같은지 늘 견준다
 * (어긋나면 던진다 — 통계가 앱과 다른 규칙을 재지 않게). 문턱을 낮춘 셈은 앱에 없는 규칙이라 여기서만 센다.
 */
function weekdayCounts(dates: ReadonlySet<string>, asOf: string): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (let ago = 1; ago <= ESTIMATE_LOOKBACK_DAYS; ago++) {
    const key = shiftDateKey(asOf, -ago);
    if (dates.has(key)) counts[weekdayOfKey(key)] += 1;
  }
  return counts;
}

/** 짐작이 서는 가장 가까운 날(asOf 0 ~ 6일 뒤), 없으면 null — outing.ts guessOf 의 같은 요일 갈래(달력 없음 · 오늘부터) */
function nearestGuess(counts: number[], asOf: string, minGames: number): number | null {
  for (let d = 0; d < 7; d++) {
    if (counts[weekdayOfKey(shiftDateKey(asOf, d))] >= minGames) return d;
  }
  return null;
}

/**
 * 앱 규칙으로 본 같은 요일 짐작의 가장 가까운 날 — outingGuessInputsOf 가 읽는 칸 셋(asOf · 달력 · 경기 날짜)만 채운 facts 를 넘긴다.
 * 달력은 null 이라 같은 요일 갈래만 나온다.
 */
function appNearestGuess(dates: ReadonlySet<string>, asOf: string): number | null {
  const facts = {
    asOf,
    condition: { outingCalendar: null },
    patterns: { gameDates: [...dates] },
  } as unknown as ReportFacts;
  return outingGuessInputsOf(facts)?.estimate[0] ?? null;
}

/** 일정 줄을 이름 조건으로 센다 — 줄 · 사용자, 그리고 오늘부터 OUTING_CALENDAR_DAYS 일 안(gather.ts 가 읽는 창 — 오늘 짐작의 재료) */
function tallyTitles(
  events: { userId: string; date: Date; title: string }[],
  match: (title: string) => boolean
): number[] {
  const windowEnd = shiftDateKey(TODAY_KEY, OUTING_CALENDAR_DAYS);
  const users = new Set<string>();
  const windowUsers = new Set<string>();
  let rows = 0;
  let windowRows = 0;
  for (const e of events) {
    if (!match(e.title)) continue;
    rows += 1;
    users.add(e.userId);
    const key = keyOf(e.date);
    if (key >= TODAY_KEY && key <= windowEnd) {
      windowRows += 1;
      windowUsers.add(e.userId);
    }
  }
  return [rows, users.size, windowRows, windowUsers.size];
}

async function sectionCalendar() {
  heading(
    `⑦ 달력 · 같은 요일 — 다음 등판 짐작의 재료(2판 P4): 일정 이름에 ${OUTING_TITLE_WORDS.join(' · ')} 하나 이상이고 ${OUTING_TITLE_EXCLUDE_WORDS.join(' · ')} 없음, 또는 최근 ${ESTIMATE_LOOKBACK_DAYS}일 같은 요일 경기 ${ESTIMATE_MIN_GAMES}번 이상`
  );
  const [eventCount, gameCount] = await Promise.all([
    prisma.calendarEvent.count(),
    prisma.pitchLog.count({ where: GAME_WHERE }),
  ]);

  if (eventCount > CALENDAR_LOAD_LIMIT) {
    table(
      ['일정 이름', '수'],
      [['(건너뜀)', `일정이 ${CALENDAR_LOAD_LIMIT}줄을 넘어 낱말 표를 안 만든다`]]
    );
  } else {
    const events = await prisma.calendarEvent.findMany({
      select: { userId: true, date: true, title: true },
    });
    const has = (w: string) => (t: string) => t.includes(w);
    const excluded = (t: string) =>
      OUTING_TITLE_EXCLUDE_WORDS.some((x) => t.includes(x));
    const outingWord = (t: string) => OUTING_TITLE_WORDS.some((w) => t.includes(w));
    table(
      [
        '일정 이름',
        '일정 줄',
        '사용자',
        `오늘 ~ ${OUTING_CALENDAR_DAYS}일 뒤 줄`,
        `오늘 ~ ${OUTING_CALENDAR_DAYS}일 뒤 사용자`,
      ],
      [
        ['일정(CalendarEvent) 전체', ...tallyTitles(events, () => true)],
        [
          '등판으로 읽히는 이름(isOutingTitle — 등판 낱말 하나 이상 · 빼는 낱말 없음)',
          ...tallyTitles(events, isOutingTitle),
        ],
        ...OUTING_TITLE_WORDS.map((w) => [
          `  이름에 등판 낱말 '${w}' 있음`,
          ...tallyTitles(events, has(w)),
        ]),
        ...OUTING_TITLE_EXCLUDE_WORDS.flatMap((w) => [
          [`이름에 빼는 낱말 '${w}' 있음`, ...tallyTitles(events, has(w))],
          [
            '  그중 등판 낱말도 든 것(이 낱말이 막은 몫)',
            ...tallyTitles(events, (t) => t.includes(w) && outingWord(t)),
          ],
        ]),
        ...CANDIDATE_TITLE_WORDS.flatMap((w) => [
          [
            `이름에 후보 낱말 '${w}' 있음(아직 안 넣음)`,
            ...tallyTitles(events, has(w)),
          ],
          [
            '  그중 넣으면 새로 등판으로 읽힐 것(지금 안 읽힘 · 빼는 낱말 없음)',
            ...tallyTitles(
              events,
              (t) => t.includes(w) && !isOutingTitle(t) && !excluded(t)
            ),
          ],
        ]),
        ...KNOWN_FALSE_TITLE_WORDS.map((w) => [
          `이름에 '${w}' 있음(알고 둔 오탐) · 등판으로 읽힘`,
          ...tallyTitles(events, (t) => t.includes(w) && isOutingTitle(t)),
        ]),
      ]
    );
  }

  /*
   * 같은 요일 짐작 — 경기 기록(facts.ts 와 같은 거름)을 사용자마다 날짜 집합으로 모아, 요일 집중 · 오늘 짐작이 서는 사람 · 최근 120일
   * 날마다 다시 셌을 때 짐작이 선 날과 그 짐작이 맞았는지를 본다. 체크인 답과 상관없이 센다 — 답이 범위를 주면 앱은 짐작하지 않으니
   * '짐작이 선 날'은 상한이다. 달력이 있으면 앱은 같은 요일을 안 보지만 여기서는 같은 요일 갈래만 따로 잰다.
   */
  if (gameCount > CALENDAR_LOAD_LIMIT) {
    table(
      ['같은 요일 짐작', '수'],
      [['(건너뜀)', `경기 기록이 ${CALENDAR_LOAD_LIMIT}줄을 넘어 요일 표를 안 만든다`]]
    );
    return;
  }
  const games = await prisma.pitchLog.findMany({
    where: GAME_WHERE,
    select: { userId: true, date: true },
  });
  const datesByUser = new Map<string, Set<string>>();
  for (const g of games) {
    const set = datesByUser.get(g.userId) ?? new Set<string>();
    set.add(keyOf(g.date));
    datesByUser.set(g.userId, set);
  }

  /* 요일 집중(전체 기간) — 경기 날이 문턱만큼 있는 사람 중 한 요일에 절반 이상 몰린 사람 */
  const weekdayDays = [0, 0, 0, 0, 0, 0, 0];
  let gameDays = 0;
  let manyGames = 0;
  let concentrated = 0;
  for (const dates of datesByUser.values()) {
    const byWeekday = [0, 0, 0, 0, 0, 0, 0];
    for (const key of dates) byWeekday[weekdayOfKey(key)] += 1;
    for (let w = 0; w < 7; w++) weekdayDays[w] += byWeekday[w];
    gameDays += dates.size;
    if (dates.size >= ESTIMATE_MIN_GAMES) {
      manyGames += 1;
      if (maxOf(byWeekday) * 2 >= dates.size) concentrated += 1;
    }
  }

  /*
   * 오늘 기준(최근 ESTIMATE_LOOKBACK_DAYS 일 경기가 있는 사람 · 짐작이 서는 사람)과 최근 ESTIMATE_REPLAY_DAYS 일 날마다 다시 센 것(짐작이
   * 선 사용자-날 · 짐작한 날이 지났으면 그날 실제 경기가 있었나). 문턱은 앱 그대로와 하나 낮춘 것 둘.
   */
  let recentGameUsers = 0;
  let guessToday = 0;
  let guessTodayLoose = 0;
  const replayStart = recentSinceKey(ESTIMATE_REPLAY_DAYS);
  const replayOf = (minGames: number) => ({
    minGames,
    users: 0,
    days: 0,
    judged: 0,
    hit: 0,
  });
  const strict = replayOf(ESTIMATE_MIN_GAMES);
  const loose = replayOf(LOOSER_MIN_GAMES);
  for (const dates of datesByUser.values()) {
    const countsToday = weekdayCounts(dates, TODAY_KEY);
    if (countsToday.some((n) => n > 0)) recentGameUsers += 1;
    if (nearestGuess(countsToday, TODAY_KEY, ESTIMATE_MIN_GAMES) != null)
      guessToday += 1;
    if (nearestGuess(countsToday, TODAY_KEY, LOOSER_MIN_GAMES) != null)
      guessTodayLoose += 1;

    const daysBefore = [strict.days, loose.days];
    for (let day = replayStart; day <= TODAY_KEY; day = shiftDateKey(day, 1)) {
      const counts = weekdayCounts(dates, day);
      const app = appNearestGuess(dates, day);
      for (const r of [strict, loose]) {
        const d = nearestGuess(counts, day, r.minGames);
        if (r === strict && d !== app)
          throw new Error(
            `⑦ 같은 요일 짐작이 앱 규칙(outingGuessInputsOf)과 다르다: ${day} 여기 ${d} · 앱 ${app}`
          );
        if (d == null) continue;
        r.days += 1;
        const target = shiftDateKey(day, d);
        /* 오늘 이후는 아직 던졌는지 모른다 — 맞았나는 지난 날만 본다 */
        if (target < TODAY_KEY) {
          r.judged += 1;
          if (dates.has(target)) r.hit += 1;
        }
      }
    }
    if (strict.days > daysBefore[0]) strict.users += 1;
    if (loose.days > daysBefore[1]) loose.users += 1;
  }
  const userDays = datesByUser.size * ESTIMATE_REPLAY_DAYS;
  const replayRows = (r: typeof strict, label: string): (string | number)[][] => [
    [
      `${label}: 짐작이 선 사용자 · 사용자-날 / 경기 기록이 있는 사용자 × ${ESTIMATE_REPLAY_DAYS}일`,
      `${r.users} · ${withPct(r.days, userDays)}`,
    ],
    [
      '  그중 짐작한 날이 지난 날인 것 · 그날 실제 경기가 있었던 것',
      `${r.judged} · ${withPct(r.hit, r.judged)}`,
    ],
  ];
  table(
    ['같은 요일 짐작(경기 기록 — 종류 경기 · 1구 이상)', '수'],
    [
      [
        '경기 기록 줄 · 경기 날(사람 · 날짜 한 번) · 사용자',
        `${games.length} · ${gameDays} · ${datesByUser.size}`,
      ],
      [
        '  요일별 경기 날(전체 기간)',
        WEEKDAY_NAMES.map((name, w) => `${name} ${weekdayDays[w]}`).join(' · '),
      ],
      [
        `경기 날 ${ESTIMATE_MIN_GAMES}일 이상인 사용자 · 그중 한 요일에 절반 이상 몰린 사람(요일 집중, 전체 기간)`,
        `${manyGames} · ${concentrated}`,
      ],
      [
        `오늘 기준 최근 ${ESTIMATE_LOOKBACK_DAYS}일 경기가 있는 사용자 · 같은 요일 ${ESTIMATE_MIN_GAMES}번 이상(오늘 짐작이 섬) · ${LOOSER_MIN_GAMES}번 이상으로 낮추면`,
        `${recentGameUsers} · ${guessToday} · ${guessTodayLoose}`,
      ],
      ...replayRows(
        strict,
        `${recentLabel(ESTIMATE_REPLAY_DAYS)} 날마다, 문턱 ${ESTIMATE_MIN_GAMES}번`
      ),
      ...replayRows(loose, `  같은 기간, 문턱 ${LOOSER_MIN_GAMES}번으로 낮추면`),
    ]
  );
}

/* ─────────────────────────── 실행 ─────────────────────────── */

console.log(`# 트레이닝 추천 — DB 사용 통계(읽기만) · ${TODAY_KEY}\n`);
try {
  const [setups, sessions] = await Promise.all([loadSetups(), loadSessions()]);
  const pairing = pairSetupsAndSessions(setups, sessions);
  await sectionCheckin();
  await sectionCompletion(setups, sessions, pairing);
  await sectionIntensity();
  await sectionAge();
  await sectionLibrary();
  await sectionFeedback(setups, sessions, pairing);
  await sectionCalendar();
} finally {
  await prisma.$disconnect();
}
console.log(`걸린 시간 ${((Date.now() - startedAt) / 1000).toFixed(1)}초`);
