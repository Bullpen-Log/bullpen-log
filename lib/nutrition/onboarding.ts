import type { CompetitionLevel } from '@/lib/baseline';
import { ageRule, effectiveProtein } from '@/lib/nutrition/age';
import {
  GOAL_KINDS,
  PROTEIN_PRESET_PER_KG,
  type ActivityKey,
  type GoalKey,
  type GoalKind,
  type MacroPreset,
} from '@/lib/nutrition/meta';

/**
 * 인아웃식 온보딩(docs/designs/inout-onboarding.md ④)의 순수 규칙 — 답이 계산 · 설정을 어떻게 바꾸나.
 *
 * 가입 마법사 · 영양 탭 목표 창 · /nutrition/setup 이 같은 함수를 부른다. DB · 화면을 모른다.
 *
 *   목표 카드 다섯(GOAL_KINDS) → 계산이 읽는 목표 셋(goal) + 체중 1kg 당 단백질(proteinPerKg)로 접는다(foldGoalKind).
 *   계산(lib/nutrition/targets.ts) · 홈 조언(advice.ts) · 나이 규칙(age.ts)은 접은 값만 본다 — 카드 이름이 바뀌어도
 *   어린이 감량 없음 · 성장기 −200 · 미성년 단백질 범위는 그대로 걸린다.
 */

/** 그 나이에 보일 목표 카드 — 어린이는 증량 · 유지, 성장기는 감량 없음(2026-10-08 사용자: 성장기엔 '덜 먹어라' 없음), 성인은 다섯 */
export function goalKindsFor(age: number | null): GoalKind[] {
  const band = ageRule(age).band;
  if (band === 'child') return ['gain', 'maintain'];
  if (band === 'teen') return ['gain', 'muscle', 'maintain'];
  return GOAL_KINDS.map((g) => g.key);
}

/**
 * 목표 카드 → 계산이 읽는 목표 · 단백질.
 *
 *   증량 · 유지 · 감량   그대로, 단백질은 나이 기본(null)
 *   근육 키우기          증량 + 단백질 높임(성인 2.0 · 성장기 · 어린이는 그 나이 범위의 끝값)
 *   군살만 빼기          성인은 감량 + 2.2, 성장기 · 어린이는 유지 + 끝값(빼지 않고 단백질만 높인다)
 */
export function foldGoalKind(
  kind: GoalKind,
  age: number | null
): { goal: GoalKey; proteinPerKg: number | null } {
  const rule = ageRule(age);
  const top = rule.proteinChoices[rule.proteinChoices.length - 1];
  switch (kind) {
    case 'gain':
      return { goal: 'gain', proteinPerKg: null };
    case 'muscle':
      return { goal: 'gain', proteinPerKg: rule.band === 'adult' ? 2.0 : top };
    case 'maintain':
      return { goal: 'maintain', proteinPerKg: null };
    case 'lose':
      return { goal: 'lose', proteinPerKg: null };
    case 'lean':
      return rule.band === 'adult'
        ? { goal: 'lose', proteinPerKg: 2.2 }
        : { goal: 'maintain', proteinPerKg: top };
  }
}

/**
 * 저장된 줄에서 보일 카드 — 카드 원답(goalKind)이 있고 그 나이에 보이는 카드면 그것, 아니면 접은 목표의 카드(옛 줄).
 * 성장기가 감량을 저장해 둔 옛 줄은 '감량' 카드를 그대로 보인다(숨기면 고를 수 없는 값이 저장돼 있게 된다).
 */
export function goalKindOf(
  goal: GoalKey,
  goalKind: GoalKind | null,
  age: number | null
): GoalKind {
  if (goalKind !== null && goalKindsFor(age).includes(goalKind)) return goalKind;
  return goal;
}

/**
 * 소속으로 미리 고르는 평소 움직임(운동을 뺀 하루) — 학교 · 프로는 거의 매일 팀 훈련, 성인리그는 주 몇 번, 사회인은 주로 앉아서.
 * 미리 고르기만 한다 — 저장은 사용자가 고른 값.
 */
export function defaultActivity(level: CompetitionLevel | null): ActivityKey {
  switch (level) {
    case '중학교':
    case '고등학교':
    case '대학교':
    case '프로':
      return 'high';
    case '사회인':
      return 'low';
    case '초등학교':
    case '성인리그':
    default:
      return 'mid';
  }
}

/**
 * 탄단지 프리셋이 '단백질 넉넉히'면 체중 1kg 당 단백질을 2.0 이상으로(나이 범위로 당긴다 — 성장기는 1.8).
 * 다른 프리셋은 손대지 않는다(지방 몫만 다르다 — lib/nutrition/meta.ts MACRO_PRESETS).
 */
export function presetProtein(
  preset: MacroPreset | null,
  perKg: number | null,
  age: number | null
): number | null {
  if (preset !== 'protein') return perKg;
  return effectiveProtein(Math.max(perKg ?? 0, PROTEIN_PRESET_PER_KG), age);
}

/** 목표 카드 밑 한 줄 — 나이마다 다르다(성장기는 단백질 끝값 · 어린이는 +200). 가입 마법사 · 목표 창이 같이 쓴다 */
export function goalKindHint(kind: GoalKind, age: number | null): string {
  const rule = ageRule(age);
  const band = rule.band;
  const top = rule.proteinChoices[rule.proteinChoices.length - 1];
  switch (kind) {
    case 'gain':
      return band === 'child'
        ? '잘 자라게 조금 더 · 하루 +200kcal'
        : band === 'teen'
          ? '몸을 키워요 · 하루 +300kcal'
          : '몸을 키워요 · 하루 +300kcal부터';
    case 'muscle':
      return band === 'adult'
        ? '증량에 단백질 2.0g/kg · 지방보다 근육이 붙게'
        : `증량에 단백질 ${top}g/kg(성장기 최대) · 지방보다 근육이 붙게`;
    case 'maintain':
      return band === 'adult'
        ? '지금 몸으로 시즌을 버텨요'
        : '자라는 만큼 먹으며 시즌을 버텨요';
    case 'lose':
      return '천천히 빼요 · 하루 −300kcal부터';
    case 'lean':
      return '감량에 단백질 2.2g/kg · 힘은 지키고 군살만';
  }
}

/** 운동 전 칼로리 = 4C + 4P + 9F — 탄수화물 g 을 직접 고칠 때 주인은 kcal 이다(탄수 g → kcalTarget) */
export const kcalOfMacros = (carbsG: number, proteinG: number, fatG: number) =>
  Math.round(4 * carbsG + 4 * proteinG + 9 * fatG);

/** 탄단지 열량 비율(%) — 셋의 합이 100 이 되게 지방 칸으로 맞춘다. 칼로리가 0 이면 0 · 0 · 0 */
export function macroSplit(
  carbsG: number,
  proteinG: number,
  fatG: number
): { c: number; p: number; f: number } {
  const total = 4 * carbsG + 4 * proteinG + 9 * fatG;
  if (total <= 0) return { c: 0, p: 0, f: 0 };
  const c = Math.round((400 * carbsG) / total);
  const p = Math.round((400 * proteinG) / total);
  return { c, p, f: Math.max(0, 100 - c - p) };
}
