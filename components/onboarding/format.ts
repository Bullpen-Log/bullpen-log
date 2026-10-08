import { round1, toWeight, type WeightUnit } from '@/lib/units';

/**
 * 온보딩 글 속의 몸무게 · 속도 — 저장은 kg, 보이는 것은 고른 단위(lib/units.ts).
 *
 * 속도는 kg 이면 둘째 자리까지(0.25 · 0.35 는 0.05 단위라 첫째 자리로 줄이면 둘이 같은 '0.3'이 된다),
 * lb 면 첫째 자리까지 — lib/nutrition/weight-goal.ts fmtRate 와 같은 규칙.
 */
export function kgText(kg: number, unit: WeightUnit) {
  return `${round1(toWeight(kg, unit))}${unit}`;
}

export function paceText(kgPerWeek: number, unit: WeightUnit) {
  const n =
    unit === 'kg' ? Number(kgPerWeek.toFixed(2)) : round1(toWeight(kgPerWeek, unit));
  return `주 ${n}${unit}`;
}
