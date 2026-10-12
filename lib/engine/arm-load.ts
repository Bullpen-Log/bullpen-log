/**
 * 어제 팔 부담 — '경기 다음 날'을 달력이 아니라 부하로 읽는다(트레이닝 추천 2판 D3, P4 커밋 F, 2026-10-12,
 * docs/designs/training-recommendation-engine.md).
 *
 * 왜 두는가. 사용자 결정 D3 은 "경기 다음 날은 달력이 아니라 투구수 × 체감 강도 + 최근 운동 힘듦이 높으면 회복"이다. 매일 일정은
 * 커밋 E 에서 날 종류(lib/engine/microcycle.ts dayKindOf)로 그렇게 바뀌었는데, 다른 두 독자는 아직 달력이었다.
 *   - 근력 프로그램(lib/program/program.ts programSignalsOf)은 어제 '경기' 기록이면 0구 · 15구라도 '경기 다음 날'로 쉬었다.
 *   - 암케어(lib/armcare/routine.ts decideArmcare)는 어제 던졌으면 캐치볼 10구라도 회복 루틴이었다.
 * 그래서 같은 어제를 매일 일정은 근력 날, 프로그램은 쉬는 날, 암케어는 회복 날로 말했다(엇갈림 표). 셋이 같은 물음 '어제 팔 부담이
 * 컸나'를 이 함수 하나로 묻는다 — 날 종류의 R2 · R3' 도 이것을 읽어, 규칙이 둘로 갈라지지 않는다.
 *
 * 무엇을 '컸다'로 보나(위에서 처음 걸리는 것):
 *   hard           어제 세게 던진 날 — Σ 투구수 × 체감 강도 ≥ 2,700 또는 실전 강도 30구(facts.ts isHardOuting, 날 종류 R1 의 어제 쪽)
 *   moderateSpike  어제 중간 부하(세게 던진 날 문턱의 절반 1,350 이상) + 최근 운동 힘듦 급증(날 종류 R2)
 *   claimedNoLog   어제 '오늘 등판'이라 답했는데 어제 투구 기록이 없다(날 종류 R3' — 부하를 모르니 조이는 쪽으로 본다, C6 결정)
 * 셋은 겹치지 않는다 — 앞의 둘은 어제 기록이 있어야 하고 셋째는 기록이 없어야 한다(outing.ts 의 lastSource).
 *
 * 무엇을 안 보나. 오늘 던진 것(오늘 세게 던진 날은 day-state 의 load.hardOutingRecent · 날 종류 R1 이 본다), 그제 이전의 큰 등판(투구
 * 계획의 휴식표 pendingOuting 이 본다 — 암케어는 그쪽도 그대로 읽는다), 투구 기록의 세션 종류 글자('경기' 0구 줄은 부하 0 이라 아무것도
 * 아니다 — 경기는 체감과 상관없이 100% 로 이미 부하에 들어간다, lib/pitch-stats.ts outingLoadOf).
 *
 * 순수 파일이다 — 'server-only' · prisma · 날짜 함수 · 난수 · 글 없음. import 는 facts(세게 던진 날 판정 · 문턱)와 등판 한 곳(outing.ts)
 * 뿐이다. 암케어 루틴 파일(화면 부품도 그 파일의 이름표를 가져간다)이 이것을 부르므로 무거운 파일(날 종류 · 안전 거르기 · 오늘 상태
 * 한 장)을 부르지 않는다 — 날 종류가 이 파일을 부른다(거꾸로가 아니라).
 */
import { outingOf } from '@/lib/engine/outing';
import {
  HARD_OUTING_MIN_LOAD,
  isHardOuting,
  type HardOuting,
  type ReportFacts,
} from '@/lib/report/facts';

/**
 * 날 종류 R2 의 '어제 중간 부하' — 세게 던진 날 문턱(HARD_OUTING_MIN_LOAD 2,700 = 30구 × 90%)의 절반. 1,350 = 20구 × 70% 남짓 — 구원 20구
 * 경기(2,000) · 불펜 30구 70%(2,100)가 들고, 캐치볼 25구 50%(1,250)는 안 든다. 이것만으로는 날을 안 바꾼다(D3 — 투구 부하와
 * 운동 힘듦이 같이 높을 때만). 커밋 E 에서는 microcycle.ts 에 있었다(그 파일이 다시 내보낸다).
 */
export const MODERATE_OUTING_SHARE = 0.5;
export const MODERATE_OUTING_MIN_LOAD = Math.round(
  HARD_OUTING_MIN_LOAD * MODERATE_OUTING_SHARE
);

/** 어제 팔 부담이 컸던 까닭 — 위 머리 주석의 셋 */
export type YesterdayArmLoadKind = 'hard' | 'moderateSpike' | 'claimedNoLog';

export type YesterdayArmLoad =
  /** 어제 던진 날의 재료(facts.patterns.hardOutings 의 daysAgo 1, 새 객체) */
  | { kind: 'hard' | 'moderateSpike'; outing: HardOuting }
  /** 기록이 없어 재료가 없다 */
  | { kind: 'claimedNoLog'; outing: null };

/**
 * 어제 팔 부담이 컸나 — 컸으면 그 까닭, 아니면 null. facts 를 바꾸지 않고, 같은 facts 면 늘 같은 값이다.
 *
 * 프로그램은 이것이 null 이 아니면 '어제 팔 부담이 컸어요'로 쉬고(넘기기 가능), 암케어는 회복 루틴으로 간다. 날 종류는 hard 를 R1
 * (오늘 · 어제 세게 던진 날, 한 덩어리)로 먼저 보고, 나머지 둘을 R2 · R3' 로 읽는다.
 */
export function yesterdayArmLoadOf(facts: ReportFacts): YesterdayArmLoad | null {
  const yesterday =
    (facts.patterns.hardOutings ?? []).find((o) => o.daysAgo === 1) ?? null;
  if (yesterday && isHardOuting(yesterday))
    return { kind: 'hard', outing: { ...yesterday } };
  const spike = facts.condition.trainingEffort?.spikeFlag ?? false;
  if (
    yesterday &&
    spike &&
    yesterday.load != null &&
    yesterday.load >= MODERATE_OUTING_MIN_LOAD
  )
    return { kind: 'moderateSpike', outing: { ...yesterday } };
  if (outingOf(facts).lastSource === 'checkin-yesterday')
    return { kind: 'claimedNoLog', outing: null };
  return null;
}
