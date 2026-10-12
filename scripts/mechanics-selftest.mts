/**
 * 투구 메커니즘 프로그램 규칙 자체 검사 — lib/mechanics/program.ts · levels.ts.
 *
 *   npm run mechanics:test
 *
 * 드릴은 공유 DB 에서 읽기만 한다(숨긴 것 빼고 — 화면과 같은 목록). 2026-10-04 바뀐 틀(수준을 골라 정해진 세션을 따라 한다)에
 * 맞춰 본다: 수준 넷의 세션이 모두 라이브러리에 있는 드릴인지 · 단계가 수준에 맞는지 · 투구 차례인지 · 두 주 묶음마다 여섯
 * 요소가 다 나오는지, 장비에 맞춰 바꿔 넣기, 느낌 세기(하루 한 번), 권하기, 옛 진행 읽기, 영상 찍기 알림.
 * 2판 P6-5(사용자 결정 D5): 어깨 · 팔꿈치가 아픈 날 팔에 싣는 드릴 접기 · 펼치기 · 반만 마치기 — 맨 끝 절(가짜 드릴 표로 고정하고,
 * 라이브러리 숫자는 출력만).
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
  MECHANICS_FOLD_BUTTONS,
  MECHANICS_FOLD_TEXT,
  buildLevelSession,
  canUseVariant,
  countFeel,
  doseOf,
  filmPrompt,
  finishState,
  foldSession,
  freshState,
  isArmLoaded,
  levelAdvice,
  mechanicsPainFold,
  playItemsFor,
  programStateJson,
  readProgramState,
  resumeAt,
  unloadedAlternatives,
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

/* ── 팔이 아픈 날 접기(2판 P6-5, 사용자 결정 D5) ── */
console.log('\n[2판 P6-5] 어깨 · 팔꿈치 통증 날 접기 · 펼치기 · 반만 마치기');
{
  const MOVE = '무브먼트 패턴 드릴';
  const THROW = '스로잉 드릴';
  const MED = '메디신볼 드릴';

  /* 분류 판정 — 모르는 분류는 접는 쪽 */
  ok(isArmLoaded(THROW) && isArmLoaded(MED), '스로잉 · 메디신볼은 팔에 싣는 드릴');
  ok(!isArmLoaded(MOVE), '무브먼트 패턴은 아님');
  ok(isArmLoaded('새 분류') && isArmLoaded(''), '모르는 분류 · 빈 분류는 접는 쪽');
  ok(
    drills
      .flatMap((d) => d.variants)
      .every((v) => [MOVE, THROW, MED].includes(v.category)),
    '라이브러리 드릴 분류는 셋 중 하나(새 분류가 생기면 다 접힌다 — 알아채려고)',
    [...new Set(drills.flatMap((d) => d.variants.map((v) => v.category)))].join(' · ')
  );

  /* 오늘 접는가 — 어깨 · 팔꿈치 '통증'만 */
  ok(
    mechanicsPainFold(null) === null && mechanicsPainFold(undefined) === null,
    '체크인 없음은 안 접음'
  );
  ok(mechanicsPainFold({ shoulder: '정상', elbow: '정상' }) === null, '정상은 안 접음');
  ok(mechanicsPainFold({ shoulder: '뻐근', elbow: '뻐근' }) === null, '뻐근은 안 접음');
  const otherPain = {
    shoulder: '정상',
    elbow: '정상',
    wrist: '통증',
    lowerBack: '통증',
    lowerBody: '통증',
  };
  ok(mechanicsPainFold(otherPain) === null, '손목 · 허리 · 하체 통증만이면 안 접음');
  const sh = mechanicsPainFold({ shoulder: '통증', elbow: '정상' });
  const el = mechanicsPainFold({ shoulder: '뻐근', elbow: '통증' });
  const both = mechanicsPainFold({ shoulder: '통증', elbow: '통증' });
  ok(
    same(sh?.joints, ['shoulder']) &&
      sh?.label === '어깨' &&
      same(el?.joints, ['elbow']) &&
      el?.label === '팔꿈치',
    '어깨 · 팔꿈치 하나씩'
  );
  ok(
    same(both?.joints, ['shoulder', 'elbow']) && both?.label === '어깨 · 팔꿈치',
    '둘 다면 어깨 → 팔꿈치 차례'
  );
  ok(
    sh?.reason ===
      '오늘 어깨가 아파 던지기 · 메디신볼 드릴은 접었어요. 그래도 하려면 펼쳐요.',
    '까닭 글(어깨)',
    sh?.reason
  );
  ok(
    el?.reason ===
      '오늘 팔꿈치가 아파 던지기 · 메디신볼 드릴은 접었어요. 그래도 하려면 펼쳐요.',
    '까닭 글(팔꿈치)',
    el?.reason
  );
  {
    let bad = 0;
    let folds = 0;
    for (const s of ['정상', '뻐근', '통증'])
      for (const e of ['정상', '뻐근', '통증']) {
        const f = mechanicsPainFold({ shoulder: s, elbow: e });
        if ((f != null) !== (s === '통증' || e === '통증')) bad++;
        if (f) folds++;
      }
    ok(
      bad === 0 && folds === 5,
      '어깨 × 팔꿈치 9가지 — 하나라도 통증인 5가지만 접음',
      `${folds}가지`
    );
  }

  /* 글 — 해요체 · 줄표 없음 · 짧게 */
  {
    const texts = Object.values(MECHANICS_FOLD_TEXT).flatMap((t) =>
      typeof t === 'function'
        ? [t('어깨', 2), t('어깨 · 팔꿈치', 1), t('팔꿈치', 3)]
        : [t]
    );
    const bad = texts.filter(
      (t) => t.includes('—') || t.includes('**') || t.length > 60 || !/요\.?$/.test(t)
    );
    ok(
      bad.length === 0,
      `글 ${texts.length}줄 — 해요체 · 줄표 없음 · 60자 안`,
      bad.join(' / ')
    );
    const buttons = Object.values(MECHANICS_FOLD_BUTTONS);
    ok(
      buttons.every((b) => b.length <= 12 && !b.includes('—')),
      `단추 ${buttons.length}개 — 짧게`,
      buttons.join(' · ')
    );
  }

  /* 가짜 세션 — 운영 DB 없이 고정한다. 차례: 무브먼트 → 스로잉 → 메디신볼 */
  type V = { id: string; category: string };
  type Item = {
    guideId: string;
    title: string;
    category: string;
    alternatives: { guideId: string; title: string; variants: V[] }[];
  };
  const alt = (title: string, guideId: string, variants: V[]) => ({
    title,
    guideId,
    variants,
  });
  const fake: Item[] = [
    {
      guideId: 'm1',
      title: '무브먼트 1',
      category: MOVE,
      alternatives: [
        alt('무브먼트 1', 'm1', [{ id: 'm1', category: MOVE }]),
        alt('스로잉 대안', 't9', [{ id: 't9', category: THROW }]),
        /* 한 묶음에 메디신볼 · 무브먼트 도구가 섞인 대안 — 처음 고를 도구가 메디신볼이면 무브먼트로 */
        alt('섞인 대안', 'x1', [
          { id: 'x1', category: MED },
          { id: 'x2', category: MOVE },
        ]),
      ],
    },
    {
      guideId: 't1',
      title: '스로잉 1',
      category: THROW,
      alternatives: [
        alt('스로잉 1', 't1', [
          { id: 't1', category: THROW },
          { id: 't1b', category: MED },
        ]),
      ],
    },
    {
      guideId: 'b1',
      title: '메디신볼 1',
      category: MED,
      alternatives: [alt('메디신볼 1', 'b1', [{ id: 'b1', category: MED }])],
    },
  ];
  const ids = (xs: { guideId: string }[]) => xs.map((x) => x.guideId).join();

  /* 통증 없는 날은 변화 0 */
  {
    const f = foldSession(fake, null);
    ok(
      ids(f.open) === 'm1,t1,b1' && f.folded.length === 0,
      '안 접는 날 — 다 할 것, 차례 그대로'
    );
    const p = playItemsFor(fake, null, false);
    ok(
      same(p.items, fake) && !p.partial && p.folded === 0,
      '안 접는 날 따라 하기 — 세션 그대로(바꾸기 목록까지)'
    );
  }
  /* 접는 날 */
  {
    const f = foldSession(fake, sh);
    ok(
      ids(f.open) === 'm1' && ids(f.folded) === 't1,b1',
      '접는 날 — 무브먼트만 할 것, 나머지는 접음(차례 그대로)'
    );
    const p = playItemsFor(fake, sh, false);
    ok(
      ids(p.items) === 'm1' && p.partial && p.folded === 2,
      '접는 날 따라 하기 — 무브먼트만 · 반만 마침'
    );
    const alts = p.items[0].alternatives;
    ok(
      alts
        .map((a) => `${a.title}:${a.guideId}:${a.variants.map((v) => v.id).join('+')}`)
        .join(' / ') === '무브먼트 1:m1:m1 / 섞인 대안:x2:x2',
      "접는 날 '다른 드릴' · 도구 칩에도 팔에 싣는 것이 없음(처음 도구가 빠지면 남은 무브먼트로)",
      alts.map((a) => a.title).join(' / ')
    );
    ok(
      fake[0].alternatives.length === 3 &&
        fake[0].alternatives[2].variants.length === 2,
      '입력은 그대로 둔다'
    );
    ok(
      same(
        unloadedAlternatives([alt('던지기뿐', 't', [{ id: 't', category: THROW }])]),
        []
      ),
      '도구가 다 빠진 동작은 뺀다'
    );
  }
  /* 펼치기(그래도 하기) — 막지 않는다 */
  {
    const p = playItemsFor(fake, both, true);
    ok(
      same(p.items, fake) && !p.partial && p.folded === 0,
      "펼친 날('그래도 하기') — 세션 그대로, 세션 수도 오른다"
    );
  }
  /* 다 접히는 세션 · 다 무브먼트인 세션 */
  {
    const allLoaded = fake.slice(1);
    ok(
      playItemsFor(allLoaded, el, false).items.length === 0,
      '다 접히는 세션 — 따라 하기에 넘길 것 없음(프로그램 칸으로)'
    );
    const allMove = [fake[0]];
    const p = playItemsFor(allMove, el, false);
    ok(
      ids(p.items) === 'm1' && !p.partial,
      '접을 드릴이 없는 세션 — 아픈 날이어도 다 하면 세션을 마친다'
    );
  }
  /* 이어서 하기 — 반만 마친 뒤 다시 열기 */
  {
    const folded = playItemsFor(fake, sh, false).items;
    ok(resumeAt(fake, new Set()) === 0, '아무것도 안 했으면 처음부터');
    ok(resumeAt(fake, new Set(['m1'])) === 1, '하나 했으면 다음부터');
    ok(
      resumeAt(folded, new Set(['m1'])) === 0,
      '무브먼트만 다 한 날 다시 열면 처음(카드는 이미 마쳤다고 알린다)'
    );
    ok(resumeAt(fake, new Set(['m1'])) === 1, '같은 날 펼쳐서 하면 접었던 첫 드릴부터');
    ok(
      resumeAt(fake, new Set(['m1', 't1', 'b1'])) === 0,
      '다 했으면 처음(오늘 마친 세션은 부르는 쪽이 done 을 비운다)'
    );
  }
  /* 마치기 — 반만 마치면 진행 그대로 */
  {
    const st: ProgramState = { ...freshState('beginner'), index: 4 };
    const half = finishState(st, true);
    ok(
      same(half, st),
      '반만 마치면 세션 · 느낌 · 견준 결과 그대로(같은 세션을 아프지 않은 날)'
    );
    ok(finishState(st, false).index === 5, '다 마치면 다음 세션');
    ok(finishState({ ...st, index: 12 }, false).index === 12, '12에서 멈춤');
    ok(same(finishState(st, false).feels, st.feels), '마쳐도 느낌은 그대로');
  }

  /* 라이브러리 세션 전부 — 접힌 결과의 모양(숫자는 출력만, 라이브러리가 바뀌면 달라진다) */
  {
    const toItem = (it: ReturnType<typeof buildLevelSession>[number]) => {
      const fam = (title: string, guideId: string) => {
        const d = byTitle.get(title);
        return d
          ? [
              {
                title,
                guideId,
                variants: d.variants.map((v) => ({ id: v.id, category: v.category })),
              },
            ]
          : [];
      };
      return {
        ...it,
        alternatives: [
          ...fam(it.title, it.guideId),
          ...it.swaps.flatMap((w) => fam(w.title, w.guideId)),
        ],
      };
    };
    let sessions = 0;
    let items = 0;
    let folded = 0;
    let allFolded = 0;
    let swapsDropped = 0;
    let badShape = 0;
    let changedWithoutPain = 0;
    for (const [, owned] of gearSets)
      for (const lv of MECHANICS_LEVELS)
        for (let i = 0; i < SESSIONS_PER_LEVEL; i++) {
          const session = buildLevelSession({
            drills,
            level: lv.key,
            index: i,
            owned,
          }).map(toItem);
          sessions++;
          items += session.length;
          const plain = playItemsFor(session, null, false);
          if (!same(plain.items, session) || plain.partial) changedWithoutPain++;
          const p = playItemsFor(session, sh, false);
          const f = foldSession(session, sh);
          folded += f.folded.length;
          if (p.items.length === 0) allFolded++;
          if (
            f.open.length + f.folded.length !== session.length ||
            f.open.some((x) => isArmLoaded(x.category)) ||
            f.folded.some((x) => !isArmLoaded(x.category)) ||
            p.partial !== f.folded.length > 0 ||
            p.items.some((x) =>
              x.alternatives.some(
                (a) =>
                  a.variants.some((v) => isArmLoaded(v.category)) ||
                  !a.variants.some((v) => v.id === a.guideId)
              )
            ) ||
            p.items.some((x) => x.alternatives[0]?.guideId !== x.guideId)
          )
            badShape++;
          swapsDropped +=
            session.reduce((n, x) => n + x.alternatives.length, 0) -
            p.items.reduce((n, x) => n + x.alternatives.length, 0) -
            f.folded.reduce((n, x) => n + x.alternatives.length, 0);
          const anyway = playItemsFor(session, sh, true);
          if (!same(anyway.items, session) || anyway.partial) badShape++;
        }
    console.log(
      `세션 ${sessions}개 · 드릴 ${items}개 — 어깨 통증 날 접힘 ${folded}개 · 다 접힌 세션 ${allFolded}개 · 남은 드릴의 바꾸기에서 뺀 동작 ${swapsDropped}개`
    );
    ok(
      badShape === 0,
      '라이브러리 세션 전부 — 남은 것은 무브먼트만 · 바꾸기 목록도 무브먼트만 · 첫 대안은 세션 드릴 · 펼치면 그대로',
      `${badShape}`
    );
    ok(
      changedWithoutPain === 0,
      '라이브러리 세션 전부 — 통증 없는 날은 따라 하기가 한 글자도 안 바뀜',
      `${changedWithoutPain}`
    );
    ok(
      folded > 0 && folded < items,
      '접히는 드릴이 있고, 다 접히지는 않음',
      `${folded}/${items}`
    );
  }
}

console.log(`\n${pass}개 통과, ${fail}개 실패`);
if (fail > 0) process.exit(1);
