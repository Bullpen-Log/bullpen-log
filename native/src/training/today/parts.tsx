import { SymbolView, type SFSymbol } from 'expo-symbols';
import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Palette } from '~/lib/ui';

/** 트레이닝 '운동' 화면(native/src/app/training-today.tsx)의 작은 조각 · 모양 — 웹 app/(app)/training/* 의 카드 모양을 앱 모양으로 */

/**
 * 화면이 조각에 넘기는 길 — 다시 읽기 · 운동 판 열기 · 체크인 · 웹으로 보내기. 조각마다 따로 rpc 를 부르지만 redirect · 다시 읽기는 화면 하나가 맡는다.
 */
export type TodayActions = {
  reload: () => Promise<void>;
  /** 운동 판 열기 — program 이면 근력 프로그램 판 */
  start: (program: boolean) => void;
  starting: boolean;
  checkin: () => void;
  /** 일정 만들기(웹 폼과 같은 칸 줄) — 끝나면 다시 읽는다. 못 만들었으면 그 까닭 글 */
  generate: (fields: [string, string][]) => Promise<string | null>;
  /** 화면을 닫고 웹을 그 주소로 */
  web: (href: string) => void;
};

export { useWeightUnit } from '~/lib/weight-unit';

export function Card({ c, children, tone }: { c: Palette; children: ReactNode; tone?: 'warn' | 'sky' | 'done' }) {
  return (
    <View
      style={[
        s.card,
        { backgroundColor: tone === 'warn' ? c.warnBg : c.card },
        tone === 'done' && { borderWidth: 1, borderColor: c.sky },
      ]}
    >
      {children}
    </View>
  );
}

/** 큰 파란 단추(웹 Button size lg) — busy 면 돌개 + 글 */
export function BigButton({
  c,
  label,
  onPress,
  busy = false,
  icon,
  disabled = false,
}: {
  c: Palette;
  label: string;
  onPress: () => void;
  busy?: boolean;
  icon?: SFSymbol;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy || disabled}
      onPress={onPress}
      style={({ pressed }) => [s.big, { backgroundColor: c.sky }, (pressed || busy || disabled) && { opacity: 0.6 }]}
    >
      {busy ? <ActivityIndicator color="#fff" /> : icon ? <SymbolView name={icon} size={16} tintColor="#fff" /> : null}
      <Text style={s.bigText}>{label}</Text>
    </Pressable>
  );
}

/** 글 단추 한 줄(파란 글 · ›) — 웹으로 보내는 칸 · 접이 */
export function LinkRow({ c, label, onPress, danger = false }: { c: Palette; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.linkRow, pressed && { opacity: 0.6 }]}>
      <Text style={[s.bodyBold, { flex: 1, color: danger ? c.danger : c.sky }]}>{label}</Text>
      {danger ? null : <Text style={{ color: c.muted, fontSize: 18 }}>›</Text>}
    </Pressable>
  );
}

/** 웹으로 가는 줄들을 한 상자에 — 앱이 아직 안 그리는 칸(운동 추가 · 조건 바꾸기 · 설정 …) */
export function WebRows({ c, rows }: { c: Palette; rows: { label: string; href: string; onPress: (href: string) => void }[] }) {
  if (rows.length === 0) return null;
  return (
    <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, paddingVertical: 4, gap: 0 }]}>
      {rows.map((r, i) => (
        <View key={r.label} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
          <LinkRow c={c} label={r.label} onPress={() => r.onPress(r.href)} />
        </View>
      ))}
    </View>
  );
}

/** 고르는 칩(웹 Chip) */
export function Chip({ c, label, on, onPress }: { c: Palette; label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[s.chip, { backgroundColor: on ? c.sky : c.chip }]}
    >
      <Text style={[s.bodyBold, { color: on ? '#fff' : c.ink }]}>{label}</Text>
    </Pressable>
  );
}

export const s = StyleSheet.create({
  fill: { flex: 1 },
  centerBox: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headTitle: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  card: { borderRadius: 20, padding: 16, gap: 10 },
  big: { minHeight: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20 },
  bigText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  pill: { minHeight: 48, borderRadius: 24, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  linkRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { minHeight: 40, borderRadius: 20, paddingHorizontal: 14, justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  cardTitle: { fontSize: 17, fontWeight: '700', lineHeight: 23 },
  tiny: { fontSize: 12, lineHeight: 16 },
  small: { fontSize: 13, lineHeight: 18 },
  smallBold: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  body: { fontSize: 15, lineHeight: 21 },
  bodyBold: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  num: { fontVariant: ['tabular-nums'] },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row' },
  box: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
});
