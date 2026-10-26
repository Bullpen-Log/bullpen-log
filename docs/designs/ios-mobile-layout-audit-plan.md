# 아이폰 앱 레이아웃 원인 분석 및 개선 계획

작성 2026-10-25. 범위: native/ 싱커 앱 우선, 공용 부품을 공유하는 덕아웃 앱의 회귀 점검 포함.
상태: 코드 분석 및 재현 계획. 앱 화면 수정·빌드·배포 없음.
영어 실행 프롬프트: `ios-mobile-layout-claude-prompt.md`.

## 1. 확인 범위와 확실성

사용자 증상: 화면 열기 후 내용 잘림, 과대한 창/요소, 휴대폰 화면 비율과 맞지 않는 배치.
이 증상이 발생하는 구체적인 화면·기종·글자 설정은 아직 지정되지 않았다. 따라서 모든 현상을 하나의 버그로 확정하지 않는다.

실제 파일에서 확인한 값과 경로를 아래에 기록한다. 특정 UI가 실제로 가려지는지는 기기에서 재현해야 한다. 정규식 검색은 위험 후보 발굴 도구이며 버그 판정이 아니다.

- `native/`는 Expo ~58, React Native 0.88.0 기반. 실제 설치 버전/API는 구현 시작 때 재확인.
- `native/app.config.js`: 싱커 기본, APP_VARIANT=dugout 시 별도 덕아웃 앱. 같은 공용 부품을 사용한다.
- `native/app.json`: portrait, supportsTablet=true. 휴대폰 회전을 무조건 지원하도록 바꾸는 작업은 범위 밖. iPad 창 크기와 시스템 presentation 크기 변화는 따로 검증.
- `native/src/app/index.tsx`: 네이티브 탭 화면과 웹뷰를 함께 사용. 웹뷰는 `contentInsetAdjustmentBehavior="never"`.
- 소스 검색: `<Modal>` 사용 파일 11개, `<KeyboardAvoidingView>` 파일 19개, `automaticallyAdjustKeyboardInsets` 파일 11개, safe-area hook 파일 80개. 사용 개수 차이가 곧 누락 또는 중복을 입증하지 않는다.
- 시뮬레이터 목록에는 iOS 27.0 iPhone 18 Pro Booted가 있었지만, UI 도구의 앱 목록에서는 Simulator를 찾지 못했다. 실제 앱 화면을 관찰하거나 잘림을 재현했다고 주장하지 않는다. CLI 기기 부팅 상태와 화면 자동화 가능 여부는 다른 문제다.
- 앱 본체가 런타임을 차지하는 경우, Safari의 좁은 브라우저 화면만으로 검증하지 않는다.

## 2. 근본적인 구조 문제

휴대폰에서 사용 가능한 공간은 고정된 ‘화면 높이’가 아니다. 상태바·홈 인디케이터·상단 탐색·떠 있는 탭·하단 행동·시트·키보드가 차지하는 영역에 따라 달라진다. 이 공간의 계산 책임이 화면마다 흩어져 있으면 여백을 두 번 넣거나 하나를 빠뜨리기 쉽다.

또 네이티브 화면, 시스템 pageSheet/formSheet, 커스텀 투명 Modal, 웹뷰 안 웹 모달은 각자 좌표계와 안전영역이 다르다. 전체 폰 크기를 기준으로 계산한 UI가 작은 시트 안에 들어가면 너무 커질 수 있다.

해결 원칙: 실제 부모 영역을 기준으로 배치하고, 가장 바깥에서 각 가림 영역의 소유자를 정하고, 넘치는 본문은 스크롤시킨다. 글자·터치 영역을 일괄 축소해서 맞추지 않는다.

## 3. 근거별 우선순위

### P0: 더보기 폴더에 콘텐츠 길이 제한/스크롤이 없음

- `native/src/app/more.tsx`: 타일은 `max(40, min(52, (height - 34*16)/5))`로 결정.
- 그룹·권한에 따라 항목 수가 바뀌는데 전체 body는 View이고, 폴더 내부는 overflow:hidden.
- 폴더 바깥은 inset.top 및 inset.bottom+72를 띄운다.

확인된 구조: 표시 가능한 높이보다 내용이 많아졌을 때의 명시적인 스크롤 경로가 없다. 실제 잘림 범위는 일반/관리자/잠금 메뉴 및 큰 글자로 재현해야 한다.
개선: 제한된 최대 높이 안에 머리·닫기 영역과 스크롤 가능한 메뉴 본문을 둔다. 항목이 늘어도 모두 도달 가능해야 한다. 본문 스크롤과 닫기 drag 제스처가 다투지 않게 구분한다. 타일을 계속 작게 만드는 방법은 쓰지 않는다.

### P0: 입력 시트의 키보드 대응이 서로 다름

- `native/src/workout/sheets.tsx`: fit=true는 투명 Modal, maxHeight:'88%', 내부 ScrollView, footer 고정. 해당 분기에 KeyboardAvoidingView는 없다.
- fit=false 분기는 pageSheet + KeyboardAvoidingView를 사용.
- `native/src/velocity/abs/batter-chip.tsx`: 신장 입력에서 autoFocus/number-pad 사용. 자체 sheet에 KeyboardAvoidingView나 ScrollView가 없다.

확인된 구조: 짧은 시트 안에 키보드가 생겼을 때 사용할 일관된 정책이 없다. RN/시스템의 실제 보정 여부는 재현 필요.
개선: 입력이 있는 시트의 소유자를 하나 정하고 실제 키보드 겹침을 반영. 머리/닫기/확인 행동은 도달 가능, 본문은 스크롤. 한 화면에 자동 키보드 inset과 별도 높이 보정을 무조건 동시에 적용하지 않는다. 하드웨어 키보드·숫자패드·한국어 입력·오류 문구 확장도 확인한다.

### P0: 하단 가림 공간의 계약이 암묵적

- `native/src/shell/tab-bar.tsx`: ITEM_H=52, PAD=4, gap=max(inset.bottom-13,12), TAB_BAR_HEIGHT=49.
- `native/src/app/index.tsx`는 49를 각 탭 bottom으로 전달.
- home/pitch/training/nutrition 탭의 본문은 여러 곳에서 bottom+24를 사용.

중요: 49는 주석상 예전 탭과 위치를 맞추기 위한 호환 값이다. 숫자가 다르다는 사실만으로 버그로 단정하거나 60으로 일괄 치환하지 않는다.

계산 예시: 현재 코드의 알약 높이는 52+4*2=60, bottom inset=34인 조건의 gap은21, 따라서 화면 바닥에서 알약 상단까지는 약81이다. 본문 padding=49+24=73만 적용되고 추가 inset이 없다고 가정하면 마지막 내용 여유가 부족할 수 있다. 실제로는 scroll inset/부모 safe area가 추가될 수 있으므로 물리적으로 측정한다.

개선: `tabHeight`와 `bottomOcclusion`을 구분하고, 실제 가리는 범위를 단일 hook/context/측정값으로 공유한다. 탭이 없으면 0, 탭 위에 footer가 있으면 합집합으로 계산한다. 마지막 항목을 스크롤해 탭 위로 충분히 올릴 수 있는지 확인한다.

### P1: 시스템 시트·커스텀 시트의 최대 크기 계약 불일치

- `_layout.tsx`: notice/pitch import는 formSheet fitToContents, settings/profile/pitch edit 등은 modal, more는 transparentModal.
- `workout/sheets.tsx`: fit custom maxHeight88%, 다른 경로 pageSheet.
- 여러 기능이 개별 Modal을 직접 만든다.

개선: 짧은 확인/선택, 중간 길이 편집, 긴 작업을 구분한다. 긴 작업이 full screen인 것은 정상일 수 있으며 닫기와 본문 접근성이 기준이다. 짧은 내용은 필요한 높이만, 긴 내용/큰 글씨는 최대 높이+스크롤 또는 전체 화면으로 승격. detent API는 현재 설치 버전에서 확인한다. fitToContents와 flex:1 본문을 무조건 조합하지 않는다.

### P1: 전체 창 폭 기준과 실제 부모 폭 기준 혼동

- `shell/tab-pager.tsx`: useWindowDimensions().width로 페이지·트랙 폭 계산.
- `lib/layout.tsx`: READABLE maxWidth720, TwoColumns 기준900.
- `dugout/app/venues.tsx`: 지도 높이300.
- 미디어는 몇 곳에서 maxHeight420 + 고정 aspectRatio를 함께 사용.

이 값들은 각각 타당할 수 있다. 하지만 부모가 더 좁은 시트/패널/안전영역이면 전체 window 폭이 과대해질 수 있다.
개선: 실제 viewport를 담당하는 부모 onLayout과 hook을 용도에 맞게 선택. 미디어는 사용 가능한 폭과 세로 예산 모두에 맞춰 비율 보존. 최대 크기를 줄여도 width/height가 같이 맞아야 한다. 지도300을 무조건 변경하지 않고 작은 화면에서 지도와 선택 카드·목록에 쓸 공간을 함께 확인한다.

### P1: 큰 글자·긴 한글과 고정 높이의 결합

- 기본 토큰: title34, hero30, card17, body15. 크기 자체가 버그라는 근거는 없다.
- 여러 버튼/행/탭은 height44/48/52로 고정.
- RN shim은 Text/TextInput에 Pretendard를 적용하고 Animated.Text는 다른 경로를 탄다는 주석이 있음.

개선: 중요한 본문과 행동은 줄바꿈 가능, minHeight 중심. 좁은 화면에서 버튼을 세로로 바꾸고 긴 단위/오류 문구를 따로 둔다. font scaling을 전체 비활성화하지 않는다. 실제 fontScale과 글꼴 ascent/descent가 컨테이너에 맞는지 검사한다. 본문과 Animated.Text 글꼴 차이를 확인하되 임의의 전역 shim 수정은 피한다.

### P1: 네이티브와 웹뷰가 같은 여백을 서로 가정

- 싱커·덕아웃 모두 webview contentInsetAdjustmentBehavior=never.
- 웹은 CSS safe area/viewport와 Expo bridge 및 별도 탭 숨김 규칙을 사용.

개선: 화면별로 native/webview 소유권 표를 만든다. 상태바/상단 메뉴/하단 탭/키보드 중 누가 보정하는지 명확히 한다. WKWebView 실제 크기·JS innerHeight·visualViewport.height·safe-area CSS 및 native inset을 같은 상황에서 기록. 웹과 네이티브가 둘 다 탭 여백을 추가하거나 둘 다 빠뜨리지 않게 한다. UA와 bridge 메시지를 보존한다. PC CSS 개편을 앱 레이아웃 수정으로 착각하지 않는다.

## 4. 재현 조사 방법

각 사례를 다음 형식으로 기록한다.

`앱 변형 / 앱 버전·commit·update ID / iOS / 기기 논리 크기 / 글자 크기·Display Zoom / 진입 경로 / native 또는 webview / 입력·키보드 상태 / 기대 결과 / 실제 결과 / 원인 / 수정 소유자 / 전후 증거`

측정 항목:
- root/presentation/scroll viewport의 onLayout 너비·높이
- safe area top/bottom/left/right
- 화면·시트 제목과 footer 높이
- 실제 tab 상단 위치와 보이는 여부
- 키보드의 screen-space frame과 해당 window와의 실제 교집합
- contentSize, scroll offset 및 마지막 행동의 위치
- fontScale, 중요한 Text onTextLayout, 예외적인 긴 내용

서로 다른 좌표계를 빼지 않는다. 키보드·화면·측정 rect가 같은 좌표계인지 확인한다. 계정 데이터/건강 정보/사진/채팅 내용을 진단 로그로 전송하지 않는다. 진단은 개발용, 메모리/로컬 중심이며 작업 뒤 제거 또는 비활성화.

## 5. 제안하는 공통 레이아웃 계약

새 프레임워크를 만들지 않고 현재 공용 틀을 확장한다.

1. Screen: bounded flex root + top/bottom safe-area 소유권.
2. Scroll screen: 고정 header, 유한한 scroll viewport, 마지막 항목이 행동 영역 위로 올라갈 수 있는 여백.
3. Form screen: 위 규칙 + 하나의 keyboard 대응 + focused input/에러/제출 도달 보장.
4. Short sheet: 콘텐츠 크기 기반, presentation 실제 bounds로 상한, body만 스크롤, 닫기 접근성.
5. Long task: full screen 또는 큰 시스템 sheet, 연속 입력·작업 손실 방지.
6. Media/camera: 전체 프리뷰와 안전영역 안 조작부 분리. 미디어 크기와 좌표 변환은 함께 보정.

개념식:

- 실제 가용 본문 = presentation 영역 − 소유 중인 header/footer/겹침 영역.
- 겹침 영역은 tab·키보드·safe area의 단순 합계가 아니라 실제 배치와 중복 영역을 고려.
- 정상 크기의 본문은 자연스럽게 스크롤. 시트를 화면에 꽉 채우지 않기 위해 필수 내용을 자르지 않음.

## 6. 작업 순서

### 0: 재현과 경로 목록

앱 두 변형과 화면별 render mode를 확인. 현재 사용자 증상을 재현할 수 있으면 우선 기록하고, 지정된 사례가 없어도 아래 대표 흐름의 경계 조건을 조사한다. 원격 TestFlight 버전과 로컬 코드 일치도 기록.

### 1: 공용 경계부터

root safe area, tab occlusion, scroll 하단, sheet 부모 크기, keyboard 소유권을 정리. safe area provider가 파일에 안 보인다고 바로 추가하지 말고 Expo Router가 제공하는 실제 provider tree부터 확인.

### 2: 위험도가 높은 화면

더보기 → 설정/프로필 → 운동 교체·메모·마치기 → 입력 시트(ABS 신장·영양 목표·기록 편집) → 홈·투구·트레이닝·영양의 마지막 콘텐츠 → 댓글/문의 입력.

### 3: 미디어·웹뷰

영상·3D·카메라 조작부, 캘린더 팝오버, 웹뷰 체크인/기타 경로, 덕아웃 지도/장터/폼을 점검. 카메라 crop 좌표와 오버레이 원점이 바뀌면 측정 로직을 바꾸지 않아도 결과가 어긋날 수 있어 반드시 실기기 확인.

### 4: 비교 검증과 배포 분류

같은 fixture/글자 설정으로 전후 비교. JS 수정은 현재 OTA 호환성을 확인하고, 네이티브 패키지/plugin/바닥 코드 변경은 새 build 필요 여부를 확인. localhost:3000 갱신이 아이폰 native 화면 업데이트를 뜻하지 않음. 현재 앱이 Metro/개발 빌드/Release OTA 중 무엇을 쓰는지 정확히 보고.

## 7. 검증 행렬

- 작은 폰: 375×667 pt 수준, 짧은 화면 및 bottom inset이 작은 조건.
- 보통 폰: 390×844 또는 실제 지원되는 비슷한 논리 크기.
- 큰 폰: 430×932 또는 현재 설치 runtime에서 지원되는 비슷한 기기.
- 사용자의 실제 기기 설정은 확보되면 우선 포함.
- 각 조건: 기본 글자, 큰 글자/접근성 글자, Display Zoom 가능한 조건, 키보드 닫힘/열림.
- 문자열: 긴 제목·사용자 이름·버튼·검증 오류·여러 줄 설명.
- 데이터: 0/1/많은 항목, 관리자/일반/잠금 메뉴.
- presentation: 페이지·짧은 시트·긴 시트·중첩 전환·뒤로·재열기.
- 덕아웃 앱 공용 부품 회귀, iPad 지원 조건 회귀.
- simulator가 없는 하드웨어 기능은 실기기 확인 항목으로 남김.

처음에는 작은/보통 폰과 입력 시트로 빠르게 공통 원인을 좁힌 뒤 나머지에 확장한다. 모든 상태 조합을 무차별로 다 돌리는 방식은 피한다.

## 8. 완료 기준

- 중요 텍스트·닫기·완료·저장·주문 행동은 정상 레이아웃/스크롤로 접근 가능.
- 마지막 항목이 탭/홈 인디케이터/고정 footer 아래에 숨지 않음.
- 입력 중 포커스 필드·검증 오류·제출이 도달 가능하고 키보드 닫은 뒤 빈 공간이 남지 않음.
- 긴 콘텐츠가 터치 영역 축소 대신 자연스럽게 늘어나거나 스크롤.
- 더보기 항목 수가 늘어도 끝 항목까지 접근 가능.
- 짧은 팝업은 필요한 높이, 긴 작업은 적절한 큰 presentation. 전체 화면 자체를 버그로 간주하지 않음.
- 카메라·영상·3D의 비율과 오버레이 정합성 보존.
- 전역 scale transform, font scaling 비활성화, 임의 전역 음수 margin으로 봉합하지 않음.
- 확인한 기기·앱 버전·조건·전후 화면과 미확인 항목을 구분해 보고.

## 참고 자료

공식 자료로 원칙을 확인했으며 실제 구현 API는 설치된 RN/Expo/react-native-screens 버전에 맞춰 재확인한다.
- https://reactnative.dev/docs/usewindowdimensions — window·fontScale 변화 감지.
- https://reactnative.dev/docs/keyboardavoidingview — 키보드에 따른 높이/위치/여백 조정.
- https://reactnative.dev/docs/scrollview — bounded parent와 스크롤 크기, inset 처리.
