import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { APPETITE_LEVELS, MEAL_AMOUNTS, SKIPPABLE_MEALS, mealSummary } from '@/lib/checkin';
import { usePalette } from '~/lib/ui';
import { saveNutritionAnswer, type NutritionAnswer } from './api';

/**
 * 영양 탭 — '오늘 식욕 · 끼니는요?' 카드(웹 app/(app)/nutrition/nutrition-checkin-card.tsx 와 같은 질문 · 칩 · 글, 오늘만).
 * 웹 DayCard 의 folded 처럼 접힌 알약으로 시작한다: 답이 없으면 '오늘 식욕 · 끼니는요? 답하기', 답했으면 '오늘 설정 · 식욕 보통 · 잘 먹음'.
 * 누르면 펴서 고르고 [저장](day-cards.saveNutritionCheckin) · [나중에].
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
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={[styles.pill, { backgroundColor: c.card }]}>
        <Text style={{ color: c.muted, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
          {summary == null ? '오늘 식욕 · 끼니는요?' : '오늘 설정'}
        </Text>
        <Text style={{ flex: 1, color: summary == null ? c.sky : c.ink, fontSize: 14 }} numberOfLines={1}>
          {summary ?? '답하기'}
        </Text>
        {summary != null ? <Text style={{ color: c.sky, fontSize: 14, fontWeight: '600' }}>바꾸기</Text> : null}
      </Pressable>
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
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={press}
      style={[styles.chip, { backgroundColor: on ? c.sky : c.chip }]}
    >
      <Text style={{ color: on ? '#fff' : c.ink, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={[styles.card, { backgroundColor: c.card }]}>
      <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700' }}>오늘 식욕 · 끼니는요?</Text>
      <Text style={{ color: c.muted, fontSize: 13 }}>음식을 하나하나 안 적어도 오늘 조언과 식단이 여기에 맞춰요.</Text>
      <Text style={[styles.label, { color: c.muted }]}>식욕</Text>
      <View style={styles.chips}>
        {APPETITE_LEVELS.map((label, i) => chip(label, label, appetite === i + 1, () => setAppetite(appetite === i + 1 ? null : i + 1)))}
      </View>
      <Text style={[styles.label, { color: c.muted }]}>끼니 양</Text>
      <View style={styles.chips}>{MEAL_AMOUNTS.map((a) => chip(a, a, amount === a, () => setAmount(amount === a ? null : a)))}</View>
      <Text style={[styles.label, { color: c.muted }]}>거른 끼니</Text>
      <View style={styles.chips}>
        {SKIPPABLE_MEALS.map((m) =>
          chip(m.key, m.label, skipped.includes(m.key), () =>
            setSkipped((cur) => (cur.includes(m.key) ? cur.filter((x) => x !== m.key) : [...cur, m.key]))
          )
        )}
      </View>
      {error ? <Text style={{ color: c.danger, fontSize: 13 }}>{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onDone} style={[styles.ghost, { backgroundColor: c.chip }]}>
          <Text style={{ color: c.ink, fontSize: 16, fontWeight: '600' }}>나중에</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void save()} disabled={saving} style={[styles.primary, { backgroundColor: c.sky }, saving && { opacity: 0.5 }]}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{saving ? '저장 중…' : '저장'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderRadius: 24, paddingHorizontal: 16 },
  card: { borderRadius: 20, padding: 16, gap: 8 },
  label: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  ghost: { flex: 1, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  primary: { flex: 1, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
