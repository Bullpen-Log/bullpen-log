# 3D 투구 분석 v2 — GPU 함수(Modal)

실험실(관리자, `/videos/lab/[id]`)의 '3D 분석(서버)'가 부르는 클라우드 GPU 함수. 설계 · 결정은
`docs/designs/pitch-3d-quality.md`(0절 뼈대 15조각 · 기술 D1 상태 묻기 · E-P7 TS 엔진 재사용 · E-CAP 600장 · 0-3절 검토).

```
사이트 서버(app/actions/pitch-lab.ts)
  POST {URL}/jobs  ──▶  web()  ──spawn──▶  analyze(job)  [GPU]
  GET  {URL}/jobs/{callId}  ◀── progress[callId]        │
                                                        │ 1 영상 둘 받기(서명 주소, 1시간)
                                                        │ 2 2D 관절 133점(RTMW, rtmlib) — 거친 60fps 전체
                                                        │ 3 node engine/run-node.ts segment → 투구 구간(옆 · 뒤)
                                                        │ 4 2D 관절 — 구간만 120fps(≤ 600장)
                                                        │ 5 node engine/run-node.ts fit → analysis-v2 JSON(시간 맞추기 · 카메라 · 뼈대 맞추기 · 지표 · 모양 검사)
                                                        └ 6 결과 PUT(서명 올리기 주소, 1회용) → 저장소 {userId}/pitch-lab/{id}/analysis-v2-{jobId}.json
```

- 계산의 원본은 TS(`lib/pitch-3d`, `lib/pitch-3d/v2`)다. Python 은 영상 풀기 · 2D 관절 · 차례 · Modal 껍데기만. 관절 표도 `lib/pitch-3d/v2/joint-map.json` 하나.
- 저장소 키를 여기 두지 않는다 — 영상은 서명 주소로 받고 결과는 서명 올리기 주소로 올린다. 영상은 임시 폴더에만, 함수가 끝나면 지워진다.
- 상태는 작업 번호(FunctionCall id)로만 묻는다(알림 주소 없음). 15분 넘으면 웹 쪽이 timeout 으로 돌린다.

## 1. 한 번만 — 계정 · 키(T1, 김민 또는 사용자)

1. Modal 가입 · 카드(https://modal.com) → `pip install modal` → `modal setup`(브라우저 로그인).
2. Modal 대시보드 › Settings › Proxy Auth Tokens 에서 토큰 하나 → **Token ID · Token Secret** 을 적어 둔다(값은 저장소 · 메모에 적지 않는다).
3. Vercel 환경변수 셋(이름은 `.env.example`): `PITCH3D_GPU_URL`(3절의 주소) · `PITCH3D_GPU_KEY`(Token ID) · `PITCH3D_GPU_SECRET`(Token Secret).
   셋이 다 있어야 실험실에 단추가 보인다. 비우면 단추가 숨고 v1(기기 안 분석)만 된다.

## 2. 올리기 전 — 엔진 묶기

```bash
npm run pitch3d:bundle
```

`lib/pitch-3d` · `lib/pose` · `lib/pitch-3d/v2` 를 `services/pitch3d-gpu/engine/` 으로 복사하고 `@/` 를 상대 경로로 바꾼 뒤, 합성 투수 하나를
묶음 실행기(node, 타입 벗기기)와 앱 엔진 둘로 돌려 결과 JSON 이 같은지 본다(E-P7 의 '같은 2D → 같은 결과'). `engine/` 은 git 에 올리지 않는다
— 엔진(`lib/`)을 고쳤으면 다시 묶고 다시 올린다.

## 3. 올리기

```bash
cd services/pitch3d-gpu
modal deploy app.py
```

끝에 찍히는 `web` 주소(`https://<workspace>--bullpen-pitch3d-web.modal.run`)가 `PITCH3D_GPU_URL`. 처음 한 번 `modal run app.py::warm` 으로
모델을 받아 두면 첫 분석의 +30초가 준다. GPU 는 기본 L4(`PITCH3D_GPU` 로 바꿈), 함수 시간 상한 15분.

## 4. 점검

```bash
python -m pitch3d_gpu.selfcheck       # 관절 표 · 구간 셈 · 엔진 입력 모양 · (node 가 있으면) 묶음 실행기 — GPU · 모델 · 영상 없이
```

실제 영상 끝까지(T7)는 Modal 에서: 실험실에 샘플을 올리고 결과 화면의 '3D 분석(서버)' → 1~2분 → 뼈대. `modal app logs bullpen-pitch3d` 로
단계 시간(download · pose · segment · fit · upload)과 실패 까닭을 본다. 깨진 영상 하나로 `failed{video}` 가 나오는지도.

## 5. 약속(사이트 ↔ 함수)

`POST /jobs` 본문(`lib/pitch-3d/v2/gpu-client.ts` GpuJobRequest):

```json
{ "jobId": "uuid", "engine": "2.0.0",
  "side": { "url": "서명 주소" }, "back": { "url": "서명 주소" },
  "meta": { "hand": "R", "slowmoFps": null, "screenRecorded": false, "heightCm": 183 },
  "result": { "uploadUrl": "서명 올리기 주소(토큰 포함)" } }
```

→ `{ "callId": "fc-…" }`. `GET /jobs/{callId}` → `{ "status": "pending|running|done|failed", "stage": "download|pose|segment|fit|upload", "stages": { "download": 4.2 }, "code": "video|short|events|sync|range|calibration|fit|upload|internal" }`.
결과 파일 모양 · 실패 코드 · 900KB 상한은 `lib/pitch-3d/v2/contract.ts` 가 원본(실패도 결과 모양으로 올린다 — 화면이 한 길로 읽는다).

## 6. 비용 · 시간(어림)

L4 초 단위 과금. 받기 5~10초 · 2D(거친 60fps 두 영상 ≈ 700장 + 구간 120fps ≈ 1,000장) 40~80초 · 맞추기(node) 5~10초 · 올리기 수 초 · 첫 시작
+20~40초 → 1.5~3분, 한 번 50~100원. Modal 무료 크레딧 안이면 0원.

## 7. 로컬 개발(Python 없는 PC)

이 패키지는 Modal 안에서만 돈다. 로컬에서는 `npm run pitch3d:v2-test`(엔진 · 합성 투수 · 뼈대 자세)와 `npm run pitch3d:bundle`(묶음 실행기)로
TS 쪽을 확인하고, Python 은 Modal 에 올려 `modal app logs` 로 본다. Python 이 있는 PC 라면 `python -m pitch3d_gpu.selfcheck`.
