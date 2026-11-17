# <작업 ID> — <사용자 문제와 목표>

> 이 파일은 빈 양식이다. 발주·구현·배포 승인이 아니다. 복사해 작업별 문서를 만들고 필요한 항목만 구체화한다. 역할과 절차는 ../WORKFLOW.md를 따른다.

## 진행 상태

- 상태: 설계 중 / 부서 발주 확정 / 담당 인계 대기 / 구현 중 / 파트 검수 중 / **사용자 검토·다음 발주 대기** / 사용자 승인 후 보완 중 / 파트 합격 / 필요한 총괄 최종 판정 / 배포 확인
- 발주 판: v1 (판 변경 이유와 수신 확인 기록)
- GPT 발주·파트 검수 담당: <실제 세션 제목/ID>
- 부서 내 설계·통상 구현 선택·보완 판단: 위 GPT가 자율 결정, 총괄 반복 중간 승인 없음
- 보고 등급·발송 조건: <L0 내부 기록 / L1 파트 납품·실질 협의 / L2 사용자 종합 보고·필요 결재 / L3 실제 중대 위험 즉시 보고. 단순 ACK·변화 없는 상태는 발송하지 않음>
- 이번 사용자 승인 범위·한 차례 완료 조건 / 검수 후 체크포인트: <현재 맡길 구현/검사·납품 범위; GPT 검수 후 사용자 보고, 후속 Claude 발주는 사용자 지시 대기>
- Claude 구현 담당: <실제 세션 제목/ID>
- Claude 실행 선택(부서 GPT 판단): <난도·고도화·실패 영향 근거 / 요청 모델 / 노력 / Ultracode 켬·끔 / Fast mode 꺼짐>
- Fable·Max 사전 허락: <미사용 / 사용자 승인 대상·시점·범위. Fable은 노력과 관계없이, Max는 모델과 관계없이 사전 허락>
- 이전 담당 인계(변경 시): <실제 변경/검사/수신/claim 해제 근거; 기존 변경 보존; 새 담당 수신 전 병렬 편집 금지>
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

### Execution profile
<The department GPT selects the model, effort and Ultracode setting for this task without another lead approval. Default substantive implementation to a capable Opus model, high effort and Ultracode; use lighter settings only for genuinely light tasks, and xhigh when justified. Never use Fable or max effort without explicit user approval for this scope, including through subagents, workflows or fallback. Keep Fast mode off. Confirm actual supported settings and their effective response boundary; report requested versus applied values separately. Do not restart running work unnecessarily or silently downgrade heavy work.>

### Acceptance criteria
- AC01: <Observable result and relevant failure/recovery state.>
- AC02: <Data preservation/accessibility/authorization or interaction requirement.>

### Verification and delivery
<Meaningful checks, original exit codes and logs, rendered/device evidence when allowed, unavailable checks reported honestly. Actual changed files/diff, integration paths, residual risks. Stop at ready-for-review; do not self-approve or deploy.>

### Reporting and review budget
<Follow WORKFLOW section 5. Complete this approved implementation batch and necessary pre-delivery self-checks. Deliver once to the department GPT with meaningful evidence. The GPT independently reviews this delivery, then reports directly to the human in that department's chat: completed changes, remaining defects/unverified states, required versus optional improvements, concrete questions, and the proposed next Claude assignment. Ask whether and which next work the user wants. Do not automatically initiate another Claude correction/review/expansion round before the user's explicit instruction for that scope. Group findings for that checkpoint rather than repeatedly sending individual fixes. Keep routine decisions/receipts in this document; no ACK chains, duplicate notices, unchanged-status polling, or arbitrary length caps. Preserve necessary evidence, real checks and immediate reporting of concrete urgent harm. The overall lead is not the routine recipient or substitute for the human checkpoint.>

### Decisions and escalation
<The department GPT decides the approved department's design, implementation order, normal tools/error handling, bounded file organization and corrective requests. Claude asks that GPT about direction/scope/contract questions. Actual owners first coordinate shared files. Escalate only unresolved cross-department conflicts or decisions outside existing user authorization, including shared DB/data, cost, major policy and production release. Lead relay is transport, not intermediate design approval. Continue independent in-scope work. Read WORKFLOW and SESSION_COORDINATION, check/claim/release.>

## Claude 수신·질의·납품 (AI 간 전달은 영어로 기록)

- 수신한 판/기준/담당 등록:
- 실제 모델·노력·Ultracode·Fast mode 및 적용 시점/확인 근거: <요청값과 실제값 구분, Fable/Max 승인 범위, 하위 작업·fallback 예외>
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
- 사용자 종합 보고 위치·제안한 다음 작업 / 실제 사용자 답변·승인 범위: <승인 전에는 다음 Claude 발주하지 않음. 현재 검수 자체를 마치고 보고>

## 사용자 종합 보고·다음 작업 선택 — 납품 검수 후 해당 부서 채팅에 제시

> 수신/진행 메모는 위 기존 구역에 모은다. GPT 납품 검수를 마친 뒤 이 내용을 해당 부서 채팅에서 사용자에게 직접 설명한다. 총괄 보고나 문서 경로만으로 대신하지 않는다. 다음 Claude 발주 전 실제 사용자 답변을 기다린다. 필요한 긴급 위험 보고는 즉시 한다.

- 작업 ID/판·보고 등급·수신자·목적 / 기준→최종 ref 또는 정확한 diff:
- 결과와 부서에서 종합해 내린 결정·이유:
- 이번에 실제 수정한 것·달라진 동작 / 아직 수정해야 할 것:
- 독립 확인·공통 영향·검사/원 종료코드·원로그/재현 위치:
- 미검증·잔여 위험·대안/권장안·상위 결정이 필요한 이유:
- 정확한 결재 항목·배포 허가 범위·다음 행동/담당:
- 다음 Claude 작업 제안: <필수 보완/선택 개선/종료·보류의 구체적 선택안과 영향, 어느 범위를 맡길지 사용자에게 질문>
- 사용자 결정: <대기 / 실제 답변·범위·시점. 무응답·운송·과거 포괄 승인을 이번 후속 허락으로 처리하지 않음>
- 후속 재보고 조건 / 이전 보고 대비 실제 변경(후속일 때만):

## GPT 전체 총괄 최종 판정·릴리스

- 최종 판정: 미검수 / 수정 필요 / 조건부 합격 / 합격
- 승인 대상 ref/diff·발주 판·판정 근거:
- 조건·미해결 사항 및 출시 영향:
- 커밋/푸시/배포: 미실행 / 사용자 허가 범위와 실제 결과
- 배포 뒤 실제 확인 / 미검증 / 복구 계획:

## 변경·결정 이력

- <시점 · 담당 · 변경/질문/답/전달·수신 증거>
