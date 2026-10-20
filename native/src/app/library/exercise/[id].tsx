import { SymbolView } from 'expo-symbols';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatPrescription } from '@/lib/exercise-meta';
import { rpc } from '~/lib/rpc';
import { usePalette, type Palette } from '~/lib/ui';
import { useWeightUnit } from '~/lib/weight-unit';
import { ExerciseMedia } from '~/armcare/parts';
import { Bar } from '~/community/parts';
import { EXERCISE_LIST, Tags, recall, useStar, type Exercise } from '~/library/parts';
import { HistoryPanel } from '~/training/history';
import { s, useScreenData } from '~/training/screen';
import { READABLE } from '~/lib/layout';
import { MuscleChips } from '~/armcare/muscle-info';
import { Press } from '~/shell/press';

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
  const unit = useWeightUnit();
  const star = useStar(item, 'exercise');
  /* null 은 아직 안 옴, 빈 글은 설명이 없는 운동, failed 는 못 받음(누르면 다시) */
  const [desc, setDesc] = useState<{ text: string | null; failed: boolean } | null>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    rpc<string | null>('content.exerciseDescription', item.id).then(
      (text) => alive && setDesc({ text, failed: text == null }),
      () => alive && setDesc({ text: null, failed: true })
    );
    return () => {
      alive = false;
    };
  }, [item.id, tries]);
  const rx = formatPrescription(item);

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
        <Press
          accessibilityRole="button"
          accessibilityLabel={star.on ? '즐겨찾기에서 빼기' : '즐겨찾기에 담기'}
          accessibilityState={{ selected: star.on }}
          onPress={() => void star.toggle()}
          hitSlop={8}
          style={s.iconBtn}
        >
          <SymbolView name={star.on ? 'star.fill' : 'star'} size={24} tintColor={star.on ? '#ff9500' : c.muted} />
        </Press>
      </View>
      {star.note ? <Text style={[s.small, { color: c.danger }]}>{star.note}</Text> : null}
      <Tags items={[...item.bodyParts, item.intensity, ...(item.difficulty ? [item.difficulty] : []), ...item.equipment]} c={c} />
      {item.targetMuscles.length > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={[s.small, { color: c.muted }]}>키우는 근육</Text>
          <MuscleChips muscles={item.targetMuscles} c={c} />
        </View>
      ) : null}
      {rx ? <Text style={[s.bodyBold, { color: c.ink }]}>{rx}</Text> : null}

      <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
        {!desc ? (
          <ActivityIndicator />
        ) : desc.failed ? (
          <Press accessibilityRole="button" onPress={() => setTries((n) => n + 1)} style={s.textBtn}>
            <Text style={[s.small, { color: c.muted }]}>
              설명을 불러오지 못했어요. <Text style={{ color: c.sky, fontWeight: '700' }}>다시 받기</Text>
            </Text>
          </Press>
        ) : desc.text ? (
          <Text selectable style={[s.body, { color: c.ink }]}>
            {desc.text}
          </Text>
        ) : (
          <Text style={[s.small, { color: c.muted }]}>아직 적힌 설명이 없어요.</Text>
        )}
      </View>

      <View style={{ gap: 10 }}>
        <Text style={[s.section, { color: c.ink }]}>내 기록</Text>
        {/* 내 메모도 기록 칸이 같이 보인다(웹은 메모를 위에 따로 두고 기록에서 뺐다 — 앱은 한 칸) */}
        <HistoryPanel exerciseId={item.id} unit={unit} c={c} />
      </View>
    </ScrollView>
  );
}
