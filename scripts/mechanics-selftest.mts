/**
 * 투구 메커니즘 프로그램 규칙 자체 검사 — lib/mechanics/program.ts · levels.ts.
 *
 *   npm run mechanics:test
 *
 * 드릴은 공유 DB 에서 읽기만 한다(숨긴 것 빼고 — 화면과 같은 목록). 2026-10-04 바뀐 틀(수준을 골라 정해진 세션을 따라 한다)에
 * 맞춰 본다: 수준 넷의 세션이 모두 라이브러리에 있는 드릴인지 · 단계가 수준에 맞는지 · 투구 차례인지 · 두 주 묶음마다 여섯
 * 요소가 다 나오는지, 장비에 맞춰 바꿔 넣기, 느낌 세기(하루 한 번), 권하기, 옛 진행 읽기, 영상 찍기 알림.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { groupDrills } from '@/lib/mechanics/drills';
import { MECHANICS_ELEMENTS, type MechanicsElementName } from '@/lib/mechanics/elements';
import {
  MECHANICS_LEVELS,
  PER_WEEK,
  SESSIONS_PER_LEVEL,
  WEEKS,
  isLevelKey,
  levelSession,
  nextLevel,
  prevLevel,
} from '@/lib/mechanics/levels';
import {
  EASY_DAYS,
  FILM_EVERY,
  HARD_DAYS,
  buildLevelSession,
  canUseVariant,
  countFeel,
  doseOf,
  filmPrompt,
  freshState,
  levelAdvice,
  programStateJson,
  readProgramState,
  type DrillStage,
  type ProgramState,
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
const byTitle = new Map(drills.map((d) => [d.title, d] as const));
const NAMES = MECHANICS_ELEMENTS.map((e) => e.name);
/** 투구의 세 묶음 — 하체 · 가운데 · 상체 */
const groupOf = (el: string) => Math.floor(NAMES.indexOf(el as MechanicsElementName) / 2);
const FREE = new Set<string>();
const variantOf = (id: string) => drills.flatMap((d) => d.variants).find((v) => v.id === id);

console.log(`드릴 ${guides.length}개 · 동작 ${drills.length}가지`);

/* ── 수준 정의 ── */
ok(MECHANICS_LEVELS.length === 4, '수준 넷');
ok(
  MECHANICS_LEVELS.map((l) => l.name).join() === '입문,초급,중급,고급',
  '입문 · 초급 · 중급 · 고급 차례'
);
ok(SESSIONS_PER_LEVEL === WEEKS * PER_WEEK && SESSIONS_PER_LEVEL === 12, '4주 × 주 3번 = 12');
ok(nextLevel('intro')?.key === 'beginner' && nextLevel('advanced') === null, '다음 수준');
ok(prevLevel('beginner')?.key === 'intro' && prevLevel('intro') === null, '아래 수준');
ok(isLevelKey('intermediate') && !isLevelKey('expert') && !isLevelKey(null), '수준 이름 확인');

for (const lv of MECHANICS_LEVELS) {
  ok(
    lv.blocks.length === 2 && lv.blocks.every((b) => b.length === PER_WEEK),
    `${lv.name}: 두 주 묶음 둘 · 묶음마다 세션 셋`
  );
  lv.blocks.forEach((block, bi) => {
    const mains = new Set<string>();
    const weeks = bi === 0 ? '1~2' : '3~4';
    block.forEach((titles, si) => {
      const tag = `${lv.name} ${weeks}주차 ${si + 1}번째`;
      ok(titles.length === 3, `세션 드릴 셋 ${tag}`, `${titles.length}개`);
      ok(new Set(titles).size === titles.length, `세션 안 겹침 없음 ${tag}`);
      const found = titles.map((t) => byTitle.get(t));
      titles.forEach((t, i) => ok(found[i] != null, `라이브러리에 있음 ${tag}: ${t}`));
      const ds = found.filter((d): d is NonNullable<typeof d> => d != null);
      ok(
        ds.every((d) => lv.stages.includes(d.stage as DrillStage)),
        `단계가 수준에 맞음 ${tag}`,
        ds.map((d) => `${d.title}:${d.stage}`).join(', ')
      );
      const groups = ds.map((d) => groupOf(d.focusPoints[0]));
      ok(
        groups.every((g, i) => i === 0 || groups[i - 1] <= g),
        `투구 차례(하체 → 가운데 → 상체) ${tag}`,
        groups.join()
      );
      ok(new Set(groups).size === 3, `세 묶음에서 하나씩 ${tag}`, groups.join());
      for (const d of ds) mains.add(d.focusPoints[0]);
    });
    ok(mains.size === 6, `${lv.name} ${weeks}주차: 여섯 요소가 다 나옴`, [...mains].join());
  });
}
/* 입문은 맨몸 · 야구공만으로 다 할 수 있어야 한다 */
for (const titles of MECHANICS_LEVELS[0].blocks.flat()) {
  for (const t of titles) {
    const d = byTitle.get(t);
    ok(d != null && d.variants.some((v) => canUseVariant(v, FREE)), `입문은 맨몸 · 야구공으로: ${t}`);
  }
}
/* 단계 구성 — 입문은 기초만, 고급은 통합이 가장 많다 */
const stageCount = (key: string, stage: string) =>
  (MECHANICS_LEVELS.find((l) => l.key === key)?.blocks.flat(2) ?? []).filter(
    (t) => byTitle.get(t)?.stage === stage
  ).length;
ok(stageCount('intro', '기초') === 18, '입문은 기초 드릴만');
ok(stageCount('beginner', '통합') === 0 && stageCount('beginner', '연결') > 0, '초급은 기초 + 연결');
ok(stageCount('intermediate', '연결') > stageCount('intermediate', '통합'), '중급은 연결 위주');
ok(stageCount('advanced', '통합') > stageCount('advanced', '연결'), '고급은 통합 위주');

/* ── 몇 번째 세션 ── */
ok(levelSession('intro', 0)?.week === 1 && levelSession('intro', 0)?.day === 1, '처음은 1주차 1번째');
ok(levelSession('intro', 2)?.day === 3 && levelSession('intro', 3)?.week === 2, '세 번 뒤 2주차');
ok(
  levelSession('intro', 6)?.titles.join() === MECHANICS_LEVELS[0].blocks[1][0].join(),
  '3주차부터 D 묶음'
);
ok(
  levelSession('intro', 3)?.titles.join() === MECHANICS_LEVELS[0].blocks[0][0].join(),
  '2주차는 A 묶음을 다시'
);
ok(
  levelSession('advanced', 11)?.week === 4 && levelSession('advanced', 11)?.day === 3,
  '마지막은 4주차 3번째'
);
ok(levelSession('intro', 12) === null && levelSession('intro', -1) === null, '범위 밖은 null');

/* ── 세션 펼치기 · 장비 ── */
const gearSets: [string, ReadonlySet<string> | null][] = [
  ['안 고름', null],
  ['맨몸 · 야구공만', new Set<string>()],
  ['메디신볼', new Set(['메디신볼'])],
  ['다 있음', new Set(['밴드', '메디신볼', '플라이오볼', '워터백', '워터볼'])],
];
let built = 0;
let replaced = 0;
let lacking = 0;
for (const [gearLabel, owned] of gearSets) {
  for (const lv of MECHANICS_LEVELS) {
    for (let i = 0; i < SESSIONS_PER_LEVEL; i++) {
      const items = buildLevelSession({ drills, level: lv.key, index: i, owned });
      const tag = `${gearLabel} · ${lv.name} ${i + 1}번째`;
      built += 1;
      ok(items.length === 3, `드릴 셋 ${tag}`, `${items.length}개`);
      ok(new Set(items.map((x) => x.title)).size === items.length, `겹침 없음 ${tag}`);
      const groups = items.map((x) => groupOf(x.element));
      ok(groups.every((g, k) => k === 0 || groups[k - 1] <= g), `차례 ${tag}`);
      for (const it of items) {
        const v = variantOf(it.guideId);
        ok(v != null, `드릴 id ${tag}`);
        const can = v ? canUseVariant(v, owned) : false;
        if (it.gearNote?.replaced) replaced += 1;
        if (!can) {
          lacking += 1;
          ok(
            it.gearNote != null && it.gearNote.need.length > 0,
            `못 하는 도구면 알림 ${tag} ${it.title}`
          );
        }
        if (owned === null) ok(it.gearNote == null, `장비를 안 골랐으면 알림 없음 ${tag}`);
        const dose = doseOf(it.category, it.stage);
        ok(
          it.dose === `${dose.sets}세트 × ${dose.reps}회` &&
            it.sets === dose.sets &&
            it.tempo.length > 0 &&
            it.cue.length > 0,
          `처방 · 신호 ${tag}`
        );
        ok(
          it.swaps.length <= 4 &&
            it.swaps.every((w) => {
              const d = byTitle.get(w.title);
              return (
                d != null &&
                d.stage === it.stage &&
                d.focusPoints.includes(it.element) &&
                !items.some((x) => x.title === w.title) &&
                d.variants.some((x) => x.id === w.guideId && canUseVariant(x, owned))
              );
            }),
          `바꿀 동작 ${tag} ${it.title}`
        );
      }
      if (owned === null) {
        ok(
          items.map((x) => x.title).join() === (levelSession(lv.key, i)?.titles.join() ?? ''),
          `장비를 안 골랐으면 정해진 드릴 그대로 ${tag}`
        );
      }
    }
  }
}
console.log(`세션 ${built}개 — 장비 때문에 바꿔 넣은 칸 ${replaced} · 못 하는 도구로 남은 칸 ${lacking}`);
ok(buildLevelSession({ drills, level: 'intro', index: 12 }).length === 0, '다 마친 뒤에는 빈 세션');
/* 맨몸 · 야구공만 가진 사람도 모든 수준을 할 수 있어야 한다(바꿔 넣기 포함) */
{
  let total = 0;
  let can = 0;
  for (const lv of MECHANICS_LEVELS) {
    for (let i = 0; i < SESSIONS_PER_LEVEL; i++) {
      for (const it of buildLevelSession({ drills, level: lv.key, index: i, owned: FREE })) {
        total += 1;
        const v = variantOf(it.guideId);
        if (v && canUseVariant(v, FREE)) can += 1;
      }
    }
  }
  console.log(`맨몸 · 야구공만: 할 수 있는 칸 ${can}/${total}`);
  ok(can === total, '맨몸 · 야구공만 가져도 모든 칸을 할 수 있음', `${can}/${total}`);
}

/* ── 진행 읽기 · 쓰기 ── */
const old = readProgramState({ 드리프트: { stage: '연결', easy: 2 }, 드롭: { stage: '기초', easy: 1 } });
ok(old.level === null && old.index === 0, '옛 모양은 수준을 안 고른 것으로');
ok(readProgramState(null).level === null, 'null 이어도 읽음');
const round = readProgramState(programStateJson({ ...freshState('beginner'), index: 5 }));
ok(round.level === 'beginner' && round.index === 5, '쓰고 다시 읽기');
ok(
  readProgramState({ v: 2, level: 'beginner', index: 99, feels: {} }).index === SESSIONS_PER_LEVEL,
  '세션 수는 12에서 자름'
);
ok(readProgramState({ v: 2, level: 'master', index: 3 }).level === null, '모르는 수준은 안 고른 것');
ok(NAMES.every((n) => freshState('intro').feels[n].easy === 0), '새 수준은 느낌도 처음부터');

/* ── 느낌 세기 — 하루 한 번, 저절로 바꾸지 않음 ── */
const D = (k: number) => `2026-10-${String(1 + k).padStart(2, '0')}`;
{
  let f = freshState('intro').feels;
  f = countFeel(f, '드리프트', 'easy', D(0));
  f = countFeel(f, '드리프트', 'easy', D(0));
  f = countFeel(f, '드리프트', 'easy', D(0));
  ok(f['드리프트'].easy === 1, '같은 날 쉬움은 한 번만');
  f = countFeel(f, '드리프트', 'easy', D(1));
  f = countFeel(f, '드리프트', 'easy', D(2));
  f = countFeel(f, '드리프트', 'easy', D(3));
  ok(f['드리프트'].easy === EASY_DAYS, `쉬움은 ${EASY_DAYS}날까지만 셈`);
  f = countFeel(f, '드리프트', 'hard', D(4));
  ok(f['드리프트'].easy === 0 && f['드리프트'].hard === 1, '어려움이면 쉬움은 처음부터');
  f = countFeel(f, '드리프트', 'hard', D(4));
  ok(f['드리프트'].hard === 1, '같은 날 어려움도 한 번만');
  f = countFeel(f, '드리프트', 'hard', D(5));
  ok(f['드리프트'].hard === 2, '다른 날 어려움은 이어짐');
  f = countFeel(f, '드리프트', 'ok', D(6));
  ok(f['드리프트'].hard === 0, '적당이면 어려움 줄이 끊김');
  ok(
    NAMES.filter((n) => n !== '드리프트').every((n) => f[n].easy === 0),
    '다른 요소는 그대로'
  );
}

/* ── 권하기 ── */
const withFeels = (base: ProgramState, easyEls: number, hardEls: number): ProgramState => {
  let f = base.feels;
  NAMES.slice(0, easyEls).forEach((n) => {
    for (let k = 0; k < EASY_DAYS; k++) f = countFeel(f, n, 'easy', D(k));
  });
  NAMES.slice(6 - hardEls).forEach((n) => {
    for (let k = 0; k < HARD_DAYS; k++) f = countFeel(f, n, 'hard', D(10 + k));
  });
  return { ...base, feels: f };
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
ok(levelAdvice(freshState(null)) === null, '수준을 안 골랐으면 권하지 않음');
ok(levelAdvice(freshState('intro')) === null, '처음엔 권하지 않음');
ok(levelAdvice(withFeels(freshState('intro'), 3, 0)) === null, '쉬움 요소 셋은 아직');
ok(same(levelAdvice(withFeels(freshState('intro'), 4, 0)), { kind: 'up', to: 'beginner' }), '쉬움 요소 넷이면 다음 수준');
ok(levelAdvice(withFeels(freshState('advanced'), 6, 0)) === null, '고급은 더 올릴 곳이 없음');
ok(
  same(levelAdvice(withFeels(freshState('intermediate'), 0, 2)), { kind: 'down', to: 'beginner' }),
  '어려움 요소 둘이면 아래 수준'
);
ok(levelAdvice(withFeels(freshState('intro'), 0, 6)) === null, '입문은 더 낮출 곳이 없음');
ok(levelAdvice(withFeels(freshState('beginner'), 4, 2))?.kind === 'down', '쉬움 · 어려움이 다 있으면 낮추기가 먼저');
ok(same(levelAdvice({ ...freshState('beginner'), index: 12 }), { kind: 'done', to: 'intermediate' }), '12번을 다 마치면 다음 수준');
ok(same(levelAdvice({ ...freshState('advanced'), index: 12 }), { kind: 'done', to: null }), '고급을 다 마치면 한 번 더');

/* ── 장비 · 영상 ── */
ok(canUseVariant({ equipment: ['맨몸', '야구공'] }, new Set()), '맨몸 · 야구공은 누구나');
ok(!canUseVariant({ equipment: ['메디신볼'] }, new Set(['밴드'])), '없는 장비는 못 함');
ok(canUseVariant({ equipment: ['메디신볼'] }, null), '장비를 안 고르면 다 됨');
ok(canUseVariant({}, new Set()), '장비 칸이 없으면 맨몸');
ok(filmPrompt(0) === 'baseline', '첫 세션 전에는 처음 모습 찍기');
ok([1, 2, 3, 4, 5, 7, 11, 13].every((n) => filmPrompt(n) === null), '그 밖에는 말하지 않음');
ok(
  [FILM_EVERY, FILM_EVERY * 2, FILM_EVERY * 5].every((n) => filmPrompt(n) === 'compare'),
  `${FILM_EVERY}번째마다 견주기`
);

console.log(`\n${pass}개 통과, ${fail}개 실패`);
if (fail > 0) process.exit(1);
