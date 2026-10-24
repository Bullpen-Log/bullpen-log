import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { usePalette } from '~/lib/ui';
import { lastWriteAt } from '~/lib/rpc';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

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

/** 판이 숨었다가 다시 보일 때 — 처음 붙을 때는 안 부른다(그때는 화면이 스스로 받는다). 30초 안 · 쓴 것 없음이면 건너뛴다 */
export function useOnTabActive(cb: () => void) {
  const active = useTabActive();
  const was = useRef(active);
  const latest = useRef(cb);
  const ranAt = useRef(Date.now());
  useEffect(() => {
    latest.current = cb;
  });
  useEffect(() => {
    if (active && !was.current && (Date.now() - ranAt.current >= STALE_MS || lastWriteAt() > ranAt.current)) {
      ranAt.current = Date.now();
      latest.current();
    }
    was.current = active;
  }, [active]);
}

/*
 * 위에 쌓인 앱 화면(체크인 · 투구 기록 · 운동 · 설정 · 더보기)을 닫고 돌아올 때 — 판 넷이 다 붙어 있어 예전엔 닫을 때마다 넷이 함께 서버를
 * 4~6번 불렀고, 그것도 닫히는 움직임 한가운데였다(뒤로 쓸 때 끊기고 닫힌 뒤 홈이 튐, 2026-10-24 전체 검토). 이제 보이는 판만, 30초 안 ·
 * 쓴 것 없음이면 건너뛰고, 닫히는 움직임이 끝난 뒤에 받는다. first 면 처음 붙을 때도 받는다(그 화면이 스스로 안 받을 때).
 */
const POP_MS = 400;
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
      /* ponytail: 닫히는 움직임 길이를 400ms 로 어림 — 화면마다 끝 알림(transitionEnd)을 받으려면 그때 바꾼다 */
      const t = setTimeout(() => {
        ranAt.current = Date.now();
        latest.current();
      }, POP_MS);
      return () => clearTimeout(t);
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

export function TabPager({ index, visible, slots }: { index: number; visible: boolean; slots: (ReactNode | null)[] }) {
  const { width } = useWindowDimensions();
  const c = usePalette();
  const reduce = useReducedMotion();
  const x = useSharedValue(-index * width);
  /* 숨었다가 나타날 때 · 폭이 바뀔 때는 미끄러지지 않고 바로 그 자리 */
  const before = useRef({ visible, width });
  useEffect(() => {
    const slide = before.current.visible && visible && before.current.width === width && !reduce;
    x.value = slide ? withTiming(-index * width, { duration: 240, easing: EASE }) : -index * width;
    before.current = { visible, width };
  }, [index, visible, width, reduce, x]);
  const track = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View pointerEvents={visible ? 'box-none' : 'none'} style={[StyleSheet.absoluteFill, { opacity: visible ? 1 : 0 }]}>
      <Animated.View style={[styles.track, { width: width * slots.length }, track]}>
        {slots.map((s, i) => (
          /* 아직 안 붙은 판은 바탕색 판 — 밑의 웹이 비치지 않게 */
          <View key={i} style={{ width, height: '100%', backgroundColor: s ? undefined : c.page }} pointerEvents={visible && i === index ? 'box-none' : 'none'}>
            <ActiveCtx.Provider value={visible && i === index}>{s}</ActiveCtx.Provider>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { position: 'absolute', top: 0, bottom: 0, left: 0, flexDirection: 'row' },
});
