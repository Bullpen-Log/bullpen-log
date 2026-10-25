import { useRoute } from 'expo-router';
import { useEffect, useState } from 'react';

/**
 * 화면이 움직이는 중인가 — 무거운 일(새로 받기 · 판 붙이기 · 영상 재생기)을 움직임이 끝난 뒤로 미루려고 한곳에 모은다.
 * - 쌓인 화면: 뿌리 Stack(_layout.tsx)의 screenListeners 가 화면마다 넘김 알림을 적는다(transitionStart · transitionEnd — react-native-screens 의
 *   willAppear · willDisappear · appear · disappear, gestureCancel — 뒤로 쓸다 그만둠).
 * - 앱이 직접 움직이는 것: 탭 판 미끄러짐(shell/tab-pager.tsx) · 더보기 폴더(app/more.tsx)가 beginMotion · endMotion 으로 적는다.
 *
 * '끝났다'를 시간으로 어림하지 않는다(2026-10-26 2차 점검 — 첫 판은 1초가 지나면 넘김 중이어도 실행해, 천천히 뒤로 쓰는 동안 새로 받기가 돌았다):
 * - 시작 알림을 받은 움직임은 끝(또는 취소) 알림까지 기다린다. 천천히 쓰는 손가락 · 이어지는 넘김도 그동안은 움직이는 중이다.
 * - 알림이 하나도 안 오면(알림 없는 화면 넘김 · 옛 앱) 잠깐(grace) 기다려 보고 실행한다.
 * - 끝 알림을 잃은 것(앱 버그)만 STUCK_MS 뒤 잊는다 — react-native-screens 는 willX 뒤에 didX 를 늘 짝지어 보내므로 정상이면 이 선에 닿지 않는다.
 *   손가락으로 4초 넘게 쓰다 멈춰 있으면 그때부터는 움직이지 않는 것으로 본다(알림 누락과 가를 길이 없다).
 */
const moving = new Map<string, number>();
const appeared = new Set<string>();
const subs = new Set<() => void>();
const STUCK_MS = 4000;

const notify = () => subs.forEach((f) => f());

/** 쌓인 화면의 넘김 알림 — kind 'cancel' 은 뒤로 쓸다 그만둠(그 화면은 그대로 위에 있다) */
export function noteTransition(key: string, kind: 'start' | 'end' | 'cancel', closing = false) {
  if (kind === 'start') moving.set(key, Date.now());
  else {
    moving.delete(key);
    if (kind === 'end') {
      if (closing) appeared.delete(key);
      else appeared.add(key);
    }
  }
  notify();
}

/** 앱이 직접 움직이는 것(탭 판 · 더보기 폴더) — 같은 이름으로 다시 시작하면 앞의 것을 잇는다 */
export const beginMotion = (name: string) => noteTransition(`motion:${name}`, 'start');
export const endMotion = (name: string) => noteTransition(`motion:${name}`, 'cancel');

/** 끝 알림을 잃은 것을 잊고, 아직 움직이는 것이 있으면 가장 먼저 잊을 때까지 남은 ms(없으면 0) */
function stillFor(): number {
  const t = Date.now();
  let next = 0;
  for (const [k, at] of moving) {
    const left = at + STUCK_MS - t;
    if (left <= 0) moving.delete(k);
    else next = next === 0 ? left : Math.min(next, left);
  }
  return next;
}

/** 지금 무엇이든 움직이는 중인가 */
export const stackMoving = (): boolean => stillFor() > 0;

/**
 * 움직임이 멈추면 한 번 부른다. 넘김 알림은 그리기 뒤에 와서 — 뒤로 단추로 닫으면 '돌아왔다(focus)'가 움직임 알림보다 먼저 온다 — 처음 grace 만큼은
 * 알림을 기다려 본다. 돌려준 함수로 그만둔다(빨리 다른 탭으로 옮기면 앞의 것을 버린다).
 */
export function whenStill(cb: () => void, { grace = 120 }: { grace?: number } = {}): () => void {
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    done = true;
    clearTimeout(timer);
    subs.delete(check);
  };
  function check() {
    if (done) return;
    clearTimeout(timer);
    const left = stillFor();
    if (left === 0) {
      stop();
      cb();
      return;
    }
    /* 움직이는 중 — 끝 알림이 오면 subs 가 다시 부른다. 끝 알림을 잃었을 때만 그 시각에 다시 본다 */
    timer = setTimeout(check, left);
  }
  timer = setTimeout(() => {
    subs.add(check);
    check();
  }, grace);
  return stop;
}

/**
 * 서버 답을 화면에 그리는 일 — 움직이는 중이면 끝난 뒤에(넘어가는 동안 큰 목록을 그리면 끊겼다, 2026-10-26 2차). 멈춰 있으면 곧바로(다음 틱).
 */
export const afterMotion = (apply: () => void) => whenStill(apply, { grace: 0 });

/**
 * 이 화면이 다 올라왔나 — 그날 창처럼 올라오는 화면에서 무거운 것(영상 재생기 · 긴 폼)을 움직임이 끝난 뒤에 그리게. 이미 올라와 있던 화면에서
 * 뒤늦게 붙은 부품은 바로 true. 이 화면의 넘김 알림이 cap 안에 하나도 안 오면(옛 앱 · 알림 없는 넘김) 그때 true — 알림이 왔으면(넘어가는 중)
 * 시간으로 끊지 않고 끝을 기다린다(예전엔 0.7초가 지나면 넘어가는 중에도 그렸다).
 */
export function useScreenSettled(cap = 700): boolean {
  const key = useRoute().key;
  const [settled, setSettled] = useState(() => key != null && appeared.has(key) && !moving.has(key));
  useEffect(() => {
    if (settled) return;
    const check = () => {
      if (key == null) return;
      stillFor();
      if (appeared.has(key) && !moving.has(key)) setSettled(true);
    };
    subs.add(check);
    check();
    /* 알림이 없었으면 cap 에 끝, 넘어가는 중이면 끝 알림을(잃었으면 그 선까지) 기다린다 */
    let t: ReturnType<typeof setTimeout>;
    const late = () => {
      const left = stillFor();
      if (key == null || !moving.has(key)) setSettled(true);
      else t = setTimeout(late, left);
    };
    t = setTimeout(late, cap);
    return () => {
      subs.delete(check);
      clearTimeout(t);
    };
  }, [settled, key, cap]);
  return settled;
}
