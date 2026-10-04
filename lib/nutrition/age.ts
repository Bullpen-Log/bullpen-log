import type { GoalKey } from '@/lib/nutrition/meta';
import type { Sex } from '@/lib/profile';

/**
 * 나이에 맞춘 영양 기준 — 성장기 선수에게 어른 식을 그대로 쓰지 않는다
 * (2026-09-30 사용자: "나이에 맞는 영양 요구도 다르니까 나이에 맞춰서 추천").
 *
 * 만 나이로 셋으로 나눈다. 초등학생 · 중고등학생 · 대학 이상과 대개 겹친다.
 *
 *   어린이   만 12세 이하
 *   성장기   만 13~17세
 *   성인     만 18세 이상(생년월일을 모르면 여기 — 목표 계산의 짐작 나이가 20세다)
 *
 * 달라지는 것 셋.
 *
 *   기초대사량  18세 밑은 Schofield 식(WHO/FAO/UNU 1985 — 3~18세용, 체중으로 셈).
 *              Mifflin-St Jeor 는 어른 자료로 만든 식이라 청소년을 낮게 잡는다
 *              (만 15세 65kg 170cm 남자: Mifflin 1,640 · Schofield 1,810kcal).
 *   단백질      체중 1kg 당 — 어린이 1.2~1.5g · 성장기 1.3~1.8g(청소년 선수 권고,
 *              Desbrow 2014 호주 스포츠영양사회) · 성인 1.6~2.2g(ISSN 2017).
 *              많이 먹는다고 더 자라지 않고, 그만큼 탄수화물 자리가 준다.
 *   감량        성장기는 하루 −200kcal 까지, 어린이는 고를 수 없다. 자라는 몸에서 크게
 *              빼면 키 · 뼈 · 회복이 먼저 손해를 본다. 정말 빼야 하면 의사와 상의할 일이다.
 *
 * ■ 주당 속도와 체중 흐름 조정(영양 로드맵 4번 — lib/nutrition/weight-goal.ts)
 *
 *   속도        성인만 고른다(주 0.25 · 0.35kg). 성장기는 한 가지, 어린이와 생년월일을 모르는 계정은 없다.
 *              속도의 kcal 은 예전 goalDelta 에 맞췄다 — 기본 속도를 고르면 숫자가 1kcal 도 안 바뀐다.
 *   조정        체중 흐름을 보고 단추로 받아들인 하루 ±100kcal 의 합. 나이마다 한도가 있고(effectiveAdjust),
 *              감량은 어느 나이에서도 예전보다 깊어지지 않는다 — 조정은 덜 빼는 쪽으로만 간다.
 *
 * 한도는 저장할 때가 아니라 읽을 때 건다. 폼이 무엇을 보냈든, 생일이 지나 나이 칸이 바뀌었든 통과하지 못한다.
 */

export type AgeBand = 'child' | 'teen' | 'adult';

export type AgeRule = {
  band: AgeBand;
  /** '성장기(만 13~17세)' */
  label: string;
  proteinChoices: readonly number[];
  proteinDefault: number;
  /** 목표마다 하루 칼로리를 얼마나 더하고 빼나. null 이면 고를 수 없다(유지로 셈한다) */
  goalDelta: Record<GoalKey, number | null>;
  /** 목표 칸 밑 설명 */
  goalHint: Record<GoalKey, string>;
  /** 기초대사량 식 이름 — 목표 창에 적는다 */
  bmrName: string;
  /**
   * 고를 수 있는 주당 속도(kg)와 그 속도의 하루 kcal(크기만 — 방향은 목표가 정한다). 빈 목록은 속도가 없다는 뜻.
   *
   * kcal 은 예전 goalDelta 에 맞춘 값이다. 1kg ≈ 7,700kcal 로 셈하면 0.2 ≈ 220 · 0.25 ≈ 275 · 0.35 ≈ 385.
   * 어림값이고 시작 짐작이다(증량은 사람마다 5,000~8,000kcal 넘게 흩어진다) — 그래서 체중 흐름을 보고 맞춰 간다.
   */
  paces: Record<GoalKey, readonly Pace[]>;
};

export type Pace = { kg: number; kcal: number };

export const AGE_RULES: Record<AgeBand, AgeRule> = {
  child: {
    band: 'child',
    label: '어린이(만 12세 이하)',
    proteinChoices: [1.2, 1.4, 1.5],
    proteinDefault: 1.2,
    goalDelta: { gain: 200, maintain: 0, lose: null },
    goalHint: {
      gain: '잘 자라게 조금 더 · 하루 +200kcal',
      maintain: '자라는 만큼 먹어요',
      lose: '어린이는 감량을 고를 수 없어요. 필요하면 소아청소년과와 상의하세요',
    },
    bmrName: 'Schofield 식 · 어린이와 청소년용',
    paces: { gain: [], maintain: [], lose: [] },
  },
  teen: {
    band: 'teen',
    label: '성장기(만 13~17세)',
    proteinChoices: [1.3, 1.5, 1.6, 1.8],
    proteinDefault: 1.5,
    goalDelta: { gain: 300, maintain: 0, lose: -200 },
    goalHint: {
      gain: '몸을 키워요 · 하루 +300kcal',
      maintain: '자라는 만큼 먹으며 시즌을 버텨요',
      lose: '성장기라 아주 천천히 · 하루 −200kcal',
    },
    bmrName: 'Schofield 식 · 어린이와 청소년용',
    paces: {
      gain: [{ kg: 0.25, kcal: 300 }],
      maintain: [],
      lose: [{ kg: 0.2, kcal: 200 }],
    },
  },
  adult: {
    band: 'adult',
    label: '성인(만 18세 이상)',
    proteinChoices: [1.6, 1.8, 2.0, 2.2],
    proteinDefault: 1.8,
    goalDelta: { gain: 300, maintain: 0, lose: -400 },
    /* 성인은 kcal 을 여기 적지 않는다 — 바로 아래 '일주일 속도' 줄이 말한다(속도마다 다르다) */
    goalHint: {
      gain: '몸을 키워요',
      maintain: '지금 몸으로 시즌을 버텨요',
      lose: '천천히 빼요',
    },
    bmrName: 'Mifflin-St Jeor 식',
    paces: {
      gain: [
        { kg: 0.25, kcal: 300 },
        { kg: 0.35, kcal: 400 },
      ],
      maintain: [],
      lose: [
        { kg: 0.25, kcal: 300 },
        { kg: 0.35, kcal: 400 },
      ],
    },
  },
};

export function ageBand(age: number | null): AgeBand {
  if (age === null) return 'adult';
  if (age <= 12) return 'child';
  if (age <= 17) return 'teen';
  return 'adult';
}

export function ageRule(age: number | null): AgeRule {
  return AGE_RULES[ageBand(age)];
}

/**
 * 계산에 쓸 단백질(체중 1kg 당).
 *
 * null 은 '아직 안 정함' — 나이에 맞는 기본값을 쓴다. 정해 둔 값은 성인이면 그대로,
 * 18세 밑이면 그 나이의 범위 안으로 당긴다(성인 때 기본값 1.8 을 저장해 둔 중학생이
 * 그대로 1.8 을 먹게 두지 않는다).
 */
export function effectiveProtein(perKg: number | null, age: number | null) {
  const rule = ageRule(age);
  if (perKg === null) return rule.proteinDefault;
  if (rule.band === 'adult') return perKg;
  const lo = rule.proteinChoices[0];
  const hi = rule.proteinChoices[rule.proteinChoices.length - 1];
  return Math.min(hi, Math.max(lo, perKg));
}

/** 고를 수 없는 목표(어린이의 감량)는 유지로 셈한다 */
export function effectiveGoal(goal: GoalKey, age: number | null): GoalKey {
  return ageRule(age).goalDelta[goal] === null ? 'maintain' : goal;
}

/**
 * Schofield(1985) 기초대사량 — 체중만 쓰는 식. 3~10세 · 10~18세 두 칸.
 * 성별을 모르면 남녀 식의 가운데 값.
 */
export function schofieldKcal(weightKg: number, age: number, sex: Sex | null) {
  const young = age < 10;
  const m = young ? 22.706 * weightKg + 504.3 : 17.686 * weightKg + 658.2;
  const f = young ? 20.315 * weightKg + 485.9 : 13.384 * weightKg + 692.6;
  return sex === 'M' ? m : sex === 'F' ? f : (m + f) / 2;
}

/* ─────────────────────────── 주당 속도 · 체중 흐름 조정 ─────────────────────────── */

/** 성인 증량의 빠른 속도(주 0.35kg)는 이 체중부터 고를 수 있다 — 0.35 ÷ 70 = 체중의 0.5%/주 */
export const GAIN_FAST_MIN_KG = 70;

/** 조정의 한도(kcal) — 올리기는 성장기 +200 · 성인 +300, 내리기는 성인 증량만 −200 까지 */
const ADJUST_UP = { teen: 200, adult: 300 } as const;
const ADJUST_DOWN_ADULT_GAIN = -200;

/** 그 나이 · 목표의 기본 속도 — 예전 goalDelta 와 같은 kcal 인 칸. 속도가 없으면 null */
export function defaultPace(band: AgeBand, goal: GoalKey): Pace | null {
  const delta = Math.abs(AGE_RULES[band].goalDelta[goal] ?? 0);
  return AGE_RULES[band].paces[goal].find((p) => p.kcal === delta) ?? null;
}

/**
 * 계산에 쓸 주당 속도(kg, 크기만). 속도가 없는 나이 · 목표(어린이 · 유지 · 생년월일 모름)는 null.
 *
 * 저장값이 null 이면 기본 속도. 있으면 '저장값 이하 중 가장 큰 선택지'로 당긴다 — 성인 때 0.35 를 골라 둔
 * 값은 성장기 칸에서 0.25 가 된다. 체중은 보지 않는다(읽을 때마다 목표가 튀지 않게 — 체중 조건은 고를 때만 본다).
 */
export function effectiveRate(
  rate: number | null,
  age: number | null,
  goal: GoalKey
): number | null {
  if (age === null) return null;
  const band = ageBand(age);
  const list = AGE_RULES[band].paces[goal];
  if (list.length === 0) return null;
  if (rate === null) return defaultPace(band, goal)?.kg ?? list[0].kg;
  const within = list.filter((p) => p.kg <= rate + 1e-9);
  return within.length > 0 ? within[within.length - 1].kg : list[0].kg;
}

/**
 * 저장할 속도 — 기본 속도는 null 로 적는다(칸이 비어 있던 옛 줄과 같은 뜻이라, '안 바꿨다'를 가릴 수 있다).
 * 속도가 없는 나이 · 목표도 null.
 */
export function storedRate(
  rate: number | null,
  age: number | null,
  goal: GoalKey
): number | null {
  const eff = effectiveRate(rate, age, goal);
  if (eff === null || age === null) return null;
  return eff === defaultPace(ageBand(age), goal)?.kg ? null : eff;
}

/** 목표에서 오는 하루 kcal(부호 있음). 속도가 null 이면 예전 goalDelta 그대로 */
export function paceDelta(age: number | null, goal: GoalKey, rateKg: number | null) {
  const rule = ageRule(age);
  const legacy = rule.goalDelta[goal] ?? 0;
  if (rateKg === null) return legacy;
  const pace = rule.paces[goal].find((p) => p.kg === rateKg);
  if (!pace) return legacy;
  return goal === 'lose' ? -pace.kcal : pace.kcal;
}

/**
 * 목표 창에서 고를 수 있는 속도(kg). 성인 증량의 0.35 는 기준 체중이 70kg 이상일 때만 —
 * 가벼운 선수에게 주 0.35kg 은 체중의 0.5% 를 넘는다. 체중을 모르면 느린 쪽만.
 */
export function paceChoices(
  age: number | null,
  goal: GoalKey,
  refKg: number | null
): number[] {
  if (age === null) return [];
  const band = ageBand(age);
  const list = AGE_RULES[band].paces[goal].map((p) => p.kg);
  if (
    band === 'adult' &&
    goal === 'gain' &&
    !(refKg !== null && refKg >= GAIN_FAST_MIN_KG)
  ) {
    const slow = defaultPace(band, goal)?.kg ?? list[0];
    return list.filter((kg) => kg <= slow);
  }
  return list;
}

/**
 * 계산에 쓸 조정(kcal). 저장값을 나이 · 목표의 한도 안으로 당긴다.
 *
 *   어린이 · 생년월일 모름   0
 *   성장기                   0 ~ +200 (내리지 않는다)
 *   성인 증량                −200 ~ +300
 *   성인 유지                0 ~ +300
 *   감량(성장기 · 성인)      0 ~ |목표의 kcal| — 덜 빼는 쪽으로만. 다 올려도 유지만큼이다
 */
export function effectiveAdjust(
  adjust: number | null,
  age: number | null,
  goal: GoalKey,
  deltaKcal: number
) {
  if (age === null) return 0;
  const band = ageBand(age);
  if (band === 'child') return 0;
  const lo = band === 'adult' && goal === 'gain' ? ADJUST_DOWN_ADULT_GAIN : 0;
  const hi = goal === 'lose' ? Math.abs(deltaKcal) : ADJUST_UP[band];
  return Math.min(hi, Math.max(lo, Math.round(adjust ?? 0)));
}
