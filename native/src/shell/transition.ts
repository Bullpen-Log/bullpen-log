import { useRoute } from 'expo-router';
import { useEffect, useState } from 'react';

/**
 * 쌓인 화면이 움직이는 중인가 — 뿌리 Stack(_layout.tsx)의 screenListeners 가 화면마다 넘김 알림(transitionStart · transitionEnd —
 * react-native-screens 의 willAppear · willDisappear · appear · disappear)을 여기 적는다. '움직임이 끝난 뒤'를 고정 시간(그날 화면 350ms ·
 * 돌아올 때 400ms)으로 어림하던 것을 실제 끝 알림으로 본다(2026-10-25 화면 전환 점검).
 * 뒤로 쓸다 그만두어도 화면마다 끝 알림이 온다(가려지던 화면은 disappear, 맨 위 화면은 appear). 끝 알림을 놓친 화면은 STUCK_MS 뒤 잊는다.
 */
const moving = new Map<string, number>();
const appeared = new Set<string>();
const subs = new Set<() => void>();
const STUCK_MS = 1500;

export function noteTransition(key: string, kind: 'start' | 'end', closing: boolean) {
  if (kind === 'start') moving.set(key, Date.now());
  else {
    moving.delete(key);
    if (closing) appeared.delete(key);
    else appeared.add(key);
  }
  subs.forEach((f) => f());
}

/** 지금 어느 화면이든 넘어가는 중인가 */
export function stackMoving(): boolean {
  const t = Date.now();
  for (const [k, at] of moving) if (t - at > STUCK_MS) moving.delete(k);
  return moving.size > 0;
}

/**
 * 화면이 멈추면 한 번 부른다(늦어도 cap 뒤). 넘김 알림은 그리기 뒤에 와서 — 뒤로 단추로 닫으면 '돌아왔다(focus)'가 움직임 알림보다 먼저 온다 —
 * 처음 grace 만큼은 알림을 기다려 본다. 돌려준 함수로 그만둔다.
 */
export function whenStill(cb: () => void, { grace = 120, cap = 1000 }: { grace?: number; cap?: number } = {}): () => void {
  let done = false;
  const stop = () => {
    clearTimeout(g);
    clearTimeout(c);
    subs.delete(check);
  };
  const finish = () => {
    if (done) return;
    done = true;
    stop();
    cb();
  };
  const check = () => {
    if (!stackMoving()) finish();
  };
  const g = setTimeout(() => {
    subs.add(check);
    check();
  }, grace);
  const c = setTimeout(finish, cap);
  return () => {
    done = true;
    stop();
  };
}

/**
 * 이 화면이 다 올라왔나 — 그날 창처럼 올라오는 화면에서 무거운 것(영상 재생기 · 긴 폼)을 움직임이 끝난 뒤에 그리게. 이미 올라와 있던 화면에서
 * 뒤늦게 붙은 부품은 바로 true. 알림이 안 오는 경우(옛 앱 · 알림 없는 화면 넘김)는 cap 뒤 true.
 */
export function useScreenSettled(cap = 700): boolean {
  const key = useRoute().key;
  const [settled, setSettled] = useState(() => key != null && appeared.has(key) && !moving.has(key));
  useEffect(() => {
    if (settled) return;
    const check = () => {
      if (key != null && appeared.has(key) && !moving.has(key)) setSettled(true);
    };
    subs.add(check);
    check();
    const t = setTimeout(() => setSettled(true), cap);
    return () => {
      subs.delete(check);
      clearTimeout(t);
    };
  }, [settled, key, cap]);
  return settled;
}
