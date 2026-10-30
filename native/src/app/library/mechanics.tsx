import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LATER_CATEGORY, MECHANICS_CATEGORY_NAMES } from '@/lib/categories';
import { DRILL_EQUIPMENT, DRILL_STAGE_NAMES, FOCUS_POINTS } from '@/lib/exercise-meta';
import { matchesSearch } from '@/lib/korean';
import { Bar, BarButton, leave } from '~/community/parts';
import { useMenu } from '~/shell/menu-store';
import { useFavs } from '~/training/favorites';
import { ChipRow, DRILL_LIST, FilterSheet, filterChips, filterCount, matchesFilter, FoldHead, GridRow, LibraryGrid, SearchField, gridRows, remember, st, type Drill, LibraryTabs } from '~/library/parts';
import { DrillDetail } from '~/library/detail';
import { usePalette } from '~/lib/ui';
import { useScreenData } from '~/training/screen';
import { READABLE } from '~/lib/layout';
import { Press } from '~/shell/press';

/**
 * 투구 드릴 라이브러리(앱 화면) — 웹 /library/mechanics(mechanics-client.tsx)를 옮겼다. 사이트의 그 주소가 앱(BullpenNative/7 부터)이면 이 화면을
 * 띄우고(page.tsx → OpenNative), 목록은 웹과 같은 곳(app-library.loadAppDrillLibrary → lib/library-load.ts)이다.
 *
 * 웹과 같은 칸: 투구 차례의 여섯 요소(주 요소 기준) → 근력 · 안정 → 요소 미정 → 나중에 촬영. 요소 칩을 고르면 보조로 걸린 드릴까지 나오고
 * 주 요소인 것 · 기초 단계가 앞에 선다(웹 matched 와 같은 차례). 목록은 웹처럼 두 칸 카드 격자, 누른 카드만 그 자리에서 펼친다(~/library/detail
 * DrillDetail, 2026-10-20 김민: "웹과 똑같이"). 칸 머리에 요소 그림. 관리자의 등록 · 수정은 웹에서 한다.
 * 거르기는 웹 MetaFilter 와 같다 — [★ 즐겨찾기] 옆 [필터] 시트에서 요소 · 단계 · 종류 · 장비.
 */
const FILTER_GROUPS = [
  { key: 'focusPoints', label: '요소', options: FOCUS_POINTS },
  { key: 'stage', label: '단계', options: DRILL_STAGE_NAMES },
  { key: 'category', label: '종류', options: MECHANICS_CATEGORY_NAMES.filter((x) => x !== LATER_CATEGORY) },
  { key: 'equipment', label: '장비', options: DRILL_EQUIPMENT },
];
const EMPTY_FILTER: Record<string, string[]> = { focusPoints: [], stage: [], category: [], equipment: [] };
const STRENGTH_CATEGORY = '근력 · 안정 드릴';
const NO_FOCUS = '요소 미정';
const SECTIONS = [...FOCUS_POINTS, STRENGTH_CATEGORY, NO_FOCUS, LATER_CATEGORY];
const sectionOf = (g: Drill) =>
  g.category === LATER_CATEGORY || g.category === STRENGTH_CATEGORY ? g.category : (g.focusPoints[0] ?? NO_FOCUS);
const stageRank = (g: Drill) => (g.stage ? DRILL_STAGE_NAMES.indexOf(g.stage as (typeof DRILL_STAGE_NAMES)[number]) : 3);

export default function DrillLibraryScreen() {
  const c = usePalette();
  const { isAdmin } = useMenu();
  const inset = useSafeAreaInsets();
  const state = useScreenData<{ drills: Drill[] }>(DRILL_LIST, '', 'library:drills');
  const [query, setQuery] = useState('');
  const [onlyFav, setOnlyFav] = useState(false);
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [sheet, setSheet] = useState(false);
  const points = filter.focusPoints;
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  /* 찾는 동안 펼친 카드 하나(칸 안은 칸마다 따로 — LibraryGrid) */
  const [openId, setOpenId] = useState<string | null>(null);

  const data = state.data;
  /* 별은 공용 저장소의 값 — 상세 · 다른 화면에서 바꾼 것이 바로 보이고, 늦게 온 옛 목록이 덮지 않는다(~/training/favorites) */
  const favs = useFavs();
  const listed = useMemo(() => {
    if (!data) return [];
    remember(data.drills);
    return data.drills;
  }, [data]);
  const drills = listed.map((g) => ({ ...g, favorite: favs.fav('drill', g.id, g.favorite) }));
  const favCount = drills.filter((g) => g.favorite).length;
  const filtering = query.trim() !== '' || onlyFav || filterCount(filter) > 0;
  const matched = useMemo(() => {
    const hits = drills.filter(
      (g) =>
        (!onlyFav || g.favorite) &&
        matchesFilter(filter, { focusPoints: g.focusPoints, stage: g.stage ? [g.stage] : [], category: [g.category], equipment: g.equipment }) &&
        (matchesSearch(g.title, query) || matchesSearch(g.category, query))
    );
    /* 고른 요소가 주 요소인 드릴 먼저, 같으면 기초 → 연결 → 통합(웹과 같다) */
    const rank = (g: Drill) => (points.length > 0 && !points.includes(g.focusPoints[0]) ? 10 : 0) + stageRank(g);
    return hits.sort((a, b) => rank(a) - rank(b) || a.sortOrder - b.sortOrder);
  }, [drills, onlyFav, filter, points, query]);
  const bySection = useMemo(() => {
    const m = new Map<string, Drill[]>();
    for (const g of drills) m.set(sectionOf(g), [...(m.get(sectionOf(g)) ?? []), g]);
    for (const list of m.values()) list.sort((a, b) => stageRank(a) - stageRank(b) || a.sortOrder - b.sortOrder);
    return m;
  }, [drills]);

  const flip = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const chips = [
    ...(favCount > 0 ? [{ key: 'fav', label: `★ 즐겨찾기 ${favCount}`, on: onlyFav, onPress: () => setOnlyFav((v) => !v) }] : []),
    ...filterChips(FILTER_GROUPS, filter, setFilter, () => setSheet(true)),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title="투구 드릴" right={isAdmin ? <BarButton label="편집" onPress={() => leave('/library/mechanics?web=1')} c={c} /> : undefined} c={c} />
      <View style={{ gap: 10, paddingTop: 4, paddingBottom: 10 }}>
        <SearchField value={query} onChange={setQuery} placeholder="드릴 이름으로 찾기" c={c} />
        <ChipRow chips={chips} c={c} />
      </View>
      <FilterSheet open={sheet} onClose={() => setSheet(false)} groups={FILTER_GROUPS} value={filter} onChange={setFilter} resultCount={filtering ? matched.length : null} c={c} />
      {!data ? (
        state.failed ? (
          <View style={{ padding: 24, gap: 16, alignItems: 'center' }}>
            <Text style={{ color: c.ink, fontSize: 15 }}>{state.failed}</Text>
            <Press accessibilityRole="button" onPress={() => void state.load()} hitSlop={8}>
              <Text style={{ color: c.link, fontSize: 15, fontWeight: '600' }}>다시 불러오기</Text>
            </Press>
          </View>
        ) : (
          <ActivityIndicator style={{ marginTop: 40 }} />
        )
      ) : filtering ? (
        <FlatList
          data={gridRows(matched, openId)}
          keyExtractor={(row) => row.key}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[{ paddingHorizontal: 10, paddingBottom: inset.bottom + 32 }, READABLE]}
          ListHeaderComponent={<Text style={{ color: c.muted, fontSize: 13, paddingBottom: 2, paddingHorizontal: 6 }}>{matched.length}개</Text>}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', gap: 12, paddingTop: 32 }}>
              <Text style={{ color: c.muted, fontSize: 15 }}>조건에 맞는 드릴이 없어요</Text>
              <Press
                accessibilityRole="button"
                onPress={() => {
                  setQuery('');
                  setOnlyFav(false);
                  setFilter(EMPTY_FILTER);
                }}
                hitSlop={8}
              >
                <Text style={{ color: c.link, fontSize: 15, fontWeight: '600' }}>조건 모두 지우기</Text>
              </Press>
            </View>
          }
          /* 웹 GuideGrid — 두 칸 카드, 누른 것만 그 자리에서 넓게 */
          renderItem={({ item: row }) => <GridRow row={row} onOpen={setOpenId} detail={(g) => <DrillDetail item={g} onClose={() => setOpenId(null)} c={c} />} c={c} />}
        />
      ) : (
        <ScrollView
          keyboardDismissMode="on-drag"
          contentContainerStyle={[{ paddingHorizontal: 16, gap: 10, paddingBottom: inset.bottom + 32 }, READABLE]}
          refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={() => void state.refresh()} />}
        >
          <LibraryTabs active="mechanics" c={c} />
          {SECTIONS.map((name) => {
            const list = bySection.get(name) ?? [];
            if (list.length === 0) return null;
            return (
              <View key={name}>
                <FoldHead icon title={name} count={list.length} open={open.has(name)} onPress={() => flip(name)} c={c} />
                {open.has(name) ? (
                  <View style={[st.foldBody, { backgroundColor: c.card, borderTopColor: c.line }]}>
                    <LibraryGrid items={list} detail={(g, close) => <DrillDetail item={g} onClose={close} c={c} />} c={c} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
