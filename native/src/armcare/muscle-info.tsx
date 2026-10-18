import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { areaOfMuscle, muscleInfo, type ArmcareMuscle } from '@/lib/armcare/anatomy';
import { visibleChips } from '@/lib/armcare/chips';
import { MUSCLE_DETAILS } from '@/lib/armcare/details';
import type { Palette } from '~/lib/ui';
import { Sheet } from '~/workout/sheets';

/**
 * 근육 칩 — 웹 components/muscle-chips.tsx: 맨 앞(가장 크게 쓰는 근육, 또는 highlight)만 진하게, max 넘으면 '+N'(누르면 다 펼침).
 * 칩을 누르면 그 근육 설명 창(웹 armcare-info-body.tsx MuscleInfo 의 글 — 어떤 근육 · 던질 때 · 왜 중요한가 · 이렇게 키워요 · 붙는 곳).
 * 웹 창의 3D 근육 그림은 앱에 없다(글만). 설명이 없는 근육 이름이면 글자 칩.
 */
export function MuscleChips({ muscles, highlight, max, c }: { muscles: string[]; highlight?: readonly string[]; max?: number; c: Palette }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  if (muscles.length === 0) return null;
  const shown = all ? muscles : visibleChips(muscles, highlight, max);
  const hidden = muscles.length - shown.length;
  return (
    <View style={st.wrap}>
      {shown.map((m) => {
        const strong = highlight ? highlight.includes(m) : m === muscles[0];
        const known = !!MUSCLE_DETAILS[m as ArmcareMuscle];
        return (
          <Pressable
            key={m}
            accessibilityRole={known ? 'button' : 'text'}
            accessibilityLabel={known ? `${m}, 위치와 설명 보기` : m}
            disabled={!known}
            hitSlop={{ top: 8, bottom: 8 }}
            onPress={() => {
              void Haptics.selectionAsync();
              setOpen(m);
            }}
            style={[st.chip, { backgroundColor: strong ? c.skyTint : c.chip }]}
          >
            <Text style={{ color: strong ? c.skyStrong : c.muted, fontSize: 12, fontWeight: '500' }}>
              {m}
              {known ? <Text style={{ opacity: 0.6 }}> ›</Text> : null}
            </Text>
          </Pressable>
        );
      })}
      {hidden > 0 ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`근육 ${hidden}개 더 보기`} onPress={() => setAll(true)} style={[st.chip, { backgroundColor: c.chip }]}>
          <Text style={{ color: c.muted, fontSize: 12, fontWeight: '500' }}>+{hidden}</Text>
        </Pressable>
      ) : null}
      <MuscleSheet name={open} muscles={muscles} onPick={setOpen} onClose={() => setOpen(null)} c={c} />
    </View>
  );
}

function MuscleSheet({ name, muscles, onPick, onClose, c }: { name: string | null; muscles: string[]; onPick: (m: string) => void; onClose: () => void; c: Palette }) {
  const info = name ? muscleInfo(name) : null;
  const area = name ? areaOfMuscle(name) : null;
  const d = name ? MUSCLE_DETAILS[name as ArmcareMuscle] : null;
  const known = muscles.filter((m) => MUSCLE_DETAILS[m as ArmcareMuscle]);
  return (
    <Sheet open={!!name && !!d} onClose={onClose} title={name ?? ''} description={[area?.label, info?.does].filter(Boolean).join(' · ')} c={c}>
      {known.length > 1 ? (
        <View style={[st.wrap, { marginBottom: 16 }]}>
          {known.map((m) => {
            const on = m === name;
            return (
              <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onPick(m)} style={[st.tab, { backgroundColor: on ? c.sky : c.chip }]}>
                <Text style={{ color: on ? '#fff' : c.ink, fontSize: 13, fontWeight: '600' }}>{m}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {d ? (
        <View style={{ gap: 18 }}>
          {(
            [
              ['어떤 근육인가요', d.what],
              ['던질 때', d.pitching],
              ['왜 중요한가요', d.why],
              ['이렇게 키워요', d.train],
            ] as const
          ).map(([title, body]) => (
            <View key={title} style={{ gap: 6 }}>
              <Text style={{ color: c.ink, fontSize: 15, fontWeight: '700' }}>{title}</Text>
              <Text style={{ color: c.ink, opacity: 0.85, fontSize: 15, lineHeight: 23 }}>{body}</Text>
            </View>
          ))}
          {info ? (
            <View style={[st.at, { backgroundColor: c.card }]}>
              <Text style={{ color: c.skyStrong, fontSize: 13, fontWeight: '700' }}>붙는 곳</Text>
              <Text style={{ flex: 1, color: c.ink, opacity: 0.8, fontSize: 13, lineHeight: 19 }}>{info.at}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

const st = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: { minHeight: 24, borderRadius: 12, paddingHorizontal: 8, justifyContent: 'center' },
  tab: { minHeight: 34, borderRadius: 17, paddingHorizontal: 12, justifyContent: 'center' },
  at: { flexDirection: 'row', gap: 12, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
});
