/**
 * 트레이닝 화면이 오늘 무엇을 그리는가 — 근력 프로그램 카드와 매일 일정 카드가 같은 날 겹치지 않게(트레이닝 추천 2판 P6-4, 2026-10-13,
 * 사용자 결정 D6 '프로그램 진행 중이면 그날 매일 일정 = 프로그램 운동 그대로').
 *
 * 왜 두는가. 2판 P6-3 부터 프로그램 날의 일정은 그날 프로그램 운동 그대로 짜인다(lib/report/daily-plan.ts programToday). 그런데 화면은 그대로라
 * 같은 날 카드 둘이 섰다 — 맨 위 프로그램 카드(목록 · [운동 시작])와 그 밑 일정 카드(같은 운동의 체크 목록 · 또 하나의 [운동 시작] · 다시 만들기
 * 폼). 둘 중 무엇을 눌러야 하는지 모르고, 일정 쪽 [운동 시작] · '운동 더 하기'(app/actions/workout.ts startWorkout)는 일정이 프로그램 날이 아니면
 * 매일 판을 열어 프로그램을 '다른 운동을 먼저 시작'으로 밀거나, 마친 프로그램 판 뒤에 매일 운동을 덧붙였다(설계 검토 비판 1 빈틈 4 · 5 · 6).
 *
 * 그래서 프로그램이 오늘 주인이면(중재 daily.role — lib/engine/arbiter.ts programOwnsDaily, 일정 만들기와 같은 판정) 프로그램 카드가 주인이고,
 * 일정 자리는 한 줄('오늘은 근력 프로그램 N일차라 그 운동을 그대로 해요.')만 남는다. 매일 [운동 시작] · 다시 만들기 폼 · 체크 목록은 안 그린다.
 * 마친 날의 '운동 더 하기'도 없다(D6 — 보조 운동을 더하지 않는다).
 *
 * 순수 파일이다(DB · 날짜 함수 없음) — 트레이닝 화면(app/(app)/training/page.tsx)과 트레이닝 홈(training-home.tsx)이 같은 값을 쓰고 자체 시험이 표로 본다.
 */
import { programOwnsDaily, type DailyDirective } from '@/lib/engine/arbiter';
import type { DailyPlan } from '@/lib/report/daily-plan';

export type TrainingScreen = {
  /** 오늘 매일 일정 자리를 근력 프로그램이 갖는다 — 일정 자리는 한 줄, 프로그램 카드가 주인 */
  programOwns: boolean;
  /**
   * 저장한 일정이 프로그램 날로 짜였는데 지금은 프로그램이 주인이 아니다(만든 뒤 오늘 세게 던졌거나 '회복'을 골라 프로그램이 쉬게 됐거나, 프로그램을
   * 그만뒀거나 다 마쳤다). 그 일정의 [운동 시작]은 프로그램 시작으로 가서 아무것도 안 연다 — 만들기 전처럼 다시 만들게 한다.
   */
  stalePlan: boolean;
  /** 저장한 일정을 일정 카드(목록 · 시작)로 쓰는가 — 없거나 · 멈춘 날(멈춤 카드가 선다)이거나 · 프로그램이 주인이거나 · 스러진 프로그램 날 일정이면 아니다 */
  usesPlan: boolean;
  /** 프로그램이 주인인 날에 그 전에 만든 매일 일정이 남아 있다 — 한 줄로 '오늘은 쉬어요'(말없이 사라지면 앱이 잘못된 것으로 보인다) */
  planResting: boolean;
  /**
   * 매일 [운동 시작](startWorkout) — 멈추지 않았고 · 일정 카드를 쓰고 · 보일 운동이 있을 때. 일정이 없으면 startWorkout 이 /training 으로 되돌려
   * 보내니(테마가 없다) 단추를 안 낸다 — 예전엔 오늘 마친 운동(strays)만 있는 날에 누르면 아무 일도 없는 단추가 섰다.
   */
  canStart: boolean;
  /** 마친 날 완료 카드의 '운동 더 하기'(같은 startWorkout 으로 다시 연다) — [운동 시작]과 같은 조건 */
  canResume: boolean;
};

/**
 * @param halted  오늘 처방을 멈췄다(통증 확인 전 — today-data picked.halted). 멈춤 카드가 다 말한다.
 * @param daily   중재의 매일 일정 몫(프로그램이 없으면 null — lib/program/load.ts ProgramDayView.arbitration.daily)
 * @param savedPlan 오늘 저장한 일정(없으면 null). program 칸이 있으면 프로그램 날로 짜인 일정(daily-plan.ts DailyPlan.program)
 * @param shownCount 오늘 보일 운동 수(today-data shownPicks — 안전 재확인을 지났거나 이미 마친 것)
 */
export function trainingScreenOf({
  halted,
  daily,
  savedPlan,
  shownCount,
}: {
  halted: boolean;
  daily: Pick<DailyDirective, 'role'> | null | undefined;
  savedPlan: Pick<DailyPlan, 'program'> | null | undefined;
  shownCount: number;
}): TrainingScreen {
  const programOwns = !halted && programOwnsDaily(daily);
  const programPlan = savedPlan?.program != null;
  const stalePlan = !halted && programPlan && !programOwns;
  const usesPlan = !halted && savedPlan != null && !programOwns && !stalePlan;
  const canStart = !halted && usesPlan && shownCount > 0;
  return {
    programOwns,
    stalePlan,
    usesPlan,
    planResting: programOwns && savedPlan != null && !programPlan,
    canStart,
    canResume: canStart,
  };
}

/** 화면 글(해요체 · 줄표 없음 · 60자 안 — 자체 시험이 본다) */
export const TRAINING_SCREEN_TEXT = {
  /** 프로그램이 주인인 날, 그 전에 만든 매일 일정이 남았을 때 한 줄(일정 자리) */
  planResting: '프로그램 날이라 만들어 둔 일정은 오늘 쉬어요.',
  /** 스러진 프로그램 날 일정 — 만들기 카드의 한 줄 */
  stalePlan: '프로그램 날로 만든 일정이라 지금은 쓰지 않아요. 다시 골라 주세요.',
  /** 트레이닝 홈 카드 한 줄 — 스러진 프로그램 날 일정(마침표 없이, 홈 카드의 다른 줄과 같게) */
  stalePlanHome: '오늘 일정을 다시 만들어 주세요',
} as const;
