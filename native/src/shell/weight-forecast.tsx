import { useEffect } from 'react';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { round1, toWeight } from '@/lib/units';
import type { Palette } from '~/lib/ui';
import { useWeightUnit } from '~/lib/weight-unit';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * 예상 체중 선 — 지금에서 목표까지 계획 속도로 가는 선(웹 components/onboarding/weight-forecast.tsx, 점은 lib/nutrition/weight-goal.ts forecastWeights).
 * 처음 보일 때 선이 왼쪽에서 그려진다(움직임 줄이기면 바로). 숫자는 지금 · 목표 둘만, 가운데 눈금은 4주마다.
 */
export function WeightForecast({ points, c }: { points: { week: number; kg: number }[]; c: Palette }) {
  const unit = useWeightUnit();
  const reduce = useReducedMotion();
  const W = 320;
  const H = 120;
  const padX = 14;
  const padTop = 18;
  const padBottom = 22;
  const weeks = points[points.length - 1]?.week || 1;
  const kgs = points.map((p) => p.kg);
  const lo = Math.min(...kgs);
  const span = Math.max(Math.max(...kgs) - lo, 0.5);
  const x = (week: number) => padX + (week / weeks) * (W - padX * 2);
  const y = (kg: number) => padTop + (1 - (kg - lo) / span) * (H - padTop - padBottom);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.week).toFixed(1)} ${y(p.kg).toFixed(1)}`).join(' ');
  /* 선 길이(뷰 단위) — 대시 끝을 밀어 그리는 움직임에 쓴다 */
  const length = points.slice(1).reduce((n, p, i) => n + Math.hypot(x(p.week) - x(points[i].week), y(p.kg) - y(points[i].kg)), 0);
  const drawn = useSharedValue(reduce ? 1 : 0);
  const key = points.map((p) => `${p.week}:${p.kg}`).join('|');
  useEffect(() => {
    if (reduce) return;
    drawn.set(0);
    drawn.set(withTiming(1, { duration: 1000, easing: Easing.bezier(0.22, 1, 0.36, 1) }));
  }, [key, reduce, drawn]);
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - drawn.get()) }));
  const areaProps = useAnimatedProps(() => ({ opacity: Math.max(0, (drawn.get() - 0.5) * 2) }));

  if (points.length < 2) return null;
  const area = `${d} L${x(weeks).toFixed(1)} ${H - padBottom} L${x(0).toFixed(1)} ${H - padBottom} Z`;
  const first = points[0];
  const last = points[points.length - 1];
  const label = (kg: number) => `${round1(toWeight(kg, unit))}${unit}`;
  const ticks: number[] = [];
  /* 끝 가까운 눈금은 뺀다 — 목표 글('80kg · 23주')과 겹친다 */
  for (let w = 4; w <= weeks - 4; w += 4) ticks.push(w);
  const up = first.kg <= last.kg;

  return (
    <Svg
      width="100%"
      height={undefined}
      viewBox={`0 0 ${W} ${H}`}
      style={{ aspectRatio: W / H }}
      accessibilityRole="image"
      accessibilityLabel={`예상 체중: 지금 ${label(first.kg)}에서 ${weeks}주 뒤 ${label(last.kg)}`}
    >
      <Defs>
        <LinearGradient id="wf-fill" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor={c.sky} stopOpacity={0.22} />
          <Stop offset="1" stopColor={c.sky} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Line x1={padX} x2={W - padX} y1={H - padBottom} y2={H - padBottom} stroke={c.line} strokeWidth={1} />
      {ticks.map((w) => (
        <SvgText key={w} x={x(w)} y={H - 4} textAnchor="middle" fontSize={9} fill={c.muted}>
          {`${w}주`}
        </SvgText>
      ))}
      <AnimatedPath d={area} fill="url(#wf-fill)" animatedProps={areaProps} />
      <AnimatedPath
        d={d}
        fill="none"
        stroke={c.sky}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={`${length} ${length}`}
        animatedProps={lineProps}
      />
      <Circle cx={x(first.week)} cy={y(first.kg)} r={4} fill={c.card} stroke={c.sky} strokeWidth={2} />
      <Circle cx={x(last.week)} cy={y(last.kg)} r={4.5} fill={c.sky} />
      <SvgText x={x(first.week)} y={y(first.kg) + (up ? 16 : -10)} textAnchor="start" fontSize={10} fontWeight="600" fill={c.ink}>
        {label(first.kg)}
      </SvgText>
      <SvgText x={x(last.week)} y={y(last.kg) + (up ? -10 : 16)} textAnchor="end" fontSize={10} fontWeight="600" fill={c.skyStrong}>
        {`${label(last.kg)} · ${weeks}주`}
      </SvgText>
    </Svg>
  );
}
