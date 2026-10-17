import * as Haptics from 'expo-haptics';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from '~/lib/ui';

/**
 * 앱 아래 탭 막대 — 사이트가 알려 준 탭(components/app-shell/expo-tabs.tsx — 이름 · 주소 · 잠김)을 그린다. 투구 탭은 앱 화면, 나머지는
 * 사이트 웹뷰(판 넘기기로 바로 옮긴다). 아이콘은 사이트 아이콘 이름을 SF Symbols 로.
 */
export type ShellTab = { href: string; label: string; icon: string; locked?: boolean };

export const DEFAULT_TABS: ShellTab[] = [
  { href: '/today', label: '홈', icon: 'home' },
  { href: '/videos', label: '투구', icon: 'baseball' },
  { href: '/training?view=home', label: '트레이닝', icon: 'dumbbell' },
  { href: '/nutrition', label: '영양', icon: 'utensils' },
  { href: '/more', label: '더보기', icon: 'menu' },
];

const SYMBOL: Record<string, SFSymbol> = {
  home: 'house.fill',
  baseball: 'baseball.fill',
  dumbbell: 'dumbbell.fill',
  utensils: 'fork.knife',
  menu: 'square.grid.2x2.fill',
};

/** 탭 막대 높이(홈 막대 자리 빼고) — 사이트 globals.css 'Expo 앱 탭'의 --tab-bar-top 과 같게 */
export const TAB_BAR_HEIGHT = 49;

export function TabBar({ tabs, active, onPress }: { tabs: ShellTab[]; active: string | null; onPress: (t: ShellTab) => void }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: inset.bottom, backgroundColor: c.card, borderTopColor: c.line }]}>
      {tabs.map((t) => {
        const on = active === t.href;
        const color = on ? c.sky : c.muted;
        return (
          <Pressable
            key={t.href}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.locked ? `${t.label}, 잠김` : t.label}
            onPress={() => {
              void Haptics.selectionAsync();
              onPress(t);
            }}
            style={[styles.item, t.locked && { opacity: 0.45 }]}
          >
            <SymbolView name={SYMBOL[t.icon] ?? 'circle.fill'} tintColor={color} size={24} />
            <Text style={[styles.label, { color }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  item: { flex: 1, height: TAB_BAR_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 10, fontWeight: '600' },
});
