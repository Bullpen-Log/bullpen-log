import { Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from 'react-native';

/**
 * 앱 화면(src/)이 부르는 'react-native' — metro.config.js 가 src/ 안의 import 'react-native' 를 이 파일로 돌린다(이 파일은 혼자 폴더에 둔다 — 까닭은 거기).
 * 글은 웹처럼 Pretendard(2026-10-20 대조 검토 — 웹은 Pretendard, 앱은 SF 라 글자 모양이 달랐다). 파일은 assets/fonts(굵기 여섯, OFL),
 * app.json 의 expo-font 가 앱에 굽는다. 굵기는 fontWeight 그대로 — iOS 가 같은 집안(Pretendard)에서 가장 가까운 굵기를 고른다.
 * 숫자처럼 fontFamily 를 따로 준 글(ui-rounded · DIN)은 그쪽이 이긴다. Animated.Text 는 이 길을 안 타 SF 그대로다.
 * 다른 것은 react-native 그대로 다시 내보낸다(이 파일 안의 'react-native' 는 진짜를 가리킨다).
 */
export * from 'react-native';

const FONT = { fontFamily: 'Pretendard' } as const;

export function Text({ style, ...rest }: TextProps) {
  return <RNText {...rest} style={[FONT, style]} />;
}

export function TextInput({ style, ...rest }: TextInputProps) {
  return <RNTextInput {...rest} style={[FONT, style]} />;
}
