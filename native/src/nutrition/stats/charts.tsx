import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { type GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Polygon, Polyline, Text as SvgText } from 'react-native-svg';
import type { DaySummary, WeightPoint } from '@/lib/nutrition/load';
import { kcalText } from '@/lib/nutrition/meta';
import { fmtRate, type Trend } from '@/lib/nutrition/weight-goal';
import { toWeight, type WeightUnit } from '@/lib/units';
import type { Palette } from '~/lib/ui';

/**
 * 목표 · 통계 화면의 그래프 둘 — 웹 app/(app)/nutrition/charts.tsx 의 WeekChart(7일 칼로리) · WeightTrend(8주 체중)를 옮겼다.
 * 범위 · 흐름선 · 흔들림 띠 · 목표 점선 셈은 웹과 같다. 웹은 막대를 누르면 그날로 가지만, 앱은 그날 숫자를 밑 줄에 보인다(날짜 고르기는 영양 탭).
 */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const weekday = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00.000Z`).getUTCDay()];
const md = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;

/** 막대 = 먹은 칼로리, 가로 짧은 선 = 그날 목표. 막대를 누르면 그날 숫자 */
export function WeekChart({ week, selected, c }: { week: DaySummary[]; selected: string; c: Palette }) {
  const [pick, setPick] = useState<string | null>(null);
  const max = Math.max(1, ...week.map((d) => Math.max(d.kcal, d.target)));
  const logged = week.filter((d) => d.kcal > 0);
  const avg = (key: 'kcal' | 'protein') => (logged.length ? Math.round(logged.reduce((s, d) => s + d[key], 0) / logged.length) : 0);
  const picked = week.find((d) => d.date === pick) ?? null;
  return (
    <View style={{ gap: 8 }}>
      <View style={st.bars}>
        {week.map((d) => {
          const on = d.date === (pick ?? selected);
          return (
            <Pressable
              key={d.date}
              accessibilityRole="button"
              accessibilityLabel={`${md(d.date)}, ${kcalText(d.kcal)}kcal 먹음, 목표 ${kcalText(d.target)}kcal`}
              onPress={() => {
                void Haptics.selectionAsync();
                setPick(pick === d.date ? null : d.date);
              }}
              style={st.barSlot}
            >
              <View
                style={{
                  height: `${(d.kcal / max) * 100}%`,
                  borderTopLeftRadius: 6,
                  borderTopRightRadius: 6,
                  backgroundColor: on ? (d.kcal > d.target ? c.warn : c.sky) : c.sky + '4d',
                }}
              />
              <View style={[st.target, { bottom: `${(d.target / max) * 100}%`, backgroundColor: c.ink + '59' }]} />
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {week.map((d) => (
          <Text
            key={d.date}
            style={{ flex: 1, textAlign: 'center', fontSize: 12, color: d.date === (pick ?? selected) ? c.ink : c.muted, fontWeight: d.date === (pick ?? selected) ? '600' : '400' }}
          >
            {weekday(d.date)}
          </Text>
        ))}
      </View>
      <Text style={[st.caption, { color: c.muted }]}>
        {picked
          ? `${md(picked.date)} · ${kcalText(picked.kcal)} / ${kcalText(picked.target)}kcal · 단백질 ${picked.protein}g`
          : logged.length === 0
            ? '아직 이번 주 기록이 없어요.'
            : `기록한 ${logged.length}일 평균 ${kcalText(avg('kcal'))}kcal · 단백질 ${avg('protein')}g`}
      </Text>
    </View>
  );
}

/**
 * 8주 체중 — 적은 값(옅은 선)과 그 흐름(굵은 선) · 하루 흔들림 띠 · 목표 체중(점선). 흐름에서 뺀 값은 빈 점으로 가장자리에 남긴다.
 * 숫자에 색을 입히지 않는다(웹과 같다 — 판정은 카드의 글이 한다). 손가락으로 훑으면 그 무렵 적은 값.
 */
export function WeightTrend({
  weights,
  unit,
  trend,
  targetKg,
  c,
}: {
  weights: WeightPoint[];
  unit: WeightUnit;
  trend: Trend;
  targetKg: number | null;
  c: Palette;
}) {
  const [W, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const last = useRef<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  if (weights.length < 2) {
    return <Text style={[st.caption, { color: c.muted }]}>체중을 이틀 이상 적으면 8주 흐름이 여기 그려져요.</Text>;
  }

  const H = 72;
  const PAD = 6;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const show = (kg: number) => toWeight(kg, unit);
  const values = weights.map((w) => show(w.kg));
  const line = trend.ok ? { from: show(trend.startKg), to: show(trend.currentKg), band: show(trend.sigma) } : null;
  const target = targetKg === null ? null : show(targetKg);

  /* 세로 범위 — 흐름에 넣은 값과 흐름만(뺀 오타 한 점이 그래프를 다 차지하지 않게), 목표는 가까울 때만(웹과 같다) */
  const dropped = new Set(trend.ok ? trend.dropped : []);
  const kept = values.filter((_, i) => !dropped.has(weights[i].date));
  const near = unit === 'kg' ? 2 : 4;
  let lo = Math.min(...kept, ...(line ? [line.from, line.to] : []));
  let hi = Math.max(...kept, ...(line ? [line.from, line.to] : []));
  const targetIn = target !== null && target >= lo - near && target <= hi + near;
  const targetAbove = target !== null && target > hi;
  if (targetIn && target !== null) {
    lo = Math.min(lo, target);
    hi = Math.max(hi, target);
  }
  const span = Math.max(hi - lo, unit === 'kg' ? 1 : 2);
  const mid = (lo + hi) / 2;
  const first = Date.parse(`${weights[0].date}T00:00:00.000Z`);
  const lastT = Date.parse(`${weights.at(-1)!.date}T00:00:00.000Z`);
  const x = (date: string) => PAD + ((Date.parse(`${date}T00:00:00.000Z`) - first) / Math.max(1, lastT - first)) * (W - PAD * 2);
  const y = (v: number) => H / 2 - ((v - mid) / span) * (H - PAD * 2);
  const clampY = (v: number) => Math.min(H - 3, Math.max(3, y(v)));

  const points = weights.flatMap((w, i) => (dropped.has(w.date) ? [] : [`${x(w.date).toFixed(1)},${y(values[i]).toFixed(1)}`]));
  const lastIndex = weights.length - 1;
  const tx = trend.ok ? [x(trend.fromDate), x(trend.toDate)] : null;
  const targetY = target === null ? null : targetIn ? y(target) : targetAbove ? 5 : H - 5;
  const targetTextY =
    targetY === null
      ? 0
      : !targetIn
        ? targetY + 3.5
        : target !== null && target >= mid
          ? targetY < 12
            ? targetY + 11
            : targetY - 4
          : targetY > H - 12
            ? targetY - 4
            : targetY + 11;
  const change = line ? r1(line.to - line.from) : 0;
  const day = (date: string) => date.slice(5).replace('-', '/');

  /* 손가락 자리 → 가장 가까운 적은 날 */
  const pick = (e: GestureResponderEvent) => {
    const vx = e.nativeEvent.locationX;
    let best = 0;
    weights.forEach((wt, i) => {
      if (Math.abs(x(wt.date) - vx) < Math.abs(x(weights[best].date) - vx)) best = i;
    });
    clearTimeout(hideTimer.current);
    if (last.current !== best) void Haptics.selectionAsync();
    last.current = best;
    setHover(best);
  };
  const release = () => {
    hideTimer.current = setTimeout(() => {
      last.current = null;
      setHover(null);
    }, 1500);
  };
  const picked = hover == null ? null : weights[hover];

  return (
    <View style={{ gap: 4 }}>
      <View
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
        onResponderRelease={release}
        onResponderTerminate={release}
        accessibilityRole="image"
        accessibilityLabel={[
          trend.ok && line
            ? `체중 흐름 ${r1(line.from)}${unit}에서 ${r1(line.to)}${unit}, ${fmtRate(trend.rate20, unit)}`
            : `체중 기록 ${r1(values[0])}${unit}에서 ${r1(values[lastIndex])}${unit}`,
          target !== null ? `목표 ${r1(target)}${unit}` : '',
        ]
          .filter(Boolean)
          .join(', ')}
        style={{ height: H }}
      >
        {W > 0 ? (
          <Svg width={W} height={H}>
            {target !== null && targetY !== null ? (
              <>
                {targetIn ? (
                  <Line x1={PAD} x2={W - PAD} y1={targetY} y2={targetY} stroke={c.muted} strokeWidth={1} strokeDasharray="2 3" />
                ) : (
                  <Path
                    d={targetAbove ? `M${PAD} ${targetY + 2} l3.5 -4 l3.5 4` : `M${PAD} ${targetY - 2} l3.5 4 l3.5 -4`}
                    fill="none"
                    stroke={c.muted}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                <SvgText x={targetIn ? PAD : PAD + 11} y={targetTextY} fill={c.muted} fontSize={11} fontWeight="600">
                  목표 {r1(target)}
                </SvgText>
              </>
            ) : null}
            {line && tx ? (
              <Polygon
                points={[
                  `${tx[0].toFixed(1)},${Math.max(0, y(line.from + line.band)).toFixed(1)}`,
                  `${tx[1].toFixed(1)},${Math.max(0, y(line.to + line.band)).toFixed(1)}`,
                  `${tx[1].toFixed(1)},${Math.min(H, y(line.to - line.band)).toFixed(1)}`,
                  `${tx[0].toFixed(1)},${Math.min(H, y(line.from - line.band)).toFixed(1)}`,
                ].join(' ')}
                fill={c.sky}
                fillOpacity={0.1}
              />
            ) : null}
            <Polyline
              points={points.join(' ')}
              fill="none"
              stroke={c.sky}
              strokeWidth={line ? 1.5 : 2}
              strokeOpacity={line ? 0.35 : 1}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {weights.map((w, i) =>
              dropped.has(w.date) ? (
                <Circle key={w.date} cx={x(w.date)} cy={clampY(values[i])} r={2.5} fill={c.card} stroke={c.muted} strokeWidth={1.5} />
              ) : i === lastIndex || !line ? (
                <Circle
                  key={w.date}
                  cx={x(w.date)}
                  cy={y(values[i])}
                  r={i === lastIndex ? 3.5 : 2}
                  fill={i === lastIndex ? c.sky : c.card}
                  stroke={c.sky}
                  strokeWidth={1.5}
                />
              ) : null
            )}
            {picked && hover != null ? (
              <>
                <Line x1={x(picked.date)} x2={x(picked.date)} y1={0} y2={H} stroke={c.ink} strokeOpacity={0.3} strokeWidth={1} />
                <Circle cx={x(picked.date)} cy={clampY(values[hover])} r={4} fill={c.sky} stroke={c.card} strokeWidth={1.5} />
              </>
            ) : null}
            {line && tx ? <Line x1={tx[0]} y1={y(line.from)} x2={tx[1]} y2={y(line.to)} stroke={c.sky} strokeWidth={2.5} strokeLinecap="round" /> : null}
          </Svg>
        ) : null}
      </View>
      <View style={st.capRow}>
        {picked && hover != null ? (
          <>
            <Text style={[st.caption, { color: c.muted }]}>{md(picked.date)}</Text>
            <Text style={[st.caption, { color: c.sky, fontWeight: '600' }]}>
              {r1(values[hover])}
              {unit}
              {dropped.has(picked.date) ? <Text style={{ color: c.muted, fontWeight: '400' }}> · 흐름 계산에서 뺀 값</Text> : null}
            </Text>
          </>
        ) : trend.ok && line ? (
          <>
            <Text style={[st.caption, { color: c.muted }]}>
              {day(trend.fromDate)} · {r1(line.from)}
              {unit}
            </Text>
            <Text style={[st.caption, { color: c.ink }]}>
              {change > 0 ? '+' : change < 0 ? '−' : ''}
              {Math.abs(change)}
              {unit}
            </Text>
            <Text style={[st.caption, { color: c.muted }]}>
              {day(trend.toDate)} · {r1(line.to)}
              {unit}
            </Text>
          </>
        ) : (
          <>
            <Text style={[st.caption, { color: c.muted }]}>
              {day(weights[0].date)} · {r1(values[0])}
              {unit}
            </Text>
            <Text style={[st.caption, { color: c.muted }]}>
              {day(weights[lastIndex].date)} · {r1(values[lastIndex])}
              {unit}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 80 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  target: { position: 'absolute', left: -1, right: -1, height: 2, borderRadius: 1, marginBottom: -1 },
  caption: { fontSize: 13, fontVariant: ['tabular-nums'] },
  capRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
});
