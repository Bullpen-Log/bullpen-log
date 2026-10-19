import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * 앱 이름 — 웹 components/logo.tsx 의 Wordmark 와 같은 꼴: 'BULLPEN LOG' 의 B 자리에 로고(막대 하나 + 반원 둘), 글자는 좁은 굵은 대문자.
 * 웹은 Bebas Neue 인데 앱에 글꼴 파일이 없어 아이폰에 든 DIN Condensed Bold(같은 좁은 대문자체)로 쓴다.
 * 로고 그림 · 색은 웹 logo.tsx 의 MARK_PATH · --color-brand 와 같다 — 로고를 바꾸면 둘을 같이 고친다.
 */
const MARK_PATH = 'M0 0H237V613H0Z' + 'M281 0H453A125 141 0 0 1 453 282H281Z' + 'M281 329H470A124 142 0 0 1 470 613H281Z';
const BRAND = '#0297e4';

export function BullpenMark({ height }: { height: number }) {
  return (
    <Svg width={(height * 594) / 613} height={height} viewBox="0 0 594 613">
      <Path d={MARK_PATH} fill={BRAND} />
    </Svg>
  );
}

/** size = 글자 크기(웹 text-2xl = 24) — 로고는 대문자 높이(0.7em)로, 바닥을 글자 기준선에 붙인다 */
export function Wordmark({ size = 24, color }: { size?: number; color: string }) {
  return (
    <View accessible accessibilityRole="header" accessibilityLabel="BULLPEN LOG" style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      {/* DIN Condensed 의 글자 상자 밑은 기준선보다 0.3em 쯤 아래(시작 연출 화면에서 잼) — 그만큼 띄워 로고 바닥을 기준선에 */}
      <View style={{ marginRight: size * 0.07, marginBottom: size * 0.3 }}>
        <BullpenMark height={size * 0.7} />
      </View>
      <Text style={{ fontFamily: 'DINCondensed-Bold', fontSize: size, color, letterSpacing: size * 0.02, lineHeight: size }}>ULLPEN LOG</Text>
    </View>
  );
}
