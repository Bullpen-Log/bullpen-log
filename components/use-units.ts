'use client';

import { useSyncExternalStore } from 'react';
import {
  readLengthUnit,
  readSpeedUnit,
  readWeightUnit,
  serverLengthUnit,
  serverSpeedUnit,
  serverWeightUnit,
  subscribeUnits,
} from '@/lib/units';

/**
 * 지금 고른 단위를 읽는 갈고리 셋.
 *
 * 값이 localStorage 에 있어서 서버는 알 수가 없다. useSyncExternalStore 로
 * 읽으면 서버가 그릴 때와 화면에 붙는 순간에는 기본값(cm·kg·km/h)을 쓰고,
 * 붙고 난 뒤 진짜 값으로 바꿔 그린다 — 서버가 그린 것과 달라졌다는 경고가
 * 나지 않는 유일한 방법이다.
 *
 * 화면마다 이 세 줄을 다시 쓰지 않으려고 모아 둔다. lib/units.ts 에 두지 않는
 * 것은 그 파일을 서버 코드도 읽기 때문이다 — 갈고리는 화면 쪽에만 있어야 한다.
 */
export function useLengthUnit() {
  return useSyncExternalStore(subscribeUnits, readLengthUnit, serverLengthUnit);
}

export function useWeightUnit() {
  return useSyncExternalStore(subscribeUnits, readWeightUnit, serverWeightUnit);
}

export function useSpeedUnit() {
  return useSyncExternalStore(subscribeUnits, readSpeedUnit, serverSpeedUnit);
}
