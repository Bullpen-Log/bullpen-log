import { SymbolView, type SFSymbol } from 'expo-symbols';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from '~/lib/ui';
import { useMenu } from '~/shell/menu-store';
import { leaveTo } from '~/shell/web-nav';

/**
 * 더보기(앱) — 사이트의 메뉴 묶음(lib/nav.ts visibleGroups · 잠김까지, 사이트가 알려 줌)을 아이폰 설정 목록처럼. 누르면 닫고 그곳으로
 * (앱 화면이 있는 곳은 앱 화면 — 껍데기가 가른다). 내 정보 · 설정도 여기서. 예전엔 웹 메뉴를 열었는데, 앱 화면(홈 · 투구 · 영양) 위에서
 * 누르면 그 밑에 깔려 안 보였다.
 */
const ICON: Record<string, SFSymbol> = {
  home: 'house',
  baseball: 'baseball',
  dumbbell: 'dumbbell',
  film: 'film',
  utensils: 'fork.knife',
  target: 'target',
  book: 'book',
  settings: 'gearshape',
  shield: 'shield',
  gauge: 'gauge.with.dots.needle.67percent',
  clapper: 'movieclapper',
  radar: 'scope',
  body: 'figure.stand',
  community: 'bubble.left.and.bubble.right',
  support: 'lifepreserver',
};

export default function MoreScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { groups, nickname } = useMenu();
  const go = leaveTo;

  const row = (key: string, label: string, icon: SFSymbol, onPress: () => void, locked = false, last = false) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityLabel={locked ? `${label}, 첫 설정이 필요해요` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.chip }]}
    >
      <View style={[styles.icon, { backgroundColor: locked ? c.muted : c.sky }]}>
        <SymbolView name={icon} size={17} tintColor="#fff" />
      </View>
      <View style={[styles.rowBody, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
        <Text style={[styles.label, { color: locked ? c.muted : c.ink }]}>{label}</Text>
        {locked ? <SymbolView name="lock.fill" size={14} tintColor={c.muted} /> : null}
        <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <View style={styles.bar}>
        <View style={{ width: 44 }} />
        <Text style={[styles.barTitle, { color: c.ink }]}>더보기</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10} style={{ width: 44, alignItems: 'flex-end' }}>
          <Text style={{ color: c.sky, fontSize: 17, fontWeight: '600' }}>완료</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: inset.bottom + 24 }}>
        <View style={[styles.group, { backgroundColor: c.card }]}>
          {row('profile', nickname ? `${nickname} · 내 정보` : '내 정보', 'person.crop.circle', () => go('#profile'))}
          {row('settings', '설정', 'gearshape', () => go('#settings'), false, true)}
        </View>
        {groups.map((g, gi) => (
          <View key={gi} style={{ gap: 6 }}>
            {g.title ? <Text style={[styles.groupTitle, { color: c.muted }]}>{g.title}</Text> : null}
            <View style={[styles.group, { backgroundColor: c.card }]}>
              {g.items.map((it, i) => row(it.href, it.label, ICON[it.icon] ?? 'circle', () => go(it.href), it.locked, i === g.items.length - 1))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  barTitle: { fontSize: 17, fontWeight: '600' },
  group: { borderRadius: 14, overflow: 'hidden' },
  groupTitle: { fontSize: 13, fontWeight: '600', paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, minHeight: 48 },
  icon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 12, paddingRight: 14, minHeight: 48 },
  label: { flex: 1, fontSize: 17 },
});
