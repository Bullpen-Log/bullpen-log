import { useSyncExternalStore } from 'react';
import type { Country } from '@/lib/country';

/**
 * 지금 계정의 나라(lib/country.ts) — 계정을 물을 때(pitch/api loadMe)마다 바뀐다. 화면은 useCountry, 화면 밖(껍데기의 이동 막기)은 countryNow.
 * 관리자 나라 바꾸기 뒤 다시 물으면 열린 화면들이 곧바로 그 나라 것으로 다시 그려진다. 모르면 한국.
 */
let now: Country = 'kr';
const subs = new Set<() => void>();

export const countryNow = () => now;
export function setCountryNow(c: Country) {
  if (c === now) return;
  now = c;
  subs.forEach((f) => f());
}
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};
export const useCountry = () => useSyncExternalStore(subscribe, countryNow);
