import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFav } from './favorites';
import type { Palette } from '~/lib/ui';

/** 큰 제목 오른쪽 '즐겨찾기' 알약 — 암케어 · 메커니즘의 즐겨찾기 모음 창을 연다(2026-10-20 김민) */
export function FavButton({ onPress, c }: { onPress: () => void; c: Palette }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="즐겨찾기 모음"
      onPress={onPress}
      style={({ pressed }) => [st.pill, { backgroundColor: c.chip }, pressed && { opacity: 0.6 }]}
    >
      <SymbolView name="star.fill" size={15} tintColor="#ff9500" />
      <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>즐겨찾기</Text>
    </Pressable>
  );
}

/** 즐겨찾기 별 — 누르면 바로 바뀌고, 실패하면 되돌린 뒤 줄 밑에 알린다(~/training/favorites) */
export function Star({ kind, id, initial, title, c }: { kind: 'exercise' | 'drill'; id: string; initial: boolean; title: string; c: Palette }) {
  const f = useFav(kind, id, initial);
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Pressable
        onPress={() => void f.toggle()}
        disabled={f.busy}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={f.on ? `${title} 즐겨찾기 해제` : `${title} 즐겨찾기에 담기`}
        accessibilityState={{ selected: f.on }}
        style={st.star}
      >
        <SymbolView name={f.on ? 'star.fill' : 'star'} size={20} tintColor={f.on ? '#ff9500' : c.muted} />
      </Pressable>
      {f.error ? <Text style={[st.error, { color: c.danger }]}>{f.error}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  star: { width: 36, height: 44, marginTop: -10, marginRight: -6, alignItems: 'center', justifyContent: 'center' },
  error: { fontSize: 11, lineHeight: 16, maxWidth: 120, textAlign: 'right' },
  pill: { height: 44, borderRadius: 22, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6 },
});
