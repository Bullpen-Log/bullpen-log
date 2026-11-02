import * as Haptics from 'expo-haptics';
import { type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { READABLE } from '~/lib/layout';
import { type Palette, usePalette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';

/** 트레이닝 첫 설정과 다시 설정의 같은 질문 틀. */
export function TrainingFrame({
  progress,
  counter,
  progressLabel,
  eyebrow,
  title,
  desc,
  why,
  problem,
  back,
  next,
  children,
}: {
  progress: number;
  counter: string;
  progressLabel: string;
  eyebrow: string;
  title: string;
  desc: string;
  why?: string;
  problem: string | null;
  back: { label: string; onPress: () => void; disabled?: boolean };
  next: { label: string; onPress: () => void; disabled?: boolean };
  children: ReactNode;
}) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const navy = '#132c50';
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <View style={{ paddingTop: inset.top + 9, paddingHorizontal: 20 }}>
        <View style={st.brandRow}>
          <View style={[st.brandMark, { backgroundColor: navy }]}><Text style={st.brandLetter}>S</Text></View>
          <Text style={[st.brand, { color: c.ink }]}>SINKER</Text>
          <Text style={[st.brandTag, { color: c.muted }]}>TRAINING</Text>
        </View>
        <View style={st.progressLabels}>
          <Text style={[st.progressLabel, { color: c.muted }]}>{progressLabel}</Text>
          <Text style={[st.progressLabel, { color: c.muted }]}>{counter}</Text>
        </View>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }} style={[st.track, { backgroundColor: c.chip }]}>
          <View style={[st.fill, { width: `${Math.round(progress * 100)}%`, backgroundColor: c.link }]} />
        </View>
      </View>
      <ScrollView contentContainerStyle={[st.content, READABLE]} keyboardShouldPersistTaps="handled">
        <View style={st.heading}>
          <Text style={[st.eyebrow, { color: c.link }]}>{eyebrow}</Text>
          <Text accessibilityRole="header" style={[st.title, { color: c.ink }]}>{title}</Text>
          <Text style={[st.desc, { color: c.muted }]}>{desc}</Text>
        </View>
        {children}
        {why ? (
          <View style={[st.why, { borderTopColor: c.line }]}>
            <Icon name="info" size={16} color={c.link} />
            <Text style={[st.whyText, { color: c.muted }]}>{why}</Text>
          </View>
        ) : null}
        {problem ? <Text accessibilityLiveRegion="polite" style={[st.problem, { color: c.danger }]}>{problem}</Text> : null}
      </ScrollView>
      <View style={[st.footer, { paddingBottom: Math.max(16, inset.bottom), borderTopColor: c.line, backgroundColor: c.page }]}>
        <Press accessibilityRole="button" accessibilityState={{ disabled: back.disabled }} disabled={back.disabled} onPress={back.onPress} style={st.back}>
          <Text style={[st.backText, { color: c.muted }]}>{back.label}</Text>
        </Press>
        <Press
          accessibilityRole="button"
          accessibilityState={{ disabled: next.disabled }}
          disabled={next.disabled}
          onPress={() => { void Haptics.selectionAsync(); next.onPress(); }}
          style={[st.next, { backgroundColor: navy, opacity: next.disabled ? 0.42 : 1 }]}
        >
          <Text style={st.nextText}>{next.label}</Text>
        </Press>
      </View>
    </View>
  );
}

/** 각 질문의 선택지는 설명을 포함하는 한 줄 카드다. */
export function TrainingOption({ label, hint, on, invalid, onPress, c }: { label: string; hint?: string; on: boolean; invalid: boolean; onPress: () => void; c: Palette }) {
  return (
    <Press
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      onPress={() => { void Haptics.selectionAsync(); onPress(); }}
      style={[st.option, { borderColor: on ? c.link : invalid ? c.danger : c.line, borderWidth: on ? 2 : 1, backgroundColor: on ? c.skyTint : c.card }]}
    >
      <View style={st.optionCopy}>
        <Text style={[st.optionLabel, { color: c.ink }]}>{label}</Text>
        {hint ? <Text style={[st.optionHint, { color: c.muted }]}>{hint}</Text> : null}
      </View>
      <View style={[st.radio, { borderColor: on ? c.link : c.line }]}>
        {on ? <View style={[st.radioDot, { backgroundColor: c.link }]} /> : null}
      </View>
    </Press>
  );
}

const st = StyleSheet.create({
  brandRow: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandMark: { width: 25, height: 25, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  brandLetter: { color: '#fff', fontSize: 15, fontWeight: '800', fontStyle: 'italic' },
  brand: { fontSize: 13, fontWeight: '800', letterSpacing: 2.1 },
  brandTag: { marginLeft: 'auto', fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  progressLabels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 9 },
  progressLabel: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  content: { paddingHorizontal: 20, paddingTop: 27, paddingBottom: 28, gap: 20, flexGrow: 1 },
  heading: { gap: 6 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.3 },
  title: { fontSize: 25, lineHeight: 32, fontWeight: '800', letterSpacing: -0.7, marginTop: 5 },
  desc: { fontSize: 15, lineHeight: 22, marginTop: 1 },
  why: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 13, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  whyText: { flex: 1, fontSize: 13, lineHeight: 19 },
  problem: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { minWidth: 70, minHeight: 48, justifyContent: 'center' },
  backText: { fontSize: 16, fontWeight: '600' },
  next: { flex: 1, minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  nextText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  option: { minHeight: 64, borderRadius: 15, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionCopy: { flex: 1, gap: 2 },
  optionLabel: { fontSize: 17, fontWeight: '700' },
  optionHint: { fontSize: 14, lineHeight: 19 },
  radio: { width: 18, height: 18, borderWidth: 1.5, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
});
