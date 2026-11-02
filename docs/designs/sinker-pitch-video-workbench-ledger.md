# 싱커 투구 영상 비교 · 분석 — 구현 대장(R01–R42)

작성 2026-11-02 · 기준 커밋 `83946b61`(작업 전) · 계약 [sinker-pitch-video-workbench-claude-prompt.md](./sinker-pitch-video-workbench-claude-prompt.md) · 설계 [sinker-pitch-video-workbench-plan.md](./sinker-pitch-video-workbench-plan.md).

**이 대장은 '다 됐다'는 보고가 아니다.** 시뮬레이터 · Metro 는 사용자 지시로 켜지 않았고 실기기에서 돌려 본 것은 없다. 그래서 어떤 항목도 `verified`(기기 확인) 가 아니다.
상태: `not started` · `in progress` · `implemented / runtime unverified`(코드 + 순수 시험까지) · `verified` · `blocked + 까닭`.

## 0단계 조사 결과(요약)

- 앱: Expo 58 · React Native 0.88 · expo-video ~58.0.11 · expo-file-system ~58 · expo-image-picker ~58 · react-native-gesture-handler 3.3 · react-native-svg 15.16(native/package.json).
- 기존 비교(`native/src/app/pitch/compare.tsx`)는 고르기 → 기준 맞추기 → 함께 재생, 두 재생기의 단순 offset 동기 · 버퍼 대기 · 60ms 보정이 있었고 **저장 · 그림 · 장면 표시 · 메모가 없었다.** 같은 엔진을 키워 쓴다(새 화면을 따로 만들지 않음).
- 출시 전 베타 정책: `/pitch/*` 는 `pitchLog` 기능 — 지금 `BETA_ALLOWED` 밖이라 일반 · 준관리자에게 **잠김**. 투구 탭 카드는 잠긴 블럭으로 보이고 누르면 안내만. 정책 표는 바꾸지 않았다(아래 제안 참조).
- 원본 영상: 폰 영상은 `{userId}/local-<id>`(LocalVideo), 서버 영상은 서명 주소를 그때그때 받는다. `LocalVideo` 는 파일 보관 · 읽기 · 지우기뿐 — 합성 · 내보내기 · 녹음 기능은 **없다**.
- 설치에 없는 네이티브 패키지: 오디오 녹음(expo-audio) · 화면 녹화 · 뷰 캡처(react-native-view-shot · Skia) · 문서 고르기(expo-document-picker) · 로컬 네트워크 · RTSP. 이것을 쓰는 항목은 새 패키지 + 새 앱 바이너리가 필요하다(OTA 로 안 나간다).

## 대장

| ID | 무엇 | 구현 파일 | 자동 시험 | 기기 확인 | 상태 · 남은 것 |
| --- | --- | --- | --- | --- | --- |
| R01 | 투구 탭 2×2 도크(3D · 영상 비교 / 구속 · ABS), 잠금 그대로, 최근 비교 1–2줄 | `native/src/pitch/tab.tsx`(ToolDock) · `dock-art.tsx`(CompareMark) · `recent-compare.tsx` | 타입 검사 · 린트 | 없음 | implemented / runtime unverified. 베타 잠금 상태에선 잠긴 블럭(누르면 안내). 큰 글씨 · 좁은 창에서 쌓임은 코드로만 |
| R02 | 하나의 A/B 고르기 — 내 영상(투구 기록 영상 포함) · 사진 앱 · 바로 촬영, 기록 없이, 취소하면 아무것도 안 남김 | `native/src/app/pitch/compare.tsx`(StartPicker) · `videos/gallery.tsx`(start 모드) · `compare/store.ts`(importForCompare) | 없음(네이티브 고르기) | 없음 | in progress — **파일 앱(Files) · 다른 제공자 고르기는 없다**(expo-document-picker 미설치 → 새 바이너리). iCloud 받기 진행 · 취소 표시는 사진 선택기 기본 UI 에 맡김 |
| R03 | 앱 안 촬영 · 렌즈(초광각) · 확대 · 방향 · 장면 수 고르기 | `compare/store.ts`(launchCameraAsync) | 없음 | 없음 | in progress — 시스템 카메라(렌즈 · 확대 · 방향은 시스템 화면). **장면 수(fps) 고르기 · 렌즈 지정은 없다**(기존 `shoot-camera` 모듈을 비교에 잇는 일은 새 바이너리 · 기기 확인 필요). 권한 거절 안내는 있음 |
| R04 | 영상 사실(길이 · 크기 · 회전 · 코덱 · 장면 수 · 슬로모션) — 모르면 모름 | `compare/timing.ts`(MediaFacts · normalizeFacts · captureMapping) · `compare/ui/pane.tsx`(재생기 값) · `workbench.tsx`(syncFacts) | native-compare 317(사실 정리 · 슬로모션 비율) | 없음 | in progress — 길이 · 크기 · 평균 장면 수 · mimeType 은 재생기에서. **실제 장면 시각표(PTS) · 슬로모션 편집 구간 · 회전 머리는 아직 못 읽는다**(AVFoundation 모듈 필요) — 그래서 실제 걸린 시간은 '모름'으로 둔다 |
| R05 | 한 영상 보기 · A/B 정하기 · 바꾸기 · 교환 · 같은 영상 두 칸 · 들어온 곳으로 뒤로 | `compare/doc.ts`(addSource · setActive · swapActive) · `workbench.tsx`(single · 더보기) · `videos/compare-math.ts` nav | native-compare(교환 대칭 · 같은 영상 두 칸 · 옛 짝 복원) · my-videos(뒤로 길) | 없음 | implemented / runtime unverified |
| R06 | 따로 · 함께 재생, 속도 0.1~1×, 소리 없음/A/B, 공통 막대, 한쪽 받는 중이면 둘 다 멈춤 | `compare/transport.ts` · `compare/ui/transport-hook.ts` · `workbench.tsx` | native-compare(재생 줄기: 받는 중 · 다시 맞춤 · 연타 · 끝) | 없음 | implemented / runtime unverified. 0.1× 같은 낮은 속도가 기기에서 되는지 미확인 |
| R07 | 영상마다 이전 · 다음 장면, 정확한 장면 걸음과 짐작을 가름 | `compare/timing.ts`(stepInfo · snapToFrame · stepFrom) | native-compare(24/25/29.97/30/60/120/240 · 가변 · 모름) | 없음 | in progress — 장면 간격이 고르다는 사실을 재생기가 주지 않아 지금은 늘 '짐작'(constantRate null). 정확한 PTS 걸음은 R04 모듈 뒤 |
| R08 | 같은 장면 기준 · 공통 구간 · 다시 맞추기 취소 · 어긋남 고침 · 맞춤 상태 | `compare/timing.ts`(offsetRange · syncQuality) · `transport-hook.ts` · `workbench.tsx` | native-compare(0 기준 · 범위 밖 · 겹침 없음 · 다듬기 · 옛 셈과 같음 · 맞춤 상태) | 없음 | implemented / runtime unverified. 맞춤 정도는 **재생기 시간 알림 기준**(화면에 실제 보인 장면 어긋남 아님) — 화면도 그렇게 적는다 |
| R09 | 반복 구간 · 다듬기 · 끝 처리 · 다시 셈 | `doc.ts`(trims · loop) · `timing.ts`(trimmedRange) · `transport-hook.ts`(loop) · `workbench.tsx`(여기서 반복 시작/끝) | native-compare(다듬은 구간 · 거꾸로 거절) | 없음 | in progress — 반복 구간은 됨. **영상마다 다듬기(in/out) 화면은 아직 없다**(모델 · 셈은 있음) |
| R10 | 위아래 · 나란히 · 크게 보기, 확대 · 이동, 같이 확대, 맞춤 · 반전 표시 | `compare/geometry.ts` · `ui/annotation-layer.tsx`(두 손가락) · `ui/pane.tsx` · `workbench.tsx` | native-compare(왕복 · 확대 가운데 고정 · 반전) | 없음 | implemented / runtime unverified. 자르기(crop) 화면은 없음(모델만) |
| R11 | 겹쳐 보기 · 투명도 · 반반 나누기 · 공간 맞춤 따로 | `geometry.ts`(Registration) · `workbench.tsx`(OverlayBox) | native-compare(두 점 쌍 맞춤) | 없음 | in progress — 투명도 · 나누기는 됨. **공간 맞춤(두 점 쌍)을 짚는 화면은 아직 없다**(셈만) |
| R12 | 자유선 · 선 · 화살표 · 사각형 · 원 · 글 · 점 · 수평/수직선 · 기울기 · 세 점 각 | `compare/annotations.ts` · `ui/annotation-layer.tsx` · `ui/panels.tsx`(DrawPanel) | native-compare(측정 글 · 검사) | 없음 | implemented / runtime unverified |
| R13 | 고르기 · 옮기기 · 지우기 · 색 · 굵기 · 되돌리기/다시 하기 · 범위 지우기 확인 · 칸/시간별 보임 · 회전 · 다시 열어도 남음 | `annotations.ts`(History · visibleAt · clearTargets) · `workbench.tsx` | native-compare(되돌리기 · 다시 하기 · 범위 지우기 · 장면/구간/내내) | 없음 | implemented / runtime unverified. 손잡이 하나만 옮기기(점 단위)는 없음 — 그림 통째 옮기기 |
| R14 | 시간(불확실성 포함) · 보정한 2D 길이 · 보정 없으면 cm 안 냄 | `timing.ts`(durationText) · `pitch-events.ts`(intervalOf) · `geometry.ts`(Calibration · distance) | native-compare | 없음 | implemented / runtime unverified |
| R15 | 장면별 글 메모 · 목소리 메모 | `doc.ts`(notes) · `ui/panels.tsx`(NotesPanel) | native-compare(메모 · 빼기) | 없음 | in progress — 글 메모는 됨. **목소리 메모 blocked**: 녹음 패키지(expo-audio) 없음 → 새 패키지 · 바이너리 · 마이크 권한 문구 필요 |
| R16 | 그림 얹은 정지 화면 · 짝 정지 화면 · 장면 모음 | `ui/panels.tsx`(Storyboard — 재생기가 뽑은 실제 장면) | 없음 | 없음 | in progress — 장면 모음(실제 장면)은 화면에서 봄. **파일로 저장 · 그림을 얹은 정지 화면 blocked**: 뷰 캡처는 영상 면을 빼먹을 수 있어(계약 9절) AVFoundation 합성 모듈 필요 |
| R17 | A/B · 겹쳐 보기 영상 내보내기 | `compare/export-plan.ts`(planComposition) · `ui/panels.tsx`(ExportPanel 계획 표시) | native-compare(구간 · 속도 · 길이 · 알림) | 없음 | blocked — 합성 · 인코딩 모듈 없음(새 Swift 모듈 + 새 바이너리). 계획 단계까지만, 화면은 '아직 못 해요'로 정직하게 |
| R18 | 해설 녹화(멈춤 · 옮김 · 속도 · 그림 · 목소리) | `export-plan.ts`(planNarration — 조작 기록 → 출력 시간 줄) | native-compare(멈춤 · 건너뜀 · 속도 · 그림 시각 · 끝 멈춤) | 없음 | blocked — 녹음 · 합성 모듈 없음. 시간 줄 계획만 시험 |
| R19 | 계정별 판 붙은 로컬 문서 · 원자 저장 · 깨짐 복구 · 최근 · 복사/이름/지우기 · 다시 잇기 · 원본 안 건드림 | `compare/doc.ts` · `compare/storage.ts` · `compare/fs.ts` · `compare/store.ts` · `app/index.tsx`(주인 · 로그아웃) | native-compare(왕복 · 다른 계정 · 새 판 거절 · 서명 주소 거름 · 충돌 · 끊긴 쓰기 · 앞판 복구 · 목록 다시 만듦 · 복사본 지움 규칙 · 자동 저장) | 없음 | implemented / runtime unverified. 복사 · 다시 잇기는 모델만(화면 메뉴 없음 — 복사는 충돌 사본에서만 씀) |
| R20 | 모음 · 즐겨찾기/기준 영상 · 태그 · 찾기 · 원본 추적 | `compare/sources.ts`(거르기 · 오늘 vs 기준 ★) · 기존 내 영상 즐겨찾기 | native-compare(거르기 · 오늘 vs 지난) | 없음 | in progress — 내 영상의 ★ · 찾기를 그대로 씀. **비교 문서 모음 · 태그 · 찾기 화면은 없다** |
| R21 | 클라우드 백업 · 기기 사이 동기 · 충돌 · 지우기 뜻 | — | — | — | not started — 서버 표 · 저장소 · 권한 설계가 먼저(공유 DB = 운영, 마이그레이션은 김민과 맞춘 뒤). 문서는 `sync: local` 로만 표시 |
| R22 | 오프라인 받기 · 캐시 한도 · 원본 잃음 복구 | 원본 잃음 안내는 `ui/pane.tsx`(이 기기에 없음 · 다른 영상) | — | — | not started(R21 뒤) |
| R23 | 실제 정지 · 영상 · 소리 공유, 공유 링크 · 거둬들임 | — | — | — | blocked — 내보낼 파일이 없음(R16 · R17). 링크는 서버 정책 뒤 |
| R24 | 플레이리스트 · 장면 모음 · 차례 재생 · 댓글 · 범위 받기 | — | — | — | not started |
| R25 | 팀 · 코치 검토(조직 권한 · 선수 동의) | — | — | — | not started — 기존 org 렌즈(`lib/org/dto-scope.ts`)를 이어 써야 함 |
| R26 | 4개 이상 보기 문서 · 짝 고르기 · 자원 한도 | `doc.ts`(최대 12 영상 · active 짝) · `startReview` | native-compare | 없음 | in progress — 문서는 12 영상까지 담고 한 번에 둘만 푼다. **4칸 보기 화면 · 보기 이동 UI 는 없다** |
| R27 | 두 기기 촬영 · 즉시 리플레이 | — | — | — | not started — 짝짓기 · 로컬 네트워크 권한 · 새 네이티브 필요 |
| R28 | 외부 카메라 · 네트워크 스트림(RTSP) | — | — | — | not started — expo-video 의 RTSP 지원 미확인, 프로토콜 표 필요 |
| R29 | 투구 장면 6가지 사람이 짚기 · 가려짐 · 비움 | `compare/pitch-events.ts` · `ui/panels.tsx`(EventsPanel) | native-compare(가려짐 · 순서 알림 · 길이 밖) | 없음 | implemented / runtime unverified |
| R30 | 장면 사이 시간 · A/B 차이 · 장면 띠로 두 영상 이동 · 실제/재생 시간 가름 | `pitch-events.ts`(intervalOf · compareInterval · sharedEvents) · `workbench.tsx`(jumpEvent · anchorAt) | native-compare(일반 · 240 슬로모션 · 모름 · 시간 축 다름) | 없음 | implemented / runtime unverified. 슬로모션 여부를 지금 못 읽어 실제 시간은 대개 '모름' — R04 모듈이 오면 채워진다 |
| R31 | 기준 투구 · 오늘 vs 지난 · 잘 됨/아쉬움 · 손 · 구종 · 방향 거르기(아는 값만) | `compare/sources.ts` · `ui/panels.tsx`(SourceInfoSheet) · StartPicker '오늘 vs 지난 투구' | native-compare | 없음 | in progress — 거르기 셈 · 영상 정보 입력은 됨. **거르기 화면(조건으로 후보 고르기)은 없다** |
| R32 | 2D 투영 몸통 · 어깨 · 아래팔 · 스트라이드 · 릴리스 높이 — 방향 · 단위 맞을 때만 견줌 | `annotations.ts`(MetricKey · compareMetric) · EventsPanel | native-compare(방향 다름 · 모름 · 단위 다름) | 없음 | implemented / runtime unverified. 관절 부하 · 부상 점수는 만들지 않음 |
| R33 | 3D · 구속 · 투구 기록 잇기(출처 · 단위 · 판) | `workbench.tsx`(subOf — 내 영상 항목의 기록 · 구속 클립 값을 출처와 함께) · `doc.ts`(EvidenceRef 모델) | — | 없음 | in progress — 기록 · 구속 클립 값 표시만. **3D 결과 잇기 · 잇기 저장 화면은 없다** |
| R34 | 여러 투구 검토 — A 고정, B 차례로, 짝마다 기준 · 메모 유지 | `doc.ts`(startReview · moveReview) · `workbench.tsx` | native-compare(고정 · 다음 · 돌아오면 기준 그대로) | 없음 | implemented / runtime unverified |
| R35 | 자세 · 추적 장면 후보(사람이 확인) | — | — | — | not started — 3D 엔진 결과의 시각 · 영상 대응 확인이 먼저. 수동 도구는 이것 없이 돈다 |
| R36 | 동작 길이 맞춤(따로 된 모드 · 순서 검사 · 실제 시간 해석 끔) | `timing.ts`(buildNormalized · normalizedTimes · phaseStretch) · `transport-hook.ts` · `workbench.tsx` | native-compare(거절 다섯 · 단조 · 늘임) | 없음 | implemented / runtime unverified. 화면에 '동작 길이 맞춤 · 실제 시간과 다름' |
| R37 | 접근성 · 안전 영역 · 자판 시트 · 회전 · 큰 글씨 · 테마 · 뒤로 | 화면 전반(44pt · 글자 배율 · 안전 영역 · KeyboardAvoidingView 시트) | 타입 · 린트 | 없음 | in progress — VoiceOver · 큰 글씨 · 가로 · 아이패드는 기기 확인이 있어야 판정 |
| R38 | 뒤로 감 멈춤 · 재생기 놓기 · 경합 취소 · 긴/4K/HFR · 열 | `transport.ts`(세대) · `transport-hook.ts`(뒤로 감 · 떠남) · `pane.tsx` | native-compare(옛 세대 버림 · 바꾼 B · 뒤로 감) | 없음 | in progress — 메모리 · 열 · 4K 는 기기 측정 필요 |
| R39 | 계정 격리 · 비공개 · 서명 주소 만료 · 로그아웃 정리(원본 안 지움) | `storage.ts`(owner) · `fs.ts`(계정 폴더) · `store.ts`(reset) · `doc.ts`(서명 주소 거름) | native-compare(다른 계정 · 서명 주소) | 없음 | implemented / runtime unverified. 문서는 로그아웃해도 그 사람 폴더에 남는다(같은 사람이 다시 보면 이어짐) — 공유 기기 정책은 결정 필요 |
| R40 | 결정적 시험 · 기기 확인 표 · 정밀도 측정 · 기존 흐름 회귀 | `scripts/native-compare-selftest.mts`(`npm run native-compare:test`) · 이 대장의 기기 확인 표 | 317 통과 · my-videos · release-access 등 회귀 | 없음 | in progress — 정밀도(어긋남 · 탐색 지연)는 기기에서만 |
| R41 | 네이티브 기능 유무 · 옛 앱 대비 · OTA vs 새 바이너리 | 이번 묶음은 **JS 만**(새 네이티브 패키지 없음) — 기존 expo-video · image-picker · file-system · gesture-handler · svg 만 씀 | 타입 · 린트 | 없음 | implemented / runtime unverified. 배포 안 함 |
| R42 | 대장 · 한국어 안내 · 한계 · 명령 · 결과 | 이 문서 · HANDOFF | — | — | in progress(이 문서) |

## 출시 정책 제안(적용 안 함)

영상 비교는 `/pitch/compare` 라 `pitchLog` 기능으로 잠긴다. 베타에 열려면 둘 중 하나를 정해야 한다 — ① `pitchLog` 를 연다(투구 기록 전체가 열림) ② 새 기능 `videoCompare` 를 `lib/release-access.ts` 표 · `lib/release-ops.ts` · 경로 표(`/pitch/compare` → videoCompare)에 더하고 `BETA_ALLOWED` 에 넣는다. 이번 묶음은 서버 동작을 새로 부르지 않아(로컬 문서) ② 가 좁고 안전하다. 사용자 결정 전까지 그대로 잠금.

## 실기기 확인 순서(사용자 몫 — 아직 아무것도 안 함)

1. 대표관리자 계정(잠금 없음) · 일반 계정(잠금) 두 가지로 투구 탭: 2×2 도크 · 잠긴 블럭 안내 · 큰 글씨 200% 에서 쌓임.
2. 영상 비교 → 내 영상 하나 → 한 영상 보기(재생 · 장면 걸음 · 속도) → '비교 영상 추가' → B → 앞발 착지 기준 둘 → 함께 재생(0.5×) → 뒤로 → 투구 탭 '최근 비교' 로 다시 열기(멈춘 채 · 같은 자리 · 같은 기준).
3. 사진 앱에서 두 개 한꺼번에(HEVC · 60/120/240 · 슬로모션 · 세로) → '처음부터 보기'(시작점 기준 글) → 기준 맞추기.
4. 바로 촬영 → 권한 거절 → 설정에서 켜고 다시.
5. 그리기 열두 가지 · 고르기 · 옮기기 · 되돌리기/다시 하기 · 이 장면 지우기 · 두 손가락 확대 · 반전 · 회전 · 앱 종료 뒤 다시 열기(그림이 같은 자리).
6. 투구 장면 여섯 · 가려짐 · 구간 시간 · 장면 띠 · 착지를 기준으로 · 동작 길이 맞춤 켜고 끄기.
7. 메모(자판이 단추를 가리지 않는지) · 내보내기 장면 모음(실제 장면이 보이는지).
8. 함께 재생 중 통화 · 뒤로 가기 · 화면 끄기 → 돌아와도 저절로 안 틂. 한쪽만 서버 영상(약한 망)일 때 둘 다 기다림.
9. 어긋남: 시간 코드가 박힌 영상 둘로 0.5× · 1× 재생 시 화면 녹화로 장면 차이 재기(앱의 맞춤 표시는 재생기 알림 기준이라 따로 잰다).
10. 로그아웃 → 다른 계정 로그인 → 최근 비교에 앞사람 것이 안 보이는지 → 다시 처음 계정 → 다시 보이는지.

## 검사 명령

```bash
npm run native-compare:test
```

```bash
npm run my-videos:test
```

```bash
cd native && npx tsc --noEmit -p .
```

## 이어서 할 일(다음 세션)

1. 실기기 확인(위 순서) — 결과로 R01 · R05 · R06 · R08 · R12~R14 · R19 · R29~R30 · R34 · R36 을 `verified` 로 올리거나 고친다.
2. 출시 정책 결정(영상 비교를 베타에 열지) — 열면 `lib/release-access.ts` · `release-ops.ts` 표 · `npm run release-access:test`.
3. AVFoundation 모듈(새 바이너리): 장면 시각표(PTS) · 슬로모션 편집 구간 · 회전 머리 읽기(R04 · R07 · R30 실제 시간) → 그다음 정지 화면 · 영상 합성 내보내기(R16 · R17) · 녹음 · 해설 녹화(R15 목소리 · R18).
4. 화면 빈칸: 영상마다 다듬기(R09) · 겹쳐 보기 두 점 맞춤(R11) · 거르기 화면(R31) · 3D 결과 잇기(R33) · 4칸 보기(R26) · 파일 앱 고르기(R02 — expo-document-picker).
5. 서버 쪽(김민과 맞춘 뒤 · 백업 뒤): 클라우드 백업 · 동기(R21 · R22) · 공유(R23) · 플레이리스트(R24) · 코치 검토(R25).
6. R27 두 기기 · R28 외부 카메라 · R35 자세 후보는 프로토콜 · 엔진 조사부터.
