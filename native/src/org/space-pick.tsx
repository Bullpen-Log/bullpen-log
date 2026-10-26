import { type Href, router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { TYPE, type Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';

/**
 * 위 막대의 공간 고르개(계약 8-4) — 지금 공간 이름 ▾, 누르면 고르개 시트(app/org/pick). 조직 공간 위 막대 · 내 싱커 홈 머리 · 더보기가 쓴다.
 * 홈 머리에 붙어서 가볍게 둔다(조직 화면 코드를 끌고 오지 않게).
 */
export function SpacePickButton({ label, c, compact = false }: { label: string; c: Palette; compact?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`지금 공간 ${label}, 공간 바꾸기`}
      onPress={() => router.push('/org/pick' as Href)}
      hitSlop={6}
      style={({ pressed }) => [compact ? st.chip : st.pick, compact && { backgroundColor: c.chip }, pressed && { opacity: 0.6 }]}
    >
      <Text style={[compact ? TYPE.sub : st.pickText, { color: c.ink, fontWeight: compact ? '600' : '700', flexShrink: 1 }]} numberOfLines={1}>
        {label}
      </Text>
      <Icon name="chevron-down" size={compact ? 14 : 18} color={c.muted} />
    </Pressable>
  );
}


const st = StyleSheet.create({
  pick: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, maxWidth: '86%' },
  pickText: { fontSize: 17, fontWeight: '700' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 32, paddingHorizontal: 10, borderRadius: 16, maxWidth: 150 },
});
