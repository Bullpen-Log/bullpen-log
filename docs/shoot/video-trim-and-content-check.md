# 촬영 영상 다듬기 · 내용 맞추기 · 전체 검토 — 작업 절차

2026-10-17~18 김민의 트레이닝 세션이 처음 한 일을 그대로 되풀이할 수 있게 적었다. 도구는 `scripts/shoot-trim/`.
결과 예: 10-17 영상 170개 → 52개 다듬음(8899e0ec), 직접 찍은 영상 271개 점검 → 내용 43개 · 제목 4개 고침(5886ff9b · aefe20f9).

## 0. 준비

- Python 3.12: `py -3.12 -m pip install av opencv-python pillow numpy rtmlib onnxruntime`(맥은 `python3.12 -m pip …`, 아래 `py -3.12` 를 `python3.12` 로).
  사람 상자 모델(YOLOX-tiny)은 처음 돌릴 때 rtmlib 가 내려받는다.
- `.env` 의 `DATABASE_URL` · `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY`.
- 윈도 콘솔은 `export PYTHONIOENCODING=utf-8`(cp949 로 한글 출력이 깨지며 멈춘다).
- 작업 폴더는 저장소 밖(`~/bullpen-shoot-trim/…`). 공용 폴더에서는 자기 파일만 add 한다.
- **운영 DB 를 바꾸기 전에는 늘 `npm run backup`**, 바꾼 뒤 `lib/library-cache.ts` 의 `library:exercises:vN` 을 하나 올린다.

## 1. 영상 다듬기 — 앞뒤 빈 시간 · 작은 사람

사용자 규칙: 시범 동작 앞뒤로 아무것도 안 하는 시간이 **2초 넘으면** 자른다(동작 앞 0.6초 · 뒤 0.8초만 남김). 사람이 화면에서 **너무 작으면**
(남긴 구간의 사람 상자가 화면 높이 · 너비의 60% 밑) 16:9 그대로 잘라 키운다(최대 1.6배, 머리 · 발이 잘리지 않게 그 구간의 상자를 다 감쌈).

```bash
node --env-file=.env scripts/shoot-trim/download.mjs 2026-10-18          # 그날 '찍음' 영상 → ~/bullpen-shoot-trim/2026-10-18/orig · list.json
py -3.12 scripts/shoot-trim/analyze.py ~/bullpen-shoot-trim/2026-10-18 4  # 움직임 · 사람 상자 재기(영상 하나 5초쯤)
py -3.12 scripts/shoot-trim/decide.py ~/bullpen-shoot-trim/2026-10-18     # 자동 판정 decisions.json + 장면 모음 sheets/<id>.jpg
```

1. **장면 모음을 하나하나 눈으로 본다**(앞 4초 · 가운데 · 뒤 4초, 빨간 테두리 = 자를 곳, 노란 상자 = 잘라 키울 판, 아래 곡선 = 움직임).
   애매하면 `strip.py <폴더> <id앞자리> <시작> <끝> <간격>` 으로 촘촘히 본다.
2. 자동 판정이 자주 틀리는 것 — **꼭 바로잡는다**:
   - 느린 동작(에센트릭 · 손목 · 슈러그) · 버티기(홀드 · 데드행 · 아이소) · 캐리(걷기가 동작)를 '빈 시간'으로 봄 → 자르지 않음.
   - 양쪽을 번갈아 하는 드릴 · 스트레치를 '카메라 쪽으로 걸어옴'으로 봄 → 끝까지 둠.
   - 진짜로 끝에 카메라 쪽으로 걸어오거나 화면 밖으로 나가는 장면 → 그 앞에서 끝.
3. 고칠 것은 `overrides.json` 에 `{ "<운동 id>": { "start": 0, "end": 12.3, "crop": null } }`(crop: `null` = 화면 그대로, `[x, y, w]` = 직접 판, `"skip": true` = 안 바꿈).
4. 만들고 확인하고 올린다:

```bash
py -3.12 scripts/shoot-trim/decide.py <폴더> --no-sheets   # overrides 를 넣어 판 다시(잘라 키울 판도 고친 앞뒤로 다시 잼)
py -3.12 scripts/shoot-trim/render.py <폴더>               # out/<id>.mp4 · .jpg (1080p · 원본 색 · 소리 없음)
py -3.12 scripts/shoot-trim/render.py <폴더> --small       # 재생용 720p 판 out/<id>.720.mp4
py -3.12 scripts/shoot-trim/compare.py <폴더> <id앞자리> …   # 몇 개를 원본과 나란히(test/compare.jpg)
npm run backup
node --env-file=.env scripts/shoot-trim/apply.mjs <폴더>          # 확인만
node --env-file=.env scripts/shoot-trim/apply.mjs <폴더> --apply  # 새 이름으로 올리고 경로만 바꿈(옛 파일은 저장소에 남김)
```

되돌리기는 `apply.mjs <폴더> --revert`(작업 폴더의 `applied.json` 이 있어야 — 그 컴퓨터에서만). 세로로 찍어 회전 표시만 붙은 영상은 render 가 멈춘다(손대지 않음).

## 2. 영상과 내용 맞추기 — 설명 · 도구 · 좌우 · 버티기

1단계를 올린 뒤에 한다(다듬은 영상으로 본다).

```bash
node --env-file=.env scripts/shoot-trim/content-export.mjs 2026-10-18   # 그날 찍은 것(전부는 all) → ~/bullpen-shoot-trim/content-2026-10-18
py -3.12 scripts/shoot-trim/content-sheets.py ~/bullpen-shoot-trim/content-2026-10-18   # pages/pNNN.jpg — 한 장에 운동 셋
```

장면 8장과 오른쪽 글(도구 | 좌우 따로 | 세트 × 횟수 · 초 버티기 | 부위 · 설명)을 견준다. 장이 많으면 에이전트 여럿에 나눠 맡기고(쪽 범위 · 아래 기준 ·
결과는 JSON 줄 `{idx, title, field, written, video, fix, confidence}`), **찾은 것 가운데 몇 개는 직접 다시 본다**.

- 볼 것: 자세(서서 · 무릎 · 누워 · 네발 …) · 무엇이 움직이나 · 받침(벤치 · 박스 · 벽) · 밴드를 거는 곳 · 쥐는 도구(덤벨 · 케틀벨 · 원판 · 케이블 · TRX).
- 도구 칸: 영상에 쓰는 것이 빠졌거나 안 쓰는 것이 적힘. **장비는 `lib/exercise-meta.ts` EXERCISE_EQUIPMENT 목록 안에서만** — 막대 · 패드 · 폼롤러 ·
  보수볼은 목록 밖이라 사용자가 아직 안 정했다(넣자고 먼저 묻는다, 설명에는 써도 된다).
- 좌우 따로: 한쪽만 하면 예, 두 팔 · 두 다리를 같이 하면 아니오. **번갈아 하는 운동(데드버그 · 버드독 …)은 기준이 아직 안 정해졌다** — 고치지 말고 묻는다.
- 버티기 ↔ 횟수: 영상이 가만히 버티면 초, 되풀이하면 횟수(글의 '30초쯤 머뭅니다'도 같이).
- 제목이 영상과 다른 운동(예: 케이블이라는데 덤벨) — 사용자가 10-18 에 '제목을 영상대로'로 정했다. 설명 · 도구도 같이.
- 설명 형식(사용자 규칙): `■ 어떤 운동인가` · `■ 이렇게 하세요` 필수, `■ 투수에게 왜 필요한가` 는 근거가 있을 때만. 합니다 · 하세요 존댓말, 어려운 말은 풀어 쓴다.
- 사용자가 숨기거나 '나중에 촬영'으로 뺀 운동은 일부러다 — 되돌리자고 하지 않는다.

**고치기 전에 사용자에게 찾은 것을 표로 먼저 보여 주고 허락을 받는다**(질문 상자에 숫자만 띄우지 말 것 — 사용자가 두 번 짚었다). 허락받으면:

```bash
# edits.json 을 쓴다(형식은 content-plan.py 머리 주석)
py -3.12 scripts/shoot-trim/content-plan.py <폴더>          # 검사 → fix-plan.json
npm run backup
node --env-file=.env scripts/shoot-trim/content-fix.mjs <폴더>/fix-plan.json   # 되돌리기: --revert
```

## 3. 전체 검토

```bash
node --env-file=.env scripts/shoot-trim/library-audit.mjs
npm run training:test && npm run program:test && npm run shoot:test && npm run clip:test && npm run arm-status:test
```

10-18 기준값: training 1818 · program 237 · shoot 74 · clip 51 · arm-status 34 모두 통과, 참고 영상만 있는 운동 31개.
찾은 것은 표(무엇이 · 왜 · 어떻게 고칠지)로 보여 주고 고칠지 묻는다.

아직 사용자가 정하지 않은 것(10-18): 목록 밖 도구 넷(막대 · 패드 · 폼롤러 · 보수볼)을 장비 목록에 넣을지 · 번갈아 하는 운동의 좌우 따로 기준 ·
전완 수피네이션 아이소메트릭(막대) 설명을 영상 방식으로 바꿀지.

## 4. 사람 크기만 다듬기 — 직접 찍은 영상 전부 (2026-11-16)

사용자: "직접 촬영한 영상들 전부 검수하고 인물이 너무 작게 보이면 적절한 크기로 화면에 위치하게 편집, 신중하게". 앞뒤 시간은 건드리지 않고 화면만 잘라 키운다.
도구는 `scripts/shoot-trim/size/`(맥 · Python 3.12 + `av opencv-python-headless pillow numpy rtmlib onnxruntime`, ffmpeg). 작업 폴더는 외장 디스크에.

```bash
node --env-file=.env scripts/shoot-trim/size/list.mjs <작업 폴더>        # 숨기지 않은 운동 · 드릴의 library/ 영상 · 썸네일(번들 원본이 있으면 링크)
python scripts/shoot-trim/size/measure.py <작업 폴더> 4                 # probe.json + 사람 상자(YOLOX-s, 0.2초) · 움직임
python scripts/shoot-trim/size/plan.py <작업 폴더>                      # plan.json — '작음'이면 판(crop)
python scripts/shoot-trim/size/sheets.py <작업 폴더> grid               # 전부 한 칸씩(30개 한 장) — 눈으로 훑기
python scripts/shoot-trim/size/sheets.py <작업 폴더> detail <id앞자리…> # 8장(위 원본 + 상자 · 판, 아래 판대로 자른 모습)
python scripts/shoot-trim/size/follow.py plan <작업 폴더> <id앞자리>     # 이동하는 운동 — 따라가는 판(sheets/f-<id>.jpg)
python scripts/shoot-trim/size/render.py <작업 폴더>                    # 고정 판 → out/<id>.mp4 · .720.mp4 · .jpg
python scripts/shoot-trim/size/follow.py render <작업 폴더> <id앞자리>   # 따라가는 판 → 같은 세 파일
python scripts/shoot-trim/size/thumbcheck.py <작업 폴더>                # 썸네일이 전체 화면이 아니면(차이 큼) 새 영상의 그 시각 장면으로 다시
python scripts/shoot-trim/size/verify.py <작업 폴더> <id 목록.json> <이름> # 완성본(720p) 확인 그림
python scripts/shoot-trim/size/densecheck.py <작업 폴더> 3 && python scripts/shoot-trim/size/densereport.py <작업 폴더>  # 모든 장면(초당 30장) — 판 밖 장면 0 이어야 올린다
npm run backup && node --env-file=.env scripts/shoot-trim/size/apply.mjs <작업 폴더> --apply
npm run library:bundle -- --hevc                                          # 새 앱용 HEVC 판(library-hevc/)
```

- **'작음'**: 사람 상자(시간 전체, 바깥 3~97%)가 화면 너비 · 높이 모두 62% 밑(10-17 규칙 60% 와 같은 뜻). 경계(62~66%)는 눈으로 보고 정한다.
- **판**: 사람 상자 전부 + 여백(좌우 8% · 위 12%(머리 위로 든 도구) · 아래 8%), 화면 비율 그대로, 확대 1.15~2.2배. 2.2배는 앱(720p)에서 무난,
  2.8배부터 흐렸다(시험 sheets/zoomtest). 색 형식(전 범위 · 보통 범위) · 장면 시각 · 장면 수는 원본 그대로(원본을 잘라 키운 것과 평균 차 1 미만).
- **따라가기**: 걸어오거나 옆으로 기는 운동은 고정 판으로 못 키운다 — 사람 상자를 따라가며 확대 · 위치를 천천히 바꾼다(확대 σ2초 · 위치 σ1초로 다듬은 뒤
  사람 + 여백이 늘 판 안인지 다시 확인). 끝에 카메라로 걸어오는 장면은 확대가 1로 돌아간다.
- **사용자 규칙(2026-11-16): 운동하는 동안 사람이 화면 밖으로 나가게 편집하면 안 된다.** 판은 0.2초 간격 상자로 정하니, 올리기 전에 densecheck 로
  모든 장면(초당 30장)을 다시 재 판 밖 장면이 0 인지 본다(원본 화면 끝에 이미 걸친 쪽은 따로 — 판 탓이 아님). 11-16 60개: 0장, 가장 빠듯한 고정 판 여유 1.3%.
- **자주 틀리는 것**: 상자는 사람만 감싼다 — 막대 · 아령 · 바벨 끝 · 밴드 고정점이 판 가장자리에 걸리는지 아래 줄(자른 모습)에서 꼭 본다(`overrides.json` 의
  `dy` · `dx` 로 옮기거나 `crop: "auto"` 로 경계 영상을 넣고 `skip` 으로 뺀다). 다른 사람이 이미 잘라 만든 썸네일은 다시 자르면 안 된다(thumbcheck).
- **2026-11-16 결과**: 335개 검수 → 60개 바꿈(운동 38 · 드릴 22, 고정 54 · 따라가기 6: 스쿼트 로커 · 햄스트링 스윕 · 워킹 쿼드 풀 · 워킹 런지 · 레터럴 베어크롤 · 워킹 니 허그).
  야외 드릴은 사람이 화면 높이의 30% 안팎이라 1.7~2.2배가 많다. A-스킵은 11-13 검수에서 이미 구도를 고쳐 그대로 뒀다. 판 · 예외는
  `scripts/shoot-trim/size/overrides-2026-11-16.json`, 바꾼 목록 · 옛 경로는 `applied-2026-11-16.json`(되돌리기: 작업 폴더에 applied.json 으로 두고 `apply.mjs <폴더> --revert`).
  캐시 `library:exercises:v53` · `library:guides:v13`. 백업 `db-2026-11-16-11-10.json`.

### 앞뒤 빈 시간 (2026-11-16 같은 날)

사용자: "운동 시작 · 끝 전후로 공백이 너무 긴 영상도 편집, 동작 전 1초 · 끝 1초 정도" → "(2초)까지는 괜찮아". 빈 시간이 **2초 넘을 때만** 잘라 동작 앞 · 뒤 1초를 남긴다.

```bash
python scripts/shoot-trim/size/motion.py <작업 폴더> 6        # 0.1초마다 사람 상자 안 움직임
python scripts/shoot-trim/size/idle.py <작업 폴더>            # idle.json — 후보(움직임 처음 · 끝 앞뒤 2초 넘음)
python scripts/shoot-trim/size/idlesheets.py <작업 폴더> <id 목록.json> <이름>  # 잘릴 장면(빨강) · 남는 장면(초록)
python scripts/shoot-trim/size/edges.py <작업 폴더> <[[id, head|tail]…].json> <이름>  # 앞 · 뒤 5초(걸어오기 찾기)
python scripts/shoot-trim/size/cutstrip.py <작업 폴더>        # trims.json 자르는 곳 앞뒤 0.25초 간격
python scripts/shoot-trim/size/trim.py <작업 폴더>            # out-trim/ — 화면을 키운 영상은 같은 판으로 원본에서 한 번에
npm run backup && node --env-file=.env scripts/shoot-trim/size/apply-trim.mjs <작업 폴더> --apply && npm run library:bundle -- --hevc
```

- **자르면 안 되는 것(눈으로 걸러 낸 것)**: 버티기 · 아이소메트릭(원판 핀치 홀드 · 톨닐링 포스처 홀드 · 엘보/리스트 아이소메트릭 프레스 · 프론 막대 스캡 홀드),
  끝 자세 유지 스트레칭(밴드 가슴 스트레치 · 하프닐링 레터럴 힌지), 느린 에센트릭(리스트 플렉션 에센트릭), 좌우를 번갈아 하는 스트레칭, 캐리(걷기가 운동).
  움직임이 작아 자동 판정은 이것들을 '빈 시간'으로 본다. 상자 키로 '카메라로 걸어옴'을 찾던 규칙도 헛것이 많아 뺐다(팔을 머리 위로 · 서 있다 눕기).
- **11-16 결과**: 335개 → 12개 자름(앞 9 · 뒤 2 · 앞뒤 1 — 워킹 쿼드 풀 · 워킹 니 허그는 끝에 카메라로 걸어오는 2초 남짓을 자름).
  자른 곳 `trims-2026-11-16.json`, 바꾼 목록 `applied-trim-2026-11-16.json`(되돌리기: 작업 폴더에 applied-trim.json 으로 두고 `apply-trim.mjs --revert`.
  크기 판까지 되돌릴 때는 이것 먼저). 백업 `db-2026-11-16-12-25.json`.

## 참고 — 촬영 계획(version 4, 2026-10-18)

2~4주차 완료, 남은 것은 5주차(A 넓은 공간 → 랙 공간 · B 케이블 공간이 동시에), 미룬 것은 '미룬 영상' 칸(8번). 워터볼 운동은 10-18 미룸으로 돌렸다.
`lib/shoot/crews.ts` · `scripts/shoot-plan-v4.mts`.
