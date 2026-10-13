'use client';

/**
 * '오늘은 건너뛰기' — 이번 접속 동안만 기억한다(sessionStorage). 체크인 관문(components/checkin-gate.tsx)과 새 흐름의
 * 첫 화면(components/checkin-flow/flow.tsx)이 같은 열쇠를 본다 — 흐름에서 건너뛰고 홈으로 오면 관문이 또 열지 않게.
 *
 * 하루 종일 기억하지 않는 까닭은 관문 머리 주석에 — 한 번 건너뛴 날은 끝내 체크인을 안 하게 된다.
 */
const SKIP_KEY = 'bullpen-checkin-skip';

const listeners = new Set<() => void>();
export function subscribeCheckinSkip(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}
export function readCheckinSkip(): string | null {
  try {
    return sessionStorage.getItem(SKIP_KEY);
  } catch {
    return null;
  }
}
export function writeCheckinSkip(day: string) {
  try {
    sessionStorage.setItem(SKIP_KEY, day);
  } catch {
    /* 저장을 못 해도 이번 화면에서는 닫힌다 — 부르는 쪽이 제 상태로 들고 있다 */
  }
  listeners.forEach((fn) => fn());
}
