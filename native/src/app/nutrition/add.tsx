import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { type Href, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BASIC_FOODS, STARTER_FOOD_IDS, basicFood, rankFoods } from '@/lib/nutrition/foods';
import { COMBO_TOP, comboFood, findCombo, itemsFromEntries, orderCombos, type MealComboView } from '@/lib/nutrition/combos';
import { isMealKey, mealLabel, missingMacros, missingText, type Food, type MealKey } from '@/lib/nutrition/meta';
import { usePalette, withAlpha } from '~/lib/ui';
import { addFoods, deleteCombo, deleteMyFood, favoriteFood, unfavoriteFood, markComboUsed, replaceEntry, replacePlan, saveCombo, saveMyFood, searchMfds, searchMfdsReps, useNutritionDay } from '~/nutrition/api';
import { BrowseAll, ComboButton, ComboRow, PickPanel, SaveCombo } from '~/nutrition/add-parts';
import { Segmented } from '~/shell/heading';
import { Icon } from '~/shell/icon';
import { CustomFood } from '~/nutrition/custom-food';
import { takeScanned } from '~/nutrition/scanned';
import { READABLE } from '~/lib/layout';

/**
 * 음식 담기(앱) — 웹 영양 탭 음식 창의 첫 판: 찾기(기본 음식 · 내 음식 → 식약처 품목대표 → 식약처 상품, 웹과 같은 순서) · 최근 먹은 것 ·
 * 내 음식 · 바코드(앱 카메라 — 웹은 아이폰 사파리에서 바코드를 못 읽었다). 줄을 누르면 양(¼인분 단위)을 정해 담고, 줄 옆 + 한 번이면 1인분.
 * 웹 food-sheet.tsx 처럼 담아도 창을 닫지 않는다(한 끼는 보통 여러 가지) — 아래에 '○○ 담았어요'를 모아 보여 주고 '다 했어요'로 닫는다.
 * 바꾸기 모드(entry=먹은 줄 id 또는 plan=식단 줄 key, name=옛 이름): 웹 음식 창의 '‘○○’ 바꾸기'처럼 고르면 그 줄이 바뀌고 창이 닫힌다.
 * 목록에 없으면 직접 입력(웹 CustomEntry — 찾던 말을 이름에 미리, 내 음식 저장 스위치).
 * 어제와 같이 담기(웹과 같다 — 전날 그 끼니에 먹은 것을 같은 양으로 한 번에).
 * 찾지 않을 때는 웹 음식 창처럼: 위에 자주 먹는 조합 셋 · 어제와 같이 · '이 끼니를 조합으로 저장', 밑에 [최근 | 내 음식 | 전체 음식]
 * (내 음식 = 조합 · 내 음식, 전체 음식 = 인기 · 분류 · 세부 칸 · 식약처 둘러보기).
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
  const [tab, setTab] = useState<'recent' | 'mine' | 'all'>('recent');
  const [savedName, setSavedName] = useState<string | null>(null);

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
    /* 웹 음식 창과 같은 순서(rankFoods — 내 음식 +5점, 같은 점수면 짧은 이름 먼저, 40개) */
    return rankFoods([...(day?.mine ?? []), ...BASIC_FOODS], text, 40);
  }, [q, day?.mine]);

  /* 식약처 — 칠 때마다 0.35초 기다렸다가, 품목대표(바로) → 상품까지(느림). 늦게 온 옛 검색어 답은 버린다 */
  const latest = useRef('');
  useEffect(() => {
    const text = q.trim();
    latest.current = text;
    if (!text || !day?.mfds) return;
    const t = setTimeout(() => {
      /* 상품까지(full) 답이 먼저 왔으면 품목대표 답으로 덮지 않는다(순서가 뒤집히면 결과가 줄고 '더 찾는 중'이 안 끝났다) */
      void searchMfdsReps(text)
        .then((foods) => latest.current === text && setMfds((prev) => (prev?.q === text && prev.full ? prev : { q: text, foods, full: false })))
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
    if (replacing) {
      /* 바꾸기는 바로 닫는다 — 내 음식 저장만 실패했으면 알리고 닫는다(조용히 버려지던 것) */
      if (saveErr) Alert.alert('내 음식에 저장하지 못했어요', `${food.name}: ${saveErr}`);
      return router.back();
    }
    setAdded((a) => [...a, food.name]);
    setCustomOpen(false);
    if (saveErr) setError(`${food.name} 내 음식에 저장하지 못했어요. ${saveErr}`);
  };

  /* 어제 그 끼니 — 같은 음식 · 같은 양으로 한 번에(웹 addYesterday) */
  const yesterday = (day?.yesterday ?? []).filter((e) => e.meal === mealKey);
  const yesterdayKcal = yesterday.reduce((n, e) => n + e.kcal * e.amount, 0);
  const addYesterday = async () => {
    if (quick) return;
    setQuick('yesterday');
    setError(null);
    const err = await addFoods(
      date,
      mealKey,
      yesterday.map((e) => ({
        food: {
          source: e.source,
          id: e.sourceId,
          name: e.name,
          servingLabel: e.servingLabel ?? '1인분',
          servingGrams: e.servingGrams,
          kcal: e.kcal,
          carbs: e.carbs,
          protein: e.protein,
          fat: e.fat,
        },
        amount: e.amount,
      }))
    );
    setQuick(null);
    if (err) return setError(err);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAdded((a) => [...a, `어제 ${mealLabel(mealKey)} ${yesterday.length}가지`]);
  };

  /* 조합 — 이 끼니에 저장한 것 먼저, 그다음 자주 담은 것(웹 orderCombos). 창을 연 때의 차례로 둔다 */
  const comboList = useMemo(() => orderCombos(day?.combos ?? [], mealKey), [day?.combos, mealKey]);
  const current = (day?.entries ?? []).filter((e) => e.meal === mealKey);
  const currentItems = useMemo(() => itemsFromEntries(current), [current]);
  const canSaveCombo = currentItems.length >= 2 && !findCombo(comboList, currentItems);
  const addCombo = async (cb: MealComboView) => {
    if (quick) return;
    setQuick(`combo:${cb.id}`);
    setError(null);
    const err = await addFoods(date, mealKey, cb.items.map((i) => ({ food: comboFood(i), amount: i.amount })));
    setQuick(null);
    if (err) return setError(err);
    void markComboUsed(cb.id);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAdded((a) => [...a, cb.name]);
  };
  const removeCombo = async (cb: MealComboView) => {
    const err = await deleteCombo(date, cb.id);
    if (err) setError(err);
  };
  const onSaveCombo = async (name: string) => {
    setError(null);
    const err = await saveCombo(date, name, mealKey, currentItems);
    if (err) {
      setError(err);
      return false;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSavedName(name);
    return true;
  };
  /* ★ 내 음식에 두기 — 기본 · 식약처 · 바코드 음식만(웹 canFavorite). 누르는 대로 바꾸고, 서버가 거절하면 되돌린다 */
  const favKey = (f: Food) => `${f.source}:${f.id}`;
  const canFavorite = (f: Food) => (f.source === 'basic' || f.source === 'mfds' || f.source === 'barcode') && !!f.id;
  const [favs, setFavs] = useState<Set<string> | null>(null);
  const favSet = favs ?? new Set(day?.favorites ?? []);
  const toggleFavorite = async (f: Food) => {
    const key = favKey(f);
    const on = !favSet.has(key);
    const flip = (v: boolean) =>
      setFavs((prev) => {
        const next = new Set(prev ?? day?.favorites ?? []);
        if (v) next.add(key);
        else next.delete(key);
        return next;
      });
    flip(on);
    const err = on ? await favoriteFood(date, f) : await unfavoriteFood(date, f);
    if (err) {
      flip(!on);
      setError(err);
    }
  };
  /* 내 음식 지우기(웹 removeMine) — 한 번 더 눌러야 지운다 */
  const [confirmMine, setConfirmMine] = useState<string | null>(null);
  const removeMine = async (f: Food) => {
    if (!f.id) return;
    setConfirmMine(null);
    const err = await deleteMyFood(date, f.id);
    if (err) setError(err);
  };
  const starters = useMemo(() => STARTER_FOOD_IDS.map(basicFood).filter((f): f is Food => f !== null), []);

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

  const row = (f: Food, key: string, hideNote = false) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      onPress={() => {
        setScanned(null);
        setPicked(f);
        setAmount(1);
      }}
      style={({ pressed }) => [styles.row, { backgroundColor: c.card, boxShadow: c.float }, pressed && { opacity: 0.6 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
          {f.name}
        </Text>
        <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={1}>
          {f.servingLabel} · {Math.round(f.kcal)}kcal{f.protein != null ? ` · 단백질 ${Math.round(f.protein)}g` : ''}
          {f.note && !hideNote ? ` · ${f.note}` : ''}
          {/* 모르는 영양소 — 웹 음식 창 줄과 같은 '탄·지 모름'('없음'이라 적으면 0g 으로 읽힌다) */}
          {missingMacros(f).length > 0 ? ` · ${missingText(missingMacros(f))}` : ''}
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
        <ScrollView contentContainerStyle={[{ paddingHorizontal: 16, paddingBottom: inset.bottom + 24 }, READABLE]} keyboardShouldPersistTaps="handled">
          <PickPanel
            key={`${chosen.source}:${chosen.id ?? chosen.name}`}
            food={chosen}
            amount={amount}
            setAmount={setAmount}
            favorite={canFavorite(chosen) ? favSet.has(favKey(chosen)) : null}
            onFavorite={() => void toggleFavorite(chosen)}
            error={error}
            saving={saving}
            replacing={!!replacing}
            onCancel={() => {
              setPicked(null);
              setScanned(null);
            }}
            onSave={() => void save()}
            c={c}
          />
        </ScrollView>
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
          <ScrollView contentContainerStyle={[{ padding: 16, paddingTop: 0, gap: 6, paddingBottom: inset.bottom + 24 }, READABLE]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
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
                ) : !day ? (
                  /* 그날을 아직 받는 중 — 식약처가 되는지 모르니 '없어요' · '연결 전'을 말하지 않는다 */
                  <ActivityIndicator style={{ padding: 8 }} />
                ) : local.length === 0 ? (
                  <Text style={{ color: c.muted, fontSize: 15, padding: 8, textAlign: 'center' }}>‘{q.trim()}’에 맞는 음식이 없어요.</Text>
                ) : null}
                {custom}
                {day ? (
                  <Text style={{ color: c.muted, fontSize: 12, lineHeight: 17, paddingTop: 8 }}>
                    {day.mfds
                      ? '식약처 자료는 식품의약품안전처 식품영양성분 데이터베이스(공공데이터포털)에서 가져와요.'
                      : '식약처 음식 검색은 아직 연결 전이에요.'}
                  </Text>
                ) : null}
              </>
            ) : (
              <>
                {!replacing
                  ? comboList.slice(0, COMBO_TOP).map((cb) => (
                      <ComboButton key={cb.id} combo={cb} busy={quick === `combo:${cb.id}`} onAdd={() => void addCombo(cb)} c={c} />
                    ))
                  : null}
                {!replacing && yesterday.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void addYesterday()}
                    disabled={quick != null}
                    style={({ pressed }) => [styles.row, { backgroundColor: c.card, boxShadow: c.float }, pressed && { opacity: 0.6 }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>어제 {mealLabel(mealKey)}과 같이 담기</Text>
                      <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={1}>
                        {yesterday.map((e) => e.name).join(', ')}
                      </Text>
                    </View>
                    {quick === 'yesterday' ? (
                      <ActivityIndicator />
                    ) : (
                      <Text style={{ color: c.muted, fontSize: 14 }}>{Math.round(yesterdayKcal).toLocaleString('ko-KR')}kcal</Text>
                    )}
                  </Pressable>
                ) : null}
                {replacing ? null : savedName ? (
                  <View style={[styles.row, { backgroundColor: withAlpha(c.ok, 0.1) }]}>
                    <Text style={{ color: c.ok, fontSize: 15 }} numberOfLines={1}>
                      ✓ ‘{savedName}’ 조합으로 저장했어요
                    </Text>
                  </View>
                ) : canSaveCombo ? (
                  <SaveCombo label={mealLabel(mealKey)} items={currentItems} onSave={onSaveCombo} c={c} />
                ) : null}
                <View style={{ paddingVertical: 6 }}>
                  <Segmented
                    label="음식 고르는 곳"
                    options={[
                      { value: 'recent', label: '최근' },
                      { value: 'mine', label: '내 음식' },
                      { value: 'all', label: '전체 음식' },
                    ]}
                    value={tab}
                    onChange={setTab}
                  />
                </View>
                {!day ? <ActivityIndicator style={{ padding: 16 }} /> : null}
                {day && tab === 'recent' ? (
                  day.recent.length === 0 ? (
                    <>
                      <Text style={[styles.section, { color: c.muted }]}>아직 기록이 없어요. 선수들이 자주 먹는 것부터 골라 보세요.</Text>
                      {starters.map((f, i) => row(f, `s${i}`))}
                    </>
                  ) : (
                    day.recent.slice(0, LIMIT).map((f, i) => row(f, `r${i}`))
                  )
                ) : null}
                {day && tab === 'mine' ? (
                  day.mine.length === 0 && (replacing || comboList.length === 0) ? (
                    <Text style={{ color: c.muted, fontSize: 15, padding: 12, textAlign: 'center', lineHeight: 21 }}>
                      직접 만든 음식과 저장한 조합이 여기 모여요.
                    </Text>
                  ) : (
                    <>
                      {!replacing && comboList.length > 0 ? (
                        <>
                          <Text style={[styles.section, { color: c.muted }]}>조합</Text>
                          {comboList.map((cb) => (
                            <ComboRow
                              key={cb.id}
                              combo={cb}
                              busy={quick === `combo:${cb.id}`}
                              onAdd={() => void addCombo(cb)}
                              onRemove={() => void removeCombo(cb)}
                              c={c}
                            />
                          ))}
                        </>
                      ) : null}
                      {day.mine.length > 0 && !replacing && comboList.length > 0 ? <Text style={[styles.section, { color: c.muted }]}>음식</Text> : null}
                      {day.mine.slice(0, LIMIT).map((f, i) => (
                        <View key={`y${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <View style={{ flex: 1 }}>{row(f, `yr${i}`)}</View>
                          {f.id ? (
                            confirmMine === f.id ? (
                              <Pressable accessibilityRole="button" onPress={() => void removeMine(f)} style={[styles.del, { backgroundColor: withAlpha(c.danger, 0.12) }]}>
                                <Text style={{ color: c.danger, fontSize: 13, fontWeight: '700' }}>지우기</Text>
                              </Pressable>
                            ) : (
                              <Pressable accessibilityRole="button" accessibilityLabel={`${f.name} 내 음식에서 빼기`} onPress={() => setConfirmMine(f.id)} style={styles.delIcon}>
                                <Icon name="trash2" size={16} color={c.muted} />
                              </Pressable>
                            )
                          ) : null}
                        </View>
                      ))}
                    </>
                  )
                ) : null}
                {day && tab === 'all' ? <BrowseAll popular={day.popular ?? []} browseSubs={day.browseSubs ?? {}} mfds={day.mfds} row={row} c={c} /> : null}
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
  plus: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  del: { height: 36, borderRadius: 10, paddingHorizontal: 10, justifyContent: 'center' },
  delIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  customBtn: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  added: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  done: { height: 40, borderRadius: 20, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
});
