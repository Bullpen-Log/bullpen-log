import { type Href, router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TrainingSetupAnswers, TrainingStepKey } from '@/lib/training/setup-answers';
import { Bar, LoadState, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { usePalette } from '~/lib/ui';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';

/** 설정 목록은 현재 값을 보여 주고, 각 항목은 첫 설정과 같은 질문→요약→저장 흐름으로 고친다. */
type Loaded = { ok: true; initial: TrainingSetupAnswers; hasSetup: boolean; askHand: boolean } | { ok: false; to: string };

const ROWS: { key: TrainingStepKey; label: string; hint: string; icon: IconName }[] = [
  { key: 'level', label: '웨이트 경력', hint: '선택 운동의 난이도', icon: 'dumbbell' },
  { key: 'workoutFreq', label: '평소 횟수', hint: '기록이 쌓이기 전의 기준', icon: 'calendar-days' },
  { key: 'minutes', label: '기본 시간', hint: '새 운동을 만들 때 제안', icon: 'clock-3' },
];
const HAND_ROW: (typeof ROWS)[number] = { key: 'hand', label: '던지는 손', hint: '암케어와 메카닉의 기준', icon: 'pitcher' };

export default function TrainingSettingsScreen() {
  const c = usePalette();
  const { data, error, reload } = useLoad<Loaded>('training-setup.loadAppTrainingSetup');
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="트레이닝" title="트레이닝 설정" c={c} />
      {data ? <Body initial={data.initial} askHand={data.askHand} /> : <LoadState error={error} onRetry={() => void reload()} c={c} />}
    </View>
  );
}

function Body({ initial, askHand }: { initial: TrainingSetupAnswers; askHand: boolean }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const values: Record<string, string> = {
    level: initial.trainingLevel ?? '선택 전',
    workoutFreq: initial.baselineWorkoutFreq ?? '선택 전',
    minutes: initial.dailyWorkoutMinutes ? `${initial.dailyWorkoutMinutes}분` : '선택 전',
    hand: initial.throwingHand ?? '선택 전',
  };
  return (
    <ScrollView contentContainerStyle={[st.content, { paddingBottom: inset.bottom + 32 }, READABLE]}>
      <View style={st.heading}>
        <Text style={[st.kicker, { color: c.link }]}>MY TRAINING BASE</Text>
        <Text accessibilityRole="header" style={[st.title, { color: c.ink }]}>내 운동 기준</Text>
        <Text style={[st.body, { color: c.muted }]}>운동을 고르고 새 일정을 만들 때 참고해요.</Text>
      </View>
      <View style={[st.intro, { backgroundColor: '#132c50' }]}>
        <Text style={st.introLabel}>트레이닝 설정</Text>
        <Text style={st.introTitle}>다음 운동을 나에게 맞게</Text>
        <Text style={st.introBody}>바꾼 설정은 새 운동 계획을 만들 때 반영돼요.</Text>
      </View>
      <View style={[st.group, { backgroundColor: c.card, borderColor: c.line, boxShadow: c.float }]}>
        {[...ROWS, ...(askHand ? [HAND_ROW] : [])].map((row, i) => (
          <Press
            key={row.key}
            accessibilityRole="button"
            accessibilityLabel={`${row.label}, ${values[row.key]}, 수정`}
            onPress={() => router.push({ pathname: '/setup/training', params: { edit: row.key } } as Href)}
            style={[st.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}
          >
            <Icon name={row.icon} size={17} color={c.link} />
            <View style={st.rowCopy}>
              <Text style={[st.rowLabel, { color: c.ink }]}>{row.label}</Text>
              <Text style={[st.rowHint, { color: c.muted }]}>{row.hint}</Text>
            </View>
            <Text style={[st.value, { color: c.link }]}>{values[row.key]}</Text>
            <Icon name="chevron-right" size={16} color={c.muted} />
          </Press>
        ))}
      </View>
      <View style={[st.note, { backgroundColor: c.skyTint }]}>
        <Icon name="info" size={17} color={c.link} />
        <Text style={[st.noteText, { color: c.ink }]}>이미 만든 오늘 일정은 그대로예요. 장비는 운동을 만들 때 고를 수 있어요.</Text>
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 20, gap: 17 },
  heading: { gap: 5 },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  title: { fontSize: 25, lineHeight: 32, fontWeight: '800', letterSpacing: -0.7 },
  body: { fontSize: 15, lineHeight: 22 },
  intro: { borderRadius: 18, paddingHorizontal: 18, paddingVertical: 17, gap: 6 },
  introLabel: { color: '#b8cbe4', fontSize: 12, fontWeight: '700' },
  introTitle: { color: '#fff', fontSize: 19, fontWeight: '800' },
  introBody: { color: '#d8e4f2', fontSize: 13, lineHeight: 19 },
  group: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 17, paddingHorizontal: 15, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 70, paddingVertical: 12 },
  rowCopy: { flex: 1, gap: 3 },
  rowLabel: { fontSize: 15, fontWeight: '700' },
  rowHint: { fontSize: 12, lineHeight: 17 },
  value: { fontSize: 14, fontWeight: '700', textAlign: 'right' },
  note: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  noteText: { flex: 1, fontSize: 13, lineHeight: 19 },
});
