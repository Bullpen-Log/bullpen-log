/**
 * 촬영 계획 version 7(2026-11-14 김민: "나중에 촬영은 넣어줘") — 분류 '나중에 촬영'인 투구 드릴(2026-10-14 에 뺀 37개,
 * lib/shoot/later-drills.json)을 야외 1주차에 넣는다. DB 는 읽기만, 계획 파일만 쓴다. version 이 이미 7 이면 멈춘다.
 *
 *   node --env-file=.env --import ./scripts/alias-register.mjs scripts/shoot-plan-v7.mts           # 무엇이 바뀌나만
 *   node --env-file=.env --import ./scripts/alias-register.mjs scripts/shoot-plan-v7.mts --write   # 쓰기
 *
 * 자리 · 분 · 부하 · 시범은 원래 분류(later-drills.json)로 정한다(lib/shoot/outdoor.ts). 지금 1주차 차례는 그대로 두고, 같은 동작
 * (작은 공 · 큰 공)이 이미 있으면 그 바로 뒤에, 없으면 그 자리 끝에 넣는다. 번호 · 시각은 처음부터 다시(v6 과 같은 시간 규칙).
 * 영상을 올리면 원래 분류로 돌아간다(app/actions/shoot.ts attachShootClip).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { prisma } from '@/lib/prisma';
import { drillBucket, drillCue, drillLoad, drillMinutes, drillStation, familyOf, pLevel, type OutdoorDrill } from '@/lib/shoot/outdoor';
import {
  BREAK_EVERY,
  BREAK_MINUTES,
  MOVE_MINUTES,
  OUTDOOR_STATIONS,
  SETUP_MINUTES,
  SWAP_MINUTES,
  setupOf,
  type PlanItem,
  type PlanStation,
  type PlanWeek,
  type ShootPlan,
} from '@/lib/shoot/schedule';

const FILE = new URL('../lib/shoot/plan-data.json', import.meta.url);
const write = process.argv.includes('--write');
const plan = JSON.parse(readFileSync(FILE, 'utf8')) as ShootPlan;
if (plan.version >= 7) {
  console.log(`이미 version ${plan.version} — 멈춤`);
  process.exit(0);
}
const LATER = JSON.parse(readFileSync(new URL('../lib/shoot/later-drills.json', import.meta.url), 'utf8')) as Record<
  string,
  { title: string; category: string }
>;

const rows = await prisma.mechanicsGuide.findMany({
  where: { hiddenAt: null, category: '나중에 촬영' },
  select: { id: true, title: true, equipment: true, stage: true, source: true, videoPath: true },
});
await prisma.$disconnect();
const inPlan = new Set(plan.weeks.flatMap((w) => w.stations.flatMap((s) => s.items.map((i) => i.exerciseId))));
const missing = rows.filter((r) => !LATER[r.id]);
if (missing.length) throw new Error(`원래 분류를 모르는 드릴: ${missing.map((r) => r.title).join(', ')}`);

const STAGE_RANK: Record<string, number> = { 기초: 0, 연결: 1, 통합: 2 };
const TOOL_RANK = (t: string) => (/\(작은 공\)/.test(t) ? 1 : /\(큰 공\)/.test(t) ? 2 : 0);
const fresh: PlanItem[] = rows
  .filter((r) => !inPlan.has(r.id))
  .map((r) => {
    const d: OutdoorDrill = { id: r.id, title: r.title, category: LATER[r.id].category, equipment: r.equipment, stage: r.stage };
    return {
      exerciseId: r.id,
      no: '',
      title: r.title,
      station: drillStation(d),
      bucket: drillBucket(d),
      equipment: r.equipment,
      at: 0,
      minutes: drillMinutes(d),
      load: drillLoad(d),
      cue: drillCue(d),
      perSide: false,
      breakAfter: false,
      kind: 'drill' as const,
      ...(r.stage ? { group: r.stage } : {}),
      ...(r.source === 'OWN' && r.videoPath ? { oldVideo: r.videoPath } : {}),
    };
  })
  .sort(
    (a, b) =>
      familyOf(a.title).localeCompare(familyOf(b.title), 'ko') ||
      pLevel(a.title) - pLevel(b.title) ||
      (STAGE_RANK[a.group ?? ''] ?? 9) - (STAGE_RANK[b.group ?? ''] ?? 9) ||
      TOOL_RANK(a.title) - TOOL_RANK(b.title)
  );

/* 1주차 자리마다 — 같은 동작 바로 뒤, 없으면 자리 끝 */
const w1 = plan.weeks.find((w) => w.week === 1 && w.outdoor);
if (!w1) throw new Error('야외 1주차가 없다');
const groups = new Map<string, PlanItem[]>(w1.stations.map((s) => [s.station, [...s.items]]));
for (const it of fresh) {
  const list = groups.get(it.station) ?? [];
  groups.set(it.station, list);
  const key = `${it.bucket}|${familyOf(it.title)}`;
  let at = -1;
  list.forEach((x, i) => {
    if (`${x.bucket}|${familyOf(x.title)}` === key) at = i;
  });
  list.splice(at >= 0 ? at + 1 : list.length, 0, it);
}

const r1 = (n: number) => Math.round(n * 10) / 10;
let clock = SETUP_MINUTES;
let since = 0;
let prev: PlanItem | null = null;
let breaks = 0;
let n = 0;
const load: PlanWeek['load'] = {};
const stations: PlanStation[] = [];
for (const st of OUTDOOR_STATIONS) {
  const items = groups.get(st);
  if (!items?.length) continue;
  if (prev) {
    clock += MOVE_MINUTES;
    since += MOVE_MINUTES;
  }
  const start = clock;
  const out: PlanItem[] = [];
  for (const it of items) {
    if (prev && prev.station === it.station && setupOf(prev) !== setupOf(it)) {
      clock += SWAP_MINUTES;
      since += SWAP_MINUTES;
    }
    n++;
    const x: PlanItem = { ...it, no: `1-${String(n).padStart(2, '0')}`, at: r1(clock), breakAfter: false };
    out.push(x);
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
  stations.push({ station: st, start: r1(start), end: r1(clock), items: out });
}
const week1: PlanWeek = { ...w1, end: r1(clock), stations, load };
const next: ShootPlan = {
  ...plan,
  version: 7,
  createdOn: new Date().toISOString().slice(0, 10),
  weeks: plan.weeks.map((w) => (w === w1 ? week1 : w)),
};
console.log(
  `1주차 ${w1.stations.reduce((a, s) => a + s.items.length, 0)} → ${stations.reduce((a, s) => a + s.items.length, 0)}개 · 끝 ${week1.end}분 · ` +
    stations.map((s) => `${s.station} ${s.items.length}`).join(' · ')
);
console.log('넣은 것:', fresh.map((f) => f.title).join(' | '));
if (write) {
  writeFileSync(FILE, JSON.stringify(next, null, 1) + '\n');
  console.log('lib/shoot/plan-data.json 씀(version 7)');
} else console.log('--write 로 쓴다.');
