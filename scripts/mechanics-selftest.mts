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
  stepDown,
  buildSession,
  canUseVariant,
  doseOf,
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

/* ── 느낌(하루 한 번 세기 · 내려가기) ── */
{
  const D = (k: number) => `2026-10-${String(k).padStart(2, '0')}`;
  let p = freshProgress();
  let r = applyFeel(p, '드롭', 'easy', D(1));
  ok(r.progress['드롭'].easy === 1 && !r.leveled, '쉬움 한 번은 셈만');
  p = r.progress;
  r = applyFeel(p, '드롭', 'easy', D(1));
  ok(r.progress['드롭'].easy === 1, '같은 날 쉬움은 한 번만');
  p = r.progress;
  r = applyFeel(p, '드롭', 'ok', D(2));
  ok(r.progress['드롭'].easy === 1, '적당은 그대로');
  p = r.progress;
  r = applyFeel(p, '드롭', 'hard', D(3));
  ok(r.progress['드롭'].easy === 0 && !r.struggling, '어려움은 처음부터 · 기초에서는 내려가기 안 물음');
  p = r.progress;
  let day = 4;
  for (let i = 0; i < EASY_TO_ADVANCE; i++) {
    r = applyFeel(p, '드롭', 'easy', D(day++));
    p = r.progress;
  }
  ok(p['드롭'].stage === '연결' && p['드롭'].easy === 0 && r.leveled === '연결', '다른 날 쉬움 세 번이면 연결로');
  r = applyFeel(p, '드롭', 'easy', D(day - 1));
  ok(r.progress['드롭'].easy === 0 && !r.leveled, '오른 날에는 새 단계 쉬움을 안 셈');
  ok(p['드리프트'].stage === '기초', '다른 요소는 그대로');
  /* 하루에 두 세션(강조라 드릴 둘씩)을 해도 그날 오르지 않는다 */
  {
    let q = freshProgress();
    let up = null as DrillStage | null;
    for (let k = 0; k < 4; k++) {
      const x = applyFeel(q, '브레이크', 'easy', D(20));
      q = x.progress;
      up = x.leveled ?? up;
    }
    ok(q['브레이크'].stage === '기초' && q['브레이크'].easy === 1 && up === null, '하루에 쉬움 네 번이어도 하나');
  }
  /* 어려움이 다른 날 두 번 이어지면 내려갈지 묻는다(같은 날 두 번은 하나) */
  r = applyFeel(p, '드롭', 'hard', D(day));
  ok(!r.struggling && r.progress['드롭'].hard === 1, '어려움 첫날은 안 물음');
  r = applyFeel(r.progress, '드롭', 'hard', D(day));
  ok(!r.struggling && r.progress['드롭'].hard === 1, '같은 날 어려움 두 번은 하나');
  r = applyFeel(r.progress, '드롭', 'hard', D(day + 1));
  ok(r.struggling && r.progress['드롭'].hard === 2, '다른 날 어려움 두 번이면 물음');
  const okBreak = applyFeel(r.progress, '드롭', 'ok', D(day + 2));
  ok(okBreak.progress['드롭'].hard === 0, '적당이면 어려움 줄이 끊김');
  const down = stepDown(r.progress, '드롭');
  ok(down['드롭'].stage === '기초' && down['드롭'].easy === 0 && down['드롭'].hard === 0, '내려가기는 한 단계 아래 · 처음부터');
  ok(stepDown(freshProgress(), '드롭')['드롭'].stage === '기초', '기초에서 내려가기는 그대로');
  /* 통합 위로는 안 오른다 */
  let t = readProgress({ 드롭: { stage: '통합', easy: 0 } });
  let last = null as DrillStage | null;
  for (let i = 0; i < EASY_TO_ADVANCE + 2; i++) {
    const x = applyFeel(t, '드롭', 'easy', D(10 + i));
    t = x.progress;
    last = x.leveled ?? last;
  }
  ok(t['드롭'].stage === '통합' && last === null && isMastered(t['드롭']), '통합 위로는 안 오르고 다 익힘');
  /* 옛 줄(stage · easy 만)도 읽는다 */
  const old = readProgress({ 드롭: { stage: '연결', easy: 2 } });
  ok(old['드롭'].easyOn === null && old['드롭'].hard === 0, '옛 줄은 날짜 없음 · 어려움 0');
}

/* ── 세션의 요소 — 세 묶음(하체 · 가운데 · 상체)에서 하나씩 ── */
const GROUPS = [NAMES.slice(0, 2), NAMES.slice(2, 4), NAMES.slice(4, 6)];
const chained = (els: MechanicsElementName[]) => els.length === 3 && GROUPS.every((g, i) => g.includes(els[i]));
{
  const seen = new Map<string, number>();
  const combos = new Set<string>();
  let chain = true;
  for (let s = 0; s < 4; s++) {
    const els = sessionElements(null, s);
    if (!chained(els)) chain = false;
    combos.add(els.join());
    for (const e of els) seen.set(e, (seen.get(e) ?? 0) + 1);
  }
  ok(chain, '강조 없으면 세션마다 하체 · 가운데 · 상체에서 하나씩');
  ok(seen.size === 6 && [...seen.values()].every((v) => v === 2), '강조 없으면 네 번에 모두 두 번씩', JSON.stringify(Object.fromEntries(seen)));
  ok(combos.size === 4, '네 번의 조합이 모두 다름');
}
for (const focus of NAMES) {
  const seen = new Map<string, number>();
  let always = true;
  for (let s = 0; s < 4; s++) {
    const els = sessionElements(focus, s);
    if (!els.includes(focus) || !chained(els)) always = false;
    for (const e of els) if (e !== focus) seen.set(e, (seen.get(e) ?? 0) + 1);
  }
  ok(always, `강조 ${focus}는 세션마다 · 사슬 그대로`);
  ok(
    seen.size === 4 && [...seen.values()].every((v) => v === 2),
    `강조 ${focus}: 다른 두 묶음 넷이 네 번에 두 번씩`,
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
ok(withThrow / sessions >= 0.8, '스로잉 드릴이 든 세션이 8할 넘음', `${withThrow}/${sessions}`);
ok(withMovement / sessions >= 0.6, '무브먼트가 든 세션이 6할 넘음', `${withMovement}/${sessions}`);

/* ── 장비 ── 가진 장비로 할 수 있는 것을 고르고, 못 하면 한 단계 아래 · 그래도 없으면 알림(2026-10-04 검토) */
const stageAt = (st: string | null) => DRILL_STAGES_ORDER.indexOf(st as DrillStage);
const DRILL_STAGES_ORDER: DrillStage[] = ['기초', '연결', '통합'];
const usable = (title: string, owned: ReadonlySet<string> | null) =>
  drills.find((d) => d.title === title)?.variants.some((v) => canUseVariant(v, owned)) ?? false;
const gearSets: [string, ReadonlySet<string> | null][] = [
  ['안 고름', null],
  ['맨몸 · 야구공만', new Set<string>()],
  ['밴드만', new Set(['밴드'])],
  ['메디신볼', new Set(['메디신볼'])],
  ['다 있음', new Set(['밴드', '메디신볼', '플라이오볼', '워터백', '워터볼'])],
];
let gearSessions = 0;
let fallbackItems = 0;
let loweredItems = 0;
for (const [gearLabel, owned] of gearSets) {
  for (const focus of [null, ...NAMES] as (MechanicsElementName | null)[]) {
    for (const [label, progress] of progresses) {
      for (let s = 0; s < 6; s++) {
        const items = buildSession({ drills, progress, focus, sessionsDone: s, owned });
        const tag = `${gearLabel} · ${focus ?? '강조 없음'} · ${label} · ${s}번째`;
        gearSessions += 1;
        ok(items.length === (focus ? 4 : 3), `장비 개수 ${tag}`, `${items.length}개`);
        if (owned === null) {
          const plain = buildSession({ drills, progress, focus, sessionsDone: s });
          ok(
            JSON.stringify(plain) === JSON.stringify(items),
            `장비를 안 고르면 예전 그대로 ${tag}`
          );
        }
        const titles = new Set(items.map((i) => i.title));
        for (const it of items) {
          const v = drills.flatMap((d) => d.variants).find((x) => x.id === it.guideId);
          const can = v ? canUseVariant(v, owned) : false;
          if (!can) {
            fallbackItems += 1;
            ok(
              it.gearNote != null && it.gearNote.lowered === null && it.gearNote.need.length > 0,
              `못 하는 도구면 알림 ${tag} ${it.title}`
            );
          }
          ok(it.dose === doseOf(it.category), `처방이 분류대로 ${tag}`);
          ok(stageAt(it.stage) <= stageAt(progress[it.element].stage), `단계는 넘지 않음 ${tag}`);
          if (it.stage !== progress[it.element].stage && can) {
            loweredItems += 1;
            /* 지금 단계에 할 수 있는 동작이 정말 없었나(세션의 다른 칸이 가져간 것 말고) */
            const doable = drills.some(
              (d) =>
                d.stage === progress[it.element].stage &&
                d.focusPoints.includes(it.element) &&
                d.variants.some((x) => canUseVariant(x, owned))
            );
            if (!doable) {
              ok(
                it.gearNote?.lowered === progress[it.element].stage && it.gearNote.need.length > 0,
                `내려 고르면 무엇이 있으면 되는지 ${tag} ${it.element}`,
                JSON.stringify(it.gearNote)
              );
            }
          }
          if (it.gearNote?.lowered) {
            ok(owned !== null, `장비를 안 골랐으면 장비 알림 없음 ${tag}`);
          }
          /* 바꿔 할 동작 — 같은 요소 · 같은 단계, 이 세션에 없는 것, 할 수 있는 것, 넷까지 */
          ok(it.swaps.length <= 4, `바꿀 동작 넷까지 ${tag}`);
          ok(
            it.swaps.every((w) => {
              const d = drills.find((x) => x.title === w.title);
              return (
                d != null &&
                d.stage === it.stage &&
                d.focusPoints.includes(it.element) &&
                !titles.has(w.title) &&
                d.variants.some((x) => x.id === w.guideId && canUseVariant(x, owned)) &&
                w.tool === d.variants.find((x) => x.id === w.guideId)?.tool
              );
            }),
            `바꿀 동작 ${tag} ${it.title}`,
            it.swaps.map((w) => w.title).join(' / ')
          );
          ok(new Set(it.swaps.map((w) => w.title)).size === it.swaps.length, `바꿀 동작 겹침 없음 ${tag}`);
          if (owned) ok(it.swaps.every((w) => usable(w.title, owned)), `바꿀 동작은 할 수 있는 것 ${tag}`);
        }
      }
    }
  }
}
console.log(
  `장비 세션 ${gearSessions}개 — 못 하는 도구로 남은 칸 ${fallbackItems} · 장비 때문에 한 단계 아래 ${loweredItems}`
);
/* 맨몸 · 야구공만 가진 사람도 드릴 대부분은 할 수 있어야 한다 */
{
  const owned = new Set<string>();
  let total = 0;
  let can = 0;
  for (const focus of [null, ...NAMES] as (MechanicsElementName | null)[]) {
    for (const [, progress] of progresses) {
      for (let s = 0; s < 6; s++) {
        for (const it of buildSession({ drills, progress, focus, sessionsDone: s, owned })) {
          total += 1;
          const v = drills.flatMap((d) => d.variants).find((x) => x.id === it.guideId);
          if (v && canUseVariant(v, owned)) can += 1;
        }
      }
    }
  }
  console.log(`맨몸 · 야구공만: 할 수 있는 칸 ${can}/${total}`);
  ok(can / total >= 0.95, '맨몸 · 야구공만 가져도 9할 5푼 넘게 할 수 있음', `${can}/${total}`);
}
ok(canUseVariant({ equipment: ['맨몸', '야구공'] }, new Set()), '맨몸 · 야구공은 누구나');
ok(!canUseVariant({ equipment: ['메디신볼'] }, new Set(['밴드'])), '없는 장비는 못 함');
ok(canUseVariant({ equipment: ['메디신볼'] }, null), '장비를 안 고르면 다 됨');
ok(canUseVariant({}, new Set()), '장비 칸이 없으면 맨몸');

console.log(`\n${pass}개 통과, ${fail}개 실패`);
if (fail > 0) process.exit(1);
