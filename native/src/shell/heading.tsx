import { type Href, router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { TYPE, usePalette } from '~/lib/ui';
import { Icon, type IconName } from '~/shell/icon';

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

/** 그림만 있는 40pt 동그라미 도구 단추(웹 투구 머리의 구속 측정 · 3D 동작 분석) */
export function ToolCircle({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [st.circle, { backgroundColor: c.chip }, pressed && { opacity: 0.6 }]}
    >
      <Icon name={icon} size={16} color={c.skyStrong} />
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
}: {
  options: readonly { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  label: string;
}) {
  const c = usePalette();
  const [w, setW] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const cell = w > 0 ? (w - PAD * 2 - GAP * (options.length - 1)) / options.length : 0;
  const x = useSharedValue(index);
  useEffect(() => {
    x.value = withSpring(index, { stiffness: 320, damping: 30 });
  }, [index, x]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * (cell + GAP) }] }));
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[st.seg, { backgroundColor: c.chip }]}
    >
      {cell > 0 ? (
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
            onPress={() => !on && onChange(o.value)}
            style={st.segItem}
          >
            <Text style={{ color: c.ink, opacity: on ? 1 : 0.75, fontSize: 15, fontWeight: on ? '600' : '500' }}>{o.label}</Text>
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
  circle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', padding: PAD, gap: GAP, borderRadius: 24 },
  thumb: { position: 'absolute', top: PAD, bottom: PAD, left: PAD, borderRadius: 16 },
  segItem: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
});
