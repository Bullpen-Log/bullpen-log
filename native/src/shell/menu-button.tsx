import { Image } from 'expo-image';
import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hasNutrition } from '@/lib/country';
import { useCountry } from '~/lib/country-store';
import { useTheme } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { MENU_ICON, useMenu, type MenuItem } from '~/shell/menu-store';
import { openWebAfter } from '~/shell/web-nav';

/**
 * 탭 머리 오른쪽 공통 메뉴 — '세라믹 런처'(2026-10-29 확정 시안). 하단 탭의 더보기를 걷고, 이 단추 밑에 붙어 뜨는 둥근 팝오버로 옮겼다.
 *   [내 프로필 · 선수 정보 · 계정] → [영양 | 팀·레슨장] 큰 타일 → 선 → [알림 | 설정 | 고객센터]. 관리 권한이 있으면 그 밑에 사이트가 보낸 '관리' 묶음만 더한다.
 * 영양은 그 나라에 영양이 열려 있을 때만(lib/country.ts hasNutrition — 2026-10-28 모든 나라에서 숨김, 다시 열면 저절로 나온다). 잠김은 사이트가 보낸 메뉴 값.
 * 홈 · 투구 · 트레이닝 · 기록 · 덕아웃은 하단 탭에 있어 다시 넣지 않는다. 투구 드릴 · 운동 영상은 트레이닝 탭, 내 영상 · 분석 결과는 기록 탭.
 * 그림은 흰 세라믹 아이콘(assets/menu — 시안의 3D 모델을 288px 로 다시 뽑은 정적 그림, 앱에서 3D 를 돌리지 않는다).
 * 열기 · 닫기: 단추를 다시 누르기 · 바깥 누르기 · 접근성 닫기 동작 · 안드로이드 뒤로. 닫히면 Modal 째 걷혀 보이지 않는 막이 남지 않는다.
 * 고른 곳으로는 팝오버가 다 걷힌 뒤(onDismiss) 간다 — 걷히는 중에 다른 시트를 열면 iOS 가 그 시트를 못 띄운다.
 */
const ICONS = {
  profile: require('../../assets/menu/ceramic-profile.png'),
  nutrition: require('../../assets/menu/ceramic-nutrition.png'),
  team: require('../../assets/menu/ceramic-team.png'),
  bell: require('../../assets/menu/ceramic-bell.png'),
  settings: require('../../assets/menu/ceramic-settings.png'),
  support: require('../../assets/menu/ceramic-support.png'),
  menu: require('../../assets/menu/ceramic-menu.png'),
};

/* 시안 색(top-menu-concepts styles.css --tm-*) — 다크 · 네이비는 같은 짙은 판 */
const LOOK = {
  light: { panel: '#ffffff', tile: '#f3f7fb', ice: '#edf6ff', line: '#e7edf3', ink: '#17283b', muted: '#607287', scrim: 'rgba(23,52,87,0.16)', shadow: 'rgba(20,46,77,0.16)', blue: '#087de4' },
  dark: { panel: '#1a2839', tile: '#23364b', ice: '#183b5b', line: '#324357', ink: '#f3f7fc', muted: '#a4b6ca', scrim: 'rgba(0,0,0,0.32)', shadow: 'rgba(0,0,0,0.4)', blue: '#127fe1' },
} as const;
const EASE = Easing.bezier(0.2, 0.85, 0.25, 1);
type Rect = { x: number; y: number; w: number; h: number };

export function MenuButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const L = LOOK[useTheme() === 'light' ? 'light' : 'dark'];
  const btn = useRef<ComponentRef<typeof View>>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const open = () =>
    btn.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w, h });
    });
  const closed = () => {
    setAnchor(null);
    /* 닫으면 화면 읽기 초점을 메뉴 단추로 돌린다(웹 미리보기에는 이 함수가 없다) */
    if (btn.current) AccessibilityInfo.sendAccessibilityEvent?.(btn.current, 'focus');
  };
  return (
    <>
      <Pressable
        ref={btn}
        accessibilityRole="button"
        accessibilityLabel="메뉴 열기"
        accessibilityState={{ expanded: anchor != null }}
        onPress={open}
        hitSlop={4}
        style={({ pressed }) => [st.btn, { backgroundColor: L.panel, boxShadow: `0 3px 9px ${L.shadow}` }, pressed && { opacity: 0.7 }, style]}
      >
        <Image source={ICONS.menu} style={st.btnIcon} contentFit="contain" accessibilityIgnoresInvertColors />
      </Pressable>
      {anchor ? <Launcher anchor={anchor} onClosed={closed} /> : null}
    </>
  );
}

function Launcher({ anchor, onClosed }: { anchor: Rect; onClosed: () => void }) {
  const L = LOOK[useTheme() === 'light' ? 'light' : 'dark'];
  const { width: W, height: H } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const country = useCountry();
  const { groups } = useMenu();
  const [visible, setVisible] = useState(true);
  const after = useRef<(() => void) | null>(null);
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withTiming(1, { duration: reduce ? 0 : 240, easing: EASE }));
  }, [p, reduce]);

  /*
   * 걷힘 — 움직임이 끝나면 Modal 을 내리고, 다 내려간 뒤(onDismiss) 고른 곳으로. onDismiss 를 못 받는 경우(안드로이드)를 위해 0.5초 뒤 한 번 더 —
   * 둘 중 먼저 온 것만 쓴다
   */
  const finished = useRef(false);
  const dismissed = () => {
    if (finished.current) return;
    finished.current = true;
    const go = after.current;
    after.current = null;
    onClosed();
    go?.();
  };
  const hide = () => {
    setVisible(false);
    setTimeout(dismissed, 500);
  };
  const close = (then?: () => void) => {
    if (then) after.current = then;
    p.set(withTiming(0, { duration: reduce ? 0 : 170, easing: Easing.in(Easing.quad) }, (done) => done && runOnJS(hide)()));
  };

  const panelStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 1.4),
    transform: [{ translateY: (1 - p.value) * -10 }, { scale: 0.92 + 0.08 * p.value }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: p.value }));

  /* 자리 — 단추 바로 밑, 오른쪽 끝을 단추에 맞춘다. 휴대폰은 화면 폭에 가깝게, 넓은 창(아이패드)은 360 그대로 */
  const right = Math.max(10, W - (anchor.x + anchor.w));
  const top = anchor.y + anchor.h + 10;
  const width = W >= 600 ? 360 : Math.min(400, W - right - 10);
  const maxHeight = Math.max(200, H - top - inset.bottom - 12);

  const items = groups.flatMap((g) => g.items);
  const nutrition = items.find((i) => i.icon === 'utensils' || i.href.split('?')[0] === '/nutrition');
  /* 메뉴가 오기 전이면 나라만 보고 둔다 — 잠김은 메뉴가 온 뒤 사이트 값(applyLocks)을 따른다 */
  const showNutrition = hasNutrition(country) && (nutrition != null || groups.length === 0);
  const manage = groups.filter((g) => g.title === '관리').flatMap((g) => g.items);
  const push = (href: string) => () => router.push(href as Href);
  const web = (href: string) => () => openWebAfter(href);

  const primary: { key: keyof typeof ICONS; label: string; go: () => void; locked?: boolean }[] = [
    ...(showNutrition ? [{ key: 'nutrition' as const, label: '영양', go: web(nutrition?.href ?? '/nutrition'), locked: nutrition?.locked }] : []),
    { key: 'team', label: '팀·레슨장', go: push('/org') },
  ];
  /* 큰 타일이 하나뿐이면(영양을 숨긴 나라 · 지금) 큰 정사각 대신 가로 한 줄 — 넓은 빈 타일이 화면을 차지하지 않게 */
  const solo = primary.length === 1;
  const utility: { key: keyof typeof ICONS; label: string; go: () => void }[] = [
    { key: 'bell', label: '알림', go: push('/notice') },
    { key: 'settings', label: '설정', go: push('/settings') },
    { key: 'support', label: '고객센터', go: push('/support') },
  ];

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent onRequestClose={() => close()} onDismiss={dismissed}>
      {/* 바깥 — 누르면 닫힌다. 머리 줄 밑부터 옅게 가라앉힌다(머리는 그대로 보이게) */}
      <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={() => close()}>
        <Animated.View pointerEvents="none" style={[st.scrim, { top: anchor.y + anchor.h + 4, backgroundColor: L.scrim }, scrimStyle]} />
      </Pressable>
      {/* 열린 동안의 단추 — 같은 자리에 파란 닫기(X) */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="메뉴 닫기"
        accessibilityState={{ expanded: true }}
        onPress={() => close()}
        hitSlop={4}
        style={({ pressed }) => [st.btn, { position: 'absolute', left: anchor.x, top: anchor.y, backgroundColor: L.blue, boxShadow: `0 3px 11px ${L.shadow}` }, pressed && { opacity: 0.8 }]}
      >
        <Icon name="x" size={20} color="#ffffff" strokeWidth={2.4} />
      </Pressable>
      <Animated.View
        accessibilityViewIsModal
        onAccessibilityEscape={() => close()}
        style={[st.panel, { top, right, width, maxHeight, backgroundColor: L.panel, boxShadow: `0 24px 58px ${L.shadow}, 0 1px 0 ${L.line}`, transformOrigin: 'right top' }, panelStyle]}
      >
        <ScrollView bounces={false} style={st.scroll} contentContainerStyle={st.body} showsVerticalScrollIndicator={false}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="내 프로필, 선수 정보 · 계정"
            onPress={() => close(push('/profile'))}
            style={({ pressed }) => [st.profile, { backgroundColor: L.tile }, pressed && st.pressed]}
          >
            <View style={[st.avatar, { backgroundColor: L.ice }]}>
              <Image source={ICONS.profile} style={st.avatarImg} contentFit="contain" accessibilityIgnoresInvertColors />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[st.profileTitle, { color: L.ink }]}>내 프로필</Text>
              <Text style={[st.profileSub, { color: L.muted }]}>선수 정보 · 계정</Text>
            </View>
            <Icon name="chevron-right" size={18} color={L.muted} />
          </Pressable>

          <View style={st.primary}>
            {primary.map((it) => (
              <Pressable
                key={it.key}
                accessibilityRole="button"
                accessibilityLabel={it.locked ? `${it.label}(설정 전)` : it.label}
                onPress={() => close(it.go)}
                style={({ pressed }) => [st.tile, solo && st.tileSolo, { backgroundColor: L.ice, boxShadow: `inset 0 1px 0 ${L.line}` }, pressed && st.pressed]}
              >
                <Image source={ICONS[it.key]} style={solo ? st.tileImgSolo : st.tileImg} contentFit="contain" accessibilityIgnoresInvertColors />
                <Text style={[st.tileLabel, { color: L.ink }]}>{it.label}</Text>
                {it.locked ? (
                  <View style={[st.lock, { backgroundColor: L.panel }]}>
                    <Icon name="lock" size={12} color={L.muted} />
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>

          <View style={[st.utility, { borderTopColor: L.line }]}>
            {utility.map((it) => (
              <Pressable
                key={it.key}
                accessibilityRole="button"
                accessibilityLabel={it.label}
                onPress={() => close(it.go)}
                style={({ pressed }) => [st.util, pressed && st.pressed]}
              >
                <Image source={ICONS[it.key]} style={st.utilImg} contentFit="contain" accessibilityIgnoresInvertColors />
                <Text style={[st.utilLabel, { color: L.ink }]}>{it.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* 관리 — 사이트가 이 계정에 보낸 관리 항목만(역할 · 권한은 서버가 거른다). 일반 사용자에게는 묶음이 오지 않는다 */}
          {manage.length ? (
            <View style={[st.manage, { borderTopColor: L.line }]}>
              <Text accessibilityRole="header" style={[st.manageTitle, { color: L.muted }]}>
                관리
              </Text>
              {manage.map((it: MenuItem) => (
                <Pressable
                  key={it.href}
                  accessibilityRole="button"
                  accessibilityLabel={it.label}
                  onPress={() => close(web(it.href))}
                  style={({ pressed }) => [st.manageRow, pressed && st.pressed]}
                >
                  <Icon name={MENU_ICON[it.icon] ?? 'menu'} size={20} color={L.muted} />
                  <Text style={{ flex: 1, color: L.ink, fontSize: 15 }}>{it.label}</Text>
                  <Icon name="chevron-right" size={16} color={L.muted} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const st = StyleSheet.create({
  btn: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  btnIcon: { width: 33, height: 33 },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  /* 그림자는 겉 판에(안쪽을 자르면 iOS 가 그림자까지 자른다), 굴러가는 안쪽만 둥글게 자른다 */
  panel: { position: 'absolute', borderRadius: 32 },
  scroll: { flexGrow: 0, borderRadius: 32, overflow: 'hidden' },
  body: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 16 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 69, paddingVertical: 9, paddingHorizontal: 13, borderRadius: 23 },
  avatar: { width: 51, height: 51, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 46, height: 46 },
  profileTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  profileSub: { fontSize: 13, marginTop: 2 },
  primary: { flexDirection: 'row', gap: 8, marginTop: 17 },
  tile: { flex: 1, minHeight: 165, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 15, paddingBottom: 18, paddingHorizontal: 10, borderRadius: 25 },
  tileImg: { width: 83, height: 83 },
  tileSolo: { flexDirection: 'row', justifyContent: 'flex-start', minHeight: 96, gap: 14, paddingVertical: 12, paddingHorizontal: 16 },
  tileImgSolo: { width: 64, height: 64 },
  tileLabel: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3, textAlign: 'center' },
  lock: { position: 'absolute', top: 12, right: 12, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  utility: { flexDirection: 'row', gap: 4, marginTop: 18, paddingTop: 17, borderTopWidth: 1 },
  util: { flex: 1, minHeight: 86, alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 5 },
  utilImg: { width: 46, height: 46 },
  utilLabel: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  manage: { marginTop: 12, paddingTop: 10, borderTopWidth: 1 },
  manageTitle: { fontSize: 12, fontWeight: '600', paddingHorizontal: 6, paddingBottom: 2 },
  manageRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 6, borderRadius: 12 },
});
