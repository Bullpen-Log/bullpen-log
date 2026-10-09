import type {
  Bucket,
  PlanItem,
  PlanWeek,
  ShootPlan,
  Station,
} from '@/lib/shoot/schedule';

/**
 * 촬영 진행 — 계획(lib/shoot/plan-data.json)과 체크(DB ShootCheck)를 합쳐 '지금 · 다음 · 얼마나'를 셈한다(순수, DB 없음).
 *
 *   done   찍었다(촬영 완료)
 *   redo   찍었지만 다시 찍어야 한다(초점 · 자세) — 안 찍은 것으로 센다
 *   later  오늘은 미뤘다(기구가 없다 · 시간이 모자라다) — 그 주의 순서에서 빠지고 '미룬 것'으로 모인다
 *
 * 체크가 없는 운동은 '대기'. 체크는 운동 하나에 하나(주차가 아니라 운동에 붙는다 — 다음 주로 넘겨 찍어도 그대로 남는다).
 */

export type ShootStatus = 'done' | 'redo' | 'later';
export const SHOOT_STATUSES: readonly ShootStatus[] = ['done', 'redo', 'later'];
export const isShootStatus = (v: unknown): v is ShootStatus =>
  typeof v === 'string' && (SHOOT_STATUSES as readonly string[]).includes(v);

export type ShootCheckView = {
  exerciseId: string;
  status: ShootStatus;
  /** ISO 시각 */
  at: string;
  /** 체크한 사람 닉네임 */
  by: string | null;
  note: string | null;
};

export type ItemState = 'done' | 'redo' | 'later' | 'todo';

export function stateOf(
  item: PlanItem,
  checks: Map<string, ShootCheckView>
): ItemState {
  return checks.get(item.exerciseId)?.status ?? 'todo';
}

export const weekItems = (w: PlanWeek): PlanItem[] =>
  w.stations.flatMap((s) => s.items);
export const planItems = (p: ShootPlan): PlanItem[] => p.weeks.flatMap(weekItems);

export type Count = {
  total: number;
  done: number;
  redo: number;
  later: number;
  todo: number;
};

export function countOf(items: PlanItem[], checks: Map<string, ShootCheckView>): Count {
  const c: Count = { total: items.length, done: 0, redo: 0, later: 0, todo: 0 };
  for (const it of items) c[stateOf(it, checks)]++;
  return c;
}

/** 0~1 — 찍은 비율 */
export const doneShare = (c: Count) => (c.total > 0 ? c.done / c.total : 0);

/**
 * 그 주의 지금 · 다음 — 계획 순서에서 아직 안 찍은(대기 · 다시 찍기) 첫 운동이 '지금', 그다음이 '다음'.
 * 미룬 것은 건너뛴다(목록 끝 '미룬 것'에서 다시 고를 수 있다). 다 찍었으면 둘 다 null.
 */
export function cursorOf(
  w: PlanWeek,
  checks: Map<string, ShootCheckView>
): { current: PlanItem | null; next: PlanItem | null; index: number } {
  return cursorOfList(weekItems(w), checks);
}

/** 아무 줄에서나 지금 · 다음 — 촬영 모드는 그 주 운동 뒤에 앞 주에서 넘어온 것을 이어 붙인 줄을 돈다 */
export function cursorOfList(
  items: PlanItem[],
  checks: Map<string, ShootCheckView>,
  /** 목록에서 '먼저 찍기'로 고른 운동 — 아직 안 찍었으면(미룸이어도) 지금이 된다 */
  pickId: string | null = null
): { current: PlanItem | null; next: PlanItem | null; index: number } {
  const isOpen = (it: PlanItem) => {
    const st = stateOf(it, checks);
    return st === 'todo' || st === 'redo';
  };
  const open = items.filter(isOpen);
  const picked = pickId ? items.find((it) => it.exerciseId === pickId) : undefined;
  const current =
    picked && stateOf(picked, checks) !== 'done' ? picked : (open[0] ?? null);
  const next = open.find((it) => it !== current) ?? null;
  return { current, next, index: current ? items.indexOf(current) : items.length };
}

/** 지금 운동 뒤에 남은 줄 — 다음 자리로 옮기는지, 쉬는지 알려 준다 */
export function transitionAfter(
  w: PlanWeek,
  current: PlanItem | null,
  next: PlanItem | null
): { move: { from: Station; to: Station } | null; rest: boolean } {
  if (!current) return { move: null, rest: false };
  return {
    move:
      next && next.station !== current.station
        ? { from: current.station, to: next.station }
        : null,
    rest: current.breakAfter,
  };
}

/**
 * 이 주보다 앞 주에서 아직 못 찍은 것(대기 · 다시 · 미룸) — 이 주 끝에 이어 찍을 거리.
 * 체크가 하나도 없는 주는 아직 찍으러 가지 않은 주라 넘기지 않는다(시작 전에 2주차를 열어도 1주차 66개가 붙지 않게).
 */
export function carriedOver(
  plan: ShootPlan,
  week: number,
  checks: Map<string, ShootCheckView>
): PlanItem[] {
  return plan.weeks
    .filter((w) => w.week < week)
    .map(weekItems)
    .filter((its) => its.some((it) => checks.has(it.exerciseId)))
    .flat()
    .filter((it) => stateOf(it, checks) !== 'done');
}

/**
 * 계획 대비 — 오늘 그 주에서 처음 찍은 운동의 체크 시각을 기준점으로, 지금 운동을 계획 시각과 견준다.
 * 양수 = 늦음(분). 오늘 찍은 것이 없으면 null.
 */
export function paceMinutes(
  w: PlanWeek,
  checks: Map<string, ShootCheckView>,
  current: PlanItem | null,
  now: Date,
  dayKey: (d: Date) => string
): number | null {
  if (!current) return null;
  const today = dayKey(now);
  let anchor: { item: PlanItem; at: number } | null = null;
  for (const it of weekItems(w)) {
    const c = checks.get(it.exerciseId);
    if (!c || c.status !== 'done') continue;
    const at = Date.parse(c.at);
    if (dayKey(new Date(at)) !== today) continue;
    /* 기준점 = 오늘 체크한 것 가운데 계획 시각이 가장 이른 것의 '끝난 때' */
    if (!anchor || it.at < anchor.item.at) anchor = { item: it, at };
  }
  if (!anchor) return null;
  const planned = current.at - (anchor.item.at + anchor.item.minutes);
  const actual = (now.getTime() - anchor.at) / 60_000;
  return Math.round(actual - planned);
}

/** 묶어 세기 — 자리 · 부위 · 카테고리별 진행 */
export function groupCounts<K extends string>(
  items: PlanItem[],
  checks: Map<string, ShootCheckView>,
  keyOf: (it: PlanItem) => K
): { key: K; count: Count }[] {
  const m = new Map<K, PlanItem[]>();
  for (const it of items) {
    const k = keyOf(it);
    const arr = m.get(k) ?? [];
    arr.push(it);
    m.set(k, arr);
  }
  return [...m.entries()].map(([key, list]) => ({ key, count: countOf(list, checks) }));
}

export type Session = {
  /** 'YYYY-MM-DD' */
  day: string;
  count: number;
  /** 첫 체크 ~ 마지막 체크(분) */
  spanMinutes: number;
  /** 영상 1개에 든 평균 분(둘 이상일 때) */
  perVideo: number | null;
};

/** 찍은 날별 — 체크 시각으로 하루에 몇 개를 몇 분에 찍었나 */
export function sessionsOf(
  checks: ShootCheckView[],
  dayKey: (d: Date) => string
): Session[] {
  const m = new Map<string, number[]>();
  for (const c of checks) {
    if (c.status !== 'done') continue;
    const t = Date.parse(c.at);
    const k = dayKey(new Date(t));
    const arr = m.get(k) ?? [];
    arr.push(t);
    m.set(k, arr);
  }
  return [...m.entries()]
    .map(([day, ts]) => {
      ts.sort((a, b) => a - b);
      const span = (ts[ts.length - 1] - ts[0]) / 60_000;
      return {
        day,
        count: ts.length,
        spanMinutes: Math.round(span),
        perVideo: ts.length > 1 ? Math.round((span / (ts.length - 1)) * 10) / 10 : null,
      };
    })
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** 계획의 영상 1개 평균 분 */
export const plannedPerVideo = (items: PlanItem[]) =>
  items.length
    ? Math.round((items.reduce((a, it) => a + it.minutes, 0) / items.length) * 10) / 10
    : 0;

/** 화면에 쓰는 짧은 이름과 색(globals.css 의 카테고리 색 이름) */
export const BUCKET_LABEL: Record<Bucket, string> = {
  '하체 파워': '하체 파워',
  '하체 앞(무릎)': '하체 앞',
  '하체 뒤(힌지)': '하체 뒤',
  '고관절 · 발목 보강': '고관절·발목',
  유산소: '유산소',
  모빌리티: '모빌리티',
  코어: '코어',
  '상체 밀기 · 어깨': '상체 밀기',
  '상체 당기기': '상체 당기기',
  '전완 · 팔꿈치': '전완·팔꿈치',
  '어깨 · 견갑(암케어)': '어깨·견갑',
};

/** '2:37' */
export function clockText(min: number) {
  const m = Math.round(min);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
