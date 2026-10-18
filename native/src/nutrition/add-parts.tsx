import * as Haptics from 'expo-haptics';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { COMBO_NAME_MAX, comboMacros, defaultComboName, type ComboItem, type MealComboView } from '@/lib/nutrition/combos';
import { FOOD_CATEGORIES, FOODS_BY_CATEGORY, type FoodCategory } from '@/lib/nutrition/foods';
import { subcategoriesOf, subcategoryOf } from '@/lib/nutrition/food-subcategory';
import { mealLabel, type Food, type RankedFood } from '@/lib/nutrition/meta';
import { withAlpha, type Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { fadeIn } from '~/shell/motion';
import { browseMfds, type BrowsePage } from './api';

/**
 * 음식 담기 화면(app/nutrition/add.tsx)의 조합 · 전체 음식 조각 — 웹 app/(app)/nutrition/food-sheet.tsx 의 ComboButton · ComboRow ·
 * SaveCombo · BrowseAll · MfdsBrowse 를 옮겼다. 규칙(조합 지문 · 이름 · 분류 · 세부 칸)은 웹과 같은 lib 함수.
 */
const kcalText = (n: number) => Math.round(n).toLocaleString('ko-KR');
export function comboLines(items: ComboItem[]) {
  const m = comboMacros(items);
  return { names: items.map((i) => i.name).join(', '), totals: `${kcalText(m.kcal)}kcal · 단백질 ${Math.round(m.protein)}g` };
}

/** 위쪽 조합 한 줄 — 누르면 저장한 양대로 한 번에 담는다('어제와 같이'와 같은 모양) */
export function ComboButton({ combo, busy, onAdd, c }: { combo: MealComboView; busy: boolean; onAdd: () => void; c: Palette }) {
  const { names, totals } = comboLines(combo.items);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${combo.name} 조합 한 번에 담기`}
      onPress={onAdd}
      disabled={busy}
      style={({ pressed }) => [st.wide, { backgroundColor: c.card }, pressed && { opacity: 0.6 }]}
    >
      <Icon name="layers" size={16} color={c.sky} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
          {combo.name}
        </Text>
        <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={1}>
          {names}
        </Text>
      </View>
      {busy ? <ActivityIndicator /> : <Text style={{ color: c.muted, fontSize: 13, fontVariant: ['tabular-nums'] }}>{totals.split(' · ')[0]}</Text>}
    </Pressable>
  );
}

/** 내 음식 칸의 조합 줄 — 누르거나 + 로 담기, 휴지통은 한 번 더 눌러야 지운다 */
export function ComboRow({ combo, busy, onAdd, onRemove, c }: { combo: MealComboView; busy: boolean; onAdd: () => void; onRemove: () => void; c: Palette }) {
  const { names, totals } = comboLines(combo.items);
  const [confirm, setConfirm] = useState(false);
  return (
    <View style={[st.row, { backgroundColor: c.card }]}>
      <Pressable accessibilityRole="button" onPress={onAdd} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name="layers" size={16} color={c.sky} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
            {combo.name}
          </Text>
          <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={1}>
            {combo.meal ? `${mealLabel(combo.meal)} · ` : ''}
            {names}
          </Text>
          <Text style={{ color: c.muted, fontSize: 12, fontVariant: ['tabular-nums'] }}>{totals}</Text>
        </View>
      </Pressable>
      {confirm ? (
        <Pressable accessibilityRole="button" onPress={onRemove} style={[st.del, { backgroundColor: withAlpha(c.danger, 0.12) }]}>
          <Text style={{ color: c.danger, fontSize: 13, fontWeight: '700' }}>지우기</Text>
        </Pressable>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel={`${combo.name} 조합 지우기`} hitSlop={4} onPress={() => setConfirm(true)} style={st.icon}>
          <Icon name="trash2" size={16} color={c.muted} />
        </Pressable>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel={`${combo.name} 한 번에 담기`} onPress={onAdd} disabled={busy} style={st.icon}>
        {busy ? <ActivityIndicator /> : <Text style={{ color: c.sky, fontSize: 24 }}>+</Text>}
      </Pressable>
    </View>
  );
}

/** '이 아침을 조합으로 저장' — 누르면 이름 칸(기본 이름 미리)이 펴지고 [저장] */
export function SaveCombo({ label, items, onSave, c }: { label: string; items: ComboItem[]; onSave: (name: string) => Promise<boolean>; c: Palette }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const name = typed ?? defaultComboName(items);
  const submit = async () => {
    const clean = name.trim();
    if (!clean || pending) return;
    setPending(true);
    const ok = await onSave(clean);
    setPending(false);
    if (ok) {
      setTyped(null);
      setOpen(false);
    }
  };
  return (
    <View style={[st.saveBox, { borderColor: open ? c.sky : c.line }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={st.saveHead}>
        <Icon name="layers" size={16} color={c.sky} />
        <Text style={{ flex: 1, color: c.ink, fontSize: 15, fontWeight: '600' }}>이 {label}을 조합으로 저장</Text>
        <Text style={{ color: c.muted, fontSize: 13 }}>{items.length}가지</Text>
      </Pressable>
      {open ? (
        <Animated.View entering={fadeIn} style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
          <TextInput
            value={name}
            onChangeText={(t) => setTyped(t.slice(0, COMBO_NAME_MAX))}
            accessibilityLabel="조합 이름"
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
            style={[st.nameInput, { backgroundColor: c.page, color: c.ink }]}
          />
          <Pressable accessibilityRole="button" onPress={() => void submit()} disabled={pending || !name.trim()} style={[st.saveBtn, { backgroundColor: c.sky }, (pending || !name.trim()) && { opacity: 0.5 }]}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>{pending ? '저장 중' : '저장'}</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

type Category = 'popular' | 'all' | FoodCategory;

/**
 * [전체 음식] — 인기 · 전체 · 분류 아홉, 분류를 고르면 세부 칸(음식 수 · 빈 칸 숨김). 기본 음식 밑에 식약처 품목대표를 40줄씩 이어 받는다.
 * 웹은 목록 끝이 가까워지면 저절로 받는데, 앱은 화면 하나가 길어지지 않게 '더 보기'로 받는다.
 */
export function BrowseAll({
  popular,
  browseSubs,
  mfds,
  row,
  c,
}: {
  popular: RankedFood[];
  browseSubs: Record<string, Record<string, number>>;
  mfds: boolean;
  row: (f: Food, key: string, hideNote?: boolean) => ReactNode;
  c: Palette;
}) {
  const [category, setCategory] = useState<Category>(popular.length > 0 ? 'popular' : 'all');
  const [sub, setSub] = useState('all');
  const picked = category !== 'popular' && category !== 'all' ? category : null;
  const subs = picked
    ? subcategoriesOf(picked)
        .map((s) => ({
          ...s,
          count: (FOODS_BY_CATEGORY.get(picked) ?? []).filter((f) => subcategoryOf(picked, f.name) === s.key).length + (browseSubs[picked]?.[s.key] ?? 0),
        }))
        .filter((s) => s.count > 0)
    : [];
  const shown = category === 'popular' ? [] : category === 'all' ? FOOD_CATEGORIES : [category];
  const chip = (key: string, label: string, on: boolean, onPress: () => void, small = false, count?: number) => (
    <Pressable
      key={key}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      onPress={() => {
        if (on) return;
        void Haptics.selectionAsync();
        onPress();
      }}
      style={[
        small ? st.subChip : st.catChip,
        small
          ? { borderColor: on ? c.sky : c.line, backgroundColor: on ? c.skyTint : 'transparent' }
          : { backgroundColor: on ? c.sky : withAlpha(c.ink, 0.06) },
      ]}
    >
      <Text style={{ color: small ? (on ? c.skyStrong : c.muted) : on ? '#fff' : c.ink, fontSize: small ? 12 : 13, fontWeight: on ? '700' : '500' }}>
        {label}
        {count != null ? <Text style={{ opacity: 0.6, fontVariant: ['tabular-nums'] }}> {count.toLocaleString('ko-KR')}</Text> : null}
      </Text>
    </Pressable>
  );
  return (
    <View style={{ gap: 10 }}>
      <View accessibilityRole="tablist" style={st.wrap}>
        {chip('popular', '인기', category === 'popular', () => setCategory('popular'))}
        {chip('all', '전체', category === 'all', () => setCategory('all'))}
        {FOOD_CATEGORIES.map((x) =>
          chip(x, x, category === x, () => {
            setCategory(x);
            setSub('all');
          })
        )}
      </View>
      {picked && subs.length > 1 ? (
        <Animated.View key={picked} entering={fadeIn} accessibilityRole="tablist" style={st.wrap}>
          {chip('all', '전체', sub === 'all', () => setSub('all'), true, subs.reduce((a, s) => a + s.count, 0))}
          {subs.map((s) => chip(s.key, s.label, sub === s.key, () => setSub(s.key), true, s.count))}
        </Animated.View>
      ) : null}
      <View key={`${category}-${sub}`} style={{ gap: 6 }}>
        {category === 'popular' ? (
          popular.length === 0 ? (
            <Text style={[st.empty, { color: c.muted }]}>아직 모인 기록이 적어요. 사람들이 음식을 담기 시작하면 여기에 순위가 생겨요.</Text>
          ) : (
            <>
              <Text style={[st.section, { color: c.muted }]}>이 앱을 쓰는 사람들이 가장 많이 담은 {popular.length}가지</Text>
              {popular.map((f, i) => row(f, `p${i}`, true))}
            </>
          )
        ) : null}
        {shown.map((cat) => {
          const foods = (FOODS_BY_CATEGORY.get(cat) ?? []).filter((f) => !picked || sub === 'all' || subcategoryOf(cat, f.name) === sub);
          if (foods.length === 0) return null;
          return (
            <View key={cat} style={{ gap: 6 }}>
              {category === 'all' ? (
                <Text style={[st.section, { color: c.ink }]}>
                  {cat} <Text style={{ color: c.muted, fontWeight: '400' }}>{foods.length}</Text>
                </Text>
              ) : null}
              {foods.map((f, i) => row(f, `b${cat}${i}`, true))}
            </View>
          );
        })}
        {category !== 'popular' && mfds ? <MfdsBrowse category={category} sub={picked && sub !== 'all' ? sub : null} row={row} c={c} /> : null}
      </View>
    </View>
  );
}

/** 식약처 품목대표 — 첫 40줄은 열자마자, 다음은 '더 보기'로. 전체에서는 분류가 바뀌는 자리에 작은 제목 */
function MfdsBrowse({ category, sub, row, c }: { category: FoodCategory | 'all'; sub: string | null; row: (f: Food, key: string, hideNote?: boolean) => ReactNode; c: Palette }) {
  const [pages, setPages] = useState<BrowsePage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = (offset: number) => {
    setLoading(true);
    setError(false);
    browseMfds(category, offset, sub)
      .then((p) => setPages((prev) => (offset === 0 ? [p] : [...prev, p])))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    let alive = true;
    browseMfds(category, 0, sub)
      .then((p) => alive && setPages([p]))
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [category, sub]);
  const items = pages.flatMap((p) => p.items);
  const next = pages.at(-1)?.next ?? null;
  const total = pages[0]?.total ?? 0;
  return (
    <View style={{ gap: 6 }}>
      <Text style={[st.section, { color: c.muted }]}>
        식약처 음식{total ? ` ${total.toLocaleString('ko-KR')}가지` : ''}
      </Text>
      {items.map((it, i) => (
        <View key={`m${i}`} style={{ gap: 6 }}>
          {category === 'all' && (i === 0 || items[i - 1].category !== it.category) ? (
            <Text style={{ color: c.ink, fontSize: 13, fontWeight: '700', paddingTop: 6 }}>{it.category}</Text>
          ) : null}
          {row(it.food, `mb${i}`, true)}
        </View>
      ))}
      {loading ? <ActivityIndicator style={{ padding: 8 }} /> : null}
      {error ? (
        <Pressable accessibilityRole="button" onPress={() => load(next ?? 0)} style={st.more}>
          <Text style={{ color: c.sky, fontSize: 15, fontWeight: '600' }}>못 불러왔어요 · 다시 불러오기</Text>
        </Pressable>
      ) : !loading && next != null ? (
        <Pressable accessibilityRole="button" onPress={() => load(next)} style={[st.more, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
          <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>더 보기</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  wide: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 56, borderRadius: 14, paddingLeft: 14, paddingRight: 4, paddingVertical: 8 },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  del: { height: 36, borderRadius: 10, paddingHorizontal: 10, justifyContent: 'center' },
  saveBox: { borderRadius: 14, borderWidth: 1, borderStyle: 'dashed' },
  saveHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 14 },
  nameInput: { flex: 1, height: 44, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
  saveBtn: { height: 44, borderRadius: 22, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catChip: { minHeight: 36, borderRadius: 18, paddingHorizontal: 12, justifyContent: 'center' },
  subChip: { minHeight: 36, borderRadius: 18, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1 },
  section: { fontSize: 13, fontWeight: '600', paddingTop: 8 },
  empty: { fontSize: 15, padding: 12, textAlign: 'center', lineHeight: 21 },
  more: { minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
