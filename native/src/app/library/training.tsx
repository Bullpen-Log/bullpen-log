import * as Haptics from 'expo-haptics';
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BODY_PARTS, EXERCISE_EQUIPMENT, INTENSITY_NAMES } from '@/lib/exercise-meta';
import type { WarmupFolder } from '@/app/(app)/library/training/training-client';
import { Bar, leave } from '~/community/parts';
import { useMenu } from '~/shell/menu-store';
import { EXERCISE_LIST, EmptyAction, FilterSheet, LibrarySkeleton, SearchField, remember, type Exercise } from '~/library/parts';
import { EMPTY_FILTERS, WARMUP, activeConditions, browse, categoriesOf, filterCount, nearestIndex, shortCategory, type LibraryFilters, type LibraryView, type WarmupGroup } from '~/library/browse';
import { libraryView, saveLibraryView } from '~/library/sync';
import { useFav, useFavs } from '~/training/favorites';
import { Thumb } from '~/lib/thumb';
import { usePalette, type Palette } from '~/lib/ui';
import { useScreenData } from '~/training/screen';
import { Segmented } from '~/shell/heading';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';

/**
 * 운동 영상 라이브러리(앱 화면, 2026-10-31 시안 01) — 첫 화면부터 운동 카드. 머리: 뒤로 · 라이브러리 메뉴(투구 드릴 · 워밍업 루틴 · 관리자 편집),
 * 큰 제목 → 찾기 → [전체 | 즐겨찾기] · 필터 → 분류 → 고른 조건 → 결과 수 · 정렬 → 카드(폰 두 칸 · 큰 글씨 한 칸 · 넓은 화면은 폭만큼).
 * 목록은 웹과 같은 곳(app-library.loadAppExerciseLibrary → lib/library-load.ts)에서 한 번에 받아 폰에서 거른다(~/library/browse).
 * 조건은 ~/library/sync 에 두어 상세에 다녀와도 · 다시 열어도 그대로, 별은 공용 저장소(~/training/favorites)라 상세 · 운동 진행과 같다.
 * 카드를 누르면 상세(/library/exercise/<id>)가 위에 쌓여 이 목록(보던 자리 포함)은 그대로 남는다.
 */
const FILTER_GROUPS = [
  { key: 'bodyParts', label: '목표 부위', options: BODY_PARTS },
  { key: 'intensity', label: '강도', options: INTENSITY_NAMES },
  { key: 'equipment', label: '장비', options: EXERCISE_EQUIPMENT },
] as const;
type Data = { exercises: Exercise[]; warmupFolders: WarmupFolder[]; warmupCommon?: WarmupFolder | null };

const hasVideo = (ex: Exercise) => Boolean(ex.videoPath || ex.referenceVideoId);

export default function ExerciseLibraryScreen() {
  const c = usePalette();
  const { isAdmin } = useMenu();
  const inset = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const state = useScreenData<Data>(EXERCISE_LIST, '', 'library:exercises');
  const [view, setViewState] = useState<LibraryView>(libraryView);
  const [draft, setDraft] = useState<LibraryFilters | null>(null);
  const list = useRef<FlatList<Exercise[]>>(null);
  /* 보던 카드 — 별 해제 · 숨김으로 사라지면 가장 가까운 남은 카드로 */
  const anchor = useRef<string | null>(null);
  const seen = useRef<string[]>([]);
  const favs = useFavs();

  const setView = (patch: Partial<LibraryView>) => {
    const next = { ...view, ...patch };
    saveLibraryView(next);
    setViewState(next);
    /* 조건을 바꾼 것은 새 목록 — 맨 위부터(돌아온 자리 맞추기와 섞지 않게) */
    anchor.current = null;
    list.current?.scrollToOffset({ offset: 0, animated: false });
  };

  const data = state.data;
  const exercises = useMemo(() => {
    if (!data) return [];
    remember(data.exercises);
    return data.exercises;
  }, [data]);
  const groups: WarmupGroup[] = useMemo(() => (data ? [...(data.warmupCommon ? [data.warmupCommon] : []), ...data.warmupFolders] : []), [data]);
  const fav = (ex: Exercise) => favs.fav('exercise', ex.id, ex.favorite);
  const items = browse(exercises, groups, view, fav);
  const favTotal = exercises.filter(fav).length;
  const categories = categoriesOf(exercises, groups);

  /* 열 수 — 큰 글씨면 한 칸, 폰 두 칸, 넓은 화면(아이패드)은 카드 190pt 기준 */
  const cols = fontScale >= 1.3 ? 1 : Math.min(6, Math.max(2, Math.floor((Math.min(width, 1120) - 24) / 190)));
  const rows = useMemo(() => {
    const out: Exercise[][] = [];
    for (let i = 0; i < items.length; i += cols) out.push(items.slice(i, i + cols));
    return out;
  }, [items, cols]);

  /* 목록이 바뀌었는데(별 해제 · 새로 받음 · 열 수) 보던 카드가 없거나 자리가 옮겨졌으면 가까운 곳으로 — 차례가 바뀔 때만(열 수|id 들) */
  const idsKey = `${cols}|${items.map((ex) => ex.id).join(',')}`;
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
  const [onViewable] = useState(() => ({ viewableItems }: { viewableItems: { item: Exercise[] | null; isViewable: boolean }[] }) => {
    const first = viewableItems.find((v) => v.isViewable)?.item?.[0];
    if (first) anchor.current = first.id;
  });

  const openMenu = () => {
    const options = ['투구 드릴', '워밍업 루틴', ...(isAdmin ? ['운동 편집(웹)'] : []), '취소'];
    ActionSheetIOS.showActionSheetWithOptions({ title: '라이브러리', options, cancelButtonIndex: options.length - 1 }, (i) => {
      if (options[i] === '투구 드릴') router.replace('/library/mechanics' as Href);
      else if (options[i] === '워밍업 루틴') router.replace('/library/warmup' as Href);
      else if (options[i] === '운동 편집(웹)') leave('/library/training?web=1');
    });
  };
  const openSort = () => {
    const options = ['등록순', '이름순', '취소'];
    ActionSheetIOS.showActionSheetWithOptions({ title: '정렬', options, cancelButtonIndex: 2 }, (i) => {
      if (i === 0 && view.sort !== 'recent') setView({ sort: 'recent' });
      if (i === 1 && view.sort !== 'name') setView({ sort: 'name' });
    });
  };
  const toggleFilter = (key: keyof LibraryFilters, v: string) => setView({ filters: { ...view.filters, [key]: view.filters[key].filter((x) => x !== v) } });
  const draftCount = draft ? browse(exercises, groups, { ...view, filters: draft }, fav).length : null;

  const cond = activeConditions(view);
  const nFilters = filterCount(view.filters);
  const folderName = groups.find((g) => g.kind === view.folder)?.name;
  const heading =
    view.scope === 'fav' ? '즐겨찾기' : cond.query || nFilters > 0 ? '검색 결과' : view.category ? (folderName ? `워밍업 · ${folderName}` : shortCategory(view.category)) : '전체 운동';
  const header = (
    <View style={{ gap: 12, paddingBottom: 8 }}>
      <Text accessibilityRole="header" style={[st.title, { color: c.ink }]}>
        운동 영상
      </Text>
      <View style={{ marginHorizontal: -16 }}>
        <SearchField value={view.query} onChange={(query) => setView({ query })} placeholder="이름 · 부위 · 장비로 찾기" c={c} />
      </View>
      <View style={[st.row, { gap: 8 }]}>
        <View style={{ flex: 1 }}>
          <Segmented
            label="운동 영상 범위"
            options={[
              { value: 'all', label: '전체' },
              { value: 'fav', label: data ? `즐겨찾기 ${favTotal}` : '즐겨찾기' },
            ]}
            value={view.scope}
            onChange={(scope) => setView({ scope })}
          />
        </View>
        <Press
          onPress={() => setDraft(view.filters)}
          accessibilityRole="button"
          accessibilityLabel={nFilters > 0 ? `필터 ${nFilters}개 적용됨` : '필터'}
          style={[st.filterBtn, { backgroundColor: nFilters > 0 ? c.skyTint : c.chip }]}
        >
          <Icon name="settings2" size={16} color={nFilters > 0 ? c.link : c.ink} />
          <Text style={[st.chipText, { color: nFilters > 0 ? c.link : c.ink }]}>{nFilters > 0 ? `필터 ${nFilters}` : '필터'}</Text>
        </Press>
      </View>
      <ChipLine
        chips={[{ key: '', label: '전체', on: view.category == null }, ...categories.map((n) => ({ key: n, label: shortCategory(n), on: view.category === n }))]}
        onPick={(key) => setView({ category: key || null, folder: null })}
        label="운동 분류"
        c={c}
      />
      {view.category === WARMUP && groups.length > 0 ? (
        <ChipLine
          chips={[{ key: '', label: '워밍업 전체', on: view.folder == null }, ...groups.map((g) => ({ key: g.kind, label: g.name, on: view.folder === g.kind }))]}
          onPick={(key) => setView({ folder: key || null })}
          label="워밍업 루틴"
          c={c}
        />
      ) : null}
      {nFilters > 0 ? (
        <View style={st.wrap}>
          {FILTER_GROUPS.flatMap((g) =>
            view.filters[g.key].map((v) => (
              <Press
                key={`${g.key}:${v}`}
                onPress={() => toggleFilter(g.key, v)}
                accessibilityRole="button"
                accessibilityLabel={`${v} 필터 해제`}
                style={[st.selected, { backgroundColor: c.skyTint }]}
              >
                <Text style={[st.chipText, { color: c.link }]}>{v}</Text>
                <Icon name="x" size={13} color={c.link} />
              </Press>
            ))
          )}
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
          <Text accessibilityLiveRegion="polite" style={[st.bold, { color: c.ink }]}>
            {heading} <Text style={{ color: c.muted }}>{items.length}개</Text>
          </Text>
          <Press onPress={openSort} accessibilityRole="button" accessibilityLabel={`정렬 ${view.sort === 'name' ? '이름순' : '등록순'}`} style={st.sortBtn}>
            <Text style={[st.small, { color: c.ink }]}>{view.sort === 'name' ? '이름순' : '등록순'}</Text>
            <Icon name="chevron-down" size={14} color={c.muted} />
          </Press>
        </View>
      ) : null}
    </View>
  );

  const empty = !data ? (
    state.failed ? (
      <View style={st.empty}>
        <Text style={[st.emptyTitle, { color: c.ink }]}>운동을 불러오지 못했어요</Text>
        <Text style={[st.small, { color: c.muted, textAlign: 'center' }]}>{state.failed === '불러오지 못했어요.' ? '연결을 확인한 뒤 다시 시도해 주세요.' : state.failed}</Text>
        <Press onPress={() => void state.load()} accessibilityRole="button" style={[st.action, { backgroundColor: c.action }]}>
          <Text style={[st.bold, { color: '#fff' }]}>다시 불러오기</Text>
        </Press>
      </View>
    ) : (
      <LibrarySkeleton cols={cols} label="운동을 불러오는 중" c={c} />
    )
  ) : exercises.length === 0 ? (
    <View style={st.empty}>
      <Text style={[st.emptyTitle, { color: c.ink }]}>아직 등록된 운동이 없어요</Text>
    </View>
  ) : view.scope === 'fav' && favTotal === 0 ? (
    <View style={st.empty}>
      <Text style={[st.emptyTitle, { color: c.ink }]}>담아둔 운동이 없어요</Text>
      <Text style={[st.small, { color: c.muted, textAlign: 'center' }]}>운동 카드의 별을 누르면 여기에 모여요.</Text>
      <Press onPress={() => setView({ scope: 'all' })} accessibilityRole="button" style={[st.action, { backgroundColor: c.chip }]}>
        <Text style={[st.bold, { color: c.ink }]}>전체 운동 보기</Text>
      </Press>
    </View>
  ) : (
    <View style={st.empty}>
      <Text style={[st.emptyTitle, { color: c.ink }]}>{view.scope === 'fav' ? '조건에 맞는 즐겨찾기가 없어요' : '맞는 운동이 없어요'}</Text>
      <View style={[st.wrap, { justifyContent: 'center' }]}>
        {cond.query ? <EmptyAction label="검색어만 지우기" onPress={() => setView({ query: '' })} c={c} /> : null}
        {nFilters > 0 ? <EmptyAction label="필터 해제" onPress={() => setView({ filters: EMPTY_FILTERS })} c={c} /> : null}
        {cond.category ? <EmptyAction label="전체 분류 보기" onPress={() => setView({ category: null, folder: null })} c={c} /> : null}
        {cond.fav ? <EmptyAction label="전체 운동 보기" onPress={() => setView({ scope: 'all' })} c={c} /> : null}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar
        back="뒤로"
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
        groups={FILTER_GROUPS}
        value={draft ?? EMPTY_FILTERS}
        onChange={(f) => setDraft(f as LibraryFilters)}
        onApply={() => {
          if (draft) setView({ filters: draft });
          setDraft(null);
        }}
        resultCount={draftCount}
        c={c}
      />
      <FlatList
        ref={list}
        data={data ? rows : []}
        keyExtractor={(row) => row.map((ex) => ex.id).join(',')}
        renderItem={({ item: row }) => (
          <View style={st.gridRow}>
            {Array.from({ length: cols }, (_, i) => (
              <View key={row[i]?.id ?? `pad-${i}`} style={{ flex: 1, minWidth: 0 }}>
                {row[i] ? <ExerciseCard ex={row[i]} wide={cols === 1} c={c} /> : null}
              </View>
            ))}
          </View>
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={data && items.length > 0 ? <Text style={[st.small, { color: c.muted, textAlign: 'center', paddingVertical: 16 }]}>마지막 운동이에요</Text> : undefined}
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

/** 운동 카드 — 미리보기 · 이름 · 분류와 장비 한 줄, 작은 재생 표시, 따로 누르는 별(카드를 열지 않는다) */
function ExerciseCard({ ex, wide, c }: { ex: Exercise; wide: boolean; c: Palette }) {
  const star = useFav('exercise', ex.id, ex.favorite);
  const video = hasVideo(ex);
  const meta = [shortCategory(ex.category), ...ex.equipment].join(' · ');
  return (
    <View style={[st.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Pressable
        onPress={() => router.push(`/library/exercise/${ex.id}` as Href)}
        accessibilityRole="button"
        accessibilityLabel={`${ex.title}, ${meta}${video ? '' : ', 영상 준비 중'} 상세 보기`}
        style={({ pressed }) => [pressed && { opacity: 0.7 }]}
      >
        <View style={[st.thumb, { backgroundColor: c.chip }]}>
          {ex.thumbUrl ? <Thumb uri={ex.thumbUrl} style={StyleSheet.absoluteFill} /> : <Icon name="film" size={22} color={c.muted} />}
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
          <Text numberOfLines={wide ? undefined : 3} style={[st.name, { color: c.ink }]}>
            {ex.title}
          </Text>
          {meta ? (
            <Text numberOfLines={wide ? undefined : 1} style={[st.small, { color: c.muted }]}>
              {meta}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {/* 별 — 카드 위에 따로(누르면 상세로 가지 않는다), 44pt */}
      <Press
        onPress={star.toggle}
        accessibilityRole="button"
        accessibilityLabel={star.on ? `${ex.title} 즐겨찾기 해제` : `${ex.title} 즐겨찾기에 담기`}
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

/** 옆으로 미는 칩 한 줄 — 고른 것 하나(분류 · 워밍업 루틴) */
function ChipLine({ chips, onPick, label, c }: { chips: { key: string; label: string; on: boolean }[]; onPick: (key: string) => void; label: string; c: Palette }) {
  return (
    <ScrollView horizontal accessibilityLabel={label} showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginHorizontal: -16 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
      {chips.map((x) => (
        <Press
          key={x.key || 'all'}
          onPress={() => {
            void Haptics.selectionAsync();
            onPick(x.key);
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: x.on }}
          style={[st.chip, { backgroundColor: x.on ? c.ink : c.chip }]}
        >
          <Text style={[st.chipText, { color: x.on ? c.page : c.ink }]}>{x.label}</Text>
        </Press>
      ))}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  title: { fontSize: 32, fontWeight: '700', lineHeight: 40 },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  filterBtn: { minHeight: 40, borderRadius: 20, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chip: { minHeight: 40, borderRadius: 20, paddingHorizontal: 16, justifyContent: 'center' },
  chipText: { fontSize: 15, fontWeight: '600' },
  selected: { minHeight: 36, borderRadius: 18, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  sortBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 12 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingLeft: 14, paddingVertical: 6 },
  textBtn: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  bold: { fontSize: 15, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 18 },
  tiny: { fontSize: 12, lineHeight: 16 },
  gridRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  card: { borderRadius: 18, overflow: 'hidden' },
  thumb: { width: '100%', aspectRatio: 16 / 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  play: { position: 'absolute', left: 8, bottom: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', paddingLeft: 1 },
  badge: { position: 'absolute', left: 8, bottom: 8, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  cardText: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, gap: 3 },
  name: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  star: { position: 'absolute', top: 0, right: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  menuDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  starDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.38)', alignItems: 'center', justifyContent: 'center' },
  retry: { flexDirection: 'row', flexWrap: 'wrap', minHeight: 44, alignItems: 'center', paddingHorizontal: 12 },
  empty: { alignItems: 'center', gap: 12, paddingTop: 40, paddingHorizontal: 16 },
  emptyTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  action: { minHeight: 44, borderRadius: 22, paddingHorizontal: 18, justifyContent: 'center' },
});
