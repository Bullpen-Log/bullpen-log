# 메커니즘 영상 검수 이어하기

## Current setup: 2026-11-13

Current item **1/120: 스텝백 스로우 드릴**, completed0 and user requests0 preserved. Production shared player displayed the same owned clip and description, played it, and showed **loop ON**. No repeat-end wait or new content review. Right-panel opening is queued because this chat is hidden; actual user-panel exposure is unverified.

Use `docs/shoot/video-review-current-workflow.md` for the current research, content-save/read-back, human-confirmation and advancement rules. Its rules supersede the historical memo-only instructions below. Media editing/replacement still needs specific direction. No content, judgment or order changed for this setup. The old unsupported-loop observation below is historical only.


작업: REVIEW-SYNC-20261111 · 작성일: 2026-11-11. 운영 콘텐츠 검수 메모만 옮겼으며 앱·DB·영상·등록 내용은 바꾸지 않았다.

## 지금 이어갈 곳

- 현재 **1/120 · 드리프트 · 스텝백 스로우 드릴**, 사용자 판정 대기다.
- 사용자 완료 **0개**, 영상별 원문 수정 요청 **0건**이다. 오케이/다음 기록이 없으므로 2번으로 넘기지 않는다.
- 현재 검수 ID: `mv-0457d3ca2b3a1169`. DB drill ID는 미확인이다. 자체 영상 식별자 `95d8dd7e-6969-4d30-a207-afc89322912f`, 길이는 마지막 관찰 기준 6.87초다.
- 다음은 **2번 · P3 힌지 드라이브 스로우 (작은 공)**이지만 현재 항목 이동 승인 후에만 연다.
- 마지막 관찰에서 1번은 0초·일시정지, 반복 꺼짐이었다. 사용자는 자동 반복을 요청했지만 당시 기본 재생기에 반복 UI가 없어 미적용으로 남았다. 이 인계에서 현재 브라우저나 VP01/운영 반영 여부를 새로 확인하지 않았다.

## 다른 맥에서 재개하는 순서

1. 최신 AGENTS.md·WORKFLOW·SESSION_COORDINATION·HANDOFF와 공통 인계 안내를 읽고, 승인된 동기화로 실제 받은 커밋 및 이 폴더 존재를 확인한다. 문서 존재만으로 다른 맥 수신을 추정하지 않는다.
2. `checkpoint.json`과 `video-records.json`의 현재 ID·완료·수정 요청을 읽는다. 별도 로컬 기록이 있으면 먼저 비교하고, 의견을 합치되 기존 판정·원문을 덮어쓰지 않는다. 최신성을 판단할 이벤트 시각이 없거나 상충하면 해당 상태만 조율한다.
3. 자신의 오른쪽 인앱 브라우저에서 [투구 드릴](https://dugout-baseball.com/library/mechanics)을 연다. 탭·로그인은 컴퓨터 사이 공유되지 않는다. 기존 검수 탭이 있으면 먼저 현재 영상을 확인한다. 로그인 정보나 서명 주소를 메모에 넣지 않는다.
4. 드리프트의 **스텝백 스로우 드릴**을 열고, 제목·직접/참고 표시·설명·영상 식별자를 현재 화면과 대조한다. 원본 목록과 달라졌으면 차이만 기록하며 임의 재정렬·완료·다음 이동을 하지 않는다. 반복 재생은 지원되는 UI에서 적용하고 실제 상태를 확인하며, 불가하면 미적용으로 남긴다.
5. 영상과 설명이 화면에 실제 보이는지 확인하고 사용자 판정을 기다린다. 이 문서를 읽은 것, GPT가 예전에 본 것, 테스트 결과는 사용자 검수 완료가 아니다.

## 기록과 승인

- **오케이/다음:** 현재 영상 판정·이동만 승인한다. 콘텐츠 수정과 배포 승인이 아니다.
- **수정 의견만:** 영상 ID/제목·분류·시점·원문·요청을 기록하고 현재 영상 유지.
- **수정 필요, 다음:** 메모 후 다음으로 이동한다.
- **검수 중 반영:** 기록만 한다. 전체 검수 종료 후 기존→제안→이유·영향을 먼저 보여 주고 실제 수정 범위를 다시 확인한다. 종료나 과거 반영 요청을 일괄 적용 허가로 사용하지 않는다.
- AI 후보는 해당 영상 차례에 안내하되 사용자 확정 요청으로 올리지 않는다. 후보 10건 중 9건은 영상별, 1건은 야외 영상 가시성에 관한 일반 후보다.
- 직접 촬영 없는 항목만 촬영 필요 목록에 추가한다. 참고 영상만 있음/재생 영상 없음은 다르다. 현재 1번은 직접 촬영으로 확인돼 제외돼 있다. 빈 촬영 목록은 전체 촬영 완료를 뜻하지 않는다.
- 한국/미국/일본의 안전·효능·권리·번역 쟁점을 근거·미확인으로 나눈다. 현재 공식 법률/논문 근거 URL 확인 기록은 없으며 법률·의학적 적합성 완료를 선언하지 않는다.

## 파일과 근거

| 파일 | 내용 |
|---|---|
| `checkpoint.json` | 현재·다음·완료·수정 요청·AI 후보·규칙·보류·촬영/국가 쟁점 |
| `video-records.json` | 실제 목록 순서대로 120개 고유 드릴 기록. 1번 대기, 나머지 사용자 미검수 |
| `provenance.json` | 원본 두 파일의 실제 mtime·SHA-256·복원 범위·식별자 한계 |

원본 JSON 두 파일은 저장소 밖에 보존했다. **원본의 마지막 수정 시각은 2026-11-10 02:07:24.386875+09:00**이며 운영 공지 업데이트가 섞인 파일 시각이다. 영상 관찰·사용자 판정 시각은 별도로 없어서 만들어 넣지 않았다. 이번 문서 작성은 2026-11-11이며 새 검수·기능 검사는 하지 않았다.

공개본에는 운영 콘텐츠의 제목·분류·고유 검수 ID·서명 없는 파일 식별자·일반 검수 의견만 싣는다. 개인정보·계정/로그인 정보·키·임시 서명 URL·영상 원본·개인 건강정보·브라우저 탭 ID는 넣지 않는다. 향후 사용자 원문에 민감한 내용이 섞이면 해당 부분은 개인 원본에 보존하고 공개본에서 제외했다고만 표시한다. 공통 동기화/재개 설정·커밋/푸시는 총괄 담당이며, 이 세션은 자기 폴더만 작성했다.
