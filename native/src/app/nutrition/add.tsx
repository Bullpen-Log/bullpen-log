import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { type Href, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BASIC_FOODS, basicAliases } from '@/lib/nutrition/foods';
import { matchScore } from '@/lib/nutrition/hangul';
import { isMealKey, mealLabel, QUICK_AMOUNTS, stepAmount, type Food, type MealKey } from '@/lib/nutrition/meta';
import { usePalette } from '~/lib/ui';
import { addFoods, replaceEntry, replacePlan, saveMyFood, searchMfds, searchMfdsReps, useNutritionDay } from '~/nutrition/api';
import { CustomFood } from '~/nutrition/custom-food';
import { takeScanned } from '~/nutrition/scanned';
import { READABLE } from '~/lib/layout';

/**
 * 음식 담기(앱) — 웹 영양 탭 음식 창의 첫 판: 찾기(기본 음식 · 내 음식 → 식약처 품목대표 → 식약처 상품, 웹과 같은 순서) · 최근 먹은 것 ·
 * 내 음식 · 바코드(앱 카메라 — 웹은 아이폰 사파리에서 바코드를 못 읽었다). 줄을 누르면 양(¼인분 단위)을 정해 담고, 줄 옆 + 한 번이면 1인분.
 * 웹 food-sheet.tsx 처럼 담아도 창을 닫지 않는다(한 끼는 보통 여러 가지) — 아래에 '○○ 담았어요'를 모아 보여 주고 '다 했어요'로 닫는다.
 * 바꾸기 모드(entry=먹은 줄 id 또는 plan=식단 줄 key, name=옛 이름): 웹 음식 창의 '‘○○’ 바꾸기'처럼 고르면 그 줄이 바뀌고 창이 닫힌다.
 * 목록에 없으면 직접 입력(웹 CustomEntry — 찾던 말을 이름에 미리, 내 음식 저장 스위치).
 * 조합 · 어제와 같이 · 분류 둘러보기는 아직 웹.
 */
const LIMIT = 30;

export default function NutritionAddScreen() {
  const { date, meal, entry, plan, name: oldName } = useLocalSearchParams<{ date: string; meal: string; entry?: string; plan?: string; name?: string }>();
  const replacing = entry || plan ? { entry, plan, name: oldName ?? '' } : null;
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
  /* 이 창에서 담은 음식 이름 — 웹 '담았어요' 줄 */
  const [added, setAdded] = useState<string[]>([]);
  const [quick, setQuick] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customBusy, setCustomBusy] = useState(false);

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

  /* 바꾸기 모드면 그 줄을 바꾸고 닫는다 */
  const replaceWith = (f: Food, a: number) =>
    replacing?.entry ? replaceEntry(date, replacing.entry, f, a) : replacePlan(date, replacing?.plan ?? '', f, a);

  const save = async () => {
    if (!chosen || saving) return;
    setSaving(true);
    setError(null);
    if (replacing) {
      const err = await replaceWith(chosen, amount);
      setSaving(false);
      if (err) return setError(err);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return router.back();
    }
    const err = await addFoods(date, mealKey, [{ food: chosen, amount }]);
    setSaving(false);
    if (err) return setError(err);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAdded((a) => [...a, chosen.name]);
    setPicked(null);
    setScanned(null);
  };

  /* 줄 옆 + — 1인분을 바로(웹 '최근에 먹은 것은 + 한 번으로') */
  const quickAdd = async (f: Food, key: string) => {
    if (quick) return;
    setQuick(key);
    setError(null);
    if (replacing) {
      const err = await replaceWith(f, 1);
      setQuick(null);
      if (err) return setError(err);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return router.back();
    }
    const err = await addFoods(date, mealKey, [{ food: f, amount: 1 }]);
    setQuick(null);
    if (err) return setError(err);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAdded((a) => [...a, f.name]);
  };

  /* 직접 입력 — 담기(또는 바꾸기)가 된 뒤에만 내 음식에 저장(웹: 실패해도 · 두 번 눌러도 내 음식이 두 줄 생기지 않게) */
  const addCustom = async (food: Food, save: boolean) => {
    if (customBusy) return;
    setCustomBusy(true);
    setError(null);
    const err = replacing ? await replaceWith(food, 1) : await addFoods(date, mealKey, [{ food, amount: 1 }]);
    if (err) {
      setCustomBusy(false);
      return setError(err);
    }
    const saveErr = save ? await saveMyFood(food) : null;
    setCustomBusy(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (replacing) return router.back();
    setAdded((a) => [...a, food.name]);
    setCustomOpen(false);
    if (saveErr) setError(`${food.name} 내 음식에 저장하지 못했어요. ${saveErr}`);
  };

  const custom = (
    <View style={{ gap: 8, paddingTop: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: customOpen }}
        onPress={() => setCustomOpen((o) => !o)}
        style={[styles.customBtn, { borderColor: customOpen ? c.sky : c.line }]}
      >
        <Text style={{ color: customOpen ? c.sky : c.muted, fontSize: 15 }}>
          ✎ {q.trim() ? `‘${q.trim()}’ 직접 입력` : '목록에 없으면 직접 입력'}
        </Text>
      </Pressable>
      {customOpen ? (
        <CustomFood
          key={q.trim()}
          initialName={q.trim()}
          busy={customBusy}
          submitLabel={replacing ? '이 음식으로 바꾸기' : `${mealLabel(mealKey)}에 담기`}
          onSubmit={(food, save) => void addCustom(food, save)}
        />
      ) : null}
    </View>
  );

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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={replacing ? `${f.name}(으)로 바꾸기` : `${f.name} 1인분 담기`}
        onPress={() => void quickAdd(f, key)}
        hitSlop={8}
        style={styles.plus}
      >
        {quick === key ? (
          <ActivityIndicator />
        ) : replacing ? (
          <SymbolView name="arrow.triangle.2.circlepath" size={18} tintColor={c.sky} />
        ) : (
          <Text style={{ color: c.sky, fontSize: 24 }}>+</Text>
        )}
      </Pressable>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10}>
          <Text style={[styles.barAction, { color: c.sky }]}>{added.length ? '다 했어요' : '닫기'}</Text>
        </Pressable>
        <Text style={[styles.barTitle, { color: c.ink, flexShrink: 1 }]} numberOfLines={1}>
          {replacing ? `‘${replacing.name}’ 바꾸기` : `${mealLabel(mealKey)}에 담기`}
        </Text>
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
            {QUICK_AMOUNTS.map((a) => (
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
            <Pressable accessibilityLabel="양 줄이기" onPress={() => setAmount((x) => stepAmount(x, -1))} style={[styles.amount, { backgroundColor: c.chip }]}>
              <Text style={{ color: c.ink, fontSize: 17 }}>−</Text>
            </Pressable>
            <Pressable accessibilityLabel="양 늘리기" onPress={() => setAmount((x) => stepAmount(x, 1))} style={[styles.amount, { backgroundColor: c.chip }]}>
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
              <Text style={styles.primaryText}>{saving ? (replacing ? '바꾸는 중' : '담는 중') : replacing ? '바꾸기' : '담기'}</Text>
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
              placeholder="음식 이름이나 초성 (ㄷㄱㅅㅅ)"
              placeholderTextColor={c.muted}
              clearButtonMode="while-editing"
              returnKeyType="search"
              style={[styles.input, { backgroundColor: c.card, color: c.ink }]}
            />
          </View>
          {error ? <Text style={{ color: c.danger, fontSize: 14, paddingHorizontal: 20, paddingBottom: 6 }}>{error}</Text> : null}
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
                      <Text style={{ color: c.muted, fontSize: 15, padding: 8, textAlign: 'center' }}>‘{q.trim()}’에 맞는 음식이 없어요.</Text>
                    ) : null}
                  </>
                ) : local.length === 0 ? (
                  <Text style={{ color: c.muted, fontSize: 15, padding: 8, textAlign: 'center' }}>‘{q.trim()}’에 맞는 음식이 없어요.</Text>
                ) : null}
                {custom}
                <Text style={{ color: c.muted, fontSize: 12, lineHeight: 17, paddingTop: 8 }}>
                  {day?.mfds
                    ? '식약처 자료는 식품의약품안전처 식품영양성분 데이터베이스(공공데이터포털)에서 가져와요.'
                    : '식약처 음식 검색은 아직 연결 전이에요.'}
                </Text>
              </>
            ) : (
              <>
                {day?.recent.length ? <Text style={[styles.section, { color: c.muted }]}>최근 먹은 것</Text> : null}
                {day?.recent.slice(0, LIMIT).map((f, i) => row(f, `r${i}`))}
                {day?.mine.length ? <Text style={[styles.section, { color: c.muted }]}>내 음식</Text> : null}
                {day?.mine.slice(0, LIMIT).map((f, i) => row(f, `y${i}`))}
                {!day ? <ActivityIndicator style={{ padding: 16 }} /> : null}
                {custom}
              </>
            )}
          </ScrollView>
        </>
      )}
      {added.length > 0 && !replacing ? (
        <View style={[styles.added, { backgroundColor: c.card, borderTopColor: c.line, paddingBottom: inset.bottom + 10 }]}>
          <Text style={{ color: c.ok, fontSize: 16 }}>✓</Text>
          <Text style={{ flex: 1, color: c.ink, fontSize: 15 }} numberOfLines={1}>
            {added.length === 1 ? `${added[0]} 담았어요` : `${added.length}번 담았어요 · ${added.at(-1)}`}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={[styles.done, { backgroundColor: c.sky }]}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>다 했어요</Text>
          </Pressable>
        </View>
      ) : null}
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
  plus: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  customBtn: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  added: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  done: { height: 40, borderRadius: 20, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
});
