import { SymbolView } from 'expo-symbols';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette, type Palette } from '~/lib/ui';
import { ExerciseMedia } from '~/armcare/parts';
import { Bar } from '~/community/parts';
import { DRILL_LIST, Tags, recall, useStar, type Drill } from '~/library/parts';
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
  const star = useStar(item, 'drill');
  const [main, ...more] = item.focusPoints;
  return (
    <ScrollView contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 40 }, READABLE]}>
      <ExerciseMedia path={item.videoPath} referenceVideoId={item.referenceVideoId} thumbUrl={item.thumbUrl} aspectRatio={item.aspectRatio} />
      <View style={[s.row, { alignItems: 'flex-start' }]}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text selectable style={[s.title, { color: c.ink }]}>
            {item.title}
          </Text>
          <Text style={[s.small, { color: c.muted }]}>{item.category}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={star.on ? '즐겨찾기에서 빼기' : '즐겨찾기에 담기'}
          accessibilityState={{ selected: star.on }}
          onPress={() => void star.toggle()}
          hitSlop={8}
          style={s.iconBtn}
        >
          <SymbolView name={star.on ? 'star.fill' : 'star'} size={24} tintColor={star.on ? '#ff9500' : c.muted} />
        </Pressable>
      </View>
      {star.note ? <Text style={[s.small, { color: c.danger }]}>{star.note}</Text> : null}
      {main ? (
        <Text style={[s.small, { color: c.muted }]}>
          주 요소 <Text style={{ color: c.sky, fontWeight: '700' }}>{main}</Text>
          {more.length > 0 ? ` · 함께 쓰는 요소 ${more.join(' · ')}` : ''}
        </Text>
      ) : null}
      <Tags items={[...(item.stage ? [item.stage] : []), ...item.equipment]} c={c} />
      <View style={[s.card, { backgroundColor: c.card }]}>
        {item.description ? (
          <Text selectable style={[s.body, { color: c.ink }]}>
            {item.description}
          </Text>
        ) : (
          <Text style={[s.small, { color: c.muted }]}>아직 적힌 설명이 없어요.</Text>
        )}
      </View>
    </ScrollView>
  );
}
