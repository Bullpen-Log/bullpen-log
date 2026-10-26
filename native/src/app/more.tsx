import type { BlurView as BlurViewType } from 'expo-blur';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedProps, useAnimatedStyle, useDerivedValue, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '~/lib/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '~/shell/icon';
import { useMenu, type MenuGroup } from '~/shell/menu-store';
import { tabBarOcclusion, type ShellTab } from '~/shell/tab-bar';
import { destinationOf, leaveTo, leaveWhenShown, openWebAfter } from '~/shell/web-nav';
import { beginMotion, endMotion } from '~/shell/transition';

/**
 * 더보기(앱) — 아이폰 홈 화면 폴더처럼: 뒤 화면을 흐리고 어둡게 가라앉히고(expo-blur), 그 위에 '메뉴' 큰 제목과 반투명 유리 폴더가
 * 그림자를 달고 떠오른다(2026-10-21 김민: "뒤가 불투명해지고 폴더가 떠오르는 입체감 — 지금은 배경이랑 겹치는 느낌"). 예전엔 막이 옅은 색 한 겹이라
 * 라이트 테마에서 흰 폴더가 흰 배경에 묻혔다. 폴더 안은 투명 아이콘 + 이름이 셋씩, 묶음 제목은 60%, 맨 밑에 설정 타일 · 내 정보 줄.
 * 하단 탭에 있는 넷(홈 · 투구 · 트레이닝 · 영양)은 뺀다. 막을 누르면 닫힌다(아이폰 폴더처럼 닫기 단추 없음).
 * 목록은 사이트가 알려 준 메뉴 묶음(lib/nav.ts visibleGroups · 잠김까지). 누르면 닫고 그곳으로(앱 화면이 있는 곳은 앱 화면 — 껍데기가 가른다).
 *
 * 폴더 높이(2026-10-26 아이폰 레이아웃 점검): 폴더는 시계 자리와 탭 막대 사이에 들어가는 만큼만 크고, 넘치는 메뉴는 폴더 안에서 굴린다.
 * 예전엔 높이 한도 · 스크롤이 없어 메뉴가 많으면(관리자 · 잠긴 칸) 위의 '메뉴' 제목과 밑의 내 정보 줄이 화면 밖으로 잘렸다.
 * 굴릴 게 있을 때만 폴더 안 끌어내려 닫기를 끈다(스크롤과 다투지 않게) — 그때도 '메뉴' 제목을 끌거나 바깥 막을 누르면 닫힌다.
 */
/* 웹 nav-icons.tsx NAV_ICONS 와 같은 선 그림 */
const ICON: Record<string, IconName> = {
  home: 'house',
  baseball: 'baseball',
  dumbbell: 'dumbbell',
  film: 'film',
  utensils: 'utensils',
  target: 'pitcher',
  zone: 'zone',
  book: 'book-open',
  settings: 'settings',
  shield: 'shield',
  gauge: 'gauge',
  clapper: 'clapperboard',
  radar: 'radar',
  body: 'pitcher',
  /* 3D 스윙 분석 · 3D 개발 관리자 — 타자(2026-10-22), 타격 — 방망이 */
  batter: 'batter',
  bat: 'baseball-bat',
  community: 'messages-square',
  /* 2026-10-22 둥근 그림 — 웹 nav-icons.tsx 와 같게(관리자는 'admin' 별 방패, 'shield' 는 홈 요약 칸 컨디션) */
  heart: 'armcare',
  calendar: 'log',
  users: 'people',
  admin: 'admin',
  back: 'back',
  support: 'life-buoy',
  menu: 'menu',
};
/**
 * 하단 탭에도 있는 메뉴 항목 — 폴더에서 뺀다(웹 detail-menu.tsx inTabBar: 같은 길이 두 번). 잠기면 주소가 바뀌어 이름 · 그림으로 견준다(네이티브3).
 * 탭은 사이트가 보낸 지금 탭(menu-store tabs) — 고정 목록이면 사이트가 탭을 바꿔도 더보기가 따라가지 않았다
 */
const inTabBar = (it: { label: string; icon: string }, tabs: ShellTab[]) => tabs.some((t) => t.label === it.label && t.icon === it.icon);
/* 테마별 색 — 웹 globals.css(2026-10-14 사용자 "화이트는 희게 반투명 · 타일 옅은 하늘색, 네이비는 네이비 반투명, 다크는 그대로") */
/*
 * scrim = 흐린 뒤 화면 위에 얹는 어둠(모든 테마에서 가라앉혀 폴더 · 흰 제목이 떠 보이게), folder = 폴더 유리 색. 라이트는 폴더를 더 희게(0.62 → 0.8) —
 * 뒤가 어두워져 흰 유리가 또렷이 뜬다.
 */
const LOOK = {
  dark: { scrim: 'rgba(0,0,0,0.42)', folder: 'rgba(255,255,255,0.16)', border: 'rgba(255,255,255,0.26)', fg: '#ffffff', tile: 'rgba(255,255,255,0.14)', ring: 'rgba(255,255,255,0.22)', glyph: '#ffffff', gloss: 'rgba(255,255,255,0.45)' },
  navy: { scrim: 'rgba(4,9,20,0.45)', folder: 'rgba(30,41,59,0.62)', border: 'rgba(148,163,184,0.3)', fg: '#ffffff', tile: 'rgba(51,65,85,0.55)', ring: 'rgba(148,163,184,0.3)', glyph: '#ffffff', gloss: 'rgba(255,255,255,0.35)' },
  light: { scrim: 'rgba(16,22,34,0.28)', folder: 'rgba(255,255,255,0.8)', border: 'rgba(255,255,255,0.95)', fg: '#1d1d1f', tile: 'rgba(10,132,214,0.16)', ring: 'rgba(10,132,214,0.22)', glyph: '#0a6fb8', gloss: 'rgba(255,255,255,0.7)' },
} as const;
/* 뒤 화면 흐림 — 아이폰 폴더 뒤(홈 화면 배경이 크게 번짐)만큼. 어둠은 위 scrim 이 따로 얹는다 */
const BACKDROP_BLUR = 60;
/*
 * expo-blur 는 2026-10-21 에 넣은 네이티브 부품이라 그 전에 구운 앱(개발용 '불펜로그 테스트' 등)에는 없다 — 그때 불러오면 화면째 멈추니
 * 부품이 있을 때만 불러오고, 없으면 흐림 없이 어둠만(조금 더 진하게) 깐다.
 */
const BlurView: typeof BlurViewType | null = requireOptionalNativeModule('ExpoBlur')
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('expo-blur') as typeof import('expo-blur')).BlurView
  : null;
/* 흐림은 투명도로 옅게 하면 iOS 가 흐림을 끊어 그려(옅어지는 동안 흐림이 사라졌다 뒤늦게 켜짐) 세기(intensity)로 움직인다 */
const AnimatedBlur = BlurView ? Animated.createAnimatedComponent(BlurView) : null;
/* 폴더가 떠 보이는 그림자 — 가까운 것 · 먼 것 두 겹 */
const FOLDER_SHADOW = '0 2px 6px rgba(0,0,0,0.12), 0 24px 60px -12px rgba(0,0,0,0.38)';
/* 끌어내려 닫기 — 웹 detail-menu startDrag: 12px 넘게 거의 세로로 움직이면 끌기, 100px(빠르면 48px) 넘으면 닫힘 */
const DRAG_START = 12;
const DRAG_CLOSE = 100;
const DRAG_FLICK = 48;
const SLIDE = Easing.bezier(0.32, 0.72, 0, 1);

/** 제목 없는 묶음(홈 · 투구 · …)은 한 판으로 이어 붙인다 — 묶음마다 한 줄이면 칸이 비었다(웹과 같다) */
function folderGroups(groups: MenuGroup[], tabs: ShellTab[]): MenuGroup[] {
  const out: MenuGroup[] = [];
  for (const g of groups) {
    const items = g.items.filter((it) => !inTabBar(it, tabs) && !it.hidden);
    if (!items.length) continue;
    const last = out[out.length - 1];
    if (!g.title && last && !last.title) last.items = [...last.items, ...items];
    else out.push({ title: g.title, items });
  }
  return out;
}

/** 웹이 그리기를 기다리는 더보기 닫기(open) — 화면이 먼저 닫히면 그만둔다 */
let stopLeave: (() => void) | null = null;
const endMore = () => endMotion('more');
const holdLeave = (stop: () => void) => {
  stopLeave = stop;
};
const dropLeave = () => {
  stopLeave?.();
  stopLeave = null;
};

export default function MoreScreen() {
  const inset = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { groups, nickname, avatarUrl, isAdmin, tabs } = useMenu();
  const theme = useTheme();
  const L = LOOK[theme];
  const reduce = useReducedMotion();
  /* 타일 크기는 화면 높이가 정한다 — 굴리지 않고 한 장에(웹 --tile: clamp(40px, (100dvh − 34rem) / 5, 52px)) */
  const tile = Math.max(40, Math.min(52, (height - 34 * 16) / 5));
  const glass = isLiquidGlassAvailable();

  /*
   * 하단 탭 '더보기' 자리에서 부풀어 뜬다(웹 folder-in: transform-origin 88% 100%, 0.55 → 1, 320ms).
   * 막은 함께 진해지고, 막을 누르면 같은 자리로 140ms 에 줄어들며 닫힌다(웹 folder-out ease-in).
   */
  const grow = useSharedValue(0);
  const dragY = useSharedValue(0);
  /*
   * 폴더 크기는 잰 뒤에 부풀기 시작한다 — 크기를 모르는 첫 장면들은 한가운데에서 부풀다가 크기가 오면 더보기 자리로 튀었다(2026-10-24 두 번째 검토)
   */
  const box = useSharedValue({ w: 0, h: 0 });
  const started = useRef(false);
  const measured = (w: number, h: number) => {
    box.set({ w, h });
    if (started.current) return;
    started.current = true;
    /* 부풀고 줄어드는 동안은 움직이는 중으로 적는다 — 밑의 판 붙이기 · 새로 받기가 그 뒤에 돈다(shell/transition.ts) */
    beginMotion('more');
    grow.set(
      withTiming(1, { duration: reduce ? 0 : 320, easing: Easing.bezier(0.2, 0.9, 0.3, 1.05) }, (done) => {
        if (done) runOnJS(endMore)();
      })
    );
  };
  const folderStyle = useAnimatedStyle(() => {
    const g = grow.value;
    const sc = 0.55 + 0.45 * g;
    const b = box.value;
    return {
      opacity: Math.min(1, g * 1.6),
      transform: [{ translateX: 0.38 * b.w * (1 - sc) }, { translateY: 0.5 * b.h * (1 - sc) + dragY.value }, { scale: sc }],
    };
  });
  const fade = useDerivedValue(() => Math.min(1, grow.value) * (1 - Math.min(1, dragY.value / 400)));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const blurProps = useAnimatedProps(() => ({ intensity: BACKDROP_BLUR * fade.value }));

  const gone = () => {
    endMotion('more');
    router.back();
  };
  const close = () => {
    beginMotion('more');
    grow.set(
      withTiming(0, { duration: reduce ? 0 : 140, easing: Easing.in(Easing.ease) }, (done) => {
        if (done) runOnJS(gone)();
      })
    );
  };
  /* 폴더 안이 넘치나(굴릴 게 있나) — 스크롤 칸의 보이는 높이 · 내용 높이를 재서 */
  const [viewH, setViewH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const overflow = viewH > 0 && contentH > viewH + 1;
  /* 끌어내려 닫기 — 폴더가 손가락을 따라 내려오다 놓으면 아래로 미끄러져 닫히거나(280ms) 제자리로(220ms). 제목 줄은 늘, 폴더 전체는 굴릴 게 없을 때만 */
  const pull = () => Gesture.Pan()
    .activeOffsetY(DRAG_START)
    .failOffsetX([-DRAG_START, DRAG_START])
    .onUpdate((e) => {
      dragY.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      const far = e.translationY > DRAG_CLOSE || (e.translationY > DRAG_FLICK && e.velocityY > 600);
      if (far) {
        dragY.set(withTiming(height, { duration: 280, easing: SLIDE }, (done) => done && runOnJS(gone)()));
      } else {
        dragY.set(withTiming(0, { duration: 220, easing: SLIDE }));
      }
    });
  /* 둘 중 하나만 켠다 — 둘 다 켜면 제목을 끌 때 두 번 닫혀(router.back 두 번) 밑 화면까지 걷힌다 */
  const drag = pull().enabled(!overflow);
  const titleDrag = pull().enabled(overflow);

  /*
   * 폴더는 가는 곳이 보일 때 닫는다 — 예전엔 누르자마자 폴더를 걷고 웹을 옮겨, 웹이 새 화면을 그리는 동안 밑의 옛 화면(앱 판 · 옛 웹)이 보였다가
   * 넘어갔다(2026-10-25 화면 전환 점검). 앱 화면은 예전처럼 다 걷고 연다(먼저 알리면 새로 연 화면까지 같이 걷힌다), 앱 판 · 이미 그 자리인 웹은
   * 밑이 바로 바뀌니 알리고 줄어들며 닫고, 웹 화면은 웹이 그렸다고 알려 온 뒤에 줄어들며 닫는다. 기다리는 동안 누른 칸에 돌개 · 다른 칸은 막는다
   */
  const [leaving, setLeaving] = useState<string | null>(null);
  /* 기다리는 중에 끌어내려 · 막을 눌러 먼저 닫으면 기다림을 그만둔다(router.back 이 두 번이면 밑 화면까지 걷힌다) */
  useEffect(
    () => () => {
      dropLeave();
      endMotion('more');
    },
    []
  );
  const open = (href: string) => {
    if (leaving) return;
    const to = destinationOf(href);
    if (to === 'native') return leaveTo(href);
    setLeaving(href);
    if (to === 'now') {
      openWebAfter(href);
      close();
    } else holdLeave(leaveWhenShown(href, close));
  };
  const tileOf = (key: string, label: string, icon: IconName, onPress: () => void, locked = false) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityLabel={locked ? `${label}(설정 전)` : label}
      onPress={onPress}
      disabled={leaving != null}
      accessibilityState={{ busy: leaving === key, disabled: leaving != null }}
      style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.95 }] }]}
    >
      <View
        style={[
          styles.icon,
          {
            width: tile,
            height: tile,
            /* 웹 app-icon 둥근 네모 22.5% */
            borderRadius: tile * 0.225,
            backgroundColor: L.tile,
            borderColor: L.ring,
            boxShadow: `inset 0 1px 0 ${L.gloss}`,
            opacity: locked ? 0.55 : 1,
          },
        ]}
      >
        {leaving === key ? <ActivityIndicator color={L.glyph} /> : <Icon name={icon} size={tile * 0.5} color={L.glyph} />}
        {locked ? (
          <View style={[styles.lock, { backgroundColor: L.tile }]}>
            <Icon name="lock" size={11} color={L.glyph} />
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={[styles.tileLabel, { color: L.fg }, locked && { opacity: 0.55 }]}>
        {label}
      </Text>
    </Pressable>
  );

  const folders = folderGroups(groups, tabs);
  const body = (
    <ScrollView
      style={styles.body}
      contentContainerStyle={{ paddingTop: 24, paddingHorizontal: 22, paddingBottom: 22, gap: 12 }}
      scrollEnabled={overflow}
      bounces={overflow}
      showsVerticalScrollIndicator={overflow}
      onLayout={(e) => setViewH(e.nativeEvent.layout.height)}
      onContentSizeChange={(_, h) => setContentH(h)}
    >
      {folders.map((g, gi) => (
        <View key={g.title ?? `g${gi}`} style={[styles.grid, gi > 0 && { marginTop: 4 }]}>
          {g.title ? <Text style={[styles.groupTitle, { color: L.fg, opacity: 0.6 }]}>{g.title}</Text> : null}
          {g.items.map((it) => tileOf(it.href, it.label, ICON[it.icon] ?? 'menu', () => open(it.href), it.locked))}
        </View>
      ))}
      {/* 설정 — 묶음 뒤 따로 한 줄(웹 detail-menu: 모든 묶음 뒤) */}
      <View style={[styles.grid, { marginTop: 12 }]}>
        {tileOf('settings', '설정', 'settings', () => router.push('/settings' as Href))}
        {/* 팀 · 레슨장 공간(1단계) — 초대 코드로 들어가기 · 공유 범위 · 받은 일지 */}
        {tileOf('org', '팀 · 레슨장', 'people', () => router.push('/org' as Href))}
      </View>
      {/* 내 정보 — 폴더 밑 줄(웹 Avatar · 닉네임 · '내 정보') */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/profile' as Href)}
        style={({ pressed }) => [styles.me, { borderTopColor: theme === 'light' ? 'rgba(29,29,31,0.1)' : 'rgba(255,255,255,0.2)' }, pressed && { opacity: 0.6 }]}
      >
        <View style={[styles.avatar, { backgroundColor: L.tile }]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />
          ) : (
            <Text style={{ color: L.glyph, fontSize: 15, fontWeight: '600' }}>{nickname ? nickname.slice(0, 1) : '나'}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: L.fg, fontSize: 15, fontWeight: '400' }}>
            {nickname || '내 정보'}
          </Text>
          <Text style={{ color: L.fg, opacity: 0.65, fontSize: 13 }}>{isAdmin ? '관리자' : '내 정보'}</Text>
        </View>
      </Pressable>
    </ScrollView>
  );

  return (
    <GestureDetector gesture={drag}>
      <View style={{ flex: 1 }} onAccessibilityEscape={close}>
        {AnimatedBlur ? (
          <AnimatedBlur
            pointerEvents="none"
            animatedProps={blurProps}
            tint={theme === 'light' ? 'systemThinMaterialLight' : 'systemThinMaterialDark'}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, scrimStyle]}>
          {!AnimatedBlur ? <View style={[StyleSheet.absoluteFill, { backgroundColor: L.scrim }]} /> : null}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: L.scrim }]} />
        </Animated.View>
        {/*
          위는 시계 자리 + 12, 밑은 탭 막대가 실제로 가리는 높이 + 12 만큼 비운다 — 폴더가 그 사이에 들어가고 넘치면 안에서 굴린다.
          예전 밑 여백 '안전 영역 + 72' 는 홈 단추 아이폰(안전 영역 0)에서 막대 윗변(72)과 딱 붙었다.
        */}
        <Pressable
          accessibilityLabel="메뉴 닫기"
          onPress={close}
          style={[styles.scrim, { paddingTop: inset.top + 12, paddingBottom: tabBarOcclusion(inset.bottom) + 12 }]}
        >
          {/* 폴더 안을 눌러도 닫히지 않게 — 안쪽 Pressable 이 누름을 먼저 받는다 */}
          <Animated.View
            accessibilityViewIsModal
            style={[styles.folderWrap, folderStyle]}
            onLayout={(e) => measured(e.nativeEvent.layout.width, e.nativeEvent.layout.height)}
          >
            {/* 폴더 위 큰 제목 — 아이폰 폴더 이름처럼 흰 글자(뒤가 어두워져 늘 읽힌다). 폴더 안을 굴릴 때도 이 줄을 끌어내리면 닫힌다 */}
            <GestureDetector gesture={titleDrag}>
              <Text accessibilityRole="header" style={styles.title}>
                메뉴
              </Text>
            </GestureDetector>
            <Pressable accessibilityRole="menu" accessibilityLabel="메뉴" onPress={() => undefined} style={styles.lift}>
              {glass ? (
                <GlassView glassEffectStyle="regular" colorScheme={theme === 'light' ? 'light' : 'dark'} tintColor={L.folder} style={[styles.folder, { borderWidth: 1, borderColor: L.border }]}>
                  {body}
                </GlassView>
              ) : (
                <View style={[styles.folder, { backgroundColor: L.folder, borderWidth: 1, borderColor: L.border }]}>{body}</View>
              )}
            </Pressable>
          </Animated.View>
        </Pressable>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  /* 높이는 막 안쪽(시계 자리 ~ 탭 막대)에 맞춰 줄어든다 — 넘치면 폴더 안(body)이 굴러간다 */
  folderWrap: { width: '88%', maxWidth: 352, flexShrink: 1 },
  title: { color: '#ffffff', fontSize: 30, fontWeight: '700', letterSpacing: -0.5, marginLeft: 8, marginBottom: 14, textShadowColor: 'rgba(0,0,0,0.18)', textShadowRadius: 8 },
  /* 그림자는 겉에(폴더 안쪽은 overflow hidden 이라 잘린다) */
  lift: { borderRadius: 36, boxShadow: FOLDER_SHADOW, flexShrink: 1 },
  folder: { borderRadius: 36, overflow: 'hidden', flexShrink: 1 },
  /* 내용만큼 크고(flexGrow 0) 자리가 모자라면 줄어 굴러간다 */
  body: { flexGrow: 0, flexShrink: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  groupTitle: { width: '100%', fontSize: 11, fontWeight: '600', paddingHorizontal: 4, marginBottom: -4 },
  tile: { width: `${100 / 3}%`, alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  lock: { position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontSize: 13, lineHeight: 16, fontWeight: '400', maxWidth: '100%' },
  me: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, paddingTop: 12, borderTopWidth: 1, borderRadius: 16, paddingHorizontal: 4 },
  avatar: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
