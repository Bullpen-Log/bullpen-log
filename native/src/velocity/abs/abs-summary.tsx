import { StyleSheet, Text, View } from 'react-native';
import type { AbsAnalysis } from '@/lib/abs/analysis';
import { tallyAbs } from './present';

/**
 * 세션 저장 창의 ABS 칸(앱) — 스트라이크 비율 · 9칸 히트맵(통과 수) · 타격 · 판정 없음 · 존 밖 볼 · 경계 수 · 오차 띠 안내 한 줄. 밝은 시트 바탕 기준 색.
 * 2026-10-29: 셈은 present.ts tallyAbs — 비율의 분모는 판정(S · B)이 난 공만(타격 · 판정 없음은 따로), 판정 0구면 0% 대신 '—',
 * 존 밖 볼은 볼이면서 칸이 없는 공만(걸친 스트라이크까지 세던 것). 세션의 모든 공을 받는다 — analysis.abs 가 없는 공은 판정 없음.
 */
export function AbsSummary({ items }: { items: readonly (AbsAnalysis | null | undefined)[] }) {
  if (!items.length) return null;
  const t = tallyAbs(items);
  const max = Math.max(1, ...t.cells);
  const bands = items.find((x) => x)?.bands;
  return (
    <View style={st.box}>
      <View style={st.head}>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>ABS 판정</Text>
          <Text style={st.sub}>
            {t.judged ? `${t.judged}구 판정 · 스트라이크 ${t.strikes} · 볼 ${t.balls}` : '판정된 공 없음'}
            {t.contacts ? ` · 타격 ${t.contacts}` : ''}
            {t.none ? ` · 판정 없음 ${t.none}` : ''}
          </Text>
        </View>
        <Text style={st.pct} accessibilityLabel={t.strikePct == null ? '스트라이크 비율 없음' : `스트라이크 비율 ${t.strikePct}퍼센트`}>
          {t.strikePct == null ? '—' : t.strikePct}
          {t.strikePct == null ? null : <Text style={st.pctUnit}>%</Text>}
        </Text>
      </View>
      {t.judged ? (
        <View style={st.body}>
          <View style={st.grid} accessibilityLabel="코스별 통과 수">
            {t.cells.map((n, i) => (
              <View key={i} style={[st.cell, { backgroundColor: n ? `rgba(10,132,214,${0.25 + (0.75 * n) / max})` : '#fff' }]}>
                <Text style={[st.cellText, !n && { color: 'transparent' }]}>{n || ''}</Text>
              </View>
            ))}
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={st.line}>존 밖 볼 {t.outsideBalls}</Text>
            <Text style={st.line}>경계(띠 안) {t.borderline}</Text>
            {bands ? (
              <Text style={st.note}>
                좌우 ±{bands.lateralCm}cm · 높이 ±{bands.verticalCm}cm 안은 경계로 표시해요. 높이는 참고용이에요.
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
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
