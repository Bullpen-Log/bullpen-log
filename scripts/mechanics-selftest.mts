/**
 * 투구 메커니즘 프로그램 규칙 자체 검사 — lib/mechanics/program.ts.
 *
 *   npm run mechanics:test
 *
 * 드릴은 공유 DB 에서 읽기만 한다(숨긴 것 빼고 — 화면과 같은 목록). 강조 일곱 가지(없음 + 여섯) × 단계 조합 × 세션
 * 열 번으로 세션을 짜 보고, 개수 · 요소 · 단계 · 겹침 · 분류 섞임 · 돌아감을 본다. 느낌을 반영하는 규칙도 본다.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { groupDrills } from '@/lib/mechanics/drills';
import { MECHANICS_ELEMENTS, type MechanicsElementName } from '@/lib/mechanics/elements';
import {
  EASY_TO_ADVANCE,
  applyFeel,
  buildSession,
  freshProgress,
  isMastered,
  readProgress,
  sessionElements,
  type DrillStage,
  type ProgramProgress,
} from '@/lib/mechanics/program';
import type { CachedGuide } from '@/lib/library-cache';

let pass = 0;
let fail = 0;
function ok(cond: boolean, name: string, detail = '') {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const rows = await prisma.mechanicsGuide.findMany({
  where: { hiddenAt: null },
  orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
});
await prisma.$disconnect();
const guides = rows.map((r) => ({
  ...r,
  createdAt: r.createdAt.toISOString(),
  hiddenAt: null,
})) as CachedGuide[];
const drills = groupDrills(guides);
const NAMES = MECHANICS_ELEMENTS.map((e) => e.name);
const STAGES: DrillStage[] = ['기초', '연결', '통합'];

console.log(`드릴 ${guides.length}개 · 동작 ${drills.length}가지`);

/* ── 자료: 요소마다 단계마다 주 요소인 동작이 하나 이상 ── */
for (const name of NAMES) {
  for (const stage of STAGES) {
    const n = drills.filter((d) => d.focusPoints[0] === name && d.stage === stage).length;
    ok(n > 0, `자료 ${name} ${stage}`, `${n}가지`);
  }
}

/* ── 진행 읽기 ── */
const fresh = freshProgress();
ok(NAMES.every((n) => fresh[n].stage === '기초' && fresh[n].easy === 0), '처음은 모두 기초 · 0');
const odd = readProgress({ 드롭: { stage: '연결', easy: 9 }, 브레이크: { stage: '최고', easy: -2 } });
ok(odd['드롭'].stage === '연결' && odd['드롭'].easy === EASY_TO_ADVANCE, '쉬움 수는 상한에서 자름');
ok(odd['브레이크'].stage === '기초' && odd['브레이크'].easy === 0, '모르는 단계 · 음수는 기초 · 0');
ok(readProgress(null)['스로잉'].stage === '기초', 'null 이어도 여섯 요소');

/* ── 느낌 ── */
{
  let p = freshProgress();
  let r = applyFeel(p, '드롭', 'easy');
  ok(r.progress['드롭'].easy === 1 && !r.leveled, '쉬움 한 번은 셈만');
  p = r.progress;
  r = applyFeel(p, '드롭', 'ok');
  ok(r.progress['드롭'].easy === 1, '적당은 그대로');
  p = r.progress;
  r = applyFeel(p, '드롭', 'hard');
  ok(r.progress['드롭'].easy === 0, '어려움은 처음부터');
  p = r.progress;
  for (let i = 0; i < EASY_TO_ADVANCE; i++) {
    r = applyFeel(p, '드롭', 'easy');
    p = r.progress;
  }
  ok(p['드롭'].stage === '연결' && p['드롭'].easy === 0 && r.leveled === '연결', '쉬움 세 번이면 연결로');
  ok(p['드리프트'].stage === '기초', '다른 요소는 그대로');
  for (let i = 0; i < EASY_TO_ADVANCE; i++) p = applyFeel(p, '드롭', 'easy').progress;
  ok(p['드롭'].stage === '통합', '또 세 번이면 통합');
  let last = null as DrillStage | null;
  for (let i = 0; i < EASY_TO_ADVANCE + 2; i++) {
    const x = applyFeel(p, '드롭', 'easy');
    p = x.progress;
    last = x.leveled ?? last;
  }
  ok(p['드롭'].stage === '통합' && last === null && isMastered(p['드롭']), '통합 위로는 안 오르고 다 익힘');
}

/* ── 세션의 요소 ── */
ok(
  sessionElements(null, 0).join() === '드리프트,드롭,상하체 분리' &&
    sessionElements(null, 1).join() === '브레이크,몸통 회전,스로잉',
  '강조 없으면 반씩 번갈아'
);
for (const focus of NAMES) {
  const seen = new Map<string, number>();
  let always = true;
  for (let s = 0; s < 5; s++) {
    const els = sessionElements(focus, s);
    if (!els.includes(focus) || els.length !== 3) always = false;
    for (const e of els) if (e !== focus) seen.set(e, (seen.get(e) ?? 0) + 1);
  }
  ok(always, `강조 ${focus}는 세션마다`);
  ok(
    seen.size === 5 && [...seen.values()].every((v) => v === 2),
    `강조 ${focus}: 다섯 번이면 나머지가 두 번씩`,
    JSON.stringify(Object.fromEntries(seen))
  );
}

/* ── 세션 짜기 ── */
const allAt = (stage: DrillStage): ProgramProgress =>
  readProgress(Object.fromEntries(NAMES.map((n) => [n, { stage, easy: 0 }])));
const mixed = readProgress({
  드리프트: { stage: '통합' },
  드롭: { stage: '연결' },
  '상하체 분리': { stage: '기초' },
  브레이크: { stage: '통합' },
  '몸통 회전': { stage: '연결' },
  스로잉: { stage: '기초' },
});
const progresses: [string, ProgramProgress][] = [
  ['모두 기초', allAt('기초')],
  ['모두 연결', allAt('연결')],
  ['모두 통합', allAt('통합')],
  ['섞임', mixed],
];
let sessions = 0;
let withThrow = 0;
let withMovement = 0;
const categoryKinds = new Map<number, number>();
for (const focus of [null, ...NAMES] as (MechanicsElementName | null)[]) {
  for (const [label, progress] of progresses) {
    for (let s = 0; s < 10; s++) {
      const items = buildSession({ drills, progress, focus, sessionsDone: s });
      const tag = `${focus ?? '강조 없음'} · ${label} · ${s}번째`;
      sessions += 1;
      ok(items.length === (focus ? 4 : 3), `개수 ${tag}`, `${items.length}개`);
      const want = sessionElements(focus, s);
      ok(
        items.every((it) => want.includes(it.element)),
        `요소 ${tag}`,
        items.map((i) => i.element).join()
      );
      if (focus) ok(items.filter((i) => i.element === focus).length === 2, `강조 둘 ${tag}`);
      ok(
        items.every((it) => it.stage === progress[it.element].stage),
        `지금 단계 ${tag}`,
        items.map((i) => `${i.element}:${i.stage}`).join()
      );
      ok(new Set(items.map((i) => i.title)).size === items.length, `겹침 없음 ${tag}`);
      ok(
        items.every((it) => guides.some((g) => g.id === it.guideId)),
        `드릴 id ${tag}`
      );
      ok(items.every((it) => it.dose && it.cue), `처방 · 신호 ${tag}`);
      /* 투구 차례대로 */
      const order = items.map((i) => NAMES.indexOf(i.element));
      ok(order.every((v, i) => i === 0 || order[i - 1] <= v), `차례 ${tag}`);
      if (items.some((i) => i.category === '스로잉 드릴')) withThrow += 1;
      if (items.some((i) => i.category === '무브먼트 패턴 드릴')) withMovement += 1;
      const kinds = new Set(items.map((i) => i.category)).size;
      categoryKinds.set(kinds, (categoryKinds.get(kinds) ?? 0) + 1);
    }
  }
}

/* 돌아감 — 같은 진행에서 세션이 바뀌면 드릴도 바뀐다(후보가 둘 이상인 요소) */
{
  const p = allAt('기초');
  const titles = new Set<string>();
  for (let s = 0; s < 6; s += 2) {
    for (const it of buildSession({ drills, progress: p, focus: null, sessionsDone: s })) {
      if (it.element === '드리프트') titles.add(it.title);
    }
  }
  ok(titles.size >= 2, '드리프트 기초 드릴이 세션마다 돈다', [...titles].join(' / '));
}

console.log(
  `세션 ${sessions}개 — 스로잉 드릴이 든 세션 ${withThrow} · 무브먼트가 든 세션 ${withMovement} · 분류 가짓수 ${JSON.stringify(
    Object.fromEntries(categoryKinds)
  )}`
);
ok(withThrow / sessions >= 0.6, '스로잉 드릴이 든 세션이 6할 넘음', `${withThrow}/${sessions}`);
ok(withMovement / sessions >= 0.6, '무브먼트가 든 세션이 6할 넘음', `${withMovement}/${sessions}`);

console.log(`\n${pass}개 통과, ${fail}개 실패`);
if (fail > 0) process.exit(1);
