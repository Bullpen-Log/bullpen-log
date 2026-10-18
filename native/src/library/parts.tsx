import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { router, type Href } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { LibraryExercise } from '@/lib/library-load';
import type { GuideItem } from '@/app/(app)/library/mechanics/mechanics-client';
import { act } from '~/mechanics/parts';
import type { Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Sheet } from '~/workout/sheets';

/**
 * 라이브러리 앱 화면(native/src/app/library — 운동 영상 · 투구 드릴 목록과 상세)이 같이 쓰는 조각 — 받은 목록 기억 · 줄 · 찾기 칸 · 칩 · 별.
 * 서버는 웹과 같은 목록(app-library.ts → lib/library-load.ts)이다.
 */

export const EXERCISE_LIST = 'app-library.loadAppExerciseLibrary';
export const DRILL_LIST = 'app-library.loadAppDrillLibrary';
export type Exercise = LibraryExercise;
export type Drill = GuideItem;

/*
 * 목록에서 받은 줄 — 상세 화면이 목록을 다시 받지 않고 곧바로 그린다(목록은 수백 개라 상세마다 받기엔 무겁다). 별을 바꾸면 여기도 고쳐
 * 목록으로 돌아갔을 때(목록이 새로 받기 전에도) 맞게 보인다.
 */
const items = new Map<string, Exercise | Drill>();
export function remember(list: readonly (Exercise | Drill)[]) {
  for (const x of list) items.set(x.id, x);
}
/** 로그아웃 — 앞사람의 별(즐겨찾기)이 상세 화면에 남지 않게(app/index.tsx resetAccount) */
export const resetLibraryItems = () => items.clear();
export function recall<T extends Exercise | Drill>(id: string): T | null {
  return (items.get(id) as T | undefined) ?? null;
}

/** 별 — 누르면 바로 바꾸고, 서버가 거절하면 되돌린다(웹 FavoriteButton 과 같은 동작 · 같은 서버 길) */
export function useStar(item: Exercise | Drill, kind: 'exercise' | 'drill') {
  const [on, setOn] = useState(item.favorite);
  /* 목록을 새로 받아 별 값이 바뀌면 따라간다 — 낡은 값으로 누르면 드릴은 서버가 뒤집기만 해서 뜻과 반대로 바뀌었다 */
  const [seen, setSeen] = useState(item.favorite);
  if (seen !== item.favorite) {
    setSeen(item.favorite);
    setOn(item.favorite);
  }
  const [note, setNote] = useState<string | null>(null);
  const toggle = async () => {
    const next = !on;
    void Haptics.selectionAsync();
    setOn(next);
    setNote(null);
    items.set(item.id, { ...item, favorite: next });
    const r =
      kind === 'exercise'
        ? await act<{ favorite: boolean }>('favorite.setExerciseFavorite', item.id, next)
        : await act<{ favorite: boolean }>('favorite.toggleDrillFavorite', item.id);
    if ('error' in r) {
      setOn(!next);
      items.set(item.id, { ...item, favorite: !next });
      setNote(r.error);
      return;
    }
    setOn(r.favorite);
    items.set(item.id, { ...item, favorite: r.favorite });
  };
  return { on, note, toggle };
}

/** 목록 한 줄 — 미리보기 · 이름 · 한 줄 설명 · 별 */
export function ItemRow({
  title,
  sub,
  thumbUrl,
  favorite,
  onPress,
  first,
  last,
  c,
}: {
  title: string;
  sub: string;
  thumbUrl: string | null;
  favorite: boolean;
  onPress: () => void;
  first?: boolean;
  last?: boolean;
  c: Palette;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={favorite ? `${title}, 즐겨찾기` : title}
      onPress={onPress}
      style={({ pressed }) => [
        st.row,
        { backgroundColor: pressed ? c.chip : c.card },
        first && st.first,
        last && st.last,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
      ]}
    >
      <View style={[st.thumb, { backgroundColor: c.chip }]}>
        {thumbUrl ? (
          <Image source={{ uri: thumbUrl }} resizeMode="cover" style={StyleSheet.absoluteFill} />
        ) : (
          <SymbolView name="film" size={20} tintColor={c.muted} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={2} style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>
          {title}
        </Text>
        {sub ? (
          <Text numberOfLines={1} style={{ color: c.muted, fontSize: 13 }}>
            {sub}
          </Text>
        ) : null}
      </View>
      {favorite ? <SymbolView name="star.fill" size={15} tintColor="#ff9500" /> : null}
      <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
    </Pressable>
  );
}

/** 찾기 칸 — 아이폰 찾기 칸 모양(회색 면) */
export function SearchField({ value, onChange, placeholder, c }: { value: string; onChange: (v: string) => void; placeholder: string; c: Palette }) {
  return (
    <View style={[st.search, { backgroundColor: c.chip }]}>
      <SymbolView name="magnifyingglass" size={15} tintColor={c.muted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        returnKeyType="search"
        clearButtonMode="while-editing"
        autoCorrect={false}
        style={{ flex: 1, color: c.ink, fontSize: 16, paddingVertical: 8 }}
      />
    </View>
  );
}

/** 거르기 칩 줄 — 옆으로 민다. 켠 것은 하늘색 */
export function ChipRow({ chips, c }: { chips: { key: string; label: string; on: boolean; onPress: () => void }[]; c: Palette }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
      {chips.map((x) => (
        <Pressable
          key={x.key}
          accessibilityRole="button"
          accessibilityState={{ selected: x.on }}
          onPress={() => {
            void Haptics.selectionAsync();
            x.onPress();
          }}
          style={[st.chip, { backgroundColor: x.on ? c.sky : c.chip }]}
        >
          <Text style={{ color: x.on ? '#fff' : c.ink, fontSize: 15, fontWeight: '600' }}>{x.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** 접히는 칸 머리 — 분류 · 요소 · 워밍업 루틴 */
export function FoldHead({ title, count, open, onPress, desc, c }: { title: string; count: number; open: boolean; onPress: () => void; desc?: string; c: Palette }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [st.fold, { backgroundColor: pressed ? c.chip : c.card }, open && st.foldOpen]}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ color: c.ink, fontSize: 17, fontWeight: '600' }}>{title}</Text>
        {desc ? (
          <Text numberOfLines={1} style={{ color: c.muted, fontSize: 13 }}>
            {desc}
          </Text>
        ) : null}
      </View>
      <Text style={{ color: c.muted, fontSize: 15 }}>{count}개</Text>
      <SymbolView name={open ? 'chevron.up' : 'chevron.down'} size={13} tintColor={c.muted} />
    </Pressable>
  );
}

/** 작은 꼬리표(부위 · 강도 · 장비) */
export function Tags({ items: list, c }: { items: string[]; c: Palette }) {
  if (list.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {list.map((t, i) => (
        <Text key={`${t}-${i}`} style={[st.tag, { color: c.muted, backgroundColor: c.chip }]}>
          {t}
        </Text>
      ))}
    </View>
  );
}

export const st = StyleSheet.create({
  foot: { height: 50, borderRadius: 25, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  opt: { minHeight: 40, borderRadius: 20, paddingHorizontal: 16, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, minHeight: 64 },
  first: { borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  last: { borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  thumb: { width: 56, height: 56, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, marginHorizontal: 16, minHeight: 40 },
  chip: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center' },
  fold: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 16, borderRadius: 14 },
  foldOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  tag: { fontSize: 13, fontWeight: '600', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden' },
});

/** 운동 영상 · 투구 드릴 목록 맨 위 — 웹 라이브러리 탭(app/(app)/library/tabs.tsx)의 셋째 칸 '워밍업 루틴'으로 가는 줄 */
/** 라이브러리 셋을 오가는 칸 — 웹 app/(app)/library/tabs.tsx(운동 영상 · 투구 드릴 · 워밍업 루틴, 지금 것은 옅은 바탕 · 하늘 글자). 옆 칸은 바꿔 연다(쌓지 않음) */
const LIBRARY_TABS = [
  { key: 'training', label: '운동 영상', desc: '근력·모빌리티·회복 운동', icon: 'activity' },
  { key: 'mechanics', label: '투구 드릴', desc: '투구 동작 교정 드릴', icon: 'book-open' },
  { key: 'warmup', label: '워밍업 루틴', desc: '본운동 전에 하는 고정 묶음', icon: 'flame' },
] as const;
export function LibraryTabs({ active, c }: { active: (typeof LIBRARY_TABS)[number]['key']; c: Palette }) {
  return (
    <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, gap: StyleSheet.hairlineWidth, backgroundColor: c.line }}>
      {LIBRARY_TABS.map((t) => {
        const on = t.key === active;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="link"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (on) return;
              void Haptics.selectionAsync();
              router.replace(`/library/${t.key}` as Href);
            }}
            style={({ pressed }) => [
              { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 18 },
              { backgroundColor: on || pressed ? c.page : c.card },
            ]}
          >
            <View style={[{ width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, on ? { borderColor: c.sky + '66', backgroundColor: c.sky + '1a' } : { borderColor: c.lineStrong }]}>
              <Icon name={t.icon} size={16} color={on ? c.sky : c.muted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: on ? c.sky : c.ink, fontSize: 15, fontWeight: '700' }}>{t.label}</Text>
              <Text style={{ color: c.muted, fontSize: 12, marginTop: 2 }}>{t.desc}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ----------------------------- 필터(웹 components/meta-filter.tsx) ----------------------------- */

export type FilterGroup = { key: string; label: string; options: readonly string[] };
export type FilterState = Record<string, string[]>;
export const filterCount = (f: FilterState) => Object.values(f).reduce((n, v) => n + v.length, 0);
/** 묶음 안은 하나라도, 묶음끼리는 모두(웹 matchesFilter) */
export const matchesFilter = (f: FilterState, fields: Record<string, string[]>) =>
  Object.entries(f).every(([key, chosen]) => chosen.length === 0 || chosen.some((x) => (fields[key] ?? []).includes(x)));

/** 칩 줄의 [필터 n] + 고른 조건 칩(누르면 그 조건만 끔) */
export function filterChips(groups: readonly FilterGroup[], f: FilterState, set: (f: FilterState) => void, openSheet: () => void) {
  const n = filterCount(f);
  return [
    { key: 'filter', label: n > 0 ? `필터 ${n}` : '필터', on: n > 0, onPress: openSheet },
    ...groups.flatMap((g) =>
      (f[g.key] ?? []).map((v) => ({ key: `${g.key}:${v}`, label: `${v} ✕`, on: true, onPress: () => set({ ...f, [g.key]: f[g.key].filter((x) => x !== v) }) }))
    ),
  ];
}

/** 조건 고르기 시트 — 묶음마다 칩, 아래 [모두 지우기][N개 보기] */
export function FilterSheet({
  open,
  onClose,
  groups,
  value,
  onChange,
  resultCount,
  c,
}: {
  open: boolean;
  onClose: () => void;
  groups: readonly FilterGroup[];
  value: FilterState;
  onChange: (f: FilterState) => void;
  resultCount: number | null;
  c: Palette;
}) {
  const n = filterCount(value);
  const toggle = (key: string, v: string) => {
    void Haptics.selectionAsync();
    const cur = value[key] ?? [];
    onChange({ ...value, [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="필터"
      c={c}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            disabled={n === 0}
            onPress={() => onChange(Object.fromEntries(groups.map((g) => [g.key, []])))}
            style={[st.foot, { backgroundColor: c.chip }, n === 0 && { opacity: 0.4 }]}
          >
            <Text style={{ color: c.ink, fontSize: 17, fontWeight: '600' }}>모두 지우기</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onClose} style={[st.foot, { flex: 1, backgroundColor: c.sky }]}>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>{resultCount != null ? `${resultCount}개 보기` : '완료'}</Text>
          </Pressable>
        </View>
      }
    >
      {groups.map((g) => (
        <View key={g.key} style={{ gap: 10, marginBottom: 20 }}>
          <Text style={{ color: c.ink, fontSize: 15, fontWeight: '700' }}>{g.label}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {g.options.map((v) => {
              const on = (value[g.key] ?? []).includes(v);
              return (
                <Pressable
                  key={v}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => toggle(g.key, v)}
                  style={[st.opt, { backgroundColor: on ? c.sky : c.chip }]}
                >
                  <Text style={{ color: on ? '#fff' : c.ink, fontSize: 15, fontWeight: '600' }}>{v}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </Sheet>
  );
}
