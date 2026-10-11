# 다저스타디움 3D 무대 — 자료 · 계획 (김민, 2026-10-11)

투구 분석 실험실(`/videos/lab/[id]`)의 무대를 Blender 로 만든 GLB 로 바꾼다. 경기장 바닥 · 마운드 · 하늘 · 빛은 지금처럼 `stage.ts` 가,
구장 건물은 GLB 가 맡는다. 범위는 실험실 카메라(마운드 둘레)에 보이는 구장 안쪽 — 바깥 외벽은 단순하게.

## 1. 앱 분석(1단계)

| 항목 | 내용 |
|---|---|
| 판 | React 19.2.4 · three 0.186.1 · Next 16.3.6. 모바일 앱은 Capacitor 웹뷰가 `https://bullpen-log.vercel.app` 을 연다 — GLB 는 매번 네트워크로 받는다(캐시 · 파일 크기 중요) |
| 그리기 | `body-3d.tsx`(금윤호): `WebGLRenderer({ antialias })`, 픽셀 비 최대 2, `dirty` 일 때만 그린다(재생 · 끌기 · 무대 `onChange`). 언마운트 때 렌더러 dispose + forceContextLoss |
| 무대 | `stage.ts` `buildStage` → `StageHandle { cameraNear, cameraFar, setMode, onChange }`. 좌표: y 위, x 홈 쪽, 1루는 −z, 키 = 1(`s = 1/키m`) |
| 고칠 파일 | `stage.ts`(GLB 불러오기 · 낮밤), `stadium.ts`(코드 구장 — GLB 로 바뀌면 지움), `body-3d.tsx` 한 줄(`stage.dispose()` 부르기 — 지금은 무대 질감 · 메시를 안 버린다), `next.config.ts`(GLB 오래 캐시) |
| 유지 | `lab-detail.tsx` · `analysis-v2.tsx` · `display.ts` · `pose-rig.ts`(마운드 높이 — 바닥 · 마운드는 계속 코드로) |
| GLB 축 | Blender: 원점 = 홈플레이트 뒤 꼭짓점, +X = 가운데(a), +Y = 3루 쪽(−b), +Z = 위, 미터. glTF 로 나가면 (a, 높이, b) → three 에서 y 축 180° 돌리고 `s` 배, 홈 자리로 옮긴다 |

## 2. 자료(2단계) — 확인된 것 · 추정

| 항목 | 값 | 근거 · 확신 |
|---|---|---|
| 좌우 폴 | 330ft = 100.6m | 위키백과 · MLB(확인) |
| 좌우 중간 · 진짜 좌우중간 | 360ft 110m · 375ft 114.3m | 위키백과(확인). MLB.com 은 385ft — 표기 차이 |
| 가운데 | 395ft 표시 · 400ft 122m 실제 | 위키백과(확인), OSM 실측 122.6m |
| 펜스 곡선 | 0° 122 · 15° 117.5 · 30° 113.2 · 45° 102m | OSM 실측(±3m) — 30° 가 이전 곡선보다 3.5m 깊다 |
| 펜스 높이 | 폴 근처 4ft · 나머지 8ft | Baseball Data Hub(추정 — 공식 확인 못 함) |
| 백스톱 | 55ft 16.8m | 위키백과(확인), BDH 57ft, OSM 14m(거친 윤곽) |
| 파울 벽(파울선에서) | 10~30m 지점 15~17m → 40m 10 → 50m 7.6 → 60m 5 → 70m 넘어 2m | OSM(±3m) |
| 본 관중석 평면 | 홈 뒤 95m 까지, 폴을 지나 외야석 옆(a ≈ 87~110m)까지 사선으로 끝남 | OSM 건물 윤곽(LA 카운티) |
| 본 관중석 높이 | 꼭대기 49.4m | OSM `height`(LA 카운티 — 라이다 기반, 확인에 가까움) |
| 층 | 필드 · 로지 · 클럽 · 리저브 · 톱 덱(+ 홈 뒤 더그아웃 박스), 층마다 '20여 줄' | walteromalley.com(확인). 층별 높이 · 튀어나온 길이는 사진 어림(추정) |
| 층 색 | 필드 겨자 · 로지 살구 · 클럽 남색 · 리저브 청록 · 톱 덱 파랑 | 구장 안내판 사진(확인) |
| 외야석 | 좌우 두 동(각 3,000석), 가운데 선에서 3~37°, 홈에서 112~147m, 거의 직선 | 공식 · OSM(±3m) |
| 외야석 지붕 | 높이 12~13m, 흰 쇠판 조각이 번갈아 기울어진 지그재그, 밑 철골 8~12m(회색 쇠) | OSM 건물 부분 태그(확인에 가까움) |
| 육각 전광판 | 폭 77.69ft(23.7m), 높이 가운데 38ft(11.6m) · 끝 24ft(7.3m), 밑 LED 띠 6 × 69ft | Sports Video Group(확인) |
| 타자 눈 | 120 × 30ft(옛 자료) | walteromalley.com(옛 값 — 지금은 가운데 광장, 추정) |
| 방향 | 홈 → 가운데가 북북동 26° | OSM 내야(±2°) |

평면 자료: `scripts/stadium/dodger-osm.json`(OSM 에서 뽑아 경기장 좌표로 옮긴 것 — © OpenStreetMap 기여자, ODbL).

## 3. 계획(승인 2026-10-11)

1. 블록아웃 — `scripts/stadium/build_dodger.py`(Blender 4.2 LTS, 다시 돌려도 중복 없음), 컬렉션 10개. 검증: 위에서 본 렌더를 OSM 윤곽에 겹침 · 치수 검사 출력 · 사진과 같은 각도 렌더.
2. 세부(의자 인스턴싱 · 계단 · 난간 · 더그아웃 · 조명 · 전광판) → 3. 재질 · 빛 굽기 → 4. 최적화(gltf-transform, KTX2) → 5. `stage.ts` 통합 → 6. 검증(구조 · 그림 · 성능).

## 4. 진행

- **2026-10-11 블록아웃 + 의자 + 빛 굽기(1차)** — `scripts/stadium/build_dodger.py` → `public/stage/dodger.glb`(meshopt, 2.2MB).
  만드는 법: `blender -b --factory-startup -P scripts/stadium/build_dodger.py -- --ao --glb <raw.glb>` →
  `npx @gltf-transform/cli optimize <raw.glb> public/stage/dodger.glb --compress meshopt --simplify false --texture-compress false --palette false`
  (`--palette false` — 켜면 재질을 한 장에 합쳐 이름이 사라져 앱의 재질 손질이 안 붙는다).
  - 검사: 펜스 0° 122 · 22.5° 114.3 · 45° 100.6m, 꼭대기 49.4m(조명 50.4), 의자 52,717개(공식 본 관중석 50,000 — 5% 안).
  - 의자는 GPU 인스턴싱(EXT_mesh_gpu_instancing), 내야 한가운데(홈에서 25m)를 보게 틀었다(줄에서 60° 까지). 의자마다 하늘 반구로 광선 24개 → 밝기(_COLOR_0).
  - 구조물은 Cycles 로 구석 어둠을 꼭짓점 색에 굽고 이웃과 4번 섞었다(물결무늬 없애기). 콘크리트 잔결은 앱에서 세계 좌표로(Poly Haven concrete_wall_008, CC0).
  - 앱: 구장은 그림자를 그리지도 받지도 않는다(해 그림자는 투수 둘레만). 삼각형 약 119만(의자 5만여 × 20).
- **출처 표시(출시 전 할 일)**: 평면은 © OpenStreetMap 기여자(ODbL) — 앱 안 어딘가(정보 화면 등)에 표기해야 한다.
- **다음**: 전광판 · 조명탑 · 지붕 조명판(참고 그림: 지붕 위 큰 조명판 4개) · 외야석 의자 · 난간 · 통로 계단 · 띠 전광판 · 밤 조명 · 휴대폰 성능 측정.
