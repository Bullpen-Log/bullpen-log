import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BRAND, MARK_PATH } from './mark-path';

/**
 * 앱 이름 — 웹 components/logo.tsx 의 Wordmark 와 같은 꼴: 'SINKER' 의 S 자리에 싱커 로고(아래로 꺾인 화살표가 붙은 S), 글자는 좁은 굵은 대문자.
 * 2026-10-22 금윤호: 불펜로그 B + ULLPEN LOG 이던 것을 싱커 로고(초안 · 임시 — 바뀔 수 있다) + INKER 로.
 * 웹은 Bebas Neue 인데 앱에 글꼴 파일이 없어 아이폰에 든 DIN Condensed Bold(같은 좁은 대문자체)로 쓴다.
 * 로고 그림 · 색은 웹 logo.tsx 의 MARK_PATH · --color-brand 와 같다 — 로고를 바꾸면 둘을 같이 고친다.
 */
/** 로고 너비 ÷ 높이(웹 MARK_VIEWBOX 0 0 1006 1001) — 시작 연출이 칸 너비를 셀 때 쓴다 */
export const MARK_ASPECT = 1006 / 1001;
/**
 * 로고 높이 · 내림(2026-10-22 금윤호 "S 로고와 INKER 의 아래 끝이 안 맞는다") — 로고 전체(1001칸) 중 S 몸통(위 ~ 아래 막대, 882칸)이 글자 높이(0.7em)와 같고,
 * 밑의 화살표 끝(119칸)만 기준선 밑으로 내려간다(글자의 내림처럼). 그래서 전체 높이 0.7 × 1001/882 ≈ 0.794em, 기준선 밑으로 0.094em.
 */
export const MARK_EM = 0.7 * (1001 / 882);
export const MARK_DROP = MARK_EM - 0.7;

export function SinkerMark({ height }: { height: number }) {
  return (
    <Svg width={height * MARK_ASPECT} height={height} viewBox="0 0 1006 1001">
      <Path d={MARK_PATH} fill={BRAND} />
    </Svg>
  );
}

/** size = 글자 크기(웹 text-2xl = 24) — S 몸통이 대문자 높이(0.7em), 아래 막대가 기준선에 앉고 화살표만 밑으로(MARK_EM · MARK_DROP) */
export function Wordmark({ size = 24, color }: { size?: number; color: string }) {
  return (
    <View accessible accessibilityRole="header" accessibilityLabel="싱커" style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      {/* DIN Condensed 의 글자 상자 밑은 기준선보다 0.3em 쯤 아래(시작 연출 화면에서 잼) — 그만큼 띄워 로고 바닥을 기준선에 */}
      <View style={{ marginRight: size * 0.05, marginBottom: size * (0.3 - MARK_DROP) }}>
        <SinkerMark height={size * MARK_EM} />
      </View>
      <Text style={{ fontFamily: 'DINCondensed-Bold', fontSize: size, color, letterSpacing: size * 0.02, lineHeight: size }}>INKER</Text>
    </View>
  );
}
