import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { loadJson, saveJson } from '~/lib/store';
import { usePalette, withAlpha } from '~/lib/ui';
import { Icon } from '~/shell/icon';

/**
 * 홈 '오늘' 링 넷이 다 찼을 때의 축하 — 웹 app/(app)/today/all-done.tsx 의 앱 쪽(화면 전체).
 * 링이 다 그려진 뒤(1.5초) 성공 떨림 → 화면이 옅게 덮이고(260ms) 가운데 96px 링이 한 바퀴(700ms) · 520ms 에 체크가 톡(0.6 → 1.08 → 1) ·
 * 점 다섯이 퍼지고(1.2초, 차례로) · 600ms 에 '오늘 기록을 다 남겼어요'가 떠오른다. 2.8초 뒤 또는 누르면 걷힌다. 하루 한 번(폰에 날짜를 적음).
 * 움직임 줄이기면 점 없이 다 된 모양만.
 */
const KEY = 'all-done';
const START_MS = 1500;
const OVERLAY_MS = 2800;
const R = 45;
const LEN = 2 * Math.PI * R;
const ACircle = Animated.createAnimatedComponent(Circle);
const BITS = [
  { s: 8, dx: -64, dy: -30, d: 420 },
  { s: 6, dx: 62, dy: -36, d: 480 },
  { s: 7, dx: -74, dy: 18, d: 540 },
  { s: 5, dx: 72, dy: 14, d: 600 },
  { s: 6, dx: 0, dy: -58, d: 520 },
];
const POP = Easing.bezier(0.22, 1, 0.36, 1);

export function AllDone({ allDone, day }: { allDone: boolean; day: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!allDone) return;
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    void loadJson(KEY).then((v) => {
      if (!alive || v === day) return;
      timers.push(
        setTimeout(() => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          void saveJson(KEY, day);
          setOpen(true);
          timers.push(setTimeout(() => setOpen(false), OVERLAY_MS));
        }, START_MS)
      );
    });
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, [allDone, day]);
  if (!open) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Cheer onClose={() => setOpen(false)} />
    </Modal>
  );
}

function Cheer({ onClose }: { onClose: () => void }) {
  const c = usePalette();
  const reduce = useReducedMotion();
  const ring = useSharedValue(reduce ? 1 : 0);
  const check = useSharedValue(reduce ? 1 : 0.6);
  const shown = useSharedValue(reduce ? 1 : 0);
  const text = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) return;
    ring.set(withTiming(1, { duration: 700, easing: Easing.bezier(0.65, 0, 0.35, 1) }));
    check.set(withDelay(520, withSequence(withTiming(1.08, { duration: 216, easing: POP }), withTiming(1, { duration: 144, easing: POP }))));
    shown.set(withDelay(520, withTiming(1, { duration: 216, easing: POP })));
    text.set(withDelay(600, withTiming(1, { duration: 420, easing: POP })));
  }, [reduce, ring, check, shown, text]);
  const arc = useAnimatedProps(() => ({ strokeDashoffset: LEN * (1 - ring.value) }));
  const checkStyle = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ scale: check.value }] }));
  const textStyle = useAnimatedStyle(() => ({ opacity: text.value, transform: [{ translateY: (1 - text.value) * 8 }] }));
  return (
    <Pressable accessibilityRole="alert" accessibilityLabel="오늘 기록을 다 남겼어요" onPress={onClose} style={[styles.screen, { backgroundColor: withAlpha(c.page, 0.86) }]}>
      <View style={styles.ring}>
        <Svg width={96} height={96} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
          <Circle cx={50} cy={50} r={R} fill="none" strokeWidth={7} stroke={withAlpha(c.sky, 0.15)} />
          <ACircle
            cx={50}
            cy={50}
            r={R}
            fill="none"
            strokeWidth={7}
            stroke={c.sky}
            strokeLinecap="round"
            strokeDasharray={`${LEN} ${LEN}`}
            animatedProps={arc}
            transform="rotate(-90 50 50)"
          />
        </Svg>
        <Animated.View style={[styles.check, { backgroundColor: c.action }, checkStyle]}>
          <Icon name="check" size={40} color="#fff" strokeWidth={3} />
        </Animated.View>
        {reduce ? null : BITS.map((b, i) => <Bit key={i} {...b} color={c.link} />)}
      </View>
      <Animated.Text style={[styles.text, { color: c.ink, fontFamily: 'Pretendard' }, textStyle]}>오늘 기록을 다 남겼어요</Animated.Text>
    </Pressable>
  );
}

/* 퍼지는 점 — 가운데에서 바깥으로 1.6배 거리, 1.2초(25% 까지 진해지고 75% 부터 옅어짐) */
function Bit({ s, dx, dy, d, color }: { s: number; dx: number; dy: number; d: number; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(d, withTiming(1, { duration: 1200, easing: POP })));
  }, [t, d]);
  const style = useAnimatedStyle(() => {
    const v = t.value;
    const o = v < 0.25 ? v / 0.25 : v > 0.75 ? (1 - v) / 0.25 : 1;
    return { opacity: o, transform: [{ translateX: dx * 1.6 * v }, { translateY: dy * 1.6 * v }, { scale: 0.4 + 0.6 * v }] };
  });
  const size = s * 1.5;
  return <Animated.View pointerEvents="none" style={[styles.bit, { width: size, height: size, borderRadius: size / 2, marginLeft: -size / 2, marginTop: -size / 2, backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ring: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  check: { position: 'absolute', top: '16%', left: '16%', right: '16%', bottom: '16%', borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  bit: { position: 'absolute', left: '50%', top: '50%' },
  text: { marginTop: 20, fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
});
