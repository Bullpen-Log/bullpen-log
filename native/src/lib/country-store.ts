import { useSyncExternalStore } from 'react';
import type { Country } from '@/lib/country';
import { rpc } from '~/lib/rpc';
import { BullpenNative } from '../../modules/bullpen-native';

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

/** 앱스토어 계정 나라 — 이 앱 판에 함수가 없으면(옛 앱) · 모르면 null */
export const storefrontCountry = (): Promise<string | null> =>
  BullpenNative.storefrontCountry?.().catch(() => null) ?? Promise.resolve(null);

/*
 * 나라 = 앱스토어 계정 나라(2026-10-28 김민 Q3) — 계정을 물은 뒤 사람마다 앱을 켤 때 한 번 서버에 알린다(app.reportStorefront).
 * 바뀌었으면 저장소를 바꾸고 onChange(웹 틀을 다시 받게). 서버에 못 닿았으면 다음에 다시 묻는다.
 */
let followed: string | null = null;
export async function followStorefront(userId: string, onChange: () => void) {
  if (followed === userId) return;
  const code = await storefrontCountry();
  if (!code) return;
  const r = await rpc<{ ok: true; country: Country; changed: boolean } | { ok: false; error: string }>('app.reportStorefront', code).catch(() => null);
  if (!r?.ok) return;
  followed = userId;
  setCountryNow(r.country);
  if (r.changed) onChange();
}
