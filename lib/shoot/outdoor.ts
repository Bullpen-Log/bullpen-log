/**
 * 야외 주차 계획 — 투구 드릴(MechanicsGuide, 유튜브 참고 영상) + 워밍업(이름만, lib/shoot/warmups.ts)을 1~5주차(실내)
 * 뒤에 새 주차로 붙인다(순수 계산, DB 없음). 2026-10-09 사용자: "투구 드릴과 워밍업은 주차를 추가해서 — 되도록 야외에서".
 *
 * 계산은 scripts/shoot-plan-outdoor.mts 가 DB 를 읽어 한 번 돌리고, 결과를 lib/shoot/plan-data.json 의 6주차~ 로 고정한다
 * (1~5주차는 그대로). 실내 계획(schedule.ts)과 같은 시계를 쓴다 — 준비 15 · 자리 옮김 3 · 도구 바꿈 1 · 50분마다 쉬기 5 · 백업 10.
 *
 * ■ 나누기
 *   - 같은 동작을 도구만 바꾼 드릴(작은 공 · 큰 공)은 한 묶음으로 같은 주 · 같은 자리에서 잇는다.
 *   - 주마다 스로잉 · 메디신볼 · 무브먼트 드릴 수와 시간 · 하체 점프(홉 · 바운드 · 뎁스) 수를 고르게 — 모델의 팔과 다리가
 *     한 주에 몰리지 않게.
 *   - 워밍업은 루틴 차례대로 주마다 같은 수씩, 그 주 맨 앞(모델 몸풀기를 겸한다).
 * ■ 자리 차례(OUTDOOR_STATIONS): 워밍업 → 무브먼트(잔디 · 밴드) → 메디신볼(벽) → 스로잉(그물) — 팔은 몸이 다 풀린 뒤.
 *   한 자리 안에서는 P1 → P5(쉬운 패턴부터), 같은 단계 안에서는 기초 → 연결 → 통합.
 */
import {
  BREAK_EVERY,
  BREAK_MINUTES,
  MOVE_MINUTES,
  OUTDOOR_STATIONS,
  SETUP_MINUTES,
  SWAP_MINUTES,
  type Bucket,
  type PlanItem,
  type PlanStation,
  type PlanWeek,
  type Station,
} from '@/lib/shoot/schedule';
import { WARMUP_ROUTINE_LABEL, type ShootWarmup } from '@/lib/shoot/warmups';

export type OutdoorDrill = {
  id: string;
  title: string;
  /** '스로잉 드릴' · '메디신볼 드릴' · '무브먼트 패턴 드릴' */
  category: string;
  equipment: string[];
  /** 기초 · 연결 · 통합 */
  stage: string | null;
};

export type OutdoorOptions = {
  /** 첫 야외 주차 번호 */
  firstWeek: number;
  /** 몇 주(회)에 나누나 */
  sessions: number;
};

export const OUTDOOR_DEFAULT: OutdoorOptions = { firstWeek: 6, sessions: 3 };

/** 다리에 부담이 큰 점프 · 착지 드릴 — 주마다 고르게 */
export const PLYO = /홉|바운드|뎁스|허들|포고|스톰프/;

const STAGE_RANK: Record<string, number> = { 기초: 0, 연결: 1, 통합: 2 };
const STAGE_LOAD: Record<string, number> = { 기초: 0.5, 연결: 1, 통합: 1.5 };
const TOOL_RANK = (t: string) => (/\(작은 공\)/.test(t) ? 1 : /\(큰 공\)/.test(t) ? 2 : 0);

/** 같은 동작의 도구 묶음 이름 — lib/mechanics/drills.ts familyTitle 과 같은 규칙 */
export const familyOf = (title: string) =>
  title
    .replace(/\s*\((큰|작은) 공\)\s*$/, '')
    .replace(/^P\d+\s+/, '')
    .trim();

/** 'P3 …' 의 3 — 없으면 9(맨 뒤) */
export const pLevel = (title: string) => {
  const m = /^P(\d)/.exec(title);
  return m ? Number(m[1]) : 9;
};

export function drillStation(d: OutdoorDrill): Station {
  if (d.category === '스로잉 드릴') return '투구 그물';
  if (d.category === '메디신볼 드릴') return '메디신볼 벽';
  return '잔디 · 밴드 기둥';
}

export function drillBucket(d: OutdoorDrill): Bucket {
  if (d.category === '스로잉 드릴') return '스로잉 드릴';
  if (d.category === '메디신볼 드릴') return '메디신볼 드릴';
  return '무브먼트 패턴 드릴';
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 드릴 영상 1개의 분 — 던지면 공 줍기 · 그물(+0.6), 메디신볼은 벽에 던지고 줍기(+0.4), 이어지는 동작(+0.4), 밴드 걸기(+0.2) */
export function drillMinutes(d: OutdoorDrill): number {
  let m = 1.6;
  if (d.category === '스로잉 드릴') m += 0.6;
  if (d.category === '메디신볼 드릴') m += 0.4;
  if (/→|\+/.test(d.title)) m += 0.4;
  if (d.equipment.includes('밴드')) m += 0.2;
  return round1(Math.min(3, m));
}

export const warmupMinutes = (w: ShootWarmup) => (w.moving ? 1.4 : 1.2);

/** 부하 — 단계(기초 0.5 · 연결 1 · 통합 1.5) + 점프 · 착지 1 */
export function drillLoad(d: OutdoorDrill): number {
  return round1((STAGE_LOAD[d.stage ?? ''] ?? 1) + (PLYO.test(d.title) ? 1 : 0));
}

export function drillCue(d: OutdoorDrill): string {
  if (d.category === '스로잉 드릴') return '2~3구';
  if (d.category === '메디신볼 드릴') return '3회';
  return PLYO.test(d.title) ? '2~3회' : '3회 · 천천히';
}

type Unit = {
  key: string;
  category: string;
  drills: OutdoorDrill[];
  minutes: number;
  plyo: number;
  p: number;
  stage: number;
  family: string;
};

const CATEGORY_ORDER = ['무브먼트 패턴 드릴', '메디신볼 드릴', '스로잉 드릴'];

/** 같은 입력이면 같은 계획 — 6주차부터 sessions 주 */
export function buildOutdoorWeeks(
  drills: OutdoorDrill[],
  warmups: readonly ShootWarmup[],
  options: OutdoorOptions = OUTDOOR_DEFAULT
): PlanWeek[] {
  const N = options.sessions;
  /* 도구 묶음 */
  const families = new Map<string, OutdoorDrill[]>();
  for (const d of [...drills].sort((a, b) => a.title.localeCompare(b.title, 'ko') || a.id.localeCompare(b.id))) {
    const key = `${d.category}|${familyOf(d.title)}`;
    families.set(key, [...(families.get(key) ?? []), d]);
  }
  const units: Unit[] = [...families.entries()].map(([key, ds]) => {
    const sorted = [...ds].sort((a, b) => TOOL_RANK(a.title) - TOOL_RANK(b.title));
    return {
      key,
      category: ds[0].category,
      drills: sorted,
      minutes: ds.reduce((a, d) => a + drillMinutes(d), 0),
      plyo: ds.filter((d) => PLYO.test(d.title)).length,
      p: Math.min(...ds.map((d) => pLevel(d.title))),
      stage: Math.min(...ds.map((d) => STAGE_RANK[d.stage ?? ''] ?? 1)),
      family: familyOf(ds[0].title),
    };
  });

  /* 고르게 나누기 — 큰 묶음부터, 시간 · 점프 · 그 종류 수가 가장 가벼운 주로 */
  const time = Array(N).fill(0);
  const plyo = Array(N).fill(0);
  const cat = Array.from({ length: N }, () => new Map<string, number>());
  const avgTime = units.reduce((a, u) => a + u.minutes, 0) / N || 1;
  const avgPlyo = units.reduce((a, u) => a + u.plyo, 0) / N || 1;
  const catTotal = new Map<string, number>();
  for (const u of units) catTotal.set(u.category, (catTotal.get(u.category) ?? 0) + u.drills.length);
  const bins: Unit[][] = Array.from({ length: N }, () => []);
  const order = [...units].sort(
    (a, b) => b.drills.length - a.drills.length || b.minutes - a.minutes || a.key.localeCompare(b.key, 'ko')
  );
  for (const u of order) {
    let best = 0;
    let bestCost = Infinity;
    for (let s = 0; s < N; s++) {
      const avgCat = (catTotal.get(u.category) ?? 1) / N;
      const cost =
        (time[s] + u.minutes) / avgTime +
        (u.plyo ? (plyo[s] + u.plyo) / avgPlyo : 0) +
        ((cat[s].get(u.category) ?? 0) + u.drills.length) / avgCat;
      if (cost < bestCost - 1e-9) {
        bestCost = cost;
        best = s;
      }
    }
    bins[best].push(u);
    time[best] += u.minutes;
    plyo[best] += u.plyo;
    cat[best].set(u.category, (cat[best].get(u.category) ?? 0) + u.drills.length);
  }

  /* 워밍업 — 루틴 차례대로 주마다 같은 수씩 */
  const per = Math.ceil(warmups.length / N);
  const warmBins = Array.from({ length: N }, (_, s) => warmups.slice(s * per, (s + 1) * per));

  return bins.map((bin, s) => layout(options.firstWeek + s, warmBins[s], bin));
}

type Row = {
  id: string;
  title: string;
  station: Station;
  bucket: Bucket;
  equipment: string[];
  minutes: number;
  load: number;
  cue: string;
  perSide: boolean;
  kind: 'drill' | 'warmup';
  group: string;
  /** 도구가 바뀌면 1분 */
  toolKey: string;
};

function layout(week: number, warmups: readonly ShootWarmup[], units: Unit[]): PlanWeek {
  const rows = new Map<Station, Row[]>();
  const push = (r: Row) => rows.set(r.station, [...(rows.get(r.station) ?? []), r]);
  for (const w of warmups) {
    push({
      id: w.id,
      title: w.title,
      station: '넓은 잔디(이동)',
      bucket: '워밍업',
      equipment: w.equipment,
      minutes: warmupMinutes(w),
      load: 0.2,
      cue: w.cue,
      perSide: /한쪽/.test(w.cue),
      kind: 'warmup',
      group: WARMUP_ROUTINE_LABEL[w.routine],
      toolKey: w.equipment.join('+'),
    });
  }
  const sortedUnits = [...units].sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
      a.p - b.p ||
      a.stage - b.stage ||
      a.family.localeCompare(b.family, 'ko')
  );
  for (const u of sortedUnits) {
    for (const d of u.drills) {
      push({
        id: d.id,
        title: d.title,
        station: drillStation(d),
        bucket: drillBucket(d),
        equipment: d.equipment,
        minutes: drillMinutes(d),
        load: drillLoad(d),
        cue: drillCue(d),
        perSide: false,
        kind: 'drill',
        group: d.stage ?? '',
        toolKey: `${d.equipment.join('+')}|${TOOL_RANK(d.title)}`,
      });
    }
  }

  let clock = SETUP_MINUTES;
  let since = 0;
  let breaks = 0;
  let n = 0;
  let prev: Row | null = null;
  const stations: PlanStation[] = [];
  const load: Partial<Record<Bucket, number>> = {};
  for (const st of OUTDOOR_STATIONS) {
    const list = rows.get(st);
    if (!list?.length) continue;
    if (prev) {
      clock += MOVE_MINUTES;
      since += MOVE_MINUTES;
    }
    const start = clock;
    const out: PlanItem[] = [];
    for (const r of list) {
      if (prev && prev.station === r.station && prev.toolKey !== r.toolKey) {
        clock += SWAP_MINUTES;
        since += SWAP_MINUTES;
      }
      n++;
      const item: PlanItem = {
        exerciseId: r.id,
        no: `${week}-${String(n).padStart(2, '0')}`,
        title: r.title,
        station: r.station,
        bucket: r.bucket,
        equipment: r.equipment,
        at: round1(clock),
        minutes: r.minutes,
        load: r.load,
        cue: r.cue,
        perSide: r.perSide,
        breakAfter: false,
        kind: r.kind,
        ...(r.group ? { group: r.group } : {}),
      };
      out.push(item);
      load[r.bucket] = round1((load[r.bucket] ?? 0) + r.load);
      clock += r.minutes;
      since += r.minutes;
      prev = r;
      if (since >= BREAK_EVERY && breaks < 2) {
        item.breakAfter = true;
        clock += BREAK_MINUTES;
        since = 0;
        breaks++;
      }
    }
    stations.push({ station: st, start: round1(start), end: round1(clock), items: out });
  }
  return { week, end: round1(clock), stations, load, outdoor: true };
}
