import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
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

/** 판이 숨었다가 다시 보일 때 — 처음 붙을 때는 안 부른다(그때는 화면이 스스로 받는다) */
export function useOnTabActive(cb: () => void) {
  const active = useTabActive();
  const was = useRef(active);
  const latest = useRef(cb);
  useEffect(() => {
    latest.current = cb;
  });
  useEffect(() => {
    if (active && !was.current) latest.current();
    was.current = active;
  }, [active]);
}

const EASE = Easing.bezier(0.32, 0.72, 0, 1);

export function TabPager({ index, visible, slots }: { index: number; visible: boolean; slots: (ReactNode | null)[] }) {
  const { width } = useWindowDimensions();
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
          <View key={i} style={{ width, height: '100%' }} pointerEvents={visible && i === index ? 'box-none' : 'none'}>
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
