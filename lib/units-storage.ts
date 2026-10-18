/**
 * 고른 단위를 이 기기(브라우저 localStorage)에 읽고 쓴다. 계산은 lib/units.ts — 그것을 그대로 다시 내보내
 * 화면은 이 파일 하나만 불러도 된다. 앱(native/)은 이 파일을 쓰지 않고 자기 저장소를 쓴다.
 */
import {
  DEFAULT_LENGTH,
  DEFAULT_SPEED,
  DEFAULT_WEIGHT,
  LENGTH_UNITS,
  SPEED_UNITS,
  WEIGHT_UNITS,
  type LengthUnit,
  type SpeedUnit,
  type WeightUnit,
} from '@/lib/units';

export * from '@/lib/units';

export const LENGTH_KEY = 'bullpen-unit-length';
export const WEIGHT_KEY = 'bullpen-unit-weight';
export const SPEED_KEY = 'bullpen-unit-speed';

/* ── 고른 값 읽고 쓰기 ────────────────────────────────────── */

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return (allowed as readonly string[]).includes(v ?? '') ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

export function readLengthUnit(): LengthUnit {
  return read(
    LENGTH_KEY,
    LENGTH_UNITS.map((u) => u.value),
    DEFAULT_LENGTH
  );
}

export function readWeightUnit(): WeightUnit {
  return read(
    WEIGHT_KEY,
    WEIGHT_UNITS.map((u) => u.value),
    DEFAULT_WEIGHT
  );
}

export function readSpeedUnit(): SpeedUnit {
  return read(
    SPEED_KEY,
    SPEED_UNITS.map((u) => u.value),
    DEFAULT_SPEED
  );
}

/** 서버는 브라우저 저장소를 볼 수 없다. 붙기 전까지는 이 값으로 그린다. */
export function serverLengthUnit(): LengthUnit {
  return DEFAULT_LENGTH;
}
export function serverWeightUnit(): WeightUnit {
  return DEFAULT_WEIGHT;
}
export function serverSpeedUnit(): SpeedUnit {
  return DEFAULT_SPEED;
}

/*
 * 값이 바뀌었을 때 알려줄 곳들.
 *
 * 테마와 같은 방식이다(lib/theme.ts). localStorage 는 리액트 바깥이라 화면이
 * 그 값을 읽으려면 구독이 필요하고, 'storage' 이벤트는 다른 탭에서 바꿨을
 * 때만 오므로 같은 탭에서 바꾼 것은 직접 알린다.
 */
const listeners = new Set<() => void>();

export function subscribeUnits(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function applyLengthUnit(unit: LengthUnit) {
  save(LENGTH_KEY, unit);
}

export function applyWeightUnit(unit: WeightUnit) {
  save(WEIGHT_KEY, unit);
}

export function applySpeedUnit(unit: SpeedUnit) {
  save(SPEED_KEY, unit);
}

function save(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 저장이 막힌 곳에서는 이번 화면에만 적용된다.
  }
  for (const listener of listeners) listener();
}
