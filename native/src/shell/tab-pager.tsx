import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { usePalette } from '~/lib/ui';
import { lastWriteAt } from '~/lib/rpc';
import { beginMotion, endMotion, whenStill } from '~/shell/transition';
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

/**
 * 탭 판 넘기기 — 웹 components/tab-pager.tsx 와 같다: 탭 넷(홈 · 투구 · 트레이닝 · 영양)을 가로로 나란히 두고, 탭을 옮기면 트랙이
 * 240ms cubic-bezier(0.32,0.72,0,1) 로 미끄러진다. 한 번 연 판은 붙여 둬서 판마다 굴린 자리가 남는다(예전엔 탭을 옮길 때마다 새로 그려
 * 맨 위로 돌아갔다). 지금 탭이 웹 화면(첫 설정 · 하위 화면)이면 트랙을 숨겨 밑의 웹이 보인다 — 그때는 움직임 없이 바로.
 * 판 안의 화면은 useOnTabActive 로 '다시 보이게 될 때' 새로 받는다(붙어 있으니 마운트로는 안 받는다).
 */
const ActiveCtx = createContext(true);

/** 이 판이 지금 보이는가 */
export const useTabActive = () => useContext(ActiveCtx);

/*
 * 탭을 금방 다시 보면 새로 받지 않는 시간 — 웹 next.config.ts staleTimes.dynamic(30초)과 같다. 탭을 오갈 때마다 홈이 서버 동작 다섯을
 * 부르고 그 안에 무거운 계산(오늘 상태 · 추천)이 있어 Vercel 계산 시간의 대부분이 여기서 나갔다(2026-10-21, 무료 한도 4시간의 81%).
 * 그사이 어디서든 서버에 썼으면(lib/rpc markWrite) 바로 받는다.
 */
const STALE_MS = 30_000;

/**
 * 판이 숨었다가 다시 보일 때 — 처음 붙을 때는 안 부른다(그때는 화면이 스스로 받는다). 30초 안 · 쓴 것 없음이면 건너뛴다.
 * 판이 미끄러져 다 들어온 뒤에 받는다(2026-10-26 2차 — 예전엔 보이자마자 받아, 받은 값을 그리는 일이 미끄러짐과 겹쳤다). 그 사이 다른 탭으로
 * 옮기면 그만둔다(받지 않은 채로 남아 다음에 보일 때 받는다).
 */
export function useOnTabActive(cb: () => void) {
  const active = useTabActive();
  const was = useRef(active);
  const latest = useRef(cb);
  const ranAt = useRef(0);
  useEffect(() => {
    latest.current = cb;
    if (ranAt.current === 0) ranAt.current = Date.now();
  });
  useEffect(() => {
    const back = active && !was.current;
    was.current = active;
    if (!back || (Date.now() - ranAt.current < STALE_MS && lastWriteAt() <= ranAt.current)) return;
    return whenStill(() => {
      ranAt.current = Date.now();
      latest.current();
    });
  }, [active]);
}

/*
 * 위에 쌓인 앱 화면(체크인 · 투구 기록 · 운동 · 설정 · 더보기)을 닫고 돌아올 때 — 판 넷이 다 붙어 있어 예전엔 닫을 때마다 넷이 함께 서버를
 * 4~6번 불렀고, 그것도 닫히는 움직임 한가운데였다(뒤로 쓸 때 끊기고 닫힌 뒤 홈이 튐, 2026-10-24 전체 검토). 이제 보이는 판만, 30초 안 ·
 * 쓴 것 없음이면 건너뛰고, 닫히는 움직임이 끝난 뒤에 받는다 — 끝은 화면 넘김 알림으로 본다(shell/transition.ts whenStill, 예전엔 400ms 어림).
 * 뒤로 쓸다 그만두면 돌아온 것(focus)이 아니라 부르지 않는다. first 면 처음 붙을 때도 받는다(그 화면이 스스로 안 받을 때).
 */
export function useFocusRefresh(cb: () => void, { first = false }: { first?: boolean } = {}) {
  const active = useTabActive();
  const latest = useRef(cb);
  const ranAt = useRef(0);
  const seen = useRef(false);
  const activeRef = useRef(active);
  useEffect(() => {
    latest.current = cb;
    activeRef.current = active;
  });
  useFocusEffect(
    useCallback(() => {
      const firstTime = !seen.current;
      seen.current = true;
      if (firstTime) {
        if (!first) ranAt.current = Date.now();
        else {
          ranAt.current = Date.now();
          latest.current();
        }
        return;
      }
      if (!activeRef.current || (Date.now() - ranAt.current < STALE_MS && lastWriteAt() <= ranAt.current)) return;
      return whenStill(() => {
        ranAt.current = Date.now();
        latest.current();
      });
    }, [first])
  );
}

/*
 * 지금 탭을 다시 누름 — 그 탭의 첫 화면을 맨 위로(웹 mobile-tabs onClick). 보이는 판만 듣는다(useRetapTop).
 */
const retaps = new Set<() => void>();
export const emitRetap = () => retaps.forEach((f) => f());
/** 판 안의 ScrollView 를 맨 위로 굴리게 — ref 의 scrollTo 를 부른다 */
export function useRetapTop(scrollTo: () => void) {
  const active = useTabActive();
  const latest = useRef(scrollTo);
  useEffect(() => {
    latest.current = scrollTo;
  });
  useEffect(() => {
    if (!active) return;
    const f = () => latest.current();
    retaps.add(f);
    return () => {
      retaps.delete(f);
    };
  }, [active]);
}

const EASE = Easing.bezier(0.32, 0.72, 0, 1);

/*
 * 판 옮기기(2026-10-26 2차 정리):
 * - 옆 판으로: 트랙이 240ms 에 미끄러진다(웹 tab-pager 와 같다).
 * - 둘 넘게 떨어진 판으로(하단 탭을 바로 누름): 바로 바꾼다 — 240ms 에 트랙 전체를 밀면 사이 판이 휙 지나가 보였다(iOS 탭 막대도 바로 바꾼다).
 * - 웹 화면 ↔ 앱 판: 판 전체가 짧게 옅어지며 바뀐다(웹은 새 주소를 다 그린 뒤에 드러나므로 옛 화면이 비치지 않는다).
 * 움직이는 동안은 shell/transition 에 적어, 새로 받기 · 판 붙이기 · 영상 재생기가 끝난 뒤에 돈다. 동작 줄이기면 모두 바로.
 */
const FADE_MS = 160;
const endSlide = () => endMotion('pager');
const endFade = () => endMotion('pager-fade');

export function TabPager({ index, visible, slots }: { index: number; visible: boolean; slots: (ReactNode | null)[] }) {
  const { width } = useWindowDimensions();
  const c = usePalette();
  const reduce = useReducedMotion();
  const x = useSharedValue(-index * width);
  const shown = useSharedValue(visible ? 1 : 0);
  const before = useRef({ index, visible, width });
  useEffect(() => {
    const b = before.current;
    before.current = { index, visible, width };
    const target = -index * width;
    const slide = b.visible && visible && b.width === width && !reduce && Math.abs(b.index - index) === 1;
    if (slide) {
      beginMotion('pager');
      x.value = withTiming(target, { duration: 240, easing: EASE }, (done) => {
        if (done) runOnJS(endSlide)();
      });
    } else {
      x.value = target;
      endSlide();
    }
    if (b.visible !== visible && !reduce) {
      beginMotion('pager-fade');
      shown.value = withTiming(visible ? 1 : 0, { duration: FADE_MS, easing: Easing.out(Easing.quad) }, (done) => {
        if (done) runOnJS(endFade)();
      });
    } else if (b.visible !== visible || reduce) {
      shown.value = visible ? 1 : 0;
      endFade();
    }
  }, [index, visible, width, reduce, x, shown]);
  const track = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const fade = useAnimatedStyle(() => ({ opacity: shown.value }));
  return (
    <Animated.View pointerEvents={visible ? 'box-none' : 'none'} style={[StyleSheet.absoluteFill, fade]}>
      <Animated.View style={[styles.track, { width: width * slots.length }, track]}>
        {slots.map((s, i) => (
          /* 아직 안 붙은 판은 바탕색 판 — 밑의 웹이 비치지 않게 */
          <View key={i} style={{ width, height: '100%', backgroundColor: s ? undefined : c.page }} pointerEvents={visible && i === index ? 'box-none' : 'none'}>
            <ActiveCtx.Provider value={visible && i === index}>{s}</ActiveCtx.Provider>
          </View>
        ))}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: { position: 'absolute', top: 0, bottom: 0, left: 0, flexDirection: 'row' },
});
