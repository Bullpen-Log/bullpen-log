/**
 * 앱 화면(src/)이 부르는 'react-native' — metro.config.js 가 src/ 안의 import 'react-native' 를 이 파일로 돌린다(이 파일은 혼자 폴더에 둔다 — 까닭은 거기).
 * 글은 웹처럼 Pretendard(2026-10-20 대조 검토 — 웹은 Pretendard, 앱은 SF 라 글자 모양이 달랐다). 파일은 assets/fonts(굵기 여섯, OFL),
 * app.json 의 expo-font 가 앱에 굽는다. 굵기는 fontWeight 그대로 — iOS 가 같은 집안(Pretendard)에서 가장 가까운 굵기를 고른다.
 * 숫자처럼 fontFamily 를 따로 준 글(ui-rounded · DIN)은 그쪽이 이긴다. Animated.Text 는 이 길을 안 타 SF 그대로다.
 *
 * 다른 것은 쓰는 순간에 react-native 에서 꺼낸다(게터) — 예전 `export * from 'react-native'` 는 개발(Debug) 묶음에서 모든 이름을 한꺼번에 읽어
 * 안 쓰는 PushNotificationIOS 까지 깨웠고, 그 부품의 바닥 모듈이 없어 '불펜로그 테스트'가 켜자마자 Uncaught Error 로 멈췄다(2026-10-20). 게터도 Fast Refresh 가 훑으면 깨어나 안 보이게 둔다.
 * 형(type)은 tsconfig 가 진짜 react-native 를 보므로 이 파일은 JS 로 둔다.
 */
const React = require('react');
const RN = require('react-native');

const FONT = { fontFamily: 'Pretendard' };

function Text({ style, ...rest }) {
  return React.createElement(RN.Text, { ...rest, style: [FONT, style] });
}

function TextInput({ style, ...rest }) {
  return React.createElement(RN.TextInput, { ...rest, style: [FONT, style] });
}

/*
 * 굴리는 판의 keyboardShouldPersistTaps 기본값을 'handled' 로(2026-11-24 시뮬레이터 점검). RN 기본 'never' 는 자판이 떠 있으면 판 안의 첫 누름을
 * 자판 닫기에만 써서, 찾기 · 메모를 치던 중 누른 단추 · 칩 · 보내기가 두 번 눌러야 먹었다. 화면 65곳이 손으로 'handled' 를 달았고 다른 값은 없다 —
 * 빠뜨린 곳(투구 찾기 · 내 영상 · 팀 말 쓰기 …)까지 한곳에서. 빈 곳을 누르면 자판은 그대로 닫힌다. 값을 준 곳은 그 값이 이긴다.
 */
function withHandledTaps(Real, name) {
  const C = React.forwardRef(function Scroll(props, ref) {
    return React.createElement(Real, { keyboardShouldPersistTaps: 'handled', ...props, ref });
  });
  C.displayName = name;
  return C;
}

Object.defineProperty(exports, '__esModule', { value: true });
exports.Text = Text;
exports.TextInput = TextInput;
exports.ScrollView = withHandledTaps(RN.ScrollView, 'ScrollView');
exports.FlatList = withHandledTaps(RN.FlatList, 'FlatList');
exports.SectionList = withHandledTaps(RN.SectionList, 'SectionList');
for (const key of Object.keys(RN)) {
  if (key in exports) continue;
  /* 안 보이게(enumerable: false) — 개발 모드의 Fast Refresh 가 src/ 파일의 내보낸 이름을 하나하나 읽어(registerExportsForReactRefresh) 게터를 다 깨웠다.
   * 이름으로 꺼내 쓰는 것(import { View })은 그대로 된다 */
  Object.defineProperty(exports, key, { enumerable: false, get: () => RN[key] });
}
