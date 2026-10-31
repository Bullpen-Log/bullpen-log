import * as Haptics from 'expo-haptics';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Thumb } from '~/lib/thumb';
import type { LibraryExercise } from '@/lib/library-load';
import type { GuideItem } from '@/app/(app)/library/mechanics/mechanics-client';
import type { Palette } from '~/lib/ui';
import { Icon, type IconName } from '~/shell/icon';
import { Sheet } from '~/workout/sheets';
import { Press } from '~/shell/press';

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
          <Thumb uri={thumbUrl} style={StyleSheet.absoluteFill} />
        ) : (
          <Icon name="film" size={20} color={c.muted} />
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
      {favorite ? <Icon name="star" size={17} color="#ff9500" filled /> : null}
      <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
    </Pressable>
  );
}

/** 투구 요소 → 그림(웹 components/category-badge.tsx 와 같은 짝) — 드릴 카드에 미리보기가 없을 때 · 상세의 연습하는 움직임 */
export const ELEMENT_ICON: Record<string, IconName> = {
  드리프트: 'arrow-right',
  드롭: 'arrow-down-right',
  '상하체 분리': 'arrow-left-right',
  브레이크: 'footprints',
  '몸통 회전': 'rotate-cw',
  스로잉: 'target',
};

/** 찾기 칸 — 아이폰 찾기 칸 모양(회색 면) */
export function SearchField({ value, onChange, placeholder, c }: { value: string; onChange: (v: string) => void; placeholder: string; c: Palette }) {
  return (
    <View style={[st.search, { backgroundColor: c.chip }]}>
      <Icon name="search" size={17} color={c.muted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        returnKeyType="search"
        clearButtonMode="while-editing"
        autoCorrect={false}
        style={{ flex: 1, color: c.ink, fontSize: 17, paddingVertical: 8 }}
      />
    </View>
  );
}

/** 거르기 칩 줄 — 옆으로 민다. 켠 것은 하늘색 */
export function ChipRow({ chips, c }: { chips: { key: string; label: string; on: boolean; onPress: () => void }[]; c: Palette }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
      {chips.map((x) => (
        <Press
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
        </Press>
      ))}
    </ScrollView>
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

const st = StyleSheet.create({
  action: { minHeight: 44, borderRadius: 22, paddingHorizontal: 18, justifyContent: 'center' },
  skel: { flex: 1, borderRadius: 18, overflow: 'hidden' },
  foot: { height: 50, borderRadius: 25, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  opt: { minHeight: 40, borderRadius: 20, paddingHorizontal: 16, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, minHeight: 64 },
  first: { borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  last: { borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  thumb: { width: 56, height: 56, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, marginHorizontal: 16, minHeight: 40 },
  chip: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center' },
  tag: { fontSize: 13, fontWeight: '600', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden' },
});

/* ----------------------------- 필터(웹 components/meta-filter.tsx) ----------------------------- */

export type FilterGroup = { key: string; label: string; options: readonly string[] };
export type FilterState = Record<string, string[]>;
const filterCount = (f: FilterState) => Object.values(f).reduce((n, v) => n + v.length, 0);
/** 조건 고르기 시트 — 묶음마다 칩, 아래 [모두 지우기][N개 보기] */
export function FilterSheet({
  open,
  onClose,
  groups,
  value,
  onChange,
  onApply,
  resultCount,
  unit = '운동',
  c,
}: {
  open: boolean;
  onClose: () => void;
  groups: readonly FilterGroup[];
  value: FilterState;
  onChange: (f: FilterState) => void;
  /** 운동 영상 · 투구 드릴 목록(2026-10-31) — 시트 안 고르기는 초안이고 [N개 … 보기]에서만 반영, 닫으면 초안을 버린다. 안 주면 바로 반영(내 영상) */
  onApply?: () => void;
  resultCount: number | null;
  /** [N개 운동 보기] · [N개 드릴 보기] */
  unit?: string;
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
          <Press
            accessibilityRole="button"
            disabled={n === 0}
            onPress={() => onChange(Object.fromEntries(groups.map((g) => [g.key, []])))}
            style={[st.foot, { backgroundColor: c.chip }, n === 0 && { opacity: 0.4 }]}
          >
            <Text style={{ color: c.ink, fontSize: 17, fontWeight: '600' }}>모두 지우기</Text>
          </Press>
          <Press accessibilityRole="button" onPress={onApply ?? onClose} style={[st.foot, { flex: 1, backgroundColor: c.action }]}>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>
              {onApply ? `${resultCount ?? 0}개 ${unit} 보기` : resultCount != null ? `${resultCount}개 보기` : '완료'}
            </Text>
          </Press>
        </View>
      }
    >
      {groups.map((g) => (
        <View key={g.key} style={{ gap: 10, marginBottom: 20 }}>
          <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>{g.label}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {g.options.map((v) => {
              const on = (value[g.key] ?? []).includes(v);
              return (
                <Press
                  key={v}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => toggle(g.key, v)}
                  style={[st.opt, { backgroundColor: on ? c.sky : c.chip }]}
                >
                  <Text style={{ color: on ? '#fff' : c.ink, fontSize: 15, fontWeight: '600' }}>{v}</Text>
                </Press>
              );
            })}
          </View>
        </View>
      ))}
    </Sheet>
  );
}

/** 결과 없음 · 빈 칸의 단추(검색어만 지우기 · 필터 해제 …) */
export function EmptyAction({ label, onPress, c }: { label: string; onPress: () => void; c: Palette }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" style={[st.action, { backgroundColor: c.chip }]}>
      <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>{label}</Text>
    </Press>
  );
}

/** 처음 받는 동안 — 카드 모양 자리(수는 아직 모른다고 보고 적지 않는다). 움직이지 않는 판이라 동작 줄이기와 상관없다 */
export function LibrarySkeleton({ cols, label, c }: { cols: number; label: string; c: Palette }) {
  return (
    <View accessibilityLabel={label} style={{ gap: 12 }}>
      {Array.from({ length: 3 }, (_, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 12 }}>
          {Array.from({ length: cols }, (_, i) => (
            <View key={i} style={[st.skel, { backgroundColor: c.card }]}>
              <View style={{ width: '100%', aspectRatio: 16 / 10, backgroundColor: c.chip }} />
              <View style={{ padding: 12, gap: 6 }}>
                <View style={{ height: 14, width: '80%', borderRadius: 7, backgroundColor: c.chip }} />
                <View style={{ height: 12, width: '50%', borderRadius: 6, backgroundColor: c.chip }} />
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
