import type { WeightUnit } from '@/lib/units';
import { usePrefs } from '~/lib/prefs';

/** 무게 단위 — 설정(웹과 같은 값, ~/lib/prefs). 저장은 늘 kg. */
export function useWeightUnit(): WeightUnit {
  return usePrefs().weight;
}
