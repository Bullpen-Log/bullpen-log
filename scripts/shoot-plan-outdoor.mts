/*
 * 야외 주차(투구 드릴 + 워밍업) 뽑기 — DB 를 읽기만 하고 lib/shoot/plan-data.json 의 6주차~ 를 쓴다. 1~5주차(실내)는 그대로.
 *
 *   npm run shoot:outdoor                (미리보기만)
 *   npm run shoot:outdoor -- --write     (파일에 쓰기)
 *
 * 대상: 앱에 보이는(숨기지 않은) 투구 드릴 전부(이미 우리 영상인 것도 다시 찍는다 — oldVideo, version 3). 이름만 있던 워밍업 24개
 * (lib/shoot/warmups.ts)는 2026-10-09 사용자 결정으로 계획에서 뺐다(두 사람이 맞춤). 실내 주차(scripts/shoot-plan.mts) 바로 다음 주부터, 회마다 3시간 안에 드는 가장 적은 회 수로.
 * 한 번 뽑아 고정한다 — 찍는 중에 다시 뽑으면 번호(6-07 …)가 바뀐다. 다시 뽑을 때는 version 을 올린다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { prisma } from '@/lib/prisma';
import { OUTDOOR_DEFAULT, PLYO, buildOutdoorWeeks } from '../lib/shoot/outdoor.ts';
import { SESSION_MINUTES, WRAP_MINUTES, type ShootPlan } from '../lib/shoot/schedule.ts';

const write = process.argv.includes('--write');
const drills = await prisma.mechanicsGuide
  .findMany({
    where: { hiddenAt: null },
    select: { id: true, title: true, category: true, equipment: true, stage: true, source: true, videoPath: true },
  })
  .then((rs) => rs.map(({ source, videoPath, ...d }) => ({ ...d, oldVideo: source === 'OWN' ? videoPath : null })));
await prisma.$disconnect();

const url = new URL('../lib/shoot/plan-data.json', import.meta.url);
const current = JSON.parse(readFileSync(url, 'utf8')) as ShootPlan;
/* 실내 주차(scripts/shoot-plan.mts 가 쓴 주) — 그 바로 다음 주부터 */
const indoor = current.weeks.filter((w) => !w.outdoor);
const firstWeek = Math.max(0, ...indoor.map((w) => w.week)) + 1;
let weeks = buildOutdoorWeeks(drills, [], { ...OUTDOOR_DEFAULT, firstWeek });
for (let n = OUTDOOR_DEFAULT.sessions; n <= 12; n++) {
  weeks = buildOutdoorWeeks(drills, [], { ...OUTDOOR_DEFAULT, firstWeek, sessions: n });
  if (weeks.every((w) => w.end <= SESSION_MINUTES - WRAP_MINUTES)) break;
}
const clock = (m: number) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}`;
for (const w of weeks) {
  const items = w.stations.flatMap((s) => s.items);
  const by = (b: string) => items.filter((i) => i.bucket === b).length;
  const jumps = items.filter((i) => i.kind === 'drill' && PLYO.test(i.title)).length;
  console.log(
    `${w.week}주차 ${items.length}개(워밍업 ${by('워밍업')} · 무브먼트 ${by('무브먼트 패턴 드릴')} · 메디신볼 ${by('메디신볼 드릴')} · 스로잉 ${by('스로잉 드릴')} · 점프 ${jumps}) · 끝 ${clock(w.end)} · 여유 ${Math.round(SESSION_MINUTES - WRAP_MINUTES - w.end)}분 · 자리 ${w.stations.length}곳`
  );
}
console.log(`드릴 ${drills.length}개(우리 영상 있던 것 ${drills.filter((d) => d.oldVideo).length}) · ${firstWeek}주차부터 ${weeks.length}주`);

if (write) {
  const next: ShootPlan = { ...current, version: 3, weeks: [...indoor, ...weeks] };
  writeFileSync(url, JSON.stringify(next, null, 1) + '\n');
  console.log(`lib/shoot/plan-data.json 에 썼다(실내 ${indoor.length}주 그대로 + 야외 ${weeks.length}주, version 3)`);
}
