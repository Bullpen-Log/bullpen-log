/**
 * 촬영 계획 version 4(2026-10-18 사용자) — 지금 체크로 실내 주차를 다시 묶는다. DB 는 읽기만, 계획 파일만 쓴다.
 *
 *   npm run shoot:v4            # 무엇이 바뀌나만
 *   npm run shoot:v4 -- --write # lib/shoot/plan-data.json 을 version 4 로
 *
 * - 2 · 3 · 4주차: 찍은 것만 남긴다(번호 · 시각 그대로) — 다 찍은 주가 된다.
 * - 3 · 4주차에서 못 찍은 것(대기 · 다시 찍기) → 5주차. 5주차는 두 사람이 공간 + 장비로 나눠 동시에 찍는다(lib/shoot/crews.ts).
 * - 미룬 것(2 · 3 · 4 · 5주차) → '미룬 영상' 칸(실내 마지막 주차 뒤 번호, deferred). 번호는 원래 번호 그대로(번호판 · 기억이 같게).
 * 야외 주차는 그대로. 한 번만 돌린다 — version 이 이미 4 면 멈춘다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { prisma } from '@/lib/prisma';
import { layoutCrewWeek } from '@/lib/shoot/crews';
import {
  SETUP_MINUTES,
  ALL_STATIONS,
  postureOf,
  stationOf,
  type PlanItem,
  type PlanStation,
  type PlanWeek,
  type Row,
  type ShootPlan,
} from '@/lib/shoot/schedule';

const FILE = new URL('../lib/shoot/plan-data.json', import.meta.url);
const write = process.argv.includes('--write');
const plan = JSON.parse(readFileSync(FILE, 'utf8')) as ShootPlan;
if (plan.version >= 4) {
  console.log(`이미 version ${plan.version} — 멈춤`);
  process.exit(0);
}

const checks = new Map(
  (
    await prisma.shootCheck.findMany({ select: { exerciseId: true, status: true } })
  ).map((c) => [c.exerciseId, c.status])
);
const stateOf = (it: PlanItem) => checks.get(it.exerciseId) ?? 'todo';

const indoor = plan.weeks.filter((w) => !w.outdoor);
const toWeek5: PlanItem[] = [];
const deferred: { week: number; item: PlanItem }[] = [];
const kept: PlanWeek[] = [];
for (const w of indoor) {
  if (w.week === 1) {
    kept.push(w);
    continue;
  }
  const stations: PlanStation[] = [];
  for (const s of w.stations) {
    const items: PlanItem[] = [];
    for (const it of s.items) {
      const st = stateOf(it);
      if (st === 'later') deferred.push({ week: w.week, item: it });
      else if (w.week === 5 || st !== 'done') {
        if (w.week >= 3) toWeek5.push(it);
        else items.push(it); // 2주차의 못 찍은 것은 없다(미룸 셋뿐) — 있으면 그대로 둔다
      } else items.push(it);
    }
    if (items.length) stations.push({ ...s, items });
  }
  if (w.week < 5) kept.push({ ...w, stations });
}

/* 5주차 줄 — 운동 정보는 지금 라이브러리 것으로(제목 · 장비 · 좌우가 바뀐 것이 있다) */
const ids = toWeek5.map((it) => it.exerciseId);
const rowsDb = await prisma.exerciseVideo.findMany({
  where: { id: { in: ids } },
  select: {
    id: true,
    title: true,
    category: true,
    bodyParts: true,
    movementPattern: true,
    intensity: true,
    equipment: true,
    holdSeconds: true,
    perSide: true,
  },
});
await prisma.$disconnect();
const byId = new Map(rowsDb.map((r) => [r.id, r]));
const missing = ids.filter((id) => !byId.has(id));
if (missing.length) throw new Error(`라이브러리에 없는 운동: ${missing.join(', ')}`);
const rows: Row[] = toWeek5.map((it) => {
  const x = byId.get(it.exerciseId)!;
  const ex = { ...x, oldVideo: it.oldVideo ?? null };
  return {
    ...ex,
    station: stationOf(ex),
    bucket: it.bucket,
    minutes: it.minutes,
    load: it.load,
    eqKey: [...x.equipment].sort().join('+') || '맨몸',
    posture: postureOf(x.title),
  };
});
const week5 = layoutCrewWeek(5, rows);
for (const c of ['A', 'B']) {
  const ss = week5.stations.filter((s) => s.crew === c);
  console.log(
    c,
    ss.reduce((a, s) => a + s.items.length, 0),
    '개 · 끝',
    ss.at(-1)?.end
  );
}

/* 미룬 영상 칸 — 원래 자리끼리, 원래 번호 그대로 */
const deferredNo = Math.max(...plan.weeks.map((w) => w.week)) + 1;
let clock = SETUP_MINUTES;
const dStations: PlanStation[] = [];
for (const st of ALL_STATIONS) {
  const items = deferred.filter((d) => d.item.station === st).map((d) => d.item);
  if (!items.length) continue;
  const start = clock;
  const out = items.map((it) => {
    const x = { ...it, at: Math.round(clock * 10) / 10, breakAfter: false };
    clock += it.minutes;
    return x;
  });
  dStations.push({ station: st, start, end: Math.round(clock * 10) / 10, items: out });
}
const deferredWeek: PlanWeek = {
  week: deferredNo,
  end: Math.round(clock * 10) / 10,
  stations: dStations,
  load: {},
  deferred: true,
};

const next: ShootPlan = {
  ...plan,
  version: 4,
  createdOn: new Date().toISOString().slice(0, 10),
  weeks: [...kept, week5, ...plan.weeks.filter((w) => w.outdoor), deferredWeek],
};

const count = (w: PlanWeek) => w.stations.reduce((a, s) => a + s.items.length, 0);
for (const w of next.weeks)
  console.log(
    `${w.deferred ? '미룬 영상' : `${w.week}주차`}${w.outdoor ? '(야외)' : ''} ${count(w)}개 · 끝 ${w.end}분 · ` +
      w.stations
        .map(
          (s) =>
            `${s.crew ? `${s.crew}:` : ''}${s.space ? `${s.space}/` : ''}${s.warmup ? '몸풀기' : s.station} ${s.items.length}`
        )
        .join(' · ')
  );
const before = plan.weeks.reduce((a, w) => a + count(w), 0);
const after = next.weeks.reduce((a, w) => a + count(w), 0);
console.log(
  `운동 ${before} → ${after} · 5주차로 ${toWeek5.length - weekCount(plan, 5)}개 옮김 · 미룸 ${deferred.length}개`
);
function weekCount(p: ShootPlan, n: number) {
  const w = p.weeks.find((x) => x.week === n);
  return w ? count(w) : 0;
}
if (before !== after) throw new Error('운동 수가 달라졌다 — 멈춤');
if (write) {
  writeFileSync(FILE, JSON.stringify(next, null, 1) + '\n');
  console.log('lib/shoot/plan-data.json 씀(version 4)');
} else console.log('--write 로 쓴다.');
