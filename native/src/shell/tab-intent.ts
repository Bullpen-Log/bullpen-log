import { useEffect, useRef } from 'react';

/**
 * 다른 탭의 날짜를 열어 달라는 부탁 — 웹은 주소(?date=)로 넘기지만 앱 탭은 판이 늘 붙어 있어 주소가 없다.
 * 홈 그날 칸의 '영양 탭에서 자세히'(그날 영양) · '투구 탭에서 보기'(투구 달력 그날 칸을 연 채로) · 홈 '이번 주'의 날짜(기록 탭의 그날)가 쓴다.
 * 부탁은 받는 탭이 아직 안 붙었으면 남겨 두었다가 붙을 때 꺼낸다.
 */
type Tab = 'nutrition' | 'pitch' | 'records';
const pending = new Map<Tab, string>();
const listeners = new Map<Tab, Set<(date: string) => void>>();

export function openTabAt(tab: Tab, date: string) {
  const ls = listeners.get(tab);
  if (ls?.size) ls.forEach((l) => l(date));
  else pending.set(tab, date);
}

export function useTabIntent(tab: Tab, cb: (date: string) => void) {
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  });
  useEffect(() => {
    const l = (d: string) => ref.current(d);
    const set = listeners.get(tab) ?? new Set();
    set.add(l);
    listeners.set(tab, set);
    const left = pending.get(tab);
    if (left) {
      pending.delete(tab);
      l(left);
    }
    return () => {
      set.delete(l);
    };
  }, [tab]);
}
