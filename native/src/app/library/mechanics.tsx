import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, FlatList, Pressable, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MECHANICS_CATEGORY_NAMES } from '@/lib/categories';
import { DRILL_EQUIPMENT, DRILL_STAGES, DRILL_STAGE_NAMES, FOCUS_POINTS, FOCUS_POINT_DESC } from '@/lib/exercise-meta';
import { Bar, leave } from '~/community/parts';
import { useMenu } from '~/shell/menu-store';
import { DRILL_LIST, ELEMENT_ICON, EmptyAction, FilterSheet, LibrarySkeleton, SearchField, remember, type Drill } from '~/library/parts';
import {
  EMPTY_DRILL_FILTERS,
  EMPTY_DRILL_VIEW,
  browseDrills,
  drillFilterCount,
  entryOf,
  entryParams,
  optionsOf,
  secondaryMatch,
  shortDrillCategory,
  type DrillEntry,
  type DrillFilters,
  type DrillView,
} from '~/library/drill-browse';
import { nearestIndex } from '~/library/browse';
import { drillView, saveDrillView } from '~/library/sync';
import { useFav, useFavs } from '~/training/favorites';
import { Thumb } from '~/lib/thumb';
import { usePalette, type Palette } from '~/lib/ui';
import { useScreenData } from '~/training/screen';
import { Sheet } from '~/workout/sheets';
import { Segmented } from '~/shell/heading';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';

/**
 * 투구 드릴 라이브러리(앱 화면, 2026-10-31 드릴 시안 01) — 첫 화면부터 드릴 카드. 머리: 뒤로 · 라이브러리 메뉴(운동 영상 · 워밍업 루틴 · 관리자 편집),
 * 큰 제목 → (3D 분석에서 왔으면 그 맥락) → 찾기 → [전체 | 즐겨찾기] · 필터 → 투구 요소 · 단계 → 고른 조건 → 결과 수 · 정렬 → 카드.
 * 목록은 웹과 같은 곳(app-library.loadAppDrillLibrary → lib/library-load.ts)에서 한 번에 받아 폰에서 거른다(~/library/drill-browse).
 * 요소 · 단계 빠른 고르기와 필터 시트는 같은 조건을 쓴다(시트는 초안 → [N개 드릴 보기]). 조건은 ~/library/sync 에 두어 상세에 다녀와도 그대로 —
 * 3D 분석에서 들어온 목록은 받은 요소로 따로 시작하고 일반 목록의 조건을 바꾸지 않는다. 별은 공용 저장소(~/training/favorites).
 * 카드를 누르면 드릴 상세(/library/drill/<id>)가 위에 쌓여 이 목록(보던 자리 포함)은 그대로 남는다. 열람 · 별 · 거르기는 수행 · 진도 · 분석을 바꾸지 않는다.
 */
type Pick = 'focusPoints' | 'stage';

const hasVideo = (g: Drill) => Boolean(g.videoPath || g.referenceVideoId);

export default function DrillLibraryScreen() {
  const c = usePalette();
  const { isAdmin } = useMenu();
  const inset = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const params = useLocalSearchParams<{ from?: string; result?: string; el?: string }>();
  /* 들어온 곳은 처음 연 그대로(요소 필터를 지워도 돌아갈 곳은 남는다) */
  const [entry] = useState<DrillEntry>(() => entryOf(params, FOCUS_POINTS));
  const linked = entry.from !== 'library';
  const state = useScreenData<{ drills: Drill[] }>(DRILL_LIST, '', 'library:drills');
  const [view, setViewState] = useState<DrillView>(() =>
    linked ? { ...EMPTY_DRILL_VIEW, filters: { ...EMPTY_DRILL_FILTERS, focusPoints: entry.el ? [entry.el] : [] } } : drillView()
  );
  const [draft, setDraft] = useState<DrillFilters | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const list = useRef<FlatList<Drill[]>>(null);
  /* 보던 카드 — 별 해제 · 숨김으로 사라지면 가장 가까운 남은 카드로 */
  const anchor = useRef<string | null>(null);
  const seen = useRef<string[]>([]);
  const favs = useFavs();

  const setView = (patch: Partial<DrillView>) => {
    const next = { ...view, ...patch };
    if (!linked) saveDrillView(next);
    setViewState(next);
    /* 조건을 바꾼 것은 새 목록 — 맨 위부터(돌아온 자리 맞추기와 섞지 않게) */
    anchor.current = null;
    list.current?.scrollToOffset({ offset: 0, animated: false });
  };
  const setFilters = (patch: Partial<DrillFilters>) => setView({ filters: { ...view.filters, ...patch } });

  const data = state.data;
  const drills = useMemo(() => {
    if (!data) return [];
    remember(data.drills);
    return data.drills;
  }, [data]);
  const fav = (g: Drill) => favs.fav('drill', g.id, g.favorite);
  const items = browseDrills(drills, view, fav);
  const favTotal = drills.filter(fav).length;
  /* 고를 칸 — 정해 둔 차례대로, 실제 있는 새 값도 숨기지 않는다 */
  const filterGroups = useMemo(
    () => [
      { key: 'focusPoints', label: '투구 요소', options: FOCUS_POINTS },
      { key: 'stage', label: '드릴 단계', options: DRILL_STAGE_NAMES },
      { key: 'category', label: '종류', options: optionsOf(MECHANICS_CATEGORY_NAMES, drills.map((g) => g.category)) },
      { key: 'equipment', label: '장비', options: optionsOf(DRILL_EQUIPMENT, drills.flatMap((g) => g.equipment)) },
    ],
    [drills]
  );

  /* 열 수 — 큰 글씨면 한 칸, 폰 두 칸, 넓은 화면(아이패드)은 카드 200pt 기준 */
  const large = fontScale >= 1.3;
  const cols = large ? 1 : Math.min(5, Math.max(2, Math.floor((Math.min(width, 1120) - 24) / 200)));
  const rows = useMemo(() => {
    const out: Drill[][] = [];
    for (let i = 0; i < items.length; i += cols) out.push(items.slice(i, i + cols));
    return out;
  }, [items, cols]);

  /* 목록이 바뀌었는데(별 해제 · 새로 받음 · 열 수) 보던 카드가 없거나 자리가 옮겨졌으면 가까운 곳으로 — 차례가 바뀔 때만 */
  const idsKey = `${cols}|${items.map((g) => g.id).join(',')}`;
  useEffect(() => {
    const [n, joined] = idsKey.split('|');
    const ids = joined ? joined.split(',') : [];
    const before = seen.current;
    seen.current = ids;
    if (!anchor.current || ids.length === 0) return;
    const at = nearestIndex(ids, anchor.current, before);
    if (ids[at] !== anchor.current) anchor.current = ids[at] ?? null;
    list.current?.scrollToIndex({ index: Math.floor(at / Number(n)), animated: false, viewPosition: 0 });
  }, [idsKey]);
  /* FlatList 는 이 함수가 바뀌면 안 된다 — 처음 만든 것을 그대로 */
  const [onViewable] = useState(() => ({ viewableItems }: { viewableItems: { item: Drill[] | null; isViewable: boolean }[] }) => {
    const first = viewableItems.find((v) => v.isViewable)?.item?.[0];
    if (first) anchor.current = first.id;
  });

  const openMenu = () => {
    const options = ['운동 영상', '워밍업 루틴', ...(isAdmin ? ['드릴 편집(웹)'] : []), '취소'];
    ActionSheetIOS.showActionSheetWithOptions({ title: '라이브러리', options, cancelButtonIndex: options.length - 1 }, (i) => {
      if (options[i] === '운동 영상') router.replace('/library/training' as Href);
      else if (options[i] === '워밍업 루틴') router.replace('/library/warmup' as Href);
      else if (options[i] === '드릴 편집(웹)') leave('/library/mechanics?web=1');
    });
  };
  const openSort = () => {
    const options = ['기본순', '이름순', '취소'];
    ActionSheetIOS.showActionSheetWithOptions({ title: '정렬', options, cancelButtonIndex: 2 }, (i) => {
      if (i === 0 && view.sort !== 'default') setView({ sort: 'default' });
      if (i === 1 && view.sort !== 'name') setView({ sort: 'name' });
    });
  };
  /* 뒤가 없으면(바로 열린 주소) 들어온 분석 결과 · 첫 화면으로 */
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace((entry.result ? `/lab/${entry.result}` : '/') as Href);
  };
  const draftCount = draft ? browseDrills(drills, { ...view, filters: draft }, fav).length : null;

  const f = view.filters;
  const nFilters = drillFilterCount(f);
  const query = view.query.trim() !== '';
  const oneFocus = f.focusPoints.length === 1 ? f.focusPoints[0] : null;
  const onlyFocus = oneFocus && nFilters === 1;
  const onlyStage = f.stage.length === 1 && nFilters === 1;
  const heading =
    view.scope === 'fav' ? '즐겨찾기' : query || (nFilters > 0 && !onlyFocus && !onlyStage) ? '검색 결과' : onlyFocus ? `${oneFocus} 드릴` : onlyStage ? `${f.stage[0]} 단계 드릴` : '전체 드릴';
  /* 빠른 고르기가 보여 주는 값은 다시 칩으로 늘어놓지 않는다 — 둘 이상 고른 요소 · 단계와 종류 · 장비만 지울 수 있는 칩으로 */
  const tokens = [
    ...(f.focusPoints.length > 1 ? f.focusPoints.map((v) => ['focusPoints', v] as const) : []),
    ...(f.stage.length > 1 ? f.stage.map((v) => ['stage', v] as const) : []),
    ...f.category.map((v) => ['category', v] as const),
    ...f.equipment.map((v) => ['equipment', v] as const),
  ];
  const quick = (key: Pick, label: string) => {
    const chosen = f[key];
    const value = chosen.length === 0 ? '전체' : chosen.length === 1 ? chosen[0] : `${chosen.length}개`;
    return (
      <Press
        onPress={() => setPick(key)}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${value}, 바꾸기`}
        style={[st.quick, large && { flex: 0 }, { backgroundColor: chosen.length > 0 ? c.skyTint : c.card, boxShadow: c.float }]}
      >
        <Text style={[st.small, { color: c.muted }]}>{label}</Text>
        <Text numberOfLines={1} style={[st.bold, { color: chosen.length > 0 ? c.link : c.ink, flex: 1 }]}>
          {value}
        </Text>
        <Icon name="chevron-down" size={14} color={c.muted} />
      </Press>
    );
  };

  const header = (
    <View style={{ gap: 12, paddingBottom: 8 }}>
      <View style={st.row}>
        <Text accessibilityRole="header" style={[st.title, { color: c.ink, flex: 1 }]}>
          투구 드릴
        </Text>
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[st.mark, { backgroundColor: c.card, boxShadow: c.float }]}>
          <Icon name="activity" size={22} color={c.link} />
        </View>
      </View>
      {entry.from === 'analysis' ? (
        <View style={[st.context, { backgroundColor: c.skyTint }]}>
          <Icon name="focus" size={18} color={c.link} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[st.bold, { color: c.link }]}>3D 분석 결과에서 이동</Text>
            {entry.el ? <Text style={[st.small, { color: c.ink }]}>선택한 요소 · {entry.el}</Text> : null}
          </View>
        </View>
      ) : null}
      <View style={{ marginHorizontal: -16 }}>
        <SearchField value={view.query} onChange={(q) => setView({ query: q })} placeholder="드릴 이름·요소·장비 검색" c={c} />
      </View>
      <View style={[st.row, { gap: 8 }]}>
        <View style={{ flex: 1 }}>
          <Segmented
            label="드릴 범위"
            options={[
              { value: 'all', label: '전체' },
              { value: 'fav', label: data ? `즐겨찾기 ${favTotal}` : '즐겨찾기' },
            ]}
            value={view.scope}
            onChange={(scope) => setView({ scope })}
          />
        </View>
        <Press
          onPress={() => setDraft(f)}
          accessibilityRole="button"
          accessibilityLabel={nFilters > 0 ? `필터 ${nFilters}개 적용됨` : '필터'}
          style={[st.filterBtn, { backgroundColor: nFilters > 0 ? c.skyTint : c.chip }]}
        >
          <Icon name="settings2" size={16} color={nFilters > 0 ? c.link : c.ink} />
          <Text style={[st.bold, { color: nFilters > 0 ? c.link : c.ink }]}>{nFilters > 0 ? `필터 ${nFilters}` : '필터'}</Text>
        </Press>
      </View>
      <View style={[large ? { gap: 8 } : st.row, !large && { gap: 8 }]}>
        {quick('focusPoints', '투구 요소')}
        {quick('stage', '단계')}
      </View>
      {oneFocus ? (
        <View style={st.row}>
          <Text style={[st.small, { color: c.muted, flex: 1 }]}>{FOCUS_POINT_DESC[oneFocus as keyof typeof FOCUS_POINT_DESC] ?? oneFocus}</Text>
          <Press onPress={() => setFilters({ focusPoints: [] })} accessibilityRole="button" accessibilityLabel="투구 요소 해제" style={st.iconBtn}>
            <Icon name="x" size={16} color={c.link} />
          </Press>
        </View>
      ) : null}
      {tokens.length > 0 ? (
        <View style={st.wrap}>
          {tokens.map(([key, v]) => (
            <Press
              key={`${key}:${v}`}
              onPress={() => setFilters({ [key]: f[key].filter((x) => x !== v) })}
              accessibilityRole="button"
              accessibilityLabel={`${v} 필터 해제`}
              style={[st.token, { backgroundColor: c.skyTint }]}
            >
              <Text style={[st.bold, { color: c.link }]}>{key === 'category' ? shortDrillCategory(v) : v}</Text>
              <Icon name="x" size={13} color={c.link} />
            </Press>
          ))}
        </View>
      ) : null}
      {state.data && state.failed ? (
        <View accessibilityLiveRegion="polite" style={[st.notice, { backgroundColor: c.card, boxShadow: c.float }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[st.bold, { color: c.ink }]}>새 목록을 불러오지 못했어요</Text>
            <Text style={[st.small, { color: c.muted }]}>이전에 불러온 목록이에요.</Text>
          </View>
          <Press onPress={() => void state.load()} accessibilityRole="button" style={st.textBtn}>
            <Text style={[st.bold, { color: c.link }]}>다시 시도</Text>
          </Press>
        </View>
      ) : null}
      {data ? (
        <View style={[st.row, { justifyContent: 'space-between' }]}>
          <Text accessibilityLiveRegion="polite" style={[st.bold, { color: c.ink, flexShrink: 1 }]}>
            {heading} <Text style={{ color: c.muted }}>{items.length}개</Text>
          </Text>
          <Press onPress={openSort} accessibilityRole="button" accessibilityLabel={`정렬 ${view.sort === 'name' ? '이름순' : '기본순'}`} style={st.sortBtn}>
            <Text style={[st.small, { color: c.ink }]}>{view.sort === 'name' ? '이름순' : '기본순'}</Text>
            <Icon name="chevron-down" size={14} color={c.muted} />
          </Press>
        </View>
      ) : null}
    </View>
  );

  const empty = !data ? (
    state.failed ? (
      <View style={st.empty}>
        <Text style={[st.emptyTitle, { color: c.ink }]}>드릴을 불러오지 못했어요</Text>
        <Text style={[st.small, { color: c.muted, textAlign: 'center' }]}>{state.failed === '불러오지 못했어요.' ? '연결을 확인한 뒤 다시 시도해 주세요.' : state.failed}</Text>
        <Press onPress={() => void state.load()} accessibilityRole="button" style={[st.action, { backgroundColor: c.action }]}>
          <Text style={[st.bold, { color: '#fff' }]}>다시 불러오기</Text>
        </Press>
      </View>
    ) : (
      <LibrarySkeleton cols={cols} label="드릴 목록 불러오는 중" c={c} />
    )
  ) : drills.length === 0 ? (
    <View style={st.empty}>
      <Text style={[st.emptyTitle, { color: c.ink }]}>아직 등록된 드릴이 없어요</Text>
    </View>
  ) : view.scope === 'fav' && favTotal === 0 ? (
    <View style={st.empty}>
      <Text style={[st.emptyTitle, { color: c.ink }]}>담아둔 드릴이 없어요</Text>
      <Text style={[st.small, { color: c.muted, textAlign: 'center' }]}>드릴 카드의 별을 누르면 여기에 모여요.</Text>
      {/* 전체 드릴 보기 — 범위 · 찾기 · 필터를 모두 푼다 */}
      <EmptyAction label="전체 드릴 보기" onPress={() => setView({ scope: 'all', query: '', filters: EMPTY_DRILL_FILTERS })} c={c} />
    </View>
  ) : (
    <View style={st.empty}>
      <Text style={[st.emptyTitle, { color: c.ink }]}>{view.scope === 'fav' ? '조건에 맞는 즐겨찾기가 없어요' : '맞는 드릴이 없어요'}</Text>
      <View style={[st.wrap, { justifyContent: 'center' }]}>
        {query ? <EmptyAction label="검색어만 지우기" onPress={() => setView({ query: '' })} c={c} /> : null}
        {nFilters > 0 ? <EmptyAction label="필터 해제" onPress={() => setFilters(EMPTY_DRILL_FILTERS)} c={c} /> : null}
        {view.scope === 'fav' ? <EmptyAction label="전체 드릴 보기" onPress={() => setView({ scope: 'all' })} c={c} /> : null}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar
        back={entry.from === 'analysis' ? '분석 결과' : '뒤로'}
        onBack={goBack}
        c={c}
        right={
          <Press onPress={openMenu} hitSlop={6} accessibilityRole="button" accessibilityLabel="라이브러리 메뉴" style={st.iconBtn}>
            <View style={[st.menuDot, { backgroundColor: c.chip }]}>
              <Icon name="ellipsis" size={18} color={c.link} />
            </View>
          </Press>
        }
      />
      <FilterSheet
        open={draft != null}
        onClose={() => setDraft(null)}
        groups={filterGroups}
        value={draft ?? EMPTY_DRILL_FILTERS}
        onChange={(next) => setDraft(next as DrillFilters)}
        onApply={() => {
          if (draft) setView({ filters: draft });
          setDraft(null);
        }}
        resultCount={draftCount}
        unit="드릴"
        c={c}
      />
      <PickSheet
        pick={pick}
        chosen={pick ? f[pick] : []}
        onPick={(key, v) => {
          setFilters({ [key]: v ? [v] : [] });
          setPick(null);
        }}
        onClose={() => setPick(null)}
        c={c}
      />
      <FlatList
        ref={list}
        data={data ? rows : []}
        keyExtractor={(row) => row.map((g) => g.id).join(',')}
        renderItem={({ item: row }) => (
          <View style={st.gridRow}>
            {Array.from({ length: cols }, (_, i) => (
              <View key={row[i]?.id ?? `pad-${i}`} style={{ flex: 1, minWidth: 0 }}>
                {row[i] ? <DrillCard g={row[i]} focus={f.focusPoints} entry={entry} wide={cols === 1} c={c} /> : null}
              </View>
            ))}
          </View>
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={data && items.length > 0 ? <Text style={[st.small, { color: c.muted, textAlign: 'center', paddingVertical: 16 }]}>마지막 드릴이에요</Text> : undefined}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onScrollToIndexFailed={(e) => {
          list.current?.scrollToOffset({ offset: e.averageItemLength * e.index, animated: false });
          setTimeout(() => list.current?.scrollToIndex({ index: e.index, animated: false }), 60);
        }}
        initialNumToRender={6}
        windowSize={7}
        removeClippedSubviews
        refreshControl={data ? <RefreshControl refreshing={state.refreshing} onRefresh={() => void state.refresh()} /> : undefined}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: inset.bottom + 32, width: '100%', maxWidth: 1120, alignSelf: 'center' }}
      />
    </View>
  );
}

/**
 * 드릴 카드 — 미리보기 · 이름 · 단계와 주 요소 · 장비, 보조로 걸렸으면 '○○ 함께 사용'. 별은 따로 누른다(상세로 가지 않는다, 44pt).
 * 미리보기만 없으면 요소 그림, 재생할 영상 자체가 없으면 '영상 준비 중'(분류가 아니라 실제 경로로).
 */
function DrillCard({ g, focus, entry, wide, c }: { g: Drill; focus: readonly string[]; entry: DrillEntry; wide: boolean; c: Palette }) {
  const star = useFav('drill', g.id, g.favorite);
  const video = hasVideo(g);
  const main = g.focusPoints[0] ?? null;
  const along = secondaryMatch(g, focus);
  const label = [g.title, g.stage ?? '단계 미등록', main ? `주 요소 ${main}` : '요소 미등록', ...(along ? [`${along} 함께 사용`] : []), ...g.equipment, ...(video ? [] : ['영상 준비 중'])].join(', ');
  return (
    <View style={[st.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Pressable
        onPress={() => router.push({ pathname: '/library/drill/[id]', params: { id: g.id, ...entryParams(entry) } } as Href)}
        accessibilityRole="button"
        accessibilityLabel={`${label}, 상세 보기`}
        style={({ pressed }) => [pressed && { opacity: 0.7 }]}
      >
        <View style={[st.thumb, { backgroundColor: c.chip }]}>
          {g.thumbUrl ? (
            <Thumb uri={g.thumbUrl} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[st.thumbIcon, { backgroundColor: c.skyTint }]}>
              <Icon name={(main && ELEMENT_ICON[main]) || 'film'} size={22} color={c.link} />
            </View>
          )}
          {video ? (
            <View style={st.play}>
              <Icon name="play" size={11} color="#fff" fill="#fff" />
            </View>
          ) : (
            <View style={[st.badge, { backgroundColor: c.card }]}>
              <Text style={[st.tiny, { color: c.muted }]}>영상 준비 중</Text>
            </View>
          )}
        </View>
        <View style={st.cardText}>
          <Text numberOfLines={wide ? undefined : 2} style={[st.name, { color: c.ink }]}>
            {g.title}
          </Text>
          <View style={[st.row, { gap: 6, flexWrap: 'wrap' }]}>
            {g.stage ? (
              <Text style={[st.stage, { color: c.link, backgroundColor: c.skyTint }]}>{g.stage}</Text>
            ) : (
              <Text style={[st.tiny, { color: c.muted }]}>단계 미등록</Text>
            )}
            <Text style={[st.tiny, { color: main ? c.link : c.muted, fontWeight: main ? '700' : '400' }]}>{main ?? '요소 미등록'}</Text>
          </View>
          {g.equipment.length > 0 ? (
            <Text numberOfLines={wide ? undefined : 1} style={[st.small, { color: c.muted }]}>
              {g.equipment.join(' · ')}
            </Text>
          ) : null}
          {along ? <Text style={[st.small, { color: c.muted }]}>{along} 함께 사용</Text> : null}
        </View>
      </Pressable>
      <Press
        onPress={star.toggle}
        accessibilityRole="button"
        accessibilityLabel={star.on ? `${g.title} 즐겨찾기 해제` : `${g.title} 즐겨찾기 추가`}
        accessibilityState={{ selected: star.on, busy: star.busy }}
        style={st.star}
      >
        <View style={st.starDot}>
          <Icon name="star" size={16} color={star.on ? '#ffcc00' : '#fff'} fill={star.on ? '#ffcc00' : 'none'} />
        </View>
      </Press>
      {star.error ? (
        <Press onPress={star.retry} accessibilityRole="button" accessibilityLabel="즐겨찾기 다시 저장" style={st.retry}>
          <Text style={[st.tiny, { color: c.danger }]}>{star.lost ? '저장 확인 못 함' : '저장 못 함'} · </Text>
          <Text style={[st.tiny, { color: c.link, fontWeight: '700' }]}>다시 시도</Text>
        </Press>
      ) : null}
    </View>
  );
}

/** 투구 요소 · 단계 빠른 고르기 — 전체 또는 하나(여럿은 필터 시트). 요소는 짧은 동작 설명과 함께, 단계는 드릴 분류의 뜻과 함께 */
function PickSheet({ pick, chosen, onPick, onClose, c }: { pick: Pick | null; chosen: string[]; onPick: (key: Pick, v: string | null) => void; onClose: () => void; c: Palette }) {
  const rows =
    pick === 'stage'
      ? DRILL_STAGES.map((x) => ({ v: x.name as string, desc: x.desc as string }))
      : FOCUS_POINTS.map((v) => ({ v: v as string, desc: FOCUS_POINT_DESC[v] as string }));
  const row = (v: string | null, title: string, desc: string | null) => {
    const on = v == null ? chosen.length === 0 : chosen.includes(v);
    return (
      <Press
        key={v ?? 'all'}
        onPress={() => {
          void Haptics.selectionAsync();
          if (pick) onPick(pick, v);
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        style={[st.pickRow, { backgroundColor: on ? c.skyTint : c.card }]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[st.bold, { color: on ? c.link : c.ink }]}>{title}</Text>
          {desc ? <Text style={[st.small, { color: c.muted }]}>{desc}</Text> : null}
        </View>
        {on ? <Icon name="check" size={18} color={c.link} /> : null}
      </Press>
    );
  };
  return (
    <Sheet
      fit
      open={pick != null}
      onClose={onClose}
      title={pick === 'stage' ? '드릴 단계' : '투구 요소'}
      description={
        pick === 'stage'
          ? '드릴의 난이도 분류예요. 내 학습 단계와는 따로예요.'
          : chosen.length > 1
            ? `지금 ${chosen.length}개를 골라 두었어요. 하나를 고르면 그것만 남아요.`
            : '고른 요소가 주 요소인 드릴이 먼저 나와요.'
      }
      c={c}
    >
      <View style={{ gap: 8 }}>
        {row(null, pick === 'stage' ? '전체 단계' : '전체 요소', null)}
        {rows.map((x) => row(x.v, x.v, x.desc))}
      </View>
    </Sheet>
  );
}

const st = StyleSheet.create({
  title: { fontSize: 32, fontWeight: '700', lineHeight: 40 },
  mark: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  context: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  filterBtn: { minHeight: 44, borderRadius: 22, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  quick: { flex: 1, minHeight: 48, borderRadius: 16, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  token: { minHeight: 36, borderRadius: 18, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  sortBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 12 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingLeft: 14, paddingVertical: 6 },
  textBtn: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  bold: { fontSize: 15, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 18 },
  tiny: { fontSize: 12, lineHeight: 16 },
  gridRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  card: { borderRadius: 18, overflow: 'hidden' },
  thumb: { width: '100%', aspectRatio: 16 / 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  play: { position: 'absolute', right: 8, bottom: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', paddingLeft: 1 },
  badge: { position: 'absolute', left: 8, bottom: 8, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  cardText: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, gap: 5 },
  name: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  stage: { fontSize: 12, fontWeight: '700', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  star: { position: 'absolute', top: 0, right: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  menuDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  starDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.38)', alignItems: 'center', justifyContent: 'center' },
  retry: { flexDirection: 'row', flexWrap: 'wrap', minHeight: 44, alignItems: 'center', paddingHorizontal: 12 },
  empty: { alignItems: 'center', gap: 12, paddingTop: 40, paddingHorizontal: 16 },
  emptyTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  action: { minHeight: 44, borderRadius: 22, paddingHorizontal: 18, justifyContent: 'center' },
  pickRow: { minHeight: 52, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
});
