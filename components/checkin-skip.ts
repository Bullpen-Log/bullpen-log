'use client';

/**
 * '오늘은 건너뛰기' — 그날 하루 기억한다(localStorage, 값이 그날 날짜라 다음 날이면 저절로 다시 묻는다). 체크인 관문(components/checkin-gate.tsx)과 새 흐름의
 * 첫 화면(components/checkin-flow/flow.tsx)이 같은 열쇠를 본다 — 흐름에서 건너뛰고 홈으로 오면 관문이 또 열지 않게.
 *
 * 예전엔 이번 접속 동안만(sessionStorage)이었는데, 아이폰 앱은 켤 때마다 새 접속이라 앱을 열 때마다 다시 물었다 — 2026-10-18 김민이
 * 하루 기억으로 바꿨다(관문 머리 주석).
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
    return localStorage.getItem(SKIP_KEY);
  } catch {
    return null;
  }
}
export function writeCheckinSkip(day: string) {
  try {
    localStorage.setItem(SKIP_KEY, day);
  } catch {
    /* 저장을 못 해도 이번 화면에서는 닫힌다 — 부르는 쪽이 제 상태로 들고 있다 */
  }
  listeners.forEach((fn) => fn());
}
