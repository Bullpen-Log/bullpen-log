import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { APPETITE_LEVELS, MEAL_AMOUNTS, SKIPPABLE_MEALS, mealSummary } from '@/lib/checkin';
import { usePalette, withAlpha } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { fadeIn } from '~/shell/motion';
import { Press } from '~/shell/press';
import { saveNutritionAnswer, type NutritionAnswer } from './api';

/**
 * 영양 탭 — '오늘 식욕 · 끼니는요?' 카드(웹 app/(app)/nutrition/nutrition-checkin-card.tsx · components/day-card.tsx folded, 오늘만).
 * 접힌 알약으로 시작한다(왼쪽에 붙은 작은 알약 · 연필): 답이 없으면 '오늘 식욕 · 끼니는요? 답하기', 답했으면 '오늘 설정 · 식욕 보통 · 잘 먹음'.
 * 누르면 하늘 판이 펴진다 — 제목 · 한 줄 · 오른쪽 위 '접기'(웹 DayCard — 접힌 채 시작하는 카드는 접기), 칩(같은 폭 세 칸) · [저장](day-cards.saveNutritionCheckin).
 */
export function NutritionCheckinCard({ date, answer }: { date: string; answer: NutritionAnswer | null }) {
  const c = usePalette();
  const [open, setOpen] = useState(false);
  const summary = answer
    ? [answer.appetite != null ? `식욕 ${APPETITE_LEVELS[answer.appetite - 1] ?? answer.appetite}` : null, mealSummary(answer.mealAmount, answer.skippedMeals)]
        .filter(Boolean)
        .join(' · ') || '적은 것 없음'
    : null;

  if (!open)
    return (
      <Press accessibilityRole="button" onPress={() => setOpen(true)} style={[styles.pill, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
        <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12, fontWeight: '600', flexShrink: 1 }}>
          {summary == null ? '오늘 식욕 · 끼니는요?' : '오늘 설정'}
        </Text>
        <Text numberOfLines={1} style={{ color: summary == null ? c.sky : c.ink, fontSize: 12, flexShrink: 1 }}>
          {summary ?? '답하기'}
        </Text>
        <Icon name="pencil" size={14} color={c.muted} />
      </Press>
    );
  return <MealForm date={date} initial={answer} onDone={() => setOpen(false)} />;
}

function MealForm({ date, initial, onDone }: { date: string; initial: NutritionAnswer | null; onDone: () => void }) {
  const c = usePalette();
  const [appetite, setAppetite] = useState<number | null>(initial?.appetite ?? null);
  const [amount, setAmount] = useState<string | null>(initial?.mealAmount ?? null);
  const [skipped, setSkipped] = useState<string[]>(initial?.skippedMeals ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    const err = await saveNutritionAnswer(date, { appetite, mealAmount: amount, skippedMeals: skipped });
    setSaving(false);
    if (err) return setError(err);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onDone();
  };

  const chip = (key: string, label: string, on: boolean, press: () => void) => (
    <View key={key} style={styles.gridCell}>
      <Press
        select
        selected={on}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        onPress={press}
        style={[styles.chip, on ? { borderColor: c.sky, backgroundColor: withAlpha(c.sky, 0.1) } : { backgroundColor: withAlpha(c.ink, 0.06) }]}
      >
        <Text numberOfLines={1} style={{ color: on ? c.sky : withAlpha(c.ink, 0.8), fontSize: 15, fontWeight: on ? '600' : '400' }}>
          {label}
        </Text>
      </Press>
    </View>
  );

  return (
    <Animated.View entering={fadeIn} style={[styles.card, { backgroundColor: withAlpha(c.skyTint, 0.6), borderColor: withAlpha(c.sky, 0.25) }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700' }}>오늘 식욕 · 끼니는요?</Text>
          <Text style={{ color: c.muted, fontSize: 12 }}>음식을 하나하나 안 적어도 오늘 조언과 식단이 여기에 맞춰요.</Text>
        </View>
        <Press accessibilityRole="button" onPress={onDone} style={styles.later}>
          <Text style={{ color: c.muted, fontSize: 12, fontWeight: '500' }}>접기</Text>
        </Press>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={[styles.label, { color: c.muted }]}>식욕</Text>
        <View style={styles.grid}>
          {APPETITE_LEVELS.map((label, i) => chip(label, label, appetite === i + 1, () => setAppetite(appetite === i + 1 ? null : i + 1)))}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={[styles.label, { color: c.muted }]}>끼니 양</Text>
        <View style={styles.grid}>{MEAL_AMOUNTS.map((a) => chip(a, a, amount === a, () => setAmount(amount === a ? null : a)))}</View>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={[styles.label, { color: c.muted }]}>거른 끼니</Text>
        <View style={styles.grid}>
          {SKIPPABLE_MEALS.map((m) =>
            chip(m.key, m.label, skipped.includes(m.key), () =>
              setSkipped((cur) => (cur.includes(m.key) ? cur.filter((x) => x !== m.key) : [...cur, m.key]))
            )
          )}
        </View>
      </View>
      {error ? <Text style={{ color: c.danger, fontSize: 12 }}>{error}</Text> : null}
      <Press accessibilityRole="button" onPress={() => void save()} disabled={saving} style={[styles.primary, { backgroundColor: c.sky }, saving && { opacity: 0.5 }]}>
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{saving ? '저장 중…' : '저장'}</Text>
      </Press>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, borderRadius: 20, paddingHorizontal: 14 },
  card: { borderRadius: 20, borderWidth: 1, padding: 20, gap: 12 },
  later: { minHeight: 40, marginVertical: -8, paddingHorizontal: 12, borderRadius: 20, justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '600' },
  /* 웹 chip-grid data-cols=3 — 같은 폭 세 칸 */
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, rowGap: 8 },
  gridCell: { width: '33.333%', paddingHorizontal: 4 },
  chip: { minHeight: 40, borderRadius: 20, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  primary: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
