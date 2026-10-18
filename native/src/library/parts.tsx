import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { LibraryExercise } from '@/lib/library-load';
import type { GuideItem } from '@/app/(app)/library/mechanics/mechanics-client';
import { act } from '~/mechanics/parts';
import type { Palette } from '~/lib/ui';

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
export function recall<T extends Exercise | Drill>(id: string): T | null {
  return (items.get(id) as T | undefined) ?? null;
}

/** 별 — 누르면 바로 바꾸고, 서버가 거절하면 되돌린다(웹 FavoriteButton 과 같은 동작 · 같은 서버 길) */
export function useStar(item: Exercise | Drill, kind: 'exercise' | 'drill') {
  const [on, setOn] = useState(item.favorite);
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
