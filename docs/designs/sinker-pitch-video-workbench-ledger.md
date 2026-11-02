# 싱커 투구 영상 비교 · 분석 — 구현 대장(R01–R42)

작성 2026-11-02 · 기준 커밋 `83946b61`(작업 전) · 계약 [sinker-pitch-video-workbench-claude-prompt.md](./sinker-pitch-video-workbench-claude-prompt.md) · 설계 [sinker-pitch-video-workbench-plan.md](./sinker-pitch-video-workbench-plan.md).

**이 대장은 '다 됐다'는 보고가 아니다.** 시뮬레이터 · Metro 는 사용자 지시로 켜지 않았고 실기기에서 돌려 본 것은 없다. 그래서 어떤 항목도 `verified`(기기 확인) 가 아니다.
상태: `not started` · `in progress` · `implemented / runtime unverified`(코드 + 순수 시험까지) · `verified` · `blocked + 까닭`.

## 독립 검토 교정(F01–F08 — 2026-11-02 2차, 검토 [review-2026-11-02](./sinker-pitch-video-workbench-review-2026-11-02.md) · 지시 [remediation-claude-prompt](./sinker-pitch-video-workbench-remediation-claude-prompt.md))

기준 커밋 `760d9859`. 시험은 **고치기 전 코드에서 실패하고 고친 뒤 통과하는 것**만 남겼다 — `npm run native-compare:regress`(scripts/native-compare-regress-selftest.mts · native-compare-regress-ui.mts).
고치기 전(HEAD 를 따로 꺼낸 작업 트리에서 같은 시험): **17 통과 · 41 실패** → 고친 뒤: **66 통과 · 0 실패**(새로 더한 R09 · R11 · R20 셋 포함). 기존 `native-compare:test` 318 그대로 통과.
검사 수준: 저장은 실제 저장 함수 + (가) 실제 기기 move(overwrite)처럼 '대상 지우기 → 옮기기' 두 단계로 끊김을 넣는 메모리 손잡이 (나) 이 맥 임시 폴더의 진짜 파일.
재생 · 복원 · 고르기는 **실제 소스(transport-hook.ts · workbench.tsx)를 TypeScript 로 바꿔 가짜 훅 순서 · 가짜 재생기로** 돌렸다 — React Native 렌더러 · 실제 디코더 · 사진 선택기 · 터치는 아니다.

| F | 고치기 전 재현(실패한 시험) | 고친 곳 | 지키는 것 | 상태 · 남은 한계 |
| --- | --- | --- | --- | --- |
| F01 | 병렬 저장 둘 → 목록에 하나만 · 목록 밖 문서가 쓰는 복사본을 고아로 냄 · 지운 뒤 늦은 저장이 되살림 · 못 읽는 문서 · 목록 실패에도 지움 · 문서 파일을 못 지워도 성공(9개 실패) | `compare/storage.ts`(계정 한 줄 잠금 `exclusive` · 폴더의 모든 문서 파일(본판 · 앞판 · 남은 tmp)로 참조 판정 · 모르면 남김 · 실제 지우기를 같은 잠금 안에서 · revision>0 인데 없으면 'deleted') · `compare/store.ts`(열린 화면 · 가져오는 중 경로 붙들기 `holdPaths` · `deleteComparison` 이 잠금 안 콜백으로) · `ui/workbench.tsx`(제 문서 경로를 늘 붙듦 · 지우기 전 놓음) | 참조 중인 영상은 지우지 않는다(목록 500개 밖 · 깨진 문서 글자 · 끊긴 tmp 까지). 사진 앱 원본 · 기록 영상은 처음부터 owned 아님 | **고침**. 같은 계정 저장소 두 개(다시 로그인)도 한 줄. 기기의 실제 expo-file-system 동작은 기기 확인 |
| F04 | 깨진 본판 + 정상 앞판에서 새 판 설치가 끊기면 정상 판이 사라짐(2개 실패 — 끊김 지점 6번째) | `storage.ts` save — 본판이 **정상일 때만** 앞판으로 옮기고, 설치한 새 판을 다시 읽어 확인한 뒤에만 앞판을 지움 | 모든 끊김 지점(쓰기 · 대상 지우기 · 옮기기 · 확인 읽기 · 정리)에서 옛 판 또는 새 판이 통째로 읽힌다(네 가지 처음 상태 × 단계마다) | **고침**. expo-file-system 의 move(overwrite)가 '지우기 → 옮기기' 두 단계임을 설치된 Swift 소스(FileSystemPath.swift)에서 확인하고 그대로 흉내 냄 |
| F06 | 미래 판 · 깨진 문서 · 못 읽는 파일 위에 저장이 성공해 덮음 · 자동 저장이 끝없이 다시 씀(4개 실패) | `storage.ts`(읽기가 없음과 못 읽음을 가름 · 새로 만들기는 missing + revision 0 만 · newer/owner/corrupt/io/deleted 를 그대로 돌려줌) · 자동 저장 `onBlocked` | 거절 때 디스크 글자 그대로 | **고침**. 의도한 복구 · 교체는 따로 만들지 않았다(필요해지면 별도 동작으로) |
| F02 | 저장 위치 +1.25 · −1.5 · 6.9 가 재생기 준비 전에 0 으로 덮이고 준비 뒤 복원 안 함 · B 오류 · 확인 실패 뒤에도 덮음 · 한 영상 자리 없음 · 확인 옮기기 없음(9개 실패) | `ui/workbench.tsx`(짝마다 복원 단계 waiting → done/failed · 복원이 끝나기 전엔 자리 저장 안 함 · 사용자가 옮기거나 틀면 그때부터) · `ui/transport-hook.ts`(`seekConfirmed` — 두 재생기가 실제로 닿았는지까지, 시간 초과는 실패) · `doc.ts`(한 영상 자리 `SourceRef.lastTime`) | B 바꿈 · A·B 교환 · 차례로 보기 · 다시 맞추기 취소 · 충돌 뒤에도 그 짝의 자리로. 멈춘 채 복원(저절로 안 틂) | **고침**(가짜 훅 순서 시험). 실제 기기 디코더의 탐색 완료 시점은 기기 확인 |
| F03 | 5초에서 받기 → 준비되면 0초로 되감음 · 기준 다른 짝 · B 다시 붙인 직후 받기가 길어도 A 만 감 · '섰다'가 '받는 중'보다 먼저 오면 멈춤으로 오해(5개 실패) | `compare/transport.ts`(기계가 다시 맞출 자리 target 을 싣고 다님 — 받기 시작 때 공통 자리) · `transport-hook.ts`(받기 순간의 공통 자리 · 봐주는 500ms 뒤 다시 확인 · 250ms 뒤 받는 중인지 다시 봄 · 처음 붙을 때를 영상 바뀜으로 안 봄) | 받는 중 멈춤 · B 바꿈 · 오류 · 뒤로 감 뒤엔 준비돼도 안 틂 · 반복 끝은 둘 다 반복 처음 | **고침**(가짜 재생기 시험). 실제 망 · 디코더 순서는 기기 확인 |
| F05 | −1~+1 반복이 저장 왕복에서 사라짐(2개 실패) | `doc.ts`(다듬기 = 원본 절대 시각 `range`, 반복 = 기준에서 잰 상대 시각 `relSpan` 따로 · `fitLoop` 로 공통 구간과 겹치는 만큼만) · `workbench.tsx`(기준을 바꾸면 반복을 풀고 자리는 기준 장면으로) | 전부 음수 · 0 걸침 · 전부 양수 왕복, NaN · 거꾸로 · 0.1초 미만 · 10분 넘음은 거절. 재생은 기준 1초 앞에서 | **고침** |
| F07 | 앱 영상 없는 사람이 한 영상 뒤 B 를 사진 앱으로 못 고름 · A 바꾸기 · 다시 잇기 없음(5개 실패) | 새 `compare/source-pick.ts`(한 고르기 규칙 — 처음 · B 더하기 · A/B 바꾸기 · 다시 잇기 · 같은 영상 두 칸 · 계정 바뀜 거절) · 새 `ui/source-picker.tsx`(같은 화면: 이 비교의 영상 · 같은 영상 한 칸 더 · 내 영상 · 사진 앱 · 바로 촬영 · **파일 앱**) · `store.ts` importForCompare(파일 앱 = 설치된 expo-file-system 58 의 `File.pickFileAsync` · 넣는 순간 붙듦 · 계정이 바뀌면 지우고 버림 · 일부만 되면 된 것만) · `videos/gallery.tsx`(고르기 모드에 가져오기 단추 · 위 칸 · 고정 쪽 이름) · `app/pitch/compare.tsx` | 고르는 동안 문서는 그대로 — 취소하면 짝 · 기준 · 자리 · 반복 · 보기 그대로. 저장 안 된 채 닫히면 가져온 복사본 정리 | **고침**(규칙 · 작업대 연결 시험). 사진 선택기 · 파일 앱 · 카메라의 실제 동작 · 권한 · 저장 공간 부족은 기기 확인. 파일 앱은 새 패키지 없이(이미 든 모듈) — 기능 유무를 열 때 확인해 없으면 단추를 숨김 |
| F08 | 그리기 도구만 켜도 화면 굴림이 멈춤 · 이동 값이 화면 px(칸 크기 바뀌면 다른 곳) · 정규화가 사건 밖까지 · A·B 바꾸면 옛 확대가 덮음 · '어긋남 최대'라 적음(5개 실패) | `ui/annotation-layer.tsx` · `pane.tsx`(그리는 그 손가락 동안만 `onStroke`) · `geometry.ts`(이동 = 칸 비율, 옛 px 값은 0) · `workbench.tsx`(실제 본문 폭 onLayout · 정규화는 짚은 첫 ~ 마지막 장면만 · 손가락 확대 값은 그 짝에만 · 자세한 도구는 고를 때만 펼침 · 맞춤 정도는 '재생기 시간 알림으로 어림한 95%') · `timing.ts`(늘임 ¼~4배 밖 거절) | 기본 화면 = 영상 · 함께 재생 · 속도 · 맞추기 칩 | **일부**. VoiceOver · 큰 글씨 200% · 아이패드 분할 · 가로는 기기 확인. 글자 배율 상한(maxFontSizeMultiplier)은 앱 전체 관행이라 이번에 걷지 않았다 |

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
| R02 | 하나의 A/B 고르기 — 내 영상(투구 기록 영상 포함) · 사진 앱 · 바로 촬영 · 파일, 기록 없이, 취소하면 아무것도 안 남김 | `app/pitch/compare.tsx`(StartPicker) · `compare/ui/source-picker.tsx` · `compare/source-pick.ts` · `videos/gallery.tsx` · `compare/store.ts`(importForCompare) | native-compare-regress(F07 열 개) | 없음 | implemented / runtime unverified — 처음 · 더하기 · 바꾸기 · 다시 잇기가 한 흐름. 파일 앱은 expo-file-system 58 `File.pickFileAsync`(새 패키지 없음, 기능 유무 확인). iCloud 받기 진행은 시스템 화면에 맡김 |
| R03 | 앱 안 촬영 · 렌즈(초광각) · 확대 · 방향 · 장면 수 고르기 | `compare/store.ts`(launchCameraAsync) | 없음 | 없음 | in progress — 시스템 카메라(렌즈 · 확대 · 방향은 시스템 화면). **장면 수(fps) 고르기 · 렌즈 지정은 없다**(기존 `shoot-camera` 모듈을 비교에 잇는 일은 새 바이너리 · 기기 확인 필요). 권한 거절 안내는 있음 |
| R04 | 영상 사실(길이 · 크기 · 회전 · 코덱 · 장면 수 · 슬로모션) — 모르면 모름 | `compare/timing.ts`(MediaFacts · normalizeFacts · captureMapping) · `compare/ui/pane.tsx`(재생기 값) · `workbench.tsx`(syncFacts) | native-compare 317(사실 정리 · 슬로모션 비율) | 없음 | in progress — 길이 · 크기 · 평균 장면 수 · mimeType 은 재생기에서. **실제 장면 시각표(PTS) · 슬로모션 편집 구간 · 회전 머리는 아직 못 읽는다**(AVFoundation 모듈 필요) — 그래서 실제 걸린 시간은 '모름'으로 둔다 |
| R05 | 한 영상 보기 · A/B 정하기 · 바꾸기 · 교환 · 같은 영상 두 칸 · 들어온 곳으로 뒤로 | `compare/doc.ts` · `compare/source-pick.ts` · `workbench.tsx`(single · 더보기 'A/B 영상 바꾸기') · `videos/compare-math.ts` nav | native-compare · regress(F07 · F02 한 영상 자리) · my-videos(뒤로 길) | 없음 | implemented / runtime unverified. 한 영상 정책: 가져온 영상(앱 안 복사본)은 한 영상이어도 저장 · 자리 기억, 내 영상 한 개를 잠깐 본 것은 안 남김 |
| R06 | 따로 · 함께 재생, 속도 0.1~1×, 소리 없음/A/B, 공통 막대, 한쪽 받는 중이면 둘 다 멈춤 | `compare/transport.ts` · `compare/ui/transport-hook.ts` · `workbench.tsx` | native-compare(재생 줄기) · regress(F03 열 개 — 받기 재개 자리 · 멈춤 · 바꿈 · 오류 · 뒤로 · 반복) | 없음 | implemented / runtime unverified. 0.1× 같은 낮은 속도가 기기에서 되는지 미확인 |
| R07 | 영상마다 이전 · 다음 장면, 정확한 장면 걸음과 짐작을 가름 | `compare/timing.ts`(stepInfo · snapToFrame · stepFrom) | native-compare(24/25/29.97/30/60/120/240 · 가변 · 모름) | 없음 | in progress — 장면 간격이 고르다는 사실을 재생기가 주지 않아 지금은 늘 '짐작'(constantRate null). 정확한 PTS 걸음은 R04 모듈 뒤 |
| R08 | 같은 장면 기준 · 공통 구간 · 다시 맞추기 취소 · 어긋남 고침 · 맞춤 상태 | `compare/timing.ts`(offsetRange · syncQuality) · `transport-hook.ts` · `workbench.tsx` | native-compare · regress(F02 복원 · F08 '최대' 아님) | 없음 | implemented / runtime unverified. 맞춤 정도는 **재생기 시간 알림으로 어림한 95%**(실제 화면 장면끼리 잰 값 아님) — 화면도 그렇게 적는다 |
| R09 | 반복 구간 · 다듬기 · 끝 처리 · 다시 셈 | `doc.ts`(trims · loop 따로 · setTrim · clearTrim · fitLoop) · `timing.ts`(trimmedRange) · `transport-hook.ts`(loop) · `workbench.tsx`(여기서 반복 시작/끝 · 맞추기 단계의 'A/B 여기부터 · 여기까지 · 다듬기 풀기') | native-compare · regress(F05 · R09) | 없음 | implemented / runtime unverified. 기준 장면을 잘라 내는 다듬기는 거절 |
| R10 | 위아래 · 나란히 · 크게 보기, 확대 · 이동, 같이 확대, 맞춤 · 반전 표시 | `compare/geometry.ts` · `ui/annotation-layer.tsx`(두 손가락) · `ui/pane.tsx` · `workbench.tsx` | native-compare(왕복 · 확대 가운데 고정 · 반전) | 없음 | implemented / runtime unverified. 자르기(crop) 화면은 없음(모델만) |
| R11 | 겹쳐 보기 · 투명도 · 반반 나누기 · 공간 맞춤 따로 | `geometry.ts`(Registration · nudgeReg · registrationFrom) · `workbench.tsx`(OverlayBox · 'B 자리' 왼쪽/오른쪽/위/아래/크게/작게/풀기) | native-compare(두 점 쌍) · regress(R11) | 없음 | in progress — 손으로 조금씩 맞추기는 됨. **두 점 쌍을 짚어 맞추는 화면은 아직 없다**(셈만) |
| R12 | 자유선 · 선 · 화살표 · 사각형 · 원 · 글 · 점 · 수평/수직선 · 기울기 · 세 점 각 | `compare/annotations.ts` · `ui/annotation-layer.tsx` · `ui/panels.tsx`(DrawPanel) | native-compare(측정 글 · 검사) | 없음 | implemented / runtime unverified |
| R13 | 고르기 · 옮기기 · 지우기 · 색 · 굵기 · 되돌리기/다시 하기 · 범위 지우기 확인 · 칸/시간별 보임 · 회전 · 다시 열어도 남음 | `annotations.ts`(History · visibleAt · clearTargets) · `workbench.tsx` | native-compare(되돌리기 · 다시 하기 · 범위 지우기 · 장면/구간/내내) | 없음 | implemented / runtime unverified. 손잡이 하나만 옮기기(점 단위)는 없음 — 그림 통째 옮기기 |
| R14 | 시간(불확실성 포함) · 보정한 2D 길이 · 보정 없으면 cm 안 냄 | `timing.ts`(durationText) · `pitch-events.ts`(intervalOf) · `geometry.ts`(Calibration · distance) | native-compare | 없음 | implemented / runtime unverified |
| R15 | 장면별 글 메모 · 목소리 메모 | `doc.ts`(notes) · `ui/panels.tsx`(NotesPanel) | native-compare(메모 · 빼기) | 없음 | in progress — 글 메모는 됨. **목소리 메모 blocked**: 녹음 패키지(expo-audio) 없음 → 새 패키지 · 바이너리 · 마이크 권한 문구 필요 |
| R16 | 그림 얹은 정지 화면 · 짝 정지 화면 · 장면 모음 | `ui/panels.tsx`(Storyboard — 재생기가 뽑은 실제 장면) | 없음 | 없음 | in progress — 장면 모음(실제 장면)은 화면에서 봄. **파일로 저장 · 그림을 얹은 정지 화면 blocked**: 뷰 캡처는 영상 면을 빼먹을 수 있어(계약 9절) AVFoundation 합성 모듈 필요 |
| R17 | A/B · 겹쳐 보기 영상 내보내기 | `compare/export-plan.ts`(planComposition) · `ui/panels.tsx`(ExportPanel 계획 표시) | native-compare(구간 · 속도 · 길이 · 알림) | 없음 | blocked — 합성 · 인코딩 모듈 없음(새 Swift 모듈 + 새 바이너리). 계획 단계까지만, 화면은 '아직 못 해요'로 정직하게 |
| R18 | 해설 녹화(멈춤 · 옮김 · 속도 · 그림 · 목소리) | `export-plan.ts`(planNarration — 조작 기록 → 출력 시간 줄) | native-compare(멈춤 · 건너뜀 · 속도 · 그림 시각 · 끝 멈춤) | 없음 | blocked — 녹음 · 합성 모듈 없음. 시간 줄 계획만 시험 |
| R19 | 계정별 판 붙은 로컬 문서 · 원자 저장 · 깨짐 복구 · 최근 · 복사/이름/지우기 · 다시 잇기 · 원본 안 건드림 | `compare/doc.ts` · `compare/storage.ts` · `compare/fs.ts` · `compare/store.ts` · `app/index.tsx` · `workbench.tsx`(더보기 '사본 만들기' · 없는 영상 '다른 영상'으로 다시 잇기) | native-compare · regress(F01 · F04 · F06 스물넷 · 디스크 파일 한 묶음) | 없음 | implemented / runtime unverified. 계정 한 줄 잠금 · 참조 판정은 폴더 전체 · 끊김마다 정상 판 하나 |
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
| R40 | 결정적 시험 · 기기 확인 표 · 정밀도 측정 · 기존 흐름 회귀 | `scripts/native-compare-selftest.mts` · `scripts/native-compare-regress-selftest.mts` · `native-compare-regress-ui.mts`(`npm run native-compare:test` 가 둘 다) · 이 대장의 기기 확인 표 | 318 + 66 통과 · my-videos 117 + 69 · release-access 692 | 없음 | in progress — 정밀도(어긋남 · 탐색 지연)는 기기에서만 |
| R41 | 네이티브 기능 유무 · 옛 앱 대비 · OTA vs 새 바이너리 | 이번 두 묶음 모두 **JS 만**(새 네이티브 패키지 없음) — expo-video · image-picker · file-system(파일 앱 고르기 포함) · gesture-handler · svg. 파일 앱 고르기는 열 때 함수가 있는지 보고 없으면 단추를 숨김 | 타입 · 린트 | 없음 | implemented / runtime unverified. 배포 안 함 |
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
8. 함께 재생 중 통화 · 뒤로 가기 · 화면 끄기 → 돌아와도 저절로 안 틂. 한쪽만 서버 영상(약한 망)일 때 둘 다 기다리고, **받기가 끝나면 멈춘 그 자리에서** 다시(처음으로 되감지 않음).
9. 어긋남: 시간 코드가 박힌 영상 둘로 0.5× · 1× 재생 시 화면 녹화로 장면 차이 재기(앱의 맞춤 표시는 재생기 알림 기준이라 따로 잰다).
10. 로그아웃 → 다른 계정 로그인 → 최근 비교에 앞사람 것이 안 보이는지 → 다시 처음 계정 → 다시 보이는지.
11. (F07) 앱에 영상이 하나도 없는 계정: 영상 비교 → 사진 앱 A → 한 영상 보기 → '비교 영상 추가' → 사진 앱 B → 앞발 착지 둘 → 함께 재생 → 닫기 → 최근 비교로 다시 열기(같은 자리).
12. (F07) 바로 촬영 A · B, 내 영상 A + 사진 앱 B, 파일 앱에서 고르기(Files), A 만 바꾸기, B 바꾸다 취소(그대로), 같은 영상 두 보기, 사진 앱 권한 거절 · 저장 공간 부족.
13. (F02) 비교를 +1.25초 자리에서 닫고 다시 열기 · 0초 · 음수 자리 · 끝 근처 · 한 영상 자리 — 멈춘 채 같은 장면.
14. (F08) 그리기 켠 채 화면을 굴려 밑 도구까지 가기 · 그리는 동안은 안 굴러감. 320 · 375 · 390 · 430pt · 가로 · 아이패드 분할 창에서 칸 크기 · 확대한 자리가 돌린 뒤에도 같은 곳. 글씨 200% · VoiceOver · 다크/네이비.
15. (F01) 같은 사진 영상을 쓰는 비교 둘(사본 만들기) → 하나 지우기 → 남은 비교의 영상이 그대로 재생되는지.

## 검사 명령

```bash
npm run native-compare:test
```

```bash
npm run my-videos:test
```

```bash
npm run release-access:test
```

```bash
cd native && npx tsc --noEmit -p .
```

마지막 결과(2026-11-02 2차): native-compare 318 + regress 66 통과 · my-videos 117 + 69 · release-access 692(모두 끝 코드 0). 앱 타입 검사는 비교와 상관없는 기존 오류 둘만(`app/library/warmup/index.tsx` · `app/training/routine/[id].tsx` 의 경로 형 변환) — 이 설치는 `cd native && npm ci` 로 잠금 파일대로 맞췄다(전엔 expo-screen-orientation · expo-notifications 가 없어 9개). 바꾼 파일 ESLint 0.

## 이어서 할 일(다음 세션)

1. 실기기 확인(위 순서) — 결과로 R01 · R05 · R06 · R08 · R12~R14 · R19 · R29~R30 · R34 · R36 을 `verified` 로 올리거나 고친다.
2. 출시 정책 결정(영상 비교를 베타에 열지) — 열면 `lib/release-access.ts` · `release-ops.ts` 표 · `npm run release-access:test`.
3. AVFoundation 모듈(새 바이너리): 장면 시각표(PTS) · 슬로모션 편집 구간 · 회전 머리 읽기(R04 · R07 · R30 실제 시간) → 그다음 정지 화면 · 영상 합성 내보내기(R16 · R17) · 녹음 · 해설 녹화(R15 목소리 · R18).
4. 화면 빈칸: 겹쳐 보기 두 점 짚어 맞춤(R11) · 그림 점 단위 손잡이(R13) · 거르기 화면(R31) · 3D 결과 잇기(R33) · 4칸 보기(R26) · 비교 문서 모음 · 태그(R20). (영상마다 다듬기 · 파일 앱 고르기 · 사본 · 다시 잇기는 2차에서 함)
5. 서버 쪽(김민과 맞춘 뒤 · 백업 뒤): 클라우드 백업 · 동기(R21 · R22) · 공유(R23) · 플레이리스트(R24) · 코치 검토(R25).
6. R27 두 기기 · R28 외부 카메라 · R35 자세 후보는 프로토콜 · 엔진 조사부터.
