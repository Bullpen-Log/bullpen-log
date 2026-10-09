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
import { writeFileSync } from 'node:fs';
import { prisma } from '@/lib/prisma';
import { buildPlan, DEFAULT_OPTIONS, SESSION_MINUTES, WRAP_MINUTES } from '../lib/shoot/schedule.ts';

const write = process.argv.includes('--write');
const found = await prisma.exerciseVideo.findMany({
  where: { hiddenAt: null },
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
const rows = found.map(({ source, videoPath, ...x }) => ({ ...x, oldVideo: source === 'OWN' ? videoPath : null }));

const today = new Date().toISOString().slice(0, 10);
/*
 * 모든 회가 3시간 안(끝 정리 10분 앞)에 드는 가장 적은 회 수. 부하 무게는 1.75 — 기본 1.5 로 417개를 7회에 나누면 마지막 회에 하체가
 * 몰렸다(최대 − 최소 9.3점, 시험 기준 8). 2026-10-09 탠트럼 5개를 지운 413개에서는 2 가 8.5점이라 1.75(6.0점 · 가장 늦은 끝 2:35).
 * 운동이 바뀌어 시험이 걸리면 1.5 ~ 3 사이를 견줘 7회 그대로 · 차이가 가장 작은 값으로.
 */
const fits = (p: ReturnType<typeof buildPlan>) => p.weeks.every((w) => w.end <= SESSION_MINUTES - WRAP_MINUTES);
let plan = buildPlan(rows, today);
for (let n = DEFAULT_OPTIONS.sessions; n <= 20; n++) {
  plan = { ...buildPlan(rows, today, { ...DEFAULT_OPTIONS, sessions: n, loadWeight: 1.75 }), version: 3 };
  if (fits(plan)) break;
}
for (const w of plan.weeks) {
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
