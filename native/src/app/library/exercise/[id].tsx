import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette, type Palette } from '~/lib/ui';
import { Bar } from '~/community/parts';
import { ExerciseDetail } from '~/library/detail';
import { EXERCISE_LIST, recall, type Exercise } from '~/library/parts';
import { s, useScreenData } from '~/training/screen';
import { READABLE } from '~/lib/layout';

/**
 * 운동 하나(앱 화면) — 웹 운동 영상 라이브러리에서 카드를 펼친 것(training-client.tsx ExerciseDetail)을 옮겼다. 영상(누르면 튼다) · 이름 · 부위 ·
 * 강도 · 장비 · 키우는 근육 · 처방 · 설명(열 때 받는다, content.exerciseDescription) · 내 메모 · 별 · 내 기록(exercise-history).
 * 목록에서 받은 줄을 그대로 그리고(~/library/parts remember), 바로 열린 주소면 목록을 받아 찾는다.
 */
export default function ExerciseDetailScreen() {
  const c = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const kept = id ? recall<Exercise>(id) : null;
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="운동 영상" c={c} />
      {kept ? <Body item={kept} c={c} /> : <FromList id={id ?? ''} c={c} />}
    </View>
  );
}

/** 목록에 없던 운동(앱을 막 켜 상세 주소로 바로 옴) — 목록을 받아 찾는다 */
function FromList({ id, c }: { id: string; c: Palette }) {
  const state = useScreenData<{ exercises: Exercise[] }>(EXERCISE_LIST, '', 'library:exercises');
  const item = state.data?.exercises.find((ex) => ex.id === id);
  if (item) return <Body item={item} c={c} />;
  if (state.data) return <Text style={[s.body, s.center, { color: c.muted, padding: 32 }]}>없는 운동이에요.</Text>;
  return state.failed ? <Text style={[s.body, s.center, { color: c.muted, padding: 32 }]}>{state.failed}</Text> : <ActivityIndicator style={{ marginTop: 40 }} />;
}

function Body({ item, c }: { item: Exercise; c: Palette }) {
  const inset = useSafeAreaInsets();
  return (
    <ScrollView contentContainerStyle={[{ padding: 16, paddingBottom: inset.bottom + 40 }, READABLE]}>
      <ExerciseDetail item={item} c={c} />
    </ScrollView>
  );
}
