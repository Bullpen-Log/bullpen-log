import { type Href, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LATER_CATEGORY } from '@/lib/categories';
import { DRILL_STAGE_NAMES, FOCUS_POINTS } from '@/lib/exercise-meta';
import { matchesSearch } from '@/lib/korean';
import { Bar } from '~/community/parts';
import { ChipRow, DRILL_LIST, FoldHead, ItemRow, SearchField, recall, remember, type Drill, WarmupLink } from '~/library/parts';
import { usePalette } from '~/lib/ui';
import { useScreenData } from '~/training/screen';
import { READABLE } from '~/lib/layout';

/**
 * 투구 드릴 라이브러리(앱 화면) — 웹 /library/mechanics(mechanics-client.tsx)를 옮겼다. 사이트의 그 주소가 앱(BullpenNative/7 부터)이면 이 화면을
 * 띄우고(page.tsx → OpenNative), 목록은 웹과 같은 곳(app-library.loadAppDrillLibrary → lib/library-load.ts)이다.
 *
 * 웹과 같은 칸: 투구 차례의 여섯 요소(주 요소 기준) → 근력 · 안정 → 요소 미정 → 나중에 촬영. 요소 칩을 고르면 보조로 걸린 드릴까지 나오고
 * 주 요소인 것 · 기초 단계가 앞에 선다(웹 matched 와 같은 차례). 관리자의 등록 · 수정은 웹에서 한다.
 * ponytail: 거르기는 즐겨찾기 · 요소만 — 웹의 단계 · 종류 · 장비 거르기는 뺐다. 찾는 사람이 생기면 칩 줄에 더한다.
 */
const STRENGTH_CATEGORY = '근력 · 안정 드릴';
const NO_FOCUS = '요소 미정';
const SECTIONS = [...FOCUS_POINTS, STRENGTH_CATEGORY, NO_FOCUS, LATER_CATEGORY];
const sectionOf = (g: Drill) =>
  g.category === LATER_CATEGORY || g.category === STRENGTH_CATEGORY ? g.category : (g.focusPoints[0] ?? NO_FOCUS);
const stageRank = (g: Drill) => (g.stage ? DRILL_STAGE_NAMES.indexOf(g.stage as (typeof DRILL_STAGE_NAMES)[number]) : 3);
const subOf = (g: Drill) => [g.focusPoints.join(' · '), g.stage].filter(Boolean).join(' · ');

export default function DrillLibraryScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const state = useScreenData<{ drills: Drill[] }>(DRILL_LIST, '', 'library:drills');
  const [query, setQuery] = useState('');
  const [onlyFav, setOnlyFav] = useState(false);
  const [points, setPoints] = useState<string[]>([]);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const data = state.data;
  const drills = useMemo(() => {
    if (!data) return [];
    remember(data.drills);
    return data.drills.map((g) => recall<Drill>(g.id) ?? g);
  }, [data]);
  const favCount = drills.filter((g) => g.favorite).length;
  const filtering = query.trim() !== '' || onlyFav || points.length > 0;
  const matched = useMemo(() => {
    const hits = drills.filter(
      (g) =>
        (!onlyFav || g.favorite) &&
        (points.length === 0 || points.some((p) => g.focusPoints.includes(p))) &&
        (matchesSearch(g.title, query) || matchesSearch(g.category, query))
    );
    /* 고른 요소가 주 요소인 드릴 먼저, 같으면 기초 → 연결 → 통합(웹과 같다) */
    const rank = (g: Drill) => (points.length > 0 && !points.includes(g.focusPoints[0]) ? 10 : 0) + stageRank(g);
    return hits.sort((a, b) => rank(a) - rank(b) || a.sortOrder - b.sortOrder);
  }, [drills, onlyFav, points, query]);
  const bySection = useMemo(() => {
    const m = new Map<string, Drill[]>();
    for (const g of drills) m.set(sectionOf(g), [...(m.get(sectionOf(g)) ?? []), g]);
    for (const list of m.values()) list.sort((a, b) => stageRank(a) - stageRank(b) || a.sortOrder - b.sortOrder);
    return m;
  }, [drills]);

  const openItem = (id: string) => router.push(`/library/drill/${id}` as Href);
  const flip = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const chips = [
    ...(favCount > 0 ? [{ key: 'fav', label: `★ 즐겨찾기 ${favCount}`, on: onlyFav, onPress: () => setOnlyFav((v) => !v) }] : []),
    ...FOCUS_POINTS.map((p) => ({
      key: p,
      label: p,
      on: points.includes(p),
      onPress: () => setPoints((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])),
    })),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title="투구 드릴" c={c} />
      <View style={{ gap: 10, paddingTop: 4, paddingBottom: 10 }}>
        <SearchField value={query} onChange={setQuery} placeholder="드릴 이름으로 찾기" c={c} />
        <ChipRow chips={chips} c={c} />
      </View>
      {!data ? (
        state.failed ? (
          <View style={{ padding: 24, gap: 16, alignItems: 'center' }}>
            <Text style={{ color: c.ink, fontSize: 15 }}>{state.failed}</Text>
            <Pressable accessibilityRole="button" onPress={() => void state.load()} hitSlop={8}>
              <Text style={{ color: c.sky, fontSize: 15, fontWeight: '700' }}>다시 불러오기</Text>
            </Pressable>
          </View>
        ) : (
          <ActivityIndicator style={{ marginTop: 40 }} />
        )
      ) : filtering ? (
        <FlatList
          data={matched}
          keyExtractor={(g) => g.id}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[{ paddingHorizontal: 16, paddingBottom: inset.bottom + 32 }, READABLE]}
          ListHeaderComponent={<Text style={{ color: c.muted, fontSize: 13, paddingBottom: 8 }}>{matched.length}개</Text>}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', gap: 12, paddingTop: 32 }}>
              <Text style={{ color: c.muted, fontSize: 15 }}>조건에 맞는 드릴이 없어요</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setQuery('');
                  setOnlyFav(false);
                  setPoints([]);
                }}
                hitSlop={8}
              >
                <Text style={{ color: c.sky, fontSize: 15, fontWeight: '700' }}>조건 모두 지우기</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item, index }) => (
            <ItemRow
              title={item.title}
              sub={subOf(item)}
              thumbUrl={item.thumbUrl}
              favorite={item.favorite}
              onPress={() => openItem(item.id)}
              first={index === 0}
              last={index === matched.length - 1}
              c={c}
            />
          )}
        />
      ) : (
        <ScrollView
          keyboardDismissMode="on-drag"
          contentContainerStyle={[{ paddingHorizontal: 16, gap: 10, paddingBottom: inset.bottom + 32 }, READABLE]}
          refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={() => void state.refresh()} />}
        >
          <WarmupLink c={c} />
          {SECTIONS.map((name) => {
            const list = bySection.get(name) ?? [];
            if (list.length === 0) return null;
            return (
              <View key={name}>
                <FoldHead title={name} count={list.length} open={open.has(name)} onPress={() => flip(name)} c={c} />
                {open.has(name)
                  ? list.map((g, i) => (
                      <ItemRow
                        key={g.id}
                        title={g.title}
                        sub={subOf(g)}
                        thumbUrl={g.thumbUrl}
                        favorite={g.favorite}
                        onPress={() => openItem(g.id)}
                        last={i === list.length - 1}
                        c={c}
                      />
                    ))
                  : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
