import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { trainingEffortLevel } from '@/lib/training-effort';
import { usePalette, withAlpha } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';

/**
 * 운동 강도 1~10 슬라이더 — 마치기 창(시안 08)과 완료 화면의 나중 입력(시안 09)이 같이 쓴다(2026-10-30 사용자 결정 — 칩 넷 · 숫자 열 칸은 지난 안).
 *
 *   - 정수 1~10, 한 칸씩. 4 · 6 · 8 · 10 도 그대로 넘긴다.
 *   - 처음 값은 null — 손잡이가 1 자리에 흐리게 서 있어도 1 이 아니다. 1 자리를 눌러 1 을 고를 수 있다.
 *   - 누르기 · 끌기 · −/+ 로 고르고 '선택 해제'로 비운다. 끄는 동안 숫자와 뜻이 바로 바뀐다.
 *   - 가로로 끌 때만 잡는다(세로로 움직이면 화면 굴리기 · 시트 끌기에 넘긴다).
 *   - 화면 읽기: 조절(adjustable) 역할 · 지금 값 · 범위, 위아래로 쓸어 한 칸씩.
 * 값은 부르는 쪽이 들고 있다(저장 전 초안) — 이 부품은 아무것도 저장하지 않는다.
 */
const MIN = 1;
const MAX = 10;
const THUMB = 28;
const at = (v: number | null) => ((v ?? MIN) - MIN) / (MAX - MIN);

export function IntensitySlider({
  value,
  onChange,
  disabled = false,
  label = '오늘 운동 강도',
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  label?: string;
}) {
  const c = usePalette();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const w = useSharedValue(0);
  const pos = useSharedValue(0);
  const level = value != null ? trainingEffortLevel(value) : null;

  useEffect(() => {
    const to = at(value);
    pos.set(reduced ? to : withTiming(to, { duration: 140 }));
  }, [value, reduced, pos]);

  const pick = (v: number) => {
    const n = Math.max(MIN, Math.min(MAX, Math.round(v)));
    if (n !== value) {
      void Haptics.selectionAsync();
      onChange(n);
    }
  };
  /* 손가락 자리 → 정수(UI 스레드에서 셈, 값이 바뀔 때만 JS 로) */
  const fromX = (x: number) => {
    'worklet';
    const width = w.get();
    if (width <= 0) return MIN;
    return Math.max(MIN, Math.min(MAX, Math.round((x / width) * (MAX - MIN)) + MIN));
  };
  const last = useSharedValue(-1);
  const tap = Gesture.Tap()
    .enabled(!disabled)
    .onEnd((e) => {
      runOnJS(pick)(fromX(e.x - THUMB / 2));
    });
  const pan = Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetX([-6, 6])
    .failOffsetY([-12, 12])
    .onStart(() => {
      last.set(-1);
    })
    .onUpdate((e) => {
      const n = fromX(e.x - THUMB / 2);
      if (n !== last.get()) {
        last.set(n);
        runOnJS(pick)(n);
      }
    });
  const gesture = Gesture.Race(pan, tap);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pos.get() * w.get() }] }));
  const fillStyle = useAnimatedStyle(() => ({ width: pos.get() * w.get() }));

  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.max(0, e.nativeEvent.layout.width - THUMB);
    setWidth(next);
    w.set(next);
  };

  const step = (d: number) => pick(value == null ? MIN : value + d);
  const off = disabled;
  return (
    <View style={{ gap: 10 }}>
      <View style={st.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[st.value, { color: value == null ? c.muted : c.ink }]} accessibilityElementsHidden importantForAccessibility="no">
            {value ?? '–'}
            <Text style={[st.of, { color: c.muted }]}> / 10</Text>
          </Text>
          <Text style={[st.meaning, { color: value == null ? c.muted : c.ink }]} accessibilityElementsHidden importantForAccessibility="no">
            {level ? level.label : '아직 고르지 않았어요'}
          </Text>
        </View>
        {value != null && !off ? (
          <Press accessibilityRole="button" accessibilityLabel="강도 선택 해제" onPress={() => onChange(null)} style={st.clear}>
            <Text style={{ color: c.link, fontSize: 15, fontWeight: '600' }}>선택 해제</Text>
          </Press>
        ) : null}
      </View>
      <View style={st.row}>
        <Press
          accessibilityRole="button"
          accessibilityLabel="강도 한 칸 내리기"
          disabled={off || value === MIN}
          onPress={() => step(-1)}
          style={[st.stepBtn, { backgroundColor: c.chip, opacity: off || value === MIN ? 0.4 : 1 }]}
        >
          <Icon name="minus" size={18} color={c.ink} />
        </Press>
        <GestureDetector gesture={gesture}>
          <View
            onLayout={onLayout}
            style={st.trackBox}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={label}
            accessibilityState={{ disabled: off }}
            accessibilityValue={{ min: MIN, max: MAX, ...(value != null ? { now: value } : {}), text: value != null ? `${value}, ${level?.label ?? ''}` : '선택 안 함' }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => {
              if (off) return;
              if (e.nativeEvent.actionName === 'increment') step(1);
              else if (e.nativeEvent.actionName === 'decrement') step(-1);
            }}
          >
            <View style={[st.track, { backgroundColor: withAlpha(c.ink, 0.1) }]}>
              {value != null ? <Animated.View style={[st.fill, { backgroundColor: c.action }, fillStyle]} /> : null}
            </View>
            <View style={st.ticks} pointerEvents="none">
              {Array.from({ length: MAX - MIN + 1 }, (_, i) => (
                <View key={i} style={[st.tick, { backgroundColor: value != null && i + MIN <= value ? withAlpha(c.onAction, 0.7) : withAlpha(c.ink, 0.22) }]} />
              ))}
            </View>
            {width > 0 ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  st.thumb,
                  {
                    backgroundColor: value == null ? c.card : c.action,
                    borderColor: value == null ? withAlpha(c.ink, 0.25) : c.action,
                    opacity: off ? 0.5 : value == null ? 0.7 : 1,
                    boxShadow: value == null ? undefined : '0 2px 6px rgba(0,0,0,0.18)',
                  },
                  thumbStyle,
                ]}
              />
            ) : null}
          </View>
        </GestureDetector>
        <Press
          accessibilityRole="button"
          accessibilityLabel="강도 한 칸 올리기"
          disabled={off || value === MAX}
          onPress={() => step(1)}
          style={[st.stepBtn, { backgroundColor: c.chip, opacity: off || value === MAX ? 0.4 : 1 }]}
        >
          <Icon name="plus" size={18} color={c.ink} />
        </Press>
      </View>
      <View style={st.ends}>
        <Text style={{ color: c.muted, fontSize: 13 }}>1 아주 가벼움</Text>
        <Text style={{ color: c.muted, fontSize: 13 }}>10 최대</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  value: { fontSize: 34, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  of: { fontSize: 17, fontWeight: '500' },
  meaning: { fontSize: 15, fontWeight: '600' },
  clear: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  trackBox: { flex: 1, height: 44, justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, marginHorizontal: THUMB / 2, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4 },
  ticks: { position: 'absolute', left: THUMB / 2, right: THUMB / 2, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tick: { width: 4, height: 4, borderRadius: 2 },
  thumb: { position: 'absolute', left: 0, width: THUMB, height: THUMB, borderRadius: THUMB / 2, borderWidth: 2 },
  ends: { flexDirection: 'row', justifyContent: 'space-between' },
});
