/*
 * 트레이닝 영상 촬영 계획 뽑기 — DB 를 읽기만 하고 lib/shoot/plan-data.json 을 쓴다.
 *
 *   node --env-file=.env --import ./scripts/alias-register.mjs scripts/shoot-plan.mts            (미리보기만)
 *   node --env-file=.env --import ./scripts/alias-register.mjs scripts/shoot-plan.mts --write    (파일에 쓰기)
 *
 * 대상: 앱에 보이는(숨기지 않은) 운동 전부 — 이미 우리 영상인 것도 다시 찍는다(김민 2026-10-09, version 3. 예전에는 유튜브 참고
 * 영상(REFERENCE)만). 우리 영상이 있던 운동은 그 경로를 oldVideo 로 남겨, 이번 촬영에서 새로 올렸는지 가린다(lib/shoot/load.ts uploaded).
 * 회 수는 모든 회가 3시간 안에 들도록 가장 적게. 계획은 한 번 뽑아 고정한다 — 촬영 중에 다시 뽑으면 번호(1-07 …)와 주차가 바뀌어
 * 찍던 카드가 어긋난다. 다시 뽑을 때는 version 을 올린다. 야외(투구 드릴)는 이 뒤에 scripts/shoot-plan-outdoor.mts 로 붙인다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { prisma } from '@/lib/prisma';
import { buildPlan, DEFAULT_OPTIONS, SESSION_MINUTES, WRAP_MINUTES, type ShootPlan } from '../lib/shoot/schedule.ts';

const write = process.argv.includes('--write');
/*
 * --from=2 — 이 주차 앞(찍은 주)과 야외 주차는 지금 파일 그대로 두고, 남은 실내 운동만 이 주차부터 다시 나눈다
 * (2026-10-10 1주차 촬영 뒤 사용자: 몸풀기 먼저 · 같은 준비물끼리). 찍은 주의 번호판이 바뀌지 않는다.
 */
const fromArg = process.argv.find((a) => a.startsWith('--from='));
const from = fromArg ? Number(fromArg.slice(7)) : 1;
const old = JSON.parse(readFileSync(new URL('../lib/shoot/plan-data.json', import.meta.url), 'utf8')) as ShootPlan;
const kept = old.weeks.filter((w) => !w.outdoor && w.week < from);
const outdoor = old.weeks.filter((w) => w.outdoor);
const keptIds = new Set(kept.flatMap((w) => w.stations.flatMap((s) => s.items.map((i) => i.exerciseId))));
const indoorWeeks = old.weeks.filter((w) => !w.outdoor).length;
/* 워밍업 카테고리는 실내 촬영에서 뺀다 — 영상은 라이브러리에 두고 워밍업 루틴에서 쓴다(2026-10-10 사용자: 하체 다이내믹 워밍업 루틴) */
const found = await prisma.exerciseVideo.findMany({
  where: { hiddenAt: null, category: { not: '워밍업' } },
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
    source: true,
    videoPath: true,
  },
});
await prisma.$disconnect();
const rows = found
  .filter((x) => !keptIds.has(x.id))
  .map(({ source, videoPath, ...x }) => ({ ...x, oldVideo: source === 'OWN' ? videoPath : null }));

const today = new Date().toISOString().slice(0, 10);
/*
 * 모든 회가 3시간 안(끝 정리 10분 앞)에 드는 가장 적은 회 수. 부하 무게는 1.75 — 기본 1.5 로 417개를 7회에 나누면 마지막 회에 하체가
 * 몰렸다(최대 − 최소 9.3점, 시험 기준 8). 2026-10-09 탠트럼 5개를 지운 413개에서는 2 가 8.5점이라 1.75(6.0점 · 가장 늦은 끝 2:35).
 * 운동이 바뀌어 시험이 걸리면 1.5 ~ 3 사이를 견줘 7회 그대로 · 차이가 가장 작은 값으로.
 */
const fits = (p: ReturnType<typeof buildPlan>) => p.weeks.every((w) => w.end <= SESSION_MINUTES - WRAP_MINUTES);
let plan = buildPlan(rows, today);
/* 7회 아래로는 줄이지 않는다 — 2026-10-10 408개는 6회에 들긴 했지만 여유 5분 · 하체 차이 11점이었고 야외 주차 번호가 당겨졌다 */
const minSessions = from > 1 ? indoorWeeks - kept.length : Math.max(DEFAULT_OPTIONS.sessions, 7);
for (let n = minSessions; n <= 20; n++) {
  /* --from=2(2026-10-10, 360개 · 6회): 1.75 는 하체 차이 9.7점이라 2(3.0점 · 가장 늦은 끝 2:40) — 1.5~3 · 자리 벌점 0.8~1.6 을 견줘 고름 */
  plan = { ...buildPlan(rows, today, { ...DEFAULT_OPTIONS, sessions: n, loadWeight: from > 1 ? 2 : 1.75 }), version: 3 };
  if (fits(plan)) break;
}
if (from > 1) {
  /* 새로 나눈 주를 from 주차부터 — 번호(2-01 …)도 그 주차로 */
  for (const w of plan.weeks) {
    w.week += kept.length;
    for (const s of w.stations) for (const i of s.items) i.no = `${w.week}-${i.no.split('-')[1]}`;
  }
  if (plan.weeks.length + kept.length !== indoorWeeks)
    console.log(`실내 주차 수가 ${indoorWeeks} → ${plan.weeks.length + kept.length} 로 바뀜 — 야외 주차 번호를 다시 뽑아야 한다`);
  plan = { ...plan, weeks: [...kept, ...plan.weeks, ...outdoor] };
}
for (const w of plan.weeks.filter((w) => !w.outdoor)) {
  const n = w.stations.reduce((a, s) => a + s.items.length, 0);
  const lower = [
    '하체 파워',
    '하체 앞(무릎)',
    '하체 뒤(힌지)',
    '고관절 · 발목 보강',
    '유산소',
  ] as const;
  const leg = lower.reduce((a, b) => a + (w.load[b] ?? 0), 0);
  console.log(
    `${w.week}주차 ${n}개 · 끝 ${Math.floor(w.end / 60)}:${String(Math.round(w.end % 60)).padStart(2, '0')} · 여유 ${Math.round(SESSION_MINUTES - WRAP_MINUTES - w.end)}분 · 자리 ${w.stations.length}곳 · 하체 ${leg.toFixed(1)}`
  );
}
console.log(`합계 ${rows.length}개(우리 영상 있던 것 ${rows.filter((r) => r.oldVideo).length}) · ${plan.weeks.length}회`);
if (write) {
  writeFileSync(
    new URL('../lib/shoot/plan-data.json', import.meta.url),
    JSON.stringify(plan, null, 1) + '\n'
  );
  console.log('lib/shoot/plan-data.json 에 썼다');
}
