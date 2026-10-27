import * as Haptics from 'expo-haptics';
import { useId, useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedProps,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';
import { useHomeSwipe } from '~/home/camera-swipe';
import { BRAND, MARK_PATH } from '~/shell/mark-path';
import { ballFrame, GRAIN_POINTS, logoRings, SEAM, START_ROTATION, STITCH, THREAD_COLOR, TILT_LIMIT, TILT_Z } from './geometry';

/**
 * 입체 야구공 — 시안 1 '볼 컨트롤'의 공(geometry.ts 의 머리말). 장면마다 바뀌는 것은 길 글자(d)뿐이라 손가락을 따라 돌 때도 홈 전체를 다시 그리지 않는다.
 * 빛은 세상에 고정: 몸통 그러데이션(위 왼쪽이 밝음) → 가죽 결 → 실밥 홈 → 바늘땀 → 로고 → 그늘(가장자리 · 오른쪽 아래) → 파란 테두리 빛(오른쪽) → 하이라이트.
 * 그늘이 실밥 · 로고 위에 겹쳐 가장자리로 돌아간 바늘땀도 같이 어두워진다(시안의 three 조명과 같은 느낌).
 *
 * 움직임(시안): 옆으로 끌면 손가락을 따라(가로 0.017 · 세로 0.012 rad/px, 위아래 ±1.3 까지), 놓으면 빠르기만큼 더 돌다 멈춘다(최대 2.7 rad, 1.1초 감속).
 * 누르면 1.55바퀴 반(π × 1.55)을 1.35초에 감속하며. 손을 뗀 뒤 계속 도는 루프는 없다. 움직임 줄이기면 끌기만 따라오고 누르면 90°씩 바로 넘어간다.
 * 세로로 먼저 움직이면 공은 놓고 홈이 굴러간다(failOffsetY), 홈의 '내 영상' 쓸기보다 공이 먼저다(blocksExternalGesture).
 */
const LOGO = logoRings(MARK_PATH);
const LOGO_PTS = LOGO.points;
const LOGO_RINGS = LOGO.rings;
const SPIN = Math.PI * 1.55;
const SPIN_MS = 1350;
const FLING_MAX = 2.7;
const FLING_MS = 1100;
const EASE_OUT = Easing.out(Easing.cubic);

const APath = Animated.createAnimatedComponent(Path);

export type BallRotation = { rx: SharedValue<number>; ry: SharedValue<number> };

/** 돌림 값 한 벌 — 같은 공을 여러 부품이 같이 돌릴 때(공 잡기 게임) 부르는 쪽이 만든다 */
export function useBallRotation(start = START_ROTATION): BallRotation {
  const rx = useSharedValue<number>(start.rx);
  const ry = useSharedValue<number>(start.ry);
  return useMemo(() => ({ rx, ry }), [rx, ry]);
}

/** 한 번 돌리기 — 누를 때 · 처음 한 번(홈) */
export function spinBall(r: BallRotation, amount = SPIN, ms = SPIN_MS) {
  'worklet';
  cancelAnimation(r.ry);
  r.ry.set(withTiming(r.ry.get() + amount, { duration: ms, easing: EASE_OUT }));
}

export function SinkerBall({
  size,
  radius,
  center,
  rotation,
  interactive = false,
  label = '입체 야구공',
  style,
}: {
  /** 그림 상자 [너비, 높이] */
  size: [number, number];
  radius: number;
  /** 상자 안 공 가운데 — 없으면 가운데(그림자 몫만큼 위) */
  center?: [number, number];
  rotation?: BallRotation;
  interactive?: boolean;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const own = useBallRotation();
  const r = rotation ?? own;
  const [w, h] = size;
  const R = radius;
  const cx = center?.[0] ?? w / 2;
  const cy = center?.[1] ?? h / 2 - R * 0.06;
  const reduce = useReducedMotion();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const color = THREAD_COLOR;

  const frame = useDerivedValue(() =>
    ballFrame(r.rx.get(), r.ry.get(), TILT_Z, cx, cy, R, SEAM, STITCH, GRAIN_POINTS, LOGO_PTS, LOGO_RINGS)
  );
  const seamProps = useAnimatedProps(() => ({ d: frame.value.seam || 'M0 0' }));
  const nearProps = useAnimatedProps(() => ({ d: frame.value.near || 'M0 0' }));
  const midProps = useAnimatedProps(() => ({ d: frame.value.mid || 'M0 0' }));
  const farProps = useAnimatedProps(() => ({ d: frame.value.far || 'M0 0' }));
  const grainProps = useAnimatedProps(() => ({ d: frame.value.grain || 'M0 0' }));
  const logoProps = useAnimatedProps(() => ({ d: frame.value.logo || 'M0 0', fillOpacity: frame.value.logoOpacity * 0.95 }));

  const home = useHomeSwipe();
  /* 끌기 시작 때의 돌림 — 작업 함수가 잡은 객체는 고칠 수 없어 공유 값으로 */
  const startRx = useSharedValue(0);
  const startRy = useSharedValue(0);
  const gesture = useMemo(() => {
    const tick = () => void Haptics.selectionAsync();
    const pan = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .failOffsetY([-10, 10])
      .onBegin(() => {
        cancelAnimation(r.ry);
        cancelAnimation(r.rx);
        startRx.set(r.rx.get());
        startRy.set(r.ry.get());
      })
      .onUpdate((e) => {
        r.rx.set(Math.max(-TILT_LIMIT, Math.min(TILT_LIMIT, startRx.get() + e.translationY * 0.012)));
        r.ry.set(startRy.get() + e.translationX * 0.017);
      })
      .onEnd((e) => {
        if (reduce) return;
        const amount = Math.max(-FLING_MAX, Math.min(FLING_MAX, (e.velocityX / 1000) * 0.9));
        if (Math.abs(amount) < 0.05) return;
        r.ry.set(withTiming(r.ry.get() + amount, { duration: FLING_MS, easing: EASE_OUT }));
      });
    if (home) pan.blocksExternalGesture(home);
    const tap = Gesture.Tap()
      .maxDistance(8)
      .onEnd((_e, ok) => {
        if (!ok) return;
        runOnJS(tick)();
        if (reduce) {
          cancelAnimation(r.ry);
          r.ry.set(r.ry.get() + Math.PI / 2);
        } else spinBall(r);
      });
    return Gesture.Race(pan, tap);
  }, [r, reduce, home, startRx, startRy]);

  const art = (
    <Svg width={w} height={h} pointerEvents="none">
      <Defs>
        <RadialGradient id={`b${id}`} cx={cx - R * 0.24} cy={cy - R * 0.38} r={R * 1.45} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#ffffff" />
          <Stop offset="0.32" stopColor="#f7f4ed" />
          <Stop offset="0.62" stopColor="#e2e2df" />
          <Stop offset="0.86" stopColor="#b9c2c9" />
          <Stop offset="1" stopColor="#8796a3" />
        </RadialGradient>
        <RadialGradient id={`s${id}`} cx={cx - R * 0.3} cy={cy - R * 0.42} r={R * 1.62} gradientUnits="userSpaceOnUse">
          <Stop offset="0.45" stopColor="#14233a" stopOpacity={0} />
          <Stop offset="0.8" stopColor="#14233a" stopOpacity={0.14} />
          <Stop offset="1" stopColor="#14233a" stopOpacity={0.42} />
        </RadialGradient>
        {/* 파란 테두리 빛(시안 rim 0x56baff, 오른쪽 뒤) — 공 오른쪽 바깥에 둔 빛 덩어리를 공 안에만 칠한다 */}
        <RadialGradient id={`r${id}`} cx={cx + R * 1.12} cy={cy - R * 0.08} r={R * 0.78} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#56baff" stopOpacity={0.55} />
          <Stop offset="0.55" stopColor="#56baff" stopOpacity={0.18} />
          <Stop offset="1" stopColor="#56baff" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`h${id}`} cx={cx - R * 0.36} cy={cy - R * 0.44} r={R * 0.5} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#ffffff" stopOpacity={0.55} />
          <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`d${id}`} cx={cx} cy={cy + R * 1.04} r={R * 0.92} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#000000" stopOpacity={0.42} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={cx} cy={cy + R * 1.04} rx={R * 0.9} ry={R * 0.2} fill={`url(#d${id})`} />
      <Circle cx={cx} cy={cy} r={R} fill={`url(#b${id})`} />
      <APath animatedProps={grainProps} stroke="rgb(120,116,105)" strokeOpacity={0.16} strokeWidth={Math.max(0.8, R * 0.011)} strokeLinecap="round" fill="none" />
      <APath animatedProps={seamProps} stroke="#8d352f" strokeOpacity={0.45} strokeWidth={Math.max(0.6, R * 0.009)} fill="none" />
      <APath animatedProps={farProps} stroke={color} strokeOpacity={0.45} strokeWidth={Math.max(1, R * 0.017)} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <APath animatedProps={midProps} stroke={color} strokeOpacity={0.78} strokeWidth={Math.max(1, R * 0.017)} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <APath animatedProps={nearProps} stroke={color} strokeWidth={Math.max(1.1, R * 0.018)} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <APath animatedProps={logoProps} fill={BRAND} />
      <Circle cx={cx} cy={cy} r={R} fill={`url(#s${id})`} />
      <Circle cx={cx} cy={cy} r={R} fill={`url(#r${id})`} />
      <Circle cx={cx} cy={cy} r={R} fill={`url(#h${id})`} />
    </Svg>
  );

  if (!interactive)
    return (
      <View pointerEvents="none" style={[{ width: w, height: h }, style]}>
        {art}
      </View>
    );
  /* 누르는 자리는 공 둘레만(카드 전체를 덮지 않는다) — 위아래로 끌면 홈이 굴러간다 */
  const hit = R * 2.1;
  return (
    <View pointerEvents="box-none" style={[{ width: w, height: h }, style]}>
      {art}
      <GestureDetector gesture={gesture}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityHint="옆으로 밀면 공이 돌아요"
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }]}
          onAccessibilityAction={(e) => {
            const step = e.nativeEvent.actionName === 'decrement' ? -Math.PI / 3 : Math.PI / 3;
            cancelAnimation(r.ry);
            r.ry.set(reduce ? r.ry.get() + step : withTiming(r.ry.get() + step, { duration: 420, easing: EASE_OUT }));
          }}
          style={{ position: 'absolute', left: cx - hit / 2, top: cy - hit / 2, width: hit, height: hit, borderRadius: hit / 2 }}
        />
      </GestureDetector>
    </View>
  );
}
