import { type Href, router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { TYPE, usePalette } from '~/lib/ui';
import { Icon } from '~/shell/icon';

/**
 * 탭 첫 화면 머리 — 웹 휴대폰과 같은 꼴(components/ui.tsx PageHeading inlineAction · analysis-link.tsx · segmented.tsx):
 * 큰 제목(34 · 800 · 좁은 자간) 오른쪽에 도구 단추, 그 밑 줄에 고르개. 앱 화면 모두 이것을 쓴다(네이티브2 · 3 도).
 */
export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  const c = usePalette();
  return (
    <View style={st.head}>
      <Text accessibilityRole="header" style={[TYPE.title, { flex: 1, color: c.ink }]} numberOfLines={1}>
        {title}
      </Text>
      {children ? <View style={st.tools}>{children}</View> : null}
    </View>
  );
}

/** '분석' 알약 — 44pt · 옅은 면 · 파란 그래프 그림(웹 AnalysisLink) */
export function AnalysisPill({ view }: { view: 'pitch' | 'training' }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(`/analysis?view=${view}` as Href)}
      style={({ pressed }) => [st.pill, { backgroundColor: c.chip }, pressed && { opacity: 0.6 }]}
    >
      <Icon name="chart-no-axes-column" size={16} color={c.sky} />
      <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>분석</Text>
    </Pressable>
  );
}

/**
 * 아이폰 고르개 — 옅은 회색 바탕 위로 흰 칸이 미끄러지고 고른 글자만 굵어진다(웹 Segmented tone raised · 칸 폭 같음 · 칸 40pt).
 */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
  label,
  size = 'sm',
  flow = false,
}: {
  options: readonly { value: V; label: string }[];
  /** 고른 것이 없으면(빈 값) 흰 표시를 숨긴다 */
  value: V;
  onChange: (v: V) => void;
  label: string;
  /** md = 글자 14(웹 size='md' — 폼 안 강도 · 만족도) */
  size?: 'sm' | 'md';
  /** 칸을 글자 폭만큼(웹 layout='flow' — 단위 고르기처럼 오른쪽에 작게) */
  flow?: boolean;
}) {
  const c = usePalette();
  const [w, setW] = useState(0);
  const found = options.findIndex((o) => o.value === value);
  const index = Math.max(0, found);
  const cell = w > 0 ? (w - PAD * 2 - GAP * (options.length - 1)) / options.length : 0;
  const reduce = useReducedMotion();
  const x = useSharedValue(index);
  /* 흰 표시가 미끄러진다 — 웹 use-sliding-thumb.ts: 260ms cubic-bezier(0.2,0,0,1), 처음 자리 잡을 때는 안 움직임 */
  useEffect(() => {
    x.value = reduce ? index : withTiming(index, { duration: 260, easing: Easing.bezier(0.2, 0, 0, 1) });
  }, [index, x, reduce]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * (cell + GAP) }] }));
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[st.seg, { backgroundColor: c.chip }, flow && { alignSelf: 'flex-start' }]}
    >
      {cell > 0 && found >= 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[st.thumb, { width: cell, backgroundColor: c.raised, boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 1px rgba(0,0,0,0.04)' }, thumb]}
        />
      ) : null}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (on) return;
              void Haptics.selectionAsync();
              onChange(o.value);
            }}
            style={[st.segItem, flow && { flex: 0, minWidth: 52, paddingHorizontal: 10 }]}
          >
            <Text style={{ color: c.ink, opacity: on ? 1 : 0.75, fontSize: size === 'md' ? 14 : 12, fontWeight: on ? '600' : '500', fontVariant: ['tabular-nums'] }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const PAD = 4;
const GAP = 4;
const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: { height: 44, borderRadius: 22, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6 },
  seg: { flexDirection: 'row', padding: PAD, gap: GAP, borderRadius: 28 },
  thumb: { position: 'absolute', top: PAD, bottom: PAD, left: PAD, borderRadius: 20 },
  segItem: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
});
