# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

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

## 김민에게 — 2026-10-13 · 금윤호(Claude) — 구속 앱 카메라: 셔터 상한 1/500 · 되면 120fps(엔진 2.4.2) — 받으면 TestFlight 빌드

받은 뒤 할 일: **TestFlight(또는 맥 개발 빌드)** — `mobile/ios/App/App/DualCameraPlugin.swift` 를 고쳤다(내 영역이지만 Swift 는 윈도우에서 못 구워 눈으로만 확인).
- `apply`: 자동 노출 + `activeMaxExposureDuration` 1/500초(모양 범위 안으로), `stop` 에서 `.invalid` 로 되돌림. `Config.preferFps`(사이트가 120 을 청함) →
  `pick(prefer:)` 가 같은 넓이 · 같은 선명함 · 같은 묶음 읽기인 모양 가운데 120 을 내는 것이 있을 때만 그것으로. `onFps` 에 셔터 · ISO 두 칸 더함
  (`notifyListeners("fps", … "shutter" · "iso")`).
- 빌드가 안 되면(타입 · API) 알려 줘 — 고칠 자리는 위 셋뿐이다. 되면 관리자 세션 정보 기기 글에 '셔터 1/500' · fps 120 이 찍히는지 봐 줘.
- 까닭 · 남은 일: `docs/velocity/engine-2.4-plan.md` 8절.


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

