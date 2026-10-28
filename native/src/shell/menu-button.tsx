import { type Href, router } from 'expo-router';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { usePalette } from '~/lib/ui';

/**
 * 탭 위 오른쪽 전체 메뉴(☰) — 2026-10-29 확정 디자인: 하단 탭의 '더보기'를 걷고 각 탭 머리 오른쪽으로 옮겼다. 누르면 더보기 폴더(app/more.tsx).
 * 그림은 세 줄(시안) — 둥근 아이콘 'menu' 는 네모 넷이라 직접 그린다. 44pt · 카드 색 원.
 */
export function MenuButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="전체 메뉴"
      onPress={() => router.push('/more' as Href)}
      hitSlop={4}
      style={({ pressed }) => [st.btn, { backgroundColor: c.card, boxShadow: c.float }, pressed && { opacity: 0.6 }, style]}
    >
      <View style={st.lines}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[st.line, { backgroundColor: c.ink }]} />
        ))}
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  btn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  lines: { gap: 4 },
  line: { width: 17, height: 2, borderRadius: 1 },
});
