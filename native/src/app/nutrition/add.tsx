import { type Href, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BASIC_FOODS, basicAliases } from '@/lib/nutrition/foods';
import { matchScore } from '@/lib/nutrition/hangul';
import { isMealKey, mealLabel, type Food, type MealKey } from '@/lib/nutrition/meta';
import { usePalette } from '~/lib/ui';
import { addFoods, searchMfds, searchMfdsReps, useNutritionDay } from '~/nutrition/api';
import { takeScanned } from '~/nutrition/scanned';
import { READABLE } from '~/lib/layout';

/**
 * 음식 담기(앱) — 웹 영양 탭 음식 창의 첫 판: 찾기(기본 음식 · 내 음식 → 식약처 품목대표 → 식약처 상품, 웹과 같은 순서) · 최근 먹은 것 ·
 * 내 음식 · 바코드(앱 카메라 — 웹은 아이폰 사파리에서 바코드를 못 읽었다). 고르면 양(¼인분 단위)을 정해 담는다.
 * 조합 · 어제와 같이 · 직접 적기 · 분류 둘러보기는 아직 웹.
 */
const AMOUNTS = [0.5, 1, 1.5, 2] as const;
const LIMIT = 30;

export default function NutritionAddScreen() {
  const { date, meal } = useLocalSearchParams<{ date: string; meal: string }>();
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const mealKey: MealKey = isMealKey(meal) ? meal : 'snack';
  const { day } = useNutritionDay(date);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Food | null>(null);
  const [amount, setAmount] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfds, setMfds] = useState<{ q: string; foods: Food[]; full: boolean } | null>(null);

  /* 바코드 화면에서 돌아오면 찾은 음식을 고른 것으로 */
  const [scanned, setScanned] = useState<Food | null>(null);
  useFocusEffect(
    useCallback(() => {
      const f = takeScanned();
      if (f) {
        setScanned(f);
        setAmount(1);
      }
    }, [])
  );
  const chosen = scanned ?? picked;

  const local = useMemo(() => {
    const text = q.trim();
    if (!text) return [];
    const mine = (day?.mine ?? []).map((f) => ({ f, s: matchScore(f.name, text) }));
    const basic = BASIC_FOODS.map((f) => ({
      f,
      s: Math.max(matchScore(f.name, text), ...basicAliases(f.id ?? '').map((a) => matchScore(a, text))),
    }));
    return [...mine, ...basic]
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, LIMIT)
      .map((x) => x.f);
  }, [q, day?.mine]);

  /* 식약처 — 칠 때마다 0.35초 기다렸다가, 품목대표(바로) → 상품까지(느림). 늦게 온 옛 검색어 답은 버린다 */
  const latest = useRef('');
  useEffect(() => {
    const text = q.trim();
    latest.current = text;
    if (!text || !day?.mfds) return;
    const t = setTimeout(() => {
      void searchMfdsReps(text)
        .then((foods) => latest.current === text && setMfds({ q: text, foods, full: false }))
        .catch(() => undefined);
      void searchMfds(text)
        .then((foods) => latest.current === text && setMfds({ q: text, foods, full: true }))
        .catch(() => undefined);
    }, 350);
    return () => clearTimeout(t);
  }, [q, day?.mfds]);
  const shownMfds = mfds && mfds.q === q.trim() ? mfds : null;

  const save = async () => {
    if (!chosen || saving) return;
    setSaving(true);
    setError(null);
    const err = await addFoods(date, mealKey, [{ food: chosen, amount }]);
    setSaving(false);
    if (err) return setError(err);
    router.back();
  };

  const row = (f: Food, key: string) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      onPress={() => {
        setScanned(null);
        setPicked(f);
        setAmount(1);
      }}
      style={({ pressed }) => [styles.row, { backgroundColor: c.card }, pressed && { opacity: 0.6 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
          {f.name}
        </Text>
        <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={1}>
          {f.servingLabel} · {Math.round(f.kcal)}kcal{f.protein != null ? ` · 단백질 ${Math.round(f.protein)}g` : ''}
          {f.note ? ` · ${f.note}` : ''}
        </Text>
      </View>
      <Text style={{ color: c.sky, fontSize: 22 }}>+</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10}>
          <Text style={[styles.barAction, { color: c.sky }]}>닫기</Text>
        </Pressable>
        <Text style={[styles.barTitle, { color: c.ink }]}>{mealLabel(mealKey)}에 담기</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/nutrition/barcode' as Href)} hitSlop={10}>
          <Text style={[styles.barAction, { color: c.sky }]}>바코드</Text>
        </Pressable>
      </View>

      {chosen ? (
        <View style={[styles.pick, { backgroundColor: c.card, marginHorizontal: 16 }]}>
          <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700' }} numberOfLines={2}>
            {chosen.name}
          </Text>
          <Text style={{ color: c.muted, fontSize: 14 }}>
            {amount} × {chosen.servingLabel} · {Math.round(chosen.kcal * amount)}kcal
            {chosen.protein != null ? ` · 단백질 ${Math.round(chosen.protein * amount)}g` : ''}
          </Text>
          <View style={styles.amounts}>
            {AMOUNTS.map((a) => (
              <Pressable
                key={a}
                accessibilityRole="radio"
                accessibilityState={{ selected: amount === a }}
                onPress={() => setAmount(a)}
                style={[styles.amount, { backgroundColor: amount === a ? c.sky : c.chip }]}
              >
                <Text style={{ color: amount === a ? '#fff' : c.ink, fontSize: 15, fontWeight: '600' }}>{a}</Text>
              </Pressable>
            ))}
            <Pressable accessibilityLabel="¼인분 덜" onPress={() => setAmount((x) => Math.max(0.25, x - 0.25))} style={[styles.amount, { backgroundColor: c.chip }]}>
              <Text style={{ color: c.ink, fontSize: 17 }}>−</Text>
            </Pressable>
            <Pressable accessibilityLabel="¼인분 더" onPress={() => setAmount((x) => Math.min(20, x + 0.25))} style={[styles.amount, { backgroundColor: c.chip }]}>
              <Text style={{ color: c.ink, fontSize: 17 }}>+</Text>
            </Pressable>
          </View>
          {error ? <Text style={{ color: c.danger, fontSize: 14 }}>{error}</Text> : null}
          <View style={styles.amounts}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setPicked(null);
                setScanned(null);
              }}
              style={[styles.ghost, { backgroundColor: c.chip }]}
            >
              <Text style={{ color: c.ink, fontSize: 16, fontWeight: '600' }}>다른 음식</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={save} disabled={saving} style={[styles.primary, { backgroundColor: c.sky }, saving && { opacity: 0.5 }]}>
              <Text style={styles.primaryText}>{saving ? '담는 중' : '담기'}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <TextInput
              value={q}
              onChangeText={setQ}
              autoFocus
              placeholder="음식 이름으로 찾기"
              placeholderTextColor={c.muted}
              clearButtonMode="while-editing"
              returnKeyType="search"
              style={[styles.input, { backgroundColor: c.card, color: c.ink }]}
            />
          </View>
          <ScrollView contentContainerStyle={[{ padding: 16, paddingTop: 0, gap: 6, paddingBottom: inset.bottom + 24 }, READABLE]} keyboardShouldPersistTaps="handled">
            {q.trim() ? (
              <>
                {local.map((f, i) => row(f, `l${i}`))}
                {day?.mfds ? (
                  <>
                    <Text style={[styles.section, { color: c.muted }]}>
                      식약처 식품영양성분DB{shownMfds && !shownMfds.full ? ' · 더 찾는 중' : ''}
                    </Text>
                    {!shownMfds ? <ActivityIndicator style={{ padding: 8 }} /> : null}
                    {shownMfds?.foods.slice(0, LIMIT).map((f, i) => row(f, `m${i}`))}
                    {shownMfds?.full && shownMfds.foods.length === 0 && local.length === 0 ? (
                      <Text style={{ color: c.muted, fontSize: 15, padding: 8 }}>찾는 음식이 없어요.</Text>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : (
              <>
                {day?.recent.length ? <Text style={[styles.section, { color: c.muted }]}>최근 먹은 것</Text> : null}
                {day?.recent.slice(0, LIMIT).map((f, i) => row(f, `r${i}`))}
                {day?.mine.length ? <Text style={[styles.section, { color: c.muted }]}>내 음식</Text> : null}
                {day?.mine.slice(0, LIMIT).map((f, i) => row(f, `y${i}`))}
                {!day ? <ActivityIndicator style={{ padding: 16 }} /> : null}
              </>
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  barAction: { fontSize: 17 },
  barTitle: { fontSize: 17, fontWeight: '600' },
  input: { height: 44, borderRadius: 12, paddingHorizontal: 14, fontSize: 17 },
  section: { fontSize: 13, fontWeight: '600', paddingTop: 10, paddingBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  pick: { borderRadius: 20, padding: 16, gap: 12 },
  amounts: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  amount: { minWidth: 48, height: 40, borderRadius: 20, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  ghost: { flex: 1, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  primary: { flex: 1, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
