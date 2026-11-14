/**
 * 촬영 계획 version 6(2026-11-14 김민: "지금까지 촬영한 건 전부 주차에서 없애고 야외 남은 것 1주차 · 실내 남은 것 2주차 ·
 * 미룬 영상은 밑에 따로 해서 총 3개로"). DB 는 읽기만, 계획 파일만 쓴다. 한 번만 — version 이 이미 6 이면 멈춘다.
 *
 *   node --env-file=.env --import ./scripts/alias-register.mjs scripts/shoot-plan-v6.mts           # 무엇이 바뀌나만
 *   node --env-file=.env --import ./scripts/alias-register.mjs scripts/shoot-plan-v6.mts --write   # 쓰기
 *
 * - 찍음(done)은 모두 계획에서 뺀다.
 * - 1주차(야외) = 야외 주차에서 아직 안 찍은 것(대기 · 다시 찍기). 차례는 그대로(6주차를 장비 차례로 손으로 짰다 — 5dab97b7),
 *   번호 · 시각만 다시(준비 15분 · 자리 옮김 3분 · 도구 바꿈 1분 · 50분마다 5분 쉬기).
 * - 2주차(실내) = 라이브러리에 새로 넣고 아직 우리 영상이 없는 운동(계획에 없던 것). 뺀 것: 분류 '나중에 촬영' · 사용자가 계획에서 뺀
 *   토 워크 둘(2026-10-14) · 1주차 드릴과 같은 참고 영상인 파워 복사본(드릴 영상을 올리면 attachShootClip 이 같이 붙인다).
 * - 미룬 영상(3) = 미룸(later)으로 체크한 모든 것. 번호는 3-NN 으로 다시(옛 주차 번호가 새 1 · 2주차와 겹친다).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { prisma } from '@/lib/prisma';
import {
  BREAK_EVERY,
  BREAK_MINUTES,
  MOVE_MINUTES,
  SETUP_MINUTES,
  SWAP_MINUTES,
  ALL_STATIONS,
  bucketOf,
  layoutWeek,
  loadOf,
  postureOf,
  setupOf,
  shotMinutes,
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
if (plan.version >= 6) {
  console.log(`이미 version ${plan.version} — 멈춤`);
  process.exit(0);
}

const checks = new Map(
  (await prisma.shootCheck.findMany({ select: { exerciseId: true, status: true } })).map((c) => [c.exerciseId, c.status])
);
const stateOf = (it: PlanItem) => checks.get(it.exerciseId) ?? 'todo';
const r1 = (n: number) => Math.round(n * 10) / 10;

/* 차례를 지키며 번호 · 시각을 다시 매긴다(layoutWeek 와 같은 시간 규칙) */
function retime(week: number, groups: { station: PlanStation['station']; items: PlanItem[] }[]): PlanWeek {
  let clock = SETUP_MINUTES;
  let since = 0;
  let prev: PlanItem | null = null;
  let breaks = 0;
  let n = 0;
  const load: PlanWeek['load'] = {};
  const stations: PlanStation[] = [];
  for (const g of groups) {
    if (prev) {
      clock += MOVE_MINUTES;
      since += MOVE_MINUTES;
    }
    const start = clock;
    const items: PlanItem[] = [];
    for (const it of g.items) {
      if (prev && prev.station === it.station && setupOf(prev) !== setupOf(it)) {
        clock += SWAP_MINUTES;
        since += SWAP_MINUTES;
      }
      n++;
      const x: PlanItem = { ...it, no: `${week}-${String(n).padStart(2, '0')}`, at: r1(clock), breakAfter: false };
      items.push(x);
      load[it.bucket] = r1((load[it.bucket] ?? 0) + it.load);
      clock += it.minutes;
      since += it.minutes;
      prev = it;
      if (since >= BREAK_EVERY && breaks < 5) {
        x.breakAfter = true;
        clock += BREAK_MINUTES;
        since = 0;
        breaks++;
      }
    }
    stations.push({ station: g.station, start: r1(start), end: r1(clock), items });
  }
  return { week, end: r1(clock), stations, load };
}

/* 1주차 — 야외 남은 것 */
const outdoorWeeks = plan.weeks.filter((w) => w.outdoor);
const week1 = {
  ...retime(
    1,
    outdoorWeeks.flatMap((w) =>
      w.stations
        .map((s) => ({ station: s.station, items: s.items.filter((it) => ['todo', 'redo'].includes(stateOf(it))) }))
        .filter((g) => g.items.length)
    )
  ),
  outdoor: true,
};

/* 미룬 영상 — 미룸 체크 전부, 자리끼리 */
const allItems = plan.weeks.flatMap((w) => w.stations.flatMap((s) => s.items));
const laterItems = [...new Map(allItems.filter((it) => stateOf(it) === 'later').map((it) => [it.exerciseId, it])).values()];
const deferredWeek: PlanWeek = {
  ...retime(
    3,
    ALL_STATIONS.map((st) => ({ station: st, items: laterItems.filter((it) => it.station === st) })).filter((g) => g.items.length)
  ),
  load: {},
  deferred: true,
};

/* 2주차 — 실내 남은 것(계획에 없고 우리 영상이 없는 운동) */
const inPlan = new Set(allItems.map((it) => it.exerciseId));
const week1Drills = week1.stations.flatMap((s) => s.items).filter((it) => it.kind === 'drill').map((it) => it.exerciseId);
const drillRefs = new Set(
  (await prisma.mechanicsGuide.findMany({ where: { id: { in: week1Drills } }, select: { referenceVideoId: true } }))
    .map((d) => d.referenceVideoId)
    .filter(Boolean)
);
const lib = await prisma.exerciseVideo.findMany({
  where: { hiddenAt: null, videoPath: null },
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
    referenceVideoId: true,
  },
});
await prisma.$disconnect();
const SKIP_TITLES = new Set(['토 워크', '리버스 토 워크']);
const skipped: string[] = [];
const fresh = lib.filter((x) => {
  if (inPlan.has(x.id) || x.category === '나중에 촬영') return false;
  if (SKIP_TITLES.has(x.title)) return skipped.push(`${x.title}(계획에서 뺀 것)`), false;
  if (x.referenceVideoId && drillRefs.has(x.referenceVideoId)) return skipped.push(`${x.title}(1주차 드릴 영상이 붙음)`), false;
  return true;
});
const rows: Row[] = fresh.map((x) => ({
  ...x,
  station: stationOf(x),
  bucket: bucketOf(x),
  minutes: shotMinutes(x),
  load: loadOf(x),
  eqKey: [...x.equipment].sort().join('+') || '맨몸',
  posture: postureOf(x.title),
}));
const week2 = layoutWeek(2, rows);

const next: ShootPlan = {
  ...plan,
  version: 6,
  createdOn: new Date().toISOString().slice(0, 10),
  weeks: [week1, week2, deferredWeek],
};

const count = (w: PlanWeek) => w.stations.reduce((a, s) => a + s.items.length, 0);
for (const w of next.weeks)
  console.log(
    `${w.deferred ? '미룬 영상' : `${w.week}주차`}${w.outdoor ? '(야외)' : ''} ${count(w)}개 · 끝 ${w.end}분 · ` +
      w.stations.map((s) => `${s.warmup ? '몸풀기' : s.station} ${s.items.length}`).join(' · ')
  );
console.log('2주차:', week2.stations.flatMap((s) => s.items.map((i) => i.title)).join(' | '));
console.log('뺀 것:', skipped.join(' | '));
const done = allItems.filter((it) => stateOf(it) === 'done').length;
console.log(`찍음 ${done}개 뺌 · 미룸 ${laterItems.length}개`);
if (write) {
  writeFileSync(FILE, JSON.stringify(next, null, 1) + '\n');
  console.log('lib/shoot/plan-data.json 씀(version 6)');
} else console.log('--write 로 쓴다.');
