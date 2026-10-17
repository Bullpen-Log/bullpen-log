import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import type { WeightUnit } from '@/lib/units';

/**
 * 무게 단위 — 웹 설정이 정한 값(앱 저장소 'bullpen-unit-weight', 껍데기가 웹에서 옮겨 둔다). 저장은 늘 kg.
 * 운동 진행(app/workout.tsx) · 영양 통계(app/nutrition/stats.tsx)에 같은 갈고리가 따로 있다 — 셋째(지난 날 기록)부터 여기서 쓴다. 그 둘도 이것으로 바꿔도 된다.
 */
export function useWeightUnit(): WeightUnit {
  const [unit, setUnit] = useState<WeightUnit>('kg');
  useEffect(() => {
    AsyncStorage.getItem('bullpen-unit-weight').then(
      (raw) => {
        const v = raw?.replace(/"/g, '');
        if (v === 'kg' || v === 'lb') setUnit(v);
      },
      () => undefined
    );
  }, []);
  return unit;
}
