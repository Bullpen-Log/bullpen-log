import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions, type LayoutRectangle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { prefsReady } from '~/lib/prefs';
import { usePalette } from '~/lib/ui';
import { MARK_ASPECT, MARK_DROP, MARK_EM, SinkerMark } from '~/shell/wordmark';
import { INTRO_TIMING as timing, createIntroController, leaveEase, letterEase, markDone, markEase } from './intro-timeline';

/*
 * 앱 시작 연출 — 큰 로고 → 이름의 로고 칸으로 → 글자가 밀려 나옴 → 걷힘. 시간표 · 곡선은 shell/intro-timeline.ts(순수, 시험 있음).
 * 2026-10-27 김민이 고른 2.20초(INTRO_TIMING) — 싱커 · 덕아웃 앱 같게. 사이트를 기다리지 않고, 아직이면 밑 화면의 첫 불러오기 판이 이어 받는다.
 * 2026-10-22 금윤호: 불펜로그 B → BULLPEN LOG 이던 것을 싱커 로고 → SINKER 로(아래 'B' 는 이제 로고, 글자는 I · N · K · E · R).
 * 움직임 줄이기면 완성된 이름 1.1초 → 걷힘(움직임 없이). 웹 PC 시작 연출(components/app-splash.tsx)은 예전 시간 그대로라 이제 싱커 앱과 다르다.
 * 큰 로고는 시작 화면(app.json splash · 바탕 = 앱 바탕)과 같은 크기 · 자리 · 색이라 시작 화면을 걷는 순간이 이어진다.
 * 가림막이 떠 있는 동안은 밑 화면을 누를 수 없다(예전엔 pointerEvents none 이라 보이지 않는 단추가 눌렸다) · VoiceOver 도 가림막 안에만.
 */
/* 칸을 못 재거나 테마를 못 읽어도 이만큼 뒤엔 시작한다(시작 화면이 영영 안 걷히지 않게) */
const START_FALLBACK_MS = 2500;
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

/*
 * 시작 화면(OS)은 인트로가 붙어 있으면 인트로가 걷는다 — 테마를 읽고 로고 칸을 잰 뒤. 다른 곳(사이트 다 그림 · 딥링크 · 사이트의 SplashScreen.hide)이
 * 먼저 걷으면 그 사이 다른 테마 바탕 · 덜 그린 이름이 비칠 수 있었다. 인트로가 없을 때(덕아웃 앱의 웹뷰 등 다른 길)는 바로 걷는다.
 */
let introMounted = 0;
/* 연출이 걷히면 알릴 곳 — 홈의 공이 연출 뒤에 한 번만 살짝 돈다(onIntroGone) */
const goneListeners = new Set<() => void>();
const holdSplash = (d: 1 | -1) => {
  introMounted += d;
  if (introMounted === 0) for (const f of [...goneListeners]) f();
};
/** 연출이 없거나 걷히면 cb — 이미 걷혔으면 곧바로. 돌려준 함수로 그만 듣는다 */
export function onIntroGone(cb: () => void): () => void {
  if (introMounted === 0) {
    cb();
    return () => undefined;
  }
  const once = () => {
    goneListeners.delete(once);
    cb();
  };
  goneListeners.add(once);
  return () => goneListeners.delete(once);
}
export function hideSplashUnlessIntro(): Promise<void> {
  if (introMounted > 0) return Promise.resolve();
  return SplashScreen.hideAsync().catch(() => undefined);
}

function Letter({ ch, i, t, size, color }: { ch: string; i: number; t: SharedValue<number>; size: number; color: string }) {
  const style = useAnimatedStyle(() => {
    const e = letterEase(t.get(), i, timing);
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
  /* 타임라인(ms) 하나로 로고 · 글자를 다 그린다 — 장면마다 다시 그리지 않게 UI 스레드에서. leave 는 걷힘의 시간 비율(0~1) */
  const t = useSharedValue(reduced ? timing.settleMs : 0);
  const leave = useSharedValue(0);
  /* 움직임 줄이기는 켤 때 값으로 — 연출 도중 설정을 바꿔도 제어기를 새로 만들어 처음부터 다시 돌지 않게 */
  const [still] = useState(reduced);
  const intro = useRef<ReturnType<typeof createIntroController> | null>(null);
  /*
   * 시작 · 걷기 · 치우기 결정은 intro-timeline createIntroController(시험 있음) — 여기는 그 결정을 Reanimated · 시작 화면 · 타이머로 옮길 뿐.
   * 한 번씩만이라 칸을 다시 재도(회전 · 창 크기) 다시 시작하지 않고, 늦게 온 '다 그림' · 타이머가 걷기를 두 번 돌리지 않는다.
   * 붙을 때 만들고 떨어질 때 타이머 · 기다림을 거둔다 — 다시 붙으면(개발 모드 효과 두 번 돌기) 새로 만든다.
   */
  useLayoutEffect(() => {
    /* 다 걷히면 시작 화면 걷기를 다시 남(index · 딥링크 · 사이트)에게 넘긴다 — 붙어 있는 동안만 붙든다 */
    let held = true;
    holdSplash(1);
    const release = () => {
      if (held) holdSplash(-1);
      held = false;
    };
    const timers: ReturnType<typeof setTimeout>[] = [];
    const c = createIntroController(timing, still, {
      frame: (f) => requestAnimationFrame(() => requestAnimationFrame(f)),
      hideSplash: () => SplashScreen.hideAsync().catch(() => undefined),
      later: (f, ms) => {
        timers.push(setTimeout(f, ms));
      },
      runClock: (ms) => t.set(withTiming(ms, { duration: ms, easing: Easing.linear, reduceMotion: ReduceMotion.Never })),
      runLeave: (delay, ms, done) => {
        const go = withTiming(1, { duration: ms, easing: Easing.linear, reduceMotion: ReduceMotion.Never }, (fin) => fin && runOnJS(done)());
        leave.set(delay > 0 ? withDelay(delay, go) : go);
      },
      gone: () => {
        release();
        setGone(true);
      },
    });
    intro.current = c;
    return () => {
      release();
      c.dispose();
      intro.current = null;
      timers.forEach(clearTimeout);
    };
  }, [still, t, leave]);

  /* 테마를 읽기 전엔 기본값이라 — 읽은 뒤에 시작 화면을 걷는다(다크 · 네이비에서 다른 바탕이 번쩍이던 것) */
  const [themed, setThemed] = useState(false);
  useEffect(() => {
    void prefsReady.then(() => setThemed(true));
  }, []);
  /*
   * 로고 칸을 재고 테마를 읽은 뒤 시작 — 큰 로고가 그려진 다음 장면에 시작 화면을 걷고, 다 걷힌 뒤에 시계를 돌린다(먼저 돌리면 시작 화면이 걷혔을 때
   * 로고가 이미 작아지는 중이라 툭 튀었다).
   */
  const begin = useEffectEvent(() => intro.current?.begin());
  useEffect(() => {
    if (slot && themed) begin();
  }, [slot, themed]);
  useEffect(() => {
    const id = setTimeout(() => begin(), START_FALLBACK_MS);
    return () => clearTimeout(id);
  }, []);

  const veil = useAnimatedStyle(() => {
    const e = leaveEase(leave.get());
    return { opacity: 1 - e, transform: [{ scale: reduced ? 1 : 1 + (timing.leaveScale - 1) * e }] };
  });
  /*
   * B 는 늘 '가운데 큰 B' 자리에 그리고(정지 모양 = 시작 장면), 움직임만 이름의 B 칸으로 옮기며 줄인다 — 움직임 스타일이 한 장면 늦게
   * 붙어도 큰 B 가 보일 뿐이다(예전엔 B 를 칸 자리에 그리고 키워 놓아, 첫 장면에 작은 B · 이름이 잠깐 비쳤다).
   */
  const mark = useAnimatedStyle(() => {
    if (!slot) return { transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }] };
    const e = markEase(t.get(), timing);
    const dx = slot.x + slot.width / 2 - (width / 2 + ox);
    const dy = slot.y + slot.height / 2 - (height / 2 + oy);
    const s = slotH / bigH;
    /* 다 옮겨지면 감추고 칸 자리의 '제 크기 B'로 바꾼다 — 150pt 그림을 0.27배로 줄여 둔 채면 장면이 바뀔 때 계단처럼 깨져 보였다 */
    return { opacity: markDone(t.get(), timing) ? 0 : 1, transform: [{ translateX: e * dx }, { translateY: e * dy }, { scale: 1 + (s - 1) * e }] };
  });
  const crisp = useAnimatedStyle(() => ({ opacity: slot && markDone(t.get(), timing) ? 1 : 0 }));

  if (gone) return null;
  return (
    /* 가림막이 손가락 · VoiceOver 를 받는다 — 걷힐 때까지 밑 화면은 눌리지 않고, 다 걷히면(gone) 통째로 빠진다 */
    <Animated.View accessibilityViewIsModal style={[StyleSheet.absoluteFill, { backgroundColor: c.page, zIndex: 1000 }, veil]}>
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
