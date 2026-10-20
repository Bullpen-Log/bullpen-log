import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette, type Palette } from '~/lib/ui';
import { Bar } from '~/community/parts';
import { DrillDetail } from '~/library/detail';
import { DRILL_LIST, recall, type Drill } from '~/library/parts';
import { s, useScreenData } from '~/training/screen';
import { READABLE } from '~/lib/layout';

/**
 * 드릴 하나(앱 화면) — 웹 투구 드릴 라이브러리에서 카드를 펼친 것(mechanics-client.tsx GuideDetail)을 옮겼다. 영상 · 이름 · 요소(맨 앞이 주 요소) ·
 * 단계 · 종류 · 장비 · 설명 · 별. 설명은 목록에 같이 온다. 바로 열린 주소면 목록을 받아 찾는다.
 */
export default function DrillDetailScreen() {
  const c = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const kept = id ? recall<Drill>(id) : null;
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="투구 드릴" c={c} />
      {kept ? <Body item={kept} c={c} /> : <FromList id={id ?? ''} c={c} />}
    </View>
  );
}

function FromList({ id, c }: { id: string; c: Palette }) {
  const state = useScreenData<{ drills: Drill[] }>(DRILL_LIST, '', 'library:drills');
  const item = state.data?.drills.find((g) => g.id === id);
  if (item) return <Body item={item} c={c} />;
  if (state.data) return <Text style={[s.body, s.center, { color: c.muted, padding: 32 }]}>없는 드릴이에요.</Text>;
  return state.failed ? <Text style={[s.body, s.center, { color: c.muted, padding: 32 }]}>{state.failed}</Text> : <ActivityIndicator style={{ marginTop: 40 }} />;
}

function Body({ item, c }: { item: Drill; c: Palette }) {
  const inset = useSafeAreaInsets();
  return (
    <ScrollView contentContainerStyle={[{ padding: 16, paddingBottom: inset.bottom + 40 }, READABLE]}>
      <DrillDetail item={item} c={c} />
    </ScrollView>
  );
}
