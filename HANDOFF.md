# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 금윤호에게 — 2026-10-04 · 김민(Claude) — 시험 도구 한 줄 · 운동 라이브러리 계열 셋 · 캐시 v12

받은 뒤 할 일 없음(DB 구조 · 패키지 그대로). 트레이닝 일정의 하는 차례를 정하면서(`lib/report/exercise-order.ts`) 같이 쓰는 것을 둘 건드렸다.

- **`scripts/alias-loader.mjs`**: `lib/workout/session-plan.ts` 가 부르는 `import 'server-only'` 만 빈 모듈로 바꾼다(운동 시작 목록을
  셀프테스트하려고). 다른 파일의 'server-only' 는 예전처럼 던진다 — 스크립트가 DB 에 쓰는 서버 코드를 실수로 부르지 않게.
- **운동 라이브러리 줄 셋의 계열**: 노르딕 햄스트링 · 리버스 노르딕 · 사이드 레터럴 레이즈를 `movementPattern` '고립'으로
  (`scripts/library-isolation-retag-2026-10-04.mjs`, 백업 뒤). 캐시 이름 `library:exercises:v12`. `fill-movement-pattern.mjs` 는 이제
  '고립'을 `--force` 로도 덮지 않는다(셀프테스트가 셋을 지킨다). 운동 바꾸기(`lib/workout/swap.ts`)는 '고립'끼리 부위가 겹칠 때만 같은 계열로 친다.

## 금윤호에게 — 2026-10-04 · 김민(Claude) — '앱 느낌' 1~4단계 + 그래프(하루치를 한 장으로 정리)

**받은 뒤 할 일 없음**(DB · 패키지 그대로). 사용자 요청 "웹사이트 같은 요소를 전부 완전한 앱 느낌으로". 휴대폰 모양만 바뀌고
PC 는 거의 그대로다. 아이폰 앱 쪽(자판 막대 · 바탕색)은 앱을 새로 구워야 들어가고, 이미 올려서 TestFlight 빌드가 돈다.

**AI 티 줄이기 1단계 — 화면 글(2026-10-04 저녁)**: 화면 글의 줄표(—) 170여 곳을 마침표 · 쉼표로, 긴 설명을 한두 줄로, 문장 속 굵게를
뺐다. 서버 동작 · API 오류 메시지는 해요체로('로그인이 필요해요.'). 네 영역(영양 화면 · `lib/nutrition` 가이드 · 식단 까닭)도 글만 바뀌었고
값 · 키는 그대로다(nutrition:test 387 통과). **새 글은 줄표 없이, 짧게, 해요체로.** 메커니즘 흔한 실수 칩은 이제 첫 마침표로 자른다.

**새 화면을 만들 때 쓰는 것**
- 저장 알림은 `toast('저장했어요')`(`components/toast.tsx`, 창 위에도 뜬다). redirect 로 끝나는 폼은 `SafeForm` 의 `doneToast`.
- 켜고 끄기는 `Switch` · `SwitchRow`(`components/switch.tsx`), 설정 목록은 `ListGroup` · `ListRow` · `SelectRow`(`components/settings-list.tsx`),
  밀어서 하기는 `SwipeRow`(`components/swipe-row.tsx`).
- 떨림은 저절로 — 체크 상자 · 라디오 · select 의 change, role radio/tab/switch 단추(`components/haptic-feedback.tsx`). 빼려면 `data-haptic="none"`.
  뜻으로 부를 때 `haptic('success' | 'medium' …)`(`lib/haptics.ts`).
- 하위 화면의 '‹ 뒤로'는 `BackLink`(진짜 뒤로, 휴대폰은 위 막대에 선다), 큰 제목은 `PageHeading`(스크롤하면 막대 제목으로 접힌다).
  제목 옆에 단추를 두려면 `inlineAction`.
- 글자는 11px 아래로 쓰지 않는다(손가락 화면의 10 · 9px 는 globals.css 가 한 단계 올린다). 경고 상자 테두리는 휴대폰에서 투명.
- 날짜 키를 화면에 쓸 때는 `dateKeyLabel`('10월 4일', `lib/pitch-stats.ts`).
- 앱 안에서 글자 선택이 꺼져 있다 — 고를 수 있어야 하는 글은 `.selectable`. 당겨서 새로고침에 끼면 안 되는 칸은 `data-no-ptr`.

**네 영역에서 바뀐 곳**
- 앱 틀(`app-shell.tsx`): 휴대폰 위 막대가 아이폰 내비 막대(뒤로 · 가운데 제목 · 종 · 설정 · 내 정보, 스크롤해도 안 숨음), 종은 아래 시트
  (`NoticePanel variant="sheet"`), 하단 탭을 다시 누르면 맨 위로. 화면 이동 방향 `<html data-nav>`(`components/nav-motion.tsx`).
- 투구 기록(`videos-client.tsx`): 휴대폰 머리가 제목 + 둥근 [⋯] [+] 와 꽉 찬 고르개 두 줄, ⋯ 는 시트(2분할 비교 · 구속 측정).
  입력 저장 단추 '10월 4일 기록 저장'(`entry-form.tsx`).
- 영양: 머리글 'Nutrition' 은 PC 만, 음식 창 '내 음식에 저장'은 스위치(`food-sheet.tsx`), `charts.tsx` 에 `'use client'` + 체중 흐름 훑기
  (밑 줄이 그날 값) · 칼로리 목표 표시를 짧은 실선으로. 계산은 한 줄도 안 바꿨다.
- 캘린더 정보(`day-detail.tsx`) · 부하 패널의 밑줄 링크는 파란 글자로. 부하 지수 2주 흐름은 새 `coach/load-trend.tsx`.

**그 밖에 알아 둘 것**
- 약관 · 개인정보는 설정 › 정보에서 시트로(`components/legal-sheet.tsx` — 가입 화면과 공용), 3D 출처는 설정 › 정보로(휴대폰은 지도 밑 줄 숨김).
- '참고 영상 · 촬영 전' 표시와 '유튜브에서 열기'는 관리자에게만. 오류 화면은 끊기면 '인터넷 연결이 없어요', 앱에서 `/` 는 홈 · 로그인으로.
- 아이폰 앱: 자판 위 '⌃ ⌄ 완료' 막대 숨김 + 화면을 끌면 자판이 내려감, 웹뷰 바탕을 테마색으로(돌아올 때 흰 번쩍임), 문서 제목 'Bullpen Log'.
- 그래프 다섯(홈 · 부하 지수 · 운동 볼륨 · 영양 둘)이 건강 앱 모양 — 누르고 훑으면 위(또는 밑) 숫자가 그날 값으로. 공용 `lib/smooth-path.ts` ·
  `components/use-box-size.ts`. `next.config.ts` 에 `staleTimes.dynamic: 30`(30초 안에 돌아온 탭은 서버를 다시 안 다녀온다).
