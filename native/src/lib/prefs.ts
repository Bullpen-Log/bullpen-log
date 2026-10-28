import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import {
  DEFAULT_LENGTH,
  DEFAULT_SPEED,
  DEFAULT_WEIGHT,
  defaultUnits,
  LENGTH_UNITS,
  SPEED_UNITS,
  WEIGHT_UNITS,
  type LengthUnit,
  type SpeedUnit,
  type WeightUnit,
} from '@/lib/units';

/**
 * 앱 설정 — 화면 테마 · 길이 · 무게 · 구속 단위. 웹(lib/theme.ts · lib/units-storage.ts)과 같은 열쇠 · 같은 값(글자 그대로)으로 앱 저장소에 둔다.
 * 웹 값은 껍데기(index.tsx)가 웹뷰를 열 때마다 옮겨 오고(reloadPrefs), 앱 설정 화면(app/settings.tsx)에서 바꾸면 웹에도 칠한다(onPrefsChange →
 * 껍데기가 window.__bpPrefs). 그래서 앱 화면과 웹 화면의 테마 · 단위가 늘 같다.
 */
export const THEME_OPTIONS = [
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
  { value: 'navy', label: '네이비' },
  { value: 'system', label: '자동' },
] as const;
export type ThemeChoice = (typeof THEME_OPTIONS)[number]['value'];

export type Prefs = { theme: ThemeChoice; length: LengthUnit; weight: WeightUnit; speed: SpeedUnit };

/* 웹 열쇠와 같다 — lib/theme.ts THEME_STORAGE_KEY · lib/units-storage.ts LENGTH_KEY · WEIGHT_KEY · SPEED_KEY */
export const PREF_KEYS: Record<keyof Prefs, string> = {
  theme: 'bullpen-theme',
  length: 'bullpen-unit-length',
  weight: 'bullpen-unit-weight',
  speed: 'bullpen-unit-speed',
};
const ALLOWED: Record<keyof Prefs, readonly { value: string }[]> = {
  theme: THEME_OPTIONS,
  length: LENGTH_UNITS,
  weight: WEIGHT_UNITS,
  speed: SPEED_UNITS,
};
/* 웹과 같은 기본값 — 테마는 자동(lib/theme.ts DEFAULT_THEME): 고른 적 없으면 폰 밝기를 따른다(2026-10-27 HIG 검토 — 예전 기본값 라이트는 다크 모드 폰에서도 흰 앱이었다) */
const DEFAULTS: Prefs = { theme: 'system', length: DEFAULT_LENGTH, weight: DEFAULT_WEIGHT, speed: DEFAULT_SPEED };

let prefs: Prefs = DEFAULTS;
const subs = new Set<() => void>();
const pushers = new Set<(p: Partial<Prefs>) => void>();
const emit = () => subs.forEach((f) => f());

/** 앱 저장소에서 다시 읽는다 — 앱을 켤 때 · 웹 값을 옮겨 온 뒤 */
export async function reloadPrefs(): Promise<void> {
  const next = { ...DEFAULTS };
  for (const key of Object.keys(PREF_KEYS) as (keyof Prefs)[]) {
    try {
      const raw = (await AsyncStorage.getItem(PREF_KEYS[key]))?.replace(/"/g, '');
      if (raw && ALLOWED[key].some((o) => o.value === raw)) (next as Record<string, string>)[key] = raw;
    } catch {
      /* 못 읽으면 기본값 */
    }
  }
  if ((Object.keys(next) as (keyof Prefs)[]).some((k) => next[k] !== prefs[k])) {
    prefs = next;
    emit();
  }
}
/** 지금 값 — 약속(prefsReady)을 기다린 뒤 그때의 값을 볼 때 */
export const currentPrefs = () => prefs;

/** 앱을 켤 때 처음 읽기 — 끝나기 전엔 테마가 기본값(자동)이라, 시작 연출 · 시작 화면 테마는 이걸 기다린다 */
export const prefsReady: Promise<void> = reloadPrefs();

/** 앱 설정 화면에서 고르면 — 바로 그리고, 앱 저장소에 두고, 웹에도 칠한다 */
export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  if (prefs[key] === value) return;
  prefs = { ...prefs, [key]: value };
  emit();
  void AsyncStorage.setItem(PREF_KEYS[key], value).catch(() => undefined);
  pushers.forEach((f) => f({ [key]: value }));
}

/**
 * 나라 기본 단위(lib/units.ts defaultUnits — 미국 mph · lb · inch) — 고른 적 없는 단위만 그 나라 값으로 둔다. 둔 값은 고른 것처럼 앱 저장소에
 * 남고 웹에도 칠해진다(setPref) — 그 뒤 설정에서 바꾸면 그 값이 이긴다. 한국 · 일본은 기본이 같아 아무것도 안 한다.
 */
export async function applyCountryUnits(country: string) {
  const want = defaultUnits(country);
  await prefsReady;
  for (const key of ['length', 'weight', 'speed'] as const) {
    const stored = await AsyncStorage.getItem(PREF_KEYS[key]).catch(() => 'unknown');
    if (!stored) setPref(key, want[key]);
  }
}

/** 껍데기가 웹에 칠하는 곳을 건다 */
export function onPrefsChange(f: (p: Partial<Prefs>) => void) {
  pushers.add(f);
  return () => {
    pushers.delete(f);
  };
}

export const usePrefs = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => prefs
  );
