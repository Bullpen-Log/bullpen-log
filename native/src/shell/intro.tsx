import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
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
import { MARK_ASPECT, MARK_DROP, MARK_EM, SinkerMark } from '~/shell/wordmark';

/*
 * 앱 시작 연출 — 웹 components/app-splash.tsx 와 같은 장면 · 같은 때(김민이 다듬은 옛 앱 IntroOverlay 그대로).
 * 2026-10-22 금윤호: 불펜로그 B → BULLPEN LOG 이던 것을 싱커 로고(초안 · 임시) → SINKER 로. 아래 'B' 는 이제 싱커 로고, 글자는 I · N · K · E · R:
 * 큰 B 0.4초 → 1초 동안 작아지며 이름의 B 칸으로(ease-in-out) → 1.25초부터 U · L · … · G 가 0.075초 간격으로 0.65초씩 밀려 나오며 진해짐 →
 * 2.9초에(사이트가 다 그려졌으면) 0.55초 동안 옅어지며 1.06배. 움직임 줄이기면 완성된 이름 1.1초 → 걷힘.
 * 큰 B 는 시작 화면(app.json splash · 바탕 #f2f2f7 = 앱 바탕)과 같은 크기 · 자리 · 색이라 시작 화면을 걷는 순간이 이어진다.
 */
const MOVE_AT = 400;
const MOVE_MS = 1000;
const LETTER_AT = 1250;
const LETTER_GAP = 75;
const LETTER_MS = 650;
const SETTLE_MS = 2900;
const LEAVE_MS = 550;
const REDUCED_HOLD_MS = 1100;
/*
 * 큰 B = 150pt(웹 app-splash 의 '긴 변 16%'와 거의 같다 — 852 화면 136 · 932 화면 149, 2026-10-19 김민: "너무 큰 상태에서 작아진다").
 * 시작 화면은 app.json splash imageWidth 300 — 그림(assets/splash.png)의 로고가 한 변의 절반 높이라 300 × 256/512 = 150pt, 같은 가운데.
 * native/ios 는 prebuild 가 만들어(git 밖) storyboard 를 손으로 고쳐도 GitHub 굽기에선 사라진다 — 그래서 고정 크기로 맞춘다.
 */
export const SPLASH_W = 300;

/** 앱마다 다른 것 — 로고 그림 · 이름 글자 · 시작 화면의 큰 로고 · 이름 줄의 로고 칸(덕아웃 앱은 src/dugout/mark.tsx DUGOUT_INTRO) */
export type IntroLook = {
  label: string;
  letters: string[];
  /** 로고 너비 ÷ 높이 */
  aspect: number;
  /** 시작 화면 그림 속 로고 높이(pt) — 같은 크기 · 자리여야 시작 화면을 걷는 순간이 이어진다 */
  bigH: number;
  /** 시작 화면의 로고 가운데가 화면 가운데에서 비킨 만큼(pt) */
  bigOffset?: [number, number];
  /** 글자 크기 size 일 때 이름 줄의 로고 칸 높이 · 오른쪽 틈 · 밑 띄움 */
  slot: (size: number) => { h: number; right: number; bottom: number };
  mark: (h: number) => ReactNode;
};

const SINKER_LOOK: IntroLook = {
  label: '싱커',
  letters: ['I', 'N', 'K', 'E', 'R'],
  aspect: MARK_ASPECT,
  bigH: (SPLASH_W * 256) / 512,
  slot: (size) => ({ h: size * MARK_EM, right: size * 0.05, bottom: size * (0.3 - MARK_DROP) }),
  mark: (h) => <SinkerMark height={h} />,
};

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
    /* 정지 모양은 안 보임(opacity 0) — 움직임 스타일이 늦게 붙어도 첫 장면에 이름이 비치지 않게 */
    <Animated.Text style={[{ fontFamily: 'DINCondensed-Bold', fontSize: size, lineHeight: size, letterSpacing: size * 0.02, color, opacity: 0 }, style]}>{ch}</Animated.Text>
  );
}

export function Intro({ look = SINKER_LOOK }: { look?: IntroLook }) {
  const c = usePalette();
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const [gone, setGone] = useState(false);
  const [slot, setSlot] = useState<LayoutRectangle | null>(null);
  const slotRef = useRef<ComponentRef<typeof View>>(null);
  const size = Math.min(width * 0.15, 68);
  const slotBox = look.slot(size);
  const slotH = slotBox.h;
  const bigH = look.bigH;
  const bigW = bigH * look.aspect;
  const [ox, oy] = look.bigOffset ?? [0, 0];
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
    /*
     * 큰 B 가 그려진 다음 장면에 시작 화면을 걷고, 다 걷힌 뒤에 시계를 돌린다 — 앱이 무겁게 뜨면 걷히는 데 시간이 걸려, 먼저 돌리면
     * 시작 화면이 걷혔을 때 B 가 이미 작아지는 중이라 툭 튀었다.
     */
    let alive = true;
    let id: ReturnType<typeof setTimeout> | undefined;
    const done = () => setSettled(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void SplashScreen.hideAsync()
          .catch(() => undefined)
          .then(() => {
            if (!alive) return;
            if (reduced) id = setTimeout(done, REDUCED_HOLD_MS);
            else t.set(withTiming(SETTLE_MS, { duration: SETTLE_MS, easing: Easing.linear, reduceMotion: ReduceMotion.Never }, (fin) => fin && runOnJS(done)()));
          });
      })
    );
    return () => {
      alive = false;
      if (id) clearTimeout(id);
    };
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
  /*
   * B 는 늘 '가운데 큰 B' 자리에 그리고(정지 모양 = 시작 장면), 움직임만 이름의 B 칸으로 옮기며 줄인다 — 움직임 스타일이 한 장면 늦게
   * 붙어도 큰 B 가 보일 뿐이다(예전엔 B 를 칸 자리에 그리고 키워 놓아, 첫 장면에 작은 B · 이름이 잠깐 비쳤다).
   */
  const mark = useAnimatedStyle(() => {
    if (!slot) return { transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }] };
    const p = Math.min(1, Math.max(0, (t.get() - MOVE_AT) / MOVE_MS));
    const e = Easing.inOut(Easing.cubic)(p);
    const dx = slot.x + slot.width / 2 - (width / 2 + ox);
    const dy = slot.y + slot.height / 2 - (height / 2 + oy);
    const s = slotH / bigH;
    /* 다 옮겨지면 감추고 칸 자리의 '제 크기 B'로 바꾼다 — 150pt 그림을 0.27배로 줄여 둔 채면 장면이 바뀔 때 계단처럼 깨져 보였다 */
    return { opacity: p >= 1 ? 0 : 1, transform: [{ translateX: e * dx }, { translateY: e * dy }, { scale: 1 + (s - 1) * e }] };
  });
  const crisp = useAnimatedStyle(() => ({ opacity: slot && t.get() >= MOVE_AT + MOVE_MS ? 1 : 0 }));

  if (gone) return null;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.page, zIndex: 1000 }, veil]}>
      <View style={styles.center}>
        <View accessible accessibilityLabel={look.label} style={styles.row}>
          {/* B 칸 — 자리만 잡고 그림은 밖의 움직이는 B 가 그린다 */}
          <View
            ref={slotRef}
            collapsable={false}
            onLayout={() =>
              /* 화면 좌표로 잰다 — 덮개가 화면 전체라 같은 좌표다 */
              slotRef.current?.measureInWindow((x, y, w, h) => setSlot({ x, y, width: w, height: h }))
            }
            style={{ width: slotH * look.aspect, height: slotH, marginRight: slotBox.right, marginBottom: slotBox.bottom }}
          />
          {look.letters.map((ch, i) => (
            <Letter key={i} ch={ch} i={i} t={t} size={size} color={c.ink} />
          ))}
        </View>
      </View>
      <Animated.View style={[{ position: 'absolute', left: width / 2 - bigW / 2 + ox, top: height / 2 - bigH / 2 + oy }, mark]}>
        {look.mark(bigH)}
      </Animated.View>
      {/* 칸 자리의 제 크기 B — 옮기기가 끝난 뒤(정지 모양은 안 보임) */}
      {slot ? (
        <Animated.View style={[{ position: 'absolute', left: slot.x, top: slot.y, opacity: 0 }, crisp]}>
          {look.mark(slotH)}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
});
