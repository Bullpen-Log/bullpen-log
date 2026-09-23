/**
 * 길이와 무게를 어떤 단위로 볼지.
 *
 * 저장은 언제나 cm 과 kg 으로 한다. 단위는 보여줄 때와 입력받을 때만 바꾼다 —
 * DB 에 섞여 들어가면 나중에 어느 줄이 파운드인지 알 수 없게 되고, 부하 계산도
 * 단위를 물어봐야 한다.
 *
 * 고른 값은 브라우저(localStorage)에만 둔다. 테마와 같은 이유다 — 기기마다
 * 다르게 두고 싶을 수 있고, 서버에 넣으려면 DB 를 고쳐야 하는데 이 값 하나
 * 때문에 같이 쓰는 표를 건드릴 일은 아니다.
 */

export const LENGTH_KEY = 'bullpen-unit-length';
export const WEIGHT_KEY = 'bullpen-unit-weight';
export const SPEED_KEY = 'bullpen-unit-speed';

export const LENGTH_UNITS = [
  { value: 'cm', label: 'cm', hint: '센티미터' },
  { value: 'in', label: 'inch', hint: '인치' },
] as const;

export const WEIGHT_UNITS = [
  { value: 'kg', label: 'kg', hint: '킬로그램' },
  { value: 'lb', label: 'lb', hint: '파운드' },
] as const;

/**
 * 구속 단위.
 *
 * 한국에서는 km/h 로 말하지만 미국 중계와 스카우트 자료는 mph 다. 유튜브에서
 * 본 '95마일'이 몇 km/h 인지 매번 머리로 셈하지 않아도 되게 둔다.
 */
export const SPEED_UNITS = [
  { value: 'kmh', label: 'km/h', hint: '시속 킬로미터' },
  { value: 'mph', label: 'mph', hint: '시속 마일' },
] as const;

export type LengthUnit = (typeof LENGTH_UNITS)[number]['value'];
export type WeightUnit = (typeof WEIGHT_UNITS)[number]['value'];
export type SpeedUnit = (typeof SPEED_UNITS)[number]['value'];

export const DEFAULT_LENGTH: LengthUnit = 'cm';
export const DEFAULT_WEIGHT: WeightUnit = 'kg';
export const DEFAULT_SPEED: SpeedUnit = 'kmh';

const CM_PER_INCH = 2.54;
const KG_PER_LB = 0.45359237;
const KMH_PER_MPH = 1.609344;

/* ── 값 바꾸기 ────────────────────────────────────────────── */

/** 저장된 값(cm) → 보여줄 값 */
export function toLength(cm: number, unit: LengthUnit) {
  return unit === 'in' ? cm / CM_PER_INCH : cm;
}

/** 입력받은 값 → 저장할 값(cm) */
export function fromLength(value: number, unit: LengthUnit) {
  return unit === 'in' ? value * CM_PER_INCH : value;
}

/** 저장된 값(kg) → 보여줄 값 */
export function toWeight(kg: number, unit: WeightUnit) {
  return unit === 'lb' ? kg / KG_PER_LB : kg;
}

/** 입력받은 값 → 저장할 값(kg) */
export function fromWeight(value: number, unit: WeightUnit) {
  return unit === 'lb' ? value * KG_PER_LB : value;
}

/** 저장된 값(km/h) → 보여줄 값 */
export function toSpeed(kmh: number, unit: SpeedUnit) {
  return unit === 'mph' ? kmh / KMH_PER_MPH : kmh;
}

/** 입력받은 값 → 저장할 값(km/h) */
export function fromSpeed(value: number, unit: SpeedUnit) {
  return unit === 'mph' ? value * KMH_PER_MPH : value;
}

/**
 * 보여줄 숫자로 다듬는다.
 *
 * 소수 첫째 자리까지 두되 .0 은 떼어낸다. 60kg 을 '132.3lb'로 보여주는 것은
 * 맞지만 '60.0kg'은 군더더기다.
 */
export function round1(n: number) {
  return Number(n.toFixed(1));
}

/** '132.3lb' 처럼 단위를 붙여 적는다. 값이 없으면 null */
export function formatWeight(kg: number | null | undefined, unit: WeightUnit) {
  if (kg == null) return null;
  return `${round1(toWeight(kg, unit))}${unit}`;
}

/**
 * '95.3mph' 처럼 단위를 붙여 적는다. 값이 없으면 null.
 *
 * 소수 한 자리까지 보여준다. 스피드건에 따라 소수를 읽어 주는 것이 있고,
 * 무엇보다 단위를 바꾸면 딱 떨어지던 값이 소수가 된다 — 145km/h 를 정수로
 * 반올림해 90mph 로 보여주면, 되돌렸을 때 145 가 아니라 144.8 이 되어
 * 사용자가 적은 적 없는 숫자가 화면에 남는다.
 *
 * .0 은 떼어낸다. '140.0km/h'는 군더더기다(round1).
 */
export function formatSpeed(kmh: number | null | undefined, unit: SpeedUnit) {
  if (kmh == null) return null;
  return `${round1(toSpeed(kmh, unit))}${unit === 'mph' ? 'mph' : 'km/h'}`;
}

/** 단위 이름만 — 칸 제목에 붙일 때 쓴다 */
export function speedLabel(unit: SpeedUnit) {
  return unit === 'mph' ? 'mph' : 'km/h';
}

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
