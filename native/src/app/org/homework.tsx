import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadHomeworkLibrary } from '@/app/actions/app-lesson';
import { HOMEWORK_ITEMS_MAX } from '@/lib/org/homework';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { Bar, LoadState, call, useBusy, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { Segmented } from '~/shell/heading';
import { toast } from '~/shell/toast';
import { ChoiceChips, DateStepper, Field } from '~/org/forms';
import { Card, Empty, Primary } from '~/org/parts';

/**
 * 숙제 내기(앱 화면, 2단계) — 라이브러리 운동 · 드릴에서 고르고(자유 글 운동 없음) 세트 · 횟수를 적는다. 저장은 app-lesson.assignHomework.
 * 선수가 트레이닝에서 그 운동을 하면 저절로 완료된다.
 */
type Library = Awaited<ReturnType<typeof loadHomeworkLibrary>>;
type Kind = 'exercise' | 'drill';
type Pick = { id: string; kind: Kind; name: string; sets: string; reps: string };
const KINDS = [
  { value: 'exercise', label: '운동' },
  { value: 'drill', label: '드릴' },
] as const;
const DUE = [
  { value: 'none', label: '기한 없음' },
  { value: 'set', label: '기한' },
] as const;
const SHOWN = 40;

export default function HomeworkScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const p = useLocalSearchParams<{ org: string; member: string }>();
  const lib = useLoad<Library>('app-lesson.loadHomeworkLibrary', p.org ?? '');
  const [kind, setKind] = useState<Kind>('exercise');
  const [q, setQ] = useState('');
  const [picks, setPicks] = useState<Pick[]>([]);
  const today = toDateKey(new Date());
  const [due, setDue] = useState<{ on: boolean; key: string }>({ on: false, key: shiftDateKey(today, 7) });
  const { busy, error, run } = useBusy();

  const toggle = (id: string, name: string) =>
    setPicks((ps) =>
      ps.some((x) => x.id === id) ? ps.filter((x) => x.id !== id) : ps.length >= HOMEWORK_ITEMS_MAX ? ps : [...ps, { id, kind, name, sets: '', reps: '' }]
    );
  const patch = (id: string, v: Partial<Pick>) => setPicks((ps) => ps.map((x) => (x.id === id ? { ...x, ...v } : x)));

  const save = () =>
    run(async () => {
      if (picks.length === 0) return '숙제로 낼 운동을 골라 주세요.';
      if (due.on && due.key < today) return '기한은 오늘부터 고를 수 있어요.';
      const r = await call<{ ok: true }>('app-lesson.assignHomework', p.org, p.member, {
        dueDate: due.on ? due.key : null,
        items: picks.map((x) => ({
          [x.kind === 'exercise' ? 'exerciseId' : 'guideId']: x.id,
          sets: x.sets ? Number(x.sets) : undefined,
          reps: x.reps ? Number(x.reps) : undefined,
        })),
      });
      if (!r.ok) return ('error' in r && r.error) || '숙제를 내지 못했어요.';
      toast('숙제를 냈어요');
      router.back();
      return null;
    });

  const list = lib.data ? (kind === 'exercise' ? lib.data.exercises : lib.data.drills) : [];
  const word = q.trim();
  const shown = list.filter((x) => !word || x.name.includes(word) || x.category.includes(word)).slice(0, SHOWN);

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title="숙제 내기" c={c} />
      {!lib.data ? (
        <LoadState error={lib.error} onRetry={() => void lib.reload()} c={c} />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>
          <Field label={`고른 것 ${picks.length}/${HOMEWORK_ITEMS_MAX}`} hint="세트 · 횟수는 선택" c={c}>
            <Card c={c} style={{ paddingVertical: 4 }}>
              {picks.length === 0 ? (
                <Empty text="아래에서 운동이나 드릴을 눌러 골라요." c={c} />
              ) : (
                picks.map((x, i) => (
                  <View key={x.id} style={[st.row, i < picks.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
                    <Text style={[TYPE.body, { color: c.ink, flex: 1 }]} numberOfLines={2}>
                      {x.name}
                    </Text>
                    <Num value={x.sets} onChange={(sets) => patch(x.id, { sets })} unit="세트" max={2} c={c} />
                    <Num value={x.reps} onChange={(reps) => patch(x.id, { reps })} unit="회" max={3} c={c} />
                    <Pressable accessibilityRole="button" accessibilityLabel={`${x.name} 빼기`} onPress={() => toggle(x.id, x.name)} hitSlop={8}>
                      <Text style={{ color: c.danger, fontSize: 20 }}>×</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </Card>
          </Field>

          <Field label="기한" c={c}>
            <ChoiceChips options={DUE} value={due.on ? 'set' : 'none'} onChange={(v) => setDue({ ...due, on: v === 'set' })} c={c} />
            {due.on ? <DateStepper value={due.key} onChange={(key) => setDue({ on: true, key })} c={c} /> : null}
          </Field>

          {error ? <Text style={[TYPE.body, { color: c.danger }]}>{error}</Text> : null}
          <Primary label={busy ? '내는 중…' : '숙제 내기'} onPress={() => void save()} disabled={busy || picks.length === 0} c={c} />

          <View style={{ gap: 8 }}>
            <Segmented label="숙제 종류" options={KINDS} value={kind} onChange={setKind} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="이름 · 분류로 찾기"
              placeholderTextColor={c.muted}
              style={[st.search, { backgroundColor: c.card, color: c.ink }]}
              accessibilityLabel="운동 찾기"
            />
            <Card c={c} style={{ paddingVertical: 4 }}>
              {shown.length === 0 ? (
                <Empty text="맞는 것이 없어요." c={c} />
              ) : (
                shown.map((x, i) => {
                  const on = picks.some((p2) => p2.id === x.id);
                  return (
                    <Pressable
                      key={x.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      onPress={() => toggle(x.id, x.name)}
                      style={({ pressed }) => [st.row, i < shown.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }, pressed && { opacity: 0.6 }]}
                    >
                      <View style={{ flex: 1, gap: 1 }}>
                        <Text style={[TYPE.body, { color: c.ink }]} numberOfLines={2}>
                          {x.name}
                        </Text>
                        <Text style={[TYPE.sub, { color: c.muted }]}>{x.category}</Text>
                      </View>
                      <Text style={{ color: on ? c.link : c.muted, fontSize: 20, fontWeight: '700' }}>{on ? '✓' : '+'}</Text>
                    </Pressable>
                  );
                })
              )}
            </Card>
            {list.length > shown.length && !word ? <Text style={[TYPE.sub, { color: c.muted, paddingHorizontal: 4 }]}>찾기로 더 볼 수 있어요.</Text> : null}
          </View>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

function Num({ value, onChange, unit, max, c }: { value: string; onChange: (v: string) => void; unit: string; max: number; c: Palette }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, max))}
        placeholder="-"
        placeholderTextColor={c.muted}
        keyboardType="number-pad"
        accessibilityLabel={unit}
        style={[TYPE.numInline, { color: c.ink, textAlign: 'right', minWidth: 28, paddingVertical: 6 }]}
      />
      <Text style={[TYPE.sub, { color: c.muted }]}>{unit}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 6 },
  search: { minHeight: 44, borderRadius: 12, paddingHorizontal: 14, fontSize: 17 },
});
