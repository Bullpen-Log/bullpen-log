import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, type ComponentRef, type RefObject } from 'react';
import { createVideoSwipeLease } from '@/lib/exercise-video-state';
import { AppState, Dimensions, type View } from 'react-native';

/**
 * 운동영상이 화면에서 사라질 때 멈추는 신호(VP01) — 앱에는 DOM 의 IntersectionObserver 가 없다.
 *
 * - 화면 이탈(뒤로 · 다른 화면): expo-router focus 가 풀리면.
 * - 앱이 뒤로 감: AppState 가 active 가 아니면.
 * - 화면 밖으로 굴림: **지금 재생 중인 한 영상만** 1초마다 자기 자리를 재서(measureInWindow) 창과 하나도 겹치지 않으면.
 *   재생이 멈추면 재기를 멈춘다 — 카드마다 상시 타이머를 돌리지 않는다. 부모 시트가 닫혀 해제되면 언마운트 정리가 멈춘다.
 * 돌아와도 저절로 다시 틀지 않는다(호출하는 쪽이 의도를 내린다).
 */
export function useExerciseVideoLifecycle(onLeave: (reason: 'blur' | 'background') => void) {
  const leave = useRef(onLeave);
  useEffect(() => {
    leave.current = onLeave;
  });
  useFocusEffect(
    useCallback(() => {
      return () => leave.current('blur');
    }, [])
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') leave.current('background');
    });
    return () => sub.remove();
  }, []);
}

/** 화면 밖 판정 간격(ms). 재생 중인 한 영상에만 쓴다. */
export const OFFSCREEN_POLL_MS = 1000;

/** 창 안에 보이는 넓이의 비율(0~1) — 순수 계산(시험용으로 내보냄). 크기가 0 · NaN 이면 0. */
export function visibleFraction(r: { x: number; y: number; width: number; height: number }, win: { width: number; height: number }): number {
  if (!(r.width > 0 && r.height > 0) || !Number.isFinite(r.x) || !Number.isFinite(r.y)) return 0;
  const w = Math.max(0, Math.min(r.x + r.width, win.width) - Math.max(r.x, 0));
  const h = Math.max(0, Math.min(r.y + r.height, win.height) - Math.max(r.y, 0));
  return (w * h) / (r.width * r.height);
}

/** 창 영역과 조금이라도 겹치는가. */
export function overlapsWindow(r: { x: number; y: number; width: number; height: number }, win: { width: number; height: number }): boolean {
  return visibleFraction(r, win) > 0;
}

/**
 * minFraction: 자체 영상은 0(완전히 화면 밖일 때만 멈춤), YouTube 는 0.5(스크립트로 재생 · 반복할 때 과반 가시 조건).
 */
export function useOffscreenPause(ref: RefObject<ComponentRef<typeof View> | null>, playing: boolean, onHidden: () => void, minFraction = 0) {
  const hidden = useRef(onHidden);
  useEffect(() => {
    hidden.current = onHidden;
  });
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const v = ref.current;
      if (!v) return;
      v.measureInWindow((x, y, width, height) => {
        if (visibleFraction({ x, y, width, height }, Dimensions.get('window')) <= minFraction) hidden.current();
      });
    }, OFFSCREEN_POLL_MS);
    return () => clearInterval(t);
  }, [playing, ref, minFraction]);
}


// iOS 26 native-stack full-screen pop cancels JS responders. Lease before any touch,
// leaving edge pop / header back and existing gestureEnabled settings untouched.
const swipeLeases = new WeakMap<object, ReturnType<typeof createVideoSwipeLease>>();
export function useExerciseVideoNavigationGuard(enabled: boolean) {
  const navigation = useNavigation();
  useFocusEffect(useCallback(() => {
    if (!enabled) return;
    let lease = swipeLeases.get(navigation);
    if (!lease) {
      lease = createVideoSwipeLease((blocked) => navigation.setOptions({ fullScreenGestureEnabled: blocked ? false : undefined }));
      swipeLeases.set(navigation, lease);
    }
    return lease.acquire();
  }, [navigation, enabled]));
}
