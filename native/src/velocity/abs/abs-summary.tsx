import { StyleSheet, Text, View } from 'react-native';
import type { AbsAnalysis } from '@/lib/abs/analysis';

/**
 * 세션 저장 창의 ABS 칸(앱) — 웹 components/abs/abs-summary.tsx 와 같은 글: 스트라이크 비율 · 9칸 히트맵(통과 수) · 타격 · 판정 없음 ·
 * 존 밖 볼 · 경계 수 · 오차 띠 안내 한 줄. 밝은 시트 바탕 기준 색.
 */
export function AbsSummary({ items }: { items: { id: number; abs: AbsAnalysis }[] }) {
  if (!items.length) return null;
  const judged = items.filter((x) => x.abs.verdict);
  const strikes = judged.filter((x) => x.abs.verdict!.call === 'strike').length;
  const contacts = items.filter((x) => x.abs.event === 'contact').length;
  const none = items.length - judged.length - contacts;
  const borderline = judged.filter((x) => x.abs.verdict!.borderline).length;
  const cells = Array.from({ length: 9 }, () => 0);
  let outside = 0;
  for (const x of judged) {
    const c = x.abs.verdict!.cell;
    if (c == null) outside++;
    else cells[c - 1]++;
  }
  const max = Math.max(1, ...cells);
  const bands = items[0]?.abs.bands;
  return (
    <View style={st.box}>
      <View style={st.head}>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>ABS 판정</Text>
          <Text style={st.sub}>
            {judged.length}구 판정 · 스트라이크 {strikes} · 볼 {judged.length - strikes}
            {contacts ? ` · 타격 ${contacts}` : ''}
            {none ? ` · 판정 없음 ${none}` : ''}
          </Text>
        </View>
        <Text style={st.pct}>
          {judged.length ? Math.round((100 * strikes) / judged.length) : 0}
          <Text style={st.pctUnit}>%</Text>
        </Text>
      </View>
      <View style={st.body}>
        <View style={st.grid} accessibilityLabel="코스별 통과 수">
          {cells.map((n, i) => (
            <View key={i} style={[st.cell, { backgroundColor: n ? `rgba(10,132,214,${0.25 + (0.75 * n) / max})` : '#fff' }]}>
              <Text style={[st.cellText, !n && { color: 'transparent' }]}>{n || ''}</Text>
            </View>
          ))}
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={st.line}>존 밖 볼 {outside}</Text>
          <Text style={st.line}>경계(띠 안) {borderline}</Text>
          {bands ? (
            <Text style={st.note}>
              좌우 ±{bands.lateralCm}cm · 높이 ±{bands.verticalCm}cm 안은 경계로 표시해요. 높이는 참고용이에요.
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const CELL = 32;
const st = StyleSheet.create({
  box: { borderRadius: 16, backgroundColor: '#fff', padding: 14, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 16, fontWeight: '700', color: '#1d1d1f' },
  sub: { marginTop: 2, fontSize: 13, color: '#6e6e73' },
  pct: { fontSize: 30, fontFamily: 'ui-rounded', fontWeight: '700', color: '#1d1d1f', fontVariant: ['tabular-nums'] },
  pctUnit: { fontSize: 15, color: '#6e6e73' },
  body: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  grid: { width: CELL * 3 + 4 * 2 + 8, padding: 4, gap: 4, borderRadius: 12, backgroundColor: '#e5e5ea', flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL, height: CELL, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  cellText: { color: '#fff', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  line: { fontSize: 14, color: '#6e6e73' },
  note: { fontSize: 12, lineHeight: 16, color: '#8e8e93' },
});
