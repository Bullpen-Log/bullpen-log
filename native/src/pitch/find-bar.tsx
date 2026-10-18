import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { FIND_CUES, cycleCue, isFindActive, type FindQuery, type SatisfactionPick } from '@/lib/pitch-find';
import { SATISFACTION_ENDS } from '@/lib/pitch-satisfaction';
import { usePalette, withAlpha } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { DateNavButton } from '~/shell/mini-calendar';
import { Press } from '~/shell/press';

/**
 * 목록의 '느낌으로 찾기' 줄(웹 app/(app)/videos/find-bar.tsx 와 같은 꼴 · 규칙 lib/pitch-find.ts) — 검색 칸 · 날짜로 가기 한 줄,
 * 그 밑에 만족 칩 둘 + 감각 칩 여덟(옆으로 굴림) · 켜면 '지우기'. 감각 칩은 누를 때마다 끔 → 좋았던(채움) → 아쉬웠던(테두리 + 작은 글자) → 끔.
 */
export function FindBar({
  q,
  onChange,
  today,
  marked,
  onJump,
}: {
  q: FindQuery;
  onChange: (q: FindQuery) => void;
  today: string;
  /** 날짜 고르개의 점 — 기록이 있는 날 */
  marked: (day: string) => boolean;
  onJump: (date: string) => void;
}) {
  const c = usePalette();
  const setSatisfaction = (pick: SatisfactionPick) => onChange({ ...q, satisfaction: q.satisfaction === pick ? null : pick });
  const chip = (key: string, label: string, on: boolean, outline: boolean, onPress: () => void, spoken: string) => (
    <Press
      key={key}
      select
      selected={on}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={spoken}
      onPress={onPress}
      style={[
        styles.chip,
        on ? (outline ? { borderWidth: 1, borderColor: c.sky } : { backgroundColor: c.sky }) : { backgroundColor: withAlpha(c.ink, 0.06) },
      ]}
    >
      <Text style={[styles.chipText, { color: on ? (outline ? c.skyStrong : '#fff') : withAlpha(c.ink, 0.8) }]}>{label}</Text>
      {on && outline && key.startsWith('cue:') ? <Text style={[styles.chipSub, { color: c.skyStrong }]}>아쉬움</Text> : null}
    </Press>
  );
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.top}>
        <View style={[styles.search, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
          <Icon name="search" size={16} color={c.muted} />
          <TextInput
            value={q.text}
            onChangeText={(text) => onChange({ ...q, text })}
            placeholder="메모 · 종류 · 느낌으로 찾기"
            placeholderTextColor={c.muted}
            accessibilityLabel="기록 찾기"
            returnKeyType="search"
            style={[styles.input, { color: c.ink }]}
          />
          {q.text ? (
            <Press accessibilityRole="button" accessibilityLabel="검색어 지우기" hitSlop={8} onPress={() => onChange({ ...q, text: '' })} style={styles.clear}>
              <Icon name="x" size={14} color={c.muted} />
            </Press>
          ) : null}
        </View>
        {/* 날짜로 가기 — 고르면 그 달을 펴고 그 날짜 줄로(웹 input type=date) */}
        <DateNavButton date="" today={today} min="2020-01-01" marked={marked} onPick={onJump} />
      </View>
      <View style={styles.top}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={styles.row}>
          {chip('s:good', SATISFACTION_ENDS.high, q.satisfaction === 'good', false, () => setSatisfaction('good'), SATISFACTION_ENDS.high)}
          {chip('s:bad', SATISFACTION_ENDS.low, q.satisfaction === 'bad', true, () => setSatisfaction('bad'), SATISFACTION_ENDS.low)}
          <View style={[styles.sep, { backgroundColor: c.line }]} />
          {FIND_CUES.map((cue) => {
            const state = q.cues[cue];
            return chip(
              `cue:${cue}`,
              cue,
              state !== undefined,
              state === 'bad',
              () => {
                const next = cycleCue(state);
                const cues = { ...q.cues };
                if (next) cues[cue] = next;
                else delete cues[cue];
                onChange({ ...q, cues });
              },
              state === 'good' ? `${cue} 좋았던 날, 누르면 아쉬웠던 날로` : state === 'bad' ? `${cue} 아쉬웠던 날, 누르면 끄기` : `${cue} 좋았던 날로 거르기`
            );
          })}
        </ScrollView>
        {isFindActive(q) ? (
          <Press accessibilityRole="button" onPress={() => onChange({ text: '', cues: {}, satisfaction: null })} style={styles.reset}>
            <Text style={{ color: c.muted, fontSize: 13, fontWeight: '600' }}>지우기</Text>
          </Press>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  search: { flex: 1, minWidth: 0, height: 40, borderRadius: 20, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 6, gap: 6 },
  input: { flex: 1, height: 40, fontSize: 15 },
  clear: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  row: { gap: 6, alignItems: 'center', paddingVertical: 2 },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipText: { fontSize: 13, fontWeight: '500' },
  chipSub: { fontSize: 11, opacity: 0.8 },
  sep: { width: 1, height: 20, marginHorizontal: 2 },
  reset: { minHeight: 36, paddingHorizontal: 10, justifyContent: 'center' },
});
