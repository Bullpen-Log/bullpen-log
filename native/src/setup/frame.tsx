import * as Haptics from 'expo-haptics';
import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Palette } from '~/lib/ui';

/**
 * 첫 설정(앱 화면 — native/src/app/setup)의 틀 — 웹 components/onboarding/step-card.tsx 와 같은 차례: 위에 진행 막대 · n/전체,
 * 제목 · 설명, 가운데 한 질문, 아래 [이전 | 다음]. 한 화면에 한 질문(웹과 같은 규칙).
 */
export function StepFrame({
  progress,
  counter,
  title,
  desc,
  problem,
  back,
  next,
  children,
  c,
}: {
  progress: number;
  counter: string;
  title: string;
  desc?: string;
  problem: string | null;
  back: { label: string; onPress: () => void; disabled?: boolean };
  next: { label: string; onPress: () => void; disabled?: boolean };
  children: ReactNode;
  c: Palette;
}) {
  const inset = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <View style={{ paddingTop: inset.top + 12, paddingHorizontal: 20, gap: 8 }}>
        <View style={[st.track, { backgroundColor: c.chip }]}>
          <View style={[st.fill, { width: `${Math.round(progress * 100)}%`, backgroundColor: c.sky }]} />
        </View>
        <Text style={{ color: c.muted, fontSize: 13, fontVariant: ['tabular-nums'] }}>{counter}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="header" style={{ color: c.ink, fontSize: 26, fontWeight: '700', lineHeight: 33 }}>
            {title}
          </Text>
          {desc ? <Text style={{ color: c.muted, fontSize: 15, lineHeight: 22 }}>{desc}</Text> : null}
        </View>
        {children}
        {problem ? (
          <Text accessibilityLiveRegion="polite" style={{ color: c.danger, fontSize: 14, fontWeight: '600' }}>
            {problem}
          </Text>
        ) : null}
      </ScrollView>
      <View style={[st.foot, { paddingBottom: Math.max(16, inset.bottom), borderTopColor: c.line, backgroundColor: c.page }]}>
        <Pressable accessibilityRole="button" onPress={back.onPress} disabled={back.disabled} hitSlop={8} style={st.back}>
          <Text style={{ color: c.muted, fontSize: 16, fontWeight: '600', opacity: back.disabled ? 0.4 : 1 }}>{back.label}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void Haptics.selectionAsync();
            next.onPress();
          }}
          disabled={next.disabled}
          style={({ pressed }) => [st.next, { backgroundColor: c.sky, opacity: next.disabled ? 0.5 : pressed ? 0.85 : 1 }]}
        >
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>{next.label}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

/** 고르는 칩 묶음 — 하나만(웹 components/onboarding/choices.tsx Chips). 막힌 칸이면 빨간 테두리 */
export function ChoiceChips({
  legend,
  hint,
  options,
  value,
  onChange,
  invalid,
  c,
}: {
  legend?: string;
  hint?: string;
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (v: string) => void;
  invalid?: boolean;
  c: Palette;
}) {
  return (
    <View style={{ gap: 8 }}>
      {legend ? <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>{legend}</Text> : null}
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => {
          const on = value === o.value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => {
                void Haptics.selectionAsync();
                onChange(o.value);
              }}
              style={[
                st.chip,
                { backgroundColor: on ? c.sky : c.card, borderColor: invalid && !on ? c.danger : on ? c.sky : c.line },
              ]}
            >
              <Text style={{ color: on ? '#fff' : c.ink, fontSize: 16, fontWeight: '600' }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {hint ? <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>{hint}</Text> : null}
    </View>
  );
}

/** 요약 줄 — 이름 · 값 */
export function SummaryRows({ rows, c }: { rows: { label: string; value: string }[]; c: Palette }) {
  return (
    <View style={{ backgroundColor: c.card, borderRadius: 16, paddingHorizontal: 16 }}>
      {rows.map((r, i) => (
        <View key={r.label} style={[st.sumRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
          <Text style={{ color: c.muted, fontSize: 15 }}>{r.label}</Text>
          <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

/** 강조 카드 — '평소 하루 부하' 같은 큰 숫자 한 장 */
export function BigNumber({ label, value, unit, note, c }: { label: string; value: string; unit?: string; note?: string; c: Palette }) {
  return (
    <View style={[st.big, { borderColor: c.sky + '40', backgroundColor: c.sky + '0d' }]}>
      <Text style={{ color: c.sky, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: c.ink, fontSize: 30, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
        {value}
        {unit ? <Text style={{ color: c.muted, fontSize: 13, fontWeight: '400' }}> {unit}</Text> : null}
      </Text>
      {note ? <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>{note}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  back: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 },
  next: { minWidth: 120, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  chip: { minHeight: 44, minWidth: 52, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingVertical: 12 },
  big: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
});
