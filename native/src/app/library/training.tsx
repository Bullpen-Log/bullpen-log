import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TRAINING_CATEGORIES } from '@/lib/categories';
import { BODY_PARTS, EXERCISE_EQUIPMENT, INTENSITY_NAMES } from '@/lib/exercise-meta';
import { matchesSearch } from '@/lib/korean';
import type { WarmupFolder } from '@/app/(app)/library/training/training-client';
import { Bar, BarButton, leave } from '~/community/parts';
import { useMenu } from '~/shell/menu-store';
import { ChipRow, EXERCISE_LIST, FilterSheet, filterChips, filterCount, matchesFilter, FoldHead, GridRow, LibraryGrid, SearchField, gridRows, recall, remember, st, type Exercise, LibraryTabs } from '~/library/parts';
import { ExerciseDetail } from '~/library/detail';
import { usePalette } from '~/lib/ui';
import { useScreenData } from '~/training/screen';
import { READABLE } from '~/lib/layout';
import { Press } from '~/shell/press';

/**
 * 운동 영상 라이브러리(앱 화면) — 웹 /library/training(training-client.tsx)을 옮겼다. 사이트의 그 주소가 앱(BullpenNative/7 부터)이면 이 화면을
 * 띄우고(page.tsx → OpenNative), 목록은 웹과 같은 곳(app-library.loadAppExerciseLibrary → lib/library-load.ts)이다.
 *
 * 웹과 같은 차례: 이름 찾기 → [즐겨찾기 · 부위] 거르기 → 거르는 동안은 맞는 운동만, 아니면 분류마다 접힌 칸(그림 머리, 워밍업은 루틴 폴더).
 * 목록은 웹처럼 두 칸 카드 격자(16:9 미리보기 · 이름 · 별), 누른 카드만 그 자리에서 넓게 펼친다(영상 · 설명 · [즐겨찾기에 담기] · 내 기록 —
 * ~/library/detail ExerciseDetail, 2026-10-20 김민: "웹과 똑같이"). 관리자의 등록 · 수정 · 숨기기는 웹에서 한다.
 * 거르기는 웹 MetaFilter 와 같다 — [★ 즐겨찾기] 옆 [필터]를 누르면 시트에서 목표 부위 · 강도 · 장비(묶음 안은 하나라도, 묶음끼리는 모두).
 */
const FILTER_GROUPS = [
  { key: 'bodyParts', label: '목표 부위', options: BODY_PARTS },
  { key: 'intensity', label: '강도', options: INTENSITY_NAMES },
  { key: 'equipment', label: '장비', options: EXERCISE_EQUIPMENT },
] as const;
const EMPTY_FILTER: Record<string, string[]> = { bodyParts: [], intensity: [], equipment: [] };
type Data = { exercises: Exercise[]; warmupFolders: WarmupFolder[] };

export default function ExerciseLibraryScreen() {
  const c = usePalette();
  const { isAdmin } = useMenu();
  const inset = useSafeAreaInsets();
  const state = useScreenData<Data>(EXERCISE_LIST, '', 'library:exercises');
  const [query, setQuery] = useState('');
  const [onlyFav, setOnlyFav] = useState(false);
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [sheet, setSheet] = useState(false);
  const chosen = filterCount(filter);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  /* 찾는 동안 펼친 카드 하나(분류 칸 안은 칸마다 따로 — LibraryGrid) */
  const [openId, setOpenId] = useState<string | null>(null);

  const data = state.data;
  /* 상세에서 별을 바꾸고 돌아오면 목록이 새로 받기 전에도 맞게 — 받아 둔 줄(remember)이 더 새 것이다 */
  const exercises = useMemo(() => {
    if (!data) return [];
    remember(data.exercises);
    return data.exercises.map((ex) => recall<Exercise>(ex.id) ?? ex);
  }, [data]);
  const favCount = exercises.filter((ex) => ex.favorite).length;
  const filtering = query.trim() !== '' || onlyFav || chosen > 0;
  const matched = useMemo(
    () =>
      exercises.filter(
        (ex) =>
          (!onlyFav || ex.favorite) &&
          matchesFilter(filter, { bodyParts: ex.bodyParts, intensity: [ex.intensity], equipment: ex.equipment }) &&
          (matchesSearch(ex.title, query) || matchesSearch(ex.category, query))
      ),
    [exercises, onlyFav, filter, query]
  );
  const byCategory = useMemo(() => {
    const m = new Map<string, Exercise[]>();
    for (const ex of exercises) m.set(ex.category, [...(m.get(ex.category) ?? []), ex]);
    return m;
  }, [exercises]);

  const flip = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  /* 칸 안의 카드 격자 — 누르면 그 자리에서 펼침 */
  const grid = (list: Exercise[]) => <LibraryGrid items={list} detail={(ex, close) => <ExerciseDetail item={ex} onClose={close} c={c} />} c={c} />;
  const body = (children: ReactNode) => <View style={[st.foldBody, { backgroundColor: c.card, borderTopColor: c.line }]}>{children}</View>;

  const chips = [
    ...(favCount > 0 ? [{ key: 'fav', label: `★ 즐겨찾기 ${favCount}`, on: onlyFav, onPress: () => setOnlyFav((v) => !v) }] : []),
    /* [필터 n] + 고른 조건 칩(누르면 그 조건만 끔, 웹 MetaFilter) */
    ...filterChips(FILTER_GROUPS, filter, (f) => setFilter(f as typeof filter), () => setSheet(true)),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title="운동 영상" right={isAdmin ? <BarButton label="편집" onPress={() => leave('/library/training?web=1')} c={c} /> : undefined} c={c} />
      <View style={{ gap: 10, paddingTop: 4, paddingBottom: 10 }}>
        <SearchField value={query} onChange={setQuery} placeholder="운동 이름으로 찾기" c={c} />
        <ChipRow chips={chips} c={c} />
      </View>
      <FilterSheet open={sheet} onClose={() => setSheet(false)} groups={FILTER_GROUPS} value={filter} onChange={(f) => setFilter(f as typeof filter)} resultCount={filtering ? matched.length : null} c={c} />
      {!data ? (
        state.failed ? (
          <View style={{ padding: 24, gap: 16, alignItems: 'center' }}>
            <Text style={{ color: c.ink, fontSize: 15 }}>{state.failed}</Text>
            <Press accessibilityRole="button" onPress={() => void state.load()} hitSlop={8}>
              <Text style={{ color: c.sky, fontSize: 15, fontWeight: '700' }}>다시 불러오기</Text>
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
              <Text style={{ color: c.muted, fontSize: 15 }}>조건에 맞는 운동이 없어요</Text>
              <Press
                accessibilityRole="button"
                onPress={() => {
                  setQuery('');
                  setOnlyFav(false);
                  setFilter(EMPTY_FILTER);
                }}
                hitSlop={8}
              >
                <Text style={{ color: c.sky, fontSize: 15, fontWeight: '700' }}>조건 모두 지우기</Text>
              </Press>
            </View>
          }
          /* 웹 ExerciseGrid — 두 칸 카드, 누른 것만 그 자리에서 넓게 */
          renderItem={({ item: row }) => (
            <GridRow row={row} onOpen={setOpenId} detail={(ex) => <ExerciseDetail item={ex} onClose={() => setOpenId(null)} c={c} />} c={c} />
          )}
        />
      ) : (
        <ScrollView
          keyboardDismissMode="on-drag"
          contentContainerStyle={[{ paddingHorizontal: 16, gap: 10, paddingBottom: inset.bottom + 32 }, READABLE]}
          refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={() => void state.refresh()} />}
        >
          <LibraryTabs active="training" c={c} />
          {TRAINING_CATEGORIES.map(({ name }) => {
            const list = byCategory.get(name) ?? [];
            if (name === '워밍업' && data.warmupFolders.length > 0) {
              const byId = new Map(exercises.map((ex) => [ex.id, ex]));
              const inFolder = new Set(data.warmupFolders.flatMap((f) => f.exerciseIds));
              const loose = list.filter((ex) => !inFolder.has(ex.id));
              const count = [...inFolder].filter((id) => byId.has(id)).length + loose.length;
              return (
                <View key={name}>
                  <FoldHead icon title={name} count={count} open={open.has(name)} onPress={() => flip(name)} c={c} />
                  {open.has(name)
                    ? body(
                        <View style={{ gap: 8 }}>
                          {data.warmupFolders.map((f) => {
                            const fx = f.exerciseIds.flatMap((id) => byId.get(id) ?? []);
                            const key = `${name}:${f.kind}`;
                            return (
                              <View key={key} style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: c.page }}>
                                <FoldHead title={f.name} desc={f.description} count={fx.length} open={open.has(key)} onPress={() => flip(key)} c={c} />
                                {open.has(key) ? <View style={{ padding: 4, backgroundColor: c.page }}>{grid(fx)}</View> : null}
                              </View>
                            );
                          })}
                          {loose.length > 0 ? grid(loose) : null}
                        </View>
                      )
                    : null}
                </View>
              );
            }
            if (list.length === 0) return null;
            return (
              <View key={name}>
                <FoldHead icon title={name} count={list.length} open={open.has(name)} onPress={() => flip(name)} c={c} />
                {open.has(name) ? body(grid(list)) : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

