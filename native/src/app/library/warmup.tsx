import { type Href, router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatPrescription } from '@/lib/exercise-meta';
import type { WarmupFolder } from '@/app/(app)/library/training/training-client';
import { Bar } from '~/community/parts';
import { EXERCISE_LIST, ItemRow, type Exercise } from '~/library/parts';
import { usePalette } from '~/lib/ui';
import { useScreenData } from '~/training/screen';
import { READABLE } from '~/lib/layout';

/**
 * 워밍업 루틴(앱 화면) — 웹 /library/warmup(warmup-client.tsx)의 보기 쪽: 루틴마다 이름 · 하는 날 배지 · 설명 · 번호 매긴 운동(미리보기 · 처방).
 * 자료는 운동 영상 라이브러리와 같은 곳(app-library.loadAppExerciseLibrary 의 warmupFolders — 새 서버 동작 없음, 받아 둔 목록을 같이 쓴다).
 * 운동을 누르면 상세. 관리자의 이름 고치기 · 담기 · 순서 바꾸기는 웹에서 한다(앱 라이브러리 규칙과 같다).
 * ponytail: 공통 루틴(몸 데우기 · 동적 가동)은 따로 안 보이고 그날 루틴 셋 앞머리에 들어 있다(lib/library-load.ts 가 그렇게 묶음) —
 * 웹처럼 공통을 한 장으로 따로 보이려면 서버가 COMMON 루틴도 내려 줘야 한다.
 */
type Data = { exercises: Exercise[]; warmupFolders: WarmupFolder[] };

/** 하는 날 — 웹 warmup-client.tsx WHEN 과 같은 글 */
const WHEN: Record<string, string> = {
  COMMON: '어느 날이든',
  LOWER: '하체 운동을 하는 날',
  UPPER_PUSH: '미는 운동을 하는 날',
  UPPER_PULL: '당기는 운동을 하는 날',
};

export default function WarmupRoutineScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const state = useScreenData<Data>(EXERCISE_LIST, '', 'library:exercises');
  const data = state.data;
  const byId = useMemo(() => new Map((data?.exercises ?? []).map((ex) => [ex.id, ex])), [data]);
  const routines = (data?.warmupFolders ?? [])
    .map((f) => ({ ...f, items: f.exerciseIds.flatMap((id) => byId.get(id) ?? []) }))
    .filter((r) => r.items.length > 0);

  return (
    <View style={{ flex: 1, backgroundColor: c.page, paddingTop: inset.top }}>
      <Bar back="뒤로" title="워밍업 루틴" c={c} />
      {!data ? (
        <ActivityIndicator style={{ padding: 24 }} />
      ) : (
        <ScrollView
          contentContainerStyle={[{ paddingHorizontal: 16, gap: 14, paddingBottom: inset.bottom + 32 }, READABLE]}
          refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={() => void state.refresh()} />}
        >
          <Text style={{ color: c.muted, fontSize: 14, lineHeight: 20 }}>
            운동을 시작하면 본운동 전에 그날 목적에 맞는 루틴이 떠요. 날마다 새로 뽑지 않고 여기 짜 둔 그대로 해요.
          </Text>
          {routines.length === 0 ? (
            <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', padding: 24 }}>아직 담긴 루틴이 없어요.</Text>
          ) : null}
          {routines.map((r) => (
            <View key={r.kind} style={{ gap: 8 }}>
              <View style={styles.head}>
                <Text style={{ flexShrink: 1, color: c.ink, fontSize: 17, fontWeight: '700' }}>{r.name}</Text>
                <View style={[styles.badge, { backgroundColor: c.chip }]}>
                  <Text style={{ color: c.muted, fontSize: 12, fontWeight: '600' }}>{WHEN[r.kind] ?? r.kind}</Text>
                </View>
              </View>
              {r.description ? <Text style={{ color: c.muted, fontSize: 14, lineHeight: 20 }}>{r.description}</Text> : null}
              <View>
                {r.items.map((ex, i) => (
                  <ItemRow
                    key={ex.id}
                    title={`${i + 1}. ${ex.title}`}
                    sub={formatPrescription(ex) ?? ''}
                    thumbUrl={ex.thumbUrl}
                    favorite={ex.favorite}
                    onPress={() => router.push(`/library/exercise/${ex.id}` as Href)}
                    first={i === 0}
                    last={i === r.items.length - 1}
                    c={c}
                  />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
});
