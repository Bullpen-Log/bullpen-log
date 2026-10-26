import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { loadHomeworkLibrary } from '@/app/actions/app-lesson';
import { HOMEWORK_ITEMS_MAX } from '@/lib/org/homework';
import { TYPE, type Palette } from '~/lib/ui';
import { Segmented } from '~/shell/heading';
import { Field } from '~/org/forms';
import { Card, Empty } from '~/org/parts';

/**
 * 라이브러리 운동 · 드릴 고르기(숙제 내기 · 훈련 메뉴가 같이 쓴다) — 고른 것에 세트 · 횟수(선택), 밑에 찾기 목록.
 * 자료는 app-lesson.loadHomeworkLibrary(코치만). 보낼 때는 pickItems 로 숙제 · 메뉴 칸 모양(lib/org/homework.ts cleanHomeworkItems)으로.
 */
export type LibraryLoad = Awaited<ReturnType<typeof loadHomeworkLibrary>>;
export type Library = Extract<LibraryLoad, { ok: true }>;
export type PickKind = 'exercise' | 'drill';
export type Pick = { id: string; kind: PickKind; name: string; sets: string; reps: string };

const KINDS = [
  { value: 'exercise', label: '운동' },
  { value: 'drill', label: '드릴' },
] as const;
const SHOWN = 40;

export const pickItems = (picks: readonly Pick[]) =>
  picks.map((x) => ({
    [x.kind === 'exercise' ? 'exerciseId' : 'guideId']: x.id,
    sets: x.sets ? Number(x.sets) : undefined,
    reps: x.reps ? Number(x.reps) : undefined,
  }));

/** 고른 것 칸 */
export function PickedList({ picks, setPicks, c }: { picks: Pick[]; setPicks: (f: (ps: Pick[]) => Pick[]) => void; c: Palette }) {
  const patch = (id: string, v: Partial<Pick>) => setPicks((ps) => ps.map((x) => (x.id === id ? { ...x, ...v } : x)));
  return (
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
              <Pressable accessibilityRole="button" accessibilityLabel={`${x.name} 빼기`} onPress={() => setPicks((ps) => ps.filter((p) => p.id !== x.id))} hitSlop={8}>
                <Text style={{ color: c.danger, fontSize: 20 }}>×</Text>
              </Pressable>
            </View>
          ))
        )}
      </Card>
    </Field>
  );
}

/** 찾기 목록 — 누르면 고르고, 다시 누르면 뺀다. exerciseOnly 면 드릴 칸 없이(수행일지는 운동 세트만) */
export function LibraryBrowser({
  lib,
  picks,
  setPicks,
  exerciseOnly,
  max = HOMEWORK_ITEMS_MAX,
  c,
}: {
  lib: Library;
  picks: Pick[];
  setPicks: (f: (ps: Pick[]) => Pick[]) => void;
  exerciseOnly?: boolean;
  max?: number;
  c: Palette;
}) {
  const [picked, setKind] = useState<PickKind>('exercise');
  const kind = exerciseOnly ? 'exercise' : picked;
  const [q, setQ] = useState('');
  const toggle = (id: string, name: string) =>
    setPicks((ps) =>
      ps.some((x) => x.id === id) ? ps.filter((x) => x.id !== id) : ps.length >= max ? ps : [...ps, { id, kind, name, sets: '', reps: '' }]
    );
  const list = kind === 'exercise' ? lib.exercises : lib.drills;
  const word = q.trim();
  const shown = list.filter((x) => !word || x.name.includes(word) || x.category.includes(word)).slice(0, SHOWN);
  return (
    <View style={{ gap: 8 }}>
      {exerciseOnly ? null : <Segmented label="종류" options={KINDS} value={kind} onChange={setKind} />}
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
            const on = picks.some((p) => p.id === x.id);
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
  );
}

/** 작은 숫자 칸(세트 · 회 · kg …) */
export function Num({ value, onChange, unit, max, decimal, c }: { value: string; onChange: (v: string) => void; unit: string; max: number; decimal?: boolean; c: Palette }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
      <TextInput
        value={value}
        onChangeText={(t) => onChange((decimal ? t.replace(/[^\d.]/g, '') : t.replace(/\D/g, '')).slice(0, max))}
        placeholder="-"
        placeholderTextColor={c.muted}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        accessibilityLabel={unit}
        style={[TYPE.numInline, { color: c.ink, textAlign: 'right', minWidth: 28, paddingVertical: 6 }]}
      />
      <Text style={[TYPE.sub, { color: c.muted }]}>{unit}</Text>
    </View>
  );
}

export const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 6 },
  search: { minHeight: 44, borderRadius: 12, paddingHorizontal: 14, fontSize: 17 },
});
