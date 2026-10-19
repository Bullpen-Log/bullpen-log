import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, View, useWindowDimensions, type LayoutRectangle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { prefsReady } from '~/lib/prefs';
import { usePalette } from '~/lib/ui';
import { BullpenMark } from '~/shell/wordmark';

/*
 * 앱 시작 연출 — 웹 components/app-splash.tsx 와 같은 장면 · 같은 때(김민이 다듬은 옛 앱 IntroOverlay 그대로):
 * 큰 B 0.4초 → 1초 동안 작아지며 이름의 B 칸으로(ease-in-out) → 1.25초부터 U · L · … · G 가 0.075초 간격으로 0.65초씩 밀려 나오며 진해짐 →
 * 2.9초에(사이트가 다 그려졌으면) 0.55초 동안 옅어지며 1.06배. 움직임 줄이기면 완성된 이름 1.1초 → 걷힘.
 * 큰 B 는 시작 화면(app.json splash, 폭 120 · 바탕 #f2f2f7 = 앱 바탕)과 같은 크기 · 자리 · 색이라 시작 화면을 걷는 순간이 이어진다.
 */
const LETTERS = ['U', 'L', 'L', 'P', 'E', 'N', ' ', 'L', 'O', 'G'];
const MOVE_AT = 400;
const MOVE_MS = 1000;
const LETTER_AT = 1250;
const LETTER_GAP = 75;
const LETTER_MS = 650;
const SETTLE_MS = 2900;
const LEAVE_MS = 550;
const REDUCED_HOLD_MS = 1100;
/* 시작 화면 그림(assets/splash.png, 512칸)이 폭 120 으로 그려지고, 그 안의 B 는 높이 255칸(가운데) — 그래서 화면의 B 는 120 × 255/512 ≈ 60pt.
   큰 B 를 이 높이로 시작해야 시작 화면을 걷는 순간 크기가 튀지 않는다(2026-10-19 김민: "처음 B 와 애니메이션 B 크기가 갑자기 바뀐다") */
const SPLASH_W = 120;
const SPLASH_B_H = (SPLASH_W * 255) / 512;
const ASPECT = 594 / 613;

/* 사이트(웹 껍데기)가 다 그려졌다는 알림 — 그 전에 걷으면 흰 화면이 번쩍인다. index.tsx · 딥링크 화면이 부른다 */
let ready = false;
const subs = new Set<() => void>();
export function markAppReady() {
  if (ready) return;
  ready = true;
  subs.forEach((f) => f());
}

const ease = Easing.out(Easing.cubic);

function Letter({ ch, i, t, size, color }: { ch: string; i: number; t: SharedValue<number>; size: number; color: string }) {
  const style = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, (t.get() - (LETTER_AT + LETTER_GAP * i)) / LETTER_MS));
    const e = ease(p);
    return { opacity: e, transform: [{ translateX: (1 - e) * -0.245 * size }] };
  });
  if (ch === ' ') return <View style={{ width: size * 0.3 }} />;
  return (
    <Animated.Text style={[{ fontFamily: 'DINCondensed-Bold', fontSize: size, lineHeight: size, letterSpacing: size * 0.02, color }, style]}>{ch}</Animated.Text>
  );
}

export function Intro() {
  const c = usePalette();
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const [gone, setGone] = useState(false);
  const [slot, setSlot] = useState<LayoutRectangle | null>(null);
  const slotRef = useRef<ComponentRef<typeof View>>(null);
  const size = Math.min(width * 0.15, 68);
  const slotH = size * 0.7;
  const bigH = SPLASH_B_H;
  /* 타임라인(ms) 하나로 B · 글자를 다 그린다 — 장면마다 다시 그리지 않게 UI 스레드에서 */
  const t = useSharedValue(reduced ? SETTLE_MS : 0);
  const leave = useSharedValue(0);
  const [settled, setSettled] = useState(false);

  /* B 칸 자리를 잰 뒤에 시작 화면을 걷고 시계를 돌린다 — 잰 전에는 큰 B 가 시작 화면과 같은 자리에 있다 */
  /* 앱 테마를 읽기 전엔 기본값(라이트)이라 — 읽은 뒤에 시작 화면을 걷는다(다크에서 흰 판이 번쩍이던 것) */
  const [themed, setThemed] = useState(false);
  useEffect(() => {
    void prefsReady.then(() => setThemed(true));
  }, []);
  useEffect(() => {
    if (!slot || !themed) return;
    void SplashScreen.hideAsync();
    const done = () => setSettled(true);
    if (reduced) {
      const id = setTimeout(done, REDUCED_HOLD_MS);
      return () => clearTimeout(id);
    }
    t.set(withTiming(SETTLE_MS, { duration: SETTLE_MS, easing: Easing.linear, reduceMotion: ReduceMotion.Never }, (fin) => fin && runOnJS(done)()));
  }, [slot, themed, reduced, t]);

  /* 다 섰고 사이트도 그려졌으면 걷는다. 사이트가 끝내 안 오면 선 뒤 7초에 걷는다(시작 화면이 하던 10초 상한과 비슷하게) */
  useEffect(() => {
    if (!settled) return;
    const go = () => leave.set(withTiming(1, { duration: LEAVE_MS, easing: Easing.in(Easing.quad) }, (fin) => fin && runOnJS(setGone)(true)));
    if (ready) return go();
    subs.add(go);
    const id = setTimeout(go, 7000);
    return () => {
      subs.delete(go);
      clearTimeout(id);
    };
  }, [settled, leave]);

  const veil = useAnimatedStyle(() => ({ opacity: 1 - leave.get(), transform: [{ scale: 1 + 0.06 * leave.get() }] }));
  const mark = useAnimatedStyle(() => {
    if (!slot) return { opacity: 1 };
    const p = Math.min(1, Math.max(0, (t.get() - MOVE_AT) / MOVE_MS));
    const e = Easing.inOut(Easing.cubic)(p);
    const sx = slot.x + slot.width / 2;
    const sy = slot.y + slot.height / 2;
    const s = bigH / slotH;
    return {
      opacity: 1,
      transform: [{ translateX: (1 - e) * (width / 2 - sx) }, { translateY: (1 - e) * (height / 2 - sy) }, { scale: s + (1 - s) * e }],
    };
  });

  if (gone) return null;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.page, zIndex: 1000 }, veil]}>
      <View style={styles.center}>
        <View accessible accessibilityLabel="BULLPEN LOG" style={styles.row}>
          {/* B 칸 — 자리만 잡고 그림은 밖의 움직이는 B 가 그린다 */}
          <View
            ref={slotRef}
            collapsable={false}
            onLayout={() =>
              /* 화면 좌표로 잰다 — 덮개가 화면 전체라 같은 좌표다 */
              slotRef.current?.measureInWindow((x, y, w, h) => setSlot({ x, y, width: w, height: h }))
            }
            style={{ width: slotH * ASPECT, height: slotH, marginRight: size * 0.07, marginBottom: size * 0.3 }}
          />
          {LETTERS.map((ch, i) => (
            <Letter key={i} ch={ch} i={i} t={t} size={size} color={c.ink} />
          ))}
        </View>
      </View>
      {slot ? (
        <Animated.View style={[{ position: 'absolute', left: slot.x, top: slot.y }, mark]}>
          <BullpenMark height={slotH} />
        </Animated.View>
      ) : (
        /* 재기 전 — 시작 화면과 같은 큰 B 를 가운데에 */
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <BullpenMark height={bigH} />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
});
