# 싱커 비교 화면 메인과 서브1 작업 인계

작업 식별자: `sinker-immersive-2026-11-03-im01-im12`.

사용자가 클로드 서브1의 Opus5.5 높음 실행과 메인 작업을 보완하는 협업을 승인했다. 두 세션은 `/Users/yuno/Developer/bullpen-log`를 쓰므로 동일 파일을 동시에 수정하지 않는다. 다른 변경은 보존한다. 이 문서는 작업 분담 계약이며 앱 구현 완료 보고가 아니다.

## 메인 소유

메인은 기존 SS01–SS07 교정을 끝낸다. 기존 `native/src/compare/` 파일, 비교 라우트, 기존 비교 시험, 구현 대장·HANDOFF는 인계 전까지 메인이 수정한다. 서브1을 위해 SS 수정을 중단하거나 이전 파일로 되돌리지 않는다. 몰입 화면 IM01–IM12로 범위를 중복 확대하지 않는다.

교정과 관련 검사가 끝났고 기존 파일을 더 이상 수정하지 않을 때, 메인만 다음 파일을 새로 작성한다.

`docs/designs/sinker-pitch-video-single-screen-main-ready.md`

필수 항목:

- 위 작업 식별자.
- `status: ready-for-sub1-integration`.
- 완료한 SS 항목과 미완료·제한, 실행한 검사와 결과, 기준 HEAD.
- 새로 만든 모듈의 공개 API와 서브1이 재사용할 부분.
- 넘기는 파일 목록/범위와 인계 후 해당 파일 수정을 멈춘다는 명시.
- 기존 불필요한 작업을 버리거나 통째로 덮어쓰지 말라는 주의사항.

미완료 또는 계속 수정 중이면 준비 완료로 쓰지 않는다. 진행 상태나 예상만으로 소유권이 넘어가지 않는다. 예전 날짜·다른 식별자의 인계는 유효하지 않다.

## 서브1 소유

명세는 다음 두 문서다.

- `docs/designs/sinker-pitch-video-immersive-plan.md`
- `docs/designs/sinker-pitch-video-immersive-claude-prompt.md`

### 인계 전

기존 파일은 읽기만 한다. 새 파일을 아래 독립 영역에 만들고, 생산 코드의 import·연결은 아직 추가하지 않는다.

- `native/src/compare/immersive/`: 검은 화면 전용 팔레트, 채움/전체와 상단 정렬의 순수 계산, 겹침 농도·레이어·도구 숨김 상태 등 독립 모듈.
- `scripts/native-compare-immersive-selftest.mts`: 독립 시험. `package.json`과 기존 시험 실행기는 아직 고치지 않고 직접 실행한다.
- `docs/designs/sinker-pitch-video-immersive-sub1-status.md`: 서브1만 수정하는 진행·통합 보고.

같은 이름의 파일이 이미 있으면 소유자를 확인하고 덮어쓰지 않는다. 기존 worktree `sub1`에는 다른 미완료 변경이 있으므로 reset/clean/checkout/통째 복사를 하지 않는다. 새 worktree·브랜치를 만들 필요 없이 위 범위에서 진행한다.

기존 `workbench.tsx`, `pane.tsx`, `geometry.ts`, `workspace-layout.ts`, `workspace-parts.tsx`, `note-editor.tsx`, `transport-hook.ts`, `fit.ts`, `side-playback.ts`, `tool-bar.tsx`, `store.ts`, `doc.ts`, 저장 모듈, 기존 시험·공용 대장·HANDOFF·package.json은 인계 전 수정 금지다. 전용 새 파일에서 기존 모듈을 읽어 시험할 수는 있지만 변경 중인 결과를 확정된 기준으로 간주하지 않는다.

### 인계 후

메인의 정확한 식별자와 ready 상태, 파일 해제 선언을 확인한 뒤 기존 파일을 다시 읽는다. 새 HEAD·git diff·API를 확인하고 새 모듈을 현재 코드에 필요한 부분만 연결한다. 오래된 사본·과거 커밋·자체 복제본을 통째로 덮어쓰지 않는다. 메인이 완료한 SS 교정을 그대로 재사용한다.

사용 가능한 공간·영상 좌표 변환·팔레트는 기존 구조에 연결하고 두 개의 경쟁 구현을 남기지 않는다. 기존 회귀와 IM 시험을 함께 실행한다. 서브1 완료 보고에는 실제 메인 폴더 연결 여부와 남은 미검증 사항을 적는다. 독립 모듈만 만든 상태를 앱 반영 완료로 보고하지 않는다.

인계 파일이 없으면 독립 작업을 계속한다. 시간이 지났거나 메인 파일이 한동안 바뀌지 않았다는 이유만으로 파일을 수정하지 않는다. 독립 작업이 끝나도 인계가 없으면 상태 보고에 통합 대기를 명시하고 임의 인수하지 않는다. 복구 불가능한 무한 대기나 짧은 간격의 파일 폴링 대신 유의미한 작업 단계 끝에서 확인한다.

## 공통 제약

시뮬레이터·Metro·Expo 개발 서버·로컬 네이티브 빌드 금지. 공유 DB 쓰기·마이그레이션·더미 자료·새 의존성·키/.env 열람 금지. 이 작업의 커밋·푸시·OTA·배포는 승인되지 않았다. 이전 세션의 '올려줘'를 재사용하지 않는다. 모의 검사와 실제 기기 검증을 구분한다. 사용자에게는 한국어로 보고한다.
