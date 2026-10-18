import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { type Href, router } from 'expo-router';
import { useEffect } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '~/shell/icon';
import { useMenu, type MenuGroup } from '~/shell/menu-store';
import { DEFAULT_TABS } from '~/shell/tab-bar';
import { leaveTo } from '~/shell/web-nav';

/**
 * 더보기(앱) — 웹 휴대폰 더보기 폴더(components/app-shell/detail-menu.tsx · globals.css [data-folder])와 같은 꼴: 화면 전체를 어둡게 덮고
 * 가운데 반투명 유리 폴더, 그 안에 투명 아이콘(흰 그림) + 이름이 셋씩, 묶음 제목은 흰 글자 60%, 맨 밑에 설정 타일 · 내 정보 줄.
 * 하단 탭에 있는 넷(홈 · 투구 · 트레이닝 · 영양)은 뺀다. 막을 누르면 닫힌다(아이폰 폴더처럼 닫기 단추 없음).
 * 목록은 사이트가 알려 준 메뉴 묶음(lib/nav.ts visibleGroups · 잠김까지). 누르면 닫고 그곳으로(앱 화면이 있는 곳은 앱 화면 — 껍데기가 가른다).
 */
/* 웹 nav-icons.tsx NAV_ICONS 와 같은 선 그림 */
const ICON: Record<string, IconName> = {
  home: 'house',
  baseball: 'baseball',
  dumbbell: 'dumbbell',
  film: 'film',
  utensils: 'utensils',
  target: 'target',
  book: 'book-open',
  settings: 'settings',
  shield: 'shield',
  gauge: 'gauge',
  clapper: 'clapperboard',
  radar: 'radar',
  body: 'person-standing',
  community: 'messages-square',
  support: 'life-buoy',
  menu: 'menu',
};
/** 하단 탭에도 있는 메뉴 항목 — 폴더에서 뺀다(웹 detail-menu.tsx inTabBar: 같은 길이 두 번). 잠기면 주소가 바뀌어 이름 · 그림으로 견준다(네이티브3) */
const inTabBar = (it: { label: string; icon: string }) => DEFAULT_TABS.some((t) => t.label === it.label && t.icon === it.icon);
const FG = '#ffffff';

/** 제목 없는 묶음(홈 · 투구 · …)은 한 판으로 이어 붙인다 — 묶음마다 한 줄이면 칸이 비었다(웹과 같다) */
function folderGroups(groups: MenuGroup[]): MenuGroup[] {
  const out: MenuGroup[] = [];
  for (const g of groups) {
    const items = g.items.filter((it) => !inTabBar(it));
    if (!items.length) continue;
    const last = out[out.length - 1];
    if (!g.title && last && !last.title) last.items = [...last.items, ...items];
    else out.push({ title: g.title, items });
  }
  return out;
}

export default function MoreScreen() {
  const inset = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { groups, nickname, avatarUrl, isAdmin } = useMenu();
  /* 타일 크기는 화면 높이가 정한다 — 굴리지 않고 한 장에(웹 --tile: clamp(40px, (100dvh − 34rem) / 5, 52px)) */
  const tile = Math.max(40, Math.min(52, (height - 34 * 16) / 5));
  const glass = isLiquidGlassAvailable();

  /* 하단 탭 '더보기' 자리 쪽에서 부풀어 뜬다(웹 folder-in: 0.55 → 1, 320ms) */
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = withTiming(1, { duration: 320, easing: Easing.bezier(0.2, 0.9, 0.3, 1.05) });
  }, [grow]);
  const folderStyle = useAnimatedStyle(() => ({ opacity: grow.value, transform: [{ scale: 0.55 + 0.45 * grow.value }] }));

  const close = () => router.back();
  const open = (href: string) => leaveTo(href);
  const tileOf = (key: string, label: string, icon: IconName, onPress: () => void, locked = false) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityLabel={locked ? `${label}(설정 전)` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.95 }] }]}
    >
      <View style={[styles.icon, { width: tile, height: tile, borderRadius: tile * 0.28, opacity: locked ? 0.55 : 1 }]}>
        <Icon name={icon} size={tile * 0.5} color={FG} />
        {locked ? (
          <View style={styles.lock}>
            <Icon name="lock" size={11} color={FG} />
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={[styles.tileLabel, locked && { opacity: 0.55 }]}>
        {label}
      </Text>
    </Pressable>
  );

  const folders = folderGroups(groups);
  const body = (
    <View style={{ padding: 20, gap: 12 }}>
      {folders.map((g, gi) => (
        <View key={g.title ?? `g${gi}`} style={[styles.grid, gi > 0 && { marginTop: 4 }]}>
          {g.title ? <Text style={styles.groupTitle}>{g.title}</Text> : null}
          {g.items.map((it) => tileOf(it.href, it.label, ICON[it.icon] ?? 'menu', () => open(it.href), it.locked))}
          {gi === folders.length - 1 ? tileOf('settings', '설정', 'settings', () => router.push('/settings' as Href)) : null}
        </View>
      ))}
      {/* 내 정보 — 폴더 밑 줄(웹 Avatar · 닉네임 · '내 정보') */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/profile' as Href)}
        style={({ pressed }) => [styles.me, pressed && { backgroundColor: 'rgba(255,255,255,0.1)' }]}
      >
        <View style={styles.avatar}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />
          ) : (
            <Text style={{ color: FG, fontSize: 15, fontWeight: '700' }}>{nickname ? nickname.slice(0, 1) : '나'}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: FG, fontSize: 15, fontWeight: '500' }}>
            {nickname || '내 정보'}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>{isAdmin ? '관리자' : '내 정보'}</Text>
        </View>
      </Pressable>
    </View>
  );

  return (
    <Pressable accessibilityLabel="메뉴 닫기" onPress={close} style={[styles.scrim, { paddingTop: inset.top, paddingBottom: inset.bottom }]}>
      {/* 폴더 안을 눌러도 닫히지 않게 — 안쪽 Pressable 이 누름을 먼저 받는다 */}
      <Animated.View style={[styles.folderWrap, folderStyle]}>
        <Pressable accessibilityRole="menu" accessibilityLabel="메뉴" onPress={() => undefined}>
          {glass ? (
            <GlassView glassEffectStyle="regular" colorScheme="dark" style={styles.folder}>
              {body}
            </GlassView>
          ) : (
            <View style={[styles.folder, styles.folderFallback]}>{body}</View>
          )}
        </Pressable>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  folderWrap: { width: '88%', maxWidth: 352 },
  folder: { borderRadius: 36, overflow: 'hidden' },
  folderFallback: { backgroundColor: 'rgba(60,60,67,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  groupTitle: { width: '100%', color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600', paddingHorizontal: 4, marginBottom: -4 },
  tile: { width: `${100 / 3}%`, alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)',
  },
  lock: { position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  tileLabel: { color: 'rgba(255,255,255,0.92)', fontSize: 12, lineHeight: 16, fontWeight: '500', maxWidth: '100%' },
  me: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)', borderRadius: 16, paddingHorizontal: 4 },
  avatar: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
});
