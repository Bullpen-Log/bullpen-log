import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ALWAYS_OWNED, SELECTABLE_EQUIPMENT } from '@/lib/report/equipment';
import { TRAINING_LEVELS } from '@/lib/report/personalize';
import { Bar, LoadState, call, useLoad } from '~/community/parts';
import { usePalette } from '~/lib/ui';

/**
 * 트레이닝 설정(앱 화면) — 웹 설정 창의 트레이닝 칸(components/training-forms.tsx TrainingSettingsForm)과 같은 둘:
 * 웨이트 경력(고르면 바로 저장)과 가진 장비(저장 단추). 저장은 웹과 같은 거름(training-setup.saveAppTrainingLevel · saveAppOwnedEquipment).
 * 장비를 한 번도 안 고른 사람에게는 웹처럼 전부 켜서 보인다(빈 채로 저장하면 맨몸 운동만 남는다). 오늘 일정은 안 바뀐다(다시 만들기로).
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
  const chosen = initial.ownedEquipment.length > 0;
  const [owned, setOwned] = useState<string[]>(() => (chosen ? initial.ownedEquipment : [...SELECTABLE_EQUIPMENT]));
  const [dirty, setDirty] = useState(!chosen);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

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

  const toggle = (name: string) => {
    void Haptics.selectionAsync();
    setOwned((list) => (list.includes(name) ? list.filter((x) => x !== name) : [...list, name]));
    setDirty(true);
    setNote(null);
  };

  const saveOwned = async () => {
    if (saving) return;
    setSaving(true);
    const r = await call<{ ok: true }>('training-setup.saveAppOwnedEquipment', owned.filter((x) => x !== ALWAYS_OWNED));
    setSaving(false);
    if (!r.ok) return setNote(r.error);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDirty(false);
    setNote('가진 장비를 저장했어요');
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: inset.bottom + 32 }}>
      <Text style={[st.title, { color: c.ink }]}>웨이트 트레이닝 경력</Text>
      <Text style={[st.hint, { color: c.muted }]}>경력에 비해 이른 운동을 빼는 기준이에요. 고르면 바로 저장돼요.</Text>
      <View style={[st.group, { backgroundColor: c.card }]}>
        {TRAINING_LEVELS.map((l, i) => {
          const on = level === l.name;
          return (
            <Pressable
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
              {on ? levelBusy ? <ActivityIndicator /> : <SymbolView name="checkmark" size={17} weight="semibold" tintColor={c.sky} /> : null}
            </Pressable>
          );
        })}
      </View>
      {levelNote ? <Text style={[st.hint, { color: levelNote.endsWith('저장했어요') ? c.muted : c.danger }]}>{levelNote}</Text> : null}

      <Text style={[st.title, { color: c.ink, marginTop: 18 }]}>가지고 있는 장비</Text>
      <Text style={[st.hint, { color: c.muted }]}>
        {chosen
          ? '여기서 고른 것 중에 오늘 쓸 수 있는 것을 일정을 만들 때 다시 골라요.'
          : '아직 고른 적이 없어 전부 켜 두었어요. 없는 것을 꺼야 못 하는 운동이 안 나와요.'}
      </Text>
      <View style={st.chips}>
        {SELECTABLE_EQUIPMENT.map((name) => {
          const on = owned.includes(name);
          return (
            <Pressable
              key={name}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => toggle(name)}
              style={[st.chip, { backgroundColor: on ? c.sky : c.chip }]}
            >
              <Text style={{ color: on ? '#fff' : c.ink, fontSize: 15, fontWeight: '600' }}>{name}</Text>
            </Pressable>
          );
        })}
      </View>
      {note ? <Text style={[st.hint, { color: note.endsWith('저장했어요') ? c.muted : c.danger }]}>{note}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={saving || !dirty}
        onPress={() => void saveOwned()}
        style={[st.primary, { backgroundColor: c.sky }, (saving || !dirty) && { opacity: 0.45 }]}
      >
        <Text style={st.primaryText}>{saving ? '저장하는 중' : '가진 장비 저장'}</Text>
      </Pressable>
      <Text style={[st.hint, { color: c.muted }]}>오늘 만든 일정은 그대로예요. 새 설정으로 받으려면 오늘 운동에서 다시 만들어 주세요.</Text>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={{ alignSelf: 'center', padding: 12 }}>
        <Text style={{ color: c.sky, fontSize: 15, fontWeight: '600' }}>닫기</Text>
      </Pressable>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '700' },
  hint: { fontSize: 14, lineHeight: 20 },
  group: { borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 56 },
  rowTitle: { fontSize: 17, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center' },
  primary: { height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
