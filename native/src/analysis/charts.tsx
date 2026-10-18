import * as Haptics from 'expo-haptics';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { type GestureResponderEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { ACWR_ZONES, formatShortDate, zoneOf, type AcwrTrendPoint } from '@/lib/pitch-stats';
import { smoothPath } from '@/lib/smooth-path';
import {
  domainOf,
  shortDate,
  spokenDay,
  tickText,
  xTickText,
  xTicksOf,
  type MetricSpec,
  type Slot,
  type TrendCard,
} from '@/lib/report/trends';
import type { Palette } from '~/lib/ui';

/**
 * 분석 화면(native/src/app/analysis.tsx)의 그래프 둘 — 부하 지수 2주 흐름(웹 app/(app)/coach/load-trend.tsx)과 기록 그래프 한 장(웹
 * app/(app)/today/home-trends.tsx TrendCell · Chart). 칸 · 묶기 · 눈금 셈은 웹과 같은 lib/report/trends.ts, 그리기만 따로.
 * 손가락으로 훑으면 위 숫자가 그날 값으로 바뀌고 칸을 넘을 때마다 '톡'(웹과 같다). 날짜별 그래프는 톡 친 날로 분석을 다시 연다(onJump).
 */

/** 상태 색 — 사이트 components/tone.tsx 와 같은 뜻 */
export function toneColor(tone: 'good' | 'info' | 'warn' | 'bad' | 'neutral', c: Palette) {
  return tone === 'good' ? c.ok : tone === 'info' ? c.sky : tone === 'warn' ? c.warn : tone === 'bad' ? c.danger : c.muted;
}

/** 훑기 — 누른 자리 · 옮긴 자리를 칸 번호로, 떼면 잠깐 남겼다 걷는다. 움직이지 않고 떼면 tap */
function useScrub(count: number, indexAt: (x: number) => number, canPick: (i: number) => boolean, onTap?: (i: number) => void) {
  const [hover, setHover] = useState<number | null>(null);
  const last = useRef<number | null>(null);
  const startX = useRef(0);
  const moved = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const pick = (e: GestureResponderEvent) => {
    const i = Math.min(count - 1, Math.max(0, indexAt(e.nativeEvent.locationX)));
    clearTimeout(hideTimer.current);
    if (last.current !== i && canPick(i)) void Haptics.selectionAsync();
    last.current = i;
    setHover(i);
    return i;
  };
  const clear = () => {
    last.current = null;
    setHover(null);
  };
  const handlers = {
    onStartShouldSetResponder: () => count > 0,
    onResponderGrant: (e: GestureResponderEvent) => {
      startX.current = e.nativeEvent.locationX;
      moved.current = false;
      pick(e);
    },
    onResponderMove: (e: GestureResponderEvent) => {
      if (Math.abs(e.nativeEvent.locationX - startX.current) > 6) moved.current = true;
      pick(e);
    },
    onResponderRelease: (e: GestureResponderEvent) => {
      const i = pick(e);
      if (!moved.current && onTap) onTap(i);
      hideTimer.current = setTimeout(clear, 1500);
    },
    onResponderTerminate: clear,
  };
  return { hover, handlers };
}

/* 적정 구간 — 띠로 깐다 */
const BAND_LO = 0.8;
const BAND_HI = 1.3;

/** 최근 2주 지수 흐름 — 웹 LoadTrend 와 같은 범위 · 띠. 점이 셋 밑이면 안 그린다 */
export function LoadTrend({ trend, c }: { trend: AcwrTrendPoint[]; c: Palette }) {
  const [w, setW] = useState(0);
  const n = trend.length;
  const padL = 4;
  const padR = 28;
  const padT = 8;
  const padB = 18;
  const h = 112;
  const plotW = Math.max(1, w - padL - padR);
  const plotH = h - padT - padB;
  const { hover, handlers } = useScrub(
    n,
    (x) => Math.round(((x - padL) / plotW) * (n - 1)),
    (i) => trend[i]?.ratio != null
  );

  const got = trend.filter((p) => p.ratio != null);
  if (got.length < 3) return null;

  const x = (i: number) => padL + (plotW * i) / (n - 1);
  /* 세로 범위 — 적정 띠(0.8~1.3)가 늘 보이게 0.5~1.5 를 덮고, 값이 그 밖이면 넓힌다(웹 load-trend.tsx 와 같다) */
  const vals = got.map((p) => p.ratio as number);
  const lo = Math.max(0, Math.min(0.5, Math.floor((Math.min(...vals) - 0.1) * 10) / 10));
  const hi = Math.max(1.5, Math.ceil((Math.max(...vals) + 0.1) * 10) / 10);
  const y = (r: number) => padT + plotH * (1 - (r - lo) / (hi - lo));
  const pts = trend.flatMap((p, i) => (p.ratio == null ? [] : [{ i, px: x(i), py: y(p.ratio), ratio: p.ratio }]));
  const end = pts[pts.length - 1];
  const endColor = toneColor(ACWR_ZONES[zoneOf(end.ratio)].tone, c);
  const picked = hover == null ? null : trend[hover];
  const pickedZone = picked?.ratio != null ? ACWR_ZONES[zoneOf(picked.ratio)] : null;

  return (
    <View style={[st.trendBox, { backgroundColor: c.ink + '0a' }]}>
      <View style={st.trendHead}>
        {picked ? (
          <>
            <Text style={[st.small, { color: c.muted }]}>{spokenDay(picked.dateKey)}</Text>
            {picked.ratio != null && pickedZone ? (
              <Text style={[st.bodyBold, { color: toneColor(pickedZone.tone, c) }]}>
                {picked.ratio.toFixed(2)} <Text style={st.small}>{pickedZone.label}</Text>
              </Text>
            ) : (
              <Text style={[st.small, { color: c.muted }]}>지수 없음</Text>
            )}
          </>
        ) : (
          <>
            <Text style={[st.smallBold, { color: c.ink }]}>최근 2주 흐름</Text>
            <Text style={[st.tiny, { color: c.muted }]}>
              {formatShortDate(trend[0].dateKey)} ~ {formatShortDate(trend[n - 1].dateKey)}
            </Text>
          </>
        )}
      </View>
      <View
        style={{ height: h, marginTop: 8 }}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        accessibilityRole="image"
        accessibilityLabel={`최근 2주 부하 지수 흐름. ${got.map((p) => `${formatShortDate(p.dateKey)} ${p.ratio!.toFixed(2)}`).join(', ')}`}
        {...handlers}
      >
        {w > 0 ? (
          <Svg width={w} height={h} pointerEvents="none">
            <Rect x={padL} y={y(BAND_HI)} width={plotW} height={y(BAND_LO) - y(BAND_HI)} rx={4} fill={c.sky} fillOpacity={0.1} />
            {[BAND_HI, BAND_LO].map((b) => (
              <SvgText key={b} x={w - padR + 6} y={y(b) + 3} fontSize={10} fill={c.muted}>
                {b.toFixed(1)}
              </SvgText>
            ))}
            <Line x1={padL} x2={w - padR} y1={padT + plotH} y2={padT + plotH} stroke={c.line} />
            <SvgText x={padL} y={h - 3} fontSize={10} fill={c.muted}>
              {formatShortDate(trend[0].dateKey)}
            </SvgText>
            <SvgText x={w - padR} y={h - 3} fontSize={10} fill={c.muted} textAnchor="end">
              {formatShortDate(trend[n - 1].dateKey)}
            </SvgText>
            {hover != null ? <Line x1={x(hover)} x2={x(hover)} y1={padT - 4} y2={padT + plotH} stroke={c.ink} strokeOpacity={0.3} /> : null}
            <Path
              d={smoothPath(pts.map((p) => [p.px, p.py] as [number, number]))}
              fill="none"
              stroke={c.sky}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {pts.map((p) => (
              <Circle
                key={p.i}
                cx={p.px}
                cy={p.py}
                r={hover === p.i ? 4.5 : p === end ? 4 : 2}
                fill={p === end ? endColor : c.sky}
                stroke={c.card}
                strokeWidth={hover === p.i || p === end ? 1.5 : 0}
              />
            ))}
          </Svg>
        ) : null}
      </View>
      <Text style={[st.small, { color: c.muted, marginTop: 8 }]}>파란 띠가 적정(0.8~1.3)이에요. 하루 값보다 흐름을 보세요.</Text>
    </View>
  );
}

const ARROW: Record<-1 | 0 | 1, SFSymbol> = { 1: 'arrow.up.right', 0: 'minus', [-1]: 'arrow.down.right' };

/** 기록 그래프 한 장 — 웹 TrendCell 과 같은 머리(이름 · 앞 기간과 견줌 · 큰 숫자 · 밑 한 줄)와 막대 · 선 */
export function TrendCardView({
  spec,
  icon,
  card,
  slots,
  daily,
  endsToday,
  format,
  onJump,
  c,
}: {
  spec: MetricSpec;
  icon: SFSymbol;
  card: TrendCard;
  slots: Slot[];
  daily: boolean;
  endsToday: boolean;
  format: (v: number) => [string, string];
  onJump: (date: string) => void;
  c: Palette;
}) {
  const [w, setW] = useState(0);
  const { points } = card;
  const n = points.length;
  const h = 104;
  /* 세로 눈금 숫자는 오른쪽에 — 좁은 칸은 숫자 없이(웹과 같은 190 기준) */
  const showY = w >= 190;
  const padL = 4;
  const padR = showY ? 30 : 6;
  const padT = 12;
  const padB = 18;
  const plotW = Math.max(1, w - padL - padR);
  const plotH = h - padT - padB;
  const slotW = plotW / n;
  const base = padT + plotH;
  const dom = domainOf(spec.kind, spec.key, points);
  const { hover, handlers } = useScrub(
    dom ? n : 0,
    (px) => Math.floor((px - padL) / slotW),
    (i) => points[i] != null,
    daily ? (i) => onJump(slots[i].end) : undefined
  );

  const picked = hover == null ? undefined : points[hover];
  const shownValue = picked === undefined ? card.value : picked == null ? null : format(picked);
  const shownNote =
    hover == null ? card.note : daily ? spokenDay(slots[hover].end) : `${shortDate(slots[hover].start)}~${shortDate(slots[hover].end)}`;
  const x = (i: number) => padL + slotW * (i + 0.5);
  const y = (v: number) => (dom ? padT + plotH * (1 - (v - dom.lo) / (dom.hi - dom.lo)) : base);
  const last = n - 1;
  const linePoints: [number, number, number][] = points.flatMap((v, i) => (v == null ? [] : [[x(i), y(v), i] as [number, number, number]]));
  const latest = linePoints[linePoints.length - 1];
  const change = card.change;

  return (
    <View style={[st.cell, { backgroundColor: c.card }]}>
      <View style={st.cellHead}>
        <SymbolView name={icon} size={13} tintColor={c.sky} />
        <Text numberOfLines={1} style={[st.smallBold, { color: c.sky, flex: 1 }]}>
          {spec.label}
        </Text>
        {change && hover == null ? (
          <View accessibilityLabel={change.spoken} style={[st.changePill, { backgroundColor: c.sky + '1a' }]}>
            <SymbolView name={ARROW[change.dir]} size={10} weight="bold" tintColor={c.sky} />
            <Text style={[st.tinyBold, { color: c.sky }]}>{change.text}</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={[st.value, { color: hover == null ? c.ink : c.sky }]}>
        {shownValue ? shownValue[0] : '—'}
        {shownValue ? <Text style={[st.small, { color: c.muted }]}> {shownValue[1]}</Text> : null}
      </Text>
      <Text numberOfLines={1} style={[st.tiny, { color: c.muted, minHeight: 16 }]}>
        {shownNote}
      </Text>
      <View
        style={{ height: h, marginTop: 6 }}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        accessibilityRole="image"
        accessibilityLabel={`${spec.label}, ${card.value ? card.value.join('') : '기록 없음'}${card.note ? `, ${card.note}` : ''}${change ? `, ${change.spoken}` : ''}`}
        accessibilityHint={daily ? '날을 톡 치면 그날 분석을 봐요' : undefined}
        {...handlers}
      >
        {!dom ? (
          <View style={st.emptyChart}>
            <Text style={[st.tiny, { color: c.muted }]}>기록 없음</Text>
          </View>
        ) : w > 0 ? (
          <Svg width={w} height={h} pointerEvents="none">
            <Defs>
              <LinearGradient id={`fill-${spec.key}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={c.sky} stopOpacity={0.28} />
                <Stop offset="1" stopColor={c.sky} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {dom.ticks.map((t, k) => (
              <Line key={t} x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={c.line} strokeOpacity={k === 0 ? 1 : 0.6} />
            ))}
            {showY
              ? dom.ticks.map((t) => (
                  <SvgText key={`t${t}`} x={w - padR + 6} y={y(t) + 3} fontSize={11} fill={c.muted}>
                    {tickText(t)}
                  </SvgText>
                ))
              : null}
            {xTicksOf(n, w < 190).map((i) => (
              <SvgText
                key={i}
                x={i === 0 ? padL : i === last ? w - padR : x(i)}
                y={h - 3}
                fontSize={11}
                fill={c.muted}
                textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}
              >
                {xTickText(i, slots, daily, endsToday)}
              </SvgText>
            ))}
            {spec.kind === 'bar'
              ? points.map((v, i) => {
                  if (!v) return null;
                  /* 막대는 위쪽만 둥글게 — 훑는 동안만 고른 칸 밖을 옅게(웹과 같다) */
                  const bw = Math.max(2, Math.min(slotW * 0.62, 22));
                  const top = y(v);
                  const r = Math.min(3, bw / 2, Math.max(0, base - top));
                  const left = x(i) - bw / 2;
                  return (
                    <Path
                      key={i}
                      d={`M${left},${base} V${top + r} Q${left},${top} ${left + r},${top} H${left + bw - r} Q${left + bw},${top} ${left + bw},${top + r} V${base} Z`}
                      fill={c.sky}
                      opacity={hover != null && hover !== i ? 0.35 : 1}
                    />
                  );
                })
              : linePoints.length > 0 && (
                  <>
                    {linePoints.length > 1 ? (
                      <Path
                        d={`${smoothPath(linePoints.map(([px, py]) => [px, py]))} L${latest[0]},${base} L${linePoints[0][0]},${base} Z`}
                        fill={`url(#fill-${spec.key})`}
                      />
                    ) : null}
                    <Path
                      d={smoothPath(linePoints.map(([px, py]) => [px, py]))}
                      fill="none"
                      stroke={c.sky}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {linePoints.map(([px, py, i]) => (
                      <Circle key={i} cx={px} cy={py} r={hover === i ? 4 : i === latest[2] ? 3.5 : 2.25} fill={c.sky} stroke={c.card} strokeWidth={1.5} />
                    ))}
                  </>
                )}
            {hover != null ? <Line x1={x(hover)} x2={x(hover)} y1={padT - 6} y2={base} stroke={c.ink} strokeOpacity={0.3} /> : null}
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  trendBox: { borderRadius: 16, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10 },
  trendHead: { minHeight: 20, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  cell: { flex: 1, minWidth: 0, borderRadius: 20, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
  cellHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  changePill: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  value: { marginTop: 4, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  emptyChart: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tiny: { fontSize: 11, lineHeight: 16 },
  tinyBold: { fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  small: { fontSize: 13, lineHeight: 18 },
  smallBold: { fontSize: 13, fontWeight: '700' },
  bodyBold: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
