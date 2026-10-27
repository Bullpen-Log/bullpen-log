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
import Svg, { Circle, Path } from 'react-native-svg';
import { loadJson, saveJson } from '~/lib/store';
import { usePalette, useTheme, withAlpha } from '~/lib/ui';
import { Icon } from '~/shell/icon';

/**
 * 홈 '오늘' 링 넷이 다 찼을 때의 축하 — 웹 app/(app)/today/all-done.tsx 의 앱 쪽(화면 전체).
 * 링이 다 그려진 뒤(1.5초) 성공 떨림 → 화면이 옅게 덮이고(260ms) 가운데 96px 링이 한 바퀴(700ms) · 520ms 에 체크가 톡(0.6 → 1.08 → 1) ·
 * 링을 따라 야구공 실밥(V자 바늘땀 14개)이 꿰매지고(200ms 부터 900ms) · 600ms 에 '오늘 기록을 다 남겼어요'가 떠오른다. 2.8초 뒤 또는 누르면
 * 걷힌다. 하루 한 번(폰에 날짜를 적음). 움직임 줄이기면 다 꿰맨 모양만.
 * 실밥은 싱커만의 표시 — 웹 로그인 · 빈 화면의 실밥 무늬(app/globals.css --seam)와 같은 바늘땀. 앱에서는 이 순간 한 곳에만 쓴다(2026-10-27 HIG
 * 검토: 링이 애플 피트니스와 똑같아 보였다 — 예전엔 흔한 '퍼지는 점' 다섯).
 */
const KEY = 'all-done';
const START_MS = 1500;
const OVERLAY_MS = 2800;
const R = 45;
const LEN = 2 * Math.PI * R;
const ACircle = Animated.createAnimatedComponent(Circle);
/* 실밥 — 링(반지름 R, 굵기 7) 위를 가로지르는 V자 바늘땀. 링이 그려지는 쪽(시계 방향)으로 끝이 향한다. 한 경로라 길이만큼 차례로 그린다 */
const STITCHES = 14;
const SEAM = (() => {
  const at = (r: number, t: number) => [50 + r * Math.cos(t), 50 + r * Math.sin(t)] as const;
  let d = '';
  let len = 0;
  for (let i = 0; i < STITCHES; i++) {
    const a = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / STITCHES;
    const [x1, y1] = at(R - 6, a);
    const [x2, y2] = at(R, a + 0.11);
    const [x3, y3] = at(R + 6, a);
    d += `M${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}L${x3.toFixed(1)},${y3.toFixed(1)}`;
    len += Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
  }
  return { d, len };
})();
/* 야구공 실밥의 빨강 — 상태색(danger)과 따로 둔다(꾸밈 한 곳에만) */
const SEAM_COLOR = { light: '#c8352b', dark: '#ff6f61' } as const;
const APath = Animated.createAnimatedComponent(Path);
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
  const seamColor = SEAM_COLOR[useTheme() === 'light' ? 'light' : 'dark'];
  const reduce = useReducedMotion();
  const ring = useSharedValue(reduce ? 1 : 0);
  const seam = useSharedValue(reduce ? 1 : 0);
  const check = useSharedValue(reduce ? 1 : 0.6);
  const shown = useSharedValue(reduce ? 1 : 0);
  const text = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) return;
    ring.set(withTiming(1, { duration: 700, easing: Easing.bezier(0.65, 0, 0.35, 1) }));
    seam.set(withDelay(200, withTiming(1, { duration: 900, easing: Easing.bezier(0.45, 0, 0.25, 1) })));
    check.set(withDelay(520, withSequence(withTiming(1.08, { duration: 216, easing: POP }), withTiming(1, { duration: 144, easing: POP }))));
    shown.set(withDelay(520, withTiming(1, { duration: 216, easing: POP })));
    text.set(withDelay(600, withTiming(1, { duration: 420, easing: POP })));
  }, [reduce, ring, seam, check, shown, text]);
  const arc = useAnimatedProps(() => ({ strokeDashoffset: LEN * (1 - ring.value) }));
  const stitch = useAnimatedProps(() => ({ strokeDashoffset: SEAM.len * (1 - seam.value) }));
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
          <APath
            d={SEAM.d}
            fill="none"
            stroke={seamColor}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={`${SEAM.len} ${SEAM.len}`}
            animatedProps={stitch}
          />
        </Svg>
        <Animated.View style={[styles.check, { backgroundColor: c.action }, checkStyle]}>
          <Icon name="check" size={40} color="#fff" strokeWidth={3} />
        </Animated.View>
      </View>
      <Animated.Text style={[styles.text, { color: c.ink, fontFamily: 'Pretendard' }, textStyle]}>오늘 기록을 다 남겼어요</Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ring: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  check: { position: 'absolute', top: '16%', left: '16%', right: '16%', bottom: '16%', borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  text: { marginTop: 20, fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
});
