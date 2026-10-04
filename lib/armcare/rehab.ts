/**
 * 재활 2편 — 아픈 부위(진단 없음) 또는 병명으로 하는 몇 주짜리 재활의 규칙. 순수 함수만(DB 를 모른다).
 *
 * 2026-10-03 사용자분과 정했다(설계: ~/.gstack/projects/…/specs/…-rehab-programs-region-and-diagnosis.md).
 * 규칙의 근거와 숫자는 docs/rehab-guideline.md 다 — 설계서와 숫자가 다르면 가이드라인을 따른다(2026-10-04 기간을 다시 맞춤).
 *
 *   부위 8곳(1편의 아픈 자리) × 4단계 운동 · 피할 것 · 허용 통증
 *   병명 6개 = 바탕 부위 + 차이(운동 더하기 · 빼기 · 허용 통증 · 투구 복귀표까지 바닥 기간)
 *   정도 3단계(가벼움 · 보통 · 심함) → 시작 단계 · 단계별 최소 기간 · 세트
 *   세션 끝 3문항 → 초록 · 노랑 · 빨강 · 진료(judgeSession), 빨강 뒤 쉬기 · 한 칸 낮춤 · 하루 걸러
 *   단계 올리기(stageGate) · 단계 시험(judgeStageTest) · 투구 복귀표 열기(judgeThrowingOpen)
 *   매주 확인 → 정도 낮추기 · 기간 줄이기 · 머물기 · 낮추기 · 진료(weeklyOutcome) · 투구 복귀표(THROWING_STEPS)
 *   오늘 재활 세션(buildRehabSession) — 라이브러리 운동을 카테고리 상관없이 이름으로, 장비가 없으면 바꿔 넣기
 *
 * 규칙은 구획 넷에 나눠 두고 여기서 한데 내보낸다(밖에서는 늘 이 입구로 가져다 쓴다):
 *   rehab-regions.ts — 스위치 · 이름들 · 부위 8곳
 *   rehab-plan.ts — 병명 · 정도와 기간 · 단계별 운동 · 오늘 세션 짜기 · 세션 판정
 *   rehab-progress.ts — 지금 상태 · 단계 올리기 · 단계 시험 · 투구 복귀표
 *   rehab-weekly.ts — 매주 확인 · 저장된 줄 읽기 · 앱의 다른 곳이 읽는 것
 *
 * 읽는 쪽: lib/armcare/rehab-store.ts(DB) · lib/armcare/today.ts(암케어) · app/actions/rehab.ts(저장) ·
 * lib/report/gather.ts(웨이트 · 투구 계획이 재활을 안다 — rehabFacts).
 *
 * 진단하지 않는다. 모든 재활 화면에 '의사 · 치료사의 지시가 먼저'를 함께 둔다(가이드라인 머리말).
 */

export * from '@/lib/armcare/rehab-regions';
export * from '@/lib/armcare/rehab-plan';
export * from '@/lib/armcare/rehab-progress';
export * from '@/lib/armcare/rehab-weekly';
