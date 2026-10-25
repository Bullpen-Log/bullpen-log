# 덕아웃 PC 정보 구조 · 시각 디자인 개편 설계

작성일: 2026-10-25. 상태: 실제 브라우저 관찰 + 코드 분석 + 개선 제안. 제품 코드 변경 없음.
참고: https://www.plabfootball.com/ (홈 및 스크롤 후 경기 목록 직접 확인)
이 문서는 앞선 장터 커머스 계획의 PC 레이아웃·시각 설계를 구체화한다. 결제·인증·거래 보호 요구사항은 기존 계획을 유지한다.

## 조사 범위와 한계

- 로컬 localhost:3000의 비로그인 홈, 장터, 커뮤니티, 레슨, 연습장, 경기 화면을 실제 브라우저에서 확인.
- 장터 측정 시 CSS viewport 1280×720, devicePixelRatio=1, main 폭 1152px, main 시작 y≈60.8px, 첫 h1 y≈281.3px·26px, 첫 사진 시작 화면 관찰 약 327px.
- 플랩은 별도 탭의 1101×876 화면에서 관찰. 첫 방문 안내를 닫고 홈·스크롤 후 경기 목록을 확인. 검은 배경/연두 강조 테마가 보였음. 모든 사용자에게 같은 테마라고 단정하지 않음.
- 두 서비스의 viewport·테마가 다르므로 같은 조건의 픽셀 성능 비교가 아니다. 실제 구성과 읽기 순서를 비교했다. 1536×700·1920×960은 구현 후 검증할 목표 크기이며 현재 실측값이 아니다.
- 지도 첫 캡처는 빈 로딩 영역이었지만 이후 접근성 트리에 지도·마커·확대/축소가 나타남. 지도 장애로 단정하지 않음.
- 경기 첫 캡처도 스켈레톤이었으며 완료 후 일정이 표시됨. 로딩 중 모습을 최종 디자인으로 평가하지 않음.
- 비로그인 화면에서 관찰한 내용이며 로그인·관리자·앱 웹뷰는 회귀 점검 대상으로 남김.

## 1. 결론

문제는 정보의 총량보다 ‘정보가 쓰는 자리와 시각적 우선순위’다. 현재는 실제 정보가 적은 영역이 화면을 크게 차지하고, 비교해야 할 정보는 작고 좁게 압축되어 있다. 큰 여백과 작은 글자가 동시에 존재해서 허전하면서도 난잡하게 느껴진다.

개편 목표는 모든 정보를 한 화면에 욱여넣는 것이 아니다. 첫 화면에서 사용자가 (1) 지금 어디인지, (2) 어떤 조건으로 보고 있는지, (3) 실제 선택지는 무엇인지, (4) 다음 행동은 무엇인지 바로 파악하게 한다.

## 2. 플랩에서 가져올 원리

관찰한 플랩에도 홍보 팝업·배너·많은 필터가 있다. ‘아무것도 없는 미니멀 사이트’라서 좋아 보이는 게 아니다.

1. 전역 메뉴는 소셜 매치·게스트·팀·구장 예약으로 서비스 구분을 담당한다.
2. 왼쪽 세로 영역은 지역·상태·시간·경기 유형·성별·레벨·시설 등 조건을 담당한다.
3. 오른쪽 위 날짜는 경기 목록의 기준을 담당한다.
4. 반복 목록은 사진 → 시간/상태 → 구장명 → 경기 방식/부가 정보의 순서가 안정적이다.
5. 실제 구장 사진이 내용과 분위기를 동시에 만든다.
6. 강조색이 선택 날짜와 상태 등에 모여 있고 모든 텍스트가 같은 강도로 주장하지 않는다.

채택: 역할 분리, 일정한 행 구조, 비교 가능한 정보 정렬, 실제 콘텐츠 중심.
비채택: 첫 방문 홍보 팝업, 대형 회전 배너, 연두색 브랜드 자체, 축구용 항목의 무분별한 복사.

## 3. 원인과 근거

| 우선순위 | 원인 | 실제 근거 | 개선 |
| --- | --- | --- | --- |
| P0 | PC 상단에 목적이 겹치는 줄 누적 | 장터 전역 메뉴→품목 줄→8개 바로가기→제목→사진. 글러브·배트·보호구 등이 품목과 바로가기 양쪽에 있음 | 메뉴·필터·행동을 분리. PC의 큰 바로가기 판 제거. 등록은 헤더 오른쪽 버튼, 찜·채팅은 계정 도구로 |
| P0 | 실제 상품보다 기능 소개가 먼저 보임 | 상품 시작 약 y327, 720px 높이의 약 45%를 먼저 지나감 | 첫 결과 y200~240 안쪽을 설계 목표로. 글자를 줄이는 대신 중복 줄을 삭제 |
| P0 | 고정된 6열이 읽기 폭을 훼손 | xl:grid-cols-6, main max-w-6xl. 1280px에서 사진 약 174px, 제목·규격 truncate | 상품 카드 최소 200~220px를 출발점으로 열 수 조정. 왼쪽 필터 사용 시 결과 폭 기준 3~4열, 사이드바 없으면 4~5열 |
| P0 | 추상 이미지가 콘텐츠의 대부분을 차지 | 장터 파스텔 도형 이미지. scripts/market-dummy-2026-10-25.mjs의 SVG→JPEG 샘플 생성 확인 | 실제 권리 확보된 장비 사진으로 시안 평가. 운영 데이터 교체는 별도 승인. 상품 증거 이미지를 AI로 미화하지 않음 |
| P0 | 사진이 없는 코치에게 큰 사진 칸 할당 | 사진 대신 큰 정사각형 첫 글자, 아래 실제 코치 정보는 작음 | 사진 없을 땐 작은 아바타가 있는 비교형 행. 사진을 확보하면 작고 일정한 얼굴/시설 이미지 활용 |
| P1 | 홈이 콘텐츠 진입보다 출발 화면 연출에 치우침 | 큰 로고·검색·아이콘·소식 띠·옆 경기판 뒤로 상품이 밀림. 홈에서 상단 메뉴 숨김 | 공통 헤더 유지, 작은 검색/요약 아래 실제 콘텐츠 시작. 자연스러운 스크롤 |
| P1 | 상단과 본문의 치수 규칙 혼재 | globals.css의 desktop --spacing=.2rem 및 text 재정의, ui-chrome 복원, 별도 26px/72px 고정값 공존 | 덕아웃 전용 의미 기반 치수·타이포 토큰. 전역 spacing을 한 번에 바꾸지 말고 경로별 이행 |
| P1 | 정렬축이 일정하지 않음 | 큰 바로가기 줄은 중앙, 제목·결과는 왼쪽; 홈은 중앙 검색, 섹션은 왼쪽 | 콘텐츠 왼쪽 기준선 고정. 결과 수·정렬·행동은 같은 도구 줄에 배치 |
| P1 | 기본 화면과 필터 화면의 사용법 변화 | market/page.tsx의 !landing 조건 안에 지역·상태·정렬 노출, 지역 전체를 칩으로 펼침 | 언제나 같은 위치에서 필터 접근. 지역은 드롭다운/검색 팝오버, 선택값만 요약 |
| P1 | 계층 차이가 약함 | 반복 굵은 제목, 같은 모양의 선택/이동/행동, 메타 정보 한 줄 연결 | 이동=텍스트/탭, 필터=입력/체크, 주요 행동=채움 버튼. 카드 메타는 의미별 줄로 분리 |
| P1 | 빈 데이터와 적은 데이터를 큰 면적으로 표현 | 커뮤니티 py-20 빈 상태; 경기 날짜 띠는 전폭, 한 경기는 3열 중 한 칸 | 빈 상태 120~160px 정도의 짧은 안내, 적은 경기에도 자연스러운 목록형. 가짜 내용으로 채우지 않음 |
| P2 | 장식성 제어와 동작이 콘텐츠보다 부각 | 떠 있는 알약 헤더·그림자·blur, HomeSnap이 wheel/touch/key를 가로채 A/B 전환 | PC는 평평한 헤더·얇은 경계, 일반 문서 스크롤. 모션은 피드백에만 |
| P2 | 기능처럼 보이는 장식 | ListingCard의 흰 하트는 별도 찜 버튼이 아니라 상품 링크 내부 장식 SVG | 실제 접근 가능한 찜 버튼으로 만들거나 제거. 링크 안에 버튼 중첩하지 않음 |

‘AI 느낌’은 AI 사용 여부의 판별이 아니다. 반복된 추상 이미지, 의미 없는 큰 타일, 서로 다른 화면 양식의 혼합, 불명확한 계층이 주는 시제품 인상을 말한다. 사용자가 준 아이콘 자체가 문제라는 근거는 없으므로 아이콘을 다시 만들지 않는다.

## 4. PC 공통 레이아웃

### 상단

높이 약 64px의 안정적인 전역 헤더: 로고 / 커뮤니티·장터·레슨·연습장·경기 / 검색 / 채팅·알림·계정. 홈은 로고 링크로 충분한지 시안에서 검토. 로그인 상태에서 도구 수가 늘어도 메뉴가 밀리지 않게 실제 폭을 검증한다. 모든 도구를 무조건 상시 노출하지 않고 낮은 빈도 작업은 계정 메뉴로 묶는다.

상단은 페이지마다 위치·높이가 바뀌지 않는다. PC의 본문을 떠 있는 큰 알약이 덮는 모양은 평평한 흰 면과 얇은 구분선으로 완화한다. 브랜드 초록은 유지한다.

### 세 가지 기본 틀

A. 검색/비교: 왼쪽 200~216px 조건, 간격 24px, 오른쪽 결과. 장터·레슨에 적용.
B. 읽기/피드: 글 목록 720~840px, 필요할 때만 240~280px 보조 칸. 커뮤니티·일부 홈.
C. 지도/공간: 장소 목록 340~380px + 지도 나머지. 연습장.

전체 컨테이너 최대 폭은 1200~1280px를 초기안으로 한다. 1280px viewport에서는 양쪽 최소 24px 여백을 확보하고 카드 최소 폭에 맞춰 열을 줄인다. 화면 폭을 끝까지 채우는 것을 목표로 하지 않는다. 사이드바는 전역 메뉴가 아니라 현재 화면의 조건만 담당한다.

## 5. 첫 화면의 세로 공간 예산

초기 제안, 실제 구현에서 검증:

- 전역 헤더 64px
- 본문 위 여백 24px
- 제목+주요 행동 32~36px
- 간격 16px
- 조건 요약/정렬 36~40px
- 결과 앞 간격 16~24px
- 실제 결과 시작 y188~204px, 복잡한 경우에도 y240px 이내 목표

목표는 1536×700에서 결과와 핵심 행동이 바로 보이는 것. 시장 카드 3~4개 한 줄은 사진·제목·가격·핵심 상태까지 온전히 읽힌다. 커뮤니티는 5~7개 행, 코치 3~4개 행을 목표로 하되 자료·줄바꿈·접근성을 우선한다. 결과 개수를 늘리려고 글자를 작게 하거나 높이를 강제로 고정하지 않는다.

## 6. 화면별 설계

### 홈

추천 기본안: 큰 출발 화면을 줄이고 공통 헤더를 유지한다. 메인에는 새 장비 4개 정도와 커뮤니티 주요 글, 오른쪽 보조에는 오늘 경기와 로그인 사용자의 필요한 소식만 배치. 레슨·장소는 아래의 다음 섹션으로 넘긴다. 모든 기능을 첫 화면에 동등한 카드로 넣지 않는다.

첫 화면의 우선순위를 결정한 뒤 요소를 배치한다. 로고·검색 화면을 계속 유지하고 싶다면 160~220px 내외의 작은 도입부로 제한하며 상품/글 일부가 첫 화면 안에 나타나야 한다. 홈의 스크롤 스냅 제거는 제안이며 이번 문서에서 기존 구현을 변경하지 않았다.

### 장터

왼쪽: 품목, 상태, 가격, 거래 방식, 필요한 경우 지역. 선택 품목에 맞는 규격 필터.
오른쪽 위: '장터' 또는 선택 품목, 결과 수, 정렬, 물건 올리기.
오른쪽 본문: 3~4열을 기본으로 결과 폭에 따라 조정. 제목 최대 2줄, 가격 한 줄, 핵심 규격/상태 1~2줄. 여러 규격을 전부 가운데점으로 이어 붙이지 않는다. '없음·모름'은 목록에서 생략하고 필요한 경우 상세에 라벨과 함께 표시.

상품 카드 사진 비율은 목록에서 일정하게 유지하고 상세에서 전체 비율을 보장한다. 첫 화면의 예약/완료 품목 표시도 가독성을 검토한다. '오늘의 추천'은 실제 추천 로직이 확인되지 않으면 '최근 올라온 장비' 등 정확한 이름으로 교체.

### 커뮤니티

상단 제목+글쓰기, 게시판 탭 한 줄, 검색·정렬 도구 줄, 반복되는 글 행. 중앙 아이콘 메뉴는 PC에서 제거. 제목을 가장 읽기 쉽게 하고 작성자·댓글·시간은 같은 열/위치에 고정한다. 빈 게시판은 간결한 안내와 첫 글 버튼으로 충분하다. 자료 없는 인기글/공지 칸을 억지로 채우지 않는다.

### 레슨

주요 목적을 '맞는 코치 찾기'로 정한다. 왼쪽은 지역·분야·가능 시간·가격. 오른쪽은 코치 비교 행: 작은 사진/아바타, 이름과 전문 분야, 장소, 가능 시간, 가격, 실제 후기 수. '추천 코치'와 '오늘 가능'에 같은 코치가 반복되면 한 목록에서 조건으로 고르게 한다. 없는 인물 사진을 생성하지 않는다.

### 연습장

현재 목록+지도 구조는 유지할 가치가 있다. 상단 도구를 줄이고 남은 viewport 높이를 지도와 목록에 배정한다. 지도와 목록의 선택 상태를 연결하고, 위치·거리·가격·이용 가능 여부를 일정한 행에 배치한다. 지도 로딩/실패/재시도 상태를 별도로 제공한다. 로딩 중 빈 면적을 완성 화면으로 오해하게 하지 않는다.

### 경기

리그와 날짜 선택은 유지. 경기당 '시각/상태 | 원정팀 점수 : 점수 홈팀 | 구장/선발' 구조의 일정한 행. 날짜 7개가 넓은 화면에 과하게 퍼지지 않도록 콘텐츠 폭에 맞춘다. 경기 0개·1개·여러 개 모두 자연스러운 구성. 경기 없는 날을 가짜 정보로 채우지 않는다.

## 7. 디자인 규격 제안

- PC 본문 14~15px, 핵심 항목 이름 15~16px, 보조 12~13px, 페이지 제목 24px 안팎, 섹션 제목 18~20px. 모두 제안값이며 200% 확대에서 검증.
- 보통 400, 강조 600, 제목/가격 700. font-black은 상시 기본값에서 제외.
- 회색 보조 글도 충분한 대비 확보. 옅은 색으로 ‘깔끔함’을 만들지 않는다.
- 여백 단계 4/8/12/16/24/32/48. 관련 항목은 가깝게, 섹션 사이만 크게.
- 이미지 모서리 8~12px, 입력/버튼 8~10px, 팝오버 12~16px를 출발점으로. 알약은 선택 상태 등 제한된 용도.
- 그림자는 떠 있는 메뉴·팝오버에 집중. 모든 본문 카드에 테두리+그림자+배경을 동시에 쓰지 않는다.
- 사용자가 제공한 아이콘 유지. 아이콘으로 전체 화면의 시각 콘텐츠를 대신하지 않는다.
- 통일할 것은 의미와 계층이다. 장터와 지도와 글 목록을 모두 같은 카드 구조로 만들지 않는다.

## 8. 구현 순서 및 위험 관리

1. **기준 화면 확보**: 동일한 viewport와 테마에서 현행 홈·장터·레슨·커뮤니티 캡처. 실제 콘텐츠와 부족한 콘텐츠 두 세트로 평가. 이번 관찰의 서로 다른 viewport를 그대로 비교 지표로 사용하지 않는다.
2. **시각 기준 확정**: 장터와 레슨의 PC 시안 두 개부터. 라이선스/소유권이 확보된 실제 사진을 사용한 비공개 로컬 fixture; 운영 DB에 가짜 상품/후기 생성 금지. 사진 없는 상태도 같이 설계.
3. **공통 토대 정리**: 덕아웃 전용 컨테이너·타이포·여백·제어 스타일 도입. globals.css의 전체 --spacing을 한 번에 변경하지 않음. 기존 싱커·관리자·휴대폰 영향 차단.
4. **장터 적용**: 큰 바로가기 제거, 필터 위치 고정, 최소 카드 폭, 두 줄 제목, 규격 요약, 실제 찜 행동. 상세/결제 요구는 기존 커머스 계획과 병행.
5. **레슨·커뮤니티 적용**: 비교형 코치 행, 글 목록 열 정렬. 실데이터와 빈 상태 모두 점검.
6. **홈 재구성**: 공통 헤더 유지, 첫 콘텐츠 위로, 로고 도입 축소/제거, 일반 스크롤. HomeSnap와 관련 CSS/data 속성은 의존성 조사 후 함께 정리.
7. **지도·경기 최적화**: 지도 viewport와 상태 처리, 경기의 적은 데이터/많은 데이터 대응.
8. **최종 검증**: 1280×720, 1536×700, 1920×960. 폰·태블릿은 회귀 확인. 확대·키보드·동작 줄이기·긴 한글·로딩·이미지 실패도 확인.

실행 중 다른 세션이 바꾼 파일은 매 단계 상태를 다시 확인한다. `dugout-topbar.tsx`는 싱커/관리 화면에서도 공유하므로 전역 수정 전에 brand/variant 범위를 검토한다. `dugout:test`의 이전 시각 기준도 새 기준에 맞는지 검토하고 무조건 테스트만 통과하도록 코드를 왜곡하지 않는다.

## 9. 완료 기준

- 장터/레슨/커뮤니티의 첫 결과 시작 y≤240px를 기본 텍스트 크기의 데스크톱에서 목표로 측정.
- 네비게이션/큰 바로가기에 같은 품목·같은 행동을 중복 노출하지 않음.
- 상품명 2줄과 최소 핵심 규격이 읽히며 핵심 정보가 줄임표에만 의존하지 않음.
- 사용자는 5초 안에 현재 위치, 조건 변경 위치, 첫 결과, 주요 행동을 설명할 수 있음. 3~5명 소규모 사용성 확인으로 평가하며 성공률을 미리 지어내지 않음.
- 필터링 전후에 도구 위치가 유지되고 뒤로 가기 시 목록 위치·조건 복원.
- 사진 있는 상태뿐 아니라 사진 없음·0개·1개 결과에서도 완성된 레이아웃.
- 정상 스크롤을 가로채지 않고 sticky 영역이 내용을 가리지 않음.
- ‘모든 정보가 한 화면 안에 들어옴’은 완료 조건이 아니다. 첫 판단이 가능한지가 조건이다.

## 10. 클로드용 실행 추가 지침 (English)

Use this specification together with `dugout-market-commerce-claude-prompt.md`. This document takes precedence for desktop layout and visual hierarchy; retain that prompt's payment, identity and transaction-safety requirements.

The user wants the disciplined information structure of https://www.plabfootball.com/, not a pixel copy. Retain DUGOUT branding and supplied icons. Do not reintroduce category hero carousels, invent live content, or create generated seller/product evidence. The current issue is competing navigation, wasted pre-content height, six narrow product columns, low-information placeholders and inconsistent sizing rules.

First audit the current checkout and existing modifications. Build a desktop-first reference for market and lessons using honest, authorized photography and local fixtures where necessary. Make global navigation stable; use a local filter sidebar only where comparison benefits from it. Remove desktop shortcut tiles that duplicate categories or tools. Keep a compact title/action row and stable filter/sort controls. Target first results within approximately 200–240 CSS pixels of the viewport top at default text size, without making body text smaller or forcing viewport-height clipping.

Use layout by content type: photo grid for products, comparison rows for coaches, text rows for community, list/map split for venues and consistent schedule rows for games. Cards should have an initial minimum readable width of 200–220px, with responsive column count based on actual available width, not viewport breakpoints alone. Permit two-line names. Keep important condition/fit facts visible. Replace large initial-letter coach tiles with compact avatars when photographs are unavailable.

Create scoped DUGOUT semantic tokens rather than blindly resetting global Tailwind spacing. Audit fixed pixel values, globally remapped text utilities and ui-chrome overrides. Shared topbar changes must preserve Sinker, management views and native webviews. Scope PC changes correctly; mobile needs its own responsive arrangement.

For the home, propose/implement the approved compact content-first variant with stable header and normal scrolling. Remove HomeSnap's desktop wheel/touch/keyboard interception only as part of this scoped redesign, cleaning dependent data attributes and CSS. Do not remove unrelated Sinker transitions.

Validate with the same content and theme at 1280×720, 1536×700 and 1920×960; include mobile/tablet regressions, long Korean text, 200% zoom, keyboard focus, loading, empty results and missing images. Record actual viewport and geometry with screenshots. Compare current and proposed first-result position and readability. Do not claim measurements for sizes not tested.

Before implementation is requested, treat this file as a plan. When implementation is requested, make the local preview concrete, report actual verification, and preserve concurrent changes. Do not deploy, modify the shared production DB or replace production image data as part of a visual redesign without applicable authorization.
