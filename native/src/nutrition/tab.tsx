import { SymbolView } from 'expo-symbols';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MEALS, amountText, entryMacros, mealLabel, stepAmount, type EntryEdit, type MealEntryView, type MealKey } from '@/lib/nutrition/meta';
import { mealProtein } from '@/lib/nutrition/meal-protein';
import { shiftDateKey } from '@/lib/pitch-stats';
import { fromWeight, round1, toWeight } from '@/lib/units';
import { useWeightUnit } from '~/lib/weight-unit';
import { usePalette } from '~/lib/ui';
import { PLAN_PLACES, type PlanItem } from '@/lib/nutrition/meal-plan';
import type { Place } from '@/lib/nutrition/meal-templates';
import { clearPlan, eatPlan, editEntries, makePlan, saveWeight, useNutritionDay } from './api';
import { READABLE } from '~/lib/layout';

/**
 * 영양 탭(앱 화면) — 웹 영양 탭의 '기록' 쪽: 오늘 먹은 것과 목표(kcal · 탄 · 단 · 지) · 끼니마다 담은 음식(양 바꾸기 · 지우기) · 체중.
 * 담기는 음식 고르기 화면(/nutrition/add — 검색 · 최근 · 내 음식 · 바코드), 식단 짜기는 이 탭 안, 목표 · 통계는 /nutrition/stats. 첫 설정만 웹(onWebNutrition).
 * 날짜는 오늘부터 지난 6주까지 ‹ › 로.
 */
const BACK_DAYS = 42;

const round = (n: number) => Math.round(n);
const kcalText = (n: number) => `${round(n).toLocaleString('ko-KR')}kcal`;

export function NutritionTab({ today, bottom, onWebNutrition }: { today: string; bottom: number; onWebNutrition: () => void }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  /* 끼니 편집 — 웹처럼 한 끼니씩. 고친 값(초안)은 '완료'를 누를 때 한 번에 저장(nutrition.editMealEntries), '취소'면 버린다 */
  const [editing, setEditing] = useState<MealKey | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [date, setDateRaw] = useState(today);
  const [weightText, setWeightText] = useState<string | null>(null);
  /* 날을 바꾸면 적던 체중은 버린다 — 다른 날에 저장되지 않게 */
  const setDate = (d: string) => {
    setDateRaw(d);
    setWeightText(null);
    setEditing(null);
    setDrafts({});
  };
  const { day, error, to, loading, reload } = useNutritionDay(date);
  const [busy, setBusy] = useState(false);
  /* 체중은 설정 단위(kg · lb)로 보이고 적는다 — 저장은 늘 kg(2026-10-18 점검: lb 쓰는 사람의 160 이 160kg 으로 저장됐다) */
  const unit = useWeightUnit();

  if (to)
    return (
      <View style={[styles.center, { backgroundColor: c.page, paddingBottom: bottom }]}>
        <Text style={{ color: c.ink, fontSize: 17, textAlign: 'center' }}>{error}</Text>
        <Pressable accessibilityRole="button" onPress={onWebNutrition} style={[styles.primary, { backgroundColor: c.sky }]}>
          <Text style={styles.primaryText}>영양 설정하기</Text>
        </Pressable>
      </View>
    );

  const eaten = (day?.entries ?? []).reduce(
    (a, e) => {
      const m = entryMacros(e);
      return { kcal: a.kcal + m.kcal, carbs: a.carbs + m.carbs, protein: a.protein + m.protein, fat: a.fat + m.fat };
    },
    { kcal: 0, carbs: 0, protein: 0, fat: 0 }
  );
  const t = day?.targets;
  const left = t ? t.kcal - eaten.kcal : 0;
  const oldest = shiftDateKey(today, -BACK_DAYS);
  const [, m, d] = date.split('-').map(Number);

  const run = async (job: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(true);
    const err = await job();
    setBusy(false);
    if (err) Alert.alert('저장하지 못했어요', err);
  };

  const startEdit = (meal: MealKey) => {
    setEditing(meal);
    setDrafts({});
  };
  const draftOf = (e: MealEntryView): Draft => {
    const d = drafts[e.id];
    if (!d) return { amount: e.amount, meal: e.meal, remove: false };
    /* 바꾸기 뒤(NaN)는 새 음식의 양 */
    return Number.isNaN(d.amount) ? { ...d, amount: e.amount } : d;
  };
  const finishEdit = (list: MealEntryView[]) => {
    const edits: EntryEdit[] = [];
    for (const e of list) {
      if (!drafts[e.id]) continue;
      const d = draftOf(e);
      if (d.remove) edits.push({ id: e.id, remove: true });
      else if (d.amount !== e.amount || d.meal !== e.meal)
        edits.push({ id: e.id, ...(d.amount !== e.amount ? { amount: d.amount } : {}), ...(d.meal !== e.meal ? { meal: d.meal } : {}) });
    }
    setEditing(null);
    setDrafts({});
    if (edits.length) void run(() => editEntries(date, edits));
  };

  const saveW = () => {
    if (weightText == null) return;
    const typed = weightText.trim() ? Number.parseFloat(weightText.replace(',', '.')) : null;
    if (typed != null && !Number.isFinite(typed)) return Alert.alert('체중을 숫자로 적어 주세요.');
    const kg = typed == null ? null : Math.round(fromWeight(typed, unit) * 10) / 10;
    void run(async () => {
      const err = await saveWeight(date, kg);
      if (!err) setWeightText(null);
      return err;
    });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.page }}
      contentContainerStyle={[{ paddingTop: inset.top + 12, paddingBottom: bottom + 24, paddingHorizontal: 16, gap: 16 }, READABLE]}
      refreshControl={<RefreshControl refreshing={loading && day != null} onRefresh={reload} />}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: c.ink }]}>영양</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/nutrition/stats' as Href as never, params: { date } })}
          style={[styles.chip, { backgroundColor: c.chip }]}
        >
          <Text style={[styles.chipText, { color: c.ink }]}>목표 · 통계</Text>
        </Pressable>
      </View>

      <View style={styles.dateRow}>
        <Pressable
          accessibilityLabel="전날"
          disabled={date <= oldest}
          onPress={() => setDate(shiftDateKey(date, -1))}
          style={[styles.arrow, date <= oldest && { opacity: 0.3 }]}
        >
          <Text style={[styles.arrowText, { color: c.sky }]}>‹</Text>
        </Pressable>
        <Text style={[styles.date, { color: c.ink }]}>{date === today ? '오늘' : `${m}월 ${d}일`}</Text>
        <Pressable
          accessibilityLabel="다음날"
          disabled={date >= today}
          onPress={() => setDate(shiftDateKey(date, 1))}
          style={[styles.arrow, date >= today && { opacity: 0.3 }]}
        >
          <Text style={[styles.arrowText, { color: c.sky }]}>›</Text>
        </Pressable>
      </View>

      {error && !day ? <Text style={{ color: c.danger, fontSize: 15 }}>{error}</Text> : null}

      {t ? (
        <View style={[styles.card, { backgroundColor: c.card }]}>
          <Text style={[styles.big, { color: c.ink }]}>
            {left >= 0 ? kcalText(left) : kcalText(-left)}
            <Text style={[styles.bigUnit, { color: c.muted }]}>{left >= 0 ? ' 남았어요' : ' 넘었어요'}</Text>
          </Text>
          <Text style={{ color: c.muted, fontSize: 14 }}>
            먹은 {kcalText(eaten.kcal)} · 목표 {kcalText(t.kcal)}
            {t.burn > 0 ? ` (운동 +${round(t.burn)})` : ''}
          </Text>
          <Bar label="탄수화물" value={eaten.carbs} target={t.carbs} />
          <Bar label="단백질" value={eaten.protein} target={t.protein} />
          <Bar label="지방" value={eaten.fat} target={t.fat} />
        </View>
      ) : !error ? (
        <View style={[styles.card, { backgroundColor: c.card, height: 160 }]} />
      ) : null}

      {day && date === today ? <PlanCard date={date} plan={day.mealPlan} busy={busy} run={run} /> : null}

      {day
        ? MEALS.map((meal) => {
            const list = day.entries.filter((e) => e.meal === meal.key);
            const planned = (day.mealPlan?.items ?? []).filter((p) => p.meal === meal.key && !p.done);
            const kcal = list.reduce((n, e) => n + entryMacros(e).kcal, 0);
            /* 끼니 단백질 — 웹 끼니 칸과 같은 계산(목표 · 8할이면 채움 · 모자라면 예시). 나이 띠를 모르는 옛 자료면 목표 없이 */
            const p = day.ageBand
              ? mealProtein(meal.key, day.entries, t?.protein ?? 0, day.ageBand, day.avoid ?? [])
              : null;
            const protein = p?.protein ?? Math.round(list.reduce((n, e) => n + entryMacros(e).protein, 0));
            const isEditing = editing === meal.key;
            const allRemoved = list.length > 0 && list.every((e) => draftOf(e).remove);
            return (
              <View key={meal.key} style={[styles.card, { backgroundColor: c.card, gap: 4 }]}>
                <View style={styles.mealHead}>
                  <Text style={[styles.mealTitle, { color: c.ink }]}>{meal.label}</Text>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: p?.done ? c.ok : c.muted, fontSize: 14, fontWeight: p?.done ? '600' : '400' }}>
                      {list.length ? `${kcalText(kcal)} · ` : ''}
                      {p?.done ? '✓ ' : ''}
                      {list.length || p?.goal != null ? `단백질 ${protein}${p?.unknown ? '+' : ''}${p?.goal != null ? ` / 목표 ${p.goal}` : ''}g` : ''}
                    </Text>
                    {p?.goal != null ? (
                      <View style={[styles.proteinTrack, { backgroundColor: c.chip }]}>
                        <View style={{ width: `${Math.min(100, (p.protein / p.goal) * 100)}%`, height: '100%', borderRadius: 2, backgroundColor: p.done ? c.ok : c.sky }} />
                      </View>
                    ) : null}
                  </View>
                  {isEditing ? (
                    <>
                      <Pressable accessibilityRole="button" onPress={() => (setEditing(null), setDrafts({}))} hitSlop={6} style={styles.textBtn}>
                        <Text style={{ color: c.muted, fontSize: 15 }}>취소</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" onPress={() => finishEdit(list)} hitSlop={6} style={styles.textBtn}>
                        <Text style={{ color: c.sky, fontSize: 15, fontWeight: '700' }}>완료</Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      {list.length ? (
                        <Pressable accessibilityRole="button" accessibilityLabel={`${meal.label} 편집`} onPress={() => startEdit(meal.key)} hitSlop={6} style={styles.textBtn}>
                          <Text style={{ color: c.sky, fontSize: 15, fontWeight: '600' }}>편집</Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${meal.label}에 음식 담기`}
                        onPress={() => router.push({ pathname: '/nutrition/add' as Href as never, params: { date, meal: meal.key } })}
                        style={[styles.add, { backgroundColor: c.chip }]}
                      >
                        <Text style={[styles.addText, { color: c.sky }]}>+ 담기</Text>
                      </Pressable>
                    </>
                  )}
                </View>
                {planned.length ? (
                  <PlanRows
                    items={planned}
                    onEat={(keys) => run(() => eatPlan(date, keys))}
                    onReplace={(it) => router.push({ pathname: '/nutrition/add' as Href as never, params: { date, meal: meal.key, plan: it.key, name: it.name } })}
                    busy={busy}
                  />
                ) : null}
                {list.map((e) =>
                  isEditing ? (
                    <EditRow
                      key={e.id}
                      entry={e}
                      draft={draftOf(e)}
                      onChange={(d) => setDrafts((all) => ({ ...all, [e.id]: d }))}
                      onReplace={() => {
                        /* 바꾸면 그 줄의 고친 양은 버린다(새 음식의 양을 따른다 — 웹 rowSig) · 옮기기 · 지우기는 그대로 */
                        setDrafts((all) => {
                          const d = all[e.id];
                          if (!d) return all;
                          return { ...all, [e.id]: { ...d, amount: NaN } };
                        });
                        router.push({ pathname: '/nutrition/add' as Href as never, params: { date, meal: meal.key, entry: e.id, name: e.name } });
                      }}
                    />
                  ) : (
                    /* 줄을 누르면 그 끼니가 편집 모양이 된다(웹 MealSection onEdit) */
                    <EntryRow key={e.id} entry={e} onPress={() => startEdit(meal.key)} />
                  )
                )}
                {isEditing ? (
                  <View style={styles.editFoot}>
                    <Text style={{ flex: 1, color: c.muted, fontSize: 13 }}>고친 것은 완료를 누르면 한 번에 저장돼요</Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        setDrafts((all) => {
                          const next = { ...all };
                          for (const e of list) next[e.id] = { ...draftOf(e), remove: !allRemoved };
                          return next;
                        })
                      }
                      hitSlop={6}
                      style={styles.textBtn}
                    >
                      <Text style={{ color: allRemoved ? c.sky : c.danger, fontSize: 13, fontWeight: '600' }}>
                        {allRemoved ? '모두 되살리기' : '모두 지우기'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
                {p?.tip && !isEditing ? (
                  <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18, paddingTop: 2 }}>
                    단백질 <Text style={{ color: c.ink, fontWeight: '600' }}>{p.short}g</Text> 모자라요 · {p.tip.label}(+{p.tip.protein}g)이면{' '}
                    {p.tip.covers ? '채워요' : '거의 채워요'}
                  </Text>
                ) : null}
              </View>
            );
          })
        : null}

      {day ? (
        <View style={[styles.card, { backgroundColor: c.card }]}>
          <Text style={[styles.mealTitle, { color: c.ink }]}>체중</Text>
          <View style={styles.weightRow}>
            <TextInput
              value={weightText ?? (day.weightKg != null ? String(round1(toWeight(day.weightKg, unit))) : '')}
              onChangeText={setWeightText}
              keyboardType="decimal-pad"
              placeholder={unit}
              placeholderTextColor={c.muted}
              style={[styles.input, { backgroundColor: c.page, color: c.ink }]}
            />
            <Text style={{ color: c.muted, fontSize: 17 }}>{unit}</Text>
            {weightText != null ? (
              <Pressable accessibilityRole="button" onPress={saveW} disabled={busy} style={[styles.save, { backgroundColor: c.sky }]}>
                <Text style={styles.primaryText}>저장</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

/**
 * 식단 짜기(오늘만) — 웹 영양 탭 식단 카드와 같은 서버 셈. 짜기 전: 오늘 훈련 장소 · 더운 날 → [식단 짜기]. 짠 뒤: 까닭 몇 줄 ·
 * [다른 식단으로](같은 조건의 다음 식단) · [지우기]. 계획 줄은 끼니 칸에 흐리게 서고, 먹었으면 동그라미로 먹은 기록이 된다.
 */
function PlanCard({
  date,
  plan,
  busy,
  run,
}: {
  date: string;
  plan: { items: PlanItem[]; context: { place: Place; hot: boolean; variant: number; reasons: string[] } } | null;
  busy: boolean;
  run: (job: () => Promise<string | null>) => Promise<void>;
}) {
  const c = usePalette();
  const [place, setPlace] = useState<Place>(plan?.context.place ?? 'home');
  const [hot, setHot] = useState(plan?.context.hot ?? false);
  if (plan) {
    const left = plan.items.filter((p) => !p.done).length;
    return (
      <View style={[styles.card, { backgroundColor: c.card }]}>
        <Text style={[styles.mealTitle, { color: c.ink }]}>오늘 식단</Text>
        <Text style={{ color: c.muted, fontSize: 14 }}>
          {left > 0 ? `먹을 것 ${left}가지 남았어요 · 끼니 칸의 동그라미를 누르면 먹은 기록이 돼요.` : '식단을 다 먹었어요.'}
        </Text>
        {plan.context.reasons.slice(0, 3).map((r, i) => (
          <Text key={i} style={{ color: c.muted, fontSize: 13 }}>
            · {r}
          </Text>
        ))}
        <View style={styles.weightRow}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => run(() => makePlan(date, plan.context.place, plan.context.hot, plan.context.variant + 1))}
            style={[styles.ghostBtn, { backgroundColor: c.chip }]}
          >
            <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>다른 식단으로</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() =>
              Alert.alert('오늘 식단을 지울까요?', '먹은 기록은 그대로 남아요.', [
                { text: '취소', style: 'cancel' },
                { text: '지우기', style: 'destructive', onPress: () => void run(() => clearPlan(date)) },
              ])
            }
            style={[styles.ghostBtn, { backgroundColor: c.chip }]}
          >
            <Text style={{ color: c.danger, fontSize: 15, fontWeight: '600' }}>지우기</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.card, { backgroundColor: c.card }]}>
      <Text style={[styles.mealTitle, { color: c.ink }]}>오늘 식단 짜기</Text>
      <Text style={{ color: c.muted, fontSize: 14 }}>목표 · 오늘 운동 · 컨디션에 맞춰 남은 끼니를 짜요.</Text>
      <View style={styles.placeRow}>
        {PLAN_PLACES.map((p) => {
          const on = place === p.key;
          return (
            <Pressable
              key={p.key}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => setPlace(p.key)}
              style={[styles.placeChip, { backgroundColor: on ? c.sky : c.chip }]}
            >
              <Text style={{ color: on ? '#fff' : c.ink, fontSize: 14, fontWeight: '600' }}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.hotRow}>
        <Text style={{ flex: 1, color: c.ink, fontSize: 15 }}>더운 날 · 야외 훈련</Text>
        <Switch value={hot} onValueChange={setHot} />
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => run(() => makePlan(date, place, hot, 0))}
        style={[styles.primary, { backgroundColor: c.sky }, busy && { opacity: 0.5 }]}
      >
        <Text style={styles.primaryText}>{busy ? '짜는 중' : '식단 짜기'}</Text>
      </Pressable>
    </View>
  );
}

/** 끼니 칸 안의 계획 줄 — 흐린 줄, 동그라미 = 먹었어요, 끼니째 '모두 먹었어요' */
function PlanRows({
  items,
  onEat,
  onReplace,
  busy,
}: {
  items: PlanItem[];
  onEat: (keys: string[]) => void;
  /** 이름을 누르면 다른 음식으로 바꾸기(웹 PlanBlock onReplace) */
  onReplace: (item: PlanItem) => void;
  busy: boolean;
}) {
  const c = usePalette();
  return (
    <View style={{ gap: 2 }}>
      {items.map((p) => (
        <View key={p.key} style={[styles.entry, { opacity: 0.75 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${p.name} 먹었어요`}
            disabled={busy}
            onPress={() => onEat([p.key])}
            hitSlop={8}
            style={[styles.eat, { borderColor: c.sky }]}
          />
          <Pressable accessibilityRole="button" accessibilityLabel={`${p.name} 다른 음식으로 바꾸기`} onPress={() => onReplace(p)} style={{ flex: 1 }}>
            <Text style={{ color: c.ink, fontSize: 15 }} numberOfLines={1}>
              식단 · {p.name}
            </Text>
          </Pressable>
          <Text style={{ color: c.muted, fontSize: 14 }}>
            {p.amount !== 1 ? `${amountText(p.amount)} · ` : ''}
            {kcalText(p.kcal * p.amount)}
          </Text>
        </View>
      ))}
      {items.length > 1 ? (
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => onEat(items.map((p) => p.key))} style={{ minHeight: 36, justifyContent: 'center' }}>
          <Text style={{ color: c.sky, fontSize: 14, fontWeight: '600' }}>모두 먹었어요</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Bar({ label, value, target }: { label: string; value: number; target: number }) {
  const c = usePalette();
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.barHead}>
        <Text style={{ color: c.ink, fontSize: 14, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: c.muted, fontSize: 14 }}>
          {round(value)} / {round(target)}g
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: c.line }]}>
        <View style={[styles.fill, { backgroundColor: c.sky, width: `${pct * 100}%` }]} />
      </View>
    </View>
  );
}

type Draft = { amount: number; meal: MealKey; remove: boolean };

function EntryRow({ entry, onPress }: { entry: MealEntryView; onPress: () => void }) {
  const c = usePalette();
  const m = entryMacros(entry);
  return (
    <Pressable accessibilityRole="button" accessibilityHint="끼니 편집" onPress={onPress} style={styles.entry}>
      <Text style={{ flex: 1, color: c.ink, fontSize: 15 }} numberOfLines={1}>
        {entry.name}
      </Text>
      <Text style={{ color: c.muted, fontSize: 14 }}>
        {entry.amount !== 1 ? `${amountText(entry.amount)} · ` : ''}
        {kcalText(m.kcal)}
      </Text>
    </Pressable>
  );
}

/** 끼니 편집의 한 줄 — 웹 nutrition-view.tsx EditRow 와 같은 칸: 양 −/+ · 다른 끼니로 옮기기 · 지우기(되살리기) */
function EditRow({
  entry,
  draft,
  onChange,
  onReplace,
}: {
  entry: MealEntryView;
  draft: Draft;
  onChange: (d: Draft) => void;
  /** 이름을 누르면 다른 음식으로 바꾸기(지운 줄은 못 바꾼다) */
  onReplace: () => void;
}) {
  const c = usePalette();
  const moved = draft.meal !== entry.meal;
  const move = () =>
    Alert.alert(
      `${entry.name} 옮기기`,
      undefined,
      [
        ...MEALS.map((m) => ({
          text: m.key === draft.meal ? `${m.label} ✓` : m.label,
          onPress: () => onChange({ ...draft, meal: m.key }),
        })),
        { text: '취소', style: 'cancel' as const },
      ]
    );
  return (
    <View style={styles.entry}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${entry.name} 다른 음식으로 바꾸기`}
        disabled={draft.remove}
        onPress={onReplace}
        style={{ flex: 1, opacity: draft.remove ? 0.45 : 1 }}
      >
        <Text style={{ color: c.ink, fontSize: 15, textDecorationLine: draft.remove ? 'line-through' : 'none' }} numberOfLines={1}>
          {entry.name}
        </Text>
        <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={1}>
          {kcalText(entry.kcal * draft.amount)}
          {moved && !draft.remove ? <Text style={{ color: c.sky, fontWeight: '600' }}> · {mealLabel(draft.meal)}으로 옮김</Text> : null}
          {!draft.remove ? <Text style={{ color: c.sky }}> · 바꾸기</Text> : null}
        </Text>
      </Pressable>
      {draft.remove ? (
        <Pressable accessibilityRole="button" onPress={() => onChange({ ...draft, remove: false })} style={styles.textBtn}>
          <Text style={{ color: c.sky, fontSize: 14, fontWeight: '600' }}>되살리기</Text>
        </Pressable>
      ) : (
        <>
          <View style={[styles.stepper, { backgroundColor: c.chip }]}>
            <Pressable accessibilityLabel={`${entry.name} 줄이기`} onPress={() => onChange({ ...draft, amount: stepAmount(draft.amount, -1) })} style={styles.step}>
              <Text style={[styles.stepText, { color: c.ink }]}>−</Text>
            </Pressable>
            <Text style={{ color: c.ink, fontSize: 13, fontWeight: '600', minWidth: 44, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
              {amountText(draft.amount)}
            </Text>
            <Pressable accessibilityLabel={`${entry.name} 늘리기`} onPress={() => onChange({ ...draft, amount: stepAmount(draft.amount, 1) })} style={styles.step}>
              <Text style={[styles.stepText, { color: c.ink }]}>+</Text>
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`${entry.name} 다른 끼니로 옮기기`} onPress={move} style={styles.icon}>
            <SymbolView name="arrow.left.arrow.right" size={17} tintColor={moved ? c.sky : c.muted} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`${entry.name} 지우기`} onPress={() => onChange({ ...draft, remove: true })} style={styles.icon}>
            <SymbolView name="trash" size={17} tintColor={c.muted} />
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  proteinTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 34, fontWeight: '700' },
  chip: { height: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center' },
  chipText: { fontSize: 14, fontWeight: '600' },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: -8 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontSize: 28 },
  date: { fontSize: 17, fontWeight: '600', minWidth: 90, textAlign: 'center' },
  card: { borderRadius: 20, padding: 16, gap: 10 },
  big: { fontSize: 32, fontWeight: '700', fontVariant: ['tabular-nums'] },
  bigUnit: { fontSize: 17, fontWeight: '600' },
  barHead: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  mealHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  mealTitle: { fontSize: 17, fontWeight: '700' },
  add: { height: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center' },
  addText: { fontSize: 15, fontWeight: '600' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  editFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
  textBtn: { minHeight: 40, paddingHorizontal: 8, justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 12 },
  step: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 22, fontWeight: '600' },
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, minHeight: 48, borderRadius: 12, paddingHorizontal: 14, fontSize: 17 },
  save: { height: 48, borderRadius: 24, paddingHorizontal: 20, justifyContent: 'center' },
  primary: { height: 48, borderRadius: 24, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
  ghostBtn: { flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  placeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  placeChip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center' },
  hotRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  eat: { width: 22, height: 22, borderRadius: 11, borderWidth: 2 },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
