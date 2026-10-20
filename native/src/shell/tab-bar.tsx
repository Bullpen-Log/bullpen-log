import * as Haptics from 'expo-haptics';
import { emitRetap } from './tab-pager';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, Extrapolation, interpolate, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette, useTheme, withAlpha } from '~/lib/ui';
import { Icon, type IconName } from '~/shell/icon';

/**
 * 앱 아래 탭 막대 — 웹 휴대폰 탭 막대(components/app-shell/mobile-tabs.tsx · app/globals.css [data-tab-bar] · components/tab-lens.ts)와 같은 모양 ·
 * 같은 움직임(2026-10-18 김민: "하단 바도 다르고 느낌이 다르다"). 바닥에서 떠 있는 둥근 유리 알약(양옆 20 · 칸 52 · 알약 62 · 밑 틈은 홈 막대 자리에
 * 13 걸쳐), 지금 탭 뒤의 캡슐(렌즈)이 스프링으로 옮겨 가고 옮기는 동안 살짝 부푼다. 테마마다 그 색의 유리 — 라이트: 흰 유리 · 고른 칸 파랑,
 * 다크: 검은 유리 · 흰 글자, 네이비: 남색 유리. iOS 26 이면 진짜 유리(GlassView), 아니면 웹 CSS 의 반투명 색.
 * 탭 이름 · 주소 · 잠김은 사이트가 알려 준다(components/app-shell/expo-tabs.tsx).
 */
export type ShellTab = { href: string; label: string; icon: string; locked?: boolean };

export const DEFAULT_TABS: ShellTab[] = [
  { href: '/today', label: '홈', icon: 'home' },
  { href: '/videos', label: '투구', icon: 'baseball' },
  /* 셋째 칸 — 트레이닝 → 타격(2026-10-20 김민, 웹 lib/nav.ts MOBILE_TABS). 트레이닝은 투구 · 타격 종목 바 안으로 */
  { href: '/hitting', label: '타격', icon: 'bat' },
  /* 넷째 칸 — 영양 → 커뮤니티(2026-10-20 김민, 웹 lib/nav.ts MOBILE_TABS). 영양은 더보기에 */
  { href: '/community', label: '커뮤니티', icon: 'community' },
  { href: '/more', label: '더보기', icon: 'menu' },
];

/**
 * 투구 · 타격을 누르면 갈아 끼우는 종목 바(웹 lib/nav.ts SPORT_BARS — ‹ 는 TabBar back 이 따로 그린다). 사이트가 잠금을 입혀 보내 주고({ t: 'tabs', sports }),
 * 이것은 그 전에 쓰는 기본값이다.
 */
export type SportKey = 'pitch' | 'hit';
export const DEFAULT_SPORT_BARS: Record<SportKey, ShellTab[]> = {
  pitch: [
    { href: '/videos', label: '기록', icon: 'calendar' },
    { href: '/training?sport=pitch', label: '트레이닝', icon: 'dumbbell' },
    { href: '/training?view=armcare', label: '암케어', icon: 'heart' },
    { href: '/training?view=mechanics', label: '메커니즘', icon: 'target' },
  ],
  hit: [
    { href: '/hitting', label: '기록', icon: 'calendar' },
    { href: '/training?sport=hit', label: '트레이닝', icon: 'dumbbell' },
  ],
};

/** 지금 주소가 어느 종목 안인지(null = 기본 막대) — 웹 lib/nav.ts sportOf 와 같은 규칙 */
export function sportOfPath(path: string, search: string, fallback: SportKey): SportKey | null {
  if (path === '/hitting' || path.startsWith('/hitting/')) return 'hit';
  if (path === '/videos' || path.startsWith('/videos/') || path.startsWith('/pitch-log/')) return 'pitch';
  if (path === '/training') {
    const sp = new URLSearchParams(search);
    const view = sp.get('view');
    if (view === 'home' || view === 'last') return null;
    if (view === 'armcare' || view === 'mechanics') return 'pitch';
    const sport = sp.get('sport');
    return sport === 'hit' || sport === 'pitch' ? sport : fallback;
  }
  if (path === '/training/setup') return fallback;
  return null;
}

/** 종목 바에서 켜진 칸 — 웹 lib/nav.ts sportActiveHref 와 같다 */
export function sportActiveHref(sport: SportKey, path: string, search: string): string {
  if (path === '/training' || path === '/training/setup') {
    const view = new URLSearchParams(search).get('view');
    if (sport === 'pitch' && view === 'armcare') return '/training?view=armcare';
    if (sport === 'pitch' && view === 'mechanics') return '/training?view=mechanics';
    return `/training?sport=${sport}`;
  }
  return sport === 'pitch' ? '/videos' : '/hitting';
}

/* 웹 하단 탭과 같은 선 그림(nav-icons.tsx · glyphs.tsx Squares) — 26px */
const GLYPH: Record<string, IconName> = {
  home: 'house',
  baseball: 'baseball',
  dumbbell: 'dumbbell',
  /* 타격 탭 · 종목 바(2026-10-20) */
  bat: 'baseball-bat',
  calendar: 'calendar-days',
  heart: 'heart-pulse',
  target: 'target',
  utensils: 'utensils',
  community: 'messages-square',
  menu: 'squares',
  /* 커뮤니티 하단바(app/community/index.tsx) — 'community' 는 위(넷째 탭과 같은 그림) */
  flame: 'flame',
  book: 'book-open',
  pencil: 'pencil',
};

/**
 * 탭 막대가 차지하는 높이(홈 막대 자리 빼고) — 본문 끝 여백이 쓴다. 떠 있는 알약의 윗변은 바닥에서 '홈 막대 자리 − 13 + 62'(아이폰 34 → 83)라
 * 예전 막대(49 + 34)와 같은 자리다. 웹 globals.css 'Expo 앱 탭'의 --tab-bar-top 도 같은 값.
 */
export const TAB_BAR_HEIGHT = 49;

const ITEM_H = 52;
const PAD = 4;
/** 웹 tab-lens.ts 의 스프링(자리 k 290 · c 25.5, 부풂 k 420 · c 34) */
const POS_SPRING = { stiffness: 290, damping: 25.5, mass: 1 };
const LIFT_SPRING = { stiffness: 420, damping: 34, mass: 1 };
const LIFT_SX = 0.22;
const LIFT_SY = 0.28;
/*
 * 딴 하단바로 갈아타기 — 토스뱅크 '증권'(2026-10-20 김민 화면 녹화)처럼 들어오는 순간 옛 막대 자리를 덮은 알약에 고른 탭 하나만 남고,
 * 가운데로 오므라들었다가 왼쪽의 동그란 ← 와 새 탭들로 펴진다(약 0.38초). ← 를 누르면 거꾸로 오므라들며 앞 화면으로.
 */
const MORPH_EASE = Easing.bezier(0.32, 0.72, 0, 1);
const BACK = ITEM_H + PAD * 2;
const BACK_GAP = 8;

/** 테마마다 알약 · 렌즈 · 글자 색 — globals.css [data-tab-bar] 의 --tab-base · --tab-edge · --lens-ink · --tab-on · --tab-off */
function tabColors(theme: 'light' | 'dark' | 'navy', sky: string, muted: string) {
  /* rim = 유리 가장자리 빛(위는 밝게 · 아래는 옅게), tint = 진짜 유리에 얹는 색, lensRim = 렌즈 캡슐의 빛 */
  if (theme === 'dark')
    return {
      base: 'rgba(28,28,30,0.88)', edge: 'rgba(255,255,255,0.18)', lens: 'rgba(255,255,255,0.16)', on: '#ffffff', off: 'rgba(255,255,255,0.62)', shadow: '#000000',
      tint: 'rgba(0,0,0,0.3)', rim: 'inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(255,255,255,0.06), inset 0 0 0 0.5px rgba(255,255,255,0.16)',
      lensRim: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 2px 8px rgba(0,0,0,0.35)', drop: 0.55,
      glassRim: 'inset 0 1px 1px rgba(255,255,255,0.55), inset 0 0 0 1px rgba(255,255,255,0.22), 0 8px 22px rgba(0,0,0,0.45)',
    };
  if (theme === 'navy')
    return {
      base: 'rgba(20,29,43,0.9)', edge: 'rgba(180,205,240,0.2)', lens: 'rgba(200,220,255,0.16)', on: '#7dd3fc', off: 'rgba(200,220,255,0.6)', shadow: '#030812',
      tint: 'rgba(14,30,60,0.38)', rim: 'inset 0 1px 0 rgba(200,225,255,0.3), inset 0 -1px 0 rgba(200,225,255,0.06), inset 0 0 0 0.5px rgba(200,225,255,0.16)',
      lensRim: 'inset 0 1px 0 rgba(220,235,255,0.25), 0 2px 8px rgba(0,0,0,0.35)', drop: 0.55,
      glassRim: 'inset 0 1px 1px rgba(220,235,255,0.55), inset 0 0 0 1px rgba(200,225,255,0.22), 0 8px 22px rgba(0,0,0,0.45)',
    };
  return {
    base: 'rgba(255,255,255,0.86)', edge: 'rgba(255,255,255,0.9)', lens: 'rgba(120,130,150,0.16)', on: sky, off: muted, shadow: '#141e32',
    tint: 'rgba(255,255,255,0.3)', rim: 'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(255,255,255,0.35), inset 0 0 0 0.5px rgba(255,255,255,0.6)',
    lensRim: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 4px rgba(20,30,50,0.1)', drop: 0.3,
    glassRim: 'inset 0 1px 1px rgba(255,255,255,0.95), inset 0 -1px 1px rgba(255,255,255,0.5), inset 0 0 0 1px rgba(255,255,255,0.6), 0 6px 18px rgba(20,30,50,0.18)',
  };
}

export function TabBar({
  tabs,
  active,
  onPress,
  back,
  enter = false,
}: {
  tabs: ShellTab[];
  active: string | null;
  onPress: (t: ShellTab) => void;
  /** 왼쪽에 따로 떨어진 동그란 ← (딴 하단바에서 앞 화면으로) */
  back?: () => void;
  /** 처음 붙을 때 옛 막대에서 오므렸다 펴지며 들어온다 */
  enter?: boolean;
}) {
  const c = usePalette();
  const theme = useTheme();
  const inset = useSafeAreaInsets();
  const col = tabColors(theme, c.sky, c.muted);
  const glass = isLiquidGlassAvailable();
  /* 홈 막대 자리에 13 걸쳐(밖에서는 12 보다 좁지 않게) — 웹 --tab-bar-gap */
  const gap = Math.max(inset.bottom - 13, 12);
  const index = Math.max(0, tabs.findIndex((t) => t.href === active));
  const showLens = tabs.some((t) => t.href === active);
  const [width, setWidth] = useState(0);
  const [spin, setSpin] = useState(0);
  const cell = width > 0 ? (width - PAD * 2) / Math.max(1, tabs.length) : 0;
  const reduce = useReducedMotion();
  /* 갈아타기 진행(0 = 옛 막대 자리를 덮은 알약에 고른 탭 하나, 1 = 다 펴짐) */
  const open = useSharedValue(enter && !reduce ? 0 : 1);
  useEffect(() => {
    if (enter && !reduce) open.set(withTiming(1, { duration: 380, easing: MORPH_EASE }));
  }, [enter, reduce, open]);
  /* 알약 좌표에서 막대 줄(← 자리까지)의 가운데 — 오므라든 알약 · 고른 탭이 여기 모인다 */
  const side = back ? BACK + BACK_GAP : 0;
  const mid = (width - side) / 2;
  const leave = () => {
    if (!back) return;
    void Haptics.selectionAsync();
    if (!reduce) open.set(withTiming(0, { duration: 220, easing: MORPH_EASE }));
    back();
  };

  const pos = useSharedValue(index);
  const lift = useSharedValue(0);
  const shown = useSharedValue(showLens ? 1 : 0);
  const first = useRef(true);
  /*
   * 유리 렌즈 — iOS 26 탭 막대처럼 누르거나 옮기는 동안 고른 칸이 투명한 유리(확대 · 가장자리 빛 굴절)로 바뀌어 막대 밖으로 부푼다(2026-10-19 김민
   * 화면 녹화). 유리는 알파로 숨기면 효과가 꺼져서, 스타일을 'none' ↔ 'clear' 로 바꾸고 iOS 가 맺히고 사라지는 움직임을 그린다.
   */
  /* 유리 렌즈는 길게 눌러 끄는 동안만(iOS 와 같다) — 짧게 누르면 캡슐만 미끄러진다(2026-10-19 김민: 누를 때마다 렌즈가 튀어 부자연스러움) */
  const [lensGlass, setHold] = useState(false);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      pos.set(index);
      return;
    }
    pos.set(withSpring(index, POS_SPRING));
    /* 옮기는 동안 렌즈로 부풀었다 닿으면 가라앉는다(웹 영상의 '약간의 탄성') */
    lift.set(withSequence(withSpring(1, LIFT_SPRING), withDelay(160, withSpring(0, LIFT_SPRING))));
  }, [index, pos, lift]);
  useEffect(() => {
    shown.set(withSpring(showLens ? 1 : 0, LIFT_SPRING));
  }, [showLens, shown]);

  /*
   * 눌러 옆으로 밀기 — iOS 26 앱 스토어 탭 막대(2026-10-19 김민 참고 영상)처럼 밀자마자 유리 렌즈가 부푼 채 손가락을 따라오고
   * (칸을 넘을 때마다 톡), 놓은 칸으로 간다. 짧게 누르기 · 지금 탭 다시 누르기는 그대로.
   */
  const under = useSharedValue(-1);
  const haptic = (kind: 'medium' | 'selection' | 'light') =>
    void (kind === 'selection' ? Haptics.selectionAsync() : Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light));
  const drop = (i: number) => {
    const t = tabs[i];
    if (!t || t.href === active) {
      pos.set(withSpring(index, POS_SPRING));
      return;
    }
    haptic('light');
    onPress(t);
  };
  const n = tabs.length;
  const cellAt = (x: number) => {
    'worklet';
    return Math.max(0, Math.min(n - 1, x / Math.max(1, cell) - 0.5));
  };
  const drag = Gesture.Pan()
    .enabled(cell > 0)
    /* 눌러서 옆으로 밀면 바로(앱 스토어 탭 막대처럼) — 세로로 밀거나 짧게 누르는 것은 탭 누르기 그대로 */
    .activeOffsetX([-6, 6])
    .failOffsetY([-14, 14])
    .onStart((e) => {
      const p = cellAt(e.x);
      under.set(Math.round(p));
      pos.set(p);
      lift.set(withSpring(1, LIFT_SPRING));
      runOnJS(setHold)(true);
      runOnJS(haptic)('medium');
    })
    .onUpdate((e) => {
      const p = cellAt(e.x);
      pos.set(p);
      if (Math.round(p) !== under.get()) {
        under.set(Math.round(p));
        runOnJS(haptic)('selection');
      }
    })
    .onEnd((e, ok) => {
      const i = Math.round(cellAt(e.x));
      lift.set(withSpring(0, LIFT_SPRING));
      runOnJS(setHold)(false);
      pos.set(withSpring(ok ? i : index, POS_SPRING));
      if (ok) runOnJS(drop)(i);
    });

  /* 유리 렌즈 — 막대 밖으로 더 크게 부푼다(영상처럼 위아래로 삐져나옴) */
  const glassLensStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: pos.value * cell },
      { scaleX: 1 + 0.32 * lift.value },
      { scaleY: 1 + 0.55 * lift.value },
    ],
  }));
  const lensStyle = useAnimatedStyle(() => ({
    /* 유리 렌즈가 뜨는 동안 회색 캡슐은 옅어진다 · 갈아타는 동안은 다 펴진 뒤에 */
    opacity: shown.value * (glass ? 1 - 0.85 * lift.value : 1) * interpolate(open.value, [0.7, 1], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateX: pos.value * cell },
      { scaleX: 1 + LIFT_SX * lift.value },
      { scaleY: 1 + LIFT_SY * lift.value },
    ],
  }));

  /* 칸 하나의 그림 + 이름 — 아이콘 줄과 유리 렌즈 안(확대돼 보이는 한 벌)이 같이 쓴다 */
  const face = (t: ShellTab, on: boolean) => {
    const color = on ? col.on : col.off;
    return (
      <>
        <View>
          {t.icon === 'menu' ? <SpinSquares color={color} spin={spin} /> : <Icon name={GLYPH[t.icon] ?? 'house'} size={26} color={color} />}
          {/* 잠긴 탭 — 그림 오른쪽 아래 12px 자물쇠(웹 glyphs NavGlyph) */}
          {t.locked ? (
            <View style={[styles.lockBadge, { backgroundColor: col.lens }]}>
              <Icon name="lock" size={9} color={color} strokeWidth={3} />
            </View>
          ) : null}
        </View>
        <Text style={[styles.label, { color, fontWeight: on ? '600' : '500' }]}>{t.label}</Text>
      </>
    );
  };
  /* 갈아타기 — 알약 판은 옛 막대 자리(← 자리까지) → 가운데로 오므라듦 → 제자리, ← 는 펴질 때 옆에서 나온다 */
  const bgStyle = useAnimatedStyle(() => {
    const half = Math.max(ITEM_H, width * 0.25);
    return {
      left: interpolate(open.value, [0, 0.5, 1], [-side, mid - half, 0]),
      right: interpolate(open.value, [0, 0.5, 1], [0, width - mid - half, 0]),
    };
  });
  const backStyle = useAnimatedStyle(() => ({
    opacity: interpolate(open.value, [0.45, 0.85], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(open.value, [0.45, 1], [side / 2, 0], Extrapolation.CLAMP) },
      { scale: interpolate(open.value, [0.45, 1], [0.7, 1], Extrapolation.CLAMP) },
    ],
  }));
  const shadowCss = `0 1px 2px ${withAlpha(col.shadow, col.drop * 0.4)}, 0 8px 22px -4px ${withAlpha(col.shadow, col.drop * 0.8)}, 0 22px 48px -14px ${withAlpha(col.shadow, col.drop)}`;
  /* 유리 판(진짜 유리 또는 반투명 색) + 가장자리 빛 — 알약 · ← 동그라미가 같이 쓴다 */
  const glassFace = (
    <>
      {glass ? (
        /* iOS 26 진짜 유리 — 테마 색을 살짝 얹는다 */
        <GlassView glassEffectStyle="clear" tintColor={col.tint} colorScheme={theme === 'light' ? 'light' : 'dark'} style={[StyleSheet.absoluteFill, { borderRadius: 999 }]} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { borderRadius: 999, backgroundColor: col.base, borderColor: col.edge, borderWidth: 1 }]} />
      )}
      {/* 유리 가장자리 빛 — 위 테두리가 밝게 빛나 두께가 보인다 */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 999, boxShadow: col.rim }]} />
    </>
  );

  /* 렌즈 안의 아이콘 한 벌 — 렌즈가 옮긴 만큼 거꾸로 밀어 밑의 줄과 겹치게, 렌즈가 부풀면 같이 커져 확대돼 보인다. 렌즈 속은 늘 고른 색(파랑) */
  const lensFacesStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -pos.value * cell }] }));

  const body = (
    <>
      {cell > 0 ? (
        <Animated.View pointerEvents="none" style={[styles.lens, { width: cell, backgroundColor: col.lens, boxShadow: col.lensRim }, lensStyle]} />
      ) : null}
      {tabs.map((t, k) => {
        const on = active === t.href;
        return (
          <Pressable
            key={t.href}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.locked ? `${t.label}(설정 전)` : t.label}
            onPressIn={() => {
              if (!on) lift.set(withSpring(0.3, LIFT_SPRING));
            }}
            onPressOut={() => {
              if (!on) lift.set(withSpring(0, LIFT_SPRING));
            }}
            onPress={() => {
              /* 더보기를 열면 네모 넷이 차례로 반 바퀴(웹 glyphs Squares animate-square-spin) */
              if (t.icon === 'menu') setSpin((n) => n + 1);
              /* 떨림은 탭을 옮길 때만(웹 mobile-tabs) — 지금 탭을 다시 누르면 맨 위로 굴린다 */
              if (!on) void Haptics.selectionAsync();
              else emitRetap();
              onPress(t);
            }}
            style={({ pressed }) => [styles.item, t.locked && { opacity: 0.55 }, pressed && { transform: [{ scale: 0.94 }] }]}
          >
            <Morph open={open} on={on} shift={mid - (PAD + cell * (k + 0.5))}>
              <UnderLens i={k} pos={pos} lift={lift} active={glass && lensGlass}>
                {face(t, on)}
              </UnderLens>
            </Morph>
          </Pressable>
        );
      })}
    </>
  );

  /* 손동작은 아이콘 줄에 — 유리 판 · 렌즈보다 위층이라 손가락이 먼저 온다 */
  const row = (
    <GestureDetector gesture={drag}>
      <View collapsable={false} style={styles.row}>{body}</View>
    </GestureDetector>
  );

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: gap, paddingLeft: Math.max(20, inset.left), paddingRight: Math.max(20, inset.right) }]}>
      {/* 갈아탈 때는 폭을 잰 뒤에 보인다 — 재기 전 한 장면은 오므라든 자리를 셀 수 없다 */}
      <View pointerEvents="box-none" style={[styles.line, enter && width === 0 && { opacity: 0 }]}>
        {back ? (
          <Animated.View style={[styles.back, { boxShadow: shadowCss }, backStyle]}>
            {glassFace}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="돌아가기"
              onPress={leave}
              hitSlop={6}
              style={({ pressed }) => [styles.backHit, pressed && { transform: [{ scale: 0.92 }] }]}
            >
              {/* ← (그림 모음에 왼쪽 화살표가 없어 오른쪽 화살표를 돌림) */}
              <View style={{ transform: [{ rotate: '180deg' }] }}>
                <Icon name="arrow-right" size={24} color={c.ink} />
              </View>
            </Pressable>
          </Animated.View>
        ) : null}
        <View style={styles.shadow} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {/*
           * 층 차례(밑에서 위로): 유리 판 → 가장자리 빛 → 유리 렌즈 → 아이콘 줄. 렌즈가 아이콘 위에 오면 아이콘이 굴절돼 일그러졌다
           * (2026-10-19 김민 화면 녹화) — iOS 26 탭 막대처럼 렌즈는 아이콘 밑에 깔리고 아이콘은 또렷하게 위에.
           * 떠 있는 겹 그림자(접촉 · 가까운 · 먼 그림자)는 판에 — 갈아탈 때 판과 같이 오므라든다.
           */}
          <Animated.View pointerEvents="none" style={[styles.bg, { boxShadow: shadowCss }, bgStyle]}>
            {glassFace}
          </Animated.View>
          {/* 유리 렌즈 — 고른 칸 밑에서 막대 밖으로 부푼다(누르기는 그대로 지나간다) */}
          {glass && cell > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.glassLens, { width: cell, zIndex: 1 }, lensGlass && { boxShadow: col.glassRim }, glassLensStyle]}
            >
              <GlassView
                glassEffectStyle={{ style: lensGlass ? 'clear' : 'none', animate: true, animationDuration: 0.22 }}
                colorScheme={theme === 'light' ? 'light' : 'dark'}
                style={[StyleSheet.absoluteFill, { borderRadius: 999, overflow: 'hidden' }]}
              >
                {/* iOS 유리는 형제 층보다 위에 그려져 밑의 아이콘이 뭉개진다 — 유리 안에 아이콘을 한 벌 그려 또렷하게(확대) */}
                {lensGlass ? (
                  <Animated.View style={[styles.lensFaces, { width: cell * tabs.length }, lensFacesStyle]}>
                    {tabs.map((t) => (
                      <View key={t.href} style={[styles.item, { width: cell, flex: 0 }]}>
                        {face(t, true)}
                      </View>
                    ))}
                  </Animated.View>
                ) : null}
              </GlassView>
            </Animated.View>
          ) : null}
          <View style={[styles.pill, { zIndex: 2 }]}>{row}</View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lockBadge: { position: 'absolute', right: -4, bottom: -3, width: 13, height: 13, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  /* 그림자는 boxShadow — 바탕 없는 칸의 shadow* 는 iOS 가 장면마다 속 그림의 모양을 다시 셈했다(유리 알약 뒤라 바탕을 못 깐다) */
  line: { flexDirection: 'row', width: '100%', maxWidth: 448, gap: BACK_GAP },
  shadow: { flex: 1, borderRadius: 999 },
  bg: { position: 'absolute', top: 0, bottom: 0, borderRadius: 999 },
  back: { width: BACK, height: BACK, borderRadius: 999 },
  backHit: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  pill: { flexDirection: 'row', padding: PAD, borderRadius: 999 },
  row: { flex: 1, flexDirection: 'row' },
  lens: { position: 'absolute', top: 0, left: 0, height: ITEM_H, borderRadius: 999 },
  lensFaces: { position: 'absolute', top: 0, left: 0, height: ITEM_H, flexDirection: 'row' },
  glassLens: { position: 'absolute', top: PAD, left: PAD, height: ITEM_H, borderRadius: 999 },
  item: { flex: 1, height: ITEM_H, alignItems: 'center', justifyContent: 'center', gap: 2, paddingTop: 2, borderRadius: 999 },
  label: { fontSize: 10 },
});

/**
 * 더보기의 네모 넷 — 열 때마다 각자 제자리에서 반 바퀴, 왼위 → 오른위 → 왼아래 → 오른아래 차례로 45ms 씩 늦게(420ms).
 * 웹 components/app-shell/glyphs.tsx Squares 와 같은 크기 비율(칸 18.4 · 네모 7.2 · 선 1.9).
 */
const SQ_AT = [
  { left: 0, top: 0 },
  { right: 0, top: 0 },
  { left: 0, bottom: 0 },
  { right: 0, bottom: 0 },
] as const;
function SpinSquares({ color, spin }: { color: string; spin: number }) {
  return (
    <View style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 18.4, height: 18.4 }}>
        {SQ_AT.map((at, i) => (
          <Square key={i} at={at} i={i} color={color} spin={spin} />
        ))}
      </View>
    </View>
  );
}
function Square({ at, i, color, spin }: { at: (typeof SQ_AT)[number]; i: number; color: string; spin: number }) {
  const r = useSharedValue(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!spin || reduce) return;
    r.set(0);
    r.set(withDelay(i * 45, withTiming(180, { duration: 420, easing: Easing.bezier(0.22, 1, 0.36, 1) })));
  }, [spin, i, r, reduce]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.get()}deg` }] }));
  return <Animated.View style={[{ position: 'absolute', width: 7.2, height: 7.2, borderRadius: 2, borderWidth: 1.9, borderColor: color }, at, style]} />;
}

/** 렌즈 밑의 원래 아이콘 — 렌즈가 떠 있는 동안 그 칸만 감춘다(렌즈 안에 확대된 한 벌이 있어, 둘이 겹쳐 이름이 두 번 보였다) */
function UnderLens({ i, pos, lift, active, children }: { i: number; pos: SharedValue<number>; lift: SharedValue<number>; active: boolean; children: ReactNode }) {
  const style = useAnimatedStyle(() => {
    if (!active) return { opacity: 1 };
    const near = Math.max(0, 1 - Math.abs(i - pos.value) * 1.4);
    return { opacity: 1 - near * Math.min(1, lift.value * 1.5) };
  });
  return <Animated.View style={[{ alignItems: 'center', gap: 2 }, style]}>{children}</Animated.View>;
}

/** 갈아타기 중 칸 하나 — 고른 탭은 가운데에 모였다가 제자리로, 나머지는 펴질 때 나타난다 */
function Morph({ open, on, shift, children }: { open: SharedValue<number>; on: boolean; shift: number; children: ReactNode }) {
  const style = useAnimatedStyle(() =>
    on
      ? { opacity: 1, transform: [{ translateX: interpolate(open.value, [0, 0.5, 1], [shift, shift, 0]) }] }
      : { opacity: interpolate(open.value, [0.5, 0.9], [0, 1], Extrapolation.CLAMP), transform: [{ translateX: 0 }] }
  );
  return <Animated.View style={style}>{children}</Animated.View>;
}
