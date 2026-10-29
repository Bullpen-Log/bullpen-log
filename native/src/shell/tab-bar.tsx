import * as Haptics from 'expo-haptics';
import { emitRetap } from './tab-pager';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import Animated, { Easing, Extrapolation, interpolate, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette, useTheme, withAlpha } from '~/lib/ui';
import { Icon, type IconName } from '~/shell/icon';
import { TAB_MOTION, tabDragPosition, tabIndexAt, tabReleaseIndex } from './tab-bar-motion';

/**
 * 앱 아래 탭 막대 — 2026-10-25 App Store 참고 영상의 잡기·끌기·놓기를 따른다. 바닥에서 떠 있는 둥근 유리 알약(양옆 20 · 칸 52 · 알약 62 · 밑 틈은 홈 막대 자리에
 * 13 걸쳐), 짧은 탭은 선택판이 미끄러지고 잡은 채 끌 때는 큰 유리 렌즈가 손가락을 따른다. 테마마다 그 색의 유리 — 라이트: 흰 유리 · 고른 칸 파랑,
 * 다크: 검은 유리 · 흰 글자, 네이비: 남색 유리. iOS 26 이면 진짜 유리(GlassView), 아니면 웹 CSS 의 반투명 색.
 * 탭 이름 · 주소 · 잠김은 사이트가 알려 준다(components/app-shell/expo-tabs.tsx).
 */
/** locked — 누르면 그 기능의 첫 설정(setup), 또는 출시 전 베타라 안내만 하고 안 옮김(beta — 2026-10-29, native/src/shell/release.ts) */
export type ShellTab = { href: string; label: string; icon: string; locked?: boolean; lockReason?: 'setup' | 'beta' };

export const DEFAULT_TABS: ShellTab[] = [
  /* 차례 홈 · 투구 · 트레이닝 · 기록 · 덕아웃(2026-10-29 확정 디자인, 웹 lib/nav.ts APP_TABS). 더보기는 각 탭 위 오른쪽 메뉴(shell/menu-button.tsx) */
  { href: '/today', label: '홈', icon: 'home' },
  { href: '/videos', label: '투구', icon: 'baseball' },
  { href: '/training?view=home', label: '트레이닝', icon: 'dumbbell' },
  { href: '/records', label: '기록', icon: 'records' },
  { href: '/?dugout=1', label: '덕아웃', icon: 'users' },
];

/**
 * 투구 · 타격을 누르면 갈아 끼우는 종목 바(웹 lib/nav.ts SPORT_BARS — ‹ 는 TabBar back 이 따로 그린다). 사이트가 잠금을 입혀 보내 주고({ t: 'tabs', sports }),
 * 이것은 그 전에 쓰는 기본값이다.
 */
export type SportKey = 'pitch' | 'hit';
export const DEFAULT_SPORT_BARS: Record<SportKey, ShellTab[]> = {
  /* 첫 칸 = 종목 홈(이름은 종목 이름, 2026-10-20 김민), 기록은 ?view=log — 웹 lib/nav.ts SPORT_BARS */
  pitch: [
    { href: '/videos', label: '투구', icon: 'baseball' },
    { href: '/videos?view=log', label: '기록', icon: 'calendar' },
    { href: '/training?sport=pitch', label: '트레이닝', icon: 'dumbbell' },
    { href: '/training?view=armcare', label: '암케어', icon: 'heart' },
    { href: '/training?view=mechanics', label: '메카닉', icon: 'target' },
  ],
  hit: [
    { href: '/hitting', label: '타격', icon: 'bat' },
    { href: '/hitting?view=log', label: '기록', icon: 'calendar' },
    { href: '/training?sport=hit', label: '트레이닝', icon: 'dumbbell' },
  ],
};

/** 지금 주소가 어느 종목 안인지(null = 기본 막대) — 웹 lib/nav.ts sportOf 와 같은 규칙 */
export function sportOfPath(path: string, search: string): SportKey | null {
  if (path === '/hitting' || path.startsWith('/hitting/')) return 'hit';
  if (path === '/videos' || path.startsWith('/videos/') || path.startsWith('/pitch-log/')) return 'pitch';
  if (path === '/training') {
    const sp = new URLSearchParams(search);
    const view = sp.get('view');
    if (view === 'home' || view === 'last') return null;
    if (view === 'armcare' || view === 'mechanics') return 'pitch';
    const sport = sp.get('sport');
    return sport === 'hit' ? 'hit' : 'pitch';
  }
  if (path === '/training/setup') return 'pitch';
  return null;
}

/* 웹 하단 탭과 같은 선 그림(nav-icons.tsx · glyphs.tsx Squares) — 26px */
const GLYPH: Record<string, IconName> = {
  home: 'house',
  baseball: 'baseball',
  dumbbell: 'dumbbell',
  /* 타격 탭 · 종목 바(2026-10-20) */
  bat: 'baseball-bat',
  /* 기록 · 암케어 — 둥근 그림(2026-10-22, 웹 nav-icons.tsx 와 같게) */
  calendar: 'log',
  heart: 'armcare',
  back: 'back',
  target: 'pitcher',
  body: 'pitcher',
  batter: 'batter',
  utensils: 'utensils',
  community: 'messages-square',
  /* 기록 탭(막대 그래프) · 덕아웃 탭(사람 둘) — 2026-10-29 확정 디자인 */
  records: 'chart-no-axes-column',
  users: 'people',
  menu: 'squares',
  /* 커뮤니티 하단바(app/community/index.tsx) — 'community' 는 위(넷째 탭과 같은 그림) */
  flame: 'flame',
  book: 'book-open',
  pencil: 'pencil',
  /* 팀 · 레슨장 공간 탭(lib/org/space-nav.ts spaceTabs, 2026-10-26 S단계) */
  schedule: 'calendar-days',
  people: 'people',
  homework: 'clipboard-list',
  /* 덕아웃 앱 탭(src/dugout/site.ts) */
  market: 'market',
  chat: 'chat',
  user: 'user-round',
};

/**
 * 탭 막대가 차지하는 높이(홈 막대 자리 빼고) — 본문 끝 여백이 쓴다. 떠 있는 알약의 윗변은 바닥에서 '홈 막대 자리 − 13 + 62'(아이폰 34 → 83)라
 * 예전 막대(49 + 34)와 같은 자리다. 웹 globals.css 'Expo 앱 탭'의 --tab-bar-top 도 같은 값.
 */
export const TAB_BAR_HEIGHT = 49;

const ITEM_H = TAB_MOTION.height;
const PAD = 4;

/**
 * 탭 막대가 화면 바닥에서 가리는 높이 = 알약 윗변까지(2026-10-26 아이폰 레이아웃 점검). 알약 60(칸 52 + 위아래 4) + 밑 틈(홈 막대 자리 − 13, 12 보다 좁지 않게).
 * 홈 막대 34(노치 아이폰) 81 · 홈 단추 아이폰(SE 꼴, 0) 72. 탭 위 본문은 이만큼 + 여유를 비운다 — 앱 ScrollView 는 바닥 안전 영역을 저절로 더하지 않는다
 * (RN contentInsetAdjustmentBehavior 기본 never). 예전엔 49 + 24 = 73 만 비워 노치 아이폰에서 끝 8pt 가 막대 밑에 깔렸다.
 * 웹 globals.css 'Expo 앱 탭'의 --tab-bar-top 도 같은 식이다 — 하나를 바꾸면 둘 다.
 */
export function tabBarOcclusion(insetBottom: number): number {
  return Math.max(insetBottom - 13, 12) + ITEM_H + PAD * 2;
}

/** 지금 기기의 탭 막대 가림 높이 — tabBarOcclusion(안전 영역 바닥) */
export function useTabBarOcclusion(): number {
  return tabBarOcclusion(useSafeAreaInsets().bottom);
}
// 손을 놓을 때만 칸 중심으로 스프링. 끌 때는 손가락 좌표를 그대로 따른다.
const POS_SPRING = TAB_MOTION.positionSpring;
const LIFT_SPRING = TAB_MOTION.liftSpring;
/*
 * 딴 하단바로 갈아타기 — 토스뱅크 '증권'(2026-10-20 김민 화면 녹화)처럼 들어오는 순간 옛 막대 자리를 덮은 알약에 고른 탭 하나만 남고,
 * 가운데로 오므라들었다가 왼쪽의 동그란 ← 와 새 탭들로 펴진다(약 0.38초). ← 를 누르면 거꾸로 오므라들며 앞 화면으로.
 */
const MORPH_EASE = Easing.bezier(0.32, 0.72, 0, 1);
const BACK = ITEM_H + PAD * 2;
const BACK_GAP = 8;
/** 하단바 글자가 시스템 글자 크기를 따라 커지는 한도 — 위 TabFace 주석 */
const TAB_LABEL_MAX_SCALE = 1.3;
/** 막대 줄의 가장 넓은 폭(웹 mobile-tabs max-w-md) */
const LINE_MAX = 448;

/** 테마마다 알약 · 렌즈 · 글자 색 — globals.css [data-tab-bar] 의 --tab-base · --tab-edge · --lens-ink · --tab-on · --tab-off */
/** accent = 고른 칸 색(라이트 · 네이비) — 덕아웃 앱은 초록(웹 [data-brand='dugout'] 의 --tab-on). 다크는 둘 다 흰색 */
export type TabAccent = { light: string; navy: string };

function tabColors(theme: 'light' | 'dark' | 'navy', sky: string, muted: string, accent?: TabAccent, more = 0) {
  /*
   * rim = 유리 가장자리 빛(위는 밝게 · 아래는 옅게), tint = 진짜 유리에 얹는 색, lensRim = 렌즈 캡슐의 빛.
   * tint · base 는 2026-10-20 김민 "뒤가 너무 비쳐 하단바가 잘 안 보인다"로 진하게(tint 0.3 → 0.5~0.58, base +0.04~0.06)
   */
  if (theme === 'dark')
    return {
      base: `rgba(28,28,30,${0.93 + more / 2})`, edge: 'rgba(255,255,255,0.18)', lens: 'rgba(255,255,255,0.16)', on: '#ffffff', off: 'rgba(255,255,255,0.62)', shadow: '#000000',
      tint: `rgba(0,0,0,${0.5 + more})`, rim: 'inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(255,255,255,0.06), inset 0 0 0 0.5px rgba(255,255,255,0.16)',
      lensRim: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 2px 8px rgba(0,0,0,0.35)', drop: 0.55,
      glassRim: 'inset 0 1px 1px rgba(255,255,255,0.55), inset 0 0 0 1px rgba(255,255,255,0.22), 0 8px 22px rgba(0,0,0,0.45)',
    };
  if (theme === 'navy')
    return {
      base: `rgba(20,29,43,${0.94 + more / 2})`, edge: 'rgba(180,205,240,0.2)', lens: 'rgba(200,220,255,0.16)', on: accent?.navy ?? '#7dd3fc', off: 'rgba(200,220,255,0.6)', shadow: '#030812',
      tint: `rgba(14,30,60,${0.58 + more})`, rim: 'inset 0 1px 0 rgba(200,225,255,0.3), inset 0 -1px 0 rgba(200,225,255,0.06), inset 0 0 0 0.5px rgba(200,225,255,0.16)',
      lensRim: 'inset 0 1px 0 rgba(220,235,255,0.25), 0 2px 8px rgba(0,0,0,0.35)', drop: 0.55,
      glassRim: 'inset 0 1px 1px rgba(220,235,255,0.55), inset 0 0 0 1px rgba(200,225,255,0.22), 0 8px 22px rgba(0,0,0,0.45)',
    };
  return {
    base: `rgba(255,255,255,${0.92 + more / 2})`, edge: 'rgba(255,255,255,0.9)', lens: 'rgba(120,130,150,0.16)', on: accent?.light ?? sky, off: '#26262a', shadow: '#141e32',
    tint: `rgba(255,255,255,${0.55 + more})`, rim: 'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(255,255,255,0.35), inset 0 0 0 0.5px rgba(255,255,255,0.6)',
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
  accent,
  frosted = false,
  popTo = null,
}: {
  tabs: ShellTab[];
  active: string | null;
  onPress: (t: ShellTab) => void;
  /**
   * 이 탭의 하위 화면에 있으면 그 탭 href — 그 탭을 다시 누르면 맨 위로 굴리는 대신 첫 화면으로 돌아간다(아이폰 하단바와 같다,
   * 2026-10-27 투구 · 타격 하위 화면이 종목 바 대신 하단바를 그대로 쓰게 되면서)
   */
  popTo?: string | null;
  /** 왼쪽에 따로 떨어진 동그란 ← (딴 하단바에서 앞 화면으로) */
  back?: () => void;
  /** 처음 붙을 때 옛 막대에서 오므렸다 펴지며 들어온다 */
  enter?: boolean;
  accent?: TabAccent;
  /**
   * 젖빛 유리(글래스모피즘) — 뒤를 흐리게 거르는 'regular' 유리에 색을 조금 더(+0.06). 예전 'clear' 는 뒤가 그대로 비쳐, 흰 덕아웃 화면 위에서는
   * 유리가 안 보이고 막대가 묽었다(2026-10-25 김민: "글라스모피즘 효과 · 아주 조금만 더 불투명하게"). 덕아웃 앱만 켠다
   */
  frosted?: boolean;
}) {
  const c = usePalette();
  const theme = useTheme();
  const inset = useSafeAreaInsets();
  const col = tabColors(theme, c.sky, c.muted, accent, frosted ? 0.06 : 0);
  const glass = isLiquidGlassAvailable();
  /* 홈 막대 자리에 13 걸쳐(밖에서는 12 보다 좁지 않게) — 웹 --tab-bar-gap */
  const gap = Math.max(inset.bottom - 13, 12);
  const index = Math.max(0, tabs.findIndex((t) => t.href === active));
  const showLens = tabs.some((t) => t.href === active);
  /*
   * 처음 폭은 화면 폭으로 셈해 둔다 — 0 으로 두면 재기 전 한 장면을 숨겨(종목 바로 갈아탈 때마다) 막대가 깜빡 사라졌다(2026-10-24 두 번째 검토).
   * 잰 값(onLayout)이 오면 그것으로
   */
  const win = useWindowDimensions().width;
  const [width, setWidth] = useState(
    () => Math.min(win - Math.max(20, inset.left) - Math.max(20, inset.right), LINE_MAX) - (back ? BACK + BACK_GAP : 0)
  );
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
    /* 오므라드는 움직임이 끝난 뒤에 옮긴다 — 바로 옮기면 이 막대가 그 장면에 떨어져 나가는 연출이 안 보였다 */
    if (reduce) return back();
    open.set(
      withTiming(0, { duration: 220, easing: MORPH_EASE }, (done) => {
        if (done) runOnJS(back)();
      })
    );
  };

  const pos = useSharedValue(index);
  const preview = useSharedValue(index);
  const committed = useSharedValue(index);
  const lift = useSharedValue(0);
  const dragY = useSharedValue(0);
  const speed = useSharedValue(0);
  const touching = useSharedValue(false);
  const shown = useSharedValue(showLens ? 1 : 0);
  const [lensGlass, setLensGlass] = useState(false);
  /*
   * 손가락 처리(JS)가 읽는 값은 JS 쪽 거울에서 — 공유 값을 JS 에서 .get() 하면 UI 스레드에 묻고 답을 기다려, UI 가 바쁘면 손가락 처리가 그만큼 밀렸다
   * (2026-10-26 2차). 이 값들은 JS 에서만 쓰므로 쓸 때 거울도 함께 쓴다.
   */
  const mirror = useRef({ preview: index, committed: index, touching: false });
  const setPreview = (v: number) => {
    mirror.current.preview = v;
    preview.set(v);
  };
  const setTouching = (v: boolean) => {
    mirror.current.touching = v;
    touching.set(v);
  };
  const pending = useRef<string | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ tabs, active, onPress, index, showLens, popTo });
  const keys = JSON.stringify(tabs.map((t) => t.href));

  useEffect(() => {
    latest.current = { tabs, active, onPress, index, showLens, popTo };
  });
  useEffect(() => () => {
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
  }, []);

  // 웹 화면 응답을 기다리는 동안 선택판이 이전 탭으로 튕겨 돌아가지 않게 한다.
  useEffect(() => {
    committed.set(index);
    mirror.current.committed = index;
    shown.set(reduce ? (showLens ? 1 : 0) : withTiming(showLens ? 1 : 0, { duration: 120 }));
    if (pending.current && pending.current !== active && (JSON.parse(keys) as string[]).includes(pending.current)) return;
    pending.current = null;
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    if (!mirror.current.touching) {
      /* setPreview 를 부르면 효과가 그 함수에 매인다 — 거울과 공유 값을 여기서 바로 쓴다 */
      mirror.current.preview = index;
      preview.set(index);
      pos.set(reduce ? index : withSpring(index, POS_SPRING));
    }
  }, [active, index, showLens, keys, cell, reduce, committed, shown, preview, pos]);

  const choose = (href: string, retap: boolean) => {
    const now = latest.current;
    const i = now.tabs.findIndex((t) => t.href === href);
    if (i < 0) return;
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    /* 출시 전 베타로 잠긴 탭 — 렌즈를 옮기지 않고 지금 칸으로 되돌린다. 안내는 껍데기가 띄운다(onPress → noticeLocked) */
    if (now.tabs[i].lockReason === 'beta') {
      pending.current = null;
      setPreview(now.index);
      pos.set(reduce ? now.index : withSpring(now.index, POS_SPRING));
      now.onPress(now.tabs[i]);
      return;
    }
    if (href === now.active) {
      pending.current = null;
      if (retap) {
        if (now.popTo === href) now.onPress(now.tabs[i]);
        else emitRetap();
      }
      return;
    }
    pending.current = href;
    pendingTimer.current = setTimeout(() => {
      pending.current = null;
      const current = latest.current;
      if (mirror.current.touching) return;
      setPreview(current.index);
      pos.set(reduce ? current.index : withSpring(current.index, POS_SPRING));
    }, TAB_MOTION.acknowledgeMs);
    now.onPress(now.tabs[i]);
  };
  // 한 투명 입력 면이 터치 시작부터 끝까지 소유한다. Pan/Pressable 경합이나 시간 기반 입력 차단을 두지 않는다.
  const contact = useRef<{
    keys: string; cell: number; count: number; hrefs: string[];
    originX: number; originY: number; startX: number; startY: number;
    offset: number; moved: boolean; lastX: number; lastAt: number;
  } | null>(null);
  const tick = () => void Haptics.selectionAsync();
  /* 기본 인자에 함수 부름을 두면 React 컴파일러가 TabBar 전체를 건너뛰어(부를 때마다 막대 전체를 다시 그림) 안에서 고른다 */
  const resetTouch = (to?: number) => {
    const settle = to ?? mirror.current.committed;
    contact.current = null;
    setTouching(false);
    setPreview(settle);
    pos.set(reduce ? settle : withSpring(settle, TAB_MOTION.releaseSpring));
    lift.set(reduce ? 0 : withSpring(0, LIFT_SPRING));
    dragY.set(reduce ? 0 : withSpring(0, LIFT_SPRING));
    speed.set(reduce ? 0 : withTiming(0, { duration: 120 }));
    shown.set(latest.current.showLens ? 1 : 0);
    setLensGlass(false);
  };
  const startTouch = (event: GestureResponderEvent) => {
    const e = event.nativeEvent;
    if (e.touches.length !== 1 || cell <= 0 || tabs.length === 0) return;
    const target = tabIndexAt(e.locationX, cell, tabs.length);
    if (target < 0) return;
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pending.current = null;
    contact.current = {
      keys, cell, count: tabs.length, hrefs: tabs.map(t => t.href),
      originX: e.pageX - e.locationX, originY: e.pageY - e.locationY,
      startX: e.locationX, startY: e.locationY,
      offset: e.locationX - (target + 0.5) * cell,
      moved: false, lastX: e.pageX, lastAt: e.timestamp,
    };
    setTouching(true);
    setPreview(target);
    pos.set(reduce ? target : withSpring(target, POS_SPRING));
    lift.set(reduce ? 0 : withTiming(1, { duration: TAB_MOTION.liftDuration }));
    shown.set(1);
    setLensGlass(!reduce);
  };
  const moveTouch = (event: GestureResponderEvent) => {
    const current = contact.current;
    if (!current) return;
    const e = event.nativeEvent;
    if (e.touches.length !== 1 || current.keys !== keys || current.cell !== cell) return resetTouch();
    const x = e.pageX - current.originX;
    const y = e.pageY - current.originY;
    if (!current.moved && Math.hypot(x - current.startX, y - current.startY) < TAB_MOTION.dragThreshold) return;
    current.moved = true;
    const next = tabDragPosition(x, current.offset, current.cell, current.count);
    pos.set(next);
    if (!reduce) {
      dragY.set(Math.max(-10, Math.min(10, (y - current.startY) * 0.18)));
      speed.set(Math.min(1, Math.abs(e.pageX - current.lastX) / Math.max(1, e.timestamp - current.lastAt) / 1.8));
    }
    current.lastX = e.pageX;
    current.lastAt = e.timestamp;
    const target = Math.max(0, Math.min(current.count - 1, Math.round(next)));
    if (target !== mirror.current.preview) { setPreview(target); tick(); }
  };
  const releaseTouch = (event: GestureResponderEvent) => {
    const current = contact.current;
    if (!current) return;
    const e = event.nativeEvent;
    if (current.keys !== keys || current.cell !== cell || e.touches.length > 0) return resetTouch();
    const x = e.pageX - current.originX;
    const y = e.pageY - current.originY;
    const dragged = current.moved || Math.hypot(x - current.startX, y - current.startY) >= TAB_MOTION.dragThreshold;
    const position = dragged ? tabDragPosition(x, current.offset, current.cell, current.count) : tabIndexAt(x, current.cell, current.count);
    const target = tabReleaseIndex(x, y, position, current.cell, current.count);
    resetTouch(target >= 0 ? target : mirror.current.committed);
    if (target < 0) return;
    if (!dragged && target !== mirror.current.committed) tick();
    choose(current.hrefs[target], !dragged);
  };

  const glassLensStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: pos.value * cell },
      { translateY: dragY.value },
      { scaleX: 1 + (TAB_MOTION.liftX + 0.06 * speed.value) * lift.value },
      { scaleY: 1 + (TAB_MOTION.liftY - 0.08 * speed.value) * lift.value },
    ],
  }));
  const fallbackLensStyle = useAnimatedStyle(() => ({ opacity: lift.value * shown.value }));
  const lensStyle = useAnimatedStyle(() => ({
    opacity: shown.value * (1 - lift.value) * interpolate(open.value, [0.7, 1], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateX: pos.value * cell }],
  }));

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
        <GlassView glassEffectStyle="regular" tintColor={col.tint} colorScheme={theme === 'light' ? 'light' : 'dark'} style={[StyleSheet.absoluteFill, { borderRadius: 999 }]} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { borderRadius: 999, backgroundColor: col.base, borderColor: col.edge, borderWidth: 1 }]} />
      )}
      {/* 유리 가장자리 빛 — 위 테두리가 밝게 빛나 두께가 보인다 */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 999, boxShadow: col.rim }]} />
    </>
  );

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
            accessibilityLabel={t.locked ? `${t.label}, ${t.lockReason === 'beta' ? '준비 중' : '설정 전'}` : t.label}
            accessibilityHint={t.lockReason === 'beta' ? '아직 열리지 않은 기능이에요. 누르면 안내가 나와요.' : undefined}
            onPress={() => {
              // 물리 터치는 위의 입력 면, VoiceOver/키보드는 이 버튼으로 처리한다.
              if (!on) tick();
              setPreview(k);
              pos.set(reduce ? k : withSpring(k, POS_SPRING));
              choose(t.href, true);
            }}
            style={[styles.item, t.locked && { opacity: 0.55 }]}
          >
            <Morph open={open} on={on} shift={mid - (PAD + cell * (k + 0.5))}>
              <TabFace tab={t} i={k} preview={preview} lift={lift} onColor={col.on} offColor={col.off} />
            </Morph>
          </Pressable>
        );
      })}
    </>
  );

  const row = <View style={styles.row}>{body}</View>;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: gap, paddingLeft: Math.max(20, inset.left), paddingRight: Math.max(20, inset.right) }]}>
      <View pointerEvents="box-none" style={styles.line}>
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
              {/* ‹ — 둥근 뒤로(2026-10-22, 웹 종목 바 · 둥근 뒤로 단추와 같은 그림) */}
              <Icon name="back" size={24} color={c.ink} />
            </Pressable>
          </Animated.View>
        ) : null}
        <View style={styles.shadow} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {/*
           * 층 차례(밑에서 위로): 유리 판 → 잡은 렌즈 → 아이콘 줄 → 투명 입력 면.
           * 아이콘을 유리 위에 두어 과도한 굴절로 글자가 찌그러지지 않게 한다.
           * 떠 있는 겹 그림자(접촉 · 가까운 · 먼 그림자)는 판에 — 갈아탈 때 판과 같이 오므라든다.
           */}
          <Animated.View pointerEvents="none" style={[styles.bg, { boxShadow: shadowCss }, bgStyle]}>
            {glassFace}
          </Animated.View>
          <View style={[styles.pill, { zIndex: 2 }]}>{row}</View>
          {/* 렌즈는 아이콘 아래에 둔다. 입력 면과 아이콘을 덮지 않는다. */}
          {cell > 0 ? (
            <Animated.View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[
                styles.glassLens,
                { width: cell, zIndex: 1 },
                lensGlass && { boxShadow: col.glassRim },
                glassLensStyle,
                !glass && fallbackLensStyle,
              ]}
            >
              {glass ? (
                <GlassView
                  glassEffectStyle={{ style: lensGlass ? 'clear' : 'none', animate: true, animationDuration: 0.14 }}
                  isInteractive={false}
                  colorScheme={theme === 'light' ? 'light' : 'dark'}
                  style={[StyleSheet.absoluteFill, { borderRadius: 999 }]}
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, { borderRadius: 999, backgroundColor: col.lens, borderWidth: 1, borderColor: col.edge }]} />
              )}
            </Animated.View>
          ) : null}
          <View
            testID="tab-bar-touch-surface"
            accessible={false}
            collapsable={false}
            style={styles.touchSurface}
            onStartShouldSetResponder={() => cell > 0 && tabs.length > 0}
            onResponderGrant={startTouch}
            onResponderStart={(e) => { if (e.nativeEvent.touches.length > 1) resetTouch(); }}
            onResponderMove={moveTouch}
            onResponderRelease={releaseTouch}
            onResponderTerminate={() => resetTouch()}
            onResponderTerminationRequest={() => false}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lockBadge: { position: 'absolute', right: -4, bottom: -3, width: 13, height: 13, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  /* 그림자는 boxShadow — 바탕 없는 칸의 shadow* 는 iOS 가 장면마다 속 그림의 모양을 다시 셈했다(유리 알약 뒤라 바탕을 못 깐다) */
  line: { flexDirection: 'row', width: '100%', maxWidth: LINE_MAX, gap: BACK_GAP },
  shadow: { flex: 1, borderRadius: 999 },
  bg: { position: 'absolute', top: 0, bottom: 0, borderRadius: 999 },
  back: { width: BACK, height: BACK, borderRadius: 999 },
  backHit: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  pill: { flexDirection: 'row', padding: PAD, borderRadius: 999 },
  touchSurface: { position: 'absolute', top: PAD, left: PAD, right: PAD, height: ITEM_H, zIndex: 4 },
  row: { flex: 1, flexDirection: 'row' },
  lens: { position: 'absolute', top: 0, left: 0, height: ITEM_H, borderRadius: 999 },
  glassLens: { position: 'absolute', top: PAD, left: PAD, height: ITEM_H, borderRadius: 999 },
  item: { flex: 1, height: ITEM_H, alignItems: 'center', justifyContent: 'center', gap: 2, paddingTop: 2, borderRadius: 999 },
  label: { fontSize: 11 },
  face: { alignItems: 'center', justifyContent: 'center', gap: 2 },
});

/** 선택 색만 교차한다. 렌즈 안에 복제된 가로 아이콘 띠를 두지 않는다. */
function TabFace({ tab, i, preview, lift, onColor, offColor }: {
  tab: ShellTab;
  i: number;
  preview: SharedValue<number>;
  lift: SharedValue<number>;
  onColor: string;
  offColor: string;
}) {
  const neutral = useAnimatedStyle(() => ({ opacity: preview.value === i ? 0 : 1 }));
  const selected = useAnimatedStyle(() => ({ opacity: preview.value === i ? 1 : 0 }));
  const zoom = useAnimatedStyle(() => ({ transform: [{ scale: preview.value === i ? 1 + 0.10 * lift.value : 1 }] }));
  const face = (on: boolean) => (
    <>
      <View>
        <Icon name={GLYPH[tab.icon] ?? 'house'} size={26} color={on ? onColor : offColor} filled={on} />
        {tab.locked ? (
          <View style={styles.lockBadge}>
            <Icon name="lock" size={9} color={on ? onColor : offColor} strokeWidth={3} />
          </View>
        ) : null}
      </View>
      {/*
        큰 글씨에서도 칸(높이 ITEM_H) 안에 — 아이콘 26 · 사이 2 를 빼면 글자 줄에 22pt 남아 1.3배(11 → 14.3pt, 줄 약 17pt)까지. 칸이 좁은 종목 바에서
        '트레이닝'처럼 긴 이름은 폭에 맞춰 줄인다(2026-10-27 HIG 검토 — 10pt · 한도 없음이라 접근성 최대 글씨에서 31pt 로 칸을 넘쳤다).
        아이폰 기본 하단바는 글자를 아예 안 키우고 길게 눌러 크게 보기를 쓰지만, 여기는 길게 눌러 끌기라 그 대신 한도를 둔다.
      */}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        maxFontSizeMultiplier={TAB_LABEL_MAX_SCALE}
        style={[styles.label, { color: on ? onColor : offColor, fontWeight: on ? '600' : '500' }]}
      >
        {tab.label}
      </Text>
    </>
  );
  return (
    <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={zoom}>
      <Animated.View style={[styles.face, neutral]}>{face(false)}</Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.face, selected]}>{face(true)}</Animated.View>
    </Animated.View>
  );
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
