import * as Haptics from 'expo-haptics';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { type GestureResponderEvent, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
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
import { type Palette } from '~/lib/ui';
import { Press } from '~/shell/press';

/**
 * 분석 화면(native/src/app/analysis.tsx)의 그래프 둘 — 부하 지수 2주 흐름(웹 app/(app)/coach/load-trend.tsx)과 기록 그래프 한 장(웹
 * app/(app)/today/home-trends.tsx TrendCell · Chart). 칸 · 묶기 · 눈금 셈은 웹과 같은 lib/report/trends.ts, 그리기만 따로.
 * 손가락으로 훑으면 위 숫자가 그날 값으로 바뀌고 칸을 넘을 때마다 '톡'(웹과 같다). 날짜 탐색은 로컬 선택이고, 별도 단추를 눌렀을 때만 분석을 다시 연다(onJump).
 */

const APath = Animated.createAnimatedComponent(Path);
const DRAW = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * 선이 왼쪽부터 그려지는 꺾은선 — 웹 trend-draw(globals.css, 900ms · 같은 곡선)와 같은 움직임. 웹은 pathLength=1 로 그리는데
 * 앱 svg 는 그 칸이 없어 점 사이 직선 길이로 어림한다(곡선이라 조금 더 길게 — 넉넉하면 끝에 빈칸 없이 다 그려진다). 처음 그릴 때 한 번만(웹과 같다).
 */
function DrawPath({ d, points, stroke, duration = 900 }: { d: string; points: [number, number][]; stroke: string; duration?: number }) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  len = len * 1.2 + 4;
  const reduce = useReducedMotion();
  const drawn = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (!reduce) drawn.value = withTiming(1, { duration, easing: DRAW });
  }, [reduce, drawn, duration]);
  const animated = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - drawn.value) }));
  return (
    <APath
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={[len, len]}
      animatedProps={animated}
    />
  );
}

/** 선 밑 칠 — 웹 trend-fade(700ms · 250ms 뒤)처럼 선이 그려지는 동안 옅게 들어온다 */
function FadePath({ d, fill }: { d: string; fill: string }) {
  const reduce = useReducedMotion();
  const shown = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (!reduce) shown.value = withDelay(250, withTiming(1, { duration: 700, easing: Easing.out(Easing.ease) }));
  }, [reduce, shown]);
  const animated = useAnimatedProps(() => ({ opacity: shown.value }));
  return <APath d={d} fill={fill} animatedProps={animated} />;
}

/** 상태 색 — 사이트 components/tone.tsx 와 같은 뜻 */
export function toneColor(tone: 'good' | 'info' | 'warn' | 'bad' | 'neutral', c: Palette) {
  return tone === 'good' ? c.ok : tone === 'info' ? c.sky : tone === 'warn' ? c.warn : tone === 'bad' ? c.danger : c.muted;
}

/** 날짜 탐색은 로컬 선택이다. 분석 기준일 변경은 별도 단추로만 한다. */
function useScrub(count: number, indexAt: (x: number) => number, canPick: (i: number) => boolean) {
  const [hover, setHover] = useState<number | null>(null);
  const last = useRef<number | null>(null);
  const select = (index: number) => {
    if (count <= 0) return;
    const i = Math.min(count - 1, Math.max(0, index));
    if (last.current !== i && canPick(i)) void Haptics.selectionAsync();
    last.current = i;
    setHover(i);
  };
  const pick = (e: GestureResponderEvent) => select(indexAt(e.nativeEvent.locationX));
  const clear = () => { last.current = null; setHover(null); };
  const handlers = {
    onStartShouldSetResponder: () => count > 0,
    onResponderGrant: pick,
    onResponderMove: pick,
    onResponderRelease: pick,
    // 수직 스크롤을 시작하면 ScrollView가 이어받을 수 있게 한다.
    onResponderTerminationRequest: () => true,
    onResponderTerminate: clear,
  };
  return { hover, handlers, clear, select };
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
            <DrawPath d={smoothPath(pts.map((p) => [p.px, p.py] as [number, number]))} points={pts.map((p) => [p.px, p.py])} stroke={c.sky} />
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
  /* 두 장을 나란히 둔 휴대폰에서도 세로 눈금을 표시한다. */
  const showY = w >= 130;
  const padL = 4;
  const padR = showY ? 46 : 6;
  const padT = 12;
  const padB = 18;
  const plotW = Math.max(1, w - padL - padR);
  const plotH = h - padT - padB;
  const slotW = plotW / n;
  const base = padT + plotH;
  const dom = domainOf(spec.kind, spec.key, points);
  const { hover, handlers, clear, select } = useScrub(
    dom ? n : 0,
    (px) => Math.floor((px - padL) / slotW),
    (i) => points[i] != null
  );

  const picked = hover == null ? undefined : points[hover];
  const shownValue = picked === undefined ? card.value : picked == null ? null : format(picked);
  const shownNote =
    hover == null ? card.note : daily ? spokenDay(slots[hover].end) + (picked == null ? spec.key === 'velocity' ? ' · 측정 없음' : ' · 기록 없음' : spec.key === 'pitches' && picked === 0 ? ' · 휴식 기록' : '') : `${shortDate(slots[hover].start)}~${shortDate(slots[hover].end)}`;
  const x = (i: number) => padL + slotW * (i + 0.5);
  const y = (v: number) => (dom ? padT + plotH * (1 - (v - dom.lo) / (dom.hi - dom.lo)) : base);
  const last = n - 1;
  const linePoints: [number, number, number][] = points.flatMap((v, i) => (v == null ? [] : [[x(i), y(v), i] as [number, number, number]]));
  const latest = linePoints[linePoints.length - 1];
  const change = card.change;

  return (
    <View style={[st.cell, { backgroundColor: c.card, boxShadow: c.float }]}>
      <View style={st.cellHead}>
        <SymbolView name={icon} size={13} tintColor={c.sky} />
        <Text numberOfLines={1} style={[st.smallBold, { color: c.link, flex: 1 }]}>
          {spec.label}
        </Text>
      </View>
      <View style={st.valueLine}>
        <Text style={[st.value, { color: hover == null ? c.ink : c.link }]}>{shownValue ? shownValue[0] : '—'}</Text>
        {shownValue ? <Text style={[st.small, { color: c.muted }]}>{shownValue[1]}</Text> : null}
      </View>
      {change && hover == null ? (
        <View accessibilityLabel={change.spoken} style={st.deltaLine}>
          <SymbolView name={ARROW[change.dir]} size={12} weight="semibold" tintColor={c.link} />
          <Text style={[st.tiny, { color: c.muted, flexShrink: 1 }]}>{change.dir === 0 ? '변화 없음' : change.text + ' · 이전 기간 대비'}</Text>
        </View>
      ) : null}
      <Text style={[st.small, { color: c.muted, minHeight: 38 }]}>{shownNote}</Text>
      <View
        style={{ height: h, marginTop: 6 }}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        accessibilityRole="adjustable"
        accessibilityValue={{ min: 0, max: Math.max(0, n - 1), now: hover ?? Math.max(0, n - 1), text: shownNote }}
        accessibilityActions={[{ name: 'increment', label: '다음 날짜' }, { name: 'decrement', label: '이전 날짜' }]}
        onAccessibilityAction={(e) => select((hover ?? n - 1) + (e.nativeEvent.actionName === 'decrement' ? -1 : 1))}
        accessibilityLabel={`${spec.label}, ${card.value ? card.value.join('') : '기록 없음'}${card.note ? `, ${card.note}` : ''}${change ? `, ${change.spoken}` : ''}`}
        accessibilityHint="날짜를 살펴보고 별도 단추로 분석을 열 수 있어요"
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
                  <SvgText key={`t${t}`} x={w - padR + 6} y={y(t) + 3} fontSize={12} fill={c.muted}>
                    {spec.key === 'velocity' || spec.key === 'weight' ? format(t)[0] : tickText(t)}
                  </SvgText>
                ))
              : null}
            {xTicksOf(n, w < 190).map((i) => (
              <SvgText
                key={i}
                x={i === 0 ? padL : i === last ? w - padR : x(i)}
                y={h - 3}
                fontSize={12}
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
                      <FadePath
                        d={`${smoothPath(linePoints.map(([px, py]) => [px, py]))} L${latest[0]},${base} L${linePoints[0][0]},${base} Z`}
                        fill={`url(#fill-${spec.key})`}
                      />
                    ) : null}
                    <DrawPath
                      d={smoothPath(linePoints.map(([px, py]) => [px, py]))}
                      points={linePoints.map(([px, py]) => [px, py])}
                      stroke={c.sky}
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
      {hover != null ? (
        <View style={st.actions}>
          <Press onPress={clear} accessibilityRole="button" style={st.action}>
            <Text style={[st.small, { color: c.link }]}>기간 요약</Text>
          </Press>
          {daily && picked != null ? (
            <Press onPress={() => onJump(slots[hover].end)} accessibilityRole="button" style={st.action}>
              <Text style={[st.smallBold, { color: c.link }]}>이날 분석</Text>
            </Press>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  trendBox: { borderRadius: 16, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10 },
  trendHead: { minHeight: 20, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  cell: { flex: 1, minWidth: 0, borderRadius: 24, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
  cellHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  changePill: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  valueLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 4, marginTop: 5, marginBottom: 5 },
  deltaLine: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  action: { minHeight: 44, justifyContent: 'center', paddingVertical: 7 },
  value: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  emptyChart: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tiny: { fontSize: 12, lineHeight: 18 },
  tinyBold: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  small: { fontSize: 13, lineHeight: 18 },
  smallBold: { fontSize: 13, fontWeight: '600' },
  bodyBold: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
