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
};

export const AGE_RULES: Record<AgeBand, AgeRule> = {
  child: {
    band: 'child',
    label: '어린이(만 12세 이하)',
    proteinChoices: [1.2, 1.4, 1.5],
    proteinDefault: 1.2,
    goalDelta: { gain: 200, maintain: 0, lose: null },
    goalHint: {
      gain: '잘 자라게 조금 더 · 하루 +200kcal',
      maintain: '자라는 만큼 먹는다',
      lose: '어린이는 감량을 고를 수 없어요 — 필요하면 소아청소년과와 상의하세요',
    },
    bmrName: 'Schofield 식 · 어린이와 청소년용',
  },
  teen: {
    band: 'teen',
    label: '성장기(만 13~17세)',
    proteinChoices: [1.3, 1.5, 1.6, 1.8],
    proteinDefault: 1.5,
    goalDelta: { gain: 300, maintain: 0, lose: -200 },
    goalHint: {
      gain: '몸을 키운다 · 하루 +300kcal',
      maintain: '자라는 만큼 먹으며 시즌을 버틴다',
      lose: '성장기라 아주 천천히 · 하루 −200kcal',
    },
    bmrName: 'Schofield 식 · 어린이와 청소년용',
  },
  adult: {
    band: 'adult',
    label: '성인(만 18세 이상)',
    proteinChoices: [1.6, 1.8, 2.0, 2.2],
    proteinDefault: 1.8,
    goalDelta: { gain: 300, maintain: 0, lose: -400 },
    goalHint: {
      gain: '몸을 키운다 · 하루 +300kcal',
      maintain: '지금 몸으로 시즌을 버틴다',
      lose: '천천히 뺀다 · 하루 −400kcal',
    },
    bmrName: 'Mifflin-St Jeor 식',
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
