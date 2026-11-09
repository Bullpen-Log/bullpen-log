# <작업 ID> — <사용자 문제와 목표>

> 이 파일은 빈 양식이다. 발주·구현·배포 승인이 아니다. 복사해 작업별 문서를 만들고 필요한 항목만 구체화한다. 역할과 절차는 ../WORKFLOW.md를 따른다.

## 진행 상태

- 상태: 설계 중 / 발주 확정 / 구현 중 / 질의 대기 / 검수 대기 / 보완 중 / 최종 합격 / 배포 확인
- 발주 판: v1 (판 변경 이유와 수신 확인 기록)
- GPT 발주·파트 검수 담당: <실제 세션 제목/ID>
- Claude 구현 담당: <실제 세션 제목/ID>
- 전체 총괄: 싱커 · 전체 총괄
- 기준: <실제 경로/브랜치/HEAD와 기존 미완료 변경>
- 승인 범위 근거: <사용자 지시 또는 승인된 상위 발주>
- 발주 전달: 미전달 / 전송됨 / 수신 확인 (증거·시점)
- 코드 검수 승인: 미승인 / 파트 합격 / 총괄 최종 합격 (대상 diff/ref)
- 운영 배포 허가: 없음 / 구체적인 사용자 승인과 대상

## GPT 발주 — 영어 구현 지시

### Problem and expected user behavior
<Concrete trigger, current behavior, expected behavior.>

### Scope and boundaries
<Implement these items; preserve these contracts. Exact allowed files/directories, excluded work, shared-file owner. No unapproved schema, dependency, policy, release or deployment changes.>

### Acceptance criteria
- AC01: <Observable result and relevant failure/recovery state.>
- AC02: <Data preservation/accessibility/authorization or interaction requirement.>

### Verification and delivery
<Meaningful checks, original exit codes and logs, rendered/device evidence when allowed, unavailable checks reported honestly. Actual changed files/diff, integration paths, residual risks. Stop at ready-for-review; do not self-approve or deploy.>

### Decisions and escalation
<Settled decisions and truly open questions. Ask the paired GPT before scope/contract changes. Continue independent in-scope work. Read WORKFLOW and SESSION_COORDINATION, check and claim before editing.>

## Claude 수신·질의·납품 (한국어로 기록)

- 수신한 판/기준/담당 등록:
- 구현 상태와 실제 변경 파일/연결 지점:
- 질의 Q01: 사실·영향·권장/대안·필요한 결정·영향 파일:
- 납품한 정확한 diff/ref와 기존 변경의 구분:
- 검사별 명령 / 원래 종료코드 / 전체 로그 위치 / 결과:
- 화면·실기기·운영 검증 구분과 증거:
- 실패·미검증·후속 조치:
- 완료/담당 해제·검수 요청 전달 확인:

## GPT 파트 검수

| 기준 | 실제 확인 근거 | 합격 / 수정 필요 / 미검증 |
|---|---|---|
| AC01 | <파일/함수/diff/실행 증거> | |
| AC02 | | |
| 공통 소비자·실패 복구·권한·회귀 | | |

- Claude 자체 보고와 별도로 확인한 것:
- 수정 요청 R01: <재현/근거/수정 방향/완료 조건; 같은 ID로 재납품>
- 파트 결론과 잔여 한계:

## GPT 전체 총괄 최종 판정·릴리스

- 최종 판정: 미검수 / 수정 필요 / 조건부 합격 / 합격
- 승인 대상 ref/diff·발주 판·판정 근거:
- 조건·미해결 사항 및 출시 영향:
- 커밋/푸시/배포: 미실행 / 사용자 허가 범위와 실제 결과
- 배포 뒤 실제 확인 / 미검증 / 복구 계획:

## 변경·결정 이력

- <시점 · 담당 · 변경/질문/답/전달·수신 증거>
