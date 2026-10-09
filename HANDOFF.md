# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

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

