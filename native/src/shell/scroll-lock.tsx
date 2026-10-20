import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * 3D 웹뷰(근육 그림 · 3D 동작 분석)를 만지는 동안 둘레 화면 스크롤을 멈춘다 — 손가락이 3D 를 돌리는데 바깥 ScrollView 도 같이
 * 끌려 화면 전체가 움직였다(2026-10-20 김민). 3D 칸은 손가락이 닿으면 lock(true), 떼면 lock(false). 스크롤 칸은 ScrollLockScope 로
 * 감싸고 scrollEnabled={!locked}. 감싸지 않은 곳에선 아무 일도 안 한다.
 */
const Lock = createContext<(locked: boolean) => void>(() => {});

export function useScrollLock() {
  return useContext(Lock);
}

/** children 에 scrollEnabled 값을 넘긴다 — <ScrollLockScope>{(enabled) => <ScrollView scrollEnabled={enabled} … />}</ScrollLockScope> */
export function ScrollLockScope({ children }: { children: (scrollEnabled: boolean) => ReactNode }) {
  const [locked, setLocked] = useState(false);
  return <Lock.Provider value={setLocked}>{children(!locked)}</Lock.Provider>;
}

/** 3D 칸 껍데기에 붙일 손가락 알림 */
export function useGrabProps() {
  const lock = useScrollLock();
  return {
    onTouchStart: () => lock(true),
    onTouchEnd: () => lock(false),
    onTouchCancel: () => lock(false),
  };
}
