/**
 * 근력 · 파워 프로그램 규칙 자체 검사 — lib/program/program.ts · lib/program/next-weight.ts.
 *
 *   npm run program:test
 *
 * DB 를 쓰지 않는다(개발 DB = 운영 DB 라 시험용 기록을 만들지 않는다). 숫자표 · 하루 만들기 · 시작 자격 ·
 * 운동 고정 · 오늘 판정 · 일차 넘기기 · 무게 추천과 그 문구를 본다. 설계: docs/designs/pitcher-strength-power-programs.md
 */
import { readFileSync } from 'node:fs';
import {
  PROGRAMS,
  asksReserve,
  audienceOf,
  basicsDoneEnough,
  checkEligibility,
  equipmentBlock,
  profileBlock,
  variantLabel,
  dayLabel,
  dayPlan,
  decideToday,
  finishLine,
  inSeasonKind,
  rotatedPick,
  variantTurn,
  isOptionalProgramExercise,
  withKind,
  SESSION_KIND_LABELS,
  isLightWeek,
  itemRx,
  lighterRx,
  parseProgram,
  pickCaution,
  pickPinned,
  prescriptionLine,
  programChoiceList,
  programSignalsOf,
  programKeyOf,
  readPinned,
  readSessionProgram,
  shouldAdvance,
  startProgramKey,
  topSetIndex,
  usedVariants,
  variantCandidates,
  warmupLine,
  weekOfDay,
  ARM_DEFER_REASON,
  ARM_THROW_VARIANTS,
  CAUTION_TEXT,
  REST_TEXT,
  SUBSTITUTE_REASON,
  painSlotsOf,
  restTextOf,
  type ItemRx,
  type PinnableExercise,
  type ProgramPlan,
  type InSeasonInput,
  type SessionKind,
  type TodaySignals,
  type VariantKey,
} from '../lib/program/program.ts';
import {
  historyEntry,
  pctWeights,
  reasonText,
  roundForDisplay,
  suggestWeight,
  tmFromSets,
  trainingMax,
  weighItem,
  weightKindOf,
  weightTag,
  type HistoryEntry,
  type WeightInput,
} from '../lib/program/next-weight.ts';
import {
  freezeProgramExercise,
  mergeReopened,
  programSwapEntry,
  readFrozenPlan,
  type FrozenExercise,
  type FrozenPlan,
} from '../lib/workout/session-plan.ts';
/* 2판 P4 커밋 F — 경기 다음 날을 부하로(투구 기록 → facts → 어제 팔 부담, 앱과 같은 길) */
import { parseThrowPlan } from '../lib/checkin.ts';
import { yesterdayArmLoadOf } from '../lib/engine/arm-load.ts';
import { lastOutingDateOf } from '../lib/engine/outing.ts';
import { buildFacts, type CheckinLike } from '../lib/report/facts.ts';
/* 2판 P6-7 — 올림 멈춤 글(영양 추세 깃발이 선 주에 무게 추천이 받는 글) */
import { FUEL_HOLD_TEXT } from '../lib/nutrition/fuel-check.ts';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`  OK   ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    failed++;
    console.log(`  실패 ${name}${detail ? ' — ' + detail : ''}`);
  }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/* ── 1) 프로그램 · 하루 만들기 ─────────────────────────────── */
console.log('\n1) 프로그램 · 하루 만들기');
const plan = (key: string) => parseProgram(key) as ProgramPlan;
const rxOf = (p: ProgramPlan, day: number, v: Parameters<typeof itemRx>[2]) =>
  itemRx(p, day, v) as ItemRx;
const LEGACY = plan('offseason-strength-power');
{
  /* 옛 프로그램 — 2026-10-07 바꾸기 전 함수로 찍어 둔 1~24일차와 같아야 한다 */
  /* 이름표(label)는 견주지 않는다 — 2026-10-14 'N주차 · M일차' → 'N번 세션'으로 글만 바뀌었다. 지키는 것은 처방이다 */
  const fixture = (
    JSON.parse(
      readFileSync(new URL('./fixtures/legacy-program.json', import.meta.url), 'utf-8')
    ) as Record<string, unknown>[]
  ).map((row) => {
    const rest = { ...row };
    delete rest.label;
    return rest;
  });
  const now = [];
  for (let d = 1; d <= LEGACY.totalDays; d++) {
    const p = dayPlan(LEGACY, d);
    now.push({
      day: d,
      week: weekOfDay(LEGACY, d),
      contrast: p.items.some((x) => x.group),
      items: p.items.map((x) => ({
        slot: x.slot,
        variant: x.variant,
        sets: x.sets.length,
        reps: x.reps,
        reserve: x.reserve,
        light: x.light,
        rest: x.restSeconds,
        line: prescriptionLine(x),
      })),
    });
  }
  const diff = now.findIndex((d, i) => !eq(d, fixture[i]));
  check(
    '옛 프로그램 1~24일차가 예전과 같음',
    LEGACY.totalDays === 24 && fixture.length === 24 && diff === -1,
    diff === -1 ? '' : `${diff + 1}일차`
  );
  check(
    '한쪽 운동은 좌우 각각',
    prescriptionLine(rxOf(LEGACY, 5, 'singleLeg'), { perSide: true }) ===
      '3세트 × 8회 (좌우 각각) · 2개 남기고'
  );
}
const plans = PROGRAMS.flatMap((def) =>
  def.perWeek.map((pw) => plan(programKeyOf(def.id, pw)))
);
const allDays = (p: ProgramPlan) =>
  Array.from({ length: p.totalDays }, (_, d) => dayPlan(p, d + 1));
check(
  '프로그램 9개(성인 8 + 기본기 1) · 모두 4주 · 옛 프로그램은 목록에 없음',
  PROGRAMS.length === 9 &&
    PROGRAMS.filter((p) => audienceOf(p) === 'adult').length === 8 &&
    PROGRAMS.filter((p) => audienceOf(p) === 'basics').length === 1 &&
    PROGRAMS.every((p) => p.weeks === 4) &&
    !PROGRAMS.some((p) => p.id === 'offseason-strength-power')
);
check(
  '주 3번 12회 · 주 2번 8회',
  plans.every((p) => p.totalDays === p.perWeek * 4) && plans.length === 14
);
check(
  '스트롱리프트는 주 3번만 · 텍사스 메소드는 지움(2026-10-14)',
  parseProgram('stronglifts-5x5:2') === null &&
    parseProgram('texas-method') === null &&
    parseProgram('531:2') != null
);
check(
  '모르는 키 = null',
  parseProgram('nope') === null &&
    parseProgram('531:4') === null &&
    parseProgram('531:2:x') === null &&
    parseProgram('offseason-strength-power:2') === null
);
{
  let dup = '';
  let twoCores = '';
  let empty = '';
  let badPct = '';
  let badReserve = '';
  for (const p of plans) {
    allDays(p).forEach((dp, i) => {
      const where = `${p.key} ${i + 1}일차`;
      const vs = dp.items.map((x) => x.variant);
      if (new Set(vs).size !== vs.length) dup ||= where;
      if (vs.includes('antiRotation') && vs.includes('rotationalThrow')) twoCores ||= where;
      if (dp.items.length === 0 || dp.items.some((x) => x.sets.length === 0)) empty ||= where;
      for (const x of dp.items) {
        if (x.mode === 'pct' && !x.sets.every((st) => (st.pct ?? 0) > 0.3 && (st.pct ?? 0) < 1.1))
          badPct ||= where;
        if (x.mode === 'reserve' && !x.sets.every((st) => st.reserve != null))
          badReserve ||= where;
      }
    });
  }
  check('한 날에 같은 변형 두 번 없음', !dup, dup);
  check('한 날에 몸통 둘 없음', !twoCores, twoCores);
  check('빈 날 · 빈 처방 없음', !empty, empty);
  check('% 처방은 30~110% 사이', !badPct, badPct);
  check("'몇 개 남기고' 처방은 모두 여유가 있음", !badReserve, badReserve);
}
const p531 = plan('531');
const p531x2 = plan('531:2');
const bbb = plan('531-bbb');
const jug = plan('juggernaut-5s');
const sl = plan('stronglifts-5x5');
const ws = plan('ws4sb');
const fc = plan('french-contrast');
check(
  '5/3/1 1주 = 65 · 75 · 85%+',
  eq(
    rxOf(p531, 1, 'squat').sets.map((x) => [x.reps, x.pct, !!x.plus]),
    [
      [5, 0.65, false],
      [5, 0.75, false],
      [5, 0.85, true],
    ]
  )
);
check(
  '5/3/1 3주 = 5 · 3 · 1+, 본 세트 1회',
  eq(
    rxOf(p531, 7, 'squat').sets.map((x) => x.reps),
    [5, 3, 1]
  ) && rxOf(p531, 7, 'squat').reps === 1
);
check('5/3/1 4주만 가벼운 주', isLightWeek(p531, 4) && !isLightWeek(p531, 3));
check(
  '5/3/1 주 3번 = 스쿼트 · 밀기 · 힌지',
  eq(
    [1, 2, 3].map((d) => dayPlan(p531, d).items.find((x) => x.mode === 'pct')?.variant),
    ['squat', 'push', 'hinge']
  )
);
check(
  '5/3/1 주 2번 = 1일 스쿼트 · 밀기, 2일 힌지(밀기는 주 1번)',
  eq(
    dayPlan(p531x2, 1).items.filter((x) => x.mode === 'pct').map((x) => x.variant),
    ['squat', 'push']
  ) &&
    eq(
      dayPlan(p531x2, 2).items.filter((x) => x.mode === 'pct').map((x) => x.variant),
      ['hinge']
    )
);
check(
  '주 2번 — 4주차(가벼운 주)는 7 · 8일차',
  weekOfDay(p531x2, 7) === 4 &&
    isLightWeek(p531x2, weekOfDay(p531x2, 8)) &&
    dayLabel(p531x2, 3) === '3번 세션'
);
check(
  '5/3/1 은 들기 전에 워밍업 점프(2세트 × 3회), 밀기 날은 메디신볼',
  dayPlan(p531, 1).items[0].variant === 'jump' &&
    dayPlan(p531, 1).items[0].sets.length === 2 &&
    dayPlan(p531, 2).items[0].variant === 'medball'
);
check(
  '저거넛은 점프 · 메디신볼 · 회전 던지기 없음',
  allDays(jug).every((dp) => !dp.items.some((x) => ['jump', 'medball', 'rotationalThrow'].includes(x.variant)))
);
check(
  'BBB = 5/3/1 + 같은 운동 10회 5세트(4주는 없음)',
  rxOf(bbb, 1, 'squat').sets.length === 8 &&
    rxOf(bbb, 1, 'squat')
      .sets.slice(3)
      .every((x) => x.reps === 10 && x.pct === 0.5) &&
    rxOf(bbb, 10, 'squat').sets.length === 3
);
check(
  'BBB 본 세트 = + 세트(85%)',
  rxOf(bbb, 1, 'squat').reps === 5 && topSetIndex(rxOf(bbb, 1, 'squat').sets) === 2
);
check(
  '저거넛 3주 = 85% 5회+',
  (() => {
    const x = rxOf(jug, 7, 'squat').sets;
    return x[x.length - 1].pct === 0.85 && x[x.length - 1].plus === true;
  })()
);
check(
  '스트롱리프트 A · B(B 날 오버헤드 프레스는 뺌)',
  eq(
    dayPlan(sl, 1).items.map((x) => x.variant),
    ['squat', 'push', 'pull', 'antiRotation']
  ) &&
    eq(
      dayPlan(sl, 2).items.map((x) => x.variant),
      ['squat', 'hinge', 'antiRotation']
    ) &&
    rxOf(sl, 2, 'hinge').sets.length === 1 &&
    rxOf(sl, 1, 'squat').mode === 'linear'
);
check('스트롱리프트 가벼운 주 없음', !isLightWeek(sl, 4));
check(
  'WS4SB 최고까지 올리기 — 매주 스쿼트 · 힌지 바꿈',
  eq(
    [1, 2, 3, 4].map((w) => dayPlan(ws, (w - 1) * 3 + 1).items.find((x) => x.top)?.variant),
    ['squat', 'hinge', 'squat', 'hinge']
  )
);
check(
  'WS4SB 주 3번만 상체 반복 날',
  dayPlan(ws, 3).label === '상체 반복 날' && dayPlan(plan('ws4sb:2'), 3).label === '무거운 날'
);
{
  const items = dayPlan(fc, 1).items;
  check(
    '프렌치 컨트라스트 = 무겁게 → 점프 → 메디신볼 묶음, 무겁게 뒤 20초',
    eq(
      items.slice(0, 3).map((x) => [x.variant, x.group]),
      [
        ['squat', false],
        ['jump', true],
        ['medball', true],
      ]
    ) && items[0].restSeconds === 20
  );
  check(
    '묶음은 프렌치 컨트라스트에만',
    plans
      .filter((p) => p.def.id !== 'french-contrast')
      .every((p) => allDays(p).every((dp) => dp.items.every((x) => !x.group)))
  );
}
{
  /* 2026-10-14 김민 — 파워가 든 프로그램은 매주 회전 던지기 */
  const weekly = (key: string, v: string) => {
    const p = plan(key);
    const out: number[] = [];
    for (let w = 1; w <= p.totalWeeks; w++) {
      let n = 0;
      for (let d = (w - 1) * p.perWeek + 1; d <= w * p.perWeek; d++)
        n += dayPlan(p, d).items.filter((x) => x.variant === v).reduce((m, x) => m + x.sets.length, 0);
      out.push(n);
    }
    return out;
  };
  const rotKeys = ['531', '531:2', '531-bbb', '531-bbb:2', 'ws4sb', 'ws4sb:2', 'french-contrast', 'french-contrast:2'];
  const noRot = rotKeys.filter((k) => weekly(k, 'rotationalThrow').some((n) => n === 0));
  check('파워가 든 프로그램은 매주 회전 던지기', noRot.length === 0, noRot.join(','));
}
check(
  '세션 이름에 날 이름 — 주차 · 일차 대신 N번 세션(2026-10-14)',
  dayLabel(plan('stronglifts-5x5'), 2) === '2번 세션 · B 날' &&
    dayLabel(plan('stronglifts-5x5'), 12).startsWith('12번 세션'),
  dayLabel(plan('stronglifts-5x5'), 2)
);
check(
  '% 처방 한 줄',
  prescriptionLine(rxOf(p531, 1, 'squat')) ===
    '5회 65% → 5회 75% → 5회+ 85% · +는 2개 남기고',
  prescriptionLine(rxOf(p531, 1, 'squat'))
);
check(
  '% 처방 한 줄(무게를 알면 kg)',
  prescriptionLine(rxOf(jug, 1, 'squat'), { kgs: [70, 70, 70, 70, 70] }) ===
    '4세트 × 5회 70kg → 5회+ 70kg · +는 2개 남기고',
  prescriptionLine(rxOf(jug, 1, 'squat'), { kgs: [70, 70, 70, 70, 70] })
);
check(
  '최고까지 올리기 한 줄',
  prescriptionLine(dayPlan(ws, 1).items[1]) === '준비 세트로 올려 5회 1세트 · 1개 남기고'
);
check(
  '스트롱리프트 한 줄',
  prescriptionLine(rxOf(sl, 1, 'squat')) === '5세트 × 5회 · 다 채우면 다음에 올려요'
);
check('가볍게 = 세트 −1', lighterRx(rxOf(p531, 1, 'squat')).sets.length === 2);
check(
  '세트를 줄여도 본 세트 횟수가 남은 세트와 맞음',
  (() => {
    const l = lighterRx(rxOf(p531, 7, 'squat'));
    return l.reps === 3 && l.reps === l.sets[topSetIndex(l.sets)].reps;
  })()
);
check(
  '시작 키 — 옛 프로그램 · 없는 주당 횟수는 못 고름',
  startProgramKey('offseason-strength-power', 3) === null &&
    startProgramKey('stronglifts-5x5', 2) === null &&
    startProgramKey('nope', 3) === null &&
    startProgramKey('531', 7) === null &&
    startProgramKey('531', 2) === '531:2' &&
    startProgramKey('531', 3) === '531'
);
check(
  "'몇 개 더?' — 옛 판(mode 없음)은 묻고, % · 스트롱리프트 · 가벼운 주 · 무게 없는 칸은 안 물음",
  asksReserve({ slot: 'bigLower', light: false }, 4) &&
    !asksReserve({ slot: 'bigLower', light: false, mode: 'pct' }, 3) &&
    !asksReserve({ slot: 'bigLower', light: false, mode: 'linear' }, 5) &&
    !asksReserve({ slot: 'bigLower', light: true }, 2) &&
    !asksReserve({ slot: 'power', light: false }, 3) &&
    !asksReserve(null, 3)
);
check(
  '쓰는 변형만',
  eq(usedVariants(sl.def), ['squat', 'hinge', 'push', 'pull', 'antiRotation'])
);
{
  const list = programChoiceList();
  check(
    '고르기 목록 9개, 주마다 4줄',
    list.length === 9 && list.every((c) => c.weeks.length === 4)
  );
  check(
    '스트롱리프트는 % 안 씀, 5/3/1 은 씀',
    list.find((c) => c.id === 'stronglifts-5x5')?.usesPct === false &&
      list.find((c) => c.id === '531')?.usesPct === true
  );
}

/* ── 1-0) 5/3/1 계열 보조(2026-10-14) ─────────────────────────────── */
{
  const has = (p: ProgramPlan, d: number, v: VariantKey) => dayPlan(p, d).items.some((x) => x.variant === v);
  for (const key of ['531', '531-bbb', 'juggernaut-5s', '531:2', '531-bbb:2']) {
    const p = plan(key);
    const days = Array.from({ length: p.totalDays }, (_, i) => i + 1);
    check(
      `${key}: 매 세션 당기기 · 한 다리, 벤치 없는 날만 보조 밀기, 힌지 날은 로우, 세로 당기기 섞임`,
      days.every((d) => (has(p, d, 'pull') || has(p, d, 'pullVertical')) && has(p, d, 'singleLeg')) &&
        days.every((d) => has(p, d, 'pushAssist') === !has(p, d, 'push')) &&
        days.every((d) => !has(p, d, 'hinge') || has(p, d, 'pull')) &&
        days.some((d) => has(p, d, 'pullVertical')) &&
        days.some((d) => has(p, d, 'pull'))
    );
  }
}

/* ── 1-0b) 보조 칸 세션마다 돌리기(2026-10-14) ─────────────────────────────── */
{
  const p = plan('531');
  const turns = Array.from({ length: p.totalDays }, (_, i) => variantTurn(p, i + 1, 'singleLeg'));
  const pool = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({ id }));
  const picks = turns.map((t) => rotatedPick({ id: 'x' }, pool, t)?.id);
  check(
    '보조 칸: 나올 때마다 다음 운동 — 고정 운동이 첫째, 앞 6개를 돌고, 이어진 두 세션이 같지 않음',
    turns.join() === Array.from({ length: p.totalDays }, (_, i) => i).join() &&
      picks[0] === 'x' &&
      picks.slice(0, 6).join() === 'x,a,b,c,d,e' &&
      picks.every((id, i) => i === 0 || id !== picks[i - 1]) &&
      rotatedPick(null, [], 3) === null &&
      rotatedPick({ id: 'x' }, [], 5)?.id === 'x'
  );
}

/* ── 1-1) 기본기 4주(2026-10-09) ─────────────────────────────── */
console.log('\n1-1) 기본기 4주');
{
  const b = plan('basics-4w');
  check('기본기 키 · 주 3번 12회', b != null && b.totalDays === 12 && parseProgram('basics-4w:2') === null);
  const days = allDays(b);
  check('날마다 일곱', days.every((d) => d.items.length === 7), String(days.map((d) => d.items.length)));
  check('무게 없음(모두 none) · 몇 개 더 안 물음', days.every((d) => d.items.every((x) => x.mode === 'none' && !asksReserve({ slot: x.slot, light: x.light, mode: x.mode }, x.sets.length))));
  const sq = (day: number) => rxOf(b, day, 'squat');
  check(
    '1주 2×8 → 2주 3×8 → 3주 3×10 → 4주 2×8(가볍게)',
    sq(1).sets.length === 2 && sq(1).reps === 8 &&
      sq(4).sets.length === 3 && sq(4).reps === 8 &&
      sq(7).sets.length === 3 && sq(7).reps === 10 &&
      sq(10).sets.length === 2 && sq(10).reps === 8 && sq(10).light,
    [1, 4, 7, 10].map((d) => `${sq(d).sets.length}×${sq(d).reps}`).join(' ')
  );
  check('던지기 · 점프가 맨 앞', days.every((d) => d.items[0].variant === 'medball'));
  check(
    '쓰는 변형 일곱',
    eq(usedVariants(b.def), ['squat', 'hinge', 'push', 'pull', 'singleLeg', 'medball', 'antiRotation'])
  );
  check('처방 한 줄', prescriptionLine(sq(1)) === '2세트 × 8회' && prescriptionLine(rxOf(b, 1, 'medball')) === '2세트 × 5회 · 최대 속도 · 충분히 쉬고', prescriptionLine(rxOf(b, 1, 'medball')));
  check('칸 이름 — 기본기 첫 칸은 던지기 · 점프', variantLabel('medball', 'basics') === '던지기 · 점프' && variantLabel('medball') === '메디신볼');
  const c = programChoiceList().find((x) => x.id === 'basics-4w');
  check('고르기: 기본기 · 꼭 있을 장비 없음 · % 안 씀', c?.audience === 'basics' && c.required.length === 0 && c.usesPct === false && c.weeks[0].startsWith('1주 · 스쿼트'), c?.weeks[0] ?? '');
  /* 하루 약 35분 — 세트마다 30초 하고 쉬는 시간, 운동 바꿀 때 30초 */
  const minutes = (d: (typeof days)[number]) =>
    d.items.reduce((m, x) => m + x.sets.length * (30 + x.restSeconds) / 60 + 0.5, 0);
  const longest = Math.max(...days.map(minutes));
  check('가장 긴 날도 40분 안', longest <= 40, `${Math.round(longest)}분`);
}

/* ── 1-2) 시즌 중 · 선발 · 불펜(2026-10-14) ─────────────────────────────── */
console.log('\n1-2) 시즌 중');
{
  const st = plan('inseason-starter:2');
  const rp = plan('inseason-reliever');
  check('시즌 중 키 · 선발 주 2번 8회 · 불펜 주 3번 12회', st?.totalDays === 8 && rp?.totalDays === 12);
  const base: InSeasonInput = { daysSinceGame: null, pitchesYesterday: 0, pitchesTwoDaysAgo: 0, daysSinceLift: 1, day: 1 };
  const s = (d: number | null) => inSeasonKind('starter', { ...base, daysSinceGame: d });
  check(
    '선발: 등판 다음 날 하체 · 이틀 뒤 움직임만 · 사흘 뒤 상체 · 나흘 뒤 짧은 하체 · 모르면 전신',
    s(1) === 'lower' && s(2) === null && s(3) === 'upper' && s(4) === 'shortLower' && s(null) === 'full' && s(6) === 'full'
  );
  const r = (o: Partial<typeof base>) => inSeasonKind('reliever', { ...base, ...o });
  check(
    '불펜: 어제 20구 넘게면 하체 · 그다음 날 움직임만 · 사흘 넘게 쉬면 전신 · 나머지는 짧은 하체 ↔ 상체',
    r({ pitchesYesterday: 25 }) === 'lower' &&
      r({ pitchesYesterday: 20 }) !== 'lower' &&
      r({ pitchesTwoDaysAgo: 25 }) === null &&
      r({ daysSinceLift: 3 }) === 'full' &&
      r({ daysSinceLift: null }) === 'full' &&
      r({ day: 1 }) === 'shortLower' &&
      r({ day: 2 }) === 'shortUpper' &&
      r({ pitchesYesterday: 10, daysSinceLift: 5, day: 2 }) === 'shortUpper'
  );
  const kinds = Object.keys(SESSION_KIND_LABELS) as SessionKind[];
  const days = (p: ProgramPlan | null) =>
    p ? kinds.flatMap((k) => [1, 2, 3, 4].map((w) => dayPlan(withKind(p, k), (w - 1) * p.perWeek + 1))) : [];
  const all = [...days(st), ...days(rp)];
  check(
    '시즌 중 모든 날: 몸통 하나 이하 · 같은 변형 두 번 없음 · 4~6가지 · 매 세트 3개 남기고',
    all.length === 40 &&
      all.every((d) => {
        const vs = d.items.map((x) => x.variant);
        return (
          d.items.filter((x) => x.slot === 'core').length <= 1 &&
          new Set(vs).size === vs.length &&
          vs.length >= 4 &&
          vs.length <= 6 &&
          d.items.every((x) => x.slot === 'power' || x.slot === 'core' || x.reserve === 3)
        );
      })
  );
  check(
    '세션 종류 이름이 날 이름에',
    st != null && dayLabel(withKind(st, 'upper'), 3) === '3번 세션 · 상체 날'
  );
  check('시즌 중 아닌 프로그램엔 종류를 안 얹음', withKind(plan('531')!, 'upper').kind === undefined);
  const tag = readSessionProgram({ key: 'inseason-reliever', day: 2, week: 1, kind: 'shortUpper' });
  check(
    '운동 판 꼬리표가 세션 종류를 지킴 · 모르는 값은 버림',
    tag?.kind === 'shortUpper' && readSessionProgram({ key: 'x', day: 1, week: 1, kind: 'leg' })?.kind === undefined
  );
}

/* ── 2) 시작 자격 ─────────────────────────────── */
console.log('\n2) 시작 자격');
const full = ['바벨', '덤벨', '메디신볼', '박스', '벤치'];
const base = {
  age: 24,
  trainingLevel: '중급',
  ownedEquipment: full,
};
check('다 맞으면 시작', checkEligibility(base).ok);
{
  const r = checkEligibility({ ...base, age: null });
  check('생년월일 없음 → 물음', !r.ok && r.kind === 'ask' && r.step === 'birth');
  const r17 = checkEligibility({ ...base, age: 17 });
  check('만 17세 → 막힘', !r17.ok && r17.kind === 'blocked');
  const rLv = checkEligibility({ ...base, trainingLevel: null });
  check('경력 없음 → 물음', !rLv.ok && rLv.kind === 'ask' && rLv.step === 'level');
  const rIn = checkEligibility({ ...base, trainingLevel: '입문' });
  check('입문 → 막힘', !rIn.ok && rIn.kind === 'blocked');
  const rE = checkEligibility({ ...base, ownedEquipment: [] });
  check(
    '장비 안 고름 → 물음(모두로 보지 않음)',
    !rE.ok && rE.kind === 'ask' && rE.step === 'equipment'
  );
  const rM = checkEligibility({ ...base, ownedEquipment: ['바벨', '덤벨'] });
  check('메디신볼 없음 → 시작(2026-10-14 필수 장비에서 뺌)', rM.ok);
  const rD = checkEligibility({ ...base, ownedEquipment: ['바벨'] });
  check(
    '덤벨 없음 → 막힘, 조사',
    !rD.ok && rD.kind === 'blocked' && rD.reason.startsWith('덤벨이'),
    !rD.ok && rD.kind === 'blocked' ? rD.reason : ''
  );
  check(
    '선택 운동 = 메디신볼로 던지는 칸만(맨몸 점프 · 돌리는 코어로 채운 칸 · 다른 칸은 아님)',
    isOptionalProgramExercise({ programSlot: { variant: 'medball' }, equipment: ['메디신볼'] }) &&
      isOptionalProgramExercise({ programSlot: { variant: 'rotationalThrow' }, equipment: ['메디신볼'] }) &&
      !isOptionalProgramExercise({ programSlot: { variant: 'medball' }, equipment: ['맨몸'] }) &&
      !isOptionalProgramExercise({ programSlot: { variant: 'rotationalThrow' }, equipment: ['맨몸'] }) &&
      !isOptionalProgramExercise({ programSlot: { variant: 'jump' }, equipment: ['메디신볼'] }) &&
      !isOptionalProgramExercise({ programSlot: null, equipment: ['메디신볼'] })
  );
}

{
  /* 기본기 · 성인 입문(2026-10-09) */
  const kid = { ...base, audience: 'basics' as const, age: 15, trainingLevel: '입문', ownedEquipment: ['맨몸'] };
  check('기본기: 만 15세 입문 · 맨몸만 → 시작', checkEligibility(kid).ok);
  const r12 = checkEligibility({ ...kid, age: 12 });
  check('기본기: 만 12세 → 막힘', !r12.ok && r12.kind === 'blocked' && r12.reason.includes('13세'));
  check('기본기: 만 13세 → 시작', checkEligibility({ ...kid, age: 13 }).ok);
  check('기본기: 성인 중급도 → 시작', checkEligibility({ ...base, audience: 'basics' }).ok);
  const rBe = checkEligibility({ ...kid, ownedEquipment: [] });
  check('기본기: 장비 안 고름 → 물음', !rBe.ok && rBe.kind === 'ask' && rBe.step === 'equipment');
  const r16 = checkEligibility({ ...base, age: 16 });
  check('성인: 만 16세 → 막힘, 할 일은 기본기', !r16.ok && r16.kind === 'blocked' && r16.action.includes('기본기'));
  const r10 = checkEligibility({ ...base, age: 10 });
  check('성인: 만 10세 → 막힘, 할 일은 직접 고르기', !r10.ok && r10.kind === 'blocked' && r10.action.includes('직접 고르기'));
  const rNov = checkEligibility({ ...base, trainingLevel: '입문' });
  check('성인 입문 · 기본기 안 마침 → 막힘, 할 일은 기본기', !rNov.ok && rNov.kind === 'blocked' && rNov.action.includes('기본기'));
  check('성인 입문 · 기본기 마침 → 시작', checkEligibility({ ...base, trainingLevel: '입문', basicsDone: true }).ok);
  check('만 17세는 기본기를 마쳐도 성인은 막힘', !checkEligibility({ ...base, age: 17, basicsDone: true }).ok);
  check('고르기 화면 막힘 = 시작 자격 막힘', eq(profileBlock({ age: 16, trainingLevel: '초급' }), { reason: r16.ok ? '' : (r16 as { reason: string }).reason, action: r16.ok ? '' : (r16 as { action: string }).action }));
  check('나이 모르면 고르기 화면은 막지 않음', profileBlock({ age: null, trainingLevel: '초급' }) === null && profileBlock({ audience: 'basics', age: null, trainingLevel: '입문' }) === null);
  const bplan = plan('basics-4w');
  check('기본기 마침: 다 건너뛰면 안 셈 · 6번 하면 셈', !basicsDoneEnough(bplan, 13, 12) && !basicsDoneEnough(bplan, 13, 7) && basicsDoneEnough(bplan, 13, 6) && basicsDoneEnough(bplan, 13, 0));
  check('장비 막힘: 성인은 바벨 · 덤벨, 기본기는 없음', equipmentBlock(['맨몸'])?.reason.startsWith('바벨, 덤벨이') === true && equipmentBlock(['맨몸'], []) === null);
}

/* ── 3) 운동 고정 ─────────────────────────────── */
console.log('\n3) 운동 고정');
const ex = (
  id: string,
  title: string,
  category: string,
  movementPattern: string | null,
  equipment: string[],
  intensity = '높음',
  difficulty: string | null = '중급',
  perSide = false
): PinnableExercise => ({
  id,
  title,
  category,
  movementPattern,
  equipment,
  intensity,
  difficulty,
  perSide,
});
const lib: PinnableExercise[] = [
  ex('gob', '고블렛 스쿼트', '하체 스트렝스', '스쿼트', ['덤벨'], '중간', '초급'),
  ex('dfs', '덤벨 프론트 스쿼트', '하체 스트렝스', '스쿼트', ['덤벨']),
  ex('bsq', '바벨 백 스쿼트', '하체 스트렝스', '스쿼트', ['바벨']),
  ex(
    'fsq',
    '바벨 프론트 스쿼트',
    '하체 스트렝스',
    '스쿼트',
    ['바벨'],
    '매우 높음',
    '상급'
  ),
  ex(
    'csq',
    '고블렛 커시 스쿼트',
    '하체 스트렝스',
    '스쿼트',
    ['덤벨'],
    '높음',
    '중급',
    true
  ),
  ex('rdl', '바벨 RDL', '하체 스트렝스', '힌지', ['바벨']),
  ex('bp', '벤치 프레스', '상체 스트렝스', '밀기', ['바벨', '벤치']),
  ex('dbp', '덤벨 벤치 프레스', '상체 스트렝스', '밀기', ['덤벨', '벤치'], '높음', '초급'),
  ex(
    'row',
    '싱글암 덤벨 로우',
    '상체 스트렝스',
    '당기기',
    ['덤벨', '벤치'],
    '중간',
    '초급',
    true
  ),
  ex('brow', '바벨 로우', '상체 스트렝스', '당기기', ['바벨']),
  ex('pull', '풀업', '상체 스트렝스', '당기기', ['철봉']),
  ex('rl', '덤벨 리버스 런지', '하체 스트렝스', '런지', ['덤벨'], '중간', '초급', true),
  ex('bj', '박스 점프', '파워', '스쿼트', ['박스']),
  ex('broad', '브로드 점프', '파워', '스쿼트', ['맨몸']),
  ex('slam', '오버헤드 메디신볼 슬램', '파워', '회전', ['메디신볼'], '높음', '초급'),
  ex('chest', '톨닐링 메디신볼 체스트 패스', '파워', '밀기', ['메디신볼'], '중간'),
  ex('pal', '하프닐링 밴드 팔로프 프레스', '코어', null, ['밴드'], '낮음', '초급', true),
  ex('twist', '메디신볼 러시안 트위스트', '코어', null, ['메디신볼'], '낮음', '초급'),
  ex('carry', '싱글암 파머스 캐리', '코어', null, ['덤벨'], '중간', '초급', true),
  ex('bug', '데드버그', '코어', null, ['맨몸'], '낮음', '초급'),
];
{
  const sq = variantCandidates('squat', lib, full, '중급').map((e) => e.id);
  check(
    '스쿼트: 바벨 먼저, 한쪽 · 중간 강도 빠짐',
    sq[0] === 'bsq' && !sq.includes('csq') && !sq.includes('gob'),
    sq.join(',')
  );
  const sqBeginner = variantCandidates('squat', lib, full, '초급').map((e) => e.id);
  check('초급이면 상급 운동 빠짐', !sqBeginner.includes('fsq'), sqBeginner.join(','));
  const sqNoBar = variantCandidates('squat', lib, ['덤벨', '메디신볼'], '중급').map(
    (e) => e.id
  );
  check(
    '바벨이 없으면 바벨 운동 안 고름',
    sqNoBar.length > 0 && sqNoBar.every((id) => id !== 'bsq' && id !== 'fsq'),
    sqNoBar.join(',')
  );
  const pull = variantCandidates('pull', lib, full, '중급').map((e) => e.id);
  check(
    '당기기(로우): 철봉 없으면 풀업 빠짐, 바벨 로우는 맨 뒤(2026-10-14 허리 부담)',
    !pull.includes('pull') && pull.length > 1 && pull[0] !== 'brow' && pull.at(-1) === 'brow',
    pull.join(',')
  );
  check(
    '세로 당기기 = 풀업 · 친업, 철봉 없으면 없음',
    variantCandidates('pullVertical', lib, ['맨몸', '철봉'], '중급')[0]?.id === 'pull' &&
      variantCandidates('pullVertical', lib, ['바벨', '덤벨'], '중급').length === 0
  );
  const push = variantCandidates('push', lib, full, '중급').map((e) => e.id);
  const pushNoBar = variantCandidates('push', lib, ['덤벨', '메디신볼', '벤치'], '중급').map((e) => e.id);
  check(
    '밀기: 바벨 벤치 프레스 먼저(2026-10-14), 바벨이 없으면 덤벨 벤치 프레스',
    push[0] === 'bp' && pushNoBar[0] === 'dbp',
    `${push.join(',')} / ${pushNoBar.join(',')}`
  );
  const pins = pickPinned(lib, full, '중급');
  check(
    '9개 중 라이브러리로 채울 수 있는 것은 다 채움',
    [
      'squat',
      'hinge',
      'push',
      'pull',
      'singleLeg',
      'jump',
      'medball',
      'antiRotation',
      'rotationalThrow',
    ].every((v) => typeof pins[v as keyof typeof pins] === 'string'),
    JSON.stringify(pins)
  );
  check(
    '메디신볼 파워는 회전 아닌 것 먼저, 회전 던지기는 위아래 슬램이 아니라 돌리는 운동(2026-10-14 — 이름도 본다)',
    pins.medball === 'chest' && pins.rotationalThrow !== 'slam' && pins.rotationalThrow != null,
    String(pins.rotationalThrow)
  );
  check(
    '밴드가 없으면 항회전은 한쪽 캐리로',
    pins.antiRotation === 'carry',
    String(pins.antiRotation)
  );
  check(
    '밴드가 있으면 팔로프 먼저',
    pickPinned(lib, [...full, '밴드'], '중급').antiRotation === 'pal'
  );
  const kept = pickPinned(lib, full, '중급', { squat: 'dfs' });
  check('바꾼 것은 지킴', kept.squat === 'dfs');
  check(
    '저장된 pinned 읽기 — 모르는 키 버림',
    eq(readPinned({ squat: 'a', foo: 'b', hinge: 3 }), { squat: 'a' })
  );
}

{
  /* 기본기 고르기 — 바벨 없이, 가벼운 것부터(2026-10-09 라이브러리에서 이름을 따 옴) */
  const bx = (id: string, title: string, category: string, pattern: string | null, equipment: string[], intensity = '중간', difficulty: string | null = '초급', perSide = false) =>
    ex(id, title, category, pattern, equipment, intensity, difficulty, perSide);
  const blib: PinnableExercise[] = [
    bx('bsq', '바벨 스쿼트', '하체 스트렝스', '스쿼트', ['바벨'], '높음', '중급'),
    bx('tbs', '템포 맨몸 스쿼트', '하체 스트렝스', '스쿼트', ['맨몸'], '낮음'),
    bx('gob', '고블렛 스쿼트', '하체 스트렝스', '스쿼트', ['덤벨']),
    bx('egs', '에센트릭 포즈 고블렛 스쿼트', '하체 스트렝스', '스쿼트', ['덤벨'], '높음', '중급'),
    bx('fsq', '바벨 프론트 스쿼트', '하체 스트렝스', '스쿼트', ['바벨'], '매우 높음', '상급'),
    bx('gbr', '양발 글루트 브리지', '하체 스트렝스', '힌지', ['맨몸'], '낮음'),
    bx('drdl', '덤벨 RDL', '하체 스트렝스', '힌지', ['덤벨'], '중간', '중급'),
    bx('pu', '푸시업', '상체 스트렝스', '밀기', ['맨몸']),
    bx('pk', '파이크 푸시업', '상체 스트렝스', '밀기', ['맨몸'], '중간', '중급'),
    bx('bp', '벤치프레스', '상체 스트렝스', '밀기', ['바벨', '벤치'], '높음', '중급'),
    bx('trx', 'TRX 로우', '상체 스트렝스', '당기기', ['TRX']),
    bx('hbr', '하프닐링 밴드 로우', '상체 스트렝스', '당기기', ['밴드'], '낮음', '초급', true),
    bx('wpu', '중량 친업', '상체 스트렝스', '당기기', ['철봉'], '매우 높음', '상급'),
    bx('ll', '레터럴 런지', '하체 스트렝스', '런지', ['맨몸'], '낮음', '초급', true),
    bx('drl', '덤벨 리버스 런지', '하체 스트렝스', '런지', ['덤벨'], '중간', '초급', true),
    bx('bosu', '보수볼 포워드 런지', '하체 스트렝스', '런지', ['맨몸'], '중간', '중급', true),
    bx('mbt', '톨닐링 메디신볼 오버헤드 스로우', '파워', '당기기', ['메디신볼']),
    bx('pogo', '로우 포고 홉', '파워', '스쿼트', ['맨몸']),
    bx('bj', '브로드 점프', '파워', '스쿼트', ['맨몸'], '높음', '중급'),
    bx('dd', '뎁스 점프 투 박스', '파워', '스쿼트', ['박스'], '매우 높음', '상급'),
    bx('dbug', '데드버그', '코어', null, ['맨몸'], '낮음'),
    bx('pal', '스탠딩 밴드 팔로프 프레스', '코어', null, ['밴드'], '낮음', '초급', true),
  ];
  const first = (v: Parameters<typeof variantCandidates>[0], owned: string[], level: string | null = '중급') =>
    variantCandidates(v, blib, owned, level, 'basics')[0]?.id ?? null;
  const all = ['맨몸', '밴드', '덤벨', '메디신볼', '바벨', '벤치', 'TRX', '철봉', '박스'];
  check('기본기: 바벨 · 매우 높음 · 상급은 후보에 없음', !variantCandidates('squat', blib, all, '상급', 'basics').some((e) => ['bsq', 'fsq'].includes(e.id)) && !variantCandidates('pull', blib, all, '상급', 'basics').some((e) => e.id === 'wpu') && !variantCandidates('medball', blib, all, '상급', 'basics').some((e) => e.id === 'dd'));
  check('기본기 스쿼트: 덤벨 있으면 고블렛, 맨몸만이면 템포 맨몸', first('squat', all) === 'gob' && first('squat', ['맨몸']) === 'tbs');
  check('기본기 힌지: 입문(초급만)은 글루트 브리지, 중급은 덤벨 RDL', first('hinge', all, '입문') === 'gbr' && first('hinge', all) === 'drdl');
  check('기본기 밀기: 푸시업을 파이크보다 먼저', first('push', all) === 'pu');
  check('기본기 당기기: TRX 로우 먼저, 밴드만이면 밴드 로우, 맨몸만이면 없음', first('pull', all) === 'trx' && first('pull', ['맨몸', '밴드']) === 'hbr' && first('pull', ['맨몸']) === null);
  check('기본기 한 다리: 리버스 런지 먼저, 맨몸만이면 레터럴 런지(보수볼은 뒤로)', first('singleLeg', all) === 'drl' && first('singleLeg', ['맨몸']) === 'll');
  check('기본기 첫 칸: 메디신볼 던지기, 없으면 포고 홉', first('medball', all) === 'mbt' && first('medball', ['맨몸']) === 'pogo');
  check('기본기 몸통: 맨몸이면 데드버그', first('antiRotation', ['맨몸']) === 'dbug' && first('antiRotation', ['맨몸', '밴드']) === 'pal');
  check('성인 규칙은 그대로(바벨 스쿼트 먼저)', variantCandidates('squat', blib, all, '중급')[0]?.id === 'bsq');
  const pinsB = pickPinned(blib, ['맨몸'], '입문', {}, 'basics');
  check('기본기: 맨몸 입문도 일곱 중 여섯이 참(당기기만 빔)', ['squat', 'hinge', 'push', 'singleLeg', 'medball', 'antiRotation'].every((v) => pinsB[v as keyof typeof pinsB]) && !pinsB.pull, JSON.stringify(pinsB));
}

/* ── 4) 오늘 판정 ─────────────────────────────── */
console.log('\n4) 오늘 판정');
const sig = (o: Partial<TodaySignals> = {}): TodaySignals => ({
  nextDay: 5,
  today: '2026-10-10',
  lastProgramDate: '2026-10-08',
  checkedIn: true,
  otherWorkoutStarted: false,
  halted: false,
  gameToday: false,
  gameTomorrow: false,
  gameYesterday: false,
  bullpenToday: false,
  hardThrowRecent: false,
  override: false,
  recovery: null,
  loadCaution: false,
  soreMany: false,
  sleepShort: false,
  uncertain: false,
  painSlots: [],
  ...o,
});
check(
  '보통 날 = 진행, 주의 없음',
  (() => {
    const d = decideToday(LEGACY, sig());
    return d.kind === 'go' && d.caution === null && Object.keys(d.adjust).length === 0;
  })()
);
check('25일차 = 다 끝남', decideToday(LEGACY, sig({ nextDay: 25 })).kind === 'done');
check(
  '주 2번 8회 — 8일차는 진행, 9일차 = 다 끝남',
  decideToday(p531x2, sig({ nextDay: 8 })).kind === 'go' &&
    decideToday(p531x2, sig({ nextDay: 9 })).kind === 'done'
);
check(
  '통증 멈춤 = 기다림(넘기기 없음)',
  decideToday(LEGACY, sig({ halted: true, override: true })).kind === 'painWait'
);
check('체크인 전', decideToday(LEGACY, sig({ checkedIn: false })).kind === 'needCheckin');
check(
  '다른 방식으로 이미 시작',
  decideToday(LEGACY, sig({ otherWorkoutStarted: true })).kind === 'otherMode'
);
check(
  '어제 프로그램 날 = 간격',
  decideToday(LEGACY, sig({ lastProgramDate: '2026-10-09' })).kind === 'spacing'
);
{
  const d = decideToday(LEGACY, sig({ gameYesterday: true }));
  check(
    '경기 다음 날 = 쉼, 넘길 수 있음',
    d.kind === 'rest' && d.reason === 'gameYesterday' && d.canOverride
  );
  const o = decideToday(LEGACY, sig({ gameToday: true, override: true }));
  check(
    '경기 날 넘기면 진행 + 주의 1순위',
    o.kind === 'go' && o.caution === 'gameOverride'
  );
  const lowPain = decideToday(
    LEGACY,
    sig({ recovery: 'lowCondition', painSlots: ['bigLower'] })
  );
  check(
    '통증 대체가 가볍게를 지우지 않음',
    lowPain.kind === 'go' &&
      lowPain.adjust.bigLower?.kind === 'substitute' &&
      lowPain.adjust.bigLower.lighter === true
  );
  const low = decideToday(LEGACY, sig({ recovery: 'lowCondition' }));
  check(
    '회복 데이(컨디션) = 큰 하체 · 파워 가볍게',
    low.kind === 'go' &&
      low.adjust.bigLower?.kind === 'lighter' &&
      low.adjust.power?.kind === 'lighter' &&
      low.caution === 'recovery'
  );
  const load = decideToday(LEGACY, sig({ recovery: 'loadRisk' }));
  check(
    '회복 데이(부하 위험) = 진행 + 주의만',
    load.kind === 'go' &&
      Object.keys(load.adjust).length === 0 &&
      load.caution === 'recovery'
  );
  const lc = decideToday(LEGACY, sig({ loadCaution: true }));
  check('부하 주의 = 파워 뺌', lc.kind === 'go' && lc.adjust.power?.kind === 'drop');
  const sore = decideToday(LEGACY, sig({ soreMany: true }));
  check(
    '근육통 많이 = 큰 하체만 가볍게',
    sore.kind === 'go' && sore.adjust.bigLower?.kind === 'lighter' && !sore.adjust.power
  );
  const bp5 = decideToday(
    LEGACY,
    sig({ nextDay: 14, bullpenToday: true, lastProgramDate: '2026-10-07' })
  );
  check(
    '5주 불펜 날 = 회전 던지기 뺌',
    bp5.kind === 'go' && bp5.adjust.core?.kind === 'drop'
  );
  const bp2 = decideToday(LEGACY, sig({ bullpenToday: true }));
  check('2주 불펜 날 = 항회전은 그대로', bp2.kind === 'go' && !bp2.adjust.core);
  const pain = decideToday(LEGACY, sig({ painSlots: ['singleLeg'], loadCaution: true }));
  check(
    '부위 통증 칸 = 대체, 뺀 칸은 그대로 뺌',
    pain.kind === 'go' &&
      pain.adjust.singleLeg?.kind === 'substitute' &&
      pain.adjust.power?.kind === 'drop'
  );
  const gap = decideToday(LEGACY, sig({ lastProgramDate: '2026-09-30' }));
  check(
    '10일 쉼 = 주의 오래 쉼, gapDays',
    gap.kind === 'go' && gap.caution === 'restGap' && gap.gapDays === 10
  );
  const lw = decideToday(LEGACY, sig({ nextDay: 10 }));
  check('4주 = 가벼운 주 주의', lw.kind === 'go' && lw.caution === 'lightWeek');
}
check(
  '주의 우선순위: 회복 > 센 불펜 > 모름 > 가볍게',
  pickCaution(
    sig({ recovery: 'soreSevere', hardThrowRecent: true, uncertain: true }),
    false,
    2
  ) === 'recovery' &&
    pickCaution(
      sig({ hardThrowRecent: true, uncertain: true, soreMany: true }),
      false,
      2
    ) === 'hardThrow' &&
    pickCaution(sig({ uncertain: true, soreMany: true }), false, 2) === 'uncertain' &&
    pickCaution(sig({ sleepShort: true }), true, 20) === 'lighter'
);

/*
 * 4-1) 경기 다음 날은 부하로(트레이닝 추천 2판 D3 · P4 커밋 F, 2026-10-12) — gameYesterday 는 어제 '경기' 기록이 아니라 어제 팔 부담
 * (lib/engine/arm-load.ts yesterdayArmLoadOf)이다. 앱(lib/program/load.ts)과 같은 길: 투구 기록 → facts → 어제 팔 부담 → programSignalsOf.
 */
console.log('\n4-1) 경기 다음 날은 부하로(D3)');
{
  const ASOF = new Date('2026-10-10T09:00:00+09:00');
  const ago = (n: number) => new Date(ASOF.getTime() - n * 86_400_000).toISOString();
  const checkinOn = (n: number, throwPlan: string | null): CheckinLike => ({
    date: ago(n).slice(0, 10),
    condition: 8,
    sleep: '보통',
    shoulder: '정상',
    elbow: '정상',
    wrist: '정상',
    lowerBack: '정상',
    lowerBody: '정상',
    preferredParts: [],
    preferredWorkout: null,
    throwPlan,
  });
  const factsOf = (
    logs: { daysAgo: number; pitches: number; pct: number; sessionType: string }[],
    yesterdayPlan: string | null = null
  ) =>
    buildFacts({
      nickname: '프로그램',
      age: 22,
      heightCm: 180,
      baselineDailyLoad: 100,
      today: ASOF,
      logs: logs.map((l) => ({
        date: ago(l.daysAgo),
        pitchCount: l.pitches,
        intensity: Math.round(l.pct / 10),
        effortPct: l.pct,
        sessionType: l.sessionType,
        maxVelocity: null,
        avgVelocity: null,
      })),
      checkins: [checkinOn(0, null), checkinOn(1, yesterdayPlan)],
      memos: [],
    });
  /* 오늘 판정 — 던지는 신호만 facts 에서, 나머지는 보통 날(sig) */
  const dayOf = (facts: ReturnType<typeof factsOf>) =>
    decideToday(
      LEGACY,
      sig({
        ...programSignalsOf({
          outing: {
            answerToday: parseThrowPlan(facts.condition.throwPlanToday),
            answerYesterday: parseThrowPlan(facts.condition.throwPlanYesterday),
          },
          typesToday: [],
          yesterdayArmLoad: yesterdayArmLoadOf(facts),
        }),
      })
    );
  /* 마지막 등판 날(2026-10-14) — 경기 기록 · 체크인 '오늘 등판' · 달력 등판 일정을 합침, 0구 줄만 있는 날은 뺌 */
  {
    const lastOf = (
      logs: { daysAgo: number; pitches: number; sessionType: string }[],
      plans: [number, string][],
      events: [number, string][] | null
    ) =>
      lastOutingDateOf(
        buildFacts({
          nickname: '프로그램',
          age: 22,
          heightCm: 180,
          baselineDailyLoad: 100,
          today: ASOF,
          logs: logs.map((l) => ({
            date: ago(l.daysAgo),
            pitchCount: l.pitches,
            intensity: 9,
            effortPct: 90,
            sessionType: l.sessionType,
            maxVelocity: null,
            avgVelocity: null,
          })),
          checkins: plans.map(([n, p]) => checkinOn(n, p)),
          memos: [],
          ...(events ? { calendarEvents: events.map(([n, title]) => ({ date: ago(n).slice(0, 10), title })) } : {}),
        })
      );
    const game4 = [{ daysAgo: 4, pitches: 80, sessionType: '경기' }];
    check(
      '마지막 등판 날: 경기 기록 · 체크인 답 · 달력 중 가장 늦은 날, 0구 줄만 남긴 날 · 오늘은 안 셈, 달력을 안 넘긴 옛 입력은 칸 없음',
      lastOf(game4, [], []) === ago(4).slice(0, 10) &&
        lastOf(game4, [[2, '오늘 등판']], []) === ago(2).slice(0, 10) &&
        lastOf([], [], [[3, '리그 경기']]) === ago(3).slice(0, 10) &&
        lastOf([{ daysAgo: 2, pitches: 0, sessionType: '휴식' }], [[2, '오늘 등판']], []) === null &&
        lastOf([], [[0, '오늘 등판']], []) === null &&
        lastOf(game4, [[2, '오늘 등판']], null) === null
    );
  }
  /* 어제 기록 한 줄 */
  const y1 = (pitches: number, pct: number, sessionType: string) => [
    { daysAgo: 1, pitches, pct, sessionType },
  ];
  const light = dayOf(factsOf(y1(15, 100, '경기')));
  check(
    '어제 경기 15구 → 진행(예전 경기 다음 날 쉼 — 15 × 100% = 1,500 은 팔 부담이 작다)',
    light.kind === 'go',
    light.kind
  );
  const zero = dayOf(factsOf(y1(0, 100, '경기')));
  check("어제 '경기' 0구 줄 → 진행(부하 0)", zero.kind === 'go', zero.kind);
  const game = dayOf(factsOf(y1(85, 100, '경기')));
  check(
    "어제 경기 85구 → 쉼 · 까닭 '어제 팔 부담이 컸어요'(넘길 수 있음)",
    game.kind === 'rest' &&
      game.reason === 'gameYesterday' &&
      REST_TEXT[game.reason] === '어제 팔 부담이 컸어요',
    game.kind
  );
  const pen = dayOf(factsOf(y1(40, 90, '불펜')));
  check(
    '어제 불펜 40구 90% → 쉼(경기가 아니어도 세게 던진 날 — 예전에는 진행)',
    pen.kind === 'rest' && pen.reason === 'gameYesterday',
    pen.kind
  );
  const claimed = dayOf(factsOf([], '오늘 등판'));
  check(
    "어제 '오늘 등판' 답 · 기록 없음 → 쉼(부하를 모르니 조이는 쪽)",
    claimed.kind === 'rest' && claimed.reason === 'gameYesterday',
    claimed.kind
  );
  const claimedLight = dayOf(factsOf(y1(15, 100, '경기'), '오늘 등판'));
  check(
    "어제 '오늘 등판' 답 + 어제 경기 15구 → 진행(기록이 이김 — 예전에는 답만으로 쉼)",
    claimedLight.kind === 'go',
    claimedLight.kind
  );
  /*
   * 2판 P4 검토 — 쉬는 까닭 글은 어제 팔 부담의 까닭대로(restTextOf). 셋을 한 글('어제 팔 부담이 컸어요')로 쓰면 기록 없는 등판에도 '컸어요'라고
   * 단정했다. 앱(load.ts)은 같은 facts 의 yesterdayArmLoadOf 를 넘긴다.
   */
  const textOf = (facts: ReturnType<typeof factsOf>) =>
    restTextOf('gameYesterday', yesterdayArmLoadOf(facts)?.kind ?? null);
  check(
    "P4 검토 — 쉬는 까닭 글: 어제 경기 85구 '어제 많이 던졌어요' · 기록 없는 등판 '어제 등판한 다음 날이에요' · 까닭 모름은 예전 글",
    textOf(factsOf(y1(85, 100, '경기'))) === '어제 많이 던졌어요' &&
      textOf(factsOf([], '오늘 등판')) === '어제 등판한 다음 날이에요' &&
      restTextOf('gameYesterday') === REST_TEXT.gameYesterday &&
      restTextOf('gameToday', 'hard') === REST_TEXT.gameToday
  );
}

/*
 * 4-2) 대체 칸의 까닭(2판 P4 검토) — 팔 피로 '심함'(안전 거르기 5-2)만으로 고정 운동이 빠진 칸은 '팔 피로', 그 밖은 '통증 부위'.
 * 예전에는 팔 피로만 '심함'인 날에도 '대체 · 통증 부위'가 보였다. 칸 · 까닭은 painSlotsOf 하나가 정한다(앱 load.ts · 자체 시험이 같이 부름).
 */
console.log('\n4-2) 대체 칸의 까닭');
{
  const items = [
    { slot: 'pushPull' as const, variant: 'push' as const },
    { slot: 'pushPull' as const, variant: 'pull' as const },
    { slot: 'power' as const, variant: 'medball' as const },
  ];
  const pinned: Record<string, string> = {
    push: 'bench',
    pull: 'row',
    medball: 'ball',
  };
  const of = (safe: string[], armOnly: string[]) =>
    painSlotsOf(
      items,
      (v) => (pinned[v] ? { id: pinned[v] } : null),
      new Set(safe),
      new Set(armOnly)
    );
  const arm = of(['row'], ['bench', 'ball']);
  check(
    "4-2 팔 피로만으로 빠진 벤치 · 메디신볼 → 두 칸 다 '팔 피로'",
    JSON.stringify(arm.painSlots) === JSON.stringify(['pushPull', 'power']) &&
      arm.slotReasons.pushPull === SUBSTITUTE_REASON.armFatigue &&
      arm.slotReasons.power === SUBSTITUTE_REASON.armFatigue
  );
  const mixed = of([], ['bench', 'ball']);
  check(
    "4-2 한 칸에 팔 피로(벤치) · 통증(로우)이 섞이면 '통증 부위'가 이긴다 — 더 조심할 까닭",
    mixed.slotReasons.pushPull === SUBSTITUTE_REASON.pain &&
      mixed.slotReasons.power === SUBSTITUTE_REASON.armFatigue
  );
  const none = of(['bench', 'row', 'ball'], []);
  check('4-2 모두 안전하면 대체 칸 없음', none.painSlots.length === 0);
  const d = decideToday(
    LEGACY,
    sig({ painSlots: arm.painSlots, slotReasons: arm.slotReasons })
  );
  const old = decideToday(LEGACY, sig({ painSlots: ['pushPull'] }));
  check(
    "4-2 decideToday — 대체 까닭은 slotReasons 대로('팔 피로'), slotReasons 없는 옛 신호는 '통증 부위'",
    d.kind === 'go' &&
      d.adjust.pushPull?.kind === 'substitute' &&
      d.adjust.pushPull.reason === '팔 피로' &&
      old.kind === 'go' &&
      old.adjust.pushPull?.kind === 'substitute' &&
      old.adjust.pushPull.reason === '통증 부위'
  );
}

/*
 * 4-3) 중재 신호(트레이닝 추천 2판 P6-2, 2026-10-13) — 프로그램 카드가 중재(lib/engine/arbiter.ts)와 같은 하루를 말하게 판정이 받는 선택 칸
 * 다섯: armSpent · armThrows(팔로 던지는 변형을 그날 뺀다, 넘겨도) · heavyLowerYesterday(큰 하체를 가볍게, 넘기면 그대로) · hardToday ·
 * choseRecovery(쉬는 날, 넘길 수 있음). 신호를 만드는 규칙(programArbiterSignals)은 training:test 가 보고, 여기는 판정만 본다.
 */
console.log('\n4-3) 중재 신호(2판 P6-2)');
{
  /* 목록의 프로그램 + 옛 '비시즌 근력 → 파워'(숨김 — 진행 중인 줄만 이어 간다). 회전 던지기 칸은 지금 옛 프로그램에만 있다 */
  const keys = [
    ...PROGRAMS.flatMap((d) => d.perWeek.map((pw) => programKeyOf(d.id, pw))),
    'offseason-strength-power',
  ];
  const plans = keys.map((k) => [k, plan(k)] as const);
  const variantsOf = (p: ProgramPlan, d: number) =>
    dayPlan(p, d).items.map((x) => x.variant);
  const firstDay = (want: (vs: VariantKey[]) => boolean) => {
    for (const [k, p] of plans)
      for (let d = 1; d <= p.totalDays; d++)
        if (want(variantsOf(p, d))) return { k, p, d };
    return null;
  };

  /* (가) 신호를 안 주거나 다 거짓 · 빈 값이 아닌 기본값으로 주면 옛 판정과 글자까지 같다 */
  const oldSigs: Partial<TodaySignals>[] = [
    {},
    { gameToday: true },
    { gameToday: true, override: true },
    { gameYesterday: true, override: true },
    { bullpenToday: true },
    { hardThrowRecent: true },
    { recovery: 'lowCondition', soreMany: true },
    { loadCaution: true, painSlots: ['bigLower', 'power'] },
    { uncertain: true, sleepShort: true },
    { lastProgramDate: '2026-09-28' },
    { lastProgramDate: '2026-10-09' },
  ];
  const off: Partial<TodaySignals> = {
    armSpent: false,
    armThrows: [...ARM_THROW_VARIANTS],
    heavyLowerYesterday: false,
    hardToday: false,
    choseRecovery: false,
  };
  let n = 0;
  const same: string[] = [];
  for (const [k, p] of plans)
    for (let d = 1; d <= p.totalDays; d++)
      for (const o of oldSigs) {
        n++;
        const a = decideToday(p, sig({ nextDay: d, ...o }));
        const b = decideToday(p, sig({ nextDay: d, ...o, ...off }));
        if (!eq(a, b) || (a.kind === 'go' && 'deferVariants' in a))
          same.push(`${k} ${d}일차`);
      }
  check(
    `4-3 (가) 새 신호를 안 주면 · 다 거짓으로 주면 옛 판정과 글자까지 같다(뺄 변형 칸도 안 생김) — ${keys.length}개 프로그램 모든 일차 × 옛 신호 ${oldSigs.length}가지 = ${n}가지`,
    same.length === 0 && n > 1000,
    same.slice(0, 3).join(' · ')
  );

  /* (나) 팔을 다 쓴 날 — 변형 단위로 뺀다(점프는 남는다), 칸으로는 안 뺀다, 뺀 날만 주의 '팔 아낌' */
  const bad: string[] = [];
  let armDays = 0;
  let both = 0;
  let rot = 0;
  for (const [k, p] of plans)
    for (let d = 1; d <= p.totalDays; d++) {
      const vs = variantsOf(p, d);
      const want = ARM_THROW_VARIANTS.filter((v) => vs.includes(v));
      const g = decideToday(p, sig({ nextDay: d, armSpent: true }));
      const got = g.kind === 'go' ? (g.deferVariants ?? []) : null;
      if (
        g.kind !== 'go' ||
        !eq([...(got ?? [])].sort(), [...want].sort()) ||
        (got ?? []).includes('jump') ||
        Object.keys(g.adjust).length > 0 ||
        want.length > 0 !== (g.caution === 'armRest') ||
        (want.length === 0) !== !('deferVariants' in g)
      )
        bad.push(`${k} ${d}일차`);
      if (want.length > 0) armDays++;
      if (vs.includes('medball') && vs.includes('jump')) both++;
      if (vs.includes('rotationalThrow')) rot++;
    }
  check(
    `4-3 (나) 팔을 다 쓴 날 — 모든 일차에서 메디신볼 · 회전 던지기만 그날 빼고(deferVariants) 같은 파워 칸의 점프는 남는다, 칸 조정(adjust)은 없다, 뺀 날만 주의 '팔 아낌'(팔 던지기 든 날 ${armDays} · 메디신볼과 점프가 같이 든 날 ${both} · 회전 던지기 든 날 ${rot})`,
    bad.length === 0 && armDays > 0 && rot > 0,
    bad.slice(0, 3).join(' · ')
  );

  /* (다) 고정 운동으로 가른 팔 던지기(armThrows) — 기본기의 메디신볼 칸에 맨몸 점프를 고정했으면 던지지 않으니 안 뺀다 */
  const med = firstDay(
    (vs) => vs.includes('medball') && !vs.includes('rotationalThrow')
  );
  if (med) {
    const narrow = decideToday(
      med.p,
      sig({ nextDay: med.d, armSpent: true, armThrows: ['rotationalThrow'] })
    );
    const none = decideToday(
      med.p,
      sig({ nextDay: med.d, armSpent: true, armThrows: [] })
    );
    const wide = decideToday(med.p, sig({ nextDay: med.d, armSpent: true }));
    check(
      `4-3 (다) armThrows 를 주면 그것만 — ${med.k} ${med.d}일차(메디신볼 · 회전 던지기 없음): 회전 던지기만 던지는 고정이면 안 빼고 주의도 없음, 빈 목록도 같음, 안 주면 메디신볼을 짐작해 뺀다`,
      narrow.kind === 'go' &&
        !('deferVariants' in narrow) &&
        narrow.caution !== 'armRest' &&
        eq(narrow, none) &&
        wide.kind === 'go' &&
        eq(wide.deferVariants, ['medball']) &&
        wide.caution === 'armRest'
    );
  } else check('4-3 (다) 메디신볼 든 날이 있다', false);

  /* (라) 넘겨도 팔은 아낀다 — 쉬는 날은 쉬는 날 그대로, '그래도 오늘 할래요'면 하는 날인데 던지기는 빼고 주의는 '팔 아낌'이 앞선다 */
  const noArm = firstDay((vs) => !vs.some((v) => ARM_THROW_VARIANTS.includes(v)));
  if (med && noArm) {
    const rest = decideToday(
      med.p,
      sig({ nextDay: med.d, gameToday: true, armSpent: true })
    );
    const over = decideToday(
      med.p,
      sig({ nextDay: med.d, gameToday: true, override: true, armSpent: true })
    );
    const overNoArm = decideToday(
      noArm.p,
      sig({ nextDay: noArm.d, gameToday: true, override: true, armSpent: true })
    );
    check(
      `4-3 (라) 오늘 등판 + 팔 다 씀 → 쉬는 날(그대로) · 넘기면 하는 날에 메디신볼만 빼고 주의 '팔 아낌'(넘김 글보다 앞), 팔 던지기 없는 날(${noArm.k} ${noArm.d}일차)을 넘기면 넘김 글`,
      rest.kind === 'rest' &&
        rest.reason === 'gameToday' &&
        over.kind === 'go' &&
        eq(over.deferVariants, ['medball']) &&
        over.caution === 'armRest' &&
        overNoArm.kind === 'go' &&
        !('deferVariants' in overNoArm) &&
        overNoArm.caution === 'gameOverride'
    );
  } else check('4-3 (라) 팔 던지기 없는 날이 있다', false);
  const rotDay = firstDay((vs) => vs.includes('rotationalThrow'));
  if (rotDay) {
    const bp = decideToday(
      rotDay.p,
      sig({ nextDay: rotDay.d, bullpenToday: true, armSpent: true })
    );
    check(
      `4-3 (라) 불펜 + 팔 다 씀(${rotDay.k} ${rotDay.d}일차) — 불펜 규칙의 몸통 칸 빼기는 그대로, 회전 던지기는 뺄 변형에도 든다(읽는 쪽은 칸 빼기를 먼저 본다)`,
      bp.kind === 'go' &&
        bp.adjust.core?.kind === 'drop' &&
        (bp.deferVariants ?? []).includes('rotationalThrow')
    );
  } else check('4-3 (라) 회전 던지기 든 날이 있다', false);

  /* (마) 어제 하체 날 — 큰 하체는 빼지 않고 가볍게(주의 '어제 하체'), 넘기면 그대로, 큰 하체 없는 날은 아무것도 안 바뀐다 */
  const big = firstDay((vs) => vs.includes('squat') || vs.includes('hinge'));
  const noBig = firstDay((vs) => !vs.includes('squat') && !vs.includes('hinge'));
  if (big && noBig) {
    const at = (o: Partial<TodaySignals>, x = big) =>
      decideToday(x.p, sig({ nextDay: x.d, heavyLowerYesterday: true, ...o }));
    const h = at({});
    const ho = at({ override: true });
    const hn = at({}, noBig);
    const hs = at({ soreMany: true });
    const hu = at({ uncertain: true });
    const hp = at({ painSlots: ['bigLower'] });
    const plain = decideToday(noBig.p, sig({ nextDay: noBig.d }));
    check(
      `4-3 (마) 어제 하체 날 — ${big.k} ${big.d}일차: 큰 하체 가볍게 + 주의 '어제 하체' · 넘기면 그대로 · 큰 하체 없는 날(${noBig.k} ${noBig.d}일차)은 옛 판정 그대로 · 근육통보다 앞, 모름보다 뒤 · 통증 대체도 가볍게`,
      h.kind === 'go' &&
        h.adjust.bigLower?.kind === 'lighter' &&
        h.caution === 'lowerBudget' &&
        ho.kind === 'go' &&
        !ho.adjust.bigLower &&
        ho.caution !== 'lowerBudget' &&
        eq(hn, plain) &&
        hs.kind === 'go' &&
        hs.caution === 'lowerBudget' &&
        hu.kind === 'go' &&
        hu.caution === 'uncertain' &&
        hu.adjust.bigLower?.kind === 'lighter' &&
        hp.kind === 'go' &&
        hp.adjust.bigLower?.kind === 'substitute' &&
        hp.adjust.bigLower.lighter === true
    );
  } else check('4-3 (마) 큰 하체 있는 날 · 없는 날이 있다', false);

  /* (바) 쉬는 날 둘 — 오늘 세게 던진 날 · 오늘 '회복'을 고름. 넘길 수 있고, 경기 앞뒤 까닭이 먼저, 간격 · 체크인 규칙은 그보다 먼저 */
  const hard = decideToday(LEGACY, sig({ hardToday: true, hardThrowRecent: true }));
  const hardOver = decideToday(
    LEGACY,
    sig({ hardToday: true, hardThrowRecent: true, override: true })
  );
  const rec = decideToday(LEGACY, sig({ choseRecovery: true }));
  const recOver = decideToday(LEGACY, sig({ choseRecovery: true, override: true }));
  check(
    "4-3 (바) 오늘 세게 던진 날 · '회복' 고름 → 쉬는 날(넘길 수 있음), 넘기면 하는 날 + 넘김 글(세게 던진 주의보다 앞)",
    hard.kind === 'rest' &&
      hard.reason === 'hardToday' &&
      hard.canOverride &&
      hardOver.kind === 'go' &&
      hardOver.caution === 'gameOverride' &&
      rec.kind === 'rest' &&
      rec.reason === 'chooseRecovery' &&
      recOver.kind === 'go' &&
      recOver.caution === 'gameOverride'
  );
  const kindOf = (o: Partial<TodaySignals>) => {
    const d = decideToday(LEGACY, sig(o));
    return d.kind === 'rest' ? `rest:${d.reason}` : d.kind;
  };
  const order: [Partial<TodaySignals>, string][] = [
    [{ gameYesterday: true, hardToday: true }, 'rest:gameYesterday'],
    [{ gameTomorrow: true, choseRecovery: true }, 'rest:gameTomorrow'],
    [{ hardToday: true, choseRecovery: true }, 'rest:hardToday'],
    [{ hardToday: true, lastProgramDate: '2026-10-09' }, 'spacing'],
    [{ choseRecovery: true, checkedIn: false }, 'needCheckin'],
    [{ hardToday: true, halted: true }, 'painWait'],
  ];
  const wrongOrder = order.filter(([o, want]) => kindOf(o) !== want);
  check(
    `4-3 (바) 쉬는 까닭 차례 ${order.length}가지 — 경기 날 · 전날 · 어제 팔 부담 > 오늘 세게 던짐 > '회복' 고름, 간격 · 체크인 · 통증 멈춤은 그보다 먼저`,
    wrongOrder.length === 0,
    wrongOrder.map(([o]) => `${JSON.stringify(o)} → ${kindOf(o)}`).join(' · ')
  );

  /* (사) 주의 차례 — 팔 아낌 > 넘김 > 회복 데이 > 센 불펜 > 모름 > 어제 하체 > 가볍게 > 오래 쉼 > 가벼운 주 */
  const cautionRows: [
    string,
    Partial<TodaySignals>,
    Parameters<typeof pickCaution>[3],
    string | null,
  ][] = [
    [
      '팔 아낌 > 넘김 · 회복',
      { override: true, gameToday: true, recovery: 'loadRisk' },
      { armRest: true },
      'armRest',
    ],
    [
      '넘김(오늘 세게 던짐)',
      { override: true, hardToday: true, recovery: 'loadRisk' },
      {},
      'gameOverride',
    ],
    [
      '넘김(회복 고름)',
      { override: true, choseRecovery: true },
      { lowerBudget: true },
      'gameOverride',
    ],
    [
      '넘기지 않은 신호만으로는 넘김 아님',
      { hardToday: true, choseRecovery: true },
      {},
      'restGap',
    ],
    [
      '회복 데이 > 어제 하체',
      { recovery: 'soreSevere' },
      { lowerBudget: true },
      'recovery',
    ],
    [
      '센 불펜 > 어제 하체',
      { hardThrowRecent: true },
      { lowerBudget: true },
      'hardThrow',
    ],
    ['모름 > 어제 하체', { uncertain: true }, { lowerBudget: true }, 'uncertain'],
    [
      '어제 하체 > 가볍게',
      { soreMany: true, loadCaution: true },
      { lowerBudget: true },
      'lowerBudget',
    ],
    ['어제 하체 > 오래 쉼', {}, { lowerBudget: true }, 'lowerBudget'],
    [
      '바뀐 것 없이 신호만이면 옛 차례',
      { armSpent: true, heavyLowerYesterday: true, soreMany: true },
      {},
      'lighter',
    ],
  ];
  const wrongCaution = cautionRows.filter(
    ([, o, applied, want]) => pickCaution(sig(o), false, 20, applied) !== want
  );
  check(
    `4-3 (사) 주의 차례 ${cautionRows.length}가지 — 팔 아낌 > 넘김 > 회복 데이 > 센 불펜 > 모름 > 어제 하체 > 가볍게 > 오래 쉼(바뀐 것만 말한다)`,
    wrongCaution.length === 0,
    wrongCaution
      .map(([name, o, a]) => `${name}: ${pickCaution(sig(o), false, 20, a)}`)
      .join(' · ')
  );

  /* (아) 글 — 해요체 · 줄표 없음 · 짧게 · 다음 날을 약속하지 않음('미뤘' · '내일로' 없음 — 다음 날 뺀 것을 읽는 곳이 없다) */
  const lines = [
    CAUTION_TEXT.armRest,
    CAUTION_TEXT.lowerBudget,
    REST_TEXT.hardToday,
    REST_TEXT.chooseRecovery,
    restTextOf('hardToday'),
    restTextOf('chooseRecovery', 'hard'),
    ARM_DEFER_REASON,
  ];
  const badLines = lines.filter(
    (t) =>
      t.includes('—') || t.length > 40 || t.includes('미뤘') || t.includes('내일로')
  );
  check(
    `4-3 (아) 새 글 ${lines.length}줄 — 줄표 없음 · 40자 안 · 다음 날 약속 없음, 주의는 '요.'로 · 쉬는 까닭은 '요'로(뒤에 '. 그래도 할까요?'가 붙는다) · 줄 표시는 마침표 없이`,
    badLines.length === 0 &&
      [CAUTION_TEXT.armRest, CAUTION_TEXT.lowerBudget].every((t) =>
        t.endsWith('요.')
      ) &&
      [REST_TEXT.hardToday, REST_TEXT.chooseRecovery].every(
        (t) => t.endsWith('요') && !t.endsWith('.')
      ) &&
      restTextOf('chooseRecovery', 'hard') === REST_TEXT.chooseRecovery &&
      !ARM_DEFER_REASON.endsWith('.'),
    badLines.join(' · ')
  );
}

{
  const st = plan('inseason-starter:2')!;
  check(
    '시즌 중: 어제 팔 부담이 커도 쉬지 않음 · 움직임만 하는 날은 쉼 · 등판 날 · 전날은 쉼',
    decideToday(st, sig({ gameYesterday: true })).kind === 'go' &&
      decideToday(st, sig({ inSeasonMove: true })).kind === 'rest' &&
      decideToday(st, sig({ gameToday: true })).kind === 'rest' &&
      decideToday(st, sig({ gameTomorrow: true })).kind === 'rest' &&
      decideToday(plan('531')!, sig({ inSeasonMove: true })).kind === 'go'
  );
}
/* ── 5) 일차 넘기기 ─────────────────────────────── */
console.log('\n5) 일차 넘기기');
const prog = { key: 'offseason-strength-power', day: 5, week: 2 };
check(
  '프로그램 아닌 날은 안 넘김(RG)',
  !shouldAdvance({ program: null, nextDay: 5, plannedSets: 16, loggedSets: 16 })
);
check(
  '일차가 다르면 안 넘김(두 번 넘김 막기)',
  !shouldAdvance({ program: prog, nextDay: 6, plannedSets: 16, loggedSets: 16 })
);
check(
  '16세트 중 7 = 안 넘김',
  !shouldAdvance({ program: prog, nextDay: 5, plannedSets: 16, loggedSets: 7 })
);
check(
  '16세트 중 8 = 넘김',
  shouldAdvance({ program: prog, nextDay: 5, plannedSets: 16, loggedSets: 8 })
);
check(
  '진행 중이 아니면 안 넘김',
  !shouldAdvance({ program: prog, nextDay: null, plannedSets: 16, loggedSets: 16 })
);
check(
  '처방 0 = 안 넘김',
  !shouldAdvance({ program: prog, nextDay: 5, plannedSets: 0, loggedSets: 0 })
);
check(
  '얼린 목록 program 읽기',
  eq(readSessionProgram({ key: 'k', day: 3, week: 1 }), {
    key: 'k',
    day: 3,
    week: 1,
  }) &&
    readSessionProgram({ key: 'k', day: '3' }) === null &&
    readSessionProgram(undefined) === null
);
check(
  '끝내기 줄(미만)',
  finishLine(5, 16, 7) === '16세트 중 7세트. 8세트를 하면 다음 세션으로 가요',
  finishLine(5, 16, 7)
);
check('끝내기 줄(넘음)', finishLine(5, 15, 8) === '5번 세션을 마쳐요');
check(
  '준비 세트 줄',
  warmupLine(95) === '빈 봉×8 → 57.5×5 → 75×3 · 적지 않아도 돼요',
  warmupLine(95) ?? ''
);
check('가벼운 무게엔 준비 줄 없음', warmupLine(30) === null);

/* ── 6) 무게 추천 ─────────────────────────────── */
console.log('\n6) 무게 추천');
const h = (o: Partial<HistoryEntry>): HistoryEntry => ({
  date: '2026-10-01',
  prescribedReps: 5,
  reserve: 2,
  light: false,
  adjusted: false,
  halfDone: true,
  lastWeightKg: 100,
  lastReps: 5,
  rir: 2,
  hitReps: true,
  ...o,
});
const wi = (o: Partial<WeightInput>): WeightInput => ({
  kind: 'barbell',
  bigLower: true,
  reps: 5,
  reserve: 2,
  light: false,
  adjusted: false,
  gapDays: 2,
  history: [],
  ...o,
});
check(
  '장비 단위',
  weightKindOf(['바벨', '벤치']) === 'barbell' &&
    weightKindOf(['덤벨']) === 'dumbbell' &&
    weightKindOf(['케이블']) === 'machine' &&
    weightKindOf(['메디신볼']) === 'none'
);
check(
  '처음 = 숫자 없음',
  suggestWeight(wi({})).kg === null && suggestWeight(wi({})).reason.code === 'first'
);
check(
  '맨몸 = 무게 없음',
  suggestWeight(wi({ kind: 'none', history: [h({})] })).reason.code === 'noWeight'
);
check(
  'R = T+1 → 하체 5% 올림',
  suggestWeight(wi({ history: [h({ lastWeightKg: 92.5, rir: 3 })] })).kg === 97.5,
  String(suggestWeight(wi({ history: [h({ lastWeightKg: 92.5, rir: 3 })] })).kg)
);
check('R = T → 그대로', suggestWeight(wi({ history: [h({ rir: 2 })] })).kg === 100);
check(
  '안 답함 → 그대로',
  suggestWeight(wi({ history: [h({ rir: null })] })).reason.code === 'holdUnanswered'
);
check(
  '한 번 못 채움 → 그대로',
  suggestWeight(wi({ history: [h({ rir: 1 })] })).kg === 100
);
check(
  '두 번 못 채움 → 5% 줄임',
  suggestWeight(
    wi({ history: [h({ rir: 1 }), h({ date: '2026-09-28', hitReps: false })] })
  ).kg === 95
);
check(
  '앞이 안 답함이면 두 번으로 안 셈',
  suggestWeight(wi({ history: [h({ rir: 1 }), h({ date: '2026-09-28', rir: null })] }))
    .kg === 100
);
check(
  '덤벨 상체 20 → 22(최소 한 단위, U1.3)',
  suggestWeight(
    wi({
      kind: 'dumbbell',
      bigLower: false,
      history: [h({ lastWeightKg: 20, rir: 3 })],
    })
  ).kg === 22
);
check(
  '바벨 하체 40 → 42.5(U1.3)',
  suggestWeight(wi({ history: [h({ lastWeightKg: 40, rir: 3 })] })).kg === 42.5
);
check(
  '횟수 옮기기 60×8 R3 → 6회 T2 = 65(U1.2)',
  suggestWeight(
    wi({
      reps: 6,
      reserve: 2,
      history: [
        h({ lastWeightKg: 60, prescribedReps: 8, lastReps: 8, reserve: 3, rir: 3 }),
      ],
    })
  ).kg === 65
);
{
  const s = suggestWeight(
    wi({
      reps: 3,
      reserve: 1,
      history: [
        h({ lastWeightKg: 100, prescribedReps: 8, lastReps: 8, reserve: 3, rir: 4 }),
      ],
    })
  );
  check('상한 +10kg', s.kg === 110 && s.notes.includes('cap'), String(s.kg));
}
check(
  '가벼운 주 ×0.9',
  suggestWeight(wi({ light: true, reserve: 4, history: [h({})] })).kg === 90
);
check(
  '기준은 보통 날만(가벼운 주를 건너뜀)',
  suggestWeight(
    wi({
      reps: 4,
      history: [
        h({ date: '2026-10-01' }),
        h({ date: '2026-10-05', light: true, lastWeightKg: 90 }),
      ],
    })
  ).reason.code === 'transfer' &&
    (
      suggestWeight(
        wi({
          reps: 4,
          history: [
            h({ date: '2026-10-01' }),
            h({ date: '2026-10-05', light: true, lastWeightKg: 90 }),
          ],
        })
      ).reason as { prevKg: number }
    ).prevKg === 100
);
check(
  '조정한 날 · 절반 못 한 날도 건너뜀',
  suggestWeight(
    wi({
      history: [
        h({ date: '2026-10-01' }),
        h({ date: '2026-10-05', adjusted: true, lastWeightKg: 80 }),
        h({ date: '2026-10-06', halfDone: false, lastWeightKg: 70 }),
      ],
    })
  ).kg === 100
);
check('10일 쉼 ×0.9', suggestWeight(wi({ gapDays: 10, history: [h({})] })).kg === 90);
check('20일 쉼 ×0.85', suggestWeight(wi({ gapDays: 20, history: [h({})] })).kg === 85);
check(
  '30일 쉼 = 숫자 없이',
  suggestWeight(wi({ gapDays: 30, history: [h({})] })).reason.code === 'longBreak'
);
check(
  '오늘 조정 ×0.9 + 표시',
  (() => {
    const s = suggestWeight(wi({ adjusted: true, history: [h({})] }));
    return s.kg === 90 && weightTag(s) === '−10% 오늘 컨디션';
  })()
);
check(
  '스트롱리프트 — 다 채우면 한 칸',
  suggestWeight(
    wi({ linearStep: 2.5, history: [h({ lastWeightKg: 60, rir: null, mode: 'linear' })] })
  ).kg === 62.5 &&
    suggestWeight(wi({ linearStep: 2.5, history: [h({ lastWeightKg: 60, mode: 'linear' })] }))
      .reason.code === 'linearUp'
);
check(
  '스트롱리프트 — 다른 프로그램의 1×5 최고 세트는 옮겨 계산(한 칸 올리지 않음)',
  suggestWeight(
    wi({ linearStep: 2.5, reserve: 3, history: [h({ lastWeightKg: 120, mode: 'pct' })] })
  ).reason.code === 'transfer'
);
check(
  '스트롱리프트 데드리프트 — 가벼워도 한 칸 5kg(상한 없음)',
  suggestWeight(wi({ linearStep: 5, history: [h({ lastWeightKg: 35, mode: 'linear' })] })).kg ===
    40
);
check(
  '스트롱리프트 — 한 번 못 채우면 그대로, 같은 무게로 세 번이면 −10%',
  suggestWeight(
    wi({ linearStep: 2.5, history: [h({ lastWeightKg: 60, hitReps: false, mode: 'linear' })] })
  ).kg === 60 &&
    suggestWeight(
      wi({
        linearStep: 2.5,
        history: [
          h({ lastWeightKg: 60, hitReps: false, mode: 'linear' }),
          h({ date: '2026-09-29', lastWeightKg: 60, hitReps: false, mode: 'linear' }),
          h({ date: '2026-09-27', lastWeightKg: 60, hitReps: false, mode: 'linear' }),
        ],
      })
    ).kg === 55
);
check(
  '기준 무게(TM) = 추정 최대 × 0.9',
  Math.abs(
    (trainingMax([
      { weightKg: 100, reps: 5, rir: 2 },
      { weightKg: 80, reps: 5, rir: null },
    ]) as number) -
      100 * (1 + 7 / 30) * 0.9
  ) < 1e-9 && trainingMax([{ weightKg: 50, reps: 15, rir: null }]) === null
);
{
  const sets = rxOf(p531, 1, 'squat').sets;
  const r = pctWeights({ kind: 'barbell', tmKg: 100, sets, adjusted: false, gapDays: 2 });
  check(
    '% 무게 = TM × %, 추천은 본 세트',
    eq(r.kgs, [65, 75, 85]) && r.suggestion.kg === 85 && r.suggestion.reason.code === 'pct'
  );
  const first = pctWeights({ kind: 'barbell', tmKg: null, sets, adjusted: false, gapDays: null });
  check(
    '% 무게 — 기준 무게 없으면 숫자 없이 2개 남기고',
    eq(first.kgs, [null, null, null]) &&
      first.suggestion.reason.code === 'first' &&
      reasonText(first.suggestion).includes('2개')
  );
  const adj = pctWeights({ kind: 'barbell', tmKg: 100, sets, adjusted: true, gapDays: 10 });
  check(
    '% 무게 — 조정 · 쉰 기간은 곱함',
    adj.kgs[2] === 70 && adj.suggestion.notes.includes('adjusted') && adj.suggestion.notes.includes('gap10')
  );
  check(
    '% 무게 — 한 달 쉬면 숫자 없이',
    pctWeights({ kind: 'barbell', tmKg: 100, sets, adjusted: false, gapDays: 40 }).suggestion
      .reason.code === 'longBreak'
  );
}
{
  const d = (k: string) => new Date(`${k}T00:00:00.000Z`);
  const before = [
    { date: d('2026-09-20'), weightKg: 100, reps: 5, rir: 0 },
    { date: d('2026-09-30'), weightKg: 102.5, reps: 5, rir: 0 },
  ];
  const after = [
    { date: d('2026-10-08'), weightKg: 80, reps: 5, rir: 0 },
    { date: d('2026-10-10'), weightKg: 120, reps: 5, rir: 0 },
  ];
  check(
    '기준 무게 — 시작 전 기록이 있으면 그것만(날마다 최고 중 두 번째), 없으면 시작 뒤 첫날만',
    tmFromSets([...before, ...after], '2026-10-07') === trainingMax([before[1]]) &&
      tmFromSets(after, '2026-10-07') === trainingMax([after[0]]) &&
      tmFromSets([], '2026-10-07') === null
  );
  check(
    '기준 무게 — 잘못 적은 세트 하나(140kg)가 부풀리지 않음',
    tmFromSets(
      [...before, { date: d('2026-10-01'), weightKg: 140, reps: 5, rir: 0 }],
      '2026-10-07'
    ) === trainingMax([before[1]])
  );
  check(
    '기준 무게 — 가벼운 날이 섞여도 무거운 날로',
    tmFromSets(
      [
        { date: d('2026-09-28'), weightKg: 100, reps: 5, rir: 0 },
        { date: d('2026-09-30'), weightKg: 60, reps: 8, rir: 0 },
      ],
      '2026-10-07'
    ) === trainingMax([{ weightKg: 100, reps: 5, rir: 0 }])
  );
  check(
    '기준 무게 — 가벼운 10회 날이 여럿이어도 무거운 5회 날을 버리지 않음',
    tmFromSets(
      [
        { date: d('2026-09-24'), weightKg: 60, reps: 10, rir: 0 },
        { date: d('2026-09-26'), weightKg: 60, reps: 10, rir: 0 },
        { date: d('2026-09-28'), weightKg: 60, reps: 10, rir: 0 },
        { date: d('2026-09-30'), weightKg: 100, reps: 5, rir: 0 },
      ],
      '2026-10-07'
    ) === trainingMax([{ weightKg: 100, reps: 5, rir: 0 }])
  );
  check(
    '기준 무게 — 시작 전 기록이 못 쓰는 것(15회)뿐이면 시작 뒤 첫날로',
    tmFromSets(
      [
        { date: d('2026-09-30'), weightKg: 60, reps: 15, rir: 0 },
        { date: d('2026-10-08'), weightKg: 100, reps: 5, rir: 0 },
      ],
      '2026-10-07'
    ) === trainingMax([{ weightKg: 100, reps: 5, rir: 0 }])
  );
}
check(
  '처방 하나의 무게 — 스트롱리프트 데드리프트 +5 · 덤벨 밀기 +2 · 5/3/1 은 TM × %',
  weighItem(
    rxOf(sl, 2, 'hinge'),
    { equipment: ['바벨'] },
    { adjusted: false, gapDays: 2, history: [h({ lastWeightKg: 100, mode: 'linear' })], tmKg: null }
  ).suggestion?.kg === 105 &&
    weighItem(
      rxOf(sl, 1, 'push'),
      { equipment: ['덤벨', '벤치'] },
      { adjusted: false, gapDays: 2, history: [h({ lastWeightKg: 20, mode: 'linear' })], tmKg: null }
    ).suggestion?.kg === 22 &&
    eq(
      weighItem(
        rxOf(p531, 1, 'squat'),
        { equipment: ['바벨'] },
        { adjusted: false, gapDays: 2, history: [], tmKg: 100 }
      ).kgs,
      [65, 75, 85]
    ) &&
    weighItem(rxOf(p531, 1, 'jump'), { equipment: [] }, {
      adjusted: false,
      gapDays: 2,
      history: [],
      tmKg: 100,
    }).suggestion === null
);
check(
  '겹치면 곱함(가벼운 주 + 20일 쉼)',
  suggestWeight(wi({ light: true, gapDays: 20, history: [h({})] })).kg === 77.5
);
check(
  'lb 화면 반올림',
  roundForDisplay(100, 'lb') === 220 && roundForDisplay(100, 'kg') === 100
);

/* ── 7) 문구 ─────────────────────────────── */
console.log('\n7) 문구 — 해요체 · 줄표 없음');
const texts = [
  ...Object.values(CAUTION_TEXT),
  ...Object.values(REST_TEXT),
  reasonText(suggestWeight(wi({}))),
  reasonText(suggestWeight(wi({ history: [h({ rir: 3 })] }))),
  reasonText(suggestWeight(wi({ reps: 6, history: [h({ prescribedReps: 8 })] }))),
  reasonText(
    suggestWeight(
      wi({
        light: true,
        gapDays: 20,
        history: [h({ rir: 1 }), h({ date: '2026-09-28', hitReps: false })],
      })
    )
  ),
  reasonText(suggestWeight(wi({ gapDays: 40, history: [h({})] }))),
  reasonText(suggestWeight(wi({ linearStep: 2.5, history: [h({ mode: 'linear' })] }))),
  reasonText(
    pctWeights({
      kind: 'barbell',
      tmKg: 100,
      sets: rxOf(p531, 1, 'squat').sets,
      adjusted: false,
      gapDays: null,
    }).suggestion
  ),
  ...PROGRAMS.flatMap((d) => [d.name, d.summary, ...d.detail]),
  ...programChoiceList().flatMap((c) => c.weeks),
];
check(
  '줄표(—) 없음',
  texts.every((t) => !t.includes('—')),
  texts.find((t) => t.includes('—')) ?? ''
);
check(
  "쉬는 까닭 · 넘긴 날 주의(2판 P4 커밋 F) — 어제는 '어제 팔 부담이 컸어요'(경기 다음 날이 아님), 넘긴 날은 까닭을 가리지 않는 글",
  REST_TEXT.gameYesterday === '어제 팔 부담이 컸어요' &&
    !Object.values(REST_TEXT).some((t) => t.includes('경기 다음 날')) &&
    !CAUTION_TEXT.gameOverride.includes('경기') &&
    CAUTION_TEXT.gameOverride.endsWith('멈춰요.'),
  `${REST_TEXT.gameYesterday} / ${CAUTION_TEXT.gameOverride}`
);
check(
  '올림 까닭에 지난 기록',
  reasonText(suggestWeight(wi({ history: [h({ rir: 3 })] }))).includes('100kg × 5')
);

/* ── 8) 회귀 계약(RG) — 프로그램이 아닌 날은 그대로 ─────────────────────────────── */
console.log('\n8) 회귀 계약 — 프로그램 아닌 날 · 교체');
const src = (o: Record<string, unknown> = {}) => ({
  id: 'x',
  title: '덤벨 벤치 프레스',
  category: '상체 스트렝스',
  bodyParts: ['가슴'],
  intensity: '높음',
  movementPattern: '밀기',
  equipment: ['덤벨', '벤치'],
  sets: 3,
  reps: 10,
  holdSeconds: null as number | null,
  restSeconds: 90,
  perSide: false,
  thumbPath: null,
  ...o,
});
const oldEx = {
  id: 'a',
  title: '스쿼트',
  category: '하체 스트렝스',
  slot: 'main',
  prescription: '3세트 × 10회',
  plannedSets: 3,
  plannedReps: 10,
  plannedHoldSeconds: null,
  perSide: false,
  needsWeight: true,
  isHold: false,
  equipment: ['바벨'],
  bodyParts: [],
  intensity: '높음',
  thumbPath: null,
} as FrozenExercise;
const oldJson = {
  themeKey: 'lower',
  themeLabel: '하체 스트렝스 데이',
  goal: '근력 향상',
  exercises: [oldEx],
};
{
  const read = readFrozenPlan(oldJson);
  check(
    '옛 판은 예전과 똑같은 모양(새 키 없음)',
    eq(read, oldJson) && read != null && !('program' in read)
  );
  const progJson = {
    ...oldJson,
    program: { key: 'offseason-strength-power', day: 5, week: 2 },
  };
  check(
    '프로그램 판은 program 을 지킴(U2)',
    eq(readFrozenPlan(progJson)?.program, progJson.program)
  );
  check(
    '쉰 기간도 판에 실려 읽힘(숫자가 아니면 버림)',
    readFrozenPlan({ ...progJson, program: { ...progJson.program, gapDays: 12 } })?.program
      ?.gapDays === 12 &&
      !(
        'gapDays' in
        (readFrozenPlan({ ...progJson, program: { ...progJson.program, gapDays: 'x' } })
          ?.program ?? {})
      )
  );
  const bad = readFrozenPlan({ ...oldJson, program: { key: 1 } });
  check('program 모양이 틀리면 버림', bad != null && !('program' in bad));
  const fresh: FrozenPlan = {
    themeKey: 'upper',
    themeLabel: '상체',
    goal: null,
    exercises: [{ ...oldEx, id: 'b' }, oldEx],
  };
  check('다시 열 판이 없으면 새 목록 그대로', mergeReopened(null, fresh) === fresh);
  const kept = readFrozenPlan(progJson) as FrozenPlan;
  const merged = mergeReopened(kept, fresh);
  check(
    '다시 열면 쓰던 목록 + 새 운동만, program 남음',
    eq(
      merged.exercises.map((e) => e.id),
      ['a', 'b']
    ) &&
      eq(merged.program, progJson.program) &&
      merged.themeKey === 'lower'
  );
  /* P2 — 그 판에서 뺀 · 바꾼 운동은 다시 열어도 안 돌아온다, 더하기(add)의 from 은 거르지 않는다, 기록은 판에 남는다 */
  const at = '2026-10-12T01:00:00.000Z';
  const swapped = readFrozenPlan({
    ...oldJson,
    exercises: [{ ...oldEx, id: 'c' }],
    swaps: [
      { from: 'a', to: 'c', kind: 'replace', where: 'session', slot: 'main', at },
      { from: 'b', to: null, kind: 'remove', where: 'session', slot: 'main', at },
      { from: 'd', to: 'e', kind: 'add', where: 'session', slot: 'main', at },
    ],
  }) as FrozenPlan;
  const reopened = mergeReopened(swapped, {
    ...fresh,
    exercises: [oldEx, { ...oldEx, id: 'b' }, { ...oldEx, id: 'd' }],
  });
  check(
    '다시 열어도 그 판에서 뺀 · 바꾼 운동은 안 돌아오고(P2), 기록은 남는다',
    eq(
      reopened.exercises.map((e) => e.id),
      ['c', 'd']
    ) &&
      reopened.swaps?.length === 3 &&
      !('swaps' in (readFrozenPlan(oldJson) ?? {}))
  );
  check(
    '프로그램 아닌 판의 교체 = null(지금 그대로)',
    programSwapEntry(read as FrozenPlan, oldEx, src(), 0, () => ({ suggestedKg: null })) ===
      null
  );
}
{
  const rx3 = rxOf(LEGACY, 7, 'push');
  const fe = freezeProgramExercise(src(), rx3, { suggestedKg: 24 });
  check(
    '프로그램 운동 = 표 처방 · 칸 · 추천',
    fe.plannedSets === 4 &&
      fe.plannedReps === 6 &&
      fe.restSeconds === 120 &&
      fe.prescription === '4세트 × 6회 · 2개 남기고' &&
      fe.programSlot?.variant === 'push' &&
      fe.suggestedKg === 24 &&
      fe.slot === 'main'
  );
  const lighter = freezeProgramExercise(src(), lighterRx(rxOf(LEGACY, 7, 'squat')), {
    suggestedKg: 85,
    adjusted: true,
  });
  check(
    '조정한 날 = 세트 −1 · 표시',
    lighter.plannedSets === 3 && lighter.programSlot?.adjusted === true
  );
  const hold = freezeProgramExercise(
    src({ reps: null, holdSeconds: 30, category: '코어' }),
    rxOf(LEGACY, 5, 'antiRotation'),
    { suggestedKg: null }
  );
  check(
    '버티기 운동은 시간 그대로, 세트만 맞춤, 몸통 칸',
    hold.isHold &&
      hold.plannedHoldSeconds === 30 &&
      hold.plannedSets === 3 &&
      hold.slot === 'core'
  );
  const plan: FrozenPlan = {
    themeKey: 'lower',
    themeLabel: '프로그램',
    goal: null,
    program: { key: 'offseason-strength-power', day: 7, week: 3 },
    exercises: [fe],
  };
  const swap = programSwapEntry(
    plan,
    fe,
    src({ id: 'y', title: '벤치 프레스', equipment: ['바벨', '벤치'] }),
    0,
    () => ({ suggestedKg: 60 })
  );
  check(
    '프로그램 날 바꾸기 = 그 칸 · 그 주 처방, 대체 표시(U3)',
    swap != null &&
      swap.entry.plannedSets === 4 &&
      swap.entry.plannedReps === 6 &&
      swap.entry.programSlot?.substitute === true &&
      swap.entry.suggestedKg === 60 &&
      swap.fromPlannedSets === null
  );
  const after = programSwapEntry(plan, fe, src({ id: 'y' }), 2, () => ({
    suggestedKg: null,
  }));
  check(
    '세트 2개 남긴 뒤 바꾸기 = 남은 2세트만, 바뀐 운동은 2로 줄임',
    after != null && after.entry.plannedSets === 2 && after.fromPlannedSets === 2
  );
  check(
    "'몇 개 남기고' 처방은 mode 를 싣고 세트마다 목표는 없음",
    fe.programSlot?.mode === 'reserve' && fe.setTargets === undefined
  );
}
{
  const rx = rxOf(p531, 1, 'squat');
  const fe = freezeProgramExercise(src(), rx, { suggestedKg: 85, kgs: [65, 75, 85] });
  check(
    '% 처방 = 세트마다 목표(무게 · 횟수 · +)',
    eq(fe.setTargets, [
      { reps: 5, kg: 65 },
      { reps: 5, kg: 75 },
      { reps: 5, kg: 85, plus: true },
    ]) &&
      fe.programSlot?.mode === 'pct' &&
      fe.prescription === '5회 65kg → 5회 75kg → 5회+ 85kg · +는 2개 남기고'
  );
  const plan531: FrozenPlan = {
    themeKey: 'lower',
    themeLabel: '프로그램',
    goal: null,
    program: { key: '531', day: 1, week: 1 },
    exercises: [fe],
  };
  const swap = programSwapEntry(plan531, fe, src({ id: 'z' }), 2, (r) => ({
    suggestedKg: 90,
    kgs: r.sets.map(() => 90),
  }));
  check(
    '% 처방에서 2세트 뒤 바꾸기 = 남은 + 세트만 이어 함',
    swap != null &&
      swap.entry.plannedSets === 1 &&
      eq(swap.entry.setTargets, [{ reps: 5, kg: 90, plus: true }])
  );
  const adj = freezeProgramExercise(src(), lighterRx(rx), {
    suggestedKg: 68,
    adjusted: true,
    kgs: [58, 68],
  });
  const adjSwap = programSwapEntry(
    { ...plan531, exercises: [adj] },
    adj,
    src({ id: 'y' }),
    1,
    (r) => ({ suggestedKg: 70, kgs: r.sets.map(() => 70) })
  );
  const restKept = programSwapEntry(
    { ...plan531, exercises: [{ ...fe, restSeconds: 180 }] },
    { ...fe, restSeconds: 180 },
    src({ id: 'r' }),
    0,
    () => ({ suggestedKg: null })
  );
  check('바꾸기는 얼린 쉬는 시간을 이어받음', restKept?.entry.restSeconds === 180);
  check(
    '조정한 % 날에 1세트 뒤 바꾸기 = 줄인 처방의 남은 세트(+ 세트 없음)',
    adjSwap != null &&
      eq(adjSwap.entry.setTargets, [{ reps: 5, kg: 70 }]) &&
      adjSwap.entry.programSlot?.adjusted === true
  );
  const bbbRx = rxOf(bbb, 1, 'squat');
  const bbbFe = freezeProgramExercise(src(), bbbRx, {
    suggestedKg: 85,
    kgs: bbbRx.sets.map(() => 50),
  });
  const bbbSwap = programSwapEntry(
    { ...plan531, program: { key: '531-bbb', day: 1, week: 1 }, exercises: [bbbFe] },
    bbbFe,
    src({ id: 'w' }),
    3,
    (r) => ({ suggestedKg: 50, kgs: r.sets.map(() => 50) })
  );
  check(
    'BBB 에서 3세트 뒤 바꾸기 = 남은 10회 5세트, 처방 횟수도 10',
    bbbSwap != null && bbbSwap.entry.plannedSets === 5 && bbbSwap.entry.plannedReps === 10
  );
  /* 판 하나의 기록 — % 날은 + 세트가 기준, 여유 2, 세트마다 처방 횟수로 채움 판정 */
  const logged = [
    [65, 5],
    [75, 5],
    [85, 8],
    [50, 10],
    [50, 10],
    [50, 10],
    [50, 10],
    [50, 10],
  ].map(([w, r], i) => ({ setNo: i + 1, weightKg: w, reps: r, rir: null }));
  const e = historyEntry('2026-10-01', bbbFe, logged);
  check(
    '% 판 기록 — 기준은 + 세트, 여유 2, 세트마다 채움 판정, 방식 실음',
    e.lastWeightKg === 85 &&
      e.lastReps === 8 &&
      e.reserve === 2 &&
      e.hitReps &&
      e.mode === 'pct'
  );
  const warm = historyEntry(
    '2026-10-01',
    freezeProgramExercise(src(), rxOf(sl, 2, 'hinge'), { suggestedKg: 100 }),
    [
      { setNo: 1, weightKg: 20, reps: 8, rir: null },
      { setNo: 2, weightKg: 60, reps: 3, rir: null },
      { setNo: 3, weightKg: 100, reps: 5, rir: null },
    ]
  );
  check(
    '준비 세트를 적어도 처방 세트(뒤쪽)로 채움 판정',
    warm.hitReps && warm.lastWeightKg === 100 && warm.mode === 'linear'
  );
}

/* ── 2판 P6-7) 올림 멈춤 — 영양 추세 깃발(lib/nutrition/fuel-check.ts)이 선 주 ─────────────────────────────── */
console.log(
  '\n2판 P6-7) 올림 멈춤(held) — 영양 추세 깃발이 선 주는 올림만 그대로, 낮춤 · 횟수 옮기기는 그대로'
);
{
  /*
   * 왜 보는가. 먹는 양 · 몸무게 · 컨디션이 함께 낮은 주에 '다 채웠으니 올림'은 몸이 따라온 증거가 못 된다(next-weight.ts ⑧). 멈추는
   * 것은 올림(raise · linearUp)뿐이어야 하고, 낮추는 곱(쉰 기간 · 가벼운 주 · 오늘 조정)과 줄임은 그대로, 깃발이 없으면 글자까지 예전과 같아야 한다.
   */
  const json = (v: unknown) => JSON.stringify(v);
  const HOLD = FUEL_HOLD_TEXT;
  const raise = wi({ history: [h({ rir: 3 })] });
  const r0 = suggestWeight(raise);
  const r1 = suggestWeight({ ...raise, holdProgress: HOLD });
  check(
    '(가) 여유로 올릴 날(R = T+1) — 깃발이면 지난 무게 그대로 · 까닭 held · 줄 표시 올림 멈춤 · 상한 표시 없음',
    r0.reason.code === 'raise' &&
      r0.kg === 105 &&
      r1.kg === 100 &&
      r1.reason.code === 'held' &&
      json(r1.reason) === json({ code: 'held', prevKg: 100, prevReps: 5, why: HOLD }) &&
      r1.notes.length === 0 &&
      weightTag(r1) === '올림 멈춤',
    json(r1)
  );
  check(
    "(가) 까닭 문장 — '지난번 100kg × 5, 올릴 때지만 …했어요.' 한 문장, 해요체 · 줄표 없음",
    reasonText(r1) === `지난번 100kg × 5, 올릴 때지만 ${HOLD}.` &&
      !reasonText(r1).includes('—') &&
      HOLD.length <= 60,
    reasonText(r1)
  );
  const lin = wi({
    linearStep: 2.5,
    history: [h({ lastWeightKg: 60, mode: 'linear' })],
  });
  check(
    '(나) 스트롱리프트 한 칸(linearUp)도 멈춤 — 60kg 그대로 · held, weighItem 도 같은 길(데드리프트 +5 → 100 그대로)',
    suggestWeight(lin).kg === 62.5 &&
      suggestWeight({ ...lin, holdProgress: HOLD }).kg === 60 &&
      suggestWeight({ ...lin, holdProgress: HOLD }).reason.code === 'held' &&
      weighItem(
        rxOf(sl, 2, 'hinge'),
        { equipment: ['바벨'] },
        {
          adjusted: false,
          gapDays: 2,
          history: [h({ lastWeightKg: 100, mode: 'linear' })],
          tmKg: null,
          holdProgress: HOLD,
        }
      ).suggestion?.kg === 100
  );
  const withHold = (o: Partial<WeightInput>) => ({
    off: suggestWeight(wi(o)),
    on: suggestWeight(wi({ ...o, holdProgress: HOLD })),
  });
  const gap = withHold({ gapDays: 10, history: [h({ rir: 3 })] });
  const light = withHold({ light: true, reserve: 2, history: [h({ rir: 3 })] });
  const adj = withHold({ adjusted: true, history: [h({ rir: 3 })] });
  check(
    '(다) 낮추는 곱은 그대로 — 쉰 10일 · 가벼운 주 · 오늘 조정이면 지난 무게 × 0.9(90kg), 표시는 낮춤 쪽이 먼저',
    gap.on.kg === 90 &&
      gap.on.reason.code === 'held' &&
      gap.on.notes.includes('gap10') &&
      weightTag(gap.on) === '오래 쉼' &&
      light.on.kg === 90 &&
      light.on.notes.includes('light') &&
      adj.on.kg === 90 &&
      weightTag(adj.on) === '−10% 오늘 컨디션' &&
      reasonText(adj.on).includes('오늘 몸 상태로 10% 낮췄어요.'),
    json([gap.on, light.on, adj.on])
  );
  const miss2 = withHold({
    history: [h({ rir: 1 }), h({ date: '2026-09-28', hitReps: false })],
  });
  const transfer = withHold({ reps: 3, history: [h({ rir: 3 })] });
  check(
    '(라) 줄임(두 번 못 채움 −5%)과 횟수 옮기기(5회 → 3회)는 깃발과 상관없이 같다 — 옮긴 무게는 같은 힘의 무게라 올림이 아니다',
    json(miss2.on) === json(miss2.off) &&
      miss2.on.kg === 95 &&
      json(transfer.on) === json(transfer.off) &&
      transfer.on.reason.code === 'transfer' &&
      (transfer.on.kg ?? 0) > 100
  );
  check(
    '(마) % 방식은 holdProgress 를 받아도 무게가 같다(4주 동안 기준 무게 그대로)',
    json(
      weighItem(
        rxOf(p531, 1, 'squat'),
        { equipment: ['바벨'] },
        { adjusted: false, gapDays: 2, history: [], tmKg: 100, holdProgress: HOLD }
      )
    ) ===
      json(
        weighItem(
          rxOf(p531, 1, 'squat'),
          { equipment: ['바벨'] },
          { adjusted: false, gapDays: 2, history: [], tmKg: 100 }
        )
      )
  );

  /* (바) 격자 — 올림이 아닌 칸은 깃발과 상관없이 같고, 올림 칸은 held 로 더 무겁지 않다. 빈 글 · 없음은 예전과 글자까지 같다 */
  {
    let cells = 0;
    let raised = 0;
    const bad: string[] = [];
    for (const rir of [null, 0, 1, 2, 3, 4])
      for (const reserve of [null, 1, 2, 3])
        for (const hitReps of [true, false])
          for (const light of [false, true])
            for (const adjusted of [false, true])
              for (const gapDays of [null, 2, 9, 16, 30])
                for (const linear of [false, true])
                  for (const reps of [5, 3])
                    for (const prevMiss of [false, true]) {
                      const input = wi({
                        reps,
                        reserve,
                        light,
                        adjusted,
                        gapDays,
                        ...(linear ? { linearStep: 2.5 } : {}),
                        history: [
                          h({
                            rir,
                            reserve,
                            hitReps,
                            lastWeightKg: 80,
                            mode: linear ? 'linear' : null,
                          }),
                          ...(prevMiss
                            ? [
                                h({
                                  date: '2026-09-28',
                                  hitReps: false,
                                  lastWeightKg: 80,
                                }),
                              ]
                            : []),
                        ],
                      });
                      cells++;
                      const off = suggestWeight(input);
                      const on = suggestWeight({ ...input, holdProgress: HOLD });
                      const empty = suggestWeight({ ...input, holdProgress: '' });
                      const up =
                        off.reason.code === 'raise' || off.reason.code === 'linearUp';
                      if (up) raised++;
                      const ok =
                        json(empty) === json(off) &&
                        (up
                          ? on.reason.code === 'held' &&
                            on.kg != null &&
                            off.kg != null &&
                            on.kg <= off.kg &&
                            on.kg <= 80 &&
                            !on.notes.includes('cap') &&
                            weightTag(on) != null
                          : json(on) === json(off));
                      if (!ok)
                        bad.push(
                          json({
                            rir,
                            reserve,
                            hitReps,
                            light,
                            adjusted,
                            gapDays,
                            linear,
                            reps,
                            prevMiss,
                          })
                        );
                    }
    check(
      `(바) 격자 ${cells}가지(올림 ${raised}가지) — 올림 칸만 held(지난 무게 이하 · 상한 표시 없음 · 줄 표시 있음), 나머지와 빈 글은 글자까지 같다`,
      bad.length === 0 && raised > 0,
      bad.slice(0, 3).join(' / ')
    );
  }
}

console.log(`\n통과 ${passed} · 실패 ${failed}`);
if (failed > 0) process.exit(1);
