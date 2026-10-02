# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 김민에게 — 2026-10-03 · 금윤호(Claude) — DB 표 3개 추가(엔진 개발용 녹화) · 관리자 단추가 제어 센터로

받은 뒤 할 일: `npx prisma generate` 하고 개발 서버를 다시 켠다(백업 뒤 DB 에 이미 적용 — 마이그레이션
`20261003120000_velocity_recording`, 새 표만이라 네 코드는 그대로 돈다).

- 새 표 `VelocityRecording` · `VelocityRecordingPart` · `VelocityRecordingCut` — 관리자가 측정 없이 찍은 원본 영상(30초 조각, 3초 겹침)과
  공별 범위 · 스피드건 값. User 와 관계는 안 걸었다(VelocityCalibRun 처럼 userId 만) — User 모델은 안 건드렸다.
- 측정 화면 왼쪽 관리자 단추를 누르면 아이폰 제어 센터처럼 [화면 이동] · [관리자 설정] 타일이 뜬다. 관리자 설정의 '엔진 개발용 녹화'를
  켜면 측정 대기 화면의 시작 단추가 빨간 녹화 단추가 된다(조각은 `lib/velocity-recorder.ts`, 서버 `app/actions/velocity-recording.ts`).
  일반 설정의 '정확도 보정용 저장(관리자)'는 관리자 설정으로 옮겼다.
- `app/api/pitch-log/discard/route.ts` 가 녹화 조각 경로도 '쓰는 중'으로 본다.
- 찍은 녹화는 구속 측정 관리자 머리의 '엔진 개발용 녹화' 단추 → 목록 → 편집기에서 공마다 범위를 잡고 스피드건 값을 적어 지금 모델로
  다시 잰다(`app/(app)/admin/velocity/recordings/`). 밖에서 안 잡힌 공들의 까닭을 같이 보자.

## 김민에게 — 2026-10-03 · 금윤호(Claude) — DualCamera 부품 고침: 기기 검사 · 화질 고르기 · 30fps 안 씀

받은 뒤 할 일 없음(앱을 굽는 쪽만 바뀜). `mobile/ios/App/App/DualCameraPlugin.swift` 만 고쳤다 — `status()` 가 고를 수 있는 화질
(`modes`)과 '함께 켤 때 60fps 를 못 냄'(`reason: 'fps'`)을 알려 주고, `start()` 가 `short`(짧은 변 화질)를 받고, 두 카메라가 버거우면
일반 카메라를 30fps 로 떨어뜨리는 대신 광각부터 줄인다(사용자: 측정 카메라는 30프레임 이하 금지). 사이트 쪽은 구속 측정 화면 오른쪽 위
카메라 정보를 누르면 화질 · 프레임을 고르고, 동시 촬영을 못 하는 아이폰은 설정 칸이 잠긴다.

## 김민에게 — 2026-10-03 · 금윤호(Claude) — 앱(mobile/ios)에 부품 하나 더함: 일반 · 광각 동시 촬영

받은 뒤 할 일 없음(앱을 굽는 쪽만 바뀜). 네 앱 틀을 건드렸다 — 새 파일 `mobile/ios/App/App/DualCameraPlugin.swift`(Capacitor 부품
'DualCamera', AVCaptureMultiCamSession), `project.pbxproj` 에 그 파일 등록(Sources), `MainViewController.capacitorDidLoad` 에
`bridge?.registerPluginInstance(DualCameraPlugin())` 한 줄. 사이트가 부르기 전에는 아무것도 안 한다(카메라를 켜지 않는다).
맥이 없어 컴파일을 못 해 봤다 — 올리면 `ios.yml` 이 굽는다. 실패하면 금윤호가 고친다.

## 김민에게 — 2026-10-03 · 금윤호(Claude) — DB 칸 정리(옛 성별 칸 지움 · 광각 영상 칸 추가) · 구속 측정 정리 · /more 지움 · 약관 시행일

받은 뒤 할 일: `npx prisma generate` 하고 개발 서버를 다시 켠다(백업 뒤 DB 에 이미 적용 — 마이그레이션
`20261003100000_drop_nutrition_profile_sex` · `20261003100100_velocity_wide_clip`).

- **`NutritionProfile.sex` 를 지웠다**(2단계까지 끝 — 아래 줄은 지난 설명). **`VelocityPitch` 에 광각 영상 칸 다섯 개**(`wideClipPath` ·
  `wideClipBytes` · `wideClipSec` · `wideClipMime` · `wideClipEventSec`, 다 비울 수 있음 — 추가만). 설정 '광각 영상도 같이 저장':
  아이폰 앱이 일반 · 광각을 함께 찍으면 공마다 광각 영상도 남긴다(측정은 일반 카메라). 웹은 카메라를 하나만 켤 수 있어 **앱에
  'DualCamera' 부품(Swift, AVCaptureMultiCamSession)이 들어가야 실제로 찍힌다** — 금윤호가 다음 단계로 `mobile/ios` 에 만든다(네 앱 틀을
  건드리게 된다, 그때 다시 적음). `app/api/pitch-log/discard/route.ts` 가 광각 영상 경로도 '쓰는 중'으로 본다.

- **`NutritionProfile.sex` 를 지운다 — 두 단계**(금윤호가 정함, 백업 뒤). 1단계(이번): 스키마에서만 뺐다 — DB 칸은 그대로라
  네 코드는 그대로 돈다. 2단계: 이 코드가 배포된 뒤 금윤호가 `DROP COLUMN "sex"` 마이그레이션을 따로 올린다(값은 이미 `User.sex` 와
  같아 옮길 것 없음). **그 사이 네가 `migrate diff` 를 돌리면 `ALTER TABLE "NutritionProfile" DROP COLUMN "sex";` 가 따라 나온다 —
  그 줄은 빼고 써 줘**(2단계가 올라오면 더는 안 나온다). 2단계가 올라온 뒤에도 받고 `npx prisma generate` 한 번.
- **구속 측정**(네가 찾은 ①~④, 금윤호가 정함): 타구 측정을 통째로 뺐다(설정 흐름 다섯 단계, DB 의 mode 칸은 늘 'pitch') ·
  '스피드건 보정 적용'을 끄면 카메라 값 그대로 저장(`SaveSessionInput.useCal`) · 그날 화면의 릴리스도 세션 보정식으로 ·
  mph 사용자는 ± · 건 · 카메라 값 · 스피드건 칸까지 mph · **영상 클립은 보정용 저장과 상관없이 모든 세션에서 올린다**
  (`createClipUpload` · `attachClip` 의 보정용 검사를 뺐다). 네가 고친 `app/actions/velocity.ts` · `pitch-editor.tsx` ·
  `velocity-section.tsx` 를 건드렸다 — e1060c3.
- `/more` 화면을 지웠다(`app/(app)/more/page.tsx`, `lib/nav.ts` 의 `moreGroups`) — 그 주소는 `next.config.ts` 가 홈으로 보낸다.
  하단 '더보기' 탭(사이드바 열기)은 그대로. 약관 · 개인정보 처리방침 시행일을 2026년 10월 3일로(보호책임자 이름은 아직 빈칸) — c76f59b.

## 김민에게 — 2026-10-02 · 금윤호(Claude) — 급함: AI 비용 회의 요청 · 홈 분석 · 영양 사진 AI 멈춤

**Claude 에게: 김민이 작업을 시작하면 다른 일보다 먼저 이 항목을 알리고, 아래 '물어볼 것'을 김민에게 꼭 물어라.**

금윤호: AI 는 쓸 때마다 우리 돈이 나가서, 어디에 얼마나 쓸지 둘이 회의로 정하자. 정리는 **`docs/ai-usage.md`** —
AI 를 부르는 곳 셋 · 지금까지 쓴 양(리포트 10번 ≈ 360원) · 사람이 늘 때 비용 · 지금 구조의 빈틈 · 회의에서 정할 것 다섯.

- **회의 전까지 금윤호가 끈 것**: 홈 → 분석의 리포트, 영양 사진 기록. 스위치는 새 파일 `lib/ai/features.ts` 의 `AI_FEATURES`.
  리포트 쪽은 네 영역 파일을 조금 고쳤다 — `app/actions/ai-report.ts`(맨 앞에서 막음) · `app/(app)/coach/ai-report-card.tsx`
  (`paused` 프롭, 꺼졌을 때 '잠시 멈췄어요' 문구) · `app/(app)/today/analysis-view.tsx`(판을 넘김). 지난 리포트는 그대로 보인다.
- **물어볼 것 — 트레이닝 'AI 맞춤'은 네 담당이라 안 건드렸다. 지금도 AI(`claude-sonnet-5`)를 부른다**(한 사람 하루 5번까지,
  `lib/ai/auto-setup.ts`). 회의 전까지 끌지 그대로 둘지 금윤호에게 답해 줘. 끄려면 `askAutoSetup` 맨 앞에서 판을 보게 하면 된다
  (`docs/ai-usage.md` 6절).
- 같이 알아 둘 것: `AI_MODEL` 을 `claude-sonnet-5-5` · `claude-opus-5-5` 로 바꾸면 트레이닝 호출의 `thinking: { type: 'disabled' }`
  가 오류(400)가 되어 AI 맞춤이 늘 규칙대로 간다(4절 4번).

## 김민에게 — 2026-10-02 · 금윤호(Claude) — 음식 출처에 'barcode' 가 생김(DB 구조는 그대로)

받은 뒤 할 일 없음. 영양 로드맵 8번(바코드로 담기)으로 `MealEntry.source` · `UserFood.source` 에 `'barcode'`(열쇠는 바코드 숫자)가
들어올 수 있다 — 글자 칸이라 DB 는 안 바뀐다. 출처 목록은 `lib/nutrition/meta.ts` 의 `ENTRY_SOURCES` 한곳으로 모았다. 캘린더 그날 칸처럼
출처를 읽는 곳이 있으면 모르는 값도 받게 해 줘(`SOURCE_LABEL.barcode` = '바코드').

## 김민에게 — 2026-10-02 · 금윤호(Claude) — DB 칸 추가(DailyNutrition.photoCalls) · 영양 사진 기록(꺼 둠)

받은 뒤 할 일: `npx prisma generate`. `DailyNutrition` 에 `photoCalls Int @default(0)` 한 칸(마이그레이션
`20261002120000_nutrition_photo_calls`, 백업 뒤 DB 에 이미 적용 — 추가만이라 네 코드는 그대로 돈다).

- 영양 로드맵 7번 사진 기록 코드가 들어왔지만 **AI 회의 전까지 꺼져 있다**(`lib/ai/features.ts` 의 nutritionPhoto). 켜지면 하루
  30번까지 이 칸으로 센다. 이 칸만 있는 줄은 체중이 비어 있다 — 체중을 읽는 곳은 모두 weightKg 가 있는 줄만 본다.

## 김민에게 — 2026-10-02 · 금윤호(Claude) — 공용 확인 창을 밖에서도 쓰게 · 구속 측정의 영어 확인창 · 진동 · 팝업 링크

받은 뒤 할 일 없음. 네가 짚어 준 것(10-01 '애플처럼' 메모)을 고쳤고, 그러느라 공용 부품 하나를 건드렸다.

- `components/confirm-delete.tsx` — 안에서만 쓰던 `ConfirmDialog` 를 `export` 하고 `pendingLabel`(기본 '지우는 중…')만 더했다.
  `ConfirmDelete` · `ConfirmDeleteForm` 은 그대로. 열고 닫기를 부르는 쪽이 쥐는 확인(나가기처럼)에 쓴다.
- 구속 측정: 측정 나가기 · 그날 화면의 공 · 세션 지우기의 `window.confirm` → `ConfirmDialog`(앱의 영어 Cancel/OK 없앰),
  `navigator.vibrate` → `buzz`. 관리자 화면(웹)의 `window.confirm` 은 웹에서 한글로 떠서 그대로 뒀다.
- `/velocity` 최근 세션 · 측정 뒤 '기록 보기' → `/pitch-log/<날짜>` 는 일반 이동(`<a>`)으로 — (app) 밖에서 오면 팝업 경로가 가로채
  빈 화면 위에 팝업이 뜨던 것.
