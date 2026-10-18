# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 김민에게 — 2026-10-18 · 금윤호(Claude, 서브2) — 10-18 촬영 영상 다듬기 · 내용 맞추기 · 전체 검토 끝(네가 넘긴 것)

받은 뒤 할 일 없음(DB 구조 · 패키지 그대로 — 운영 DB 의 운동 줄만 바뀜, 백업 db-2026-10-18-11-41 · 11-54). 절차는 `docs/shoot/video-trim-and-content-check.md` 그대로.
- **다듬기**(7042c5f5, 캐시 v41): '찍음' 95개 중 mp4 93개(2개는 영상 아님). 장면 모음을 다 보고 **사람이 작은 6개만 잘라 키움**(1.36~1.6배 —
  스트래들 스트레치 + 흉추 회전 · 파이크 푸시업 · 핸드 릴리스 푸시업 · 양발 글루트 브리지 · 싱글렉 힙 쓰러스트 · 밴드 클램쉘). 앞뒤 빈 시간은 자를 게 없었다.
  자동 판정이 자르려던 넷(플라이오 푸시업 · 싱글렉 덤벨 데드스톱 RDL · 원판 핀치 홀드 · 레터럴 바운드 + 메디신볼 슬램)은 끝까지 동작이라 그대로.
- **내용 맞추기**(e21c2804, v42): 에이전트 셋이 나눠 보고 의심 가는 건 내가 다시 봤다. 12개 고침 — 제목 바뀜 **'밴드 내·외회전 아이소 홀드' → '케이블 내·외회전 아이소 홀드'**
  (영상이 케이블 머신, `rehab-regions.ts` · 촬영 계획 JSON 도 따라감 48685d34) · 도구(트랜스버스 런지 케틀벨 · 가속 포지션 아이소 홀드 덤벨 + 박스 ·
  밴드 스피드 벤치 프레스에 벤치) · 원판 핀치 홀드 좌우 따로 → 아니오 · 힙 플렉서 스트레치 + 회전 30초 → 10회 · 설명 아홉 줄(커밋 본문에 다 있다).
  **사이드라잉 외회전 리바운드는 덤벨 그대로** — 원판으로 바꾸니 덤벨만 가진 사람의 회복날 어깨 후방이 비어(시험) 되돌렸다(v43).
- **전체 검토**: 시험 다섯 모두 기준값과 같음(1818 · 237 · 74 · 51 · 34), 감사는 참고 영상만 31 · 버티기 1(벤치 지지 막대 흉추 스트레치) ·
  좌우 2(90/90 힙 스위치 · 플랭크 리치 — 번갈아 하는 운동, 전부터 있던 것).
- **네가 정할 것**: ① 번갈아 하는 운동(90/90 힙 스위치 + 익스텐션 · 밴드 저항 데드버그 · 밴드 저항 레그 드롭 · 플랭크 리치)의 좌우 따로 기준
  ② 레터럴 점프 스틱 랜딩 — 글은 두 발 착지인데 영상에 한 발 착지 장면이 섞여 있다(다시 찍거나 글을 바꾸거나) ③ 목록 밖 도구(막대 · 무릎 패드 · 슬라이더)는 그대로 둠.
  되돌리기용 `applied.json` · `fix-plan.json` 은 금윤호 데스크톱 `~/bullpen-shoot-trim/` 에만 있다.
## 금윤호에게 — 2026-10-18 · 김민(Claude, 데스크톱 · 영양 담당) — 앱 틀 `__bpRefresh` 하나 · 아이폰 앱 영양 화면 고침

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역(앱 틀 `components/app-shell/expo-tabs.tsx` · 아이폰 앱 껍데기 `native/src/app/index.tsx`)을 조금 고쳤다.**
- 앱 첫 설정(영양)을 `/api/rpc` 로 저장하면 `revalidatePath` 가 웹뷰 화면을 못 비워 탭이 잠긴 채였다 → 웹에 `window.__bpRefresh`(= `router.refresh()`)를 두고,
  앱은 `openWebAfter('#refresh')` 로 부른다(`index.tsx` navTo 가 받음). 다른 앱 첫 설정(투구 · 트레이닝)도 같은 문제가 있을 수 있다 — 저장 뒤 이걸 부르면 된다.
- 앱 영양 탭 체중이 설정 단위(lb)를 따른다(`native/src/nutrition/tab.tsx`), 첫 설정 숫자 칸이 밖에서 바뀐 값을 따라간다(`native/src/setup/nutrition-steps.tsx`),
  '먹었어요' 등 실패해도 그날을 다시 받는다(`native/src/nutrition/api.ts`). **이 PC 엔 native 패키지가 없어 타입 검사 · 실기기 확인을 못 했다** — 맥에서 한 번 봐 줘.

## 김민에게(맥북) — 2026-10-18 · 김민(Claude, 데스크톱 · 아키텍처 세션) — 새 앱(Expo) 업데이트 장치 · 서버 동작 모양 기록

받은 뒤 할 일 없음(DB · 패키지 그대로). 전체 재검토(`docs/architecture/README.md` '2차 검토') 뒤 맥에서 할 것 둘.
- **N3 앱 업데이트 장치**: `native/` 에 `expo-updates` · `runtimeVersion` 이 없어 화면만 고쳐도 빌드 + 심사다. 정식 출시 전에 넣어 줘(계획서의 '화면 수정은 몇 분'이 이것).
- **서버 동작 모양 기록(데스크톱이 더함)**: 앱이 부르는 서버 동작 154개의 인자 · 답 모양을 `scripts/native-api-shapes.json` 에 적었고 `npm run native-api:test` 가 견준다.
  웹에서 그 동작 모양이 바뀌면 실패한다 → 앱 화면을 맞춘 뒤 `npm run native-api:test -- --update`, 깔린 앱이 깨지면 `lib/app-api.ts APP_API_LEVEL` 을 올린다.
  더 단단히 하려면(선택) `native/src/lib/rpc.ts` 의 `rpc<T>(action: string, …)` 를 `app/api/rpc/registry.ts` 의 타입에서 인자 · 답을 끌어오는 함수로 바꾸고
  호출 68곳의 `<T>` 를 걷으면 된다 — 앱 타입 검사가 필요해서 앱 패키지가 있는 맥에서. 다 보면 이 말을 지운다.

## 금윤호 · 김민(맥북)에게 — 2026-10-18 · 김민(Claude, 투구기록 담당) — 새 앱(Expo) 투구 폼 다섯 고침 — 맥에서 굽기 필요

받은 뒤 할 일: **새 앱(Expo)을 구울 때 같이 실린다**(서버 쪽 discard 답의 `orphans` 는 이미 웹 커밋에 들어가 배포만 되면 된다). **데스크톱엔 `native/node_modules` 가 없어 앱 타입 검사를 못 돌렸다** —
맥에서 `cd native && npx tsc --noEmit` 한 번 돌려 줘. 김민: 투구기록 점검 → "급한 것 1~9번 고쳐줘"(이 절은 5~9번).
- `native/src/app/pitch/edit.tsx`: ⑤ 저장 · 영상 넣는 중에는 [취소] · 끌어 닫기를 막고(`Stack.Screen gestureEnabled`), 저장 없이 닫을 때는 어느 기록에도 안 붙은 폰 영상만 지움
  (`pitch/api.ts phoneOrphans` → `/api/pitch-log/discard` 의 orphans — 신호 끊김 뒤 실제로는 저장된 기록의 영상을 지우던 것) ⑥ 고칠 때 `baseVideoPaths` 를 보냄(다른 기기에서 더한 영상이 지워지던 것)
  ⑦ 강도 칩 1~10(웹과 같게, 칩 사이 옛 값은 '지금 8.5') · 옛 기록(1~10 만 있음)은 `readEffort` 로 채우고 손 안 대면 `intensity` 를 보냄(메모만 고쳐도 강도를 다시 골라야 하던 것)
  ⑧ 구속 칸이 설정 단위(km/h · mph)를 따름(저장은 km/h — mph 로 친 86 이 86km/h 로 남던 것) ⑨ 저장 두 번 누름 막기(ref).
- `native/src/pitch/tab.tsx` · `app/pitch/[date].tsx`: 강도 글 1~10(`effortText`, 옛 기록도 보임) · 구속 `formatSpeed`(설정 단위).
- 폰에서 볼 것: 옛 기록 고치기(강도가 채워져 열리나) · mph 로 바꾸고 저장 → 웹에서 km/h 로 맞게 보이나 · 저장 중 끌어 닫기가 막히나.

## 금윤호에게 — 2026-10-18 · 김민(Claude, 투구기록 담당) — 투구 기록 점검 뒤 웹 넷 고침(폰 영상 지우기 · 가져오기 썸네일 · 날짜 검사)

받은 뒤 할 일 없음(DB · 패키지 그대로). 김민: 투구기록 전체 점검 → "급한 것 1~9번 고쳐줘". **네 영역(투구 폼 · 기록 API)을 고쳤다.**
- `app/api/pitch-log/discard/route.ts`: 답에 `orphans`(어느 기록 · 클립에도 없는 경로)를 더함. 새 `lib/local-video.ts discardPhoneVideos(paths)` — 이 답에 든 폰 영상만 폰에서 지운다(서버에 못 물으면 안 지움).
- `import-sheet.tsx`: 가져온 영상에 썸네일(`makePitchThumb`, 없으면 목록이 원본을 통째로 읽었다) · 묶음 폼이 저장하는 동안 건너뛰기 · 닫기 막음(`EntryForm` 새 선택 칸 `onSavingChange`) ·
  건너뛰기 · 닫기 · 시트 열 때 정리가 기록에 안 붙은 영상만 지움(저장은 됐는데 답만 못 받은 묶음의 영상을 지우던 것) · 폰에 넣고 경로를 못 받은 파일은 바로 지움.
- `entry-form.tsx`: 저장 없이 닫으면 새로 넣은 폰 영상도 지움(예전엔 서버 discard 만 불러 앱 안에 남음) · 고쳐서 뺀 폰 영상은 이 폰에서도 지움.
- `app/api/pitch-log/route.ts` POST: 날짜는 `YYYY-MM-DD` 만(예전엔 `…T05:00Z` 도 받아 그날 화면에 안 보이는 기록이 생길 수 있었다).
- tsc · eslint · pitch-find 31 · pitch-import 28. 화면은 못 봤다(로그인 · 아이폰 앱 필요) — 앱에서 가져오기 → 건너뛰기 · 닫기 한 번 봐 줘.


## 김민에게(맥북) — 2026-10-18 · 클라우드 세션(Claude) — 아이패드 촬영 카메라: 가로로 들면 미리보기가 옆으로 눕던 것 · 아이패드 크기 배치

받은 뒤 할 일: **맥북에서 새 앱(Expo)을 구울 때 같이 실린다** — 이 파일의 '새 앱(Expo) 굽기 · 촬영 앱 카메라가 H.264 로' 메모와 같은 굽기로 된다. 옛 앱(mobile/)은 main 에 들어가면
GitHub '아이폰 앱 굽기'가 저절로 굽는다. **리눅스 클라우드라 Swift 를 컴파일해 보지 못했다** — 굽다가 오류가 나면 그 줄을 고쳐 줘.
- 까닭: 아이패드는 앱이 모든 방향 · 화면 나누기를 받아 촬영 화면의 '세로 고정'이 먹지 않는다. 가로로 들면 화면(단추)은 돌고 미리보기 판은 세로 그대로라
  옆으로 누워 보였다(찍힌 영상 방향은 원래 맞았다).
- 고침(두 파일 같게 — `native/modules/shoot-camera/ios/ShootRecorderViewController.swift` · `mobile/ios/App/App/ShootCameraPlugin.swift`):
  아이패드는 `supportedInterfaceOrientations` = `.all`(아이폰은 그대로 세로), iOS 17+ 는 `RotationCoordinator.videoRotationAngleForHorizonLevelPreview` 를
  KVO 로 따라 미리보기 연결 각도를 바꾸고(애플 AVCam 과 같은 방식), iOS 16 은 화면 방향으로 `videoOrientation`. 눕혀 둔 아이패드(iOS 16)의 녹화 방향은 화면 방향을 따른다.
- (같은 날 더) 아이패드 크기 배치: 셔터 92pt · 글자 · 렌즈 고르개를 키우고, 가로로 들면 렌즈 · 셔터 · 취소를 오른쪽 세로 줄로(`viewWillLayoutSubviews` 가
  `bottomLayout` ↔ `sideLayout` 을 바꿈, 아이폰은 그대로). 웹 촬영 모드(`run-client.tsx`)는 아이패드(`pad:`)에서 두 칸(지금 운동 | 다음 · 그다음) · 큰 글자 · 큰 아래 단추.
- 구운 뒤 아이패드에서 볼 것: 관리자 → 영상 촬영 → 촬영 모드 [영상 찍기] → 세로 · 가로 · 찍는 중에 돌리기에서 미리보기가 똑바로 서는지 · 단추 줄 자리 · 찍은 영상 방향.
  아이폰은 예전과 같아야 한다.
  다 보면 이 말을 지운다.

## 김민에게(맥북) — 2026-10-18 · 김민(Claude, 데스크탑 트레이닝 세션) — 새 앱(Expo) 굽기: 촬영 앱 카메라가 H.264 로 찍게 바뀜

데스크탑에서 앱 네이티브 코드를 고쳤는데 맥이 없어 못 구웠다 — **맥북에서 받아(`git pull`) 새 앱을 평소처럼 구워 TestFlight 에 올려 줘.**
- 바뀐 파일: `native/modules/shoot-camera/ios/ShootRecorderViewController.swift`(커밋 b7cec1d6). 촬영 모드 앱 카메라가 H.264 · 1080p · 60fps 8Mbps ·
  1초 키프레임 · 일반 색(sRGB)으로 찍는다(`applyUploadSettings`). 그러면 사이트 편집 창이 다시 만들지 않고 잘라 붙여 올리기가 10~20초 빨라진다.
- **데스크탑에서 컴파일해 보지 못했다** — 굽다가 Swift 오류가 나면 그 줄을 고쳐 줘(쓴 API: `availableVideoCodecTypes` · `supportedOutputSettingsKeys(for:)` ·
  `setOutputSettings(_:for:)` · `activeColorSpace` · `automaticallyConfiguresCaptureDeviceForWideColor`).
- 옛 앱(mobile/ `ShootCameraPlugin.swift`)도 같게 고쳤다 — 그쪽은 GitHub '아이폰 앱 굽기'가 저절로 굽는다.
- 구운 뒤 폰에서 볼 것: 관리자 → 영상 촬영 → 촬영 모드 [영상 찍기] → 찍고 나면 '가져오는 중' 뒤 편집 창의 [올리기]가 예전보다 빨리 끝나는지 · 색이 바래지 않는지.
  다 보면 이 말을 지운다.

## 금윤호에게 — 2026-10-18 · 김민(Claude, 투구기록 담당) — 투구 강도를 다시 1~10 으로(화면만, 저장은 그대로 %)

받은 뒤 할 일 없음(DB · 패키지 그대로). 김민: "투구기록에 강도가 50프로부터 100까지 있는데 1~10으로 다시 바꿔줘". **네 영역(투구 폼 · 구속 측정 저장 시트 · 홈 · 투구 달력 · 분석)의 보이는 글을 바꿨다.**
- 칩(`components/effort-chips.tsx`): 50~100% 여섯 + −/+ 5% → **1~10 열 칸**(−/+ 뺌). 값은 그대로 체감 강도 %(칩 n = n × 10%)로 넘겨 저장 · 부하 · 추천 엔진은 안 바뀐다.
  `EFFORT_CHIPS` = 10 · 20 … 100. 구속 측정 저장 시트(`velocity-screen.tsx`)도 같은 부품이라 저절로 1~10.
- 보이는 글: `lib/pitch-effort.ts` 새 `effortScaleText(pct)`(90 → '9', 예전 85% 기록 → '8.5') — `effortText` 가 이것을 쓴다(목록 · 달력 · 그날 화면 · 분석 한꺼번에).
  홈 그날 요약 · 투구 달력 읽어 주는 글 · 목록 '강도 8 이상' · 투구 첫 설정 힌트 · 분석 평균 · 최고 · 이틀 합산(소수 한 자리, % 없이).
  기준표(`intensity-guide.tsx`) 투구 띠도 1 – 2 … 9 – 10. 폼의 '예전에 적은 강도 9에서 계산한 값이에요' 줄은 뺐다(칩 9 가 바로 골라져서).
- 예전에 % 로 고른 칩 사이 값(85%)은 칩이 모두 빈 채 밑에 '지금 8.5 · 칩을 누르면 바뀌어요'. 그대로 저장하면 85 가 남는다.
- 시험 training 1818 통과(칩 · 표시 기대값 셋을 1~10 으로). 화면은 임시 경로로 휴대폰 375 만 봤다(칩 30px 폭 열 칸 한 줄) — 폰에서 투구 기록 폼 한 번 봐 줘.

## 금윤호에게 — 2026-10-18 · 김민(Claude, 트레이닝 세션) — 체크인 미리 고름 없앰 · 팔 통증 자리 필수 · 경기도 고른 강도대로 · 못 잰 공 알림

받은 뒤 할 일 없음. 네 영역 파일을 고쳤다 — 사용자가 하나씩 정했다("미리 고르는 건 아니지" · "통증 자리는 무조건 알아야지" · "경기도 짧게 던질 수 있다").
- 체크인(`components/checkin-flow/flow.tsx` · `steps.tsx` · `app/globals.css` · `app/actions/checkin.ts`): 컨디션 · 잠은 미리 골라 두지 않는다(손잡이 숨김 '밀어서 골라요',
  고르기 전 '다음' 잠김). 어깨 · 팔꿈치 '통증'이면 아픈 자리 · 정도 둘 다 필수('몰라도 돼요' 뺌). 서버도 3판 흐름에서 잠 · 자리 · 정도가 없으면 막는다.
- 몸 그림(`components/body-spot-picker.tsx`): 어깨 · 팔꿈치 근육은 눌러도 '뻐근'으로 안 골라지고 뻐근해요 · 아파요를 고른다(needsLevelChoice).
- 아이폰 앱(`native/src/app/checkin.tsx` · `native/src/pitch/velocity-day.tsx`): 잠 · 자리 필수, 구속 카드에 '못 잰 공 N개는 빠졌어요'. 앱은 새로 구워야 들어간다.
- 투구 기록 폼(`app/(app)/pitch-log/entry-form.tsx`, 너 · 구속 측정 쪽): 구속 측정으로 채운 투구 수 밑에 '못 잰 공 N개는 빠졌어요'. 셈은 `lib/velocity-load.ts withMissedAttempts`
  (VelocityAttempt — 이어진 공 없음 · 공 길 장면 1장 이상).
- 투구 기록 종류(`entry-form.tsx` · `app/api/pitch-log/route.ts` · `native/src/app/pitch/edit.tsx`): '불펜'이 미리 골라져 있던 것을 비워 두고 꼭 고르게
  (서버도 빈 종류를 막는다). 프로그램의 '불펜 날 회전 던지기 빼기'는 뺐다(`lib/program/program.ts` — 두 손 몸통 던지기라 팔 부담이 작다, 사용자).
- **경기 강도**(`lib/pitch-stats.ts` stressFactor · outingLoadOf, `lib/report/facts.ts` nearMax): 경기도 고른 체감 강도대로 셈한다(예전엔 늘 100%). 세게 던진 날 · 부하 · 휴식이
  강도를 낮게 고른 경기에서 가벼워진다. 시험 기대값을 같이 고침(training 1818 · 그 밖 시험 모두 통과).

## 금윤호에게 — 2026-10-18 · 김민(Claude, 트레이닝 세션) — 체크인: 어깨 · 팔꿈치 '통증'이면 정도(얼마나 아픈지) 필수

받은 뒤 할 일 없음. 네 영역 파일을 고쳤다 — 사용자: "통증 표시하면 얼마나 아픈지 정도를 필수로".
- `components/checkin-flow/flow.tsx`: 통증 화면에서 어깨 · 팔꿈치가 '통증'인데 정도를 안 골랐으면 '다음'이 잠기고 위에 빨간 한 줄('얼마나 아픈지 골라 주세요').
- `app/actions/checkin.ts` trySaveCheckin: 같은 경우 저장을 막고 오류 글(웹 · 앱 둘 다 이 길).
- `native/src/app/checkin.tsx` save: 같은 경우 저장 전에 오류 글. 앱은 새로 구워야 들어간다(서버가 먼저 막으니 그 전에도 오류 글은 뜬다).
- 옛 기록(정도 없음)은 지금처럼 '심함'으로 읽는다(lib/checkin.ts armFatigueFromPain).

## 금윤호에게 — 2026-10-18 · 김민(Claude, 데스크톱 · 3D 담당) — 3D 엔진: 기종별 초점 표(120fps 셋) · 분석 서버가 영상의 기종 · fps 를 읽음 · 서버에도 올림

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역(3D 엔진 · GPU 파이프라인)을 고쳤다.**
김민: "카메라 보정 튼튼하게". 자기 보정은 초점이 거의 안 정해져(두 폰이 같은 투수를 겨눔) 몇 장면에도 흔들렸다.
- 새 `lib/pitch-3d/focal-table.ts`: 기종(영상 머리 com.apple.quicktime.model) · 촬영 fps 별 초점 — 지금은 10-16 막대 · 바닥 보정으로 잰 120fps 셋
  (아이패드 10 · SE2 · 15 Pro Max, 폭 3%). `camera.ts` 초점 사전이 카메라마다 다를 수 있다(`FocalPriors` = 하나 또는 `{ side, back }`).
  표에 없는 카메라 · 화면 녹화 · 줌은 예전처럼 1배 사전 — 그래서 대부분의 영상은 그대로다.
- 서버: `video.py device_info`(PyAV 로 기종 · 정해진 fps) → `pipeline.py fit_payload` 의 `devices` → `run-node.ts` 가 표를 찾는다. 로그 `[pitch3d device]`.
  묶음 목록(`scripts/pitch3d-bundle.mjs`)에 focal-table.ts 를 더했다.
- 10-16 마커 13구: 초점 오차 옆 −9.4 → −0.2%, 관절 3.3/3.0 → 2.4/2.6cm, 몸통이 도는 때 오차 2.9 → 1.0%, 착지 때 상체 3.7 → 1.0°, 레이백 4.7 → 2.9°.
  나빠진 것: 드리프트 판정 10 → 9/13(경계의 한 구), 착지 골반 수평(화면에 안 냄) 0.7 → 3.4°.
- 240fps 값은 넣어 보고 뺐다(10-12 공식 채점 레이백 5.2 → 8.3°) — 10-12 공식 채점 · 실험실 240fps 샘플은 예전과 같다. 자세한 것은 selfcal/README.md 끝 절.
- 시험 v1 71 · v2 326/327(실패는 예전 어깨 3.0% 하나) · GPU selfcheck 42 · 떨림 검사 나빠짐 없음 · 묶음 --check 같음.
- 분석 서버(Modal)에도 올렸다(같은 날) — 새로 분석하는 영상부터.

## 금윤호에게 — 2026-10-17 · 김민(Claude, 데스크톱 · 3D 담당) — 3D 엔진 팔 좌우 고침이 튀는 바꿈을 막는다 · 분석 서버에도 올림

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역(3D 엔진)을 고쳤다** — `lib/pitch-3d/analyze.ts` repairLabels 의 `REPAIR_MAX_JUMP`(5).
김민: 10-16 마커 투구 5 몸통이 깨지는 원인 → 실험실 샘플 7 · 9 니업 몸통 흔들림. 원인 하나: repairLabels 가 빠른 구간 밖에서는 팔 바꿈을 다시 비춤만으로 받아,
한 장면 팔 이름을 바꾼 쪽이 앞뒤 장면과 크게 끊겨도(280px, 원래 16px) 뒤집었다 → 어깨선이 몇 장면 튐.
- 고침: 어느 구간에서든 팔을 뒤집은 쪽이 앞뒤와 원래보다 5배 넘게 끊기면 안 뒤집는다(다리 · 빠른 구간 규칙은 그대로).
- 결과: 샘플 7 · 9 어깨선 떨림 2.86 → 0.50 · 3.65 → 0.66°, 10-16 투구 5(초점 앎) 몸통 −17.2 → −2.3°. 막힌 바꿈은 마커 정답에 비춰 모두 틀린 바꿈.
  떨림 검사 9샘플 나빠짐 없음(좌투 샘플 3 같음) · 10-16 판정 그대로. 10-12 공식 점수는 3.23 → 3.37cm(거의 p8 · p9) — 고침이 아니라 자기 보정이
  몇 장면에도 흔들리는 탓(줄자 보정이면 15구 모두 고치기 전후 같음). 그래서 채점 기준을 다시 저장했다(selfcal/README.md 끝 절).
- 시험 v1 71 · v2 319/320 — 실패 하나는 '실제처럼 · 결과 카메라로 다시 비춘 어깨 3% 안'이 2.4 → 3.0%. 막힌 건 옆 영상 i220 하나(합성은 뒤 영상에만 바꿈을 넣음)라
  막은 게 맞고, 보정이 조금 달라진 여파라 시험은 그대로 뒀다.
- 분석 서버(Modal)에도 올렸다(같은 날, `npm run pitch3d:bundle` → `modal deploy app.py`) — 새로 분석하는 영상부터.

## 금윤호에게 — 2026-10-17 · 김민(Claude, 데스크톱 · 구속측정 엔진) — 측정 화면: 관리자 '세션 녹화' 켜기 단추

받은 뒤 할 일 없음. **네 영역(측정 화면 `app/(session)/velocity/velocity-screen.tsx`)을 고쳤다**(6e72a24c).
- 김민: "세션 통째 녹화는 관리자만 가능한데 시작하기 전에 옆에 따로 켜기 버튼이 있어야". 측정 단계에서 측정 시작 전 셔터 줄 위 왼쪽에 관리자만 보이는 칩
  '세션 녹화 끔/켬', 측정 중엔 같은 자리에 '녹화 중 · 올림 n/m'. 세션 녹화는 이제 **이 칩으로만** 켜진다(예전: 보정용 저장을 켜면 저절로).
  1분 100MB 남짓이라 기억하지 않는다 — 화면을 열 때마다 꺼진 채. 웹 카메라면 "앱 카메라에서만 돼요". 칩이 뜨면 카메라 위 알림창을 그만큼(pb-14) 올린다.
- 화면은 로그인 · 카메라가 있어야 해 브라우저로 못 봤다(tsc · eslint 만). 새 Expo 앱(`native/`)의 측정 화면에는 세션 녹화가 아직 없다.

## 금윤호에게 — 2026-10-17 밤 · 김민(Claude, 트레이닝 세션) — 오늘 찍은 운동 영상 52개를 다듬은 판으로 바꿈(운영 DB · 저장소)

받은 뒤 할 일 없음. 같이 쓰는 운동 라이브러리를 바꿔서 알린다(AGENTS.md 3번). 김민: "영상 앞뒤 2초 넘는 빈 시간을 자르고, 사람이 작으면 크게 보이게 잘라 줘".
- 10-17 '찍음' 영상 170개를 보고 52개를 새로 만들었다(앞뒤 자름 18 · 화면 잘라 키움 38, 1920×1080 · 소리 없음 · 화면 비율 그대로). 새 이름 `library/<새 uuid>` 로 올리고
  운동의 videoPath · thumbPath 만 바꿨다. **옛 파일은 저장소에 그대로**(지우지 않음). 재생용 줄인 판 `library-720/<새 uuid>.mp4` 도 같이 올렸다. 캐시 `library:exercises:v37`.
- 앱 안 영상 묶음에는 새 uuid 가 없다 — 앱이 처음 볼 때 받는다. 다음에 맥에서 앱을 구울 때 `npm run library:bundle` 을 돌리면 들어간다.
- 도구 `scripts/shoot-trim/`(내려받기 → 재기 → 판정 · 장면 모음 → 만들기 → 올리기). 되돌리기는 `apply.mjs <작업 폴더> --revert` 인데 작업 폴더(applied.json)가 김민 데스크톱에만 있다. 백업 db-2026-10-17-13-56.

## 금윤호에게 — 2026-10-17 · 김민(Claude, UI/UX 세션) — 체크인 첫 화면 로그아웃 단추 뺌 · 시작 연출 script · 아이폰 창 닫힘 자리

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역(체크인 흐름 · 시작 연출)을 고쳤다.** 김민: UI 버그 점검 뒤 "다 고쳐줘".
- `components/checkin-flow/flow.tsx`: 첫 화면의 '로그인 · 회원가입 화면으로'를 뺐다 — '오늘은 건너뛰기' 바로 옆에서 누르면 묻지 않고 로그아웃됐다(이름은 '화면으로'). 로그아웃은 내 정보에서.
- `components/app-splash.tsx`: `<script>`(data-splash 표시)를 서버 그림 · 붙는 중에만 그린다(`useSyncExternalStore` 서버 값). 클라이언트 이동으로 (app) 에 들어올 때(체크인 건너뛰기 → 홈) React 가
  'Encountered a script tag' 콘솔 오류를 냈다 — 그 경로의 표시는 원래도 효과(useEffect)가 달았다.
- `app/globals.css` 사파리용 닫히는 창 규칙(`@supports not (overlay: auto)`) 밑에 한 묶음: 판 넘기기 트랙(transform) 안의 창은 fixed 가 4판 폭 트랙에 붙어, 닫히는 0.2초 동안
  투구 · 트레이닝 · 영양 판의 시트가 화면 밖으로 튈 수 있었다 → 트랙 좌표의 지금 판 자리(`--i` × 25% − `--rail`). 크롬에서 같은 값을 넣어 판 넷 모두 화면 자리와 같음을 쟀다. **아이폰에서는 아직 안 봤다.**

## 금윤호에게 — 2026-10-17 · 김민(Claude, 데스크톱 · 3D 담당) — 3D 엔진 상하체 분리 고침(뒤 영상 엉덩이 겹침) · 분석 서버에도 올림

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역(3D 엔진)을 고쳤다** — `lib/pitch-3d/analyze.ts` 의 `fillBackHipGaps`(시험 `scripts/pitch-3d-selftest.mts` 8개).
김민: "상하체 분리부터". 10-16 마커 13구로 찾은 원인: 착지 직후 뒤(2루) 영상에서 두 엉덩이가 앞뒤로 겹치면 2D 모델이 **좌우 순서를 늦게 바꾼다**
(정답 간격이 +2 → −5% 로 지나는 동안 관찰은 +3~5% 에 머물다 한 번에 뒤집힘, 가운데 점은 맞음) → 골반이 착지 직후 10~18° 늦게 돌아 분리가 12° 작았다.
- 고침: 뒤 영상 엉덩이 간격이 가장 넓은 간격의 60% 밑이고 '0 을 지나야 하는데 한쪽에 머문' 구간만, 앞뒤 믿을 장면 사이를 시간으로 잇는다(2D 가 깨끗하면 안 건드림).
- 결과(13구, 앱 − 정답): 분리 크기 −11.9 → −5.8° · **분리 판정 7/13 → 10/13** · 분리 시점 상관 0.30 → 0.71. 앞다리 · 관절 오차(3.2/3.1cm) 그대로.
  10-12 마커 15구(골반 스티커 정답): 골반 5.04 → 4.88° · 분리 5.37 → 5.17°. 시험 v1 71 · v2 320, 떨림 검사(데스크톱 샘플 1개) 나빠짐 없음.
- 남은 것: 엔진이 스스로 잡은 카메라 보정이 착지 30% 뒤 골반을 4~6° 늦게 만든다(진짜 보정이면 분리 −3.4° · 판정 11/13) — 다음에 보정 계산을 손볼 예정.
- 분석 서버(Modal)에도 올렸다(같은 날) — 새로 분석하는 영상부터.

## 금윤호에게 — 2026-10-16 밤 · 김민(Claude, 데스크톱 · 트레이닝) — 운동 라이브러리에 큰 메디신볼 던지기 셋을 더함(운영 DB) · 캐시 v36

받은 뒤 할 일 없음(DB 구조 · 패키지 그대로, 운동 줄만 더함). **같이 쓰는 운동 라이브러리에 더했다**(AGENTS 3번 — 알림). 김민: 트레이닝 50명 시뮬
(`docs/qa/2026-10-16-training-50.md`) 뒤 "투구 드릴에 메디신볼 드릴 많으니까 큰 메디신볼 쓰는 걸로 몇 개 넣어".
- 투구 드릴 셋을 운동(파워 · 메디신볼)으로 복사 — 헤비 메디신볼 힌지 토스(큰 공) · 힌지 오버더톱 슬램(큰 공) · 스플릿 스탠스 슬램(큰 공). 같은 참고 영상 · 설명
  (10-15 회전 던지기 여섯과 같은 방식, 백업 `db-2026-10-16-14-41.json`, `scripts/library-medball-big-2026-10-16.mjs`). **드릴 쪽 영상을 찍어 올리면 이 복사본은 안 따라간다.**
- 근력 프로그램 메디신볼 칸(`lib/program/program.ts` medball 규칙)이 힌지 계열도 받는다 — 메디신볼이 있으면 그 칸 운동이 2 → 5개.
- 트레이닝만(네 영역 아님): 기본기 던지기 칸 3~4주는 강도 높음까지(`basicsPool`), 매일 일정 보강 칸은 가장 최근 세션에 한 것을 다시 안 고름
  (`theme.ts` lastSessionIds · `daily-plan.ts lastSessionIdsOf`). 시험 program 236 · training 실패 20(전과 같음).

## 금윤호에게 — 2026-10-16 밤(4) · 김민(Claude, 데스크톱 · 구속측정 엔진) — 공 자리 찍기(학습 모델 2판 라벨 도구) · 받으면 `npx prisma generate`

받은 뒤 할 일: **`npx prisma generate`** — 새 표 `VelocityBallLabel`(마이그레이션 `20261016150000_velocity_ball_label`, 더하기만 · DB 에 적용함, 백업 `db-2026-10-16-14-30.json`).
네 영역(측정 화면 · Swift)은 안 건드렸다 — 관리자 구속 측정 화면 · 엔진 폴더만.
- 관리자 녹화 편집기의 공마다 [공 자리 찍기], 탐색기 공 미리보기에도 [공 자리 찍기](`app/(app)/admin/velocity/ball-labeler.tsx`): 장면을 넘기며 공 가운데 · 가장자리를
  눌러 저장(컷 · 클립마다 `VelocityBallLabel` 한 줄, 장면 시각 · 공 [x, y, 지름] 원본 px). 엔진이 못 잰 10-06 · 10-07 클립도 같은 도구로 찍는다.
- `services/velocity-detector/pull-labels.mjs` 가 서버 라벨 + 영상을 받아 1판과 같은 `labels.json`(detector-v2) 로 — `train.py --dataset detector-v2` 가 그대로 읽는다.
  자세한 것은 `docs/velocity/engine-2.7-plan.md` '5단계 2판 ②'. 시험으로 10-16 녹화 한 컷(12장면)을 찍어 둔 줄이 하나 있다.

## 금윤호에게 — 2026-10-16 밤(3) · 김민(Claude, 데스크톱 · 구속측정 엔진) — 엔진 2.7.1: 조용할 때 훑기가 학습 모델로 공을 찾는다

받은 뒤 할 일 없음(DB · 패키지 · Swift 그대로 — onnxruntime-web 은 npm 에 안 넣고 jsDelivr 판 고정 주소에서 받는다, `lib/velocity-engine/ball-net.ts`).
**네 영역(구속 측정 — 앱 카메라 길)의 `dual-capture.ts` 두 줄(arm 때 모델 미리 받기 · 로그에 via)과 `analyze-video.ts locateThrow` 를 고쳤다.**
- 훑기(sweep)가 공을 알아채는 눈이 밝기 차 거친 훑기 → 학습 모델(MobileNetV3-small 열지도, 입력 긴 변 736 · 연속 세 장면). 모델 · 런타임을 못 받으면 예전 길(via 'coarse').
  실제 클립 43개에서 모델 43/43 · 알림 시각 0.9초 안 24/24(거친 훑기 37/43 · 20/24). 알림 길 · 파일 길의 계산은 안 바뀌어 값 · 보정 짝 그대로(2.7.1).
- 모델 파일 `public/velocity-detector/ball-v1.onnx`(177KB) — 사이트 배포에 실린다. WASM 런타임 14MB 는 첫 arm 때 받고 브라우저가 캐시한다(LTE 면 10초쯤).
- **폰에서 봐 줄 것**: 콘솔 `[velo] sweep … (net)` 이 찍히나(안 찍히고 coarse 면 런타임을 못 받은 것) · 훑기 한 번이 몇 초인가(2.5초 넘으면 다음 하나를 쉬는 규칙이 있다).
  자세한 것은 `docs/velocity/engine-2.7-plan.md` '5단계 2판 ①'. 알림(MotionTrigger)을 모델로 바꾸는 CoreML 길은 김민이 맥북에서 직접 한다(2026-10-16 사용자) — 같은 ONNX 에서.

## 금윤호에게 — 2026-10-16 밤 · 김민(Claude, 데스크톱 · 3D 담당) — 3D 엔진 착지 무렵 앞다리(앞무릎) 고침 · 분석 서버에도 올림

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역(3D 엔진)을 고쳤다** — `lib/pitch-3d/analyze.ts` · `camera.ts` · `v2/fit.ts`. 김민: "앞다리(착지 뒤 무릎) 엔진 오류부터".
10-16 마커 13구(카메라 세 대 정답)로 찾은 원인 둘:
- 착지 때 뒤(2루) 영상에서 앞다리가 축다리 · 몸에 가려 2D 모델이 **세로 자리를 지어낸다**(정답을 뒤 영상에 비추니 가로 오차 90% 2%, 세로 8~18%). 엔진이 그 점을 버리고
  옆 시선 위에 뼈 길이로 놓아 착지 앞발목이 3루 쪽으로 15cm 가 갔다 → `analyze.ts` 의 `leadPlaced`: 착지 무렵 앞다리는 두 영상이 맞으면 그대로 교차, 아니면
  옆 영상 두 좌표 + 뒤 영상 가로만(`camera.ts rayColumn`). v2 맞추기는 이 관절을 한 영상 다리 겹침 가르기에서 뺀다.
- 디딘 앞다리 뼈 길이가 6% 길게 잡혀(2D 점이 관절 중심이 아니라 자세마다 다름) 묶인 앞발과 엉덩이 사이에서 무릎이 더 굽었다 → `fit.ts` 가 맞춘 **뒤에**
  앞무릎 · 앞발목만 다시 놓는다(관찰 각도가 나오는 다리 길이 배율을 장면마다 풀어 두 뼈 IK, 엉덩이 · 몸통 · 팔은 그대로 — 맞추기 안에서 바꾸면 골반이 끌려 레이백이 움직였다).
- 결과(13구, 앱 − 정답): 앞무릎 착지 −12.1 → −1.7° · 릴리스 +6.6 → +0.2° · 착지 뒤 더 굽음 +15.4 → +0.4° → **앞다리 버티기 판정 3/13 → 10/13**.
  앞발 자리가 바로잡혀 착지 때 몸통 열림 +5.4 → −2.9° · 골반 열림 +7.6 → −0.1° · 골반 기울기 3.3 → 0.6°. 관절 오차 3.2/3.1 → 3.2/3.1cm 그대로.
  10-12 마커 15구 채점 · 떨림 검사(데스크톱 샘플 1개) 나빠짐 없음(분리 4.8 → 5.4° 는 고치기 전 엔진도 같다 — 예전 변경). 시험 v1 63 · v2 320.
- 분석 서버(Modal)에도 올렸다(같은 날, `npm run pitch3d:bundle` → `modal deploy app.py`) — 새로 분석하는 영상부터. 실험실 실제 영상 7개는 맥북에만 있어 떨림 검사는 그쪽에서 한 번 돌려 줘.

## 금윤호에게 — 2026-10-16 밤(2) · 김민(Claude, 데스크톱 · 구속측정 엔진) — 공 감지 학습 모델 1판(Modal) · 4단계는 안 만듦

받은 뒤 할 일 없음(DB · 패키지 · Swift 그대로 — 새 폴더 `services/velocity-detector/` 와 문서만). 네 영역 코드는 안 건드렸다.
- 2.7 계획 4단계(공 크기 깊이를 궤적에)는 스피드건 짝 21구로 셈해 보니 오차 2.69 → 3.01% 로 나빠져 **안 만들었다**(`docs/velocity/engine-2.7-plan.md` 4단계 절).
- 5단계 1판: 엔진이 믿은 공 자리를 라벨로(37클립 · 장면 3,266) MobileNetV3-small 열지도 모델을 Modal T4 에서 학습(5.5분). 시험 클립 8개에서 재현율 90%(지름 8px
  넘으면 95~97%) · 헛 알림 2.9% — 그 헛 알림은 모두 **실제로 공이 있는 릴리스 직후 장면**(엔진 라벨이 빈 곳)이라 모델이 엔진보다 공을 더 찾는다.
  모양 · 명령 · 다음 단계는 `services/velocity-detector/README.md` · 계획 문서 5단계 절. 무게(ONNX 177KB)는 Modal 볼륨 `bullpen-ball-detector-data` /out/v1.
- **(김민이 맥북에서 직접 하기로 함 — 2026-10-16 사용자)** 폰에 넣으려면 ONNX → CoreML(coremltools, 맥) → `DualCameraPlugin.swift` MotionTrigger 의 공 알림을 모델 봉우리로. 그 전에 폰에서 이 모델
  한 장면 추론 시간(목표 60fps 의 반, 8ms 안)을 재 보는 것이 첫걸음. 사용자가 시키면 내가 사이트 쪽(onnxruntime-web 로 훑기)을 먼저 해 볼 수도 있다.

## 금윤호에게 — 2026-10-16 밤 · 김민(Claude, 데스크톱 · 베타 시뮬 QA) — 홈 요약 칸 · 하이라이트 · 투구 폼 · 분석을 고쳤다(베타 100명 결과)

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역(홈 · 투구 기록 폼 · 투구 분석)을 고쳤다.** 김민: 베타 100명 보고서(`docs/qa/2026-10-16-beta-100-weighted.md`) 뒤
"계획대로 1번부터 고쳐줘" — 계획 `docs/qa/2026-10-16-beta-fix-plan.md`.
- **부하 판정 하나로**: `lib/report/arm-status.ts loadSignalOf` — 홈 부하 장(`feed-items.ts`)과 하이라이트(`highlights.ts`)가 팔 상태와 같은 판정을 쓴다
  (평소 양이 적은 복귀자 · 문진 추정 중의 '위험'은 주의로, '적어요'는 늘리라고 안 함). 그래서 `HighlightInput.load` · `FeedInput.load` 는 facts.load 통째로.
- **`loadHighlights` 셋째 인자가 facts**(예전 facts.load) — `feed.tsx` · `analysis-view.tsx` 를 고쳤다. '3일째 투구 기록이 없어요'를 지우고, 어제 '오늘 등판'이라
  답했는데 어제 기록이 없을 때만 '어제 등판 기록이 없어요'(`outingOf(facts).claimedYesterdayNoLog`). 주말만 던지는 사람이 매일 잔소리를 들었다.
- 홈 요약 칸: 하이라이트가 덮은 장의 둘째 후보가 하이라이트 글 그대로 돌던 것 → 원래 숫자 줄('1.62 · 위험' · '마지막 투구 80구'). 부하 장 '주 2,400구 · 평소 …'(부하 단위를
  '구'로 적음) → '최근 7일 N구 · 4주 평균 주 N구'(실제 공 수, `FeedInput.acuteChronic` 지움). 빈 날 후보는 열흘부터(`MISSING_DAYS_WARNING`).
- `lib/pitch-stats.ts countMissingDays`: 첫 기록 앞의 날은 안 센다(가입 2주차에게 '28일 중 14일 기록이 없어요'). 분석 부하 카드 '며칠만 더' → '한 달쯤'.
- 영양 장: 오늘 기록이 없어도 오늘 조언 한 줄(점수 없이, 7일 평균은 다음 후보로) · 7일 평균은 두 끼 이상 적은 날만 · 밤에 자료가 없으면 '다 챙겼어요' 대신
  '오늘 먹은 걸 한 번 적어 볼까요'(`lib/nutrition/advice.ts`). 영양 담당이 남긴 `feed.tsx` kcal × amount 한 줄은 여전히 네 몫이라 안 건드렸다.
- 투구 기록 폼(`entry-form.tsx`): 신호가 끊겨 저장 못 하면 적은 내용을 이 폰에 남겨 두고 다시 열면 되살림(지우기 단추), 구속 칸 밑 km/h ↔ mph 스위치
  (`day-record.tsx` · `videos-client.tsx` 는 단위대로 보임). 첫 설정 휴식표(`insert-cards.tsx`)는 나이대 표로, 성장기 팔 상태에 '전력 투구는 N일 뒤' 신호.
- 시험: arm-status 34 · highlights 25 · integration 28 · nutrition 494 · advice 46 · training 실패 20(고치기 전과 같은 목록). 화면은 로그인이 필요해 못 봤다 —
  홈 요약 칸(부하 · 영양 장 넘기기) · 투구 폼(비행기 모드로 저장 → 다시 열기)을 폰에서 한 번 봐 줘.

## 금윤호에게 — 2026-10-16 밤 · 김민(Claude, 데스크톱 · 구속측정 엔진) — 구속 엔진 2.7.0: 조용할 때 훑기 · 세션 통째 녹화(관리자) — 놓치는 공 줄이기

받은 뒤 할 일 없음(DB · 패키지 · Swift 그대로 — 사이트 쪽만, 빌드 없이 배포). **네 영역(구속 측정 — 앱 카메라 길 · 측정 화면 · 시도 기록)을 고쳤다.**
김민: "공도 인식을 못해, 다음에도 또 이러면 어떡해" → 계획 `docs/velocity/engine-2.7-plan.md`(1 · 2단계 끝, 3~6단계는 Swift · 학습 모델).
- 왜: 10-16 세션 저장 뒤 이어 재니 앱 알림이 거의 안 왔다(공 2 · 움직임 0) — 같은 조건 녹화 7구는 엔진에 넣으면 6구 '높음'. 알아채기가 구멍.
- **조용할 때 훑기**(`dual-capture.ts` sweep · `analyze-video.ts locateThrow` · `lib/velocity-engine/sweep.ts`): armed 이고 재는 중이 없으면 5초마다 지난 6초(겹침 1초)를
  앱에서 잘라 거친 훑기만 — 공을 믿었으면 그 시각으로 움직임 알림과 같은 길로 잰다(`onThrow(t, 'sweep')`, 안 보이게 시작해 공 길이 나오면 결과 + '뒤늦게 찾은 공' 알림,
  `ResultMeta.late`). 재는 중 · 최근 5초 창의 공은 건너뛰고, 훑기가 2.5초 넘으면 다음 하나는 쉰다. `DualCapture.setSweep(false)` 로 끌 수 있다(기본 켬).
  10-16 · 10-09 앱 클립 20개: 훑기가 공을 20/20 찾았고, 그 길로 잰 값은 10-16 밖 6구 모두 '높음' · 알림 길과 1km/h 안(실내 10-09 는 알림 길처럼 '낮음').
- **앱 카메라 시계**: 알림 atSec 을 `performance.now()` 와 짝짓고, 알림 전엔 `clip({ atSec: 1e9, beforeSec: 1e9, afterSec: 0 })` 한 번으로 쥔 조각 전부의 시작을 역산
  (`anchorClock`, 앱이 5초 상한까지 기다렸다 돌려줌 · 파일은 안 읽고 discard). **Swift 에 `now`(CACurrentMediaTime) 하나만 더해 주면 이 5초가 없어진다** — 다음 빌드 때.
  `cutRange(from, to)` = clip(atSec: from, beforeSec: 0, afterSec: to − from) + readDualClip.
- **세션 통째 녹화**(`lib/velocity-dual-recorder.ts` DualSessionRecorder): 관리자 · '정확도 보정용 저장' 켬 · 앱 카메라일 때 세션 시작(arm)에 켜고 종료 · 저장 · 나가기에 끈다.
  6초마다 잘라 서버 녹화(VelocityRecording — 엔진 개발용 녹화와 같은 표 · 편집기)로 올린다. meta `sessionRecording: true` · `cameraClockStart`(알림 atSec 과 같은 시계).
  조각 약 10MB(14Mbps) — LTE 면 1분 100MB 쯤(김민이 알고 고른 2번 방식). 올리기가 3개 넘게 밀리면 그 조각은 건너뛴다.
- 시도 기록 kind 에 'sweep'(`app/actions/velocity.ts`), 관리자 시도 표 '훑기'(`explorer-panels.tsx` 한 줄). 측정 화면: `startSessionRecording · stopSessionRecording` ·
  결과 알림 한 줄 · `sessionRecRef`.
- 시험 engine2 65(새 7 — 시계 역산 · 훑기 창) · test 48 · detect 15 · video 59 · live 61 · tsc · eslint. **실제 폰에서는 아직 안 봤다** — 다음 현장에서 콘솔 `[velo] sweep …` ·
  관리자 녹화 목록(조각 수) · 시도 표 '훑기' 줄을 봐 줘. 사용자가 다음에 하라고 한 것: 3단계(셔터 상한 1/2000 · 가속도 3축 · 고도, Swift) · 5단계 공 감지 학습 모델(Modal 학습 · CoreML).

## 금윤호에게 — 2026-10-16 · 김민(Claude, 데스크톱 · 앱 틀) — 숨은 판의 막대 제목 · '‹ 뒤로'가 지금 화면을 덮던 것

받은 뒤 할 일 없음. **네 영역(앱 틀)을 고쳤다** — `components/nav-title.tsx`(0fd91c17) · `components/back-link.tsx`(c09cef2f): 가장 가까운 `[data-panel]` 에
`data-active` 가 없으면 막대에 쓰지 않고, 판이 숨으면 걷고, 다시 보이면 다시 잰다(MutationObserver). 라이브러리 · 투구 분석에 '영양' 같은 탭 이름이,
암케어에서 하단 탭으로 옮긴 투구 · 홈에 '‹ 트레이닝'이 남던 것. **판 안에서 막대 · 전역 상태에 쓰는 새 부품도 같은 함정이다.**

## 금윤호에게 — 2026-10-16 · 김민(Claude, 데스크톱 · 투구기록 담당) — 투구 기록 화면 버그 다섯 고침(2분할 비교 · 접힌 구속 칸 · 새 기록 폼 · 마지막 투구 · 홈 캘린더)

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역(투구 탭 · 그날 화면 · 입력 폼 · 홈 캘린더 · 투구 분석)을 고쳤다.** 김민: 투구기록 점검 뒤 "화면 버그 5개부터 고쳐줘".
- **2분할 비교(휴대폰 · 패드)**: 판 넘기기 트랙의 transform 안에서는 fixed 가 화면이 아니라 4판 폭 트랙에 붙고 트랙 층에 갇힌다 — 비교하기 막대가 화면 밖,
  날짜 목록이 한 화면만큼 왼쪽, 크게 보기가 반쪽이었다. 고른 둘 막대(`video-gallery.tsx`) · 날짜 목록(`clip-picker.tsx`, 크게 보기 안이면 `.theme-dark` 를 가져가고 z 70)은
  `createPortal(…, document.body)`. 크게 보기(`compare-view.tsx`)는 재생기를 따로 만든 상자(host)에 늘 그리고 **상자째** body ↔ 제자리로 옮긴다 — portal 을 켰다 끄면
  영상이 새로 붙어 장면 · 프레임 재기가 끊기고, 트랙 transform 을 끄면 휴대폰 화면(layout viewport)이 넓어졌다. **트랙 안에 새 fixed 를 둘 때 같은 함정이다.**
- **입력 폼(`entry-form.tsx`)**: `noValidate` — 접힌 '더 적기' 안 구속 칸이 범위 밖이면 브라우저가 말없이 저장을 막았다. 이제 handleSubmit 이 펴고 한국어로 알린다.
- **그날 화면(`day-client.tsx`)**: 저장 콜백을 셋으로(고치기 · 드릴 공 더하기 · 새 기록) — 하나였을 때 다른 기록을 고쳐 저장하면 쓰던 새 기록 폼까지 닫혔다(네 드릴 흐름은 그대로).
- **투구 분석(`coach/overview.tsx`)**: '마지막 투구'가 쉰 날(0구)을 셌다 → `pitchCount > 0` 만.
- **홈 캘린더(`today/pitch-log-panel.tsx`)**: 그날 요약 버리기를 체크인 · 구속에 운동 · 일정 · 영양까지(판 넘기기로 홈이 살아 있어 옛 끼니 목록이 남았다),
  옛 달 기록은 서버가 새 기록을 보내면 그 달을 다시 받아 갈아 끼운다(고치거나 지운 것이 남았다).
- 확인: tsc · eslint, 1 · 2번은 임시 경로로 휴대폰 375 에서 잼(크게 보기 375×812 · 위아래 막대 위 · 같은 영상 그대로). 3~5번은 로그인이 필요해 화면은 못 봤다 — 폰에서 한 번 봐 줘.

## 금윤호에게 · 김민(맥북)에게도 — 2026-10-16 · 김민(Claude, 데스크톱 · 통합 세션) — 앱 틀 app-shell.tsx 를 components/app-shell/ 여섯 파일로 나눴다

받은 뒤 할 일 없음(DB · 패키지 그대로). **네가 앱 틀을 고치던 중이면 받기 전에 알려 줘** — 합칠 때 크게 부딪힌다(내용은 그대로라 옮긴 파일에 같은 줄로 다시 넣으면 된다).
커밋 8c705920 — 옮기기만(원래 본문 줄이 한 번씩 그대로 · tsc 0 · eslint 0 · next build 통과). 바깥에서 부르는 것은 `AppNav` 하나라 import 는 그대로.
- `components/app-shell.tsx`(1,362줄): AppNav 와 그 혼자 쓰는 것(DOCK_OPEN_MS · DOCK_CLOSE_MS · HURRY_RATE · Place · Choreo · TimerName · REST_THUMB · DOCK_FALLBACK · within)
- `components/app-shell/`: `mobile-tabs.tsx`(MobileTabs · TabFace · CHOSEN_TIMEOUT_MS) · `mobile-top-bar.tsx`(MobileTopBar · useBarHidden) · `detail-menu.tsx`(DetailMenu · inTabBar) ·
  `dock.tsx`(QuickBar · MenuSquares · DockGrid) · `glyphs.tsx`(NavGlyph · TopIcon · Tip · Squares · SettingsCog · Avatar) · `shared.tsx`(useIsActive · MENU_PATHS · DOCK_HOVER_MS · FlyKind · Anchor · flyStyle · growStyle)
- 앞으로 앱 틀에 새 부품을 더할 때는 이 폴더에 새 파일로(`docs/architecture/05-dependencies-and-order.md` 5-5). 브라우저 · 폰 화면은 못 봤다 — 하단 탭 끌기 · 도크 팝업 · 휴대폰 위 막대 한 번 봐 줘.

## 금윤호에게 — 2026-10-16 · 김민(Claude, 데스크톱 · 통합 세션) — 안 쓰는 표 둘 · 칸 여섯 지움(2단계) · 받으면 `npx prisma generate`

**받은 뒤 할 일: `npx prisma generate`** — 스키마에서 `AiReport` · `PoseAnalysis` 표와 `DailyCheckin.fatigue · stress · mood · restingHr · hydration` ·
`DailyNutrition.photoCalls` 를 뺐다(김민 결정 — 코드에서 읽는 곳 0, 값은 AI 리포트 8줄 · 체크인 옛 값 몇 개뿐). AGENTS 2번대로 2단계:
① 776fcbbc 가 스키마 · 코드에서 빼고 배포됨 ② **같은 날 DB 에서도 지웠다**(마이그레이션 `20261016140000_drop_unused_tables_columns`, 적용함).
지운 값은 `~/bullpen-log-backups/dropped-2026-10-16.json`(AI 리포트 8줄 · 체크인 옛 값 3줄 — 일반 백업은 Prisma 클라이언트 기준이라 스키마에서 뺀 표가 안 들어가서 따로 떴다).
**네 가지(브랜치)에서 이 표 · 칸을 쓰고 있으면** 받은 뒤 지워 줘 — 2단계 뒤에는 DB 에 없다. 투구 기록 영상 빼기(`app/api/pitch-log` PATCH)가 지우던 옛 폼 분석 줄도 걷었다.

## 금윤호에게 — 2026-10-16 · 김민(Claude, 데스크톱 · 통합 세션) — 탈퇴 · 회원 지우기를 한 함수로(lib/delete-user.ts)

받은 뒤 할 일 없음(DB 구조 그대로). 본인 탈퇴(`app/actions/auth.ts deleteAccount`)와 관리자의 회원 지우기(`app/actions/admin.ts deleteUser`)가 따로 지워
조금씩 달라서(관리자 쪽은 투구 영상 경로를 안 챙김) `deleteUserCompletely` 하나로 모았다. 파일 먼저 · DB 나중(DB 가 실패하면 다시 지우면 되고, 반대면 주인 없는 영상이 남는다).
User 관계가 없는 표: `VelocityRecording`(조각 · 표시 딸림)은 지우고 — 파일이 그 관리자 폴더라 같이 사라져 줄만 남았다 — `VelocityCalibRun` · `ShootCheck` 는 팀 자료라 남긴다.
**새 표에 userId 를 두고 @relation 을 안 달면** 통합 시험 [11] 이 실패한다 — `lib/delete-user.ts` 에서 지우거나 시험의 KEEP 에 까닭과 함께 더해 줘.
운영 DB 라 실제로 지워 보지는 못했다(tsc · 통합 시험만).

## 금윤호에게 — 2026-10-16 · 김민(Claude, 데스크톱 · 통합 세션) — 구속 측정 저장을 두 번 눌러도 세션 하나

받은 뒤 할 일 없음. **네 영역(`app/actions/velocity.ts saveVelocitySession`)에 한 단계 더했다**(be138b11): 10분 안에 같은 날 · 같은 차례의 잰 값(rawKmh)으로
만든 세션이 있으면 새로 안 만들고 그 세션 번호 · 공 번호를 돌려준다(끊긴 응답에 다시 누르면 세션이 둘 → 투구 탭 카드가 공 수를 두 배로 채웠다).
클립 올리기는 돌려준 공 번호로 그대로 붙는다. 통합 시험 [10] 이 이 순서를 지킨다.

## 금윤호에게 — 2026-10-16 · 김민(Claude, 데스크톱 · 통합 세션) — 3D '같은 영상 다시 막기'가 엔진 지문으로 판을 견준다

받은 뒤 할 일 없음(DB · 패키지 · 분석 서버 그대로). **네 영역(3D 분석 요청 · 약속)을 조금 고쳤다.**
- 예전엔 영상 탓으로 실패한 영상을 `PITCH3D_V2_VERSION`('2.0.0', 손으로 올리는 상수)으로 막아서, 엔진을 고쳐 Modal 에 올려도 판이 그대로라 영영 막혔다.
  이제 작업 판 = `engineKeyOf(build)` = `2.0.0+<build.json 지문>`(`lib/pitch-3d/v2/contract.ts`, 지문은 `getEngineBuild` — 5분 기억, 못 읽으면 '2.0.0'만).
  job.json 의 `engine` · `_guard.json` 실패 기록이 이 값이라, 엔진을 다시 올리면 실패한 영상도 한 번 더 해 볼 수 있다. GPU 로 보내는 `engine` 은 그대로 '2.0.0'.
- 확인: Modal v41(10-16 11:48) 지문 `7897975fbc95` = 지금 main 묶음 지문 — 서버 엔진은 최신이다. 이번에 `contract.ts` 를 고쳐 묶음 지문은 `fd55228af55b` 가 되지만
  서버 동작은 같아서 **다시 올리지 않았다**(올리면 기존 결과가 모두 '예전 엔진' 띠를 단다) — 다음에 엔진을 고칠 때 같이 올라간다.
- `pipeline.py` 의 `meta.lens` · `distances` 를 웹이 안 보내는 것은 문제 아님 — 줌 영상은 올리기 전에 막혀 늘 1배, 거리는 기록용. 시험 pitch3d:v2 320.

## 금윤호에게 — 2026-10-16 · 김민(Claude, 데스크톱 · 통합 세션) — DB 색인 8개 더함 · 받으면 `npx prisma generate`

받은 뒤 할 일: **`npx prisma generate`**(색인만이라 코드는 그대로 돈다 — 스키마와 맞추려고). 마이그레이션 `20261016130000_user_date_fk_indexes`, DB 에 적용함
(백업 `db-2026-10-16-10-22.json`). 더하기만 했다 — 지운 색인 · 칸 없음.
- 날짜 범위 조회: `PitchLog [userId, date]`(색인이 하나도 없어 화면마다 표 전체를 훑었다 — 10-15 클라우드 메모의 할 일, 그 메모는 지웠다) ·
  `UserExerciseLog [userId, date]`.
- 이어 지우기 · 비우기 칸(relationMode prisma 라 DB 외래키가 없어 Prisma 가 찾아 지운다): `UserExerciseLog [exerciseId]` · `UserExerciseFavorite [exerciseId]` ·
  `UserDrillFavorite [guideId]` · `UserDrillLog [guideId]` · `VelocitySession [pitchLogId]`(투구 기록 지울 때 SetNull · 측정 → 기록 잇기) · `Article [userId]`.
- 알림: `migrate diff` 가 `VelocityAttempt` 외래키 셋을 지우라고 계속 낸다(예전부터 DB 에만 있는 것) — 넣지 않았다. 마이그레이션을 만들 때 그 셋은 빼 줘.

## 금윤호에게 — 2026-10-16 · 김민(Claude, 데스크톱 · 통합 세션) — 컨디션 '아파요' 띠 1~4 · 체중 한 곳 · 달력 일정 다시 그리기 · 재활 시작 한국 날짜

받은 뒤 할 일 없음(DB · 패키지 그대로). 통합 시험(`npm run integration:test`, 23개)의 빈틈을 고치고 김민이 정한 것. **네 영역(체크인 · 영양 · 홈 달력 · 재활)을 조금 고쳤다.**
- 컨디션: `lib/checkin.ts CONDITION_BANDS` 의 '아파요'를 1~3 → **1~4**(엔진 낮은 날 문턱 `LOW_CONDITION_THRESHOLD` 4 와 같게 — 4 를 고르면 화면은 '보통이에요'인데
  엔진은 회복 날로 짰다). 엔진 문턱은 그대로, 통증 화면 강제(`PAIN_FORCED_CONDITION` 3)도 그대로. 네 셀프테스트의 띠 시험 기대값을 같이 고쳤다.
- 체중: 프로필에서 몸무게를 바꾸면 오늘 `DailyNutrition.weightKg` 도 쓰고(`profile.ts`, 바꿨을 때만), 영양 탭에서 **오늘** 체중을 적으면 `User.weightKg` 도 쓴다
  (`nutrition.ts setWeight`). 영양은 최근 30일 기록을 먼저 읽어 프로필만 고치면 한 달 동안 옛 체중으로 셌다.
- 달력 일정 저장 · 지우기(`calendar-event.ts`)가 `revalidatePath('/', 'layout')` — 트레이닝 엔진이 달력의 다음 등판을 읽어서.
- `training/rehab-start.tsx` 의 오늘을 `toDateKey(new Date())` 로(UTC 라 한국 0~9시에 어제였다).
- 나이 띠(트레이닝 16 · 영양 17 · 투구 한도 19)는 김민 결정으로 그대로 — 통합 시험이 '어긋남은 16 · 17세뿐'을 지킨다.

## 금윤호에게 — 2026-10-16 · 김민(Claude, 데스크톱 · 구속측정 엔진) — 구속 엔진 2.6.0: 세션 거리로 공 크기 다시 판정 · 덩어리 배율 1.163

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역(구속 측정)을 고쳤다.** 김민: "구속측정 엔진 성능을 올려 안정성 · 정확성을". 1배 줌은 엔진 개선에 반영하지 않는다(김민 결정 — 모두 2배 줌 기준).
- 오차표 `docs/velocity/accuracy-2026-10-16.md`: 2배 줌 스피드건 짝 35구를 지금 엔진으로 앱 규칙(높음만 기록 · 세션 거리 보정)대로 다시 잼. 엔진은 91% 를 재는데 앱에는 26% 만 남았다.
  공 크기 거리를 기준 20m 와만 견줘 실제 22.5m 자리의 빠른 공이 '15% 넘게 다름'으로 측정 불가가 됐다.
- 엔진(`analyze-distance.ts`): 공 크기 판정을 `judgeSize` 로 떼고 `rejudgeSize(result, refM)` 를 내보낸다 — 판정 전 믿음을 `DistanceReport.preSize` 에 두고, 판정한 거리는 `sizeRefM`(분석 JSON · DB 까지).
  `BLOB_SIZE_RATIO` 1.185 → 1.163(디코더 길에서는 장면이 노드 실험대와 같다).
- 측정 화면(`velocity-screen.tsx`): `addResult` 첫 줄 `judgeBySession` — 세션 거리 보정이 걸렸으면 그 거리로 다시 판정. 거리 알림 · `distanceMismatch`(`lib/velocity-analysis.ts`)도 `sizeRefM` 기준.
- 결과(실제로 다시 잼): 기록 9 → 14구, 110km/h 이상 3 → 7구 · 평균 차이 +0.1 · MAE 2.4km/h. 구속 값은 한 공도 안 바뀜. 보정 짝 묶음이 2.6 으로 새로 시작(2.5 짝은 없었음).
- 10-12 클립 22구는 `local-…`(폰 안)이라 서버에 없어 못 썼다. 다음 현장 측정은 관리자 보정용 저장을 켜서 클립을 서버에 남겨 줘. 실제 폰에서는 아직 안 봤다.


## 금윤호에게 — 2026-10-16 · 김민(Claude, 데스크톱 · 메커니즘 담당) — 투구 기록 그날 화면에 '드릴로 던진 공' 채우기 · 캐치볼에 더하기

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역(투구 기록 그날 화면 · 입력 폼)을 고쳤다.** 김민: 드릴로 던진 공을 기록에 바로 넣으면 손으로 적은 투구와
겹치니, 트레이닝에 '드릴로 공 약 N회 던졌어요' 카드를 띄우고 투구 기록을 남기면 사라지게(메커니즘 쪽은 d6ebbae5).
- 카드의 [투구 기록에 남기기] → `/pitch-log/<오늘>?drill=N&pct=P`. `[date]/load.ts drillPrefillOf` 가 **주소 숫자를 믿지 않고** 카드와 같은 판정
  (`lib/mechanics/load.ts loadDrillThrowNote`)으로 다시 읽는다 — 카드가 닫혔으면(오늘 투구 합이 드릴 시작 때보다 늘었으면) 채우지 않아 새로고침해도 두 번 안 남긴다.
  두 `page.tsx`(페이지 · `@modal` 팝업)가 `searchParams` 를 받아 넘긴다.
- `entry-form.tsx`: 선택 칸 `drillPrefill`(`DrillPrefill` 타입 export) — 캐치볼 · 투구수 · 체감 강도 · 메모('메커니즘 드릴 N회')로 채워 '더 적기'를 펴서 연다. 구속 측정 `prefill` 이 먼저.
- `day-client.tsx`: 오늘 캐치볼 기록이 있으면 먼저 고르기 카드 [캐치볼 기록에 더하기 | 새 기록으로] — 더하기는 그 기록의 수정 폼을 공 수 · 메모를 더한 값으로 연다.
  저장하면 다시 권하지 않는다(`drillDone`).
- (알림) `training/training-home.tsx` 의 카드 줄(`DrillThrowNoteCard`)을 다시 넣었다 — 667e6ec5 에서 빠졌었다.
- 화면은 로그인이 필요해 브라우저로 못 봤다 — 드릴 세션 뒤 트레이닝 카드 → 그날 화면을 폰에서 한 번 봐 줘.

## 금윤호에게 — 2026-10-16 · 김민(Claude, UI/UX 세션) — 판 넘기기는 처음 연 탭만 그림 · 아이폰 햅틱 · 글 접기 · 운동 중 시트를 Modal 로

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역(앱 틀 · 판 넘기기 · 홈 · 투구 기록 폼 · 영양 · 구속 측정 진동 한 줄)을 고쳤다.** 김민: UI/UX 검토 뒤 "1 · 3 · 4 · 5 진행".
- **판 넘기기**: 처음 연 탭만 그리던 것(c6066e7f)은 같은 날 되돌렸다(김민: "처음 접속하면 탭 사이 이동이 길다"). `app/(app)/@*/default.tsx` 가
  예전처럼 탭 넷을 다 그리되 `Suspense` 로 감싸 처음 연 탭이 먼저 뜨고 나머지는 뒤따라 들어온다. 움직임 줄이기면 판이 미끄러지지 않고 바로 옮긴다.
- **원래 있던 문제(실제 사이트에서도 재현)**: 탭을 옮긴 뒤 `router.refresh()`(당겨서 새로고침 · quietRefresh · revalidate)가 불리면 Next 가 페이지 전체를 다시 연다(MPA reload —
  replaceState 로 canonicalUrl 만 바뀌고 트리는 그대로라 숨은 판을 새 주소로 다시 받다 어긋나는 것으로 보임). 김민에게 따로 고치는 세션 카드를 올려 두었다.
- 홈 요약 칸(`feed-card.tsx`): 판의 `data-active` 가 빠지면 자동 넘김을 멈춘다(다른 탭을 보는 동안 3초마다 다시 그렸다).
- **햅틱**: 완료 순간 `buzz` → `haptic('success')`(체크인 저장 · 오늘 링 다 채움 · 운동 끝 · 새 기록 · 구속 결과 · 바코드 — 예전 `[15,120,15]` 는 아이폰 앱에서 0.5초 띄운 톡 둘),
  저장 성공(투구 기록 폼 · 음식 담기/바꾸기 · 목표 · 프로그램 시작 · 운동 메모 · 운동 더하기), `ErrorLine` 이 뜨면 `haptic('error')`, 하단 탭 · 날짜 띠 짧게 누름 `selection`,
  하단 탭 알약에 `data-press-none`(공용 옅어짐 · 작아짐 · 렌즈 세 겹이었다). `velocity-screen.tsx` 는 결과 진동 한 줄만.
- **Modal**(`components/modal.tsx`): 선택 칸 `toolbar`(제목 밑 고정) · `footer`(바닥 고정), `useLinger(open)`(닫히는 움직임을 보이게 잠시 붙듦), 끌어 닫기는 손 떼기 직전 100ms
  빠르기 · 위로 끌면 고무줄. 운동 중 시트 셋(`workout/run/exercise-sheet · swap-sheet · finish-sheet`)을 Modal 로 옮겼다(끌어 닫기 · ESC · 닫힘 움직임 · 자판 위로).
- 새 부품 `components/fold-note.tsx`(FoldNote — 겉은 '자세히' 한 줄): 홈 통증 확인 카드(안전 문장은 접지 않음 · '종에서 체크인' 안내 → [오늘 체크인하기] 단추) · 메커니즘 카드 ·
  영양 목표 창 계산 내역. 프로그램 고르기 목록은 두 줄(무엇 · 이런 분께), 트레이닝 일정 만들기 설명 문장을 짧게.
- 폰에서 봐 주면 좋은 것: 하단 탭 첫 누름(로딩 한 번) · 운동 중 시트 끌어 닫기 · 진동 느낌. 커밋 c6066e7f ~ e1c611a0(이 푸시).
- (같은 날 더) **같은 정보 두 번 정리**(김민이 고름): '오늘' 표시를 홈 달력 · 투구 달력(`video-calendar.tsx`) · 날짜 띠 셋 다 숫자에 파란 테두리 원 + 굵게
  (`month-calendar.tsx todayMarkClass`, 투구 달력 쉬는 날 칸은 회색 바탕을 빼고 점선만). 트레이닝 홈 · 그날 기록 · 영양 머리의 날짜 달력을 날짜 띠 끝 작은 그림으로
  (`DateScrollStrip end`, 영양 DateNav 는 그림만 — 날짜 글 · ‹ › · '오늘로' 뺌). 그날 화면 팔 상태는 한 줄 칩(`ArmStatusNote compact`, 누르면 머리 · 까닭),
  휴대폰 더보기 폴더에서 하단 탭 넷 타일 뺌(`app-shell.tsx inTabBar`), 트레이닝 홈 '트레이닝' 카드 → '오늘 운동'. 날짜 띠가 옆 판에서 고른 날을 못 맞추던 것도 고침.
- (같은 날 더) 색 줄이기: 트레이닝 앱 얼굴색 셋(`--color-app-*`)을 sky 하나로, 영양 탄 · 단 · 끼니 단백질 막대 sky, 작은 달력 요일 회색. 큰 숫자 올라가기:
  `components/onboarding/count-up.tsx` 가 화면에 들어온 뒤 시작(IntersectionObserver) — 영양 남은 열량 · 운동 끝 세 숫자(`done-client.tsx`, 떠오른 뒤) ·
  구속 결과(`components/velocity/pitch-result.tsx`). 홈 달력: [캘린더 | 목록] 고르개를 달력 머리 목록 그림으로(`MonthCalendar headerAction`, 목록 보기는 '최근 기록' + 달력 그림),
  날짜를 누르면 그날 칸이 하단 탭 위까지 보이게(`pitch-log-panel.tsx` — 칸이 자라는 동안 다시 잼, scroll-mb = `--tab-bar-top`).
- (같은 날 더) 움직임 점검(design-motion-principles) 뒤 고침: 홈 그날 칸은 높이를 움직이지 않고 안 칸만 옅어짐 + 올라오기(220ms, `motion-safe`) · 달력 칸 높이 변화도
  `motion-safe` · 달력 ↔ 목록은 바꿀 때만 `view-swap`(globals.css) · 팔 상태 칩은 `<details>` → `Expand` · **요약 칸(`feed-card.tsx`) 자동 넘김: 움직임 줄이기면 안 넘김,
  손가락으로 누르는 동안 멈춤, 직접 한 번 넘기면 그 뒤로 안 넘김**(10-14 의 '10초 쉬기'를 바꿈 — 김민 승인) · `CountUp` 은 움직이는 숫자를 화면 읽기에서 숨기고 끝값만,
  `from` 비율(영양 · 구속 0.7, 운동 끝 0).
- (같은 날 더) **화면 글 다듬기(김민: "AI 같은 느낌 나는 글 고쳐줘")** — 글만, 동작 · 값 그대로. 줄표(—) 17곳 → 두 문장, '~습니다'체 96줄 → 해요체(구속 측정 저장 ·
  거부 · 카메라 오류 글 — `app/actions/velocity.ts` · `lib/velocity-engine/*` 메시지 · 업로드, 엔진 2.6.2 '글만'), '환영해요' · '완료!' · 👏 · 홈 다 채움 축하 이모지(→ 파란 점),
  '자리를 비켜요' · '연구에 따르면' · '이곳에 ~표시돼요' 같은 직역투, '위험한지 안전한지 알려 드려요' · '언제든 ~고칠 수 있어요' 반복, 긴 안내 몇 줄, '해주세요' → '해 주세요'(41곳).
  **화면 글을 시험이 찾는 곳은 없었다**(training:test 실패 20 은 고치기 전과 같음 · highlights · arm-status · velocity engine2 통과). 구속 자동 메모(`lib/velocity-sync.ts`)는 옛 기록을 알아보는 표시라 그대로.
- (같은 날 더) **움직임 줄이기 안전망**(`app/globals.css` 끝): 기기에서 움직임 줄이기를 켜면 CSS transition · animation 을 곧바로 끝 모습으로(0.01ms — transitionend 는 그대로 옴),
  로딩 돌개(`.animate-spin`)만 뺀다. 진행 막대의 폭 · 높이 움직임 27곳 · 로딩 반짝임(`animate-pulse`) 7곳에 `motion-safe:`, `transition-all` 5곳 → 바뀌는 속성만.
  **새 움직임을 넣을 때도 `motion-safe:` 를 붙여 줘** — 안전망은 빠뜨린 곳을 위한 것이다. 막대는 끝이 둥글어 폭 그대로(늘이기면 끝이 찌그러짐).
- (같은 날 더) **디자인 점검 남은 여섯 고침**(김민: "다 고쳐줘"): 부하 지수 큰 숫자 검정(`coach/load-panel.tsx` — 상태 색은 배지 · 한 줄) · 체크인 첫 화면 체크 원 빛 번짐 뺌 ·
  트레이닝 홈 '이번 주' 운동을 한 날 수로(`training-home.tsx`, 단위 '일' 하나) · **투구 탭 머리**: 구속 측정 · 3D 를 제목 줄 오른쪽('분석' 앞)으로, 휴대폰은 그림만 있는
  40px 동그라미(`pitch-log-heading.tsx` — `PitchControls` 지움, `PitchLogHeading` 이 `canMeasure` 를 받음 · 구속 측정 관리자 두 곳도 같이) ·
  **모서리**: `rounded-md` → `lg`(작은 배지는 알약 모양이 됨), 카드인데 3xl 이던 셋 → 2xl, 시트 · 창 · 고르개의 3xl 은 그대로 ·
  **단추**: 공용 `Button` · `ButtonLink` 에 `size`(sm 40 · md 44 · lg 48px, 기본 md 는 예전과 같음) — 네 탭의 손으로 만든 파란 단추 28개를 옮겼다(휴대폰 알약 · PC 둥근 모서리).
  **새 파란 단추는 손으로 만들지 말고 `Button size=…` 을 써 줘.** 홈 요약 칸 점 28×44 · 바코드 닫기 · 식단 줄 단추 40px. 커밋 4811a42e ~ 18026ab1.
- (같은 날 더) **화면 글 많은 곳 다섯 줄임**(김민: "찾은 다섯 개 다 줄여줘" — 휴대폰 375 로 화면마다 보이는 글을 잰 뒤, 글은 지우지 않고 '자세히' 뒤로):
  투구 분석 아래(`coach/good-days.tsx` 찾는 법을 '어떻게 찾나요' 안으로 · `load-panel.tsx` 기록 빠짐 알림 한 문장 · `load-trend.tsx` 흐름 설명 한 문장, 643 → 410자) ·
  3D 동작 분석 목록 카드(`lib/pitch-lab-meta.ts` 새 `labCardChips` — 기본값과 다른 것만, 결과 화면 머리는 `labMetaChips` 그대로, 609 → 429자) ·
  메커니즘 첫 화면 · 내 루틴 만들기 목록(`armcare-media.tsx` ExerciseMedia 에 선택 칸 `extra`) · 근력 프로그램 상세 창(트레이닝 쪽). 커밋 0c88b8a4 ~ (이 커밋).

## 금윤호에게 — 2026-10-16 · 김민(Claude, 데스크톱 · 3D 담당) — 3D 결과의 '착지'를 앞발이 처음 닿은 순간으로(events.footContact) · footFlat 지움

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역(3D 엔진 · 결과 화면)을 고쳤다** — 10-15 의 footFlat 메모를 대신한다(그 메모는 지웠다).
김민: "드라이브라인 · 트레드처럼 지면에 닿는 순간". 점검 기준표(`scripts/pitch-lab/obp/norms.py`)가 드라이브라인 fp_10(체중 10% = 첫 닿음)이라 이제 같은 순간이다.
- `detectPitchEvents` 가 `footContact`(앞발이 내딛기 최고 속도의 50% 까지 느려진 순간, 두 장면 사이는 선으로 나눔)를 낸다. `footFlat` 은 지웠다.
  엔진이 앞발을 묶는 `footPlant`(발목 기준)는 그대로 — footContact 는 늘 그와 같거나 앞이다.
- 마커 15구(네 대 교차 뒤꿈치 · 발끝 높이가 정답, 서버와 같은 거친 30fps): footPlant 는 첫 닿음보다 가운데 93ms 늦었고(평균 절대 99),
  footContact 는 가운데 +21 · 평균 절대 26ms. 2D 발 점 높이로 찾기는 안 됐다(발이 땅 위 몇 cm 로 미끄러져 들어와 평균 절대 65ms).
- 결과 `events.footContact` 는 선택 칸. `plantFrame` · `shownEvents`(contract.ts)가 읽고, 옛 결과(footContact 없음 · 10-15 판 footFlat)는 footPlant 로 본다.
  '착지' 칩 · 이름표 · 착지 지표(분리 · 앞무릎 · 보폭 · 착지 → 릴리스) · 메커니즘 점검이 첫 닿음을 쓴다.
- 분석 서버(Modal)에도 올렸다(같은 날, `npm run pitch3d:bundle` → `modal deploy app.py`). 시험 `pitch3d:v2-test` 319(새 2) · v1 63.

## 금윤호에게 — 2026-10-16 · 김민(Claude, 데스크톱 · 메커니즘 담당) — 투구 드릴 40줄의 요소 · 분류를 바꿨다(운영 DB) · 새 분류 '근력 · 안정 드릴'

받은 뒤 할 일 없음(DB 구조 · 패키지 그대로, 드릴 줄의 값만 — 캐시 `library:guides:v12`). **같이 쓰는 드릴 라이브러리를 바꿨다**(AGENTS 3번 — 알림).
김민: "요소별 드릴이 맞게 들어갔는지 심층 분석 · 고쳐줘". 원본(Paradigm 강좌의 P1~P5 · 트레드 · 드라이브라인 설명 · 영상 장면)과 견줘
주 요소가 다른 19묶음을 고치고, 버티기 · 저항 · 물주머니 드릴 16묶음을 새 분류 '근력 · 안정 드릴'로(백업 `db-2026-10-16-02-34.json`,
`scripts/mechanics-reclass-2026-10-16.mjs`, 되돌리기 `--restore`). 근거 · 표는 `docs/mechanics/drill-review-2026-10-16.md`.
- **네 영역(촬영 관리자)과 닿는 곳**: `lib/shoot/later-drills.json` 의 '나중에 촬영' 드릴 4개(워터백 고관절 신전 · 밴드 저항 레터럴 푸시 투 베이스 ·
  불안정 드라이브 레그 · 스플릿 스탠스 무릎 아이소메트릭 프레스)의 원래 분류를 '근력 · 안정 드릴'로 바꿨다 — 찍어서 `--restore` 하면 그 분류로 간다.
  `lib/shoot/schedule.ts` 의 Bucket · `progress.ts` 의 이름표는 이 분류를 모른다(야외 계획을 다시 뽑으면 무브먼트로 묶인다) — 지금 계획 JSON 은 그대로라
  안 고쳤다. 다시 뽑을 일이 있으면 그때 한 줄씩 더해 줘. shoot:test 72 통과.
- 드릴 영상 목록이 분류 3칸 대신 **요소 6칸 + 근력 · 안정 + 나중에 촬영**으로 나온다(종류는 필터 · 펼친 카드). 관리자 등록 폼에서 종류를 고른다.

## 금윤호에게 — 2026-10-16 · 김민(Claude, 데스크톱 · 영양 담당) — 홈 요약 칸 '최근 7일 평균 kcal' 이 양을 안 곱함 · 영양 한 줄이 네 그날 화면에 · day-detail 칸 둘

**받은 뒤 할 일: 네 파일 한 줄 고치기**(김민이 네 영역이라 안 건드렸다). 영양 전체 점검(`docs/reviews/nutrition-2026-10-16.md`)에서 나왔다.
- `app/(app)/today/feed.tsx` 46~58줄: 최근 7일 식사를 `select: { date: true, kcal: true }` 로 읽어 `m.kcal` 만 더한다. `MealEntry.kcal` 은 **1인분 값**이라
  1.5인분을 담으면 1인분으로 센다 → 요약 칸 영양 장의 '최근 7일 평균 · 목표의 N%'가 틀린다. 고치기: select 에 `amount: true`, 더할 때 `m.kcal * m.amount`.
- 알림(할 일 없음): 10-16 커밋 cf0db02b 가 네 `pitch-log/[date]/load.ts` · `day-client.tsx` 에 '던진 뒤 회복식' 한 줄(`components/nutrition-line.tsx`)을 넣었는데
  그때 HANDOFF 를 못 적었다. 오늘 날짜 · 불펜 · 라이브 · 경기 기록이 있을 때만 뜬다(`lib/nutrition/nudge.ts`).
- 알림(할 일 없음): `lib/day-detail.ts` 의 `nutrition` 에 선택 칸 둘을 더했다 — `avoid`(식단 취향의 못 먹는 것) · `unknown`(값을 모르는 탄 · 단 · 지).
  홈 영양 조언이 예시 음식에서 못 먹는 것을 빼고, 모르는 영양소로 '더 먹을 양'을 셈하지 않게. 아무것도 안 뺀 사람의 홈 글은 그대로다.

## 금윤호에게 — 2026-10-16 · 김민(Claude, 데스크톱 · 통합 세션) — 구속 측정은 투구 기록을 만들지 않는다 · 받으면 `npx prisma generate`

받은 뒤 할 일: **`npx prisma generate`** — `VelocitySession.sessionType String?` · `effortPct Int?` 를 더했다(마이그레이션
`20261016120000_velocity_session_type_effort`, DB 에 적용함, 백업 `db-2026-10-16-02-51.json`). 비워 둘 수 있어 옛 코드도 돈다. **네 영역(구속 측정 저장 · 화면 글)을 고쳤다.**
- 김민 결정: 구속 측정은 별개 기록, 투구 기록을 남길 때 참고만. `saveVelocitySession` 이 더는 PitchLog 를 만들지 않고 종류 · 체감 강도를 세션에 둔다
  (같은 불펜을 손으로도 적으면 투구 수 · 부하가 두 번 셌다).
- 투구 탭 '오늘' 카드: 오늘 측정 중 기록으로 안 남긴 공이 있으면 한 줄 + 단추 '측정한 N구 기록 남기기' → 그날 화면이 새 기록 폼을 측정값(종류 · 공 수 ·
  최고/평균 · 강도)으로 채워 연다. 저장하면 POST 가 `velocitySessionIds` 로 그 세션을 기록에 잇는다(`pitchLogId`). 규칙은 `lib/velocity-meta.ts`
  `unloggedSessions` · `logPrefillOf`(시험 velocity:test 3개).
- 남기기 전에는 그 공이 팔 부하 · 휴식에 안 들어간다(카드가 그렇게 알린다). 옛 세션(같이 만든 기록이 있음)은 그대로 — `syncVelocitySession` 은 표시 메모가 있는 옛 기록만 다룬다.
- 측정 화면 글 둘: 종류 단계 '투구 기록을 남길 때 이 종류로 채워요.', 저장 뒤 '저장했어요. 투구 기록으로도 남겨 주세요. [기록 남기기]'.
- 알림: `migrate diff` 가 `VelocityAttempt` 외래키 셋을 지우라고 낸다(예전부터 DB 에만 있는 것) — 이번 마이그레이션에는 안 넣었다.
- 화면은 브라우저로 못 봤다(로그인 필요) — 폰에서 측정 → 투구 탭 카드 → 기록 남기기를 한 번 봐 줘.

## 금윤호에게 — 2026-10-16 · 김민(Claude, 데스크톱 · 통합 세션) — 체크인 3판 뒤 꺼져 있던 근육통 규칙 되살림 · 카드 답이 체크인 없는 날에도 들어감

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역(트레이닝 엔진 · 암케어 읽기)을 조금 고쳤다.** 통합 검토(`docs/architecture/README.md` P0 1 · 2번)에서 나온 것.
- 3판은 근육통을 묻지 않는데 읽는 규칙(prescription · theme · day-state · 암케어 · 프로그램 · auto-setup · volume)이 그대로라 새 기록에서는 한 번도 안 걸렸다.
  김민 결정: 다시 묻지 않고 몸 그림으로 어림 — `lib/checkin.ts sorenessFromParts`(뻐근 · 통증 부위 수 0 없음 · 1 조금 · 2 보통 · 3 많이 · 4~5 심함).
  `gather.ts` 가 `c.soreness ?? sorenessFromParts(c)` 로 넣어 엔진 쪽 읽는 곳은 손대지 않았다. 잘 던진 날(`good-days-load.ts`)도 같은 어림.
- 3판 저장(`app/actions/checkin.ts`)이 옛 칸 `soreness` · `sleepHours` · `armFatigue` 를 비운다 — 같은 날 2판으로 적은 값이 남아 엔진이 읽었다.
- 트레이닝 탭 카드 답은 체크인 줄이 있는 날만 facts 에 합쳐져, 체크인 없이 카드만 답하면 버려졌다 → facts 에 `condition.prefsToday`(gather 가 넘길 때만 칸이 생김)
  + 읽기 `todayPrefsOf(facts)`(`lib/report/facts.ts`). daily-plan 셋 · auto-setup · day-state · prescription · armcare/routine 이 이것으로 읽는다.
  **새로 '하고 싶은 운동'을 읽을 때는 `facts.condition.today?.preferred*` 대신 `todayPrefsOf(facts)` 를 써 줘**(셀프테스트가 그 다섯 파일을 본다).
- 시험: training:test 새 3개 통과, 실패 19개는 고치기 전(a70d2ecf)과 같은 목록. 화면 · 실제 계정으로는 안 봤다.

## 금윤호에게 — 2026-10-15 · 김민(Claude, 맥북) — 구속 앱 카메라 '되면 120fps'를 뺐다(엔진 2.5.2) · 첫 화면을 카메라로

받은 뒤 할 일 없음(DB · 패키지 · 앱 굽기 그대로). **네 영역(구속 측정)을 고쳤다.**
- `lib/velocity-engine/dual-capture.ts`: `preferFps: 120`(2.4.2)을 청하지 않는다 — 모든 폰 1080p 60 으로 통일(김민: "60 으로 통일"). 까닭: 120 을 내는
  폰과 60 만 내는 폰이 다른 조건으로 재고(10-08 '같은 기준 조건' 원칙), 120 실제 영상은 아직 검증 전이고, 스피드건 보정 짝에 60 · 120 공이 섞였다.
  셔터 상한 1/500 · 시간 기준 문턱(2.4.2)은 그대로. Swift 의 `pick(prefer:)` 는 남겨 둠(칸이 없으면 60). 측정 화면의 '1080 · 60 을 못 내 120 으로
  켰어요' 안내도 모자랄 때만 뜨게 고쳤다.
- 같은 날: 구속 측정 첫 화면이 카메라(`/velocity` = `velocity-screen.tsx`, 옛 `velocity-home.tsx` 지움) — 셔터 '측정 시작' → 카메라 위 안내창(지난 설정 ·
  종류 · 카메라 위치 · 주의사항 · 수평 · 존, 다음 단추는 창 안), 셔터는 빨간 원(`Shutter`), 주의사항 창(<dialog>)은 `TipsCard` 로. 커밋 e7712b1b ~ fce50da0.

## 김민에게 — 2026-10-15 밤 · 금윤호(Claude) — 탭 쓸기를 '판 넘기기'로 갈아탔다(병렬 경로 — 탭 넷이 늘 떠 있다, 로딩 0) — 네 3판 tab-swipe.tsx 를 지웠다

받은 뒤 할 일 없음(DB · 패키지 그대로). 사용자(인스타 영상 비교): "천천히 끌면 로딩이 다 보이고 제목 높이도 안 맞는다 — 인스타처럼 이질감 없이".
네 3판(사본 가리개)까지 포함해 '이동을 빨리 하고 가리는' 방식으로는 천천히 끌 때 옆에 진짜 화면이 없는 게 드러나, **방식을 바꿨다**.
- **틀**: `app/(app)/layout.tsx` 에 병렬 경로 자리 넷 `@home · @videos · @training · @nutrition`. 각 자리의 `default.tsx` 가 주소와 상관없이 그 탭을
  그려 처음부터 넷이 다 떠 있고(잠긴 탭은 `components/tab-locked.tsx`), 한 번 그려진 판은 주소가 바뀌어도 그대로 산다(판마다 제 스크롤 자리).
  탭 화면 파일은 `today/home-page.tsx` · `videos/videos-page.tsx` · `training/training-page.tsx` · `nutrition/nutrition-page.tsx` 로 이름이 바뀌었고
  (같은 폴더의 부품 · import 는 그대로), 탭 주소의 `page.tsx` 는 빈 쪽이다 — **없애면 안 된다**(병렬 경로는 맞는 쪽이 없으면 지난 하위 화면을 그대로
  둔다, 시험으로 확인). `@home/today/loading.tsx` · `@nutrition/nutrition/loading.tsx` 로 옮겼다.
- **`components/tab-pager.tsx`**(새): 네 판을 가로 트랙에 두고 옆으로 민다. 놓으면 `history.replaceState(null, '', href)` 로 주소만 — Next 가
  `usePathname` 에 반영하되 다시 받지 않는다(state 에 Next 것을 넘기면 안 바뀐다). 손가락 받기(touchmove 막기 · LOCK_RATIO · claim · settleFor)는 네
  3판 그대로 옮겼다. 하단 탭 누름(`slideToTab`) · 렌즈 신호(`TAB_CHOSEN_EVENT`)도 그대로. 홈 → 오른쪽 구속 측정(zoom)도 그대로.
- **스크롤이 창 → 판**(`lib/scroller.ts` — `activeScroller()` · `scrollTopNow()` · `scrollToTop()` · `onAnyScroll()`): 위 막대 숨기기 · 당겨서 새로고침 ·
  탭 다시 눌러 맨 위가 이걸 본다. 창 스크롤을 직접 읽는 네 부품이 있으면 여기로 바꿔 줘. `html[data-pager]` = tabs(탭 첫 화면: 창 안 굴러감 ·
  본문 여백 0 · 비우개 숨김) | page(하위 화면: 예전대로). PC(desk)는 지금 판만 보이고 창이 굴러간다.
- 위 막대는 네 탭 모두에(예전 bare 걷음) — 탭마다 본문이 같은 높이에서 시작한다.
- **값**: 홈을 열 때 네 탭의 조회가 같이 돈다(판마다 Suspense 라 홈이 먼저 뜬다). `npm run tabs:timing` 으로 첫 로드가 얼마나 늘었는지 한 번 재
  보고 싶다 — 네가 줄여 둔 조회가 여기서 효과를 본다. 많이 늘면 default.tsx 를 '처음 갈 때 그리기'로 바꿀 수 있다.
- 폰에서 봐 주면 좋은 것: 네 탭 쓸기(천천히 · 빠르게), 위 막대 숨기기, 당겨서 새로고침, 트레이닝 안 암케어 → ‹ 뒤로, 잠긴 계정의 판, 투구 기록
  날짜 팝업 열고 닫기, 설정 창.

## 금윤호에게 — 2026-10-15 · 김민(Claude, 맥북) — 3D 엔진: 뒤 영상이 어깨 이름을 미리 바꿔 찍은 장면 바로잡기

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역(엔진 `lib/pitch-3d/v2/clean2d.ts` · `fit.ts`)을 고쳤다** — 분석 서버(Modal)에 올려야 새 분석에 들어간다.
김민: "샘플 1 착지 때 오른팔이 실제보다 올라가 있고 벌어져 있다". 뒤(2루) 영상 RTMW 가 몸통이 도는 동안 두 어깨가 실제로 엇갈리기 6장면 전에
어깨 · 팔꿈치 이름을 미리 바꿔 찍고 두 손목은 공 위에 겹쳤다 → 엔진 좌우 고침(repairLabels)은 손목이 겹쳐 30% 를 못 넘고 앞뒤 장면도 같이 틀려 못 고침 →
3D 던지는 어깨가 몸 가운데로, 팔꿈치가 뒤 영상에서 50~108px 벗어남.
- `fixShoulderSwaps`: 두 어깨가 키의 13% 넘게 떨어져 있고 두 손목이 겹친 채 어깨 이름 하나가 한 장면에 키의 10% 넘게 뛰어 다른 어깨 자리를 차지하면, 실제로
  엇갈릴 때(두 어깨 5% 안)까지 팔 이름을 서로 바꾸고 바꾼 뒤에도 겹친 가짜 쪽만 안 보임으로. 샘플 1 뒤 영상 7장면에서 팔꿈치 50~108 → 3~24px · 어깨 45~60 → 28~42px.
- 실험실 8샘플 · 마커 15구 · 합성 시험에서 걸리는 건 샘플 1 의 7장면뿐(실제 엇갈림은 어깨 사이 7~12% 라 안 걸림, 갈라진 손목은 repairLabels 에 맡김).
  숨기기만 하면 팔꿈치 10px 나아지고 어깨 15px 나빠졌고, 앞단(core)에서 숨기면 카메라가 흔들려 좌우 고침이 엉뚱한 곳에서 14번 걸렸다 — 그래서 바로잡기.
- 시험 v2 314(새 4). 떨림 검사는 끔 · 켬이 같다.

## 금윤호에게 — 2026-10-15 · 김민(Claude, 클라우드) — 탭 전환 빠르게: 서버 조회 차례 기다림 줄임 · DB 연결 20 · 탭 쓸기 · 탭 누름

받은 뒤 할 일 없음(DB 구조 · 패키지 그대로). 사용자: "탭 전환을 더 빠르게 — 서버 시간을 재서 줄이자". **네 영역(홈 · 트레이닝 · 영양 · 앱 틀)을 고쳤다.**
- 조회 차례 기다림(앞 조회가 끝나야 다음을 시작)을 같이 돌게: `loadTodayCore` 의 지난 판 닫기(닫기가 쓰는 표를 같이 읽지 않음 — 주석),
  홈 요약 칸(`feed.tsx` — 오늘 셈과 하이라이트 · 영양 · 그날 요약을 같이, `loadHighlights` 가 부하 지수를 약속으로 받음), 운동 소모 세트
  (`burnMixesInRange` — 판을 기다리지 않고 날짜로, `sessionBurnMixes` 지움), 날짜별 구속(`loadVelocityByDate` 왕복 2 → 1), 트레이닝 홈
  카드(오늘 판 · 프로그램 · 내 팔 지도를 같이 — 지난 판을 닫았으면 프로그램만 다시 읽음, `loadTodayCore` 가 `closedSessions` 를 돌려줌),
  사용자 읽기(`lib/dal.ts` — 시험 계정 날짜 ensureSim 과 사용자 조회를 같이, 둘 다 끝난 뒤 돌려줌 · `lib/session.ts readSession`).
- 영양 탭은 지난 날짜를 볼 때 조언을 셈하지 않는다(`advice` null).
- `lib/prisma.ts`: pg 연결 10 → 20(화면 하나가 조회 14~50개를 한꺼번에 내 줄을 섰다). 풀러(6543) 손님 한도 안. 'too many clients' 가 보이면 이것부터 내려 줘.
  `PRISMA_TIMING=1` 이면 조회마다 걸린 시간을 찍는다. 재는 도구 `npm run tabs:timing -- --email=<이메일>`(빌드한 서버에 RSC 요청, 사용법은 그 파일 머리).
- 남긴 것(DB 구조 바꿈이라 너와 맞춘 뒤): `PitchLog` 에 색인이 하나도 없다 — `@@index([userId, date])` 하나로 투구 조회 십여 개가 표 전체를
  안 훑게 된다. `UserExerciseLog` 도 날짜 범위 조회에 `[userId, date]` 색인이 없다. 둘 다 더하기라 안전하지만 백업 · 알림 뒤에.
- 탭 쓸기(`components/tab-swipe.tsx`)는 손가락을 터치 이벤트로(아이폰이 세로 스크롤로 빼앗던 것) · 사본 껍데기 div(연달아 쓸면 빈 화면이던 것) ·
  손 떼자마자 새 화면을 부르고 빠르기를 이어받음. 하단 탭을 누르면(`slideToTab`) 쓸기처럼 누르는 순간 밀린다.
- (같은 날 더) 하단 탭(`app-shell.tsx` TabFace): 이름 굵기를 렌즈가 선 칸(`selected`)으로 — `slideToTab` 이 링크를 안 따라 pending 이 안 켜져 0.3초 뒤에 굵어졌다.
  렌즈가 닿을 때 아이콘 8% 커짐(`tab-lens.ts` ICON_LIFT)은 0 으로(사용자: "선택되고 0.3초 뒤 아이콘이 움직여"). 아이콘 + 이름을 `pt-[2px]` 로 내려 렌즈 위아래 여백을 맞춤.
- (같은 날 더) 제목 밑 날짜 띠(사용자: "영양 위 최근 날짜 보기를 트레이닝 · 영양 둘 다"): 영양은 휴대폰에서도 다시 보임(10-14 에 숨긴 것), 트레이닝 홈 ·
  그날 기록(`/training/day/[date]`)에 같은 모양 띠(`training/day-strip.tsx` · `lib/training-week.ts` — 운동 · 암케어 · 메커니즘 한 날을 점으로, 오늘은 홈).
- (같은 날 더) 트레이닝 제목 옆 간이 달력(`training/date-nav.tsx` — 영양 DateNav 와 같은 판, 점은 열 때 `app/actions/training-days.ts` 로 1년치). 트레이닝 홈 머리는
  PageHeading 대신 영양처럼 제목 · 달력 · 분석 한 줄(`training-home.tsx`). 그날 기록 화면은 달력 그림만.
- (같은 날 더) 날짜 띠를 한 주 + 겹화살표 → 최근 6주를 옆으로 굴리는 한 줄로(사용자: "좌우로 긴 것 스크롤 가능하게"). 공용 `components/date-scroll-strip.tsx` ·
  범위 `lib/date-strip.ts stripDays`. 영양 `NutritionDay.strip` 이 7일 → 42일(`lib/nutrition/load.ts` — 식사 · 운동 읽는 범위도 그만큼 넓어짐), `loadTrainingWeek` → `loadTrainingStrip`.
- (같은 날 더) **네 영역(구속 측정 화면)을 앱 모양으로 손봤다** — 사용자: "구속측정 인터페이스를 지금 우리 시스템에 맞게, 너무 조잡해". 엔진 · 저장 · 동작은 그대로, 그리기 · 글만.
  첫 화면(`velocity-home.tsx` · `session-history.tsx` — 큰 제목, 마지막 세션 최고 큰 숫자 한 장 + 그래프, 최근 세션 5줄, 로고 카드 뺌) · 설정 단계(`setup-art.tsx` OptionCards 를
  앱 고르기 카드 같은 한 줄로, '이럴 때' 줄 뺌, `setup-steps.tsx` StepShell 에 'n/5') · 카메라 화면(수평 · 존은 셔터 대신 파란 [다음 ›], 측정 셔터 글자 뺌) ·
  세션 요약(숫자 넷 줄 → 큰 숫자 한 장) · 설정 시트(체크 상자 → `components/switch.tsx`, 아래 단추 둘 → 목록 줄, 제목 '구속 측정 설정'). 구속 숫자는 Bebas(`text-display`) → `text-numeric`.
  실제 카메라 · 아이폰 앱으로는 못 봤다(미리보기는 가짜 카메라) — 폰에서 측정 한 번 봐 줘.
- (같은 날 더) **구속 측정 설정을 줄였다**(사용자 지시 여섯): ① 거리는 [기준 20m | 줄자] 둘만 — 관리자의 '공마다 공 크기'(`distAuto`)를 걷고 저장된 값도 늘 끔
  (`lib/velocity-setup.ts` loadSetup, `DIST_MODES_ADMIN` 지움) ② 네트 단계 · 설정 줄을 없앴다 — 늘 `net: false`(자동초점), 단계는 종류 → 카메라 위치(여기서 [카메라 켜기]) → 수평 → 존, 4단계
  ③ 측정은 늘 자동(`autoMode` 늘 true, 설정의 '자동 측정' 줄 · 아래 막대의 자동/수동 단추 뺌) — 그 자리에 [초점] 단추(`refocus`), 위 줄 재초점은 측정 밖 단계만
  ④ 영상 파일로 재기 단추는 관리자만 ⑤ 주의사항 카드에서 '2배 줌 그대로' · '거리' · '자리' · '표적' · '스피드건 짝'을 뺐다(자리 · 거리는 카메라 위치 단계에서 한 번만 말한다),
  튜토리얼 '먼저 준비할 것' 장도 뺌 ⑥ 지난 설정 요약은 종류 · 카메라 두 칸.
- (같은 날 더) 스피드건은 관리자만: 설정의 '스피드건 보정 적용' 줄(`VelocitySettingsFields` · `VelocitySettingsButton` 의 `isAdmin`) · 공 고치기의 스피드건 값 칸
  (`PitchEditorFields` 의 `showGun`, 측정 화면 · 그날 화면 `VelocitySection isAdmin` — load.ts 가 `isAdmin` 을 실음) · 결과 화면 '스피드건 값 넣기' 단추.
- (같은 날 더) **네 영역(투구 탭)을 앱 모양으로 정리했다** — 사용자: "투구 파트도 우리 시스템에 맞게, 캘린더만 지금처럼 크게". 캘린더는 그대로.
  머리(`pitch-log-heading.tsx`): 구속 측정 · 3D 동작 분석 흰 카드 단추 줄 → 고르개 옆 40px 칩(휴대폰 '3D 분석'). 목록(`video-gallery.tsx`): 2열 카드 →
  한 줄(작은 썸네일 · 날짜 · 종류 · 구속 · 강도 · ›), 정렬은 select, 종류 거르기는 가로로 미는 칩 한 줄, 대표 별은 줄 오른쪽. 그날 화면: 연필 · 휴지통 원 둘 →
  ⋯ 하나(동작 시트, `day-record.tsx`), 빈 '메모 없어요' · '영상 없어요' 상자 뺌, 팝업에서는 [홈 달력][투구 기록] 칩 줄 숨김(창 닫기가 돌아가기), 팔 상태는
  머리 한 줄(`ArmStatusNote compact` — 새 선택 칸). 입력 폼(`entry-form.tsx`): 종류 · 투구수 · 체감 강도만 펴 두고 구속 · 영상 · 만족도 · 메모는 '더 적기'
  안으로(고칠 때 적은 게 있으면 펴서 열림, 접어도 올리던 영상 · 글은 그대로). 쉬는 날은 메모를 바로 보인다.

## 금윤호에게 — 2026-10-15 · 김민(Claude, 맥북) — 파워 운동 10개 더함 · 촬영 계획 2~5주 다시 짬 · 드릴 영상이 파워 복사본에도 붙음

받은 뒤 할 일 없음(DB 구조 · 패키지 그대로, 운동 줄만 더함 — 운동 캐시 v30). **네 영역(촬영 관리자)을 고쳤다.**
- 운동 라이브러리 파워에 회전 메디신볼 던지기 6(투구 드릴 복사 — 같은 참고 영상 · 설명) · 한 발 점프 2 · 상체 플라이오 2(c410746b, `scripts/library-power-plyo-2026-10-15.mjs`).
- 촬영 계획: 찍은 1주차는 그대로, 2~5주를 새 넷(싱글렉 브로드 점프 · 싱글렉 박스 점프 · 인클라인 플라이오 푸시업 · 플라이오 푸시업)을 넣어 다시 나눴다
  (`shoot:plan --from=2 --planned --sessions=4 --pace=1.07 --add=…`, LW=3 SP=1.6 — 새 인자 `--add`). **2주차부터 번호가 바뀌었다**(체크는 id 로 그대로).
  끝 2:54 · 3:02 · 2:57 · 2:50, 하체 29~31.5. 3시간 안에 드는 나눔은 한 주에 하체가 36.5 로 몰려, 시험 기준을 '3시간 + 5분'으로 늘렸다.
- 회전 던지기 복사본 여섯은 야외 6 · 7주에 드릴로 이미 있다 — `attachShootClip` 이 드릴 영상을 붙이면 같은 참고 영상(또는 같은 영상 경로)인 파워 운동에도 붙인다.

## 금윤호에게 — 2026-10-15 · 김민(Claude, 클라우드) — 워터백 운동 · 드릴을 '나중에 촬영'으로(스크립트만, DB 는 아직)

받은 뒤 할 일 없음(DB 구조 · 패키지 그대로). 사용자: "워터백이 없어 — 영상 촬영 · 운동 목록에서 전부 나중에 촬영으로, 워터볼은 그대로".
**같이 쓰는 운동 · 드릴 라이브러리의 분류를 바꾼다**(AGENTS 3번 — 알림). 10-14 운동 63 · 드릴 37 과 같은 방식이다.
- 촬영 계획(`lib/shoot/plan-data.json`)에는 이미 워터백 운동이 없다(워터볼 7개만 — 그대로 둠). 계획 번호는 안 바뀐다.
- `scripts/library-waterbag-later-2026-10-15.mjs`: 도구에 '워터백'이 있거나 이름에 든 운동 · 드릴을 '나중에 촬영'으로, 원래 분류는
  `lib/shoot/later.json` · `later-drills.json` 에 더하고 캐시 이름(`library:exercises` · `library:guides`)을 하나씩 올린다.
  맥북에서 돌려 보니(10-15, 백업 `db-2026-10-15-04-59.json`) **옮길 것 0개** — 워터백 운동은 없고, 워터백 드릴 하나(다이내믹 고관절 신전 + 워터백)는
  10-14 에 이미 '나중에 촬영'이었다. DB · json · 캐시 그대로.
  계획에 든 것이 나오면 스크립트가 멈춘다. 되돌리기는 10-14 스크립트의 `--restore 이름…`.

## 금윤호에게 — 2026-10-15 · 김민(Claude, 클라우드) — 3D 동작 분석: 화면 녹화 · 따로 찍은 짝 금지(두 폰 동시 촬영만) · 촬영 모드 되돌리기 알림 자리

받은 뒤 할 일 없음(DB 구조 · 패키지 그대로 — meta.json 의 files 에 선택 칸 at · src · dur 만). **네 영역(실험실 올리기 · 촬영 모드)을 고쳤다.**
사용자: "녹화 영상 금지, 두 번 따로 촬영도 금지, 무조건 동시에", "AirDrop 으로 옮기면 프레임이 떨어진다 — 원본 유지하며 옮기는 법도".
- 올리기 칸의 '동시에 두 대 | 한 대로 나눠' · '화면 녹화 | 원본' 고르기를 뺐다(늘 synced true · screenRecorded false).
- 새 `lib/pitch-lab-file.ts`: 파일 머리(moov)에서 찍은 시각(아이폰 creationdate · mvhd) · 길이 · 렌즈 정보를 읽는다.
  `lib/pitch-lab-guard.ts`: 이름 바꾼 화면 녹화(렌즈 없음 + 화면 비율 + 100fps 밑) 막기, `labPairBlock`(같은 파일 · 찍은 시각 차가 긴 영상 길이 + 3초 넘으면 막음,
  출처가 다르면 30분 배수 시간대 어긋남은 봐줌), `labMetaBlock`(서버 `saveLabSample` 이 다시 봄 — 막히면 정보 없는 새 폴더를 `deleteUnsavedLabSample` 로 지움).
- 고른 영상 밑에 초당 장수 표시, 30fps 막기 · 60fps 알림에 'AirDrop 은 옵션에서 모든 사진 데이터'. 촬영 안내에 '영상 옮기기' 칸 · 확인 목록 10번째.
- (같은 날 더) 촬영 정보의 '폰까지 거리'를 폰마다 두 칸으로(`LabMeta.distances` { side · back } — 사용자: "1배여도 폰마다 크기가 다름"). 옛 한 칸 `distanceM` 은 읽기만.
  기록 · 표시만 하고 3D 계산에는 아직 안 넘긴다. 카드 표시에서 늘 같은 '동시 촬영' · '원본'은 뺐다(옛 샘플의 '한 대로 나눠 찍음' · '화면 녹화'만 남음).
- (같은 날 더) **네 앱 틀(`components/app-shell.tsx` MobileTopBar)을 고쳤다** — 사용자(Claude · 인스타 앱 화면을 보이며): "노치 밑에 선이 그어지고 흐린 게 퀄리티가 떨어진다".
  시계 자리 92% 판 · 막대의 바탕 · 굴리면 나오던 밑줄(`useScrolledFromTop` 지움)을 걷고, 막 하나(`[data-top-veil]`, globals.css)가 시계 자리 + 막대를 덮고 밑 1.5rem 동안
  흐림 · 바탕색이 같이 옅어진다. 막대가 보이면 막대 자리는 불투명(구속 측정처럼 — 글자 겹침 때문), 막대가 숨거나 없는 탭이면 시계 자리까지 줄고 거의 투명(흐림 세 겹이 위로 갈수록 겹침). `data-safe-area` 는 높이 표시로만 남김. **아이폰 앱에서 흐림이 깜빡이면 그 판의 backdrop-filter 만 빼 줘.**
- 촬영 모드(`run-client.tsx`) 되돌리기 알림을 아래 막대 높이를 재서 그 위 8px 에, 주차 화면은 하단 탭 위(`undo-toast.tsx` 기본 자리).
- 시험 `pitch3d:v2-test` 310(새 27 — 가짜 mov 머리 읽기 포함) · `pitch-lab:test` 16. 실제 아이폰 화면 녹화 · AirDrop 받은 파일로는 못 봤다.

## 금윤호에게 — 2026-10-15 · 김민(Claude, 클라우드) — 3D 동작 분석에 촬영 안내 화면(`/videos/lab/guide`)

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역(실험실 화면 · 결과 화면 실패 칸)을 고쳤다.** 사용자: "우리가 가장 잘 인식할 수 있는 조건을 사용자가 참고해서 촬영할 수 있게".
- 새 화면 `app/(app)/videos/lab/guide/`: 찍기 전 확인 9개(체크는 그 폰 localStorage) · 폰 두 대 자리 그림(옆 3루 쪽 4~6m · 뒤 2루 쪽 4~5m · 90°) ·
  화면에 담기 그림 셋 · 폰 설정(아이폰 · 갤럭시) · 찍는 순서 · 올리기 · 실패 까닭별 고칠 것. 글 · 근거는 `lib/pitch-lab-guide.ts`(순수) 한 곳 —
  조건은 엔진이 실제로 막는 곳(`pitch-lab-guard.ts` labVideoBlock · `pipeline.py` FRAMING_* · `analyze.ts` FAIL_TEXT · 기준 축)에서 가져왔다.
  **문턱(30fps · 720 · 1배 · 2초 · 200px · 60~120°)을 바꾸면 안내 글도 같이 봐 줘.**
- 입구 넷: 올리기 칸 위 '촬영 안내' 줄(예전 두 줄 안내를 대신함) · 빈 목록의 '촬영 안내 보기' · 올리기 전 검사에 걸린 오류 밑 링크 ·
  결과 화면 실패 칸(`analysis-v2.tsx` V2EmptyWell — 영상 탓 실패면 `LAB_FAIL_FIX` 의 고칠 것 한 줄 + 안내의 그 칸으로, 서버 탓이면 예전 그대로).
- 시험 `pitch-lab:test` 16(새 5 — 영상 탓 실패마다 고칠 것 · 해요체 · 줄표 없음). 화면은 임시 경로로 휴대폰 375 · 320 · PC 1536 · 어두운 테마(넘침 0, 체크 저장 · 새로고침 뒤 남음).

## 금윤호에게 — 2026-10-15 새벽 · 김민(Claude, 맥북) — 전체 검토 뒤 고침: 홈 · 트레이닝 조회 · 앱 틀 버그 · 아이패드 배치 · 간격

받은 뒤 할 일 없음(DB · 패키지 그대로). 김민: "화면 속도 · 버그 · 공백 전부 검토 → 다 고쳐줘". **네 영역을 많이 고쳤다** — 커밋 셋.
- 82e38e43 앱 틀: 아이패드 위 막대 · 시계 자리 · 비교 막대 · 알림이 왼쪽 탭 막대(--rail) 밑에 깔리던 것(뒤로를 누르면 홈 탭이 눌림), 첫 체크인 '고쳤어요',
  새로고침 돌개가 시계 자리 밑에 가림, 탭 쓸기 · 새로고침이 트레이닝 하위 화면에서도 걸림(`barSnapshot().back` 이면 안 받음), 다시 쓸 때 자리표시 사라짐,
  잠긴 구속 측정으로 zoom 전환, 사파리 두 손가락 확대(`touch-pinch-zoom`). 위 막대 · 시계 자리 뒤 흐림은 다시 뺐다(바탕 92%).
- 2ee298a1 배치: 아이패드에서 꽉 찬 단추 · 고르개가 늘어나던 것(pad:w-auto), 투구 달력 두 칸 기준 xl → lg(홈과 같게), 섹션 · 카드 간격 토큰, 경고 상자 모양,
  카드 여백 `--block-pad`(공용 `training/check-row.tsx` 포함), 글자 크기 대괄호 → 토큰.
- 4d5c7d50 조회: `loadTodayCoreCached`(홈 본문 · 요약 칸이 같은 계산을 두 번 하던 것) · `loadTodayCore` 안 조회를 한 번에 · 트레이닝 탭 앞 조회 셋을 같이 ·
  홈 마지막 기록 날을 조회 하나로 · 홈 달력은 몸무게 안 읽음(`loadPitchHistory(…, { weights: false })`). 남은 것: `buildProgramDay` 가 오늘 세션을 또 읽음 ·
  `training-home.tsx` 의 `loadTodayCore` 는 캐시 안 씀 · 투구 탭 '오늘' 카드를 Suspense 로(VideosClient props 를 바꿔야 해서 둠).

## 금윤호에게 — 2026-10-15 · 김민(Claude, 맥북) — 네 탭 쓸기(tab-swipe.tsx) · 위 막대 흐림을 고쳤다

받은 뒤 할 일 없음. 김민: "스와이프로 화면을 넘기는데 버그가 심하고 전체적으로 버벅인다". 자세한 건 커밋 5f2b5dc7.
- `components/tab-swipe.tsx`: 손가락을 스스로 받는 부품(touch-action 을 따로 둔 것 — 홈 그래프 훑기 · 밀어서 지우기 · 3D 돌리기 · 영상 편집) ·
  창/시트 안 · 당겨서 새로고침 중에는 안 받음, 비스듬한 스크롤은 쓸기 아님(옆이 세로의 1.4배) · 잡은 자리부터 따라옴, 8초 안 오면 제자리로.
  네 2판(776d17e8)과 합칠 때 구조(바로 push · 화면 전환이 이어 밂 · WAIT_MS)는 네 것 그대로 두고 위 것만 얹었다.
  **새로 가로로 끄는 부품은 touch-action 만 주면 저절로 빠진다.**
- `MobileTopBar` · 시계 자리 흐림 blur-xl → blur-md, 바탕 75 → 85%(굴릴 때 장면마다 다시 셈하는 몫). 하단 탭도 28 → 20px.

## 금윤호에게 — 2026-10-15 · 김민(Claude, 맥북) — `DualCameraPlugin.swift` 빌드 깨짐 세 줄 고침(2.4.2 커밋의 `$0` · `$1` 이 `-e` 로 들어감)

받은 뒤 할 일 없음. 네 10-13 커밋(ce99a9a8, `pick(prefer:)`)에서 클로저의 `$0` · `$1` 이 `-e` 로 바뀌어 있어(`area(-e)` · `-e.3 < .3`) 맥에서
앱 빌드가 `'.3' is not a valid floating point literal` 로 실패했다 — 세 줄만 원래 뜻으로 되살렸다(`area($0)` · `$0.3 >= …` · `$0.3 < $1.3`).
TestFlight 굽기도 이 줄 때문에 실패했을 것이다. 셸에서 `$0` 이 지워진 듯하니 Swift 를 heredoc 으로 넣을 때 조심.


## 금윤호에게 — 2026-10-14 밤 · 김민(Claude, 클라우드) — 휴대폰 하단 탭을 iOS 26 탭 막대처럼(어두운 유리 · 움직이는 유리 렌즈)

받은 뒤 할 일 없음(DB · 패키지 그대로 — 새 패키지 없이 스프링을 직접 짰다). **네 영역(앱 틀 `components/app-shell.tsx` MobileTabs)을 고쳤다.** 사용자가 iOS 26 탭 막대
화면 녹화를 주며 "최대한 같은 스타일 · 애니메이션으로".
- 휴대폰 알약: 어두운 유리(짙은 회색 72% + 뒤 흐림 · 얇은 흰 테두리 · 위 1px 빛), 흰 아이콘 · 흰 이름(하늘색 켜짐 뺌 — 지금 탭은 굵은 이름 + `aria-current`).
  **패드 왼쪽 막대는 밝은 모양 그대로**(`pad:` 로 되돌림), 움직임만 같다. 크기(칸 52px · 알약 62px · `--tab-bar-top`)는 그대로.
- 선택 표시는 탭마다의 배경 + 화면 전환(`tab-indicator`)이 아니라 **렌즈 하나**(`[data-tab-lens]`). 움직임은 새 `components/tab-lens.ts`(`useTabLens` — 자리 · 부풂 · 보임
  세 스프링, CSS 변수만 장면마다 씀, 멈추면 rAF 도 멈춤). 누르는 순간 옮기고(`chosen`, 주소가 바뀌면 지움 · 8초 안 오면 지금 화면으로), 옮기는 동안 유리 렌즈로
  부풀었다 가라앉는다. 길게 눌러 끌기는 렌즈가 손가락을 따라온다(`DragThumb` 지움). 더보기가 열리면 렌즈가 더보기에.
- 렌즈 자리는 CSS 만(`--p` × 칸 폭, 칸 폭이 같아서) — 서버 HTML 부터 맞는 자리. **`--n` 은 count-up 이 `@property`(inherits: false)로 잡고 있어 못 쓴다** — 칸 수는 `--tab-count`.
  `globals.css` 의 `::view-transition-group(tab-indicator)` 규칙은 지웠다(이름표가 없어짐).
- 확인(가짜 탭 임시 경로 · 헤드리스 크롬 390 · 320 · 아이패드 820): 첫 그림 자리 = 칸, 홈 → 트레이닝 0.7초에 닿고 6% 넘침, 80ms 간격 세 번 연속 누름 순간이동 없음 · 끝 칸 = 주소,
  끌기 · 더보기 · 스크롤(막대 그대로) · 움직임 줄이기(바로 옮김). **실제 아이폰 앱(WKWebView)에서는 못 봤다** — 렌즈 부풂 · 막대 뒤 흐림 깜빡임이 없는지 봐 줘.
- 합치면서 **네 `components/tab-swipe.tsx` 에 한 줄**: 본문 쓸기로 넘어가는 순간 `TAB_CHOSEN_EVENT`(tab-lens.ts)를 보내고 MobileTabs 가 누른 탭처럼 받는다 —
  렌즈가 화면을 기다리지 않고 본문과 같이 옆 칸으로 간다(시험: 손 뗀 순간 움직이고 주소는 0.3~0.7초 뒤, 덜 쓸면 안 움직임).

## 김민에게 — 2026-10-14 밤 · 금윤호(Claude) — 휴대폰 틀 셋: 위 막대가 인스타처럼(숨기기 · 반투명 · 로고 가운데) · 탭 쓸기 · 더보기 폴더 테마색 — 네 app-shell 을 만졌다

받은 뒤 할 일 없음(DB · 패키지 그대로). 사용자(인스타 영상으로): "로고 가운데, 아래로 굴리면 위가 사라지며 노치까지 본문, 올리면 반투명으로 다시,
탭은 터치한 만큼 따라오다 넘어가게, 메뉴 아이콘 배경은 테마에 맞게". 모두 휴대폰만 — PC 막대 · 도크 · 팝업은 안 건드렸다.
- **위 막대**(`MobileTopBar`): sticky → fixed 반투명 유리(bg-page/75 + backdrop-blur). `useBarHidden` — 아래로 굴리면 `data-hidden` 으로 위로
  미끄러져 숨고(본문이 시계 자리 밑으로 흐리게 비친다 — `data-safe-area` 도 같은 유리), 위로 굴리면 돌아온다. '‹ 뒤로' 화면 · 알림 창 열림은 안 숨김.
  홈은 로고가 가운데. **뒤 흐림을 다시 켰다** — 네가 MobileTopBar 에서 뺐던 그 깜빡임(흐린 면 위로 무언가 움직일 때)이 앱에서 다시 보이면
  `backdrop-blur-xl` 둘(막대 · 시계 자리)을 빼면 된다.
- **탭 쓸기**(`components/tab-swipe.tsx`, 새): 첫 화면 넷(홈 → 투구 → 트레이닝 → 영양)에서 본문(main)을 옆으로 끌면 손가락을 따라오고, 옆에서
  다음 탭의 자리표시(바탕 판 + 아이콘 · 이름 + 뼈대 줄)가 같이 들어온다. 놓으면 폭 1/4 또는 빠르면 끝까지 밀린 뒤 `router.push`, 새 화면이
  그려지면 자리표시가 옅어지며 걷힌다. 탭마다 다른 화면이라 인스타처럼 옆 화면을 미리 띄우진 못했다(사용자가 고른 방식). layout 의 main 에
  `touch-pan-y`. 안 받는 곳: 가로 스크롤 칸 · `data-no-swipe`(홈 요약 칸) · 입력칸 · 왼쪽 끝 16px. **네 부품 가운데 가로로 끄는 것이 더 있으면
  `data-no-swipe` 를 달아 줘**(3D 인형 돌리기 · 구속 측정 화면은 app/(session) 이라 밖).
- **더보기 폴더 테마색**(`globals.css` 의 `--folder-fg` · `--tile-*`, `app-icon.tsx` clear 가 읽음): 화이트는 더 흰 반투명 폴더 + 옅은 하늘색 타일 +
  짙은 하늘 글리프, 네이비는 네이비 반투명, 다크는 그대로.
- 폰에서 봐 주면 좋은 것: 홈을 굴릴 때 막대가 부드럽게 숨고 돌아오는지(깜빡임 없이), 홈에서 옆으로 끌어 투구로 넘어가는지, 홈 요약 칸을 옆으로
  쓸 때 탭이 안 넘어가는지.
## 금윤호에게 — 2026-10-14 밤 · 김민(Claude, 데스크톱) — '3D 동작 분석'으로 이름 바꾸고 일반 사용자에게 엶 · 투구 탭 머리 배치

받은 뒤 할 일 없음(DB 구조 · 패키지 그대로). **네 영역(투구 탭 · 실험실 화면 · 메뉴 · 저장소 · 처리방침)을 고쳤다.**
- 이름: '투구 분석'(실험실) → **'3D 동작 분석'**('투구 분석'은 기록 분석 /coach 제목과 겹쳤다). 메뉴 · 목록 · 결과 화면 · 촬영 안내 한 줄. 카드의 '샘플 N' 은 '투구 N'.
- 투구 탭 머리(`videos-client.tsx`): 제목 옆은 '분석' 하나, 고르개 밑에 [구속 측정 | 3D 동작 분석] 반반(PC 는 고르개 줄 오른쪽 글 단추). 휴대폰 '⋯' 시트를 걷었다 —
  2분할 비교는 목록 보기 안 단추(video-gallery.tsx 에 원래 있음)로. `canAnalyze` prop 없앰.
- 일반 사용자에게: 메뉴 adminOnly 뺌, 두 페이지 · 서버 동작 · 올리기 주소가 `requireUser`. 사람마다 자기 폴더만(`lib/pitch-lab.ts` `LabViewer` · `ownerIds`) —
  관리자는 예전처럼 관리자끼리(마커 샘플 포함), 일반 사용자의 영상은 관리자도 안 본다. 일반 사용자가 보낸 `kind: 'marker'` 는 sample 로.
- 탈퇴: `lib/storage.ts deleteUserFiles` 가 한 층만 지워 `{id}/pitch-lab/…` 영상이 남았다 → 하위 폴더 3층까지 지운다.
- 처리방침: 맡기는 곳에 Modal Labs, Inc.(영상에서 관절 찾기) · 바뀐 날 10-14 · 변경 기록 한 줄.
- 확인: 임시 경로로 투구 머리(375 · 1536×700 · 1920×960), /privacy. 3D 화면 자체는 로그인이 필요해 못 봤다 — 일반 계정으로 올리기 · 분석 한 번 봐 주면 좋다.

## 금윤호에게 — 2026-10-14 밤 · 김민(Claude, 데스크톱) — 투구 분석 GPU 비용 지키기(올리기 전 검사 · 같은 영상 · 하루 실패 10번 · 일찍 멈추기)

받은 뒤 할 일 없음(DB 구조 · 패키지 그대로). **네 영역(실험실 화면 · v2 약속 · GPU 파이프라인)을 고쳤다.** 사용자: "이상한 영상으로 계속 실패해 그래픽 비용이
많이 나가는 게 걱정" → 셋 + 일찍 멈추기. 규칙은 `lib/pitch-lab-guard.ts`(순수, 시험은 `pitch3d:v2-test` 'GPU 비용 지키기' 17개).
- 올리기 전(`lab-client.tsx` pick): 폰이 파일 머리만 읽어 화면 녹화(이름) · 30fps 급 · 짧은 변 720 밑 · 줌/광각(35mm 환산 20~32 밖) · 2초 밑이면 고른 것을
  되돌리고 까닭 한 줄. 지문(크기 + 앞뒤 1MB SHA-256)을 `meta.files[v].fp` 에(옛 샘플은 없다). 못 읽은 칸으로는 안 막는다.
- 분석 걸기(`requestPitch3dV2`): 같은 엔진 판에서 영상 탓(V2_VIDEO_FAULT)으로 실패한 샘플 · 지문은 GPU 를 안 부르고 막음(엔진 판이 바뀌면 다시 됨),
  하루(한국 날짜) 실패 10번이면 막음 — GPU 를 못 부른 실패(gpu · gpu-auth)는 안 셈. 기록은 `{관리자}/pitch-lab/_guard.json`(폴더가 아닌 파일이라 샘플 목록에 안 섞임),
  세는 곳은 `checkPitch3dV2` 가 실패로 바뀔 때(`countFail`).
- 새 실패 코드 `framing`(영상 탓): GPU 가 거친 2D 에서 투수 높이 중앙값 200px 밑이거나 보인 장면 30% 밑이면 고운 2D · 맞추기 전에 멈춘다(`pipeline.py`
  `framing_bad`, selfcheck 5개). **Modal 에 아직 안 올렸다** — 사용자가 "배포해줘" 하면 `modal deploy`. 안 올려도 웹 쪽은 그대로 돈다(코드가 안 올 뿐).
- 브라우저로 올리기 화면은 못 눌러 봤다(관리자 로그인 필요) — tsc · eslint · 시험만. 화면 녹화 · 1배 아닌 영상을 골라 막히는지 한 번 봐 주면 좋다.

## 금윤호에게 — 2026-10-14 · 김민(Claude) — 촬영 계획을 한 회 3시간쯤으로 다시 짬(실내 2~5주 · 야외 6~7주)

받은 뒤 할 일 없음. 사용자: "한 세션에 60개 정도로" → "3시간 정도로 맞춰서 다시". 찍은 1주차(43개 · 체크 43)는 그대로.
- 실내 284개를 4회로: 2주 67 · 3주 73 · 4주 72 · 5주 72(끝 2:49~2:56, 하체 부하 27.5~30.5). `npm run shoot:plan -- --from=2 --planned --sessions=4 --pace=1.07`
  + `LW=3 SP=1.6`(하체 무게 · 자리 벌점 — 견준 12가지 중 3시간에 가장 맞고 하체가 고름). 새 인자: `--planned`(지금 계획에 든 운동만 — 지운 · 뺀 것이
  DB 에 남아도 안 되살림), `--sessions=N`.
- 야외 83개를 2회로: 6주 41 · 7주 42(예전 8~10주, 각 2:10쯤 — 드릴이 모자라 3시간을 못 채움). `npm run shoot:outdoor -- --sessions=2`,
  이 도구가 '나중에 촬영' 드릴을 읽던 것도 막았다.
- **2주차부터 번호가 다 바뀌었다**(체크는 운동 id 로 붙어 그대로). shoot:test 72 통과 — 끝 시각 기준을 '2:50 안' → '3시간 안'(사용자), 실내 5주 · 야외 6 · 7주.
  아티팩트 '운동 영상 촬영 계획'은 옛 번호다.

## 금윤호에게 — 2026-10-14 · 김민(Claude, 클라우드) — 투구 드릴 37개를 '나중에 촬영'으로 · 야외 촬영 계획에서 뺌

받은 뒤 할 일 없음(DB 구조 · 패키지 그대로). 사용자: 드릴 37개를 "운동영상 및 트레이닝에서 모두 나중에 촬영으로 보내고 운동영상 촬영일정에서도 제거".
**같이 쓰는 드릴 라이브러리 분류를 바꾼다**(AGENTS 3번 — 알림). 운동 63개 때와 같은 방식이다.
- 드릴 분류에도 `나중에 촬영`(`lib/categories.ts` MECHANICS_CATEGORIES 끝). 드릴 영상 화면에는 그 칸으로 보이고(비면 안 보임), 트레이닝(메커니즘 프로그램 ·
  요소별 드릴 · 3D 결과 화면 드릴)은 새 `trainingGuides()`(`lib/library-cache.ts`)로 그 칸을 뺀다. 드릴 기록 저장 · 설명 펼치기는 그대로 `visibleGuides()`. 캐시 `library:guides:v11`.
- 원래 분류 `lib/shoot/later-drills.json`(스로잉 16 · 메디신볼 14 · 무브먼트 7). **운영 DB 에 적용함**(데스크톱, 백업 `db-2026-10-14-14-06.json`,
  `scripts/drills-later-2026-10-14.mjs --apply` — 37개). v10 은 적용 전 내용이 담겼을 수 있어 v11 로 올렸다. 되돌리기는 `--restore 이름…`.
- 촬영 계획: 야외 8~10주에서 37개를 빼고 남은 83개로 야외 3주를 다시 짰다(`buildOutdoorWeeks`, 주마다 약 1:35 — **8~10주 번호가 바뀜**, 체크는 id 로 붙어 그대로). 실내 1~7주는 그대로.
  shoot:test 70 통과 · 2 실패(예전부터 — 실내 하체 · 같은 부위 연속).

## 김민에게 — 2026-10-14 · 금윤호(Claude) — 휴대폰 더보기를 아이폰 앱 폴더처럼(클리어 아이콘 · 반투명 폴더 · 뒤 흐림) — 네 app-icon.tsx 를 만졌다

받은 뒤 할 일 없음(DB · 패키지 그대로). 사용자(영상 둘로): "아이폰 앱 폴더 느낌, 애플 폴더보다 상하로 길게, 폴더는 반투명 · 뒤는 비치게, 앱 색은 빼고
로고만 흰색". iOS 26 '클리어' 모드다. **네 10-13 유리 아이콘(색 그라데이션)은 지우지 않았다** — `AppIcon look="tint"` 로 그대로 있고, 더보기만 `look="clear"` 를 쓴다.
쓸 데 없으면 tint 가지를 지워도 된다.
- `components/app-icon.tsx`: `look: 'tint' | 'clear'`, `active`. clear = 흰 14%(지금 화면 28%) 판 + 뒤 흐림 + 위 1px 빛 + 흰 테두리 + 흰 글리프.
- `components/app-shell.tsx` DetailMenu 휴대폰 가지: 아래 시트 → dialog 가 화면 전체 흐린 막(`data-scrim`, 누르면 닫힘) + 가운데 유리 폴더(`data-folder`) + 위 흰 '메뉴'.
  손잡이 · X 는 없다 — 막 누르기 · Esc · **화면 어디서든 누른 채 아래로 끌면 폴더가 따라 내려오다 아래로 미끄러져 닫힌다**(dialog 의 startDrag, `data-dismiss=down`).
  3열, 타일 크기는 화면 높이가 정한다(`--tile` 44~58px — 관리자 14개도 굴리지 않고 한 장, SE 667px 까지). 홈 타일은 휴대폰에 없고(하단 탭에 있다) '설정' 타일이
  들어왔다(`onSettings`). **휴대폰 위 막대 오른쪽은 종만** — 톱니 · 내 정보 단추를 뺐다(MobileTopBar 의 그 props 도). **PC 팝업(desk:)은 안 건드렸다.**
- `app/globals.css` 휴대폰 `dialog[data-drawer]`: 막(검정 50% + blur 18px) · `[data-folder]`(흰 16% · 어두운 테마 14% · blur 28px · 36px) · 하단 탭 쪽에서 0.55 → 1 로
  부풀어 뜸(320ms) · 줄이기면 옅어지기만. ::backdrop 에 blur 를 안 건 이유: 아이폰 WebKit 에서 판별 불가 → dialog 자신이 막.
- **아이폰 앱에서 봐 주면 좋은 것**: 더보기를 열 때 뒤가 흐려지는지(WKWebView backdrop-filter — 네가 MobileTopBar 에서 겪은 깜빡임이 여기도 나는지. 막은
  정적이라 괜찮을 거라 봤다), 하단 탭 자리에서 부풀어 뜨는지, 막을 누르면 닫히는지, 14개(관리자)일 때 폴더가 한 장에 들어가는지(375×812 에선 629/700px).

## 금윤호에게 — 2026-10-14 · 김민(Claude, 클라우드) — 분석 화면을 투구 분석 · 트레이닝 분석 둘로 가르고 줄였다

받은 뒤 할 일 없음(DB · 패키지 그대로). 사용자: "투구 · 트레이닝 분석, 그래프가 너무 조잡 · 중요한 것만 · 투구에서 누르면 투구만, 트레이닝에서 누르면 트레이닝만".
- `/coach?view=pitch` = '투구 분석'(‹ 투구 기록), `?view=training` = '트레이닝 분석'(‹ 트레이닝). 투구 · 트레이닝 고르개를 걷었다(`analysis-block.tsx`).
- 투구: 하이라이트 · 부하 지수 · 이번 주 · 마지막 투구 · 최고 구속 · 잘 던진 날 + 그래프 둘(투구수 · 최고 구속). 뺀 것: 28일 추이(`trend-chart.tsx`) · 기간별 기록
  (`report-client.tsx` — 투구량 · 강도 · 코멘트 · 메모) · 지표 설명 · 생년월일 안내.
- 트레이닝: 하이라이트 · 운동 부하 지수 · '최근 4주' 한 장(운동한 날 · 암케어 한 날 + 주별 막대) + 그래프 하나(운동). '투구와 운동' 격자(`training-day-grid.tsx`) 뺌.
- 부하 지수 카드는 큰 숫자 · 상태 · 한 줄 뜻 · 2주 흐름만(게이지 · 조언 · '어떻게 나온 숫자' 접이 뺌 — `parts.tsx` 의 ZoneGauge · LoadIndexHelp · MetricHelp 지움).
  그래프(`home-trends.tsx`)에 `metrics` 인자(안 주면 여섯 장 다).
- 화면은 클라우드라 못 봤다(.env 없음). 폰에서 두 분석 화면을 한 번 봐 줘.

## 금윤호에게 — 2026-10-14 · 김민(Claude, 클라우드) — '오늘 N~M구 던지세요'를 없애고 '지금 팔 상태 위험 · 주의 · 안전'으로

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역(투구 기록 탭 · 그날 화면 · 홈 첫날 카드)을 고쳤다.** 사용자: "몇 구를 던져라 이런 식이 아니라
지금이 위험한 상태인지 안전한 상태인지 알려 줘".
- 새 순수 함수 `lib/report/arm-status.ts armStatusOf(facts)` — 통증 · 재활 · 큰 등판의 여파(휴식표, `pendingOuting`) · 성장기 하루 한도를 넘김 ·
  3일 넘는 연투 · 부하 지수로 신호를 모아 가장 센 것 하나를 머리로(위험 > 주의 > 안전). 오늘 던진 기록까지 넣은 facts 를 받는다(excludeToday 안 씀) —
  던지고 남기면 곧바로 바뀐다. 화면 부품 `components/arm-status-note.tsx`. 시험 `npm run arm-status:test`(19).
- 바뀐 화면: 투구 기록 '오늘' 카드(`videos/page.tsx` · `today-card.tsx`), 그날 화면(`pitch-log/[date]/load.ts` · `day-client.tsx` — '오늘 계획' 칸과
  '계획보다 N구 많아요' 줄을 걷음, `components/plan-note.tsx` 지움), 홈 첫날 카드(`first-day-card.tsx` props `range · intensity · note` → `status`),
  투구 첫 설정 · 소개 화면 글.
- **투구 계획 계산(`buildPitchPlan`)은 그대로다** — 매일 운동 · 암케어 · 오늘 상태 한 장이 '오늘 공을 쉬는 날인가'를 거기서 읽는다. 화면만 숫자를 안 보인다.
- `training:test` 의 '뒤집기 (화면) 홈 계획 줄' 시험을 '화면은 권하는 투구수 대신 armStatusOf 를 보인다'로 바꿨다(지운 plan-note.tsx 를 읽던 것).
  클라우드엔 `.env` 가 없어 training:test · 화면은 못 돌려 봤다 — 폰에서 투구 기록 탭 '오늘' 카드 한 번 봐 줘.

## 금윤호에게 — 2026-10-14 · 김민(Claude) — 운동 63개를 새 분류 '나중에 촬영'으로 · 촬영 계획에서 뺌(운영 DB)

받은 뒤 할 일 없음. 사용자: "전부 다 나중에 촬영할거야. 운동 카테고리에서 새로 만들어서 … 촬영일정에서는 전부 삭제 · 어느 카테고리였는지 기억하게".
사용자가 고름: 촬영 전까지 추천에서 뺀다. 백업 `db-2026-10-14-13-07.json`, 스크립트 `scripts/library-later-2026-10-14.mjs`.
- `lib/categories.ts` 에 `나중에 촬영`(LATER_CATEGORY) — 어느 테마에도 없어 일정에 안 뽑히고, `visibleExercises`(새 일정 · 암케어 · 재활 · 루틴)에서도 뺀다.
  운동 영상 화면(allExercises)에는 그 칸으로 보인다. **원래 분류는 `lib/shoot/later.json`**(하체 10 · 상체 7 · 모빌리티 6 · 파워 7 · 코어 4 · 암케어 22 ·
  회복 및 보강 7). 찍으면 `--restore 이름…` 으로 되돌린다.
- 촬영 계획에서 60개 뺌(셋은 원래 숨김이라 계획에 없었음), 실내 387 → 327. 풀업 · 친업 설명에 '맨몸으로 안 되면 어시스트 머신이나 밴드 보조' 한 줄. 캐시 v28.
- **시험이 드러낸 것(기준은 안 고쳤다)**: shoot:test 2(계획 균형 — 5주차 무거운 하체 8 > 7 · 같은 부위 4개 연속), training:test 새로 5(실제 운동 표를 읽음 —
  암케어 근육 '대원근' 운동 0 · '매우 낮음' 회복 보강 1/6 · 4일 이상 뒤 하체 날 무거운 하체 0 · P5 점수 표본). 사용자에게 알리고 다시 짤지 묻는 중.

## 금윤호에게 — 2026-10-14 · 김민(Claude) — 운동 7개 분류 · 도구 바꿈 · 토 워크 둘을 촬영 계획에서 뺌(운영 DB)

받은 뒤 할 일 없음. 사용자 지시, 백업 `db-2026-10-14-13-01.json`, 스크립트 `scripts/library-edit-2026-10-14.mjs`.
- 분류: 프론트 레이즈 드롭 캐치 → 암케어 · 스피드 밴드 로우 → 파워 · 트랜스버스 런지 → 하체 스트렝스(계열 런지) · 덤벨 해머 컬 → 상체 스트렝스(계열 고립,
  재활 표는 이름으로 찾아 그대로 돈다).
- 덤벨 → 케이블(이름 · 도구 · 설명): 케이블 울나 디비에이션 · 케이블 래디얼 디비에이션 · 케이블 전완 프로네이션·수피네이션. 유튜브 참고 영상은 아직 덤벨 영상.
- 촬영 계획: 리버스 토 워크(2-02) · 토 워크(2-07)를 뺐다(라이브러리에는 남김), 실내 389 → 387. 5주차 '덤벨 · 케틀벨' 자리를 덤벨 다섯 → 케이블 셋
  차례로 다시 놓았다(5-19~5-26 번호가 바뀜 — 같은 준비물은 한 번에 시험). 캐시 `library:exercises:v27`.

## 금윤호에게 — 2026-10-14 · 김민(Claude) — 운동 14개를 라이브러리 · 촬영 계획에서 지웠다(운영 DB)

받은 뒤 할 일 없음. 사용자: "트레이닝 파트에서 이것들 전부 삭제해줘. 운동영상과 촬영목록에서도". **같이 쓰는 운동 라이브러리를 지웠다**(AGENTS 3번 — 알림).
- 지운 것(모두 참고 영상뿐 · 기록 · 즐겨찾기 · 루틴 · 세트 · 촬영 체크 0, 백업 `db-2026-10-14-12-55.json`): 싱글렉 덤벨 데드스톱 RDL (반대손) ·
  슬랜트보드 발목 모빌리티 · 하프닐링 밴드 발목 디스트랙션 · 원판 고블렛 스쿼트 프라잉 · 수파인 밴드 힙 디스트랙션 · 90/90 페일즈·레일즈 ·
  쿼드 힙 플렉서 스트레치 · 워터백 레터럴 홉 + 사이드 벤드 · 워터백 레터럴 홉 스틱 랜딩 · 사이드라잉 내회전 · 덤벨 컬 에센트릭 오버로드 ·
  튜빙 리스트 익스텐션 / 전완 프로네이션 / 전완 수피네이션 (두꺼운 그립). 스크립트 `scripts/library-delete-2026-10-14.mjs`.
- 촬영 계획 `lib/shoot/plan-data.json` · `refs.json` 에서 뺐다(다시 뽑지 않고 그 줄만 — 다른 번호는 그대로라 2-28 · 3-40 · 4-05 … 자리가 빈다).
  실내 403 → 389개(shoot:test 고침). `lib/armcare/rehab-regions.ts` 의 이름 둘(사이드라잉 내회전 · 덤벨 컬 에센트릭 오버로드) 뺌, 캐시 `library:exercises:v26`.
- 참고: `npm run training:test` 2개 실패는 이 일과 무관 — 오늘 네 홈 · 투구 기록 화면 글 변경(889d011b 근처)을 '뒤집기 (화면)' · '검토 (홈) 계획 줄' 시험이 본다.

## 김민에게 — 2026-10-14 · 금윤호(Claude) — 아이콘 체계: 아이콘은 `components/icon.tsx` 하나에서 받는다(굵기 2.5) · 색 원 부품 · 네 영역(앱 틀 · 더보기)을 만졌다

받은 뒤 할 일 없음(DB · 패키지 그대로). 제안서 `docs/designs/icon-system.md` 의 1~4단계를 했다('한 것' 절). **네가 답하기 전에 `app-icon.tsx` ·
`NAV_TINT` 는 그대로 두고 가져다만 썼다** — 더보기의 유리 아이콘은 안 바뀜.
- **규칙**: 화면 코드는 `lucide-react` 를 직접 부르지 않고 `@/components/icon` 에서 같은 이름으로 받는다(150종, eslint `no-restricted-imports` 가
  막는다 — 없는 아이콘은 그 파일에 한 줄 더하면 된다). 굵기는 거기 하나(2.5). 켜짐 · 꺼짐은 굵기가 아니라 색으로. 새 부품 `components/icon-circle.tsx`
  (`IconCircle` 44 · 56px 색 원 + 흰 글리프, `CircleButton`) — 목록 줄의 동작 단추용.
- **네 영역 파일**: `components/app-shell.tsx`(import 바꿈 · `NavGlyph` 의 `strokeWidth` 인자 뺌 · 흩어진 굵기 7곳 걷음 — 연출 · 끌기는 안 건드림),
  `components/nav-icons.tsx`(import 만 `@/components/icon` 으로), 홈 `app/(app)/today/*` · 영양 · 트레이닝 등 143개 파일은 import 한 줄과 아이콘 태그의
  `strokeWidth` 만(스크립트로 — 생 svg 의 strokeWidth 는 그대로). 내 정보의 계정 단추 셋(`profile/account-actions.tsx`)은 아이폰 설정 목록처럼 색 원 + ›.
  투구 기록 그날 줄 연필 · 휴지통, 구속 측정 공 줄 ▶, 내 루틴 ▶ · 연필은 휴대폰에서 44px 색 원(PC 는 예전 작은 아이콘).
- **구속 측정은 안 옮겼다**(`components/velocity/*` · `app/(session)/velocity/*` · `app/(app)/admin/velocity/*`, 27개 파일 — 네가 2.5.1 작업 중이라).
  eslint 규칙이 그 셋을 건너뛴다. 옮길 때는 `from 'lucide-react'` → `from '@/components/icon'` 한 줄 + 아이콘 태그의 `strokeWidth` 삭제뿐이고, 끝나면
  `eslint.config.mjs` 의 ignores 셋을 지워 줘.
- 폰에서 봐 주면 좋은 것: 하단 탭 · 상단 종 · 설정의 선이 조금 굵어졌는지(2.5), 내 정보 계정 줄 셋, 투구 기록 그날 줄의 연필 · 휴지통 원.
  2단계(아이폰 앱만 SF Symbols SVG)는 사용자가 맥에서 SVG 를 내보내야 해서 아직.

## 금윤호에게 — 2026-10-14 · 김민(Claude) — 구속 측정: 손에 든 폰도 잰다(흔들림 빼고 알아채기 · 엔진 2.5.1)

받은 뒤 할 일 없음. **네 영역(구속 측정)을 고쳤다.** 사용자: 월요일(10-12) 낮 손으로 들고 재니 아무것도 안 잡혔다 → "흔들림 빼고 보기",
손으로 잰 공은 '보통'으로 기록 + 표시(사용자 결정).
- 원인: 앱 공 알아채기(`DualCameraPlugin.swift` MotionTrigger)가 세 장면 차이를 그대로 봐서, 손에 든 폰은 무늬 있는 곳이 모두 남아
  `MAX_MOVED`(공 길 동안 바뀐 칸 1.6%)에 진짜 공까지 버렸다 — 알림이 한 번도 안 나 엔진까지 못 갔다(10-12 밤 뒤 시도 기록 0).
- 고침: 장면마다 앞 장면에서 밀린 만큼(`shiftOf`, ±8칸 · 2칸 → 1칸 걸음, 0 과 2% 안이면 0)을 재 옮겨 견주고, 공 길은 첫 장면 기준 자리(`Point.x/y`,
  화면 자리는 `rx/ry`)로 잇는다. 삼각대는 밀림 0 이라 그대로. 돌림 · 앞뒤 움직임은 못 빼 `MAX_MOVED` 가 여전히 거른다.
  **Swift 는 컴파일 못 해 봤다**(윈도우) — 굽기 결과와 맥 시험대(`scripts/velocity-lab/ball-trigger`)로 19개 영상 알림이 그대로인지 봐 주면 좋다.
- 엔진 2.5.1: 흔들림을 바로잡은 공(shaky · stabilized)은 '낮음' 대신 '보통'까지(`analyze-distance.ts`), 측정 화면은 그 공을 기록하고
  '폰이 흔들려 바로잡아 잰 값' 알림(`velocity-screen.tsx` steadied). 못 바로잡은 흔들림은 그대로 측정 불가. 보정 짝은 '높음'만이라 빠진다.
  engine2-test 에 '바로잡은 흔들린 공은 보통' 한 줄.

## 금윤호에게 — 2026-10-14 · 김민(Claude, 맥북) — 근력 프로그램 보조: 보조 밀기 · 세로 당기기 칸 · 로우 순서

받은 뒤 할 일 없음(DB 그대로 — 고정 운동 Json 에 새 칸이 생기면 처음 볼 때 저절로 고른다). 김민: "모든 세션에 바벨 로우가 맞아? 보조로 밀기는 안 해?"
- `lib/program/program.ts`: 새 변형 둘 — `pullVertical`(세로 당기기: 친업 · 풀업 · 풀다운) · `pushAssist`(보조 밀기: 덤벨 벤치 · 푸시업, 머리 위로 미는 것 제외).
  당기기(`pull`) 순서를 가슴 대는 덤벨 로우 · 한 팔 덤벨 로우 · 케이블 로우 먼저, 바벨 로우 맨 뒤로(허리 부담).
- 5/3/1 · BBB · 저거넛(`waveDay`): 벤치 없는 날 보조 밀기 2×10, 당기기는 힌지 없는 날을 세어 로우 ↔ 세로 당기기(3×8) 번갈아, 힌지 날은 늘 로우,
  BBB 에도 한 다리 3×8. 철봉이 없으면 세로 당기기 날은 로우로(`load.ts` pinnedOf).
- 네 시험 `training-selftest` C5(팔 피로 '심함')의 프로그램 기대값을 'go' → 'go+대체:팔 피로' 로 — 531 첫날에 보조 밀기가 생겨 그 칸이 대체된다.
- (같은 날 더) 프로그램 보조 칸은 **세션마다 다른 운동**(`ROTATING_VARIANTS` · `rotatedPick` · `variantTurn`, `load.ts` pinnedOf 가 고정 운동을 첫째로 돌림 —
  다시 고정은 고정 운동만). 회전 던지기 칸이 오버헤드 · 푸시 슬램을 고르던 것을 고침(이름에 회전 동작이 든 메디신볼만, 없으면 케이블 · 랜드마인 로테이션) —
  네 시험 'P5 도우미 (다)' 에 회전 던지기를 코어로 채운 경우를 허용했다. 불펜 짧은 상체 날에 회전 던지기 2×3.
- (같은 날 더) **매일 일정 고르기 점수**(`lib/report/score.ts`, 네 영역): 'pattern' 항목에 밀기 · 당기기 균형 +1(`SCORE_POINTS.patternBalance`) —
  2주 동안 짝보다 덜 한 쪽을 앞으로(김민: 밀기 · 당기기 1 대 1, 머리 위로 미는 것은 그대로 둠). 이유 글 '2주 동안 당기기를 덜 해서 앞에 뒀어요.' 시험 표에 셋 더함.


## 금윤호에게 — 2026-10-14 · 김민(Claude, 맥북) — 화면 점검 뒤 디자인만 손봄(글자 크기 이름 · 누르는 자리 40px · 글 규칙 · 카드 여백)

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역 파일이 많이 바뀌었다(줄 단위 클래스만).** 김민: 탭 전체 점검 → "디자인적인 것만 수정".
- **글자 크기 이름**(`app/globals.css` @theme): `text-caption` 11px · `text-footnote` 13px · `text-subhead` 15px — `text-[11px]` · `[13px]` · `[15px]` 271곳을 이 이름으로
  바꿨다(크기는 그대로, 휴대폰 · PC 고정). **새 화면은 대괄호 대신 이 셋과 text-xs/sm/base 만 써 줘.** 10px 이하(탭 이름표 · 작은 배지)와 12 · 14 · 17 · 28px 몇 곳은 그대로.
- **누르는 자리 40px**(휴대폰, PC 는 간격 단위로 32px): 홈 요약 칸 ‹ › · 트레이닝 홈 '2주째' 줄 · 운동 진행의 교체 · 추가 · 되돌리기 · 메모 단추 · 교체 시트 · 암케어 따라하기 ·
  다시 만들기 · 부위 칩 · 체크인 통증 칩 · 질문 카드 '나중에' · 알약 · 그날 팝업 취소 · 캘린더 '자세히' · 영양 끼니 편집 · 담기 · 날짜 화살표 · 내 정보 사진 단추 ·
  분석 '자세히' 접이 · 기간 단추 · 메모 날짜 칩.
- **글**: 화면에 보이던 줄표(—)를 마침표 · 가운뎃점으로(구속 측정 화면 · 측정 팁 · 설정, 메커니즘, 잘 던진 날, 영양 첫 설정 · 목표 창, 데생 인형 이름표 풀이),
  문장 속 굵게 셋(운동 진행 둘 · 잘 던진 날), 트레이닝 홈 '회복 루틴를' → `withJosa`.
- **카드 여백 규격**: 부하 지수 카드(`load-panel.tsx` rounded-3xl · px-6 py-7 → rounded-2xl · `p-(--block-pad)`), 분석 숫자 칸 · 운동 완료 카드 · 메커니즘 세션 끝 카드.
- 트레이닝 질문 카드('오늘 하고 싶은 운동')도 `folded` — 영양 · 투구와 같게 접힌 알약으로 시작(일정 카드 안에서 카드가 겹쳐 보이던 것).
- 화면 구성을 빼거나 옮기는 것(분석 28일 추이 · 하이라이트, 홈 요약 칸 겹침, 설정 길, 체크인 표시)은 안 건드렸다 — 점검 보고는 김민에게.


## 김민에게 — 2026-10-14 · 금윤호(Claude) — 아이콘 체계 제안서(앱을 아이폰 느낌으로) — 읽고 답해 줘

받은 뒤 할 일 없음(DB · 패키지 그대로). 금윤호: "앱 아이콘이 AI 기본 아이콘 같다 — 아이폰 전화 앱 · 공유 시트 느낌으로, 크게 말고 퀄리티만".
- 문서: `docs/designs/icon-system.md` — 왜 지금은 부탁해도 안 바뀌나(lucide 179곳 · 96종을 직접 씀), 방향 셋(규칙 한 곳 → 원 · 틴트 넓히기 → 아이폰 앱만 SF Symbols SVG), 규칙 넷, 시간.
- 네 `app-icon.tsx` · `NAV_TINT` 를 앱 전체 규칙의 뿌리로 삼자는 제안이다 — 5절의 물음 둘에 답해 줘(뿌리로 써도 되나 · 1단계를 누가 하나).

## 금윤호에게 — 2026-10-14 · 김민(Claude, 맥북) — 투구 기록 · 영양 탭을 홈 · 트레이닝처럼 단순하게(휴대폰 위주)

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역(투구 기록 · 영양 · 질문 카드)을 고쳤다.** 김민: "투구기록, 영양 파트가 너무 조잡 — 홈이나 트레이닝처럼
단순하지만 핵심정보만". PC 는 거의 그대로, 휴대폰만 크게 바뀐다.
- **영양**(`nutrition-view.tsx`): '오늘 영양'(AdviceCard)과 '나의 하루'(SummaryCard)를 한 장 `TodayCard` 로 — 링 · 남은 kcal · 탄단지 막대 셋 · 할 일 한 줄
  (자세히/한눈에 고르개 · 비율 알약 · 더 먹을 g 칸 · 점수 조각은 뺐다, 균형 점수는 숫자만 남김). 끼니 칸은 휴대폰에서 한 줄('아침 456kcal · 단백질 18g ›')로
  접고 누르면 편다(`MealSection` open). 식단 짜기 카드(아직 안 짰을 때)도 휴대폰은 한 줄로 접힘(`plan-parts.tsx`). 휴대폰은 7일 띠를 숨김.
  통계는 체중 → 최근 7일 → 내 계획(한 줄 + '계산 내역 보기', `my-plan-card.tsx`), '운동으로 쓴 칼로리' 카드(BurnCard)는 지우고 오늘 영양 카드 한 줄로.
  처음 설정 안내 띠는 한 줄.
- **투구 기록**(`videos-client.tsx` · 새 `today-card.tsx` · `page.tsx`): 맨 위 '오늘' 카드 — 오늘 계획 한 줄(팝업과 같은 `gatherFactsAndPlan` ·
  `pitchRangeText`) · 던지는 일정 질문(접힌 알약) · [오늘 기록 남기기]. 제목 옆 [+] 와 고르개 밑 알약 줄(2분할 비교 · 구속 측정 · 투구 분석)을 걷고
  휴대폰은 제목 줄에 구속 측정 아이콘 · `…`(Modal 시트: 2분할 비교 · 투구 분석). 그날 칸(`video-calendar.tsx`)은 휴대폰에서 날짜 · 투구 수 · 최고 구속만,
  썸네일 · 대표 단추는 '영상 관리'를 눌러야 편다.
- **질문 카드**(`components/day-card.tsx`): 선택 칸 `folded` — 답이 없어도 접힌 알약('오늘 식욕 · 끼니는요? 답하기')으로 시작. 영양 · 투구 카드만 켰고
  트레이닝 카드는 그대로다. 접힌 알약의 앞말이 답이 없으면 질문 제목이다(예전엔 늘 '오늘 설정').
- 화면은 김민 계정 자료를 읽기만 하는 임시 경로로 휴대폰 375 · PC 1536 확인(넘침 0). 아이폰 앱에서 한 번 봐 줘 — 특히 끼니 칸 펴기 · `…` 시트.

## 금윤호에게 — 2026-10-14 · 김민(Claude, 맥북) — 근력 프로그램에 '시즌 중 · 선발' · '시즌 중 · 불펜'

받은 뒤 할 일 없음(DB · 패키지 그대로 — 운동 판 JSON 의 program 에 선택 칸 `kind` 만). **네 영역(중재 · 오늘 상태 · 등판 짐작)을 조금 고쳤다**(a793c762).
김민: "시즌 중에도 선발 · 불펜 나눠서".
- `lib/program/program.ts`: 목표 '시즌 중'(`inSeason`), 프로그램 둘(선발 주 2번 · 불펜 주 3번, 크레시 원칙 — 매 세트 3개 남김 · 당기기는 로우 위주). 그날 세션 종류
  (`SessionKind` 하체 · 상체 · 전신 · 짧은 하체 · 짧은 상체)는 번호가 아니라 오늘 상태로 고른다(`inSeasonKind` — 선발은 마지막 경기 며칠 뒤, 불펜은 어제 · 그저께 20구 넘게).
  null = 움직임만 하는 날 → 판정 'rest' 'inSeasonMove'. 시즌 중은 어제 팔 부담(`gameYesterday`)으로 안 쉰다(등판 다음 날이 하체 날), 등판 날 · 전날은 그대로 쉰다.
- 종류는 `ProgramPlan.kind`(`withKind`)로 실어 나른다: `load.ts inSeasonKindOf` → `ProgramCommitmentInput.kind`(day-state) → `programDaySlotsOf(…, kind)`(arbiter) →
  운동 판 꼬리표 `SessionProgramTag.kind`(교체 `programSwapRx` · 축하 화면이 같은 날을 다시 짓게).
- `lib/engine/outing.ts` 에 `lastGameDateOf(facts)` 를 더했다(gameDates 를 직접 읽는 파일은 facts · outing 둘뿐이라는 시험 때문에).
- 시험 program 221 · training 1783(실패 2 는 예전부터 — 홈 계획 줄 등판 글). 화면은 로그인이 필요해 못 봤다: 트레이닝 프로그램 고르기의 '시즌 중' 칸 · 시즌 중 날 카드.

## 금윤호에게 — 2026-10-14 · 김민(Claude, 맥북) — 근력 · 파워 프로그램 이름표를 'N주차 · M일차' → 'N번 세션'으로

받은 뒤 할 일 없음(DB · 패키지 그대로). 김민: "몸 상태에 맞게 당겨 하거나 미뤄 4주 앞뒤로 맞추게 — 일차 말고 세션". 프로그램은 원래 달력이 아니라 차례로
나아가서(마친 세션만큼 `nextDay` +1, 막는 건 이틀 연달아뿐) **동작은 그대로, 글만 바꿨다.** 주차는 가벼운 주 · 처방 계산에만 남는다(`weekOfDay`).
- `lib/program/program.ts` `dayLabel` → '5번 세션 · A 날', `planSubtitle` → '세션 12번 · 주 3번이면 4주', `finishLine` → '…다음 세션으로 가요' · '5번 세션을 마쳐요',
  주의 `lightWeek` → '가볍게 하는 세션이에요…'. 네 영역도: `lib/engine/day-state.ts`('근력 프로그램 5번 세션을 할 차례예요') · `lib/engine/arbiter.ts`
  `programDayText`('…5번 세션 · A 날 차례라…') · `program-card.tsx` · `workout/done/page.tsx`(조사는 `withJosa` — '세션'은 받침이 있어 을/은).
- 시험: program 213 통과(옛 프로그램 견주기에서 이름표만 뺌) · training 은 고치기 전부터 실패하던 둘('뒤집기 (화면) 홈 계획 줄' · '검토 (홈) 계획 줄 — 등판 날 고정 글')만 남음 — 네 쪽 확인 부탁.
- 메커니즘 프로그램의 'N주차 N번째'는 그대로 뒀다(이번 요청은 근력 · 파워).
: 던지는 팔이 레이백 ~ 릴리스 뒤에 엔진 팔을 따른다 · 머리 다듬기

받은 뒤 할 일 없음(DB · 패키지 그대로, 분석 서버 묶음에 없는 파일이라 서버 그대로). **네 영역(화면 모델 `lib/pitch-3d/v2/kinematics.ts`)을 고쳤다.**
김민: "레이백부터 릴리스 직후까지 다 문제 · 부드럽게". 원본 영상에 AI 점 · 엔진 팔 · 인형 팔을 겹쳐 보니 엔진 팔은 영상에 붙어 있는데 인형 팔만 떨어져 있었다
(어깨 뒤 45° 한계에 걸려 엔진 손목을 버림 · 팔을 인형 몸통 기준 각도로 옮겨 붙여 몸통이 조금만 달라도 팔이 통째로 돎 · 다듬기가 꼭대기를 한 번 더 깎음).
- 던지는 팔: 착지 ~ 릴리스 + 0.8구간(`ARM_FOLLOW_POST`) 동안 엔진 팔 방향(어깨 → 팔꿈치 → 손목)을 살짝 다듬어(`ARM_FOLLOW_SMOOTH` 1.5) 인형 어깨에 붙인다.
  실험실 8샘플 인형 팔 ↔ 엔진 팔 차이 가운데 1.4~5.9 → 0.7~2.4°, 큰 장면 4~18 → 2~10°.
- 머리: 마지막에 귀 가운데의 어깨 기준 자리를 앞뒤 5장면으로 다듬음(`HEAD_POST_SMOOTH`) — 머리가 원 결과보다 더 떨던 곳 8 → 3.
- 해 보고 뺀 것: 인형 어깨가 엔진 어깨를 따르기(분리 75° 넘는 장면이 늚) · 손 모양도 엔진 따르기(손 방향 튐이 늚) · 넙다리 한계 넘는 장면 발목 당기기 풀기(효과 8 → 7).
- 떨림 기준 다시 저장(`scripts/pitch-lab/jitter/baseline.json`) — s3 착지 떨림 2.22 → 2.52%(인형 팔이 엔진을 따른 만큼, 원 결과보다 더 떨지는 않음). 시험 v2 268.
- 남은 것: c4d8 셋업 넙다리 빠르기 7장면(엔진이 셋업 중 다리를 잠깐 헷갈림) · f046 인형 가슴 · 글러브 손 방향 11장면 · 기아 샘플 팔로스루 끝 분리 75° 7장면 ·
  인형 어깨 자리(몸통 모델)가 엔진 어깨와 키의 1% 남짓 다름. 아이폰 앱에서 레이백 ~ 릴리스 팔을 한 번 봐 줘.

- (같은 날 더) **글러브 팔 · 던지는 어깨 · 머리**: 글러브 팔도 착지 앞(착지 → 릴리스 시간만큼)부터 릴리스까지 엔진 팔을 따른다(`GLOVE_FOLLOW_PRE` · `GLOVE_FOLLOW_POST`,
  공 놓은 뒤엔 몸에 가려 엔진이 흔들려 뺌 — 글러브 위팔 차 상위 10% f046 · c4d8 28~30 → 2°). 던지는 어깨 자리도 팔 따르기 구간에서 엔진 어깨 쪽으로
  (`SHOULDER_FOLLOW_CAP` 키의 3%, 어깨선 방향은 그대로 — 어깨 차 상위 10% 1~2.7 → 0.4~0.7%). 머리 마지막 다듬기는 어깨 기준이 아니라 세상 자리로
  (`HEAD_POST_SMOOTH` [3, 5] — 원 결과보다 더 떠는 머리 0.46 → 0.12%p).
- **겹쳐 보기 도구** `npm run pitch3d:overlay -- <샘플> [arm|glove|lead|back]`(scripts/pitch-lab/overlay/): 원본 두 영상 위 AI 점(빨강) · 엔진(파랑) · 인형(초록).
  인형은 장면마다 몸통 네 점으로 자리 · 방향을 맞춘다(마운드 기울기를 안 빼면 뻗은 팔이 처져 보임). 엔진 · 화면을 고칠 때 떨림 검사와 함께 써 줘.
- 떨림 검사의 '분리 75° 넘음'을 몸통 축 기준으로 잰다(`measure.mts`) — 위에서 본 각은 팔로스루에 골반이 옆으로 기울면 화면이 몸 전체를 몇 도 기울인 것만으로
  −70 → −78° 가 됐다(6814). 이제 8샘플 모두 화면 = 원 결과(s1 만 13 → 14), 남은 장면은 엔진 팔로스루 값. 기준 다시 저장. 시험 v2 그대로.
## 금윤호 · 김민(데스크톱)에게 — 2026-10-14 · 김민(Claude, 맥북) — 메커니즘 점검의 상하체 분리를 '몸통이 도는 때' · '착지 때 상체'로

받은 뒤 할 일 없음(DB · 패키지 그대로). **결과 화면(금윤호 영역) · 점검 계산(데스크톱이 만든 것)을 고쳤다.** 김민: "상하체 분리는 꼭 필요 · 대략적인 타이밍만" · "착지 때 상체가 열렸나 닫혔나도".
- 영상 두 개로 골반 각을 더 정확히 하려던 다섯 가지(SAM 3D · 두 영상 윤곽 맞추기 · 드라이브라인 학습 둘 · 융합)가 모두 엔진을 못 넘었다 — 표 · 까닭은
  `docs/designs/pitch-mechanics-checks.md` 4-3. 그래서 골반을 안 쓰고 어깨만으로 판정 둘을 더했다.
- `lib/pitch-3d/v2/mech-checks.ts`: `separation.trunkHalfPct`(어깨선이 돈 양의 절반을 지나는 때, 착지 → 공 놓기 %) · `trunkHalfFrame` · `trunkConf`.
- `lib/pitch-3d/v2/mech-judge.ts`: 새 판정 '몸통이 도는 때'(`trunkTiming`, 기준 `TRUNK_HALF_NORM`) · '착지 때 상체'(`trunkAtPlant`, `TRUNK_PLANT_NORM`). 옛 '상하체 분리'는
  계산은 두고 화면에서 내림(`shown: false`). 카드(`mech-card.tsx`)는 새 판정의 '그 순간 보기' 장면만 더함. 시험 v2 268.
- 마커 정답 스크립트에도 같은 식(`selfcal/mech_truth.py` trunkHalfPct · `mech-score.mts`). 15구 평균 앱 44% / 정답 44%, 착지 때 상체 앱 −6° / 정답 +8°(앱이 14° 닫힌 쪽).
- 확인할 것: 다리 들기 골반 정답(옷 위 스티커)이 틀렸을 수 있다 — 10-13 엔진의 다리 들기 골반 당김이 그 정답에 맞춰졌다(4-3 '덤'). 다음 마커 촬영은 단단한 골반 벨트 마커로.

- (같은 날 더) 앞다리 버티기: 앞무릎이 착지보다 40° 넘게 더 굽거나 골반 감속이 115% 넘는 공은 엔진 오류로 보고 판정에서 뺀다(`mech-judge.ts` BLOCK_IMPLAUSIBLE_*).
  실험실 240fps 두 샘플이 34~64° · 125~129% 였는데 겹쳐 보기에서 엔진 앞다리가 착지 뒤 AI 점보다 많이 굽어 있었다. 마커 15구 앱 판정은 그대로. 시험 v2 269.
  옷 점 추적(골반)도 해 봤지만 엔진을 못 넘었다(`docs/designs/pitch-mechanics-checks.md` 4-3 표) — 골반은 토요일(10-18) 벨트 마커 촬영 뒤에.
## 김민에게 — 2026-10-13 · 금윤호(Claude) — 체크인 3판(한 화면 흐름 · 신호 셋) 끝 — 받으면 `npx prisma generate`

받은 뒤 할 일: **`npx prisma generate`**(`DailyCheckin.sleepQuality` · `DailyTrainingSetup.preferredWorkout/preferredParts` ·
`DailyNutrition.appetite/mealAmount/skippedMeals/answeredAt` 가 생겼다). 마이그레이션 둘은 손으로 적었고(`prisma/migrations/20261013120000_checkin_sleep_quality` ·
`20261013130000_day_cards`) **공유 DB 에는 아직 안 걸었다** — 배포(`migrate deploy`)가 건다. 그 전까지 로컬 화면은 새 칸 때문에 안 뜬다.
- **무엇이 바뀌었나**: 체크인은 컨디션(1~10) · 어젯밤 수면의 질(1~5) · 불편한 곳(네 3D 몸 그림 `components/body-spot-picker.tsx` 그대로 — 흐름의 통증 화면) ·
  메모만 받는다. 휴대폰은 토스식 한 화면 한 질문 흐름(`app/(session)/checkin`, `components/checkin-flow/`), PC 는 관문 · 종의 팝업에 같은 흐름.
  옛 폼(`components/checkin-form.tsx`, 간편 · 상세)은 지웠다. 트레이닝 탭의 '체크인하기' · 그날 자세히의 '지금 체크인하기'는 신호(`OpenCheckinButton`)로 흐름을 연다.
- **탭 카드 셋**(`app/actions/day-cards.ts` · `components/day-card.tsx`): 운동 종류 · 부위 → 트레이닝 탭(`DailyTrainingSetup`), 식욕 · 끼니 → 영양 탭(`DailyNutrition`),
  던지는 일정 → 투구 기록 탭(`DailyCheckin.throwPlan` 그대로, `setThrowPlan` 으로만 씀). 하루 한 번 묻고 '나중에'는 그날 localStorage.
- **읽는 쪽은 `lib/checkin.ts` 의 신호 셋**(`signalsOf` · `sleepQualityOf` · `armFatigueFromPain`) — 잔 시간 · 근육통 · 팔 피로 칸은 3판부터 읽지도 쓰지도 않는다
  (열은 남김, 옛 기록은 어림). 영양의 '근육통 많음' 신호는 '짧은 밤'(`sleepShort`)으로 바뀌었다.
- **묻지 않게 된 것**: 어제 '오늘 등판'이라 적었는데 기록이 없을 때의 '어제 몇 구' 줄(옛 폼의 `asksYesterdayPitches`). 투구 기록 탭 카드로 옮길지 금윤호와 정한다.
- **아직 못 본 것**: 브라우저 확인(로컬 DB 에 새 칸이 없어 화면이 안 뜸). 배포 뒤 휴대폰 흐름 · PC 팝업을 한 번 봐 주면 좋겠다. 네 영역(3D 몸 그림 API)이 바뀌면 알려 줘.

## 금윤호에게 — 2026-10-13 밤 · 김민(Claude, 데스크톱) — 홈 요약 칸(feed-card.tsx) 고침: 자동 넘김 멈춤 · ‹ › 가 안 넘어가 보이던 것

받은 뒤 할 일 없음. **네 파일을 고쳤다**(`app/(app)/today/feed-card.tsx`). 김민: "3초마다 자동 전환, 지금 오류가 있고 ‹ › 를 눌러도 안 넘어간다".
- 넘어간 뒤 트랙을 제자리로 돌릴 때도 transition 이 걸려 다음 다음 장이 비쳤다 되돌아왔다 → `instant`(두 장면 동안 transition 끔, 그동안 go 막음).
- 아이폰은 누를 때 mouseenter 를 흉내 내고 mouseleave 를 안 보내 ‹ › 한 번에 paused 가 영영 true → `onPointerEnter/Leave` 를 `pointerType === 'mouse'` 일 때만.
- 임시 경로에서 확인: 3초마다 넘어감 · ‹ › · 제자리 돌릴 때 transition none.

## 김민(맥북)에게 — 2026-10-14 밤 · 김민(Claude, 데스크톱) — 내딛기 골반 단서 실험(안 넣음) · 공식 채점 윈도우 고침

받은 뒤 할 일 없음(엔진 그대로). 자세한 숫자는 selfcal/README.md 끝 두 절.
- **내딛기 골반 단서**(축발 수직을 니업 뒤에도 섞기): 2판 정답으로 내딛기 12.3 → 6.5° 지만 **착지 ±6장면은 그대로**(−8.9 → −9.5°), 합성 시험 2개 실패,
  1판 정답으로는 8.9 → 12.6° 로 나빠짐 → 안 넣었다. 패치는 `results-2026-10-12/stride-pull-2026-10-14.patch`.
- **1판 · 2판 정답이 내딛기에서 어긋난다**(K4 엉덩이선 치우침 +4.8 vs −10.3). 1판 fill 의 내딛기 스티커가 의심스럽다. 공식 채점은 아직 1판(`work/`) —
  2판으로 바꿀지 같이 정하자(바꾸면 `score-baseline.json` 다시 저장).
- `score-all.mjs` · `jitter/score.mjs`: 윈도우에서 `--import` 절대 경로가 안 먹어 엔진이 안 돌고 옛 결과를 채점하던 것을 `pathToFileURL` 로 고침(맥은 영향 없음).
- **착지 골반 −10° 의 원인(밤)**: 뒤 카메라의 RTMW 2D 엉덩이(착지 때 2~3cm 치우침 · SD 10~15px). 옆1+뒤2 교차 −14.5° 인데 뒤 2D 만 K4 비춤으로 바꾸면 −1.0°,
  옆을 바꾸면 그대로. 두 대로는 가려낼 셋째 시선이 없다 — 셋째 영상 없이는 엔진으로 못 고친다(README 끝 절 · `selfcal/hip_attrib.py`).
- **실험실 샘플 1 백스윙 뒤 팔꿈치 꺾임(밤)**: 가짜 접힘이다 — 영상에선 팔이 곧다. 옆 영상(투수 296px)이 팔을 못 보다가(지어낸 점 0.3~0.4) 팔이
  카메라를 향해 뻗은 장면(원근 압축, 확신 0.5~0.8)에서 교차가 팔꿈치를 83° 로 접는다. 네 가지 고침(시선 추정점 표시 · 깊이 함께 풀기 · 시각 창 넓히기 · 원근 압축 알아채기)을 해 봤지만
  효과 없거나 마커 레이백이 나빠져 모두 되돌렸다(README 끝 절). 두 영상으로는 한계 — 셋째 영상 또는 팔을 구간째 함께 푸는 맞추기가 남은 길.

## 김민(맥북)에게 — 2026-10-14 · 김민(Claude, 데스크톱) — 스티커 찾기 2판(정답 늘림) · 착지 골반 정답 15구 · 낮에 적은 'K4 +24.6°' 는 틀렸음

받은 뒤 할 일 없음(엔진 · 앱 코드 그대로 — 마커 도구 · 문서만). 김민: "마커 촬영 전에 엔진을 더 올릴 방법은?" → 착지 장면을 보니 스티커가 네 카메라에
다 보이는데 찾기(HSV 문턱)가 놓치고 있었다.
- **`selfcal/blobs_v2.py` + `DET_V2=1 python detect_all.py`**(MARKER_WORK 를 `work_v2` 같은 새 폴더로): 이름 붙은 스티커 15~21 → 21~27개, 덮음 13~21 → 17~30%,
  골반 정답 장면 717 → 999. 그 뒤 `labels_all.py` · `fill.py` 는 그대로. 데스크톱 `~/bullpen-marker-lab/2026-10-12/work_v2/` 에 결과 있음(맥북은 다시 돌려야).
- **`selfcal/fp_relabel.py`**: 착지 ±6장면 골반 스티커를 K4 관절 기준으로 다시 찾아 15구 모두 착지 골반 각 정답. **낮에 적은 'K4 골반 +24.6° 더 열림'은
  1판 스티커가 잘못 붙은 것이라 틀렸다** — 바른 값: K4 − 스티커 +0.9°(|차| 4.4), **엔진 − 스티커 −10.3°**(엔진 골반이 착지 때 10° 덜 열림, 내딛기 전체
  −7.7 · 팔 가속 −19.9 · 팔로스루 −26.8). `TRUNK_PLANT_NORM` 주석의 '엔진이 K4 보다 13° 더 닫힌 쪽'은 유효(K4 ≈ 스티커). 설계 문서 4-2.
- 어깨 봉우리(L2 · R2)는 착지 무렵 글러브 팔 스티커와 헷갈려 아직 세 구뿐 — 두 번째 촬영(어깨 뒤 · 위 스티커)이 여전히 필요.
- 다음 엔진 개선 후보: 내딛기 ~ 착지 골반이 늘 덜 열린 쪽(−8~−10°)이니, 10-13 의 다리 들기 당김(PELVIS_FOOT_PULL)처럼 내딛기에도 단서를 넣을 수 있는지
  — 이제 내딛기 정답이 226장면(전 137)이라 다시 견줄 만하다(`pelvis_score.py` CUES).

## 김민(맥북)에게 — 2026-10-13 밤 · 김민(Claude, 데스크톱) — 투구 분석: 메커니즘 점검 · 상하체 분리 자(기준선) 정리 끝, 이어서 할 것

받은 뒤 할 일 없음(DB · 패키지 그대로). 오늘 데스크톱에서 한 투구 분석 일 — 자세한 근거 · 숫자는 `docs/designs/pitch-mechanics-checks.md` 3절 · 4절 · 4-1 · 4-2.
- **메커니즘 점검 카드**(결과 화면 '숫자' 위, `mech-card.tsx`): 드리프트 · 상하체 분리 · 앞다리 버티기 → 드릴. 계산 `lib/pitch-3d/v2/mech-checks.ts`, 판정 `mech-judge.ts`.
- **상하체 분리 기준 = 우리 자**: 드라이브라인 공개 자료의 관절 가운데로 우리 식(어깨선 · 엉덩이선을 위에서 본 각도 차)을 다시 세니 그들 값(흉곽 틀)보다
  24° 컸다(어깨선이 날개뼈와 같이 움직임). 우리 자도 일정(ICC 0.95). 기준표 우투 45.8 / 53.3 / 57.3 · 좌투 40.6 / 47.6 / 53.9(아래 10 / 25 / 50%),
  고칠 점 우투 39 · 좌투 33.8° 밑. 김민 마커 15구는 모두 '고칠 점'(최대 24°, 착지 때 어깨가 이미 열림 — 드라이브라인 투수는 어깨 −20° 닫힘).
  도구 `scripts/pitch-lab/obp/`(README 에 자료 받기 — 저장소 밖, CC BY-NC-SA).
- **인형 이름표**: 상하체 분리 하나만, 어깨가 골반을 앞지르면 숫자 대신 '풀림'(`mannequin-measure.ts` labelText).
- **스티커 확인**(`selfcal/sticker_lines.py`, 데스크톱이 `work/fill` 을 다시 만듦): 착지 무렵 앱 엉덩이선이 실제 골반(ASIS · PSIS)보다 +7.6° 더 열림(11구).
  어깨 봉우리 스티커는 다리 들기 ~ 착지에 한 장면도 안 보여 어깨선은 못 쟀다.
- **이어서 할 것**: ① 두 번째 마커 촬영 — 어깨 뒤 · 위 스티커를 더하고 착지 무렵 양 어깨가 보이게(어깨선 확인 · 골반 앞 스티커도) ② 그 뒤 엉덩이 +7.6° · 어깨
  치우침을 여러 사람으로 확인되면 보정 넣을지 정하기 ③ 착지 때 몸통 열림(트레드의 '일찍 열림')을 우리 자 기준(드라이브라인 투수 어깨 −20°, 위 10% −5.6°)으로
  판정할지 — 지금은 엔진이 정답과 13° 어긋나 안 씀 ④ 실험실 샘플(실제 선수)에서 카드 판정이 그럴듯한지 화면으로 보기.

## 금윤호에게 — 2026-10-13 · 김민(Claude, 데스크톱) — 인형 각도 이름표는 상하체 분리만 · 팔꿈치 · 어깨 · 무릎 잰 선 뺌 · 분리 판정을 드라이브라인 자료 기준(손별)으로

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역(데생 인형 · 결과 화면)을 고쳤다.** 김민: "각도 상자는 상하체 분리만 남기고, 삐져나온 팔꿈치 · 어깨 · 무릎 각도 선은 빼"
· "드라이브라인 · 트레드 기준으로 상하체 분리를 정확하게".
- 인형: `lib/pitch-3d/v2/mannequin-measure.ts` `measureSpec` 이 이름표 하나(상하체 분리) · 호 둘(분리 · 몸통) · 선 여섯만 낸다(앞무릎 · 어깨 벌림 · 팔꿈치의
  회색 연장선 · 부채꼴 · 이름표 뺌, 몸통 기울기는 이름표만 빼고 선 · 부채꼴은 김민이 '일단 남겨 둠'). 화면 쪽 개수도 맞춤 — `mannequin/overlay.ts`
  선 9 → 6 · 호 5 → 2, `body-3d.tsx` 이름표 5 → 1, 범례(`mannequin-pause.ts` LEGEND)는 골반 · 어깨 · 몸통. `measureAngles`(잰 값 다섯)는 그대로.
- 판정: `lib/pitch-3d/v2/mech-judge.ts` 분리 = 최대 분리 크기(드라이브라인 공개 자료 손별 아래 25% · 10%) + 시점(착지 110ms 넘게 이르면 몸통 일찍 열림).
  `MechChecks` 에 `hand` · `separation.atPlantDeg` · `trunkOpenAtPlantDeg` · `pelvisOpenAtPlantDeg`(열림 둘은 마커 정답과 13° 어긋나 판정에 안 씀).
  근거 · 숫자는 `docs/designs/pitch-mechanics-checks.md` 4절. 시험 `pitch3d:v2-test` 259 → 261.
- (같은 날 더) 분리 이름표가 '풀림'을 안다: `measureAngles` 의 `separation` 이 이제 부호가 있다(+ 골반이 더 열림 · − 어깨가 앞지름, 예전 `Math.abs`).
  음수면 이름표 · 읽어 주는 글이 숫자 대신 '풀림'(`labelText`, `body-3d.tsx` 두 곳). 김민: "마커 샘플 16에 던지고 나서 꼬임이 45까지" — 착지 뒤 0.1초부터
  어깨가 골반을 앞질러 릴리스 뒤 −40~−55°(마커 정답도 같음)인데 크기만 보여 꼬임처럼 읽혔다. 시험 261 → 262.
- (같은 날 더) 분리 기준표를 우리 자로(`mech-judge.ts` SEP_NORM 우투 45.8 / 53.3 / 57.3 · 좌투 40.6 / 47.6 / 53.9): 드라이브라인 공개 자료의 관절 가운데로
  우리 식을 다시 세니 드라이브라인 값(흉곽 틀)보다 24° 컸다(어깨선이 날개뼈와 같이 움직여서). 옛 기준이면 드라이브라인 투수가 100% '좋아요'. 김민 마커 15구는 모두
  '고칠 점'이 됐다. 근거 · 스티커 확인은 `docs/designs/pitch-mechanics-checks.md` 4-1 · 4-2.

## 금윤호 · 김민(맥북)에게 — 2026-10-13 · 김민(Claude, 데스크톱) — 3D 결과 화면에 '메커니즘 점검' 카드(드리프트 · 상하체 분리 · 앞다리 버티기 → 드릴)

받은 뒤 할 일 없음(DB · 패키지 그대로). **금윤호 영역(3D 엔진 · 결과 화면)을 고쳤다** — 엔진 계산 · 인형은 안 건드림, 결과 화면에 카드 하나를 더했다.
- 새 순수 계산 둘: `lib/pitch-3d/v2/mech-checks.ts`(엔진 결과 → 드리프트 · 착지 골반 수평 · 최대 분리 시점 · 블록, 판정 없음) ·
  `lib/pitch-3d/v2/mech-judge.ts`(좋아요 · 보통 · 고칠 점 · 판정 안 함, 문턱 상수는 그 파일 머리). 시험 `pitch3d:v2-test` 245 → 259.
- 화면: `app/(app)/videos/lab/[id]/mech-card.tsx`(새) · `lab-detail.tsx`(오른쪽 열 '숫자' 위에 카드) · `page.tsx`(요소별 드릴을 서버에서 넘김) ·
  `lib/mechanics/drills.ts` `drillPicksFor`. 누르면 '그 순간 보기' · 쉬운 드릴 셋 · 요소별 드릴(`/training?view=mechanics&tab=elements&el=…`)로.
- 분리 부호는 **던지는 손으로**(골반이 어깨보다 더 열린 만큼 = +). 맥북 파이썬 셋(`mech_checks.py` · `sep_timing.py` · 새 `mech_truth.py`)도 바꿨다 —
  세상 좌표 옆 축이 왼쪽이라 우투가 −. 엔진 숫자(1단계 36 · 48ms)는 그대로.
- 근거 · 숫자 · 우리 가정 문턱 셋(분리 ±50ms · 골반 감속 70% · 무릎 15°)은 `docs/designs/pitch-mechanics-checks.md` 3절 1~4번. 마커 15구에서 앱이 잘못 낸
  '고칠 점' 0, 판정이 정답과 같은 구 11~12/15. 화면은 임시 경로로만 봤다(로그인 실제 샘플 · '고칠 점' 뜨는 화면은 아직).
- 맥북: 데스크톱에서도 정답지가 다시 돌게 됐다(`cal16b_mac.json` · `world_shank42.json` → `labels_all.py` → `bench.py tracks` → `mocap-fit.mts` →
  `mech_truth.py` → `mech-score.mts`). 남은 것: 두 번째 촬영 때 골반 앞 스티커가 착지 ~ 릴리스에 보이게(문서 5번).
  맥북의 레이백 변경(64718ac, 던지는 팔 다듬기 0.4배)을 받은 뒤 15구를 다시 맞춰 재도 점검 숫자 · 판정이 같았다(차이 0.1 밑 — 팔만 바뀌어서).
- (맥북, 같은 날 더) `lib/pitch-3d/analyze.ts` repairLabels 에 팔 좌우 고침 조건(598a5c6 — 샘플 1 백스로잉 팔 접힘, 다른 샘플 관절 변화 0mm) · 채점 기준 다시 저장(selfcal/README.md '백스로잉').
- (맥북, 같은 날 더) 샘플 1 떨림: `analyze.ts` repairLabels 가 손 모은 세트 자세에서는 줄어드는 양도 봐야 뒤집음(`REPAIR_NEAR` · `REPAIR_MIN_GAIN`), 화면 `v2/kinematics.ts` unwrap 이 팔 비틀림을 앞 장면 빠르기로 이음(공 놓은 뒤 편 팔에서 거꾸로 돌던 것). 시험 v2 260(새 4-8) · v1 63, 채점 기준 다시 저장(selfcal/README.md '세트 자세').
- (맥북, 같은 날 더) **떨림 검사 `npm run pitch3d:jitter`** — 엔진 · 화면 모델(display · kinematics)을 고치면 마커 채점과 함께 돌려 줘. 실험실 샘플 8개를 지금 엔진 · 화면으로 돌려 구간 · 관절별 떨림을 `scripts/pitch-lab/jitter/baseline.json` 과 견주고, 늘거나 화면이 원 결과보다 더 떨면 끝 코드 1(16초). 자료는 저장소 밖 `~/bullpen-marker-lab/labsamples` — 처음엔 `-- --fetch`(영상 받기 + Modal 2D, `.env` · `MARKER_VENV`=modal 이 든 venv bin). **결과에 엔진 지문**: 묶기가 `build.json` 을 만들고 결과 `engine.build` 에 찍는다, 서버 `GET /engine`, 결과 화면이 다르면 '예전 엔진으로 분석한 결과예요' 띠.
- (맥북, 같은 날 더) **화면 관절 각도 모델(`v2/kinematics.ts`)이 원 결과보다 더 떨던 35곳 → 15곳**(가장 큰 값 5.0 → 1.4%): 손목 · 발목은 원 자리를 다듬은 세상 자리로 두고 팔꿈치 · 무릎만 다듬은 각에서 굽은 쪽을 가져와 `twoBoneIk` 로 다시 접는다(각 셋을 따로 다듬어 묶인 값이 어긋나던 것 — 샘플 10 첫머리 손 · 착지 앞발). 사람 범위 한계(어깨선 뒤 · 엉덩이 돌림)가 손을 쓴 장면 · 거의 편 팔은 예전 각도 모델 그대로, 손 · 무릎 기준 축(`refs`)은 다듬은 축을 새 마디에 수직으로만. 남은 것: 머리(코 · 귀, 0.5~1.0%) — 공 놓기 앞뒤 화면 몸통 어깨가 원 어깨보다 낮아 목 한계가 늘 걸려 머리가 화면 어깨를 따라 흔들림(몸통 모델 일). 시험 v2 264(새 4-9) · 떨림 기준 다시 저장.
- (맥북, 같은 날 더) 떨림 검사가 **이상한 움직임**도 센다(`measure.mts` oddities · mannequinOddities): 마디 순간 튐 · 사람 한계 넘는 빠르기 · 뒤로 꺾인 무릎(굽힘 60° 밑) · 분리 75° 넘음(화면 · 원 결과 따로), 인형 방향(골반 · 가슴 · 머리 · 두 손 · 두 발)의 순간 튐 · 빠르기 넘음. 늘면 실패. 지금 많은 것: 인형 글러브 손 · 머리 빠르기, 화면이 원보다 많은 뒤로 꺾인 무릎(기아 19 · s10 7).
- (맥북, 같은 날 더) **이상한 움직임 고침**: 인형 손 옆 방향 = 검지 − 새끼(`mannequin-frames.ts` handFrame, 팔을 펴면 손이 90~150° 휙 돌던 것) · 머리 앞 방향 = 단위 벡터 평균(영상 첫머리) · 화면 무릎은 발끝 ±60° 안(`kinematics.ts` kneeTowardToes — 뒤로 간 무릎은 앞으로 접고, 굽힘 50~70° 에서 풀림, 무릎 굽는 축은 새 두 마디에서). 인형 방향 빠르기 넘음 49 → 13 · 마커 38 → 0, 화면 뒤로 꺾인 무릎 26 → 0. 남은 것: 엔진(원 결과) 마디 빠르기 넘음 43 — 3단계(엔진에 관절 범위 · 빠르기).

## 김민에게 — 2026-10-13 · 금윤호(Claude) — 구속 앱 카메라: 셔터 상한 1/500 · 되면 120fps(엔진 2.4.2) — 받으면 TestFlight 빌드

받은 뒤 할 일: **TestFlight(또는 맥 개발 빌드)** — `mobile/ios/App/App/DualCameraPlugin.swift` 를 고쳤다(내 영역이지만 Swift 는 윈도우에서 못 구워 눈으로만 확인).
- `apply`: 자동 노출 + `activeMaxExposureDuration` 1/500초(모양 범위 안으로), `stop` 에서 `.invalid` 로 되돌림. `Config.preferFps`(사이트가 120 을 청함) →
  `pick(prefer:)` 가 같은 넓이 · 같은 선명함 · 같은 묶음 읽기인 모양 가운데 120 을 내는 것이 있을 때만 그것으로. `onFps` 에 셔터 · ISO 두 칸 더함
  (`notifyListeners("fps", … "shutter" · "iso")`).
- 빌드가 안 되면(타입 · API) 알려 줘 — 고칠 자리는 위 셋뿐이다. 되면 관리자 세션 정보 기기 글에 '셔터 1/500' · fps 120 이 찍히는지 봐 줘.
- 까닭 · 남은 일: `docs/velocity/engine-2.4-plan.md` 8절.

## 김민에게 — 2026-10-13 · 금윤호(Claude) — 홈 영양 카드 자리를 돌아가는 요약 칸으로 · 하단 탭 길게 눌러 끌기 — 네 영역(홈 · 앱 틀)을 고쳤다

받은 뒤 할 일 없음(DB · 패키지 그대로). 사용자 결정: "영양이 있는 자리를 뉴스칸으로 — 3초마다 넘어가고 왼쪽으로 나가며 오른쪽에서
들어옴 · 하이라이트도 여기로 · 누르면 그 탭 · 오른쪽 위 ‹ › · 앱에서는 손가락을 따라 쓸기 · 하단 탭도 길게 눌러 쓸면 동그라미가 따라옴".
**화면에 '뉴스'라는 말은 안 쓴다**(우리끼리 부르는 이름).
- `app/(app)/today/`: 새 `feed-card.tsx`(client — 장 셋을 트랙에 두고 밈, 3초 자동 · 끌기 · ‹ › · 움직임 줄이기 · 탭 숨김 때 쉼) · `feed.tsx`(서버 —
  하이라이트 → 부하 지수 → 오늘 운동 → 영양 한 줄, 네 `highlights-load.ts` 로 읽음). `highlights.tsx` 는 `MiniChart` 를 export 만 더함(분석 칸이 그대로 쓴다).
  **지움**: `nutrition-card.tsx`(영양 장이 같은 `loadAdvice` 숫자를 한 줄로). `page.tsx` 는 캘린더 밑 하이라이트 블록을 빼고 요약 칸을 넣음, `loading.tsx` 뼈대 높이 11.25rem.
  `lib/report/highlights.ts`(계산 · 시험)는 그대로. 네가 같은 날 나눈 분석 › 투구 · 트레이닝의 하이라이트(`highlights-load.ts` part)는 그대로 두고, 요약 칸은 모든 몫을 돌린다
  (`loadHighlights` 의 `part` 를 선택 인자로 — 안 주면 전부).
- `components/app-shell.tsx` MobileTabs: 알약에 `touch-none` + 포인터 처리 — 0.28초 넘게 누르면 떠다니는 둥근 배경(`DragThumb`)이 손가락을
  따라오고(패드 세로 막대는 y) 놓은 칸으로 `router.push`(더보기면 시트). 끌었으면 뒤따르는 click 을 막는다. 짧게 누르기 · 지금 탭 다시 누르기는
  그대로. 칸에 `data-tab-href` 를 달았다.
- 폰에서 봐 주면 좋은 것: 요약 칸 쓸기(손가락을 따라오다 놓으면 넘어감 · 세로 스크롤은 그대로인지) · 하단 탭 길게 눌러 끌기(iOS 링크 미리보기가
  안 뜨는지 · 떨림) · 요약 칸을 눌렀을 때 그 탭으로.

## 금윤호에게 — 2026-10-13 · 김민(Claude, 맥북) — 3D 엔진 골반 · 앞다리 + 결과 화면 몸통(뼈대 맞춤 · 흉추 C · 꼬임 줄)

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역(3D 엔진 · 인형)을 고쳤다.** 시험 v1 63 · v2 245 통과, `pitch3d:bundle --check` 같음.
- **엔진**(`fit.ts`, 6b9a3bf · 150364e): 다리 들기 골반 방향을 축발(뒤꿈치 → 발끝)로 당김(마커 채점 골반 돌림 14.2 → 5.0° · 분리 12.3 → 4.7°),
  다리 관절 목표에 튀는 값 거르기(샘플 3 · 10 앞다리 떨림). 던지는 팔(샘플 1 · 10)은 엔진 결함 근거가 없어 안 고침(selfcal/README.md).
  분석 서버(Modal)에도 올렸다(같은 날, `npm run pitch3d:bundle` → `modal deploy app.py`) — 새로 분석하는 영상부터 들어간다.
- **화면**(9e454de · e88af24 · 5e6f61b): 몸통 실제 뼈대를 정점마다 같은 높이의 인형 고리에 얹음(`mannequin-pause.ts` `prepareSkeleton` · `fitSkeleton`,
  옛 `skeletonPlaces` · `placeLocal` · `trunkBlend` 지움 — 인형 밖 뼈 20.8% → 0.8%), 가슴 틀 위 방향 = 몸통 곡선의 어깨 쪽 접선(`mannequin-frames.ts`,
  관절 칸 `tp` 지움 — 릴리스에서 흉추가 C 로), 몸통에 빨간 꼬임 줄 넷(`mannequin-loft.ts` `writeStripes`, 색 `twist`). 아이폰 앱에서 한 번 봐 줘.
  각도 이름표는 화면 속 몸이 작으면(키 420px 밑) 이름을 빼고 숫자만(`body-3d.tsx` LABEL_FULL_BODY_PX, 글자 11px 그대로).

## 금윤호에게 — 2026-10-13 · 김민(Claude, 맥북) — 구속 측정: 믿음 '높음'만 기록 · 보정식을 비율 하나로(엔진 2.3.20)

받은 뒤 할 일 없음(DB · 패키지 그대로). 네 영역(구속 측정). 김민: "빨라질수록 실제보다 많이 낮게 나온다 → 원인 · 고쳐줘 · 믿음 높은 것만 측정하고 나머지는 측정 불가 안내".
- 원인: 보정식(`lib/velocity-calibration.ts` fitCalibration)이 최소제곱 직선이라, 10-09 실내 짝 13개(12개 믿음 낮음 · 65~80 에 몰림 · 튄 짝 둘)로
  기울기가 하한 0.8 에 붙었다(×0.8 + 14.55 → 원값 127 이 116, 건 129). 원값은 빠르기와 상관없이 고르게 약 2% 낮을 뿐이었다(10-12 밖 22구).
- 고침: 보정식 = 비율 하나(건 ÷ 카메라의 가운데 값, 0.9~1.1, 짝 3개부터), 짝은 믿음 '높음'만(`loadCalibration`). 측정 화면(`velocity-screen.tsx` addResult)은
  믿음 '높음'이 아닌 공을 기록하지 않고 '측정 불가' + 까닭별 안내(`lowConfidenceFix` — 포수 뒤 · 흔들림 · 끝이 배경에 묻힘 · 그 밖)를 보인다. 새 거부 코드
  `LOW_CONFIDENCE`(validate.ts, 엔진 값은 그대로라 2.3.20 작은 자리). 10-12 공에 대 보면 기록되는 15구 평균 오차 7.4 → 2.8km/h.

## 금윤호에게 — 2026-10-13 · 김민(Claude, 맥북) — 운동 · 드릴 영상을 720p 로 줄여 아이폰 앱 안에 넣는다

받은 뒤 할 일 없음(DB · 패키지 그대로, 저장소의 원본 영상도 그대로). 김민: "영상을 줄여서 앱 안에 넣는 방안" — 서버 전송 비용을 줄이고 바로 보게.
- `npm run library:bundle`(맥에서만 — 맥의 AVFoundation 으로 줄임): 보이는 운동 · 드릴 영상을 받아 720p(60fps 2.5Mbps · 30fps 1.8Mbps, 소리 없음)로 줄여
  `mobile/ios/App/App/LibraryVideos/<uuid>.mp4` 에 두고, 저장소 `library-720/<uuid>.mp4` 에도 올린다(원본 `library/` 는 그대로). mp4 는 git 에 안 올린다
  (공개 저장소 · 674MB). GitHub 의 TestFlight 굽기는 사이트 `/api/library/bundle` 에서 굽기 전용 열쇠(`LIBRARY_BUNDLE_TOKEN` — Vercel 환경변수 · GitHub 비밀,
  둘 다 넣어 둠)로 받아 넣는다(`mobile/scripts/fetch-library-videos.mjs`). **새 영상을 올렸으면 맥에서 `library:bundle` 을 돌려야** 다음 앱에 들고 720p 로 틀린다.
- 앱(`LocalVideoPlugin.swift` 새 기능 넷 libraryStatus · Load · Fetch · Prune): 재생기 `components/library-video.tsx` 가 앱이면 앱 안 → 폰에 받아 둔 것 → 없으면
  한 번 받아 폰(Caches, 1GB 넘으면 오래 안 본 것부터 지움)에 두고 튼다. 웹 · 옛 앱 · 실패는 예전처럼 서버에서 바로.
- 앱을 낸 뒤 새로 올리거나 고친 영상은 이름(uuid)이 바뀌어 앱 안에 없으니, `components/library-sync.tsx` 가 앱을 켤 때(12시간에 한 번, 30개까지) 미리 받고
  지운 · 바뀐 것은 폰에서 지운다(`/api/library/video-manifest`). 앱 안에 영상이 하나도 없으면(TestFlight 판) 미리 받지 않는다 — 다 받으면 수 GB.
- 운동 영상 재생(웹 포함)은 줄인 판이 있으면 그것을 튼다(`/api/library/video-url` 의 `small` — 재생기 · 앱 미리 받기만). 네 촬영 편집기 · '올린 영상 편집' ·
  썸네일 고치기는 small 없이 원본을 받는다. 촬영 편집기(`lib/clip`)는 그대로 1080p 로 올린다.

## 금윤호 · 데스크톱 Claude 에게 — 2026-10-13 · 김민(Claude, 맥북) — 마커 정답지 4~7단계 끝 · 3D 엔진에 초점 사전(선택) — 받으면 `npm ci` 필요 없음

받은 뒤 할 일 없음(DB · 패키지 그대로). **3D 엔진(금윤호 영역)을 고쳤다** — 기본 동작은 그대로, 시험 v1 63 · v2 243 통과.
- `lib/pitch-3d/camera.ts` `FocalPrior` · `FOCAL_PRIOR_1X`, `CalibInput.focalPrior`, `Pitch3dInput.focalPrior`(analyze.ts) · `V2Input.focalPrior`(contract.ts) → fit.ts.
  '1배로 찍음'을 알 때만 넘긴다. 마커 채점에서 관절 오차 가운데 3.6 → 3.3cm. 서버는 1배를 기본으로 넘긴다(a709a99, 사용자 결정).
- **(같은 날 더) 엔진 개선 2차 — `lib/pitch-3d/v2/fit.ts`**: 골반 폭 상한(어깨 폭의 0.72배 — 골반이 22% 넓게 나왔다) · 시간 다듬기 세기
  `min(1, 0.35 + 0.9(1−w))`(예전 `0.1 + 0.9(1−w)²`) · 끝 다듬기 8번 → 뼈 투영 1번. 마커 15구로 홀수에서 고르고 짝수로 확인: 관절 가운데
  3.3 → 3.2 · 평균 4.1 → 3.95cm · 골반 폭 1.22 → 1.05. 해 보고 버린 것(240 장면 · 손 점으로 손목 보강 · 좌우 뒤집기 평균 · 정답 초점)은
  selfcal/README.md '엔진 개선 2차' 표. 시험 v1 63 · v2 243 통과 — v2 의 '디딘 다리 넙다리 한 장면' 여유를 1.5 → 2° 로 넓혔다(넙다리 방향 제한은
  정확하고, 그 뒤 묶인 발목에 무릎을 다시 접는 단계가 1.5~1.7° 를 더함 · 시험 투수 자세가 엔진 결과라 14.8 → 15.0°). 서버(Modal)에도 올렸다(같은 날,
  `npm run pitch3d:bundle` → `modal deploy app.py`). 채점 기준(`score-baseline.json`)도 새로 저장했다.
- 마커 정답지 4~7단계: `scripts/pitch-lab/markers/selfcal/` `fill.py` · `bench.py` · `score-all.mjs`, 명령 `npm run pitch3d:marker-score`(자료 없으면 건너뜀).
  결과 · 판단 근거는 selfcal/README.md '4~7단계 결과'. 맥북 세션 폴더 `~/bullpen-marker-lab/2026-10-12/`(영상은 맥북이 자른 64개에 연결).

## 데스크톱 Claude 에게 — 2026-10-12 · 김민(Claude, 맥북) — 마커 촬영 16구를 실험실 '마커 샘플'로 올렸다

받은 뒤 할 일 없음(DB 그대로). 사용자(김민): 안내서(마커 테스트 샘플 촬영 안내)대로 마커를 붙이고 4대로 찍은 영상을 데스크톱에서 보게.
- **어디**: 영상 버킷 `pitch-videos` 의 김민 계정(`2803cf76…`) `pitch-lab/{샘플 번호}/` 16개 — 실험실 화면 위 [샘플 | 마커 샘플] 의 '마커 샘플' 칸.
  폴더마다 `side.mov`(① 3루 · 아이패드 10세대 · 240 설정이지만 장면을 고르게 빠뜨려 평균 157fps, 장면 시각은 정확) · `back.mov`(② 2루 · 15 Pro Max · 240) ·
  `cam3.mov`(③ 홈 쪽 정면 · 아이폰 11 · 240) · `cam4.mov`(④ 1루 쪽 · 아이폰 SE 2 · 240 — 자리는 데스크톱 정답지 계산으로 바로잡음, 샘플 메모 · 화면 이름표도 고침) · `meta.json`(`kind: 'marker'`, 메모에 투구 번호). 원본 그대로(다시 압축 안 함).
- **자른 법**: 원본은 한 대에 6분 연속 녹화. 4대 시각 차(②=15PM 기준, ② 시각 = 그 카메라 시각 + 차): ③ −15.517s · ④ −31.446s · ① −10.467s
  (움직임 상관 + 소리 + 장면으로 맞춤, ±0.1s 안 — 1/240s 맞추기는 마커로 다시). 투구마다 던지는 순간(② 시각 15.44, 37.17, 48.66, 62.48, 99.16, 132.75, 144.24, 158.96, 173.95, 189.41, 198.48, 229.37, 238.82, 260.32, 306.65, 316.62) 앞 2초 ~ 뒤 2초.
  그래서 한 폴더의 네 영상은 같은 순간에서 시작한다. 카메라 보정(막대) · 몸 보정 영상은 아직 찾지 못했다(사용자에게 물을 것). 기록표 사진 없음.
- 코드: `LabMeta.kind`('sample' | 'marker', 옛 샘플은 sample) · 실험실 목록의 두 칸(`lab-client.tsx`) · 시험 `pitch-lab:test` 11(예전부터 깨져 있던 '마운드' 표시 시험도 고침).

## 금윤호에게 — 2026-10-12 · 김민(Claude) — 데생 인형 몸통이 골반 · 허리 · 등으로 꼬이고 휜다(AI 몸통 마디 + 규칙) · 벨트 뺌 · 엉덩이 넓힘

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역(3D 엔진 · 인형)을 고쳤다.** 김민: "몸통이 꽈배기처럼 꼬이고 숙여지는 게 전혀 안 된다 · 골반도" →
하이브리드(김민이 고름 — 1 AI 척추 값 + 2 규칙의 장점만).
- **까닭**: 몸통 정보가 엉덩이 · 어깨 점 넷뿐이라 몸통이 곧은 한 덩어리였다(꼬임은 골반 틀 → 가슴 틀 사이를 고르게 돌리기만).
- **GPU**(`services/pitch3d-gpu/pitch3d_gpu/sam3d.py`): AI(SAM 3D Body)가 맞춘 몸 겉면을 엉덩이 → 어깨의 0.41 · 0.60 · 0.83 높이에서 잘라
  단면 가운데 · 좌우 축을 잰다(`trunk_points` — 타원 밖 점(팔)을 걸러 가며, 좌우 축은 두 주축 중 엉덩이 · 어깨선 쪽) → 결과 `experimental.sam3d.trunk`
  (장면 × 6 점). 켜면 손 단계를 빼는 '몸만' 모드(`PITCH3D_AI_MODE=body`, 장면당 0.9 → 0.22초, 도우미 2대). 파이썬 시험 35(합성 몸통 · 비스듬한 단면 · 몸통 옆 팔).
  **AI 는 그대로 꺼 둠**(`app.py` AI_ON 기본 0 — 10-09 결정 유지): 샘플 넷(3 좌투 · 4 · 6 · 10)을 켜고 돌려 보니 분석이 25~40초 늘었는데 화면이 AI 마디를
  믿은 몫이 착지~릴리스 꼬임 0~2% · 휨 0~8%(높이별 꼬임이 사람 척추로 못 낼 만큼 흔들림). 그래서 지금 화면은 규칙 마디만 — 다시 켜려면 PITCH3D_AI=1.
- **화면**: 새 순수 모듈 `lib/pitch-3d/v2/trunk.ts`(`trunkTrack`) — 위 · 아래 끝은 우리 엉덩이선 · 어깨선, 사이는 AI 의 '자기 엉덩이 · 어깨에 대한' 상대
  꼬임 · 휨을 붙이고, AI 끝 꼬임이 우리와 25~50° 다르거나 사람 척추로 못 내는 나눔(규칙에서 25~45° 넘게)이면 그만큼 규칙으로(척추 축 돌림은
  대부분 등뼈 — 허리 0.15 · 가슴 밑 0.45 · 가슴 0.8). `mannequin-prep` 이 인형 관절에 `t1 · t1s · t2 · t2s · t3 · t3s`(선택 칸)를 싣고,
  `mannequin-loft` `torsoModel` 이 있으면 가운데 선 세 점 · 높이별 좌우 축을 그것으로(없으면 예전 그대로). `canonicalFrames` 는 선택 칸을 건너뜀.
- **같이 고친 것**: 인형 벨트(둥근 고리 · 버클 · 고리) 뺌(`figure.ts`), 엉덩이 폭 · 볼기 두께 키움(`mannequin-profiles` torsoWidth · torsoBack,
  hw 상한 9 → 10cm), 관절 각도 한계 완화(`kinematics.ts` liftTwist 15 → 25 · 골반 빠르기 800 → 1100°/초 — 상하체 분리를 덜 깎게).
- 시험 `npm run pitch3d:v2-test` 에 몸통 마디 10개 더함(전체 243). 아이폰 앱에서 착지 · 릴리스 몸통 꼬임이 자연스러운지 봐 줘.
- 남은 큰 문제(김민에게도 알림): 엔진의 엉덩이 점이 영상에서 잘 안 보여(확신 20~36%) 착지 때 골반-어깨 꼬임 자체가 작게 나온다(샘플 4 착지 −6° 등) —
  몸통을 아무리 나눠도 끝 값이 작으면 꼬임이 작다. 다음 개선은 골반 방향을 허벅지 · 무릎까지 써서 어림하는 엔진 쪽.

## 금윤호에게 — 2026-10-12 · 김민(Claude) — 시험 계정 날짜(simDate)가 화면 · 저장 시각까지 맞게 — `lib/prisma.ts` 를 고쳤다

받은 뒤 할 일 없음(DB · 패키지 그대로). 사용자: '다음날로' 뒤 서버는 8/2 인데 체크인이 8/1 에 머묾.
- 화면 시계: 뿌리 레이아웃의 Date 바꿔치기가 `window.__bpSimOffset` 을 매번 읽고, `components/sim-clock-sync.tsx` 가 30초마다 ·
  앱을 다시 볼 때 `/api/sim-offset` 에 물어 바꾼다(날짜가 넘어가면 `SIM_DAY_EVENT` → useTodayKey · 체크인 폼이 다시 봄 + router.refresh).
  당겨서 새로고침은 페이지를 다시 열지 않아 처음 박아 둔 날짜가 남았었다. 시험 계정이 아니면 아무것도 안 그린다.
- 서버 시계: 30초 지난 첫 요청도 새로 읽은 날짜를 기다린다(`ensureSim`).
- **`lib/prisma.ts`**: 시험 계정의 요청일 때만, 만들고 고칠 때 비어 있는 시각 칸(createdAt · startedAt · recordedAt · updatedAt …, 표 `TIME_FIELDS`)을
  시뮬레이션 지금으로 채우는 `$extends` 를 씌웠다 — DB 의 now() 는 실제 시각이라 운동 시간 · 쉬는 시계 · 2분 안 같은 기록 막기가 어긋났다.
  다른 계정은 손대지 않는다(`__bpNow` 가 실제 시각이면 그냥 지나감). 새 표에 `@default(now())` 칸을 더하면 이 표에도 적어 줘.

## 김민에게 — 2026-10-12 · 금윤호(Claude) — 트레이닝 추천 2판 P3(등판 답 여섯 · 체감 강도 %) · P4(경기 다음 날은 부하로) — 받으면 `npx prisma generate`

받은 뒤 할 일: **`npx prisma generate`** — `PitchLog.effortPct Int?`(체감 강도 5~100%)를 더했다. 마이그레이션 `20261012030000_pitch_log_effort_pct`,
DB 에는 이미 적용했다(백업 `db-2026-10-11-18-23.json`). 비워 둘 수 있어 옛 코드도 돈다. `npm ci` 는 필요 없다. 설계 · 결정은
`docs/designs/training-recommendation-engine.md`(D1 · D2).
- **(앞서 Y, 1bb402d) 성장기는 만 16세 미만(D4)**: `lib/report/plan.ts` `YOUTH_AGE_THRESHOLD` 15 → 16, 만 14세 이하는 어린 휴식표(`REST_REQUIREMENTS_YOUTH`,
  `requiredRestDays(pitches, age)` · `restFor(pitches, adjusted, age)`). **네 영역 `lib/checkin.ts` 의 `ARM_PAIN_ROUTINE_MIN_AGE` 도 15 → 16**(한 줄 — 팔 통증 루틴 나이 한도).
  15세는 이제 성장기라 '매우 높음' 날이 빠지고, 암케어 시험 둘의 기대값이 16세 줄로 바뀌었다.
- **intensity 는 계속 같이 쓴다.** % 를 받으면 `intensity = effortToIntensity(%)`(85 → 9)를 함께 저장한다(`lib/pitch-effort.ts effortFields`).
  강도는 `log.intensity` · `log.effortPct` 를 직접 읽지 말고 `lib/pitch-stats.ts` 의 `effortPctOf`(%) · `intensityOf`(1~10 실수), 화면은
  `lib/pitch-effort.ts readEffort` · `effortText` 로. 두 칸이 어긋난 줄(이 칸을 모르는 옛 코드가 intensity 만 고친 줄)은 intensity 를 믿는다
  (`trustedEffortPct`) — 그래도 받기 전의 개발 서버로 투구 기록을 고치는 일은 되도록 피해 줘.
- **던지는 일정이 간편 체크인으로 옮겨졌고 답이 여섯**: '오늘 등판' · '오늘 불펜' · '내일 등판' · '2~3일 뒤' · '4일 이상 뒤' · '없음'(옛 넷은 글자 그대로).
  답을 날로 읽는 규칙은 `lib/checkin.ts`(`nextOutingDays` · `nextOutingWindow` · `exactOutingDay` · `todayOutingRole`) 한 곳이다 — 답 글자를 `===` 로
  견주지 말아 줘(자체 시험이 app · lib · components 전체를 훑는다).
- **세게 던진 날** = 그날 Σ 투구수 × 체감 강도(%) ≥ 2,700(경기 100%), 또는 옛 규칙(경기 · 강도 9~10 으로 합쳐 30구). `lib/report/facts.ts isHardOuting`.
- **네 영역 파일을 고쳤다**(무엇 · 커밋):
  - 홈 `app/(app)/today/`: day-summary · day-detail · pitch-log-panel · analysis-view · first-day-card(주석)는 강도를 % 로(ebcaea2). page.tsx 는 계획 줄 ·
    첫날 카드 · 잘 던진 날 메모가 등판 날을 읽는다(cda47b0 · 이 묶음의 검토 반영 커밋). 등판 날이어도 큰 등판 다음 날 · 최근 통증 · 나이 한도가 먼저다.
  - 분석 `app/(app)/coach/` overview · parts · report-client · trend-chart — 강도를 % 로(ebcaea2).
  - `components/month-calendar.tsx` — **이름이 바뀌었다**: `intensityClass` → `effortClass`, `DayMark.intensity` → `DayMark.effortPct`(ebcaea2). 다른 가지에서
    옛 이름을 쓰면 컴파일이 깨진다.
  - `lib/armcare/routine.ts` · `today.ts` — `decideArmcare` 에 선택 인자 `state`(오늘 상태 한 장, `lib/engine/day-state.ts`)로 등판 날 회복. today.ts 가 따로 하던
    체크인 조회를 걷었다(조회 하나 줄어듦)(7ae15c7 · cda47b0).
  - `lib/program/load.ts` · `program.ts` — `throwSignals` 를 걷고 새 export `programSignalsOf`(오늘 상태 한 장으로 등판 신호), load.ts 의 체크인 조회를 뺐다
    (06fe6be · e09afb9). P3 에서는 결과가 그대로였다(자체 시험이 옛 식과 견줌) — P4 에서 '경기 다음 날' · 쉬는 글 · 대체 까닭이 바뀌었다(아래 P4 줄).
  - `app/actions/rehab.ts` — 재활 투구 기록도 `effortFields` 로 두 칸을 같이 쓴다(1853121).
  - `components/checkin-form.tsx` — 던지는 일정 · 팔 피로를 간편 쪽으로(1f5c3a8). 네가 같은 날 main 에서 고친 파일이라(1afa8ad · b091c49 · d130455) 합칠 때 겹칠 수 있다.
- **폰에서 봐 주면 좋은 것**: 간편 체크인의 던지는 일정 칩 여섯과 '어제: …' 글 · 투구 기록의 체감 강도 칩(−/+ 5%) · 구속 측정 저장 시트의 체감 강도 ·
  등판 날 홈 계획 줄.
- **(같은 날 더함) 트레이닝 추천 2판 P4 — 경기 다음 날은 부하로 · 다음 등판 짐작 · 팔 피로 안전 규칙.** 받은 뒤 할 일 없음(DB · 패키지 그대로 — facts ·
  일정 지문 Json 의 선택 칸만). 설계 문서 'P4 결과'. 커밋 0fbeb71 · 0e9bcc8 · 9911ac8 · 452f4da · 07cb1e1 · f71b0dd · e57d0c6 · 56bf05c · 0a5c421 + 검토 반영
  ('트레이닝 추천 2판 P4 검토 반영'). **네 영역 파일을 고쳤다**(줄 수는 `git diff --numstat 2afffc2` — P4 아홉 + 검토 반영):
  - `lib/program/program.ts` +35 −13 · +59 −3, `lib/program/load.ts` +21 −15 · +31 −13: '경기 다음 날'이 어제 '경기' 기록이 아니라 **어제 팔 부담**
    (`lib/engine/arm-load.ts yesterdayArmLoadOf` — 세게 던진 날 · 중간 부하 + 운동 힘듦 급증 · 기록 없는 등판). `ProgramSignalsInput.typesYesterday` →
    `yesterdayArmLoad`(`gameYesterday` 이름은 그대로), load.ts 는 어제 투구 기록을 따로 안 읽는다. 쉬는 까닭 글은 `restTextOf(reason, kind)` — '어제 많이
    던졌어요' · '어제 던졌고 최근 운동도 힘들었어요' · '어제 등판한 다음 날이에요'(까닭을 모르면 `REST_TEXT` '어제 팔 부담이 컸어요'), 넘긴 날 주의
    `CAUTION_TEXT.gameOverride` '쉬는 게 좋은 날이에요. …'. 대체 칸 · 까닭은 새 `painSlotsOf` 하나가 정한다 — 팔 피로 '심함'만으로 빠진 고정 운동은
    '대체 · 팔 피로'(예전엔 늘 '통증 부위'), 새 선택 칸 `TodaySignals.slotReasons` · 상수 `SUBSTITUTE_REASON`, 가리는 함수는 `lib/report/prescription.ts droppedOnlyForArmFatigue`.
  - `lib/armcare/routine.ts` +37 −12 · +5 −1: '어제 N구' 회복은 세게 던진 날 · 중간 부하 + 급증일 때만, 기록 없는 등판 다음 날은 '어제 등판' 회복, 가볍게 던진
    다음 날은 휴식표가 쉬라고 하면 회복 · 아니면 '어제 N구 · 팔 부담 적음 → 강화 루틴'. 휴식표는 이제 나이를 넣어 부른다(만 14세 이하 어린 표 — 투구 계획과 같은 말).
  - `components/checkin-form.tsx` +160 −5 · +34 −4, `checkin-gate.tsx` +11 −1, `app-shell.tsx` +2, `app/(app)/layout.tsx` +4 −1(56bf05c · 검토 반영): 간편
    체크인에 '어제 등판 · 기록 없음' 줄(어제 '오늘 등판' 답인데 어제 투구 기록이 쉰 날 줄까지 한 줄도 없을 때) — 몇 구 + 체감 강도 칩, 또는 '안 던졌어요'(어제
    '휴식' 한 줄). `saveCheckinSafely` 가 체크인보다 먼저 투구 기록 API 를 부른다. 같은 파일을 고치고 있으면 합칠 때 겹칠 수 있다.
  - `scripts/program-selftest.mts` +111 · +70(4-1 경기 다음 날은 부하로 · 4-2 대체 칸의 까닭).
  - facts 에 `patterns.loggedYesterday`(어제 투구 기록 줄 — 쉰 날 줄까지)가 생겼다. 엔진은 어제 '휴식' 줄을 '안 던졌다'는 답으로 본다.
  - 폰에서 봐 주면 좋은 것: 트레이닝 일정 카드 위 '다음 등판까지 N일'(짐작이면 밑에 '달력으로 추정' + 바꾸기) · 체크인 어제 등판 줄과 '안 던졌어요' 칩 ·
    프로그램 쉬는 날 글 · 팔 피로 '심함' 날 프로그램 대체 꼬리표.
- **(10-13 더함) 트레이닝 추천 2판 P5 — 고르기 점수 · 세트 줄이기 · 무게 멈춤 · '오늘 이렇게 짰어요'.** 받은 뒤 할 일 없음(DB · 패키지 그대로 — 일정 · 세션 판 Json 의
  선택 칸만). 설계 문서 'P5 결과'. **네 영역 파일을 고쳤다**(읽기만 더함, 프로그램 동작 그대로):
  - `lib/program/program.ts` +50(d2cffc3): export 둘 — `VARIANT_MOVEMENT_KEY`(변형 → 동작 열쇠, `lib/engine/exercise-class.ts movementKeyOf` 와 같은 말) ·
    `patternsOfProgramDay(plan, day, exerciseOf?)`(그날 일차가 쓰는 동작 열쇠 집합, 코어는 없음). 무엇을 할지(`dayPlan`)만 읽는다.
  - 매일 일정 만들기(`app/actions/training-setup.ts generateTodayPlan`, 74ce54b)가 `lib/program/load.ts activeProgram` · `program.ts parseProgram` · `readPinned` ·
    `patternsOfProgramDay` 로 진행 중인 프로그램의 다음 일차 동작을 읽어, 오늘 일정에서 같은 동작을 −3 으로 뒤로 민다(`lib/report/score.ts programNextOf` —
    10일 넘게 안 한 프로그램은 안 본다, 빼지는 않고 차례만). 프로그램 줄 · 칸 이름을 바꾸면 이 읽기도 같이 봐 줘.
  - 안전 거르기 새 규칙 4-2-1 '평소보다 낮은 컨디션'(`lib/report/prescription.ts`, ac269c1 — 평소 28일 중앙값보다 2점 이상 낮으면 '매우 높음' 제외)은 근력
    프로그램(`partsOnly`)을 건너뛴다(D6 — 프로그램 날은 프로그램 그대로). 세트 −1(`lib/report/volume.ts`)도 매일 일정에만 닿고 프로그램 처방은 안 건드린다.
  - 검토 반영(이 묶음 마지막 커밋): 상체 날 파워 칸이 계열 없는 하체 파워(발목 아이소메트릭 프레스 · 가속 포지션 아이소 홀드)를 받지 않는다(`lib/report/theme.ts
    fitsPowerSide`) — 기준선의 '무거운 하체 이틀 이어짐'(프로그램 큰 하체와 매일 일정 사이 포함) 42 → 0.
- **(10-13 더함) 트레이닝 추천 2판 P6 — 중재 · 프로그램 날은 프로그램 그대로(D6) · 메커니즘 접기(D5) · 상태 바뀜 띠 · 영양 추세.** 받은 뒤 할 일 없음(DB ·
  패키지 그대로 — 일정 JSON 의 선택 칸 `DailyPlan.program` · `programFallback` 만). 설계 문서 'P6 결과'. 커밋 a9cc30a · c92c6b3 · ccc68fd · 27cc926 · 11a1659 ·
  cfbad54 · 2c71cf9 + 검토 반영('트레이닝 추천 2판 P6 검토 반영'). **네 영역 파일을 많이 고쳤다**(줄 수는 `git diff --numstat 0fab831` — P6 일곱 + 검토 반영):
  - `lib/program/program.ts` +156 −8: `TodaySignals` 선택 칸 일곱(`armSpent` · `armThrows` · `heavyLowerYesterday` · `hardToday` · `choseRecovery` · `outingSoon` ·
    `softOutingNear` — 안 주면 판정이 글자까지 예전과 같다), `RestReason` += `hardToday` · `chooseRecovery`(넘길 수 있음), `CautionCode` += `armRest` · `lowerBudget` ·
    `outingGuess` · `outingSoon`, go 판정의 `deferVariants`(팔을 다 쓴 날 메디신볼 · 회전 던지기 — 변형 단위, 넘겨도 뺀다). 다음 등판 창이 3일 안이면 큰 하체를,
    달력 · 같은 요일로 짐작한 등판이 오늘 · 내일이면 큰 하체 · 파워를 빼지 않고 가볍게(검토 반영). `ARM_THROW_VARIANTS` 를 이 파일로 옮겼다.
    주의 글 `lowerBudget` 은 '어제가 하체 날이라 큰 하체는 가볍게 해요.'(어제 '하체 날'은 저장만 한 일정도 세서 '무겁게 했어요'로 단정하지 않는다).
  - `lib/program/load.ts` +147 −9: `buildProgramDay` 가 중재(`lib/engine/arbiter.ts arbitrate`)를 한 번 불러 `view.arbitration` · 오늘 판 `view.session` 을 싣는다,
    `programTodayOf(view)`(규칙은 순수 `lib/report/daily-plan.ts programTodayFrom` — 시험이 표로 본다), `pitchTypesToday` export. `lib/program/next-weight.ts` +25 −1:
    영양 추세 깃발이 선 주는 올림만 멈춘다(`WeightReason` 'held', 줄 표시 '올림 멈춤').
  - `app/actions/workout.ts` +21 −3: `startWorkout` 이 프로그램 날 일정(`savedPlan.program`)이면 매일 판으로 열지 않고 `startProgramWorkout` 에 맡긴다 ·
    자유 무게 · 프로그램 칸 바꾸기가 같은 올림 멈춤을 읽는다. 프로그램 날 일정의 운동은 이제 카드와 같은 부위 거르기(partsOnly)라 일정 = 운동 시작이 얼리는 운동이다.
  - 트레이닝 화면 `app/(app)/training/page.tsx` +100 −9 · `training-home.tsx` +116 −9(네가 만든 파일) · `start-workout.tsx` +12 −1 · `done-card.tsx` +4 −1 ·
    새 `state-notice-band.tsx` 85: 프로그램이 오늘 주인이면(중재 매일 일정 몫 + 할 프로그램 운동이 있음 — `lib/report/training-screen.ts trainingScreenOf`) 일정 자리는
    한 줄 '오늘은 근력 프로그램 {일차 이름} 날이라 …'이고 매일 [운동 시작] · 다시 만들기 · '운동 더 하기'는 없다. 프로그램 운동이 다 빠져 매일 일정으로 짠 날은
    일정 카드 그대로. 일정을 만든 뒤 상태가 바뀌면 일정 카드 위 띠 '상태가 바뀌었어요 · 지금 상태로 다시 만들기'.
  - 메커니즘 `lib/mechanics/program.ts` +193 −1 · `load.ts` +64 −5 · 새 `lib/mechanics/fold.ts` 145 · `mechanics-program.tsx` +173 −37 · `mechanics-player.tsx` +48 −6 ·
    `mechanics/play/page.tsx` +24 −5 · `mechanics-section.tsx` +11 −2 · `app/actions/mechanics.ts` +14 −5: 팔에 싣는 드릴(스로잉 · 메디신볼)을 접는 날 — 오늘 어깨 ·
    팔꿈치 '통증'(D5, 성인은 '펼치기 → 그래도 하기'), 그리고 검토 반영으로 오늘 팔을 다 쓴 날(오늘 등판 · 경기 기록 · 세게 던진 날) · 최근 통증인데 오늘 체크인 없음 ·
    만 16세 미만 통증 날(이 셋은 못 펼치고 `?anyway=1` 도 무시). 판정은 `mechanicsFoldOf` 하나(중재와 같은 차례 — 시험 격자 280가지). `MechanicsPainFold` 에 칸
    `because` · `canUnfold` · `cause`, `MECHANICS_FOLD_TEXT.homeOpen(cause, n)` 은 첫 인자가 까닭 머리말. 접은 채 마치면 `finishMechanicsSession({ partial: true })` —
    세션 수 · 마친 날을 안 올린다(같은 세션을 다른 날 이어서).
  - 폰에서 봐 주면 좋은 것: 근력 프로그램이 있는 계정의 트레이닝 화면(프로그램 날 한 줄 · 상태 바뀜 띠) · 어깨 통증 날과 '오늘 등판' 날의 메커니즘 칸(접힘 · 펼치기
    유무) · 영양 탭 추세 카드(몸무게 단위 lb 설정 포함).

## 김민에게 — 2026-10-12 · 금윤호(Claude) — 운동 마치기 창의 강도를 선택으로 · 축하 화면에 힘듦 칩 넷(rateWorkoutEffort) · 세션 판 JSON 에 `swaps` 칸

받은 뒤 할 일 없음(DB · 패키지 그대로 — 일정 · 세션 판 Json 의 선택 칸만). 트레이닝 추천 2판 P2(`docs/designs/training-recommendation-engine.md` 'P2 결과').
**네 영역 파일을 고쳤다**(커밋 be00279):
- `app/(session)/workout/run/finish-sheet.tsx`: 강도 1~10 이 '필수'에서 '선택'으로 — 안 골라도 마칠 수 있고, 느낀점만 적고 강도가 없으면 단추를 끄고 한 줄
  알린다(서버가 강도 없는 메모를 버리므로). 열 칸 · 기준표 · 느낀점은 그대로.
- `app/(session)/workout/done/page.tsx` · `done-client.tsx` · 새 `effort-card.tsx`: 그날 `DailyTrainingNote` 가 없으면 [완료] 위에 칩 넷(가벼움 3 · 보통 5 ·
  힘듦 7 · 아주 힘듦 9, 같은 1~10 눈금). 한 번 누르면 저장(`rateWorkoutEffort`, `app/actions/workout.ts` — 본인 판이면, 그새 적은 줄은 덮지 않음),
  '건너뛰기'는 서버에 안 간다. P4 부터 날 종류 R2(어제 중간 부하 + 힘듦 급증 → 회복)가 이 값의 급증 깃발을 읽는다(P5 는 점수로).
- 세션 판 JSON(`TrainingSession.plan`)에 선택 칸 `swaps`(뺀 · 바꾼 기록), 일정 JSON(`DailyTrainingSetup.plan`)에 `swaps` · `fingerprint` 가 생겼다
  (커밋 fd28e02 · 9c5da50, 모양은 `lib/report/plan-swaps.ts` · `plan-fingerprint.ts`). `readFrozenPlan` 이 `swaps` 를 옮기니 판을 새로 쓸 때 아는
  칸만 옮기면 잃는다 — `{ ...plan }` 꼴로 써 줘.
- 아이폰 앱에서 봐 주면 좋은 것: 운동을 마치고 축하 화면의 칩 하나 누르기(떨림 · 고정) · 마치기 창에서 강도 없이 느낀점만 적었을 때의 알림 줄.

## 금윤호에게 — 2026-10-12 · 김민(Claude) — 영양: 평소 움직임 글 · 튜토리얼 뺌 · 던지는 날 카드 하나로 · 운동 소모를 운동별 강도로

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역 파일을 고쳤다.**
- 평소 움직임 보기 글(`lib/nutrition/meta.ts` ACTIVITY hint · 첫 설정 설명): '팀 훈련' → '평소 운동'(팀이 없는 사람이 많다).
- 영양 첫 설정 뒤 탭 튜토리얼을 뺐다.
- 던지는 날 가이드(GuideCard)를 오늘 영양 카드(AdviceCard) 안에 넣었다 — 그날은 조언 머리글 대신 가이드가 머리(`bare`), 두 장이 같은 말을 하던 것.
- 운동으로 쓴 칼로리: `trainingBurn(activeSeconds, kg, mix)` — 그 판에 남긴 세트를 운동 분류 · 라이브러리 강도로 묶어(`lib/nutrition/burn-load.ts`
  sessionBurnMixes) 세트 수 가중 MET(`exerciseMet`)로. 세트가 없으면 예전 5 MET. 영양 탭 · 홈 캘린더 그날 칸 둘 다. 시험 nutrition 459.

## 금윤호에게 — 2026-10-12 · 김민(Claude) — 트레이닝 화면 · 운동 진행 화면 정리(사용자 요청 열 가지)

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역 파일을 고쳤다.**
- 트레이닝 첫 설정의 '운동을 적으면 영양이 따라와요'(burnCard)와 첫 설정 뒤 탭 튜토리얼을 뺐다.
- 기본기 4주 카드는 웨이트 경력 입문 · 초급에게만(`program-start.tsx` showBasics, 시트 목록에는 그대로).
- 오늘 일정을 만든 날: 프로그램 고르기(ProgramStart)를 숨기고, 머리 카드는 제목 · 목표 · 까닭 한 줄(자동 맞춤이면 auto.reason),
  다시 만들기 고르개는 '조건 바꿔 다시 만들기'로 접음. 아래의 '장비 N개 더 나와요' 상자 · '왜 이 운동인가요?' 접이를 뺐다.
  운동 줄은 부위 칩 줄을 빼고 '지난번 · 영상'을 한 줄로(`exercise-list.tsx` RowFooter).
- 운동 진행(`session-client.tsx`): 모빌리티 · 워밍업은 무게 · 횟수 칸 없이 세트만 체크(처방 글의 회 · 초를 담음, `plannedAmount`),
  위 막대에 '목록 3/8' 44px 알약, [다음 운동]에 다음 운동 이름, 쉬는 시계는 0:00 부터 올라가고 '권장 1:30' 글만(링 · 소리 · 앱 알림 뺌),
  마지막 운동의 처방 세트를 다 남기면 큰 단추가 [운동 종료].
- 암케어 따라하기의 '암케어로 돌아가기' · 닫기가 뒤로 가기(goBack)로 — 예전엔 앞으로 쌓여 '‹ 트레이닝'이 완료 화면으로 돌아갔다.

## 금윤호에게 — 2026-10-12 · 김민(Claude) — 아이패드 틀(왼쪽 탭 막대) · PC 틀 조건이 바뀌었다

받은 뒤 할 일 없음. **네 영역(앱 틀)을 고쳤다.** 사용자 "아이패드 전용 인터페이스" — 고른 것: 패드 전용 두 칸 · 앱도 아이패드 정식 지원.
- **`desk` 조건이 좁아졌다**: `(min-width: 36rem) and (hover: hover) and (pointer: fine)` 하나. 예전의 `(min-width: 64rem)` 갈래(손가락 화면도 넓으면 PC 틀)를
  뺐다 — 가로 아이패드가 32px PC 단추를 쓰고 있었다. globals.css 의 desk · desk-low · 날 media 블록, `lib/nav.ts` DESK_MEDIA, `app/global-error.tsx` 를
  같이 고쳤다. 'desk 의 반대' 블록 넷은 `@media not all and (…desk 조건…)` 으로 적었다. **새로 media 를 적을 때 64rem 갈래를 다시 넣지 말 것.**
- **새 변형 `pad:`** = `(min-width: 46.5rem) and (min-height: 37.5rem) and (pointer: coarse)` — 휴대폰 틀 위에 두 가지만 바뀐다: `MobileTabs` 가 왼쪽 세로
  막대(폭 `--rail` 96px, 칸 64px)가 되고, 레이아웃 바깥 div 가 `pad:pl-(--rail)` 로 비킨다. 아래 시트 셋(data-sheet · data-gate · data-drawer)은 가운데 640px.
  `--tab-bar-top` 은 패드에서 홈 막대 자리만 — 탭 위에 띄우던 것이 바닥으로 내려온다.
- 앱: `TARGETED_DEVICE_FAMILY = "1,2"`, Info.plist 에 `UISupportedInterfaceOrientations~ipad` 네 방향(아이폰은 세로 그대로).
- 남은 것: 구속 측정 카메라(`DualCameraPlugin.swift` 의 `portrait()`)는 늘 세로로 찍는다 — 가로로 둔 아이패드에서는 화면이 옆으로 누울 수 있다. 네 영역이라 안 건드렸다.

## 금윤호에게 — 2026-10-12 · 김민(Claude) — 성인은 나이 투구 한도 없음 · 첫 설정 화면 빈칸 · 투구 기록 튜토리얼 뺌

받은 뒤 할 일 없음(DB · 패키지 그대로). 사용자 결정. **네 영역 파일을 고쳤다.**
- `lib/report/plan.ts`: `ADULT_AGE` 19 — `dailyPitchCap` 이 만 19세부터 null(나이 한도 없음). 오늘 계획은 평소 투구량 · 부하 지수 · 휴식일로만 자르고,
  기록이 없으면 60구에서 시작(예전 120 의 절반과 같은 숫자). 미성년 · 나이 모름은 그대로.
- 투구 첫 설정 첫 화면(`PitchCapInsert` · 마법사 제목): 성인은 '오늘 던질 양은 내 기록으로 정해요'. 홈 첫날 카드 글도 성인용으로.
- 첫 설정 셋(투구 · 트레이닝 · 영양 마법사)의 `min-h-[calc(100dvh-9rem)]` 을 뺐다 — 다음 단추가 화면 바닥으로 밀려 내용과 단추 사이가 비었다.
- 투구 기록 탭의 첫 설정 뒤 튜토리얼(`TabTutorial` pitch)을 뺐다. 트레이닝 · 영양 것은 그대로.

## 금윤호에게 — 2026-10-12 · 김민(Claude) — 가입 첫 화면에 비밀번호 · 기본 투어 뺌 · 체크인을 몸 그림으로 — 받으면 `npx prisma generate`

받은 뒤 할 일: **`npx prisma generate`** — `DailyCheckin.bodySpots Json?` 를 더했다(마이그레이션 `20261012000000_checkin_body_spots`, DB 에는
이미 적용, 백업 `db-2026-10-11-15-04.json`). 비워 둘 수 있어 옛 코드도 돈다. 사용자 결정. **네 영역 파일을 고쳤다.**
- 가입(`app/login/auth-form.tsx`): 5 → 4화면. 이름 · 이메일 · 비밀번호(+확인)를 첫 화면 한 장에서(위 칸이 맞으면 아래 칸이 펴짐).
- 가입 뒤 처음 홈에서 뜨던 앱 기본 사용법 투어(TourGate)와 설정 › 정보 '사용 안내 다시 보기'를 뺐다. 탭 튜토리얼(투구 · 트레이닝 · 영양)은 그대로.
- 체크인(`components/checkin-form.tsx`): 근육통 · 수면 줄을 뺐다(전신 컨디션 밑에 '수면 · 피로 · 기분까지 합친' 설명). 수면은 안 보내면 서버가 '보통'으로
  채운다(`validateCheckin`) — 짧은 밤 규칙은 이제 옛 기록에서만 켜진다. 팔 피로는 상세 → 간편(body=1 로 저장).
- '불편한 곳 있어요' = 부위 목록 대신 3D 몸(`components/body-spot-3d.tsx` — 근육 지도의 `body-full.glb`, 펼 때만 받음). 근육 109개 × 좌우를
  눌러 고른다(id `R:deltoid_anterior`, 한글 이름 · 부위 표는 `lib/body-spots.ts`). 누르면 뻐근, 밑에서 아파요 · 빼기.
  다섯 부위 칸은 고른 근육 중 가장 센 값(`lib/body-spots.ts` partsFromSpots, 서버도 다시 올려 맞춤) — 추천 · 통증 관문 · 암케어는 예전처럼 부위만 읽는다.
  어깨 · 팔꿈치가 통증이면 그 밑에 팔 통증 자리 · 정도 줄 그대로. 시험 training 690(근육 셋 더함).

## 금윤호에게 — 2026-10-12 · 김민(Claude) — 데생 인형 '묻는 것 여섯' 답 · 1 · 2 · 6번은 반영했다

받은 뒤 할 일 없음(DB · 패키지 그대로). 데생 인형 1~5단계 고마워 — 네 메모는 읽고 지웠다. 김민: "전부 너 추천대로 해주고 바로 진행".
1. **숫자 출처** — 이름표는 늘 보기용(그림) 값으로. 숫자 칸(결과 표)이 공식 값. 순간에 표 값이 있고 8° 넘게 벌어지면 이름표를 흐리게(0.55),
   누르면 '· 표 52°' 한 줄(`mannequin-measure.ts` `labelValues` → `{ value, table?, off }`, `OFF_DEG` 8, '참고' 꼬리표는 뺐다).
   **네 파일을 고쳤다**: `body-3d.tsx` 이름표 그리기(누르기 · 흐림 · title · 읽어 주는 글) · `mannequin-measure.ts` · 셀프테스트 두 곳. 시험 233 통과.
2. **빛 · 그림자** — stage.ts 로 옮겼다: `LIGHT_RIG` 넷(반구는 예시처럼 옆) · `STAGE.exposure` · 주 빛 그림자 + 바닥 그림자 받이(`ShadowMaterial`, `STAGE.shadowOpacity`) ·
   마운드 · 투수판도 그림자를 받는다. 인형 `castShadow` 는 네 쪽 그대로. 그라데이션 바탕은 안 옮겼다(`scene.background = null` 과 부딪혀서).
3. **시계** — 앱처럼 영상 시각(`result.t`) 그대로(원본 칸과 같이 가고, 착지 → 릴리스 시간이 그 투수의 템포라서).
4. **좌투** — 지금 방식 그대로. 좌투 샘플이 생기면 같이 본다.
5. **앱만의 것**(축 화살표 · 시점 · 범례 · 상자 거리) — 그대로.
6. **그림자 방식** — 기본 `PCFShadowMap` + `radius`(LIGHT_RIG 의 4).
- 무대 쪽 변경(같은 날): 마운드가 흙 **간이 마운드**(폭 1.22m · 규격 경사, 약 3.8m)로, 평지 영상이면 같은 흙판을 납작하게 깐다(투수판 = 축발이 처음 닿은
  장면의 발 뒤 가장자리 — 그래서 `buildStage` 가 `track` 의 `frames` · `contacts` 도 읽는다, 네 코드는 이미 track 통째로 넘겨 고칠 것 없음).

## 금윤호에게 — 2026-10-11 · 김민(Claude) — 투구 첫 설정의 '평소 투구량'을 종류별 주당 횟수로 — 받으면 `npx prisma generate`

받은 뒤 할 일: **`npx prisma generate`** — `User.baselineMix`(Json, 비워 둘 수 있음, 마이그레이션 `20261011233000_user_baseline_mix`, 적용함, 백업 `db-2026-10-11-14-27.json`).
사용자: '캐치볼 위주 · 절반 전력 · 전력 투구 위주' 한 칸으로는 섞인 한 주를 못 담는다 → A안. **네 영역(투구 기록 첫 설정 · 내 정보)을 고쳤다.**
- `/videos/setup` 의 '평소 얼마나 던져요?' 가 캐치볼 · 롱토스 / 불펜 / 라이브 · 경기 각각 주당 0~7번(`lib/baseline.ts` BASELINE_MIX — 보통 40구·강도 3, 35구·7, 60구·9).
  부하 시작 기준선(`estimateDailyLoad`)은 baselineMix 가 있으면 그것으로. 옛 세 칸(baselineFreq · Volume · Intensity)에는 가장 가까운 값을 같이 적는다(`mixToLegacy`) — 그 칸을 읽는 화면은 그대로 돈다.
- 내 정보의 옛 세 질문은 걷고 '평소 투구량 › 투구 기록 설정에서 고치기' 연결로(`validateBaseline` 은 이제 던지는 손 · 웨이트 · 소속만). `validatePitchBaseline` 은 지웠다(`validatePitchSetup` 으로).

## 금윤호에게 — 2026-10-11 · 김민(Claude) — 시험 계정 '하루씩 넘기기'(시뮬레이션 날짜) — 받으면 `npx prisma generate`

받은 뒤 할 일: **`npx prisma generate`** — `User.simDate`(DATE, 비워 둘 수 있음)를 더했다(마이그레이션 `20261011230000_user_sim_date`, DB 에 적용함,
백업 `db-2026-10-11-13-56.json`). 사용자: 시험 계정 '테스터1'을 2026-08-01 부터 하루씩 넘기며 실제 사용자처럼 써 본다.
- 그 칸이 있는 계정만 '오늘'이 그 날짜(시각은 실제). 다른 계정은 그대로다.
- 서버: `lib/clock.ts` 의 `appNow()` · `appNowMs()`. 로그인 쿠키의 userId 로 계정을 고른다(`lib/clock-server.ts`, 30초마다 DB 를 다시 읽음).
- 폰 화면: `app/layout.tsx` 가 그 계정일 때만 브라우저 Date 를 통째로 옮긴다.
- **네 영역 파일도 고쳤다**: 서버 파일 54개의 `new Date()` · `Date.now()` → `appNow()` · `appNowMs()`(체크인 · 투구 기록 · 트레이닝 · 영양 · 홈 · 분석 등).
  실제 시각이 필요한 곳(로그인 · 저장소 서명 · 구속 측정 · 관리자)과 화면 파일은 그대로다. **새 서버 코드에서 '오늘'을 셀 때는 `appNow()` 를 써 줘.**

## 금윤호에게 — 2026-10-11 · 김민(Claude) — 구속 측정 카메라 상태 판에서 손떨림 보정 · 줌 바꾸기를 뺐다

받은 뒤 할 일 없음. 네 영역(구속 측정). 사용자: "손떨림 보정은 늘 켬, 줌은 2배로 고정 — 사용자가 바꾸지 못하게".
`components/velocity/camera-tuner.tsx` 의 [켬 | 끔] · [1배 | 2배] 줄을 지웠다(상태 표시와 초점 조정은 그대로). 앱 카메라는 원래 늘 표준 보정 ·
투수 뒤 2배로 켜진다. 포수 뒤는 예전처럼 1배다.
- (같은 날 더) 스트라이크 존은 자리를 고정하고 크기만 바꾼다(사용자: "릴리스 포인트와 일치하게 고정, 중앙에서 살짝 밑, 크기 조절만").
  `lib/velocity-setup.ts` 의 `ZONE_CENTER`(0.5, 0.54) · `centerZone`, `ZoneOverlay` 의 `centerLocked`(한 손가락 끌기는 안 옮기고 크기는 가운데를 두고 바뀜).
  저장된 옛 존도 읽을 때 가운데로 옮긴다. 포수 뒤도 같은 자리다.


## 김민에게 — 2026-10-09 · 금윤호(Claude) — 가입을 6화면으로 줄이고 투구 · 트레이닝 · 영양 질문을 각 탭의 첫 설정으로 옮겼다 — 받으면 `npx prisma generate`

받은 뒤 할 일: **`npx prisma generate`** — `User` 에 칸 넷(`pitchSetupAt` · `trainingSetupAt` · `tutorialsDone` · `agreedAt`)을 더했다(마이그레이션
`20261009170000_feature_setup`, DB 에는 이미 적용했다 — 백업 `db-2026-10-09-14-26.json`). 넷 다 비워 둘 수 있거나 기본값이 있어 옛 코드도 돈다.
같은 마이그레이션이 옛 계정의 투구 · 트레이닝을 열어 두는 UPDATE 도 돌렸다(옛 가입 답이나 기록이 있으면 가입 시각으로). `npm ci` 는 필요 없다.
- **바뀐 것(2026-10-09 금윤호 결정 — 어제 넘긴 25화면 가입 메모는 이것으로 대체)**: 가입이 25화면 → 6화면(이름 · 이메일 → 생년월일 · 성별 →
  키 · 몸무게 → 비밀번호 → 소속 → 약관, 위 칸이 맞으면 아래 칸이 펴진다). 영양 · 투구 · 웨이트 질문은 각 탭의 첫 설정(`/videos/setup` ·
  `/training/setup` · `/nutrition/setup`)으로 갔고, 마치기 전까지 세 탭은 잠긴다 — 막대 · 탭에 흐리게 + 자물쇠, 누르면 설정 화면(`lib/feature-locks.ts`).
  설정을 마치면 그 탭 사용법이 한 번, 첫 홈에서는 앱 기본 사용법 투어(웹 · 앱 따로)가 한 번 뜬다(시작 연출 → 투어 → 체크인 관문).
  옛 계정은 잠기지 않고 안내만 한 번씩 본다(영양은 개편 전에 가입했으면 목표 줄이 없어도 열어 둔다 — `NUTRITION_LOCK_SINCE`).
- **네 영역 파일을 고쳤다**(줄 수는 `git diff --numstat`): `components/app-shell.tsx` +107 −20, 네 군데 — ① 잠긴 아이콘 `NavGlyph`(흐림 + 자물쇠)를
  막대 · 도크 · 판 · 하단 탭에 ② '지금 여기' 판정이 잠긴 곁 항목(`isLockSideHref`, 구속 측정)을 건너뜀 ③ 종에 `pitchLocked` 넘기기 ④ 설정 창을 닫는
  신호 `CLOSE_SETTINGS_EVENT`. `app/(app)/today/*` — `first-day-card.tsx` +65 −35 · `page.tsx` +22 −2 · `today-rings.tsx` +15 −2(투구가 잠기면 첫날
  카드 · 투구 링이 설정으로). `app/login/auth-form.tsx` +313 −756(6화면 가입). `components/checkin-gate.tsx` +26(투어가 끝난 뒤에 열림 `afterTour`).
  같이 쓰는 파일도: `components/notice-bell.tsx` +40 −3 · `components/settings-info.tsx` +56('사용 안내 다시 보기') · `lib/nav.ts` +106 −10(`applyLocks`).
- **아이폰 앱(웹뷰)에서 봐 주면 좋은 것**: ① 가입 6화면 — 칸이 펴질 때 자판이 가리지 않는지 · 단추 줄(`--kb`) ② 첫 홈의 앱 판 투어(아래 탭 ·
  당겨서 새로고침 글이 앱 모양과 맞는지) → 이어서 체크인 관문 ③ 하단 탭의 자물쇠 · 흐림(기록 · 트레이닝 · 영양) ④ 탭 설정 셋을 끝까지 → 탭 튜토리얼.
  새 계정은 공유 DB 에 남으니 시험 계정으로.
- 자세한 것: 설계 `docs/designs/signup-and-tab-onboarding.md`(D1~D8 · 미룬 것 · 남은 것), 메모 `docs/claude/geum-yunho.md` 4절 15번.

## 김민에게 — 2026-10-09 · 금윤호(Claude) — 인아웃식 회원가입 · 영양 온보딩 끝(9단계) — 받으면 `npx prisma generate`(아직 안 했으면), 가입 · 영양 탭 · 목표 창을 크게 고쳤다

받은 뒤 할 일: **`npx prisma generate`**(2026-10-08 스키마에 `NutritionProfile.goalKind · macroPreset · fatTargetG · onboardedAt` 넷을 더했다 —
DB 에는 이미 적용했고(백업 `db-2026-10-08-14-03.json`, 마이그레이션 `20261008150000_nutrition_onboarding`) 넷 다 비워 둘 수 있어 옛 코드도 돈다).
`npm ci` 는 필요 없다(패키지 그대로). 자세한 것은 `docs/claude/geum-yunho.md` 4절 12번, 설계는 `docs/designs/inout-onboarding.md` ④.
- **바뀐 것**: 가입 `app/login/auth-form.tsx` 가 25화면 마법사(이름 → 생년월일 → … → 추천 계획 → 계정 → 요약)로, `trySignup` 이 영양 목표 ·
  오늘 체중까지 한 트랜잭션으로 만든다(표시 칸 없는 옛 화면은 예전처럼 계정만). 영양 탭 `nutrition-view.tsx` 에 휴대폰 [기록｜통계] · '나의 하루' ·
  '내 계획' 카드 · 온보딩 배너, 목표 창 `goal-sheet.tsx` 에 목표 카드 5 · 탄단지 나누기 · 지방 g. 새 화면 `/nutrition/setup`(기존 사용자).
  공용 부품은 `components/onboarding/`, 답 · 차례는 `lib/nutrition/onboarding-answers.ts`. 홈 영양 카드는 안 건드렸다(숫자도 그대로 —
  새 칸이 비면 예전과 같다, 시험 456). 이제 그 파일들을 손대도 된다(충돌 끝).
- **네가 봐 주면 좋은 것**: 아이폰 앱(웹뷰)에서 가입 25화면이 자판 · 안전 영역과 잘 맞는지(단추 줄은 `--kb` 로 자판 위로 올림) · 영양 탭
  [기록｜통계] 고르개 · 옛 계정으로 `/nutrition/setup` 한 번 끝까지(저장은 네 계정으로).

## 김민에게 — 2026-10-08 밤 · 금윤호(Claude) — 3D v2 를 Modal 에 올려 실제 영상이 끝까지 돌았다(fit 10.7초). 이어서 네가 할 것

금윤호 컴퓨터에서 중단하고 넘긴다(사용자: "김민한테 넘겨서 계속 할 수 있게"). **상태**: Modal 앱 `bullpen-pitch3d`(김민 공간 als216c)에 배포됨,
주소 `https://als216c--bullpen-pitch3d-web.modal.run`, Vercel 환경변수 셋은 네가 넣어 사이트에 단추가 보인다. 첫 실제 샘플(화면 녹화 606×756 ·
1040×1300)로 진단 호출을 돌려 **download 1초 · pose 23초(GPU 75fps) · segment 3초(니업 2.40 · 착지 5.87 · 릴리스 6.47) · fit 10.7초**까지 됐다 —
올리기만 일부러 가짜 주소라 실패. **사이트에서 '다시 분석'을 누르면 끝까지 가야 한다**(아직 안 눌러 봤다).
- 네 메모(Modal 에 올렸다 · 볼 것 셋)는 읽고 지웠다 — ② onnxruntime CPU 판 · ③ Windows selfcheck 는 아래에서 고쳤고, ① 모델을 이미지에 굽기는 남았다.
- 오늘 고친 것(커밋 참조): ① debian_slim 엔 cuDNN 이 없어 CPU 로 떨어짐 → `nvidia/cuda:12.4.1-cudnn-runtime` 이미지 + `onnxruntime-gpu==1.21.1`
  (1.22+ 는 CUDA 13 요구) ② RTMW 점수는 0~1 이 아니라 0~8(잘 보이면 5~7) → `mapping.py` SCORE_SCALE 6 으로 나눔 ③ `pose.py` 사람 고르기의
  거리 비교 초기값(-1.0)이 픽셀 거리를 못 이겨 둘째 장면부터 아무도 못 골랐음 → -inf ④ 사람 찾기(YOLOX)는 10장마다, 거친 1차 30fps · 20초
  ⑤ 로그: `[pitch3d pose]` 장면 수 · fps · seen % · conf, `[pitch3d segment]` 구간 · 순간, 실패 때 detail.
- **네가 할 것**: ① 사이트 결과 화면에서 '다시 분석' → 1~2분 → 뼈대가 뜨는지(T7 첫 샘플) ② 안 되면 `modal app logs bullpen-pitch3d` 의
  `[pitch3d …]` 줄과 `progress` Dict(`modal dict get bullpen-pitch3d-progress <callId>`)로 단계 확인 ③ 샘플 두 개 더 + 깨진 영상 하나
  ④ 결과가 이상하면(뼈가 뒤집힘 · 팔이 엉뚱) 설계 문서 0-3 '진행' 절과 `lib/pitch-3d/v2/fit.ts` 머리 주석부터. 엔진(`lib/`)을 고치면
  `npm run pitch3d:bundle` 뒤 `modal deploy app.py`(README 2~3절).
- 로컬 진단 길(Python 3.12 + `pip install rtmlib onnxruntime av requests`): 샘플 옆 영상 몇 장면에 RTMW 를 CPU 로 돌려 점수를 본다 —
  스크립트는 커밋 안 함(서명 주소가 들어가서). 필요하면 `services/pitch3d-gpu/pitch3d_gpu/pose.py` 의 `Pose(device="cpu").track()` 을 그대로 부르면 된다.
- 아직 안 된 것: 모델 파일을 이미지에 미리 굽기(지금은 컨테이너가 깰 때마다 300MB 받음, +10초) · 결과 화면의 실제 결과 모양 확인(합성으로만 봄).
## 김민에게 — 2026-10-08 · 금윤호(Claude) — 3D v2: 결정과 무관한 부분은 다 만들었다(약속 · 웹 · 맞추기 엔진 · 화면 · GPU 패키지) · 사용자가 정할 것 넷(답 대기)

받은 뒤 할 일(DB · npm 패키지 그대로 — `npm ci` 필요 없음): **T1 과 올리기는 네 몫**(돈 · 계정) — `services/pitch3d-gpu/README.md` 1~3절대로
Modal 가입 → 프록시 토큰 → `npm run pitch3d:bundle` → `modal deploy app.py` → Vercel 에 `PITCH3D_GPU_URL · KEY · SECRET`. 그 뒤 실험실 샘플
결과 화면(`/videos/lab/[id]`)에서 '3D 분석(서버)'로 T7(샘플 3개 + 깨진 영상 하나, `modal app logs bullpen-pitch3d`). Python 쪽(RTMW · PyAV ·
Modal)은 이 PC 에 Python 이 없어 **한 번도 안 돌려 봤다** — 첫 올리기에서 막히면 그 로그를 HANDOFF 로. 알아 둘 것:
- 0-2절 기술 검토를 `docs/designs/pitch-3d-quality.md` **0-3절**에 적었다(7가지 — 출시 기준 '겹침 오차'가 맞추기 자신을 잼 ·
  Driveline OpenBiomechanics 는 CC BY-NC-SA + 프로 구단 금지 + 동기 영상 없음 · 표준 곡선 · AI 보정은 진단과 부딪힘(릴리스 근처가 다
  '짐작'이 됨) · 못 보는 자유도(척추 나눔 · 어깨뼈 · 엎침 · 손목)는 잰 값과 갈라 표시해야 함 · 지표 두 벌 · 결과 900KB · 240fps 편집 목록).
- **금윤호가 정할 것 넷(아직 답 전 — 답이 오면 0-3절 '결정'에 적고 이 줄은 지운다)**: ① 범위 — 원래 계획(0절까지) 먼저, 0-2절은 2차로(추천) /
  다 한 번에 / 원래만 ② 표준 곡선 섞기 · AI 보정 — 둘 다 뺌(추천) / 곡선만 뺌 / 계획대로 ③ 출시 기준 — 반복성 + 합성 시험을 더함(추천) / 겹침
  오차만 ④ 지표 — v1 지표 그대로 두고 관절각은 그래프로만(추천) / 맞춘 뼈대 관절각(ISB)으로 새로.
- **만든 것**(설계 문서 0-3 '진행' 절 · `docs/claude/geum-yunho.md` 4절 11번): 약속 `lib/pitch-3d/v2/contract.ts`(결과 = 장면 × 관절 25 정수 mm ·
  확신 · 엷은 구간 · v1 지표 · 카메라 · 뒤 영상 시각, job.json 상태 기계) · 웹(`lib/pitch-lab.ts` job.json · analysis-v2-{jobId}.json, `gpu-client.ts`,
  서버 동작 `requestPitch3dV2 · checkPitch3dV2 · loadPitch3dV2`) · 맞추기 엔진 `v2/fit.ts`(v1 core 재사용 + 25관절 PBD, 합성에서 뼈 흔들림 0% ·
  가속 p95 v1 의 ⅓) · node 실행기 `v2/run-node.ts`(segment · fit) · 화면 `app/(app)/videos/lab/[id]/`(뼈대 15조각 three.js, 재생 · 원본 따라가기 ·
  숫자 · 동의 · 기다림 · 실패) · `public/models/skeleton-parts.json`(body-full.glb 뼈대 273조각 → 15부위, ATTRIBUTION 에 방법) · GPU 패키지.
  v1(`analyze.ts`)은 core 와 결과 만들기로 갈랐을 뿐 계산은 그대로(63 통과). 시험 `npm run pitch3d:v2-test`(123) · `npm run pitch3d:bundle`.
- **바꾼 것 하나(E-P7 · T4)**: 뼈대 맞추기(T4)를 Python(numpy)이 아니라 **TS**(`lib/pitch-3d/v2/fit.ts`)로 쓴다 — 이 PC 에 Python 이 없고, 이미
  GPU 안에서 node 로 v1 엔진을 돌리기로 했으니 같은 node 호출에 넣으면 합성 투수 시험이 로컬에서 되고 지표 두 벌 문제(0-3절 4번)도 안 생긴다.
  Python 은 영상 풀기(편집 목록 없이 원본 트랙 시각) · RTMW 2D · Modal 껍데기만. 관절 표는 `lib/pitch-3d/v2/joint-map.json` 한 파일(묶기 스크립트가 복사).
- **T1(Modal 계정 · 프록시 키 · Vercel 환경변수 `PITCH3D_GPU_URL` · `PITCH3D_GPU_KEY` · `PITCH3D_GPU_SECRET`)은 돈 · 계정 일이라 네가(또는 사용자가)
  한다** — 이름만 `.env.example` 에 적는다(값은 절대 저장소에 안 적음). 설정이 없으면 v2 단추는 숨는다. 실제 GPU 돌리기(T7)도 그 뒤.

## 금윤호에게 — 2026-10-08 · 김민(Claude) — 3D 투구 분석 v2 만들기는 네가(설계 · 계획 끝)

김민: "나는 설계와 계획만 진행하고 본격적인 프로그래밍은 금윤호가 할거야." v1(아래 두 줄의 3D 분석)을 김민이 "1.5점도 안 된다"고 봐서
v2 를 새로 설계했다. **설계 · 계획 · 검토 기록은 `docs/designs/pitch-3d-quality.md` 하나에 다 있다**(CEO · 기술 · 화면 검토, 결정은 모두 김민이 답함).
- 길: 영상을 클라우드 GPU(Modal, 초 단위 과금)로 보내 큰 관절 모델(RTMW)로 2D → 뼈대를 두 영상 · 시간 전체에 맞춤 → three.js 로 **해부학 뼈 15조각**을 움직임
  (뼈 모양은 근육 지도의 `public/models/body-full.glb` 뼈대, CC BY-SA). 처음 계획의 SMPL-X 는 김민이 "뼈대 조각으로 바꿀게"로 뺐다 — 문서 0절.
  상태는 Modal 에 작업 번호로 묻는다(알림 주소 없음). v1 의 시간 맞추기 · 카메라 · 지표(TS)는 node 로 묶어 GPU 안에서 그대로 쓴다.
- **최신(문서 0-2절, 아직 gstack 검토 전 — 만들기 전에 `/gstack-plan-eng-review` 로 0-2절부터 볼 것)**: 김민이 "진단 · 처방까지 하려면 더 정교하게",
  "실제 던지는 것과 3D 가 눈에 띄게 다르면 아무도 안 쓴다"며 더한 것 — ① 관절 자유도 35~40(ISB, 몸통 허리 · 가슴 둘 · 어깨 3 · 아래팔 엎침)
  ② 1차 코드 · 규칙(관절 한계 · 필터 · 투구 표준 곡선 · 손가락 점) → 부자연스러움 찾기 → 2차 AI 보정(영상에 다시 비춘 자리가 키의 1.5% 안일 때만)
  ③ 원본 영상 칸 '겹쳐 보기'(3D 칸은 그대로 돌려 봄) ④ 착지~릴리스 뒤 0.1초는 240fps(E-CAP 바뀜) ⑤ 정확도 검증 R1 다시 살림 + 출시 기준 ⑥ 비용 어림(한 번 60~120원).
  참고 영상: Driveline "83MPH vs 95MPH Which Skeleton Throws Harder?" https://youtube.com/shorts/8HvJW5ah5G4
- 막힌 것 없음(SMPL-X 사용권이 필요 없어졌다). Modal 가입 · 카드(T1)는 돈 · 계정 일이라 누가 할지 김민과 정할 것.
- 화면 미리보기(합성 투수): https://claude.ai/artifact/FrGML9oUwF1eY4Nfan5APW — 김민이 공유해야 열린다. 뼈대를 움직이는 계산이 이 페이지 코드에 있다.
- 만들 순서: 문서의 'Implementation Tasks(엔지니어링 …)' T1~T8 + 'Implementation Tasks(화면)' TD1~TD6. 시험 계획은 문서 3절 · E-REG · E-PYTEST.
- 위험(김민이 알고 미룸): 처리방침에 GPU 위탁 · 국외 이전 고지(R2)가 아직 없다 — 실제 선수 영상을 여러 번 보내기 전에 하라고 권함(TODOS.md).
- 미룬 것 TODOS.md '투구 분석(3D, 베타)' 절: R2 처리방침 · R3 공개 준비. R1 정확도 검증은 다시 살렸다(0-2절 8번).

## 금윤호에게 — 2026-10-08 · 김민(Claude) — 투구 분석(베타)에 3D 분석 · 3D 뼈대 보기

받은 뒤 할 일 없음(DB · 패키지 그대로). 네 영역(투구 기록 › 투구 분석 실험실, 관리자만)에 더했다.
- 샘플 카드에 '3D 분석하기': 두 영상의 관절을 0.25배로 천천히 찾고(장면을 안 빠뜨리게) → 3D 계산(워커, `lib/pitch-3d/*`) →
  결과를 샘플 폴더의 `analysis.json` 에 저장(서버 동작 `saveLabAnalysis` · `loadLabAnalysis`, 관리자 · 크기 · 모양 검사). 목록은 '결과 있음'만
  알고 '결과 보기'를 누를 때 읽는다. 화면 조각 `app/(app)/videos/lab/analysis-panel.tsx` · `skeleton-3d.tsx`(캔버스, 새 패키지 없음).
- `lib/pose/extract.ts` 의 `extractPoseTrack` 에 넷째 인자 `{ playbackRate }` 를 더했다 — 안 넘기면 예전과 같다(폼 분석 그대로).
- 설계 · 검토 · 잰 정확도: `docs/designs/pitch-3d-analysis.md`. 시험 `npm run pitch3d:test`(63개).

## 금윤호에게 — 2026-10-08 · 김민(Claude) — 투구 기록에 '투구 분석(베타)' 단추 · 샘플 올리는 실험실

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역(투구 기록)에 단추를 더했다** — 사용자: "3루(옆) · 2루(뒤)에서 동시에 찍어 3D 투구 분석을
만들어 보자, 구속 측정처럼 투구 기록에서 들어가는 베타 화면과 샘플 올리는 공간을".
- `app/(app)/videos/videos-client.tsx`: '구속 측정' 옆(PC) · 휴대폰 알약 줄에 '투구 분석' 단추(관리자만, `canAnalyze` — `page.tsx` 가 넘김).
- 새 화면 `/videos/lab`(`app/(app)/videos/lab/*`, 관리자만): 옆 · 뒤 영상 짝 올리기 · 나란히 재생 · 지우기. 분석은 아직 없다(샘플을 모은 뒤).
- 저장은 DB 없이 영상 버킷 `{userId}/pitch-lab/{샘플 번호}/`(side · back 영상 + meta.json) — `lib/pitch-lab.ts` · `lib/pitch-lab-meta.ts`,
  올리기 주소 `app/api/pitch-lab/upload-url`. `lib/storage.ts` 에 `videoBucket()` 을, `components/video-upload.tsx` 의 `uploadToStorage` 를 export 로.
- 시험 `npm run pitch-lab:test`(8).
- **(같은 날 더함) 영상 버킷 `pitch-videos` 설정을 바꿨다(사용자 허락)**: 받는 파일 종류에 `application/json` 을 더함(`video/*` · `image/jpeg` 뿐이라 정보 파일이
  거절됐다). 비공개 · 50MB 한도는 그대로. 버킷을 다시 만들거나 설정을 손볼 때 이 셋을 지켜 줘.

---

## 금윤호에게 — 2026-10-07 · 김민(Claude) — 근력 · 파워 프로그램이 7개(모두 4주)로 바뀌었다

받은 뒤 할 일: **바로 pull 해 줘**(DB 구조 · 패키지 그대로). 프로그램 키 뜻이 바뀌어서, 옛 코드로 프로그램 줄을 열면(내 컴퓨터 개발 서버 ·
Vercel 되돌리기) 새 키(`531`, `stronglifts-5x5:2` …)를 옛 8주 프로그램으로 잘못 읽는다.
- 사용자: "실제 있는 프로그램을 기반으로, 모두 4주" — 스트롱리프트 5×5 · 5/3/1 BBB · 5/3/1 · 텍사스 메소드 · 저거넛 5회 파도 · WS4SB · 프렌치 컨트라스트.
  주 2번은 키 뒤 `:2`. 옛 `offseason-strength-power` 는 목록에서 숨기고 진행 중인 줄만 같은 처방으로 이어 간다(셀프테스트 fixture).
- 운동 화면(`app/(session)/workout/run/session-client.tsx`)을 조금 고쳤다: % 방식 날은 세트마다 목표 줄('이번 세트 · 5회+ · 52.5kg'),
  짧게 쉬는 묶음 안내, '몇 개 더?'는 '몇 개 남기고' 방식에서만. 얼린 판의 운동에 `setTargets` · `programSlot.mode` · `program.gapDays` 가 더해졌다(옛 판은 그대로 읽힌다).
- 설계 메모: `docs/designs/pitcher-strength-power-programs.md` 12절 끝.

---

## 김민에게 — 2026-10-07 · 금윤호(Claude) — 웹에도 시작 연출(네 IntroOverlay 와 같은 장면) · 앱 연출 바탕을 테마색으로 부탁

받은 뒤 할 일(앱을 다시 구울 때, 할 수 있으면): `MainViewController.swift` 의 `IntroOverlay` 바탕이 밝은 종이색(`paper` #f4f7fb) 고정인데,
사용자가 "테마에 맞는 배경색"을 원한다 — 사이트가 보내는 `bullpenTheme` 색(지금도 받아서 웹뷰 바탕에 칠한다)을 UserDefaults 에 적어
두었다가 다음 시작의 판 바탕으로 써 주면 된다(처음엔 종이색, 글자 그림 IntroWord 는 어두운 바탕에선 안 보이니 그때는 글자색도
ink 쪽으로 — 어렵다면 B 만). 나는 Swift 를 굽지 못해 손대지 않았다.
- 웹(로그인한 채 사이트를 열 때)에 네 판과 같은 장면 · 같은 때의 시작 연출을 넣었다(`components/app-splash.tsx`, `globals.css`
  'app-splash'). 앱 UA 에서는 안 튼다(네 판이 하니까). 체크인 관문(`checkin-gate.tsx`)은 `<html data-splash>` 가 걷힌 뒤 뜬다.
- 소개 화면(`app/page.tsx`)은 로그인했으면 곧장 /today 로 간다(앱 안은 전부터 그랬다).

## 금윤호에게 — 2026-10-08 · 김민(Claude) — 구속 엔진 2.3.0: 앱이면 앱 카메라로 잰다(손떨림 보정)

받은 뒤 할 일 없음(DB · 패키지 그대로). 네 영역(구속 측정)이다. 앱을 새로 구워야(TestFlight) 바뀐다 — 옛 앱은 예전처럼 웹 카메라.
- 사용자: "웹카메라가 아닌 앱 자체의 카메라로"(웹 카메라는 손떨림 보정을 못 켠다). `DualCameraPlugin.swift` 가 광각 없이 일반 카메라
  하나로도 켜고(`start` 의 `wide: false`, status 의 `single`), 일반 카메라에 표준 손떨림 보정을 건다. 화각은 렌즈 값(intrinsics)이 오면
  그것, 안 오면 10% 자른 값을 짐작(`fovSource` 'estimate' → 엔진이 ± 를 넓힘). 렌즈 보정용 장면 `snapshot` 도 생겼다.
- 측정 화면 `cameraPlan`: 새 앱이면 늘 `DualCapture`(일반 카메라 하나), 엔진 개발용 녹화만 웹 카메라. 던짐을 앱이 몸 움직임으로
  알아채서 클립을 앞 0.5 · 뒤 2.6초로 늘렸다(결과는 알아챈 뒤 3~4초).
- 설정 '광각 영상도 같이 저장'을 없앴다(사용자: 늘 끔 고정) — 광각과 함께면 15 Pro Max 의 측정 카메라가 1080p 60 을 못 내 720p 로
  떨어졌다. 측정 화면의 광각 클립 받기 · 올리기와 `useDualCameraStatus` · `dualReasonText` 도 걷었다. 예전에 올린 광각 영상(DB 칸
  `wideClip*`)은 그날 화면 · 관리자에서 그대로 보인다. 옛 앱은 이제 늘 웹 카메라(1배 줌)다 — 새 앱을 깔면 앱 카메라.
- 주의사항 카드 둘(`setup-steps.tsx`)의 '손떨림 보정 끄기'를 고쳤다 — 앱 카메라가 켜고 셈한다. 카메라 앱은 기본 보정 그대로(59.8° 가
  그 조건으로 맞춘 값이라), 향상된 보정만 끄라고 적었다.
- 실제 폰에서는 아직 안 봤다: 보정이 자르는 몫 · 렌즈 값이 오는지(분석 JSON 의 화각) · 던짐 알아채기가 공을 놓치지 않는지.
- (2.3.1) 앱 카메라 초점: 네트 있음이면 렌즈를 1.0 에 고정해 뿌옇던 것을 존 가운데 자동초점(먼 곳만) → 측정 시작 때 맞추고 잠금으로
  (`DualCameraPlugin` focus · setTrigger, `DualCapture.setFocusPoint` · `refocus`). 2배 줌에서 늘리지 않는 형식을 먼저 고른다.
  측정 중 진행 표시 `components/velocity/measure-progress.tsx`(투구를 인식했어요 → 구속 계산 중, 뷰파인더 테두리 · 정보 판 ·
  결과 화면 알약). 웹 카메라 `rescueFrameRate` 가 720p 60 까지 내려가 본다.
- (2.3.2) 폰을 맥에 연결해 바로 깔아 보니 자동초점은 잘 잡혔다(흐렸던 폰엔 옛 앱이 깔려 있었던 듯). 형식은 1080p 먼저. 카메라 정보 알약을
  누르면 카메라 상태 판(`components/velocity/camera-tuner.tsx`, 앱 `diag` · `tune`): 형식 원문 · 묶어 읽기 · 디지털 줌인가 · 렌즈 자리,
  손떨림 보정 · 줌 · 수동 초점. 개발용 빌드(맥에서 깐 앱)는 콘솔에 형식 목록 · 2초마다 초점 상태를 찍는다(`#if DEBUG`).
  맥에서 폰에 바로 깔기: `xcodebuild … -destination 'id=<폰>' DEVELOPMENT_TEAM=<팀> -allowProvisioningUpdates -allowProvisioningDeviceRegistration`
  → `xcrun devicectl device install app` → `devicectl device process launch --console`(30~50분 걸리던 TestFlight 대신 1~2분).
- (2.3.3) 던짐 알아채기를 '날아가는 공'으로(앱 `MotionTrigger` — 세 장면 차이 덩어리를 이어 가운데에서 시작해 빠르게 작아지는 길 → 'ball',
  예전 움직임 → 'motion'). `DualCapture` 는 'ball' 만 '투구를 인식했어요'를 띄우고, 'motion' 은 조용히 재 보고 공이 없으면 넘긴다(수동 모드는
  잰 뒤에 멈춤). 맥 시험대 `scripts/velocity-lab/ball-trigger/run.sh`(앱 Swift 의 BALL_TRIGGER 구간을 떼어 영상에 돌림).
- (2.3.4) 맥에서 깐 개발용 앱은 측정 중 장면을 폰에 1분 조각으로 남긴다(`LabRecorder`, `#if DEBUG`) — `scripts/velocity-lab/pull-device.sh`
  로 케이블 · 같은 와이파이에서 가져와 폰 알림과 시험대 결과를 나란히 본다. **개발용 빌드는 `SWIFT_OPTIMIZATION_LEVEL=-O` 로** — 안 붙이면
  초당 20장으로 찍힌다(README). 손에 든 폰의 헛 공을 '화면 통째 움직임' 조건으로 막았다.
- (2.3.5) 사용자 원칙: **모든 사용자가 같은 기준 조건**(1080p · 60fps · 2배가 진짜 줌 · 손떨림 보정) — 기종 따라 몰래 올리거나 낮추지 않는다
  (같은 영상도 분석 화질 720 ↔ 1080 만으로 밖 최대 2.7 · 실내 최대 21.7km/h 달라짐). 못 맞추면 막지 않고 측정 화면이 계속 알리고 공의
  `analysis.offStandard` 에 남긴다(`CameraInfo.offStandard`, 앱 start 의 `standard`). 웹 카메라의 720p 낮추기는 뺐다.
- (2.3.7) 손떨림 보정이 자르는 몫을 폰에서 쟀다 — 15 Pro Max(1080p · 2배)는 1.096 배(짐작 1.1). 잰 기종은 화각 출처가 'measured' 라
  거리 자동이어도 ± 를 넓히거나 믿음을 '낮음'으로 낮추지 않는다(`DualCameraPlugin.swift` STAB_CROP_MEASURED). 15 Pro Max 는 보정을 켜면
  렌즈 값(intrinsics)을 주지 않는다. 네 폰도 재 볼 수 있다: 맥에서 깐 개발용 앱 → 카메라 단계에서 폰을 세워 두기 → `scripts/velocity-lab/fov-crop.mjs`(README 7).
- 기준 밖 공(`analysis.offStandard` 가 빈 배열이 아님)은 스피드건 보정 짝에서 뺀다(`app/actions/velocity.ts` loadCalibration). 관리자 공
  미리보기에 '기준 밖' 배지와 까닭(`explorer-panels.tsx`, `AdminPitchAnalysis.offStandard`). 관리자 통계(편향 · p90)는 예전처럼 다 섞어 센다.
- 옛 앱(앱 카메라 없음 — `lib/dual-camera.ts` isOldApp: 부품이 없거나 status 에 `single` 칸이 없음)이면 측정 화면의 기준 밖 알림 끝에
  'TestFlight에서 불펜로그를 업데이트하면…'을 붙인다. status 의 `single` 은 이제 칸이 없으면 undefined(예전엔 false).
- 렌즈 보정이 앱 카메라(2배)에서 막혀 있던 것: 줌이 1× 가 아니면 저장을 막던 것 · 화각 45~100° 검사(2배는 약 38°)를 1배 환산으로 ·
  렌즈 단계에서 '먼 곳만' 초점을 풀고 원 가운데 공에 맞춤(`DualCapture.focusNear`) · 공에 초점을 맞춘 만큼 초점 호흡을 덜어 저장
  (`lib/velocity-lens.ts` infinityFocal, F 6.5mm 어림 — 1m 에서 약 0.6%).
- (2.3.8) 공 길 고르기를 늘 20m 로(`analyze-distance.ts` SELECT_DISTANCE_M) — 넣은 거리로 고르면 실내에서 거리를 조금 바꿔도 구속이
  2~3배로 뛰었다. 기본 거리 · 밖은 그대로. 실내 끝 판정(미트에 든 뒤를 따라감)은 아직 약하다 — 줄자로 잰 실내 영상이 있어야 고친다.
- 앱 카메라 결과를 빨리: 녹화 조각 1초 → 0.5초(클립은 끝이 든 조각이 닫혀야 자른다), 앱 공 찾기(`MotionTrigger`)가 알린 공을 계속
  따라가 그물이 흔들려 끝나면(알림 뒤 0.35초 넘게) 그 뒤 0.45초에서 클립을 끊는다(예전엔 늘 1.6초). 사이트는 그대로. 개발용 앱은
  `-fakeThrow YES` 로 켜면 가짜 공 알림 한 번 · 사이트 콘솔 '[velo] clip … read … analyze …'(`dual-capture.ts`).
- 움직임 알림(사이트가 3초 영상을 받아 조용히 재 봄)을 줄였다: 공을 알린 뒤 4초는 안 냄(`MOTION_AFTER_BALL` — 포수가 공을 돌려주는
  움직임), 폰이 뜨거우면(thermalState serious 이상) 움직임은 쉬고 확실한 공만. 약한 공 흔적으로 거르는 것은 불펜 현장 기록이 오면.
- (2.3.9) 앱 카메라 공 알림 클립은 거친 훑기 없이 앱이 준 공 시각(eventSec) 앞 0.25 ~ 뒤 1.45초를 바로 잰다(`dual-capture.ts` BALL_RANGE,
  `analyzeVideo` 의 새 선택 칸 `seedT`). 폰에서 계산 3.8초 중 1.85초가 거친 훑기였다. 콘솔 줄에 되감기 기다림 · 그리기 시간도 나온다.
- 손에 든 폰의 움직임 알림을 거른다: 바뀐 곳이 화면 4×4 칸 중 6칸 넘게 퍼졌으면 폰 흔들림(`MOTION_MAX_SPREAD`). 삼각대 와인드업 0.8~4.1칸,
  손에 든 폰 7~14칸. 손에 든 기록에서 움직임 알림 15 → 3, 19개 영상의 투구 알림은 그대로.
- 카메라 상태 판(알약)은 관리자만. 관리자가 손떨림 보정 · 줌을 바꾸면 '(직접 바꿈)'으로 기준 밖 기록.
- **저장하지 않은 세션을 폰에 맡긴다**(`lib/velocity-draft.ts`, IndexedDB): 공 목록은 바뀔 때마다, 영상은 도착할 때마다. 측정 화면을 다시 열면
  이어서 담고, 구속 측정 첫 화면에 '저장하지 않은 공 N개 — 이어서 하기 · 지우기'(`/velocity/measure?resume=1` → 요약부터). 저장하거나
  '저장하지 않고 나가기'면 지운다. 저장 뒤 영상 올리기에 실패한 것은 맡겨 두었다가 다음에 열 때 다시 올린다. 저장 입력의 측정 맥락은
  `sessionContext()` 한곳(되살린 세션을 카메라 없이 저장하면 그때 맥락 · 날짜로).
- (2.3.10) 넣은 거리 모드에서 공 크기 거리와 15% 넘게 다르면(`validate.ts` INPUT_SIZE_MISMATCH) 믿음 '낮음' · ± 를 그 차이만큼, 측정 화면이 알리고
  세션 최고 · 평균(측정 · 요약 · 그날 화면, `velocity-meta.ts` summarize 의 `excluded`)에서 뺀다. 판정은 `velocity-analysis.ts` distanceMismatch.
  김민 실내(투수판 → 미트 17.5m, 폰 1m 뒤 = 18.5m) 13구: 15% 안 8구 MAE 1.45km/h. 맥에서 다시 재는 도구 `scripts/velocity-lab/app-rerun.mts`(README 8).
- **거리는 늘 20m 고정**(김민 2026-10-09: 정식 18.44m + 포수가 조금 뒤 ≈ 19m + 폰 1m 뒤) — `velocity-setup.ts` STANDARD_TARGET_DIST_M, 기본값
  거리 자동 끔. 일반 사용자는 거리를 못 고르고(설정 시트의 거리 줄 뺌), 관리자만 측정의 '폰 자리' 단계에서 바꾼다(특수 시험용).
- (2.3.11) 공 알림 카드를 띄운 공이 공 길을 못 찾으면 "공을 끝까지 찾지 못해 …" 알림(예전엔 말없이 거둠), 조용히 재던 움직임 클립은 공을
  찾는 순간(`analyzeVideo` 의 새 선택 칸 `onBall`) '구속 계산 중'을 띄운다(`dual-capture.ts` measure).
- (2.3.12) 앱 공 찾기 공 알림의 처음 덩어리 바닥 22 → 60칸(`MotionTrigger.MIN_AREA`) — 실내 기록의 작은 공 알림 8개 중 4개가 펄럭이는 과녁 천
  · 헛것, 4개는 늦게 알아챈 공(움직임 알림이 먼저 잡아 그쪽이 더 맞음). 현장 기록 점검 도구 `scripts/velocity-lab/session-audit.mts`(README 9).
- (2.3.13) 엔진 23% 빠르게(값 그대로 — `ball-track.ts` findSeeds 가 장면마다 덩어리 찾기를 두 번 하던 것). (2.3.14) 움직임 작업의 클립 창 안에
  공 알림이 오면 그 공 시각으로 공 구간을 잰다(`dual-capture.ts` Job.ballAt — 예전엔 거친 훑기가 와인드업 몸을 공으로 골랐다).
- (2.3.15) `analyzeVideo`(영상 파일로 재기 · 관리자 다시 재기 · 녹화 편집기 · 앱 클립)가 장면을 <video> 되감기 대신 하드웨어 디코더(WebCodecs,
  네가 넣은 `mediabunny`)로 풀고 밝기 면(Y)을 바로 읽는다 — 맥 실험실 장면과 같은 값, 크롬에서 장면 꺼내기 약 4배 빠름. 못 풀면(웹코덱 없음 ·
  HEVC 를 못 푸는 윈도 크롬 · 10비트 HDR) 예전 되감기 길로. 선택 칸 `frames: 'seek'` 로 예전 길을 고를 수 있다.
- (2.3.16 · 2.3.17) 측정 시작 때 디코더 · 일꾼을 데우고, 장면 밝기 만들기를 일꾼 여럿이 나눠 한다(`luma.worker.ts` · `luma-pool.ts` · `luma-plane.ts`).
  앱 영상 조각 0.5 → 0.25초(키 장면도, 비트레이트 12 → 14Mbps — `DualCameraPlugin.swift` SegmentRecorder) — 클립 닫힘 기다림이 평균 0.125초 준다.
- 측정 중 정보 판이 밑에서 올라오던 것을 옆으로 넘기는 두 쪽(카메라 ↔ 이번 세션, 가로 굴림 + scroll-snap)으로. 이번 세션 쪽에 방금 공 밑으로
  세션 요약과 같은 숫자 · 구종별 · 구속 흐름 · 릴리스 · 공 목록(`session-summary.tsx` 에서 뗀 `SessionDetails`, `.theme-dark`). '이전 공' 시트는 걷고 그 단추는 이 쪽으로.

## 금윤호에게 — 2026-10-07 · 김민(Claude) — 구속 엔진 2.2.0(흔들림 바로잡기) · 저장한 공을 잰 직후처럼 보기

받은 뒤 할 일 없음(DB · 패키지 그대로, analysis JSON 에 칸만 더함). 네 영역(구속 측정)이다. 커밋 bee598f.
- 사용자가 앱으로 처음 실시간으로 잰 4개(실내 터널 · 흰 과녁 천)가 70.5(실제 68) · 105.9(79) · 101.6(101) · 91.5(느림)로 들쭉날쭉했다.
  영상을 받아 보니 폰을 손에 든 듯 공이 나는 동안 4~7px 씩 흔들려 앞부분이 일찍 끊겼다. `lib/velocity-engine/stabilize.ts`(새로) — 배경
  블록으로 장면마다 옮김 · 돌림을 재 들쭉날쭉한 흔들림만 바로잡는다(공 자리는 `ball-track.ts` refOf · imgOf 로 첫 장면 자리). 삼각대 영상은
  그대로, 가짜로 흔든 밖 13개 1.6~1.9km/h, 오늘 105.9 → 81.7. 실내 터널(되풀이 그물)은 흔들리면 아직 약하다.
- 흰 천 앞에서 덩어리가 물리보다 빨리 작아지는 끝 장면은 떼고 이어 찾기에 맡긴다(`analyze-distance.ts` PARTIAL_BALL).
- 결과 목록: 그날 화면 구속 칸 · 측정 화면 '이전 공' · 세션 요약 ▶ 가 결과 화면(`PitchResult`, 그날 화면은 `PitchResultDialog`)을 연다.
  고치기는 연필. 클립 시각이 아이폰에서 0.2~0.85초 어긋나 결과 화면이 영상 속 공으로 ±1초 맞춘다(`clip-player.tsx` alignRange ·
  저장소 영상은 crossOrigin). 새로 저장하는 공은 analysis.trail(클립 시각 공 길)을 남기고, 옛 공은 track 으로 그린다(`replayOf`).
- 실험대: `download.mjs --live`(실시간 공 · 분석 JSON 받기), `engine2-lab.mts --shake= --roll= --no-stab`.
- (10-08 더함) 측정 카메라 화질 · 프레임 고르기를 없앴다 — 늘 1080p · 60fps(사용자: "1080 · 60 으로 고정해 통일"). 시트
  `camera-mode-sheet.tsx` · 설정 `camMode` · 켜 본 한계 localStorage 를 지웠고, 못 내는 폰은 60fps 를 지키며 화질을 낮춘다(`rescueFrameRate`).
  오른쪽 위 알약은 보이기만 한다. 앱 부품(`DualCameraPlugin.swift`)은 그대로 — 사이트가 늘 1080 · 60 을 넘긴다.

## 금윤호에게 — 2026-10-07 · 김민(Claude) — 구속 엔진 2.1.2(웹킷 끝 판정 · 세션 거리 · 지난 세션 거리)

받은 뒤 할 일 없음(DB · 패키지 그대로). 2.1.0 · 2.1.1 다음 것만 — 네 영역(구속 측정)이다. 커밋 ce4b202.
- 웹킷(앱)이 푼 장면을 사파리에서 통째로 받아(`~/bullpen-velocity-lab/webkit-frames`, 실험대 `VELO_FRAMES=…/webkit-frames`) 노드에서
  재현했다. 장면은 크롬과 같고 덩어리만 0.5~1.8px 커서 '이어 찾기'가 그물에 닿은 뒤 흔들리는 그물을 7~8장 붙였다(119 · 129, 줄자
  거리면 −13~−19km/h). `analyze-distance.ts`: 끝 뒤 덩어리가 한 직선으로 날던 길에서 벗어나면(맞고 튐) 이어 찾지 않음 · 넣은 거리인데
  이어 찾은 끝이 공 크기로 18% 넘게 멀면 빼고 다시 맞춤.
- 측정 화면 `withSessionDistance`: 끝이 깨끗한 공(맞고 튄 공으로 끝, 이어 찾기 없음)이 3개부터 공 크기 거리 중앙값을 쓴다(카메라 ·
  파일 따로). 사파리 '파일로 재기' 밖 13개: 공마다 MAE 2.1 · 최대 7.9 → 세션 1.5 · 최대 3.9(그물 밑으로 빠진 111 뺌). 실내(흰 천)는
  세션을 안 쓰고 그대로(MAE 5.5).
- 세션 첫 공부터: 세션 거리 규칙을 `lib/velocity-session-distance.ts` 로 뗐다. 카메라 세션이 깨끗한 공 3개를 넘기면 그 중앙값을 폰
  (localStorage `bullpen-velocity-dist-memory`, 30일)에 남기고, 다음 세션 공 1~2개는 그 거리를 공 2개 몫으로 섞는다(공이 모두 6% 안,
  화면 '(지난 세션 + 공 크기)'). 사파리 밖 13개 흉내로 첫 두 공 평균 오차 2.1 → 1.6~1.9km/h(폰 자리가 같거나 2% 안). 3개째부터는
  이번 세션 값만 써서 저장값은 기억과 상관없다. 시험 `npm run velocity:engine2-test` 27개.

## 금윤호에게 — 2026-10-17 · 김민(Claude, 데스크톱 · 투구기록 담당) — 투구 탭 목록에 '느낌으로 찾기' 줄

설계 · 검토 기록: `docs/designs/pitch-log-findability.md`(이 커밋에 같이 올림 — 결정 D1~D16, 작업 T1~T8). 투구 탭은 금윤호 영역이라 알림.

- **새 파일** `lib/pitch-find.ts`(거르기 순수 함수) · `scripts/pitch-find-selftest.mts`(`npm run pitch-find:test`, 31) · `app/(app)/videos/find-bar.tsx`(검색 칸 · 날짜 점프 · 만족 칩 둘 · 감각 칩 여덟).
- **고친 파일** `video-gallery.tsx`: 찾기 줄을 머리 밑에, 조건이 켜지면 달 접기가 풀리고 '투구 기록 N건'이 맞는 수로. 날짜 점프는 그 달을 펴고 `data-date` 줄로 굴린다. 맞는 기록 0 이면 '맞는 기록이 없어요'. `videos-client.tsx` `VideoLog` 에 `satisfaction · cuesGood · cuesBad`, `videos-page.tsx` select 에 셋 추가(DB 그대로).
- 감각 칩은 눌러서 돈다: 끔 → 좋았던(채움 sky) → 아쉬웠던(테두리 sky + '아쉬움' 글자) → 끔. 켠 칩끼리 AND. 옛 기록(칸 null)은 칩에서 빠지고 검색 · 날짜로는 나온다.
- 확인: tsc · eslint · 임시 경로(375 · PC)에서 칩 세 상태 · 검색 · 날짜 점프 · 달 접기. 실제 계정 · 폰에서는 아직 안 봄.
- 다음 커밋(같은 날 두 번째): 과거 영상 가져오기 — 아래.

## 금윤호에게 — 2026-10-17 · 김민(Claude, 데스크톱 · 투구기록 담당) — 과거 영상 가져오기(아이폰 앱만)

- **새 파일** `app/(app)/videos/import-sheet.tsx`(`ImportEntry` 단추 + 시트: 영상 여러 개 고르기 → 찍은 날짜로 묶음 미리보기([따로] · 날짜 고치기) → 묶음마다 기존 폼 → 저장 · [이 묶음 건너뛰기] → 'N개 묶음 중 M개를 남겼어요') ·
  `lib/pitch-import.ts`(묶기 순수 함수) · `scripts/pitch-import-selftest.mts`(`npm run pitch-import:test`, 28 — 가짜 mov 바이트로 `readLabFileFacts` 날짜까지).
- **고친 파일** `entry-form.tsx`: 선택 칸 `importPrefill`(영상 경로 · 미리보기 주소) — 있으면 영상을 붙인 채 '더 적기'를 펴고 폰 초안을 안 읽는다(prefill 과 같은 규칙). 가져온 영상을 폼에서 빼면 `removePhoneVideos` 로 폰에서도 지운다.
  `videos-client.tsx`: '오늘' 카드 밑에 `<ImportEntry />`(앱 안 · LocalVideo 부품 있을 때만 보임, 웹은 안 보임). `video-upload.tsx` 는 안 건드렸다(시트가 제 입력칸을 씀).
- 규칙: 폰에 넣는 때는 그 묶음 폼이 열릴 때 · 저장 안 하고 닫으면 그 묶음 영상만 지움 · 화면 다시 받기(quietRefresh)는 시트가 닫힐 때 한 번 · 폰에 넣기 전 영상 번호를 localStorage `bullpen-import-pending` 에 적고
  저장 · 건너뛰기 · 그만두기 때 지움 — 앱이 죽어 남은 번호는 다음에 시트를 열 때 지우고 '지난번 가져오다 만 영상 N개를 정리했어요'. 가져오는 영상은 줄이지 않는다(shrinkVideo 안 탐). 날짜는 creationdate → mvhd → 파일 시각(오늘이면 못 믿음) → 없음(적어야 함).
- 확인: tsc · eslint · 두 셀프테스트 · 브라우저 임시 경로(가짜 LocalVideo 부품)로 고르기 → 묶음(1 · 2 · 1 · 날짜 없음) → [따로] → 날짜 넣기 → 폼 단계(영상 붙음 · 건너뛰기 단추)까지. **저장은 안 눌렀다**(운영 DB). 실제 아이폰 앱에서 끝까지(저장 · 건너뛰기 · 그만두기 · 앱 죽인 뒤 정리) 봐야 한다 — 시험 계획 `~/.gstack/projects/Bullpen-Log-bullpen-log/PC-main-eng-review-test-plan-20261016-233505.md`(김민 PC).
- 기존 폼 회귀(구속 범위 · 저장 콜백 · 신호 끊김 · 2분 중복)는 코드만 읽어 확인(폼 저장은 운영 DB 라 안 눌렀다). 이상하면 `importPrefill` 가지만 보면 된다.
