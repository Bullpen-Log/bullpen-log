import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';
import type { HomeRing } from './api';

/**
 * 홈 맨 위 진행 링(웹 app/(app)/today/today-rings.tsx 와 같은 숫자 — lib/report/home-today.ts). 색은 하나(sky).
 * 움직임도 웹과 같다(globals.css):
 * - 첫 진입은 현재 값을 바로 표시하고 기록 변경 후에만 차오른다.
 * - 다 차면 링이 한 바퀴 그려지고(700ms cubic-bezier(0.65,0,0.35,1), done-ring) 520ms 뒤 가운데 파란 원 + 흰 체크가 톡(0.6 → 1.08 → 1, 360ms, finish-pop).
 * 움직임 줄이기면 처음부터 다 보인다.
 */
const ICON: Record<HomeRing['key'], IconName> = {
  checkin: 'heart-pulse',
  pitch: 'baseball',
  training: 'dumbbell',
  nutrition: 'utensils',
};
const SIZE = 64;
const R = 27;
const LEN = 2 * Math.PI * R;
const ACircle = Animated.createAnimatedComponent(Circle);

export function RingsCard({ rings, onPress }: { rings: HomeRing[]; onPress: (ring: HomeRing) => void }) {
  const c = usePalette();
  const done = rings.filter((r) => r.value >= 1).length;
  return (
    <View style={[styles.card, { backgroundColor: c.card, boxShadow: c.floatHero }]}>
      {/* 머리 — 오늘 몇 개 했는지가 홈의 주인공(2026-10-21: 링 넷만 있어 무엇을 보라는 건지 안 읽혔다) */}
      <View style={styles.head} accessibilityRole="summary">
        <Text style={[TYPE.card, { flex: 1, color: c.ink }]}>오늘</Text>
        <Text style={[TYPE.num, { fontSize: 22, color: done === rings.length ? c.link : c.ink }]}>
          {done}
          <Text style={[TYPE.unit, { color: c.muted }]}> / {rings.length}</Text>
        </Text>
      </View>
      <View style={styles.row}>
        {rings.map((it) => (
          <Press key={it.key} accessibilityRole="button" accessibilityLabel={`${it.label} ${it.caption}`} onPress={() => onPress(it)} style={styles.item}>
            <Ring value={it.value} icon={ICON[it.key]} />
            <Text style={[styles.label, { color: c.ink }]}>{it.label}</Text>
          </Press>
        ))}
      </View>
    </View>
  );
}

function Ring({ value, icon }: { value: number; icon: IconName }) {
  const c = usePalette();
  const reduce = useReducedMotion();
  const v = Math.min(1, Math.max(0, value));
  const full = v >= 1;
  /* 0 = 빈 링 · 1 = 다 참 */
  const fill = useSharedValue(v);
  const first = useRef(true);
  /* 체크 — 크기 0.6 → 1.08(60%) → 1, 진하기 0 → 1(60% 까지) */
  const scale = useSharedValue(full ? 1 : 0.6);
  const shown = useSharedValue(full ? 1 : 0);
  useEffect(() => {
    if (first.current || reduce) {
      first.current = false;
      fill.value = v;
      scale.value = 1;
      shown.value = full ? 1 : 0;
      return;
    }
    const pop = Easing.bezier(0.22, 1, 0.36, 1);
    if (full) {
      fill.value = withTiming(1, { duration: 700, easing: Easing.bezier(0.65, 0, 0.35, 1) });
      scale.value = 0.6;
      scale.value = withDelay(520, withSequence(withTiming(1.08, { duration: 216, easing: pop }), withTiming(1, { duration: 144, easing: pop })));
      shown.value = withDelay(520, withTiming(1, { duration: 216, easing: pop }));
    } else {
      fill.value = withDelay(120, withTiming(v, { duration: 900, easing: pop }));
      shown.value = 0;
    }
  }, [v, full, reduce, fill, scale, shown]);
  const arc = useAnimatedProps(() => ({ strokeDashoffset: LEN * (1 - fill.value) }));
  const check = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ scale: scale.value }] }));
  return (
    <View style={styles.ring}>
      <Svg width={SIZE} height={SIZE} viewBox="0 0 64 64" style={StyleSheet.absoluteFill}>
        <Circle cx={32} cy={32} r={R} fill="none" strokeWidth={7} stroke={withAlpha(c.ink, 0.08)} />
        <ACircle
          cx={32}
          cy={32}
          r={R}
          fill="none"
          strokeWidth={7}
          stroke={c.sky}
          strokeLinecap="round"
          /* 0% 면 둥근 끝이 점으로 남는다 — 아예 안 그린다(웹 today-rings) */
          strokeOpacity={v > 0 ? 1 : 0}
          strokeDasharray={`${LEN} ${LEN}`}
          animatedProps={arc}
          transform="rotate(-90 32 32)"
        />
      </Svg>
      {full ? (
        <Animated.View style={[styles.done, { backgroundColor: c.action }, check]}>
          <Icon name="check" size={20} color="#fff" />
        </Animated.View>
      ) : (
        <Icon name={icon} size={20} color={c.muted} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /* 웹 Card px-2 · 위아래 20 · 4칸 사이 4 */
  card: { borderRadius: 20, paddingVertical: 20, paddingHorizontal: 8, gap: 16 },
  head: { flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 12 },
  row: { flexDirection: 'row', gap: 4 },
  item: { flex: 1, alignItems: 'center', gap: 8, borderRadius: 20, paddingVertical: 4 },
  ring: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  /* 가운데 원 — inset 22% */
  done: { position: 'absolute', width: SIZE * 0.56, height: SIZE * 0.56, borderRadius: SIZE * 0.28, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '600' },
});
