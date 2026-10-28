import { View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme, withAlpha, type Palette } from '~/lib/ui';

/**
 * 투구 탭 도구 도크의 그림 셋(2026-10-29 확정 디자인, 디자인 자료 assets/ · sources/pitch.fragment.html).
 * - PitcherMark: 승인 V6 관절 추적 투수(pitcher-integrated-fit.svg) — 좌표 · 비율 · 16개 점 · 연결선은 원본 그대로 옮겼다(카드용 viewBox 26 25 204 204).
 *   원본의 1px 그림자 필터(feDropShadow, 불투명도 0.11)만 뺐다(react-native-svg 필터를 쓰지 않으려고). 다크 색은 원본 안 SVG 스타일(prefers-color-scheme: dark) 값.
 * - GaugeMark: 구속 측정 — 계기판 실루엣(굵은 호 + 바늘), 사진 · 선수 그림 없음.
 * - ZoneMark: ABS — 가운데 칸만 채운 3×3 존, 화살표 없음.
 */
const LIGHT = { stops: ['#499BDA', '#137AC3', '#0963A6'], link: '#B7E4FF', nodeFill: '#E2F4FF', nodeStroke: '#176CA6' };
const DARK = { stops: ['#9BD9FF', '#69B8EF', '#388DCF'], link: '#D1EEFF', nodeFill: '#ECF9FF', nodeStroke: '#255F88' };

/* 관절 16개 — 머리 · 목 · 던지는 팔(어깨 · 팔꿈치 · 손목) · 글러브 팔 · 두 엉덩이 · 뒷다리(무릎 · 발목 · 발끝) · 앞다리 */
const NODES: [number, number][] = [
  [153, 52], [149, 70], [128, 81], [103, 79], [112, 43], [169, 85], [185, 102], [196, 116],
  [137, 132], [155, 134], [103, 163], [63, 186], [49, 194], [186, 155], [200, 198], [217, 205],
];
const LINKS = [
  'M153 52 L149 70',
  'M128 81 L149 70 L169 85',
  'M128 81 L103 79 L112 43',
  'M169 85 L185 102 L196 116',
  'M128 81 L137 132 L155 134 L169 85',
  'M149 70 L146 133',
  'M137 132 L103 163 L63 186 L49 194',
  'M155 134 L186 155 L200 198 L217 205',
];
const LIMBS: [string, number][] = [
  ['M137 132 L103 163 L63 186', 16],
  ['M63 186 L49 194', 11],
  ['M155 134 L186 155 L200 198', 17],
  ['M200 198 L217 205', 11],
  ['M128 81 L103 79 L112 43', 11],
  ['M169 85 L185 102 L196 116', 11],
  ['M149 70 L153 61', 12],
];

export function PitcherMark({ size }: { size: number }) {
  const k = useTheme() === 'light' ? LIGHT : DARK;
  return (
    <Svg width={size} height={size} viewBox="26 25 204 204" fill="none" accessible={false}>
      <Defs>
        <LinearGradient id="pitch-blue" x1="82" y1="28" x2="171" y2="213" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={k.stops[0]} />
          <Stop offset="0.63" stopColor={k.stops[1]} />
          <Stop offset="1" stopColor={k.stops[2]} />
        </LinearGradient>
      </Defs>
      <G transform="translate(-5 8)">
        <G stroke="url(#pitch-blue)" strokeLinecap="round" strokeLinejoin="round">
          {LIMBS.map(([d, w]) => (
            <Path key={d} d={d} strokeWidth={w} />
          ))}
        </G>
        <Path d="M141 69 Q146 65 153 70 L165 78 Q173 81 173 88 L160 132 Q158 140 150 140 L139 138 Q133 136 132 129 L125 87 Q122 81 130 77Z" fill="url(#pitch-blue)" />
        <Ellipse cx="153" cy="52" rx="13.5" ry="15" transform="rotate(10 153 52)" fill="url(#pitch-blue)" />
        <Circle cx="114" cy="32.5" r="6.5" fill="url(#pitch-blue)" />
        <Ellipse cx="196" cy="116" rx="8" ry="10.5" transform="rotate(-34 196 116)" fill="url(#pitch-blue)" />
        <G stroke={k.link} strokeWidth={2.15} strokeLinecap="round" strokeLinejoin="round" opacity={0.9}>
          {LINKS.map((d) => (
            <Path key={d} d={d} />
          ))}
        </G>
        <G fill={k.nodeFill} stroke={k.nodeStroke} strokeWidth={1.25}>
          {NODES.map(([x, y]) => (
            <Circle key={`${x}-${y}`} cx={x} cy={y} r={3.4} />
          ))}
        </G>
      </G>
    </Svg>
  );
}

/** 계기판 — 위가 열린 굵은 호(파랑 그라데이션) · 오른쪽 위로 기운 바늘 · 가운데 축 */
export function GaugeMark({ size, c }: { size: number; c: Palette }) {
  const dark = useTheme() !== 'light';
  const top = dark ? '#8fd0ff' : '#4a9be0';
  const bottom = dark ? '#3b8fd0' : '#1663ad';
  return (
    <Svg width={size} height={size * 0.78} viewBox="0 0 64 50" accessible={false}>
      <Defs>
        <LinearGradient id="gauge-blue" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={top} />
          <Stop offset="1" stopColor={bottom} />
        </LinearGradient>
      </Defs>
      {/* 반지름 24 · 굵기 13 의 호 — 왼쪽 아래(200°)부터 오른쪽 아래(340°)까지 위로 돈다 */}
      <Path d="M9.4 40.2 A24 24 0 1 1 54.6 40.2" stroke="url(#gauge-blue)" strokeWidth={13} strokeLinecap="round" fill="none" />
      <Path d="M32 33 L46 15" stroke={c.card} strokeWidth={5.5} strokeLinecap="round" />
      <Path d="M32 33 L46 15" stroke={bottom} strokeWidth={3} strokeLinecap="round" />
      <Circle cx="32" cy="33" r="4.6" fill={bottom} stroke={c.card} strokeWidth={2} />
    </Svg>
  );
}

/** ABS — 3×3 칸, 가운데만 진한 파랑. 칸마다 옅은 면(화살표 · 공 없음) */
export function ZoneMark({ size, c }: { size: number; c: Palette }) {
  const dark = useTheme() !== 'light';
  const cell = (size - 6) / 3;
  return (
    <View style={{ width: size, height: size, flexDirection: 'row', flexWrap: 'wrap', gap: 3 }} accessible={false}>
      {Array.from({ length: 9 }, (_, i) => (
        <View
          key={i}
          style={{
            width: cell,
            height: cell,
            borderRadius: cell * 0.24,
            backgroundColor: i === 4 ? (dark ? '#3d9be2' : '#1572bf') : dark ? withAlpha('#5aa7dd', 0.32) : withAlpha(c.sky, 0.18),
            borderWidth: i === 4 ? 0 : 1,
            borderColor: dark ? withAlpha('#8cc9f3', 0.2) : withAlpha(c.sky, 0.12),
          }}
        />
      ))}
    </View>
  );
}
