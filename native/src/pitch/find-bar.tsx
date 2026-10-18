import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { FIND_CUES, cycleCue, type FindQuery } from '@/lib/pitch-find';
import { usePalette } from '~/lib/ui';

/**
 * 느낌으로 찾기(웹 app/(app)/videos/find-bar.tsx 와 같은 규칙 — lib/pitch-find.ts): 검색 칸 · 만족 칩 둘 · 감각 칩(누를 때마다 끔 → 좋았던 →
 * 아쉬웠던 → 끔). 켠 조건끼리 AND.
 */
export function FindBar({ q, onChange }: { q: FindQuery; onChange: (q: FindQuery) => void }) {
  const c = usePalette();
  const chip = (label: string, state: 'good' | 'bad' | undefined, onPress: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityState={{ selected: state != null }}
      accessibilityLabel={state === 'bad' ? `${label} 아쉬웠던 것` : state === 'good' ? `${label} 좋았던 것` : label}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: state === 'good' ? c.sky : c.chip },
        state === 'bad' && { backgroundColor: 'transparent', borderColor: c.sky, borderWidth: 1.5 },
      ]}
    >
      <Text style={[styles.chipText, { color: state === 'good' ? '#fff' : state === 'bad' ? c.sky : c.ink }]}>
        {label}
        {state === 'bad' ? ' · 아쉬움' : ''}
      </Text>
    </Pressable>
  );
  return (
    <View style={{ gap: 8 }}>
      <TextInput
        value={q.text}
        onChangeText={(text) => onChange({ ...q, text })}
        placeholder="메모 · 종류 · 감각으로 찾기"
        placeholderTextColor={c.muted}
        clearButtonMode="while-editing"
        returnKeyType="search"
        style={[styles.input, { backgroundColor: c.card, color: c.ink }]}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {chip('만족', q.satisfaction === 'good' ? 'good' : undefined, () =>
          onChange({ ...q, satisfaction: q.satisfaction === 'good' ? null : 'good' })
        )}
        {chip('아쉬움', q.satisfaction === 'bad' ? 'good' : undefined, () =>
          onChange({ ...q, satisfaction: q.satisfaction === 'bad' ? null : 'bad' })
        )}
        <View style={[styles.sep, { backgroundColor: c.line }]} />
        {FIND_CUES.map((cue) =>
          chip(cue, q.cues[cue], () => {
            const next = cycleCue(q.cues[cue]);
            const cues = { ...q.cues };
            if (next) cues[cue] = next;
            else delete cues[cue];
            onChange({ ...q, cues });
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { height: 44, borderRadius: 12, paddingHorizontal: 14, fontSize: 17 },
  row: { gap: 8, alignItems: 'center', paddingRight: 8 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center' },
  chipText: { fontSize: 14, fontWeight: '600' },
  sep: { width: 1, height: 20 },
});
