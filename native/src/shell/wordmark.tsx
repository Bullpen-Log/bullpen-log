import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * 앱 이름 — 웹 components/logo.tsx 의 Wordmark 와 같은 꼴: 'SINKER' 의 S 자리에 싱커 로고(아래로 꺾인 화살표가 붙은 S), 글자는 좁은 굵은 대문자.
 * 2026-10-22 금윤호: 불펜로그 B + ULLPEN LOG 이던 것을 싱커 로고(초안 · 임시 — 바뀔 수 있다) + INKER 로.
 * 웹은 Bebas Neue 인데 앱에 글꼴 파일이 없어 아이폰에 든 DIN Condensed Bold(같은 좁은 대문자체)로 쓴다.
 * 로고 그림 · 색은 웹 logo.tsx 의 MARK_PATH · --color-brand 와 같다 — 로고를 바꾸면 둘을 같이 고친다.
 */
const MARK_PATH =
  'M275 0l631 0l17 2l18 7l13 9l9 12l5 15l1 15l-4 15l-8 14l-119 116l-14 11l-20 10l-15 4l-21 2l-75-1l-19 1l-350 0l-18 6l-10 6l-6 5l-6 7l-5 8l-5 18l-1 10l2 12l5 12l6 9l7 8l8 6l12 5l12 3l401 1l16 2l16 4l23 10l18 13l74 72l42 43l8 12l5 12l5 14l2 15l2 37l-1 103l0 64l1 8l5 8l6 5l31 4l7 2l7 5l7 7l4 7l2 11l-1 8l-4 12l-11 13l-144 139l-21 16l-15 6l-14 1l-16-3l-14-8l-16-13l-135-136l-8-8l-5-10l-3-10l1-13l4-10l6-8l7-5l8-3l34-4l8-6l3-8l0-135l-2-9l-4-11l-8-9l-9-8l-15-7l-22-3l-399 0l-27-4l-13-5l-13-6l-11-8l-10-7l-103-102l-13-14l-8-14l-9-20l-3-25l-1-61l1-50l1-14l4-14l6-14l6-11l17-22l98-97l58-56l17-11l21-10l20-6ZM198 663l355 0l11 1l10 3l8 4l10 8l8 9l5 9l3 9l1 11l-1 10l-2 11l-7 12l-9 11l-19 19l-7 9l-5 12l-6 27l-11 21l-8 9l-10 9l-13 7l-12 5l-22 3l-440-1l-9-2l-11-6l-8-9l-5-7l-3-12l0-10l3-9l5-10l13-14l81-79l41-38l11-8l14-7l15-4Z';
const BRAND = '#0297e4';
/** 로고 너비 ÷ 높이(웹 MARK_VIEWBOX 0 0 1006 1001) — 시작 연출이 칸 너비를 셀 때 쓴다 */
export const MARK_ASPECT = 1006 / 1001;

export function SinkerMark({ height }: { height: number }) {
  return (
    <Svg width={height * MARK_ASPECT} height={height} viewBox="0 0 1006 1001">
      <Path d={MARK_PATH} fill={BRAND} />
    </Svg>
  );
}

/** size = 글자 크기(웹 text-2xl = 24) — 로고는 대문자 높이(0.7em)로, 바닥을 글자 기준선에 붙인다 */
export function Wordmark({ size = 24, color }: { size?: number; color: string }) {
  return (
    <View accessible accessibilityRole="header" accessibilityLabel="싱커" style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      {/* DIN Condensed 의 글자 상자 밑은 기준선보다 0.3em 쯤 아래(시작 연출 화면에서 잼) — 그만큼 띄워 로고 바닥을 기준선에 */}
      <View style={{ marginRight: size * 0.05, marginBottom: size * 0.3 }}>
        <SinkerMark height={size * 0.7} />
      </View>
      <Text style={{ fontFamily: 'DINCondensed-Bold', fontSize: size, color, letterSpacing: size * 0.02, lineHeight: size }}>INKER</Text>
    </View>
  );
}
