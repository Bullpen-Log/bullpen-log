import { type Href, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TRAINING_CATEGORIES } from '@/lib/categories';
import { BODY_PARTS } from '@/lib/exercise-meta';
import { matchesSearch } from '@/lib/korean';
import type { WarmupFolder } from '@/app/(app)/library/training/training-client';
import { Bar } from '~/community/parts';
import { ChipRow, EXERCISE_LIST, FoldHead, ItemRow, SearchField, recall, remember, type Exercise } from '~/library/parts';
import { usePalette } from '~/lib/ui';
import { useScreenData } from '~/training/screen';
import { READABLE } from '~/lib/layout';

/**
 * 운동 영상 라이브러리(앱 화면) — 웹 /library/training(training-client.tsx)을 옮겼다. 사이트의 그 주소가 앱(BullpenNative/7 부터)이면 이 화면을
 * 띄우고(page.tsx → OpenNative), 목록은 웹과 같은 곳(app-library.loadAppExerciseLibrary → lib/library-load.ts)이다.
 *
 * 웹과 같은 차례: 이름 찾기 → [즐겨찾기 · 부위] 거르기 → 거르는 동안은 맞는 운동만, 아니면 분류마다 접힌 칸(워밍업은 루틴 폴더). 줄을 누르면
 * 상세(영상 · 설명 · 별 · 내 기록). 관리자의 등록 · 수정 · 숨기기는 웹에서 한다.
 * ponytail: 거르기는 즐겨찾기 · 부위만 — 웹의 강도 · 장비 거르기는 쓰는 사람이 적어 뺐다. 찾는 사람이 생기면 칩 줄에 더한다.
 */
type Data = { exercises: Exercise[]; warmupFolders: WarmupFolder[] };

const subOf = (ex: Exercise) => [ex.bodyParts.slice(0, 3).join(' · '), ex.intensity].filter(Boolean).join(' · ');

export default function ExerciseLibraryScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const state = useScreenData<Data>(EXERCISE_LIST, '', 'library:exercises');
  const [query, setQuery] = useState('');
  const [onlyFav, setOnlyFav] = useState(false);
  const [parts, setParts] = useState<string[]>([]);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const data = state.data;
  /* 상세에서 별을 바꾸고 돌아오면 목록이 새로 받기 전에도 맞게 — 받아 둔 줄(remember)이 더 새 것이다 */
  const exercises = useMemo(() => {
    if (!data) return [];
    remember(data.exercises);
    return data.exercises.map((ex) => recall<Exercise>(ex.id) ?? ex);
  }, [data]);
  const favCount = exercises.filter((ex) => ex.favorite).length;
  const filtering = query.trim() !== '' || onlyFav || parts.length > 0;
  const matched = useMemo(
    () =>
      exercises.filter(
        (ex) =>
          (!onlyFav || ex.favorite) &&
          (parts.length === 0 || parts.some((p) => ex.bodyParts.includes(p))) &&
          (matchesSearch(ex.title, query) || matchesSearch(ex.category, query))
      ),
    [exercises, onlyFav, parts, query]
  );
  const byCategory = useMemo(() => {
    const m = new Map<string, Exercise[]>();
    for (const ex of exercises) m.set(ex.category, [...(m.get(ex.category) ?? []), ex]);
    return m;
  }, [exercises]);

  const openItem = (id: string) => router.push(`/library/exercise/${id}` as Href);
  const flip = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  /* headed: 접힌 칸 머리 밑에 붙는 줄(첫 줄 위를 둥글리지 않는다) */
  const rows = (list: Exercise[], headed = true) =>
    list.map((ex, i) => (
      <ItemRow
        key={ex.id}
        title={ex.title}
        sub={subOf(ex)}
        thumbUrl={ex.thumbUrl}
        favorite={ex.favorite}
        onPress={() => openItem(ex.id)}
        first={!headed && i === 0}
        last={i === list.length - 1}
        c={c}
      />
    ));

  const chips = [
    ...(favCount > 0 ? [{ key: 'fav', label: `★ 즐겨찾기 ${favCount}`, on: onlyFav, onPress: () => setOnlyFav((v) => !v) }] : []),
    ...BODY_PARTS.map((p) => ({
      key: p,
      label: p,
      on: parts.includes(p),
      onPress: () => setParts((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])),
    })),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title="운동 영상" c={c} />
      <View style={{ gap: 10, paddingTop: 4, paddingBottom: 10 }}>
        <SearchField value={query} onChange={setQuery} placeholder="운동 이름으로 찾기" c={c} />
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
          keyExtractor={(ex) => ex.id}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[{ paddingHorizontal: 16, paddingBottom: inset.bottom + 32 }, READABLE]}
          ListHeaderComponent={<Text style={{ color: c.muted, fontSize: 13, paddingBottom: 8 }}>{matched.length}개</Text>}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', gap: 12, paddingTop: 32 }}>
              <Text style={{ color: c.muted, fontSize: 15 }}>조건에 맞는 운동이 없어요</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setQuery('');
                  setOnlyFav(false);
                  setParts([]);
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
              sub={`${item.category} · ${subOf(item)}`}
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
          {TRAINING_CATEGORIES.map(({ name }) => {
            const list = byCategory.get(name) ?? [];
            if (name === '워밍업' && data.warmupFolders.length > 0) {
              const byId = new Map(exercises.map((ex) => [ex.id, ex]));
              const inFolder = new Set(data.warmupFolders.flatMap((f) => f.exerciseIds));
              const loose = list.filter((ex) => !inFolder.has(ex.id));
              const count = [...inFolder].filter((id) => byId.has(id)).length + loose.length;
              return (
                <View key={name}>
                  <FoldHead title={name} count={count} open={open.has(name)} onPress={() => flip(name)} c={c} />
                  {open.has(name) ? (
                    <View style={{ backgroundColor: c.card, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, padding: 10, gap: 8 }}>
                      {data.warmupFolders.map((f) => {
                        const fx = f.exerciseIds.flatMap((id) => byId.get(id) ?? []);
                        const key = `${name}:${f.kind}`;
                        return (
                          <View key={key} style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: c.page }}>
                            <FoldHead title={f.name} desc={f.description} count={fx.length} open={open.has(key)} onPress={() => flip(key)} c={c} />
                            {open.has(key) ? rows(fx) : null}
                          </View>
                        );
                      })}
                      {loose.length > 0 ? <View style={{ borderRadius: 14, overflow: 'hidden' }}>{rows(loose, false)}</View> : null}
                    </View>
                  ) : null}
                </View>
              );
            }
            if (list.length === 0) return null;
            return (
              <View key={name}>
                <FoldHead title={name} count={list.length} open={open.has(name)} onPress={() => flip(name)} c={c} />
                {open.has(name) ? rows(list) : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
