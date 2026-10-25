import { Icon } from '~/shell/icon';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TRAINING_LEVELS } from '@/lib/report/personalize';
import { Bar, LoadState, call, useLoad } from '~/community/parts';
import { usePalette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';
import { Press } from '~/shell/press';

/**
 * 트레이닝 설정(앱 화면) — 웹 설정 창의 트레이닝 칸(components/training-forms.tsx TrainingSettingsForm)과 같은 웨이트 경력(고르면 바로 저장,
 * training-setup.saveAppTrainingLevel). 가진 장비는 2026-10-20 뺐다(김민: 장비는 프로그램 시작 · 오늘 운동 만들기 때만 고른다).
 */
type Loaded = { ok: true; trainingLevel: string | null; ownedEquipment: string[] } | { ok: false; to: string };

export default function TrainingSettingsScreen() {
  const c = usePalette();
  const { data, error, reload } = useLoad<Loaded>('training-setup.loadAppTrainingSettings');
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="트레이닝" title="트레이닝 설정" c={c} />
      {data ? <Body initial={data} /> : <LoadState error={error} onRetry={() => void reload()} c={c} />}
    </View>
  );
}

function Body({ initial }: { initial: Extract<Loaded, { ok: true }> }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [level, setLevel] = useState(initial.trainingLevel);
  const [levelBusy, setLevelBusy] = useState(false);
  const [levelNote, setLevelNote] = useState<string | null>(null);
  const pickLevel = async (name: string) => {
    if (levelBusy || name === level) return;
    void Haptics.selectionAsync();
    const before = level;
    setLevel(name);
    setLevelBusy(true);
    setLevelNote(null);
    const r = await call<{ ok: true }>('training-setup.saveAppTrainingLevel', name);
    setLevelBusy(false);
    if (!r.ok) {
      setLevel(before);
      setLevelNote(r.error);
    } else setLevelNote('경력을 저장했어요');
  };

  return (
    <ScrollView contentContainerStyle={[{ padding: 16, gap: 10, paddingBottom: inset.bottom + 32 }, READABLE]}>
      <Text style={[st.title, { color: c.ink }]}>웨이트 트레이닝 경력</Text>
      <Text style={[st.hint, { color: c.muted }]}>경력에 비해 이른 운동을 빼는 기준이에요. 고르면 바로 저장돼요.</Text>
      <View style={[st.group, { backgroundColor: c.card, boxShadow: c.float }]}>
        {TRAINING_LEVELS.map((l, i) => {
          const on = level === l.name;
          return (
            <Press
              key={l.name}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: levelBusy }}
              onPress={() => void pickLevel(l.name)}
              style={[st.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[st.rowTitle, { color: c.ink }]}>{l.name}</Text>
                <Text style={[st.hint, { color: c.muted }]}>{l.desc}</Text>
              </View>
              {on ? levelBusy ? <ActivityIndicator /> : <Icon name="check" size={17} color={c.link} /> : null}
            </Press>
          );
        })}
      </View>
      {levelNote ? <Text style={[st.hint, { color: levelNote.endsWith('저장했어요') ? c.muted : c.danger }]}>{levelNote}</Text> : null}

      <Press accessibilityRole="button" onPress={() => router.back()} style={{ alignSelf: 'center', padding: 12 }}>
        <Text style={{ color: c.link, fontSize: 15, fontWeight: '600' }}>닫기</Text>
      </Press>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '700' },
  hint: { fontSize: 15, lineHeight: 20 },
  group: { borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 56 },
  rowTitle: { fontSize: 17, fontWeight: '600' },
});
