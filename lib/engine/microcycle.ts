/**
 * 날 종류 — 오늘이 등판 주기의 어디쯤인가(트레이닝 추천 2판 P4 커밋 E, 2026-10-12, docs/designs/training-recommendation-engine.md).
 *
 * 왜 두는가. 매일 일정의 테마(lib/report/theme.ts decideThemeForBody)와 '고른 운동이 몸 상태와 부딪히나'(workoutConflict)는 같은
 * 몸 상태 사슬(세게 던진 날 → 오늘 등판 → … → 내일 등판)을 두 번 적어 두고 '두 곳을 같이 고칠 것'이라는 주석으로만 묶었다. 그리고
 * 그 사슬은 '세게 던진 날'과 '꼭 오늘 · 꼭 내일 등판'만 알았다 — 2판 D1 로 '2~3일 뒤 · 4일 이상 뒤'를 받기 시작했는데 테마는 그 답을
 * 안 읽었고, 사용자 결정 D3('경기 다음 날은 달력이 아니라 투구수 × 체감 강도 + 최근 운동 부하로')의 운동 부하 반쪽은 어디에도 없었다.
 * 여기서 한 번 가르고, 두 곳은 이 결과의 rank 만 읽는다(사슬 베끼기를 걷는다).
 *
 * 규칙 차례(검토안 4-2 표 + D3 · C6 결정). 위에서 처음 걸리는 것이 그날이다.
 *   R1  hard           오늘 · 어제 세게 던진 날(theme.ts hardOuting 과 같은 값 — day-state.ts recentHardOuting)      → 회복
 *   R3  outingToday    다음 등판이 꼭 오늘(오늘 '오늘 등판', 또는 오늘 답 없이 어제 '내일 등판')                      → 회복
 *   R2  moderateSpike  세게는 아니지만 어제 Σ 투구수 × 체감 강도가 세게 던진 날 문턱의 절반(1,350) 이상이고, 최근 운동 힘듦이
 *                      급증(facts.condition.trainingEffort.spikeFlag — 7일 3개 이상 · 평균 +2)                       → 회복
 *   R3' claimedNoLog   어제 '오늘 등판'이라 답했는데 어제 투구 기록이 없다(outing.lastSource 'checkin-yesterday')       → 보조
 *   R4  outingTomorrow 다음 등판이 꼭 내일                                                                          → 보조
 *   R5  outingSoon     다음 등판 창의 끝이 3일 안(2~3일 뒤 · 어제 '2~3일 뒤'를 하루 당긴 1~2일 뒤) — 근력 날이되 무거운 하체는
 *                      안전 거르기가 뺀다(prescription.ts 2-2), 번갈아 예비 규칙에서는 상체 쪽                       → 근력
 *   R6  outingFar      다음 등판 창의 끝이 없거나 3일 밖(4일 이상 뒤 · 어제 답을 당긴 3일 이상 뒤) — 무거운 하체를 들 수 있고,
 *                      창이 4일 이상 · 짐작 아닌 출처 · 어제 · 오늘 안 던졌으면 번갈아 예비 규칙에서 하체 쪽               → 근력
 *   R7  none           모름('없음' · '오늘 불펜' · 안 적음)                                                         → 지금처럼 번갈아
 * R2 를 R3 뒤에 두는 까닭: 둘 다 회복이라 날은 같고 글만 다르다. 오늘 등판인 날에 '내일부터 무게를 다시 올려요'(R2 글)라고 하면
 * 틀린 말이라(내일은 등판 다음 날) 오늘 등판의 글('무게는 모레부터')을 쓴다. R3' 를 R4 앞에 두는 까닭은 C6 결정 — 기록이 없는
 * 등판 다음 날을 먼저 말한다(둘 다 보조라 날은 같다).
 *
 * 회복(recovery)과 보조(light)는 decideThemeForBody 의 두 자리에 그대로 들어간다 — 회복은 맨 앞(부하 위험 · 컨디션 · 근육통 '심함'보다
 * 앞), 보조는 근육통 '심함' 뒤 · 부하 주의 앞(예전 '내일 등판' 자리). 그래서 '회복이 보조보다 앞' 차례가 그대로다. 근력(strength)과
 * 모름(none)은 테마를 정하지 않고 번갈아 규칙으로 넘긴다 — side 는 '하체 · 상체 마지막 날이 둘 다 없을 때'의 예비 규칙(날짜 홀짝)
 * 자리에만 쓴다. 한쪽 기록이라도 있으면 번갈아가 이긴다(무거운 하체는 R5 에서도 안전 거르기가 빼므로 하체 날이 와도 가벼운 하체 날).
 *
 * 무거운 하체를 실제로 빼는 일은 여기서 하지 않는다 — 안전 거르기(prescription.ts 2-2, HEAVY_LOWER_BLOCK_WITHIN_DAYS)가 한다(그래야
 * '그래도 하기'로 안 풀리고 아침 일정의 재검사도 따라온다). heavyLowerAllowed 는 같은 창 · 같은 문턱으로 그 거르기가 걸리는지 알려 주기만
 * 한다(일정 JSON 의 표시 칸 · 이유 한 줄). 자체 시험이 두 값이 늘 같은지 본다.
 *
 * shorten(구원 '어제 20구 넘게 던졌으면 짧게', 검토안 4-2): 어제 실전 강도(경기, 또는 85% 이상 — facts.HardOuting.nearMaxPitches)로
 * 20구를 넘게 던졌는데 세게 던진 날은 아니면 참. 경기 25구처럼 '세게 던진 날'(2,700) 밑의 구원 등판 다음 날이다. 투구수를 모두 세지
 * 않는 까닭: 캐치볼 · 가벼운 불펜 25구까지 세면 던지는 날 다음 날이 거의 다 짧아진다(가정 — 설계 문서 'P4 결과'). 시간을 줄이는 일은
 * buildDailyPlan 이 한다(회복 날은 effectiveMinutes 가 이미 줄이니 두 번 줄이지 않는다).
 *
 * 이 파일은 글을 만들지 않는다 — 코드(rule)와 재료(hard · yesterday · outing)만 돌려주고, 이유 글은 theme.ts 가 만든다(테마 글이 한
 * 곳에서 나오게 — 설계 검토 G12).
 *
 * 순수 파일이다 — 'server-only' · prisma · 날짜 함수 · 난수 없음. 같은 facts 면 늘 같은 값이다. import 는 등판 한 곳(outing.ts) · 세게
 * 던진 날 한 곳(day-state.ts recentHardOuting) · facts 의 문턱 · 안전 거르기의 창 문턱뿐 — theme.ts 가 이 파일을 부르므로 이 파일이
 * theme.ts 를 부르면 순환이 된다. day-state.ts 가 이 파일을 부르게 하려면 recentHardOuting 을 facts.ts 쪽으로 먼저 옮겨야 한다(지금은
 * 이 파일이 day-state 를 부른다).
 */
import { recentHardOuting } from '@/lib/engine/day-state';
import { outingOf, type Outing } from '@/lib/engine/outing';
import {
  HARD_OUTING_MIN_LOAD,
  type HardOuting,
  type ReportFacts,
} from '@/lib/report/facts';
import { HEAVY_LOWER_BLOCK_WITHIN_DAYS } from '@/lib/report/prescription';

/** 날 종류의 규칙 이름 — 머리 주석의 R1 ~ R7 */
export type DayRule =
  | 'hard'
  | 'outingToday'
  | 'moderateSpike'
  | 'claimedNoLog'
  | 'outingTomorrow'
  | 'outingSoon'
  | 'outingFar'
  | 'none';

/** 그 규칙이 테마에 하는 일 — 회복 · 보조(무게 없음) · 근력 날(번갈아에 맡김) · 모름(번갈아에 맡김) */
export type DayRank = 'recovery' | 'light' | 'strength' | 'none';

/** 규칙 → 하는 일. 규칙이 늘면 여기도 는다(타입이 빠짐을 막는다) */
export const DAY_RULE_RANK: Record<DayRule, DayRank> = {
  hard: 'recovery',
  outingToday: 'recovery',
  moderateSpike: 'recovery',
  claimedNoLog: 'light',
  outingTomorrow: 'light',
  outingSoon: 'strength',
  outingFar: 'strength',
  none: 'none',
};

/**
 * R2 의 '어제 중간 부하' — 세게 던진 날 문턱(HARD_OUTING_MIN_LOAD 2,700 = 30구 × 90%)의 절반. 1,350 = 20구 × 70% 남짓 — 구원 20구
 * 경기(2,000) · 불펜 30구 70%(2,100)가 들고, 캐치볼 25구 50%(1,250)는 안 든다. 이것만으로는 날을 안 바꾼다(D3 — 투구 부하와
 * 운동 힘듦이 같이 높을 때만).
 */
export const MODERATE_OUTING_SHARE = 0.5;
export const MODERATE_OUTING_MIN_LOAD = Math.round(
  HARD_OUTING_MIN_LOAD * MODERATE_OUTING_SHARE
);

/** R6 의 하체 쪽 — 다음 등판이 이 날수 이상 남았으면 등판에서 먼 날(검토안 4-2 '4일 이상: 무거운 하체') */
export const FAR_OUTING_MIN_DAYS = 4;

/** 구원 '어제 실전 강도로 20구 넘게 던졌으면 짧게' — 문턱(초과) · 몫 · 바닥(분) */
export const RELIEF_SHORTEN_PITCHES = 20;
export const SHORTEN_SHARE = 0.75;
export const SHORTEN_MIN_MINUTES = 30;

export type DayKind = {
  rule: DayRule;
  rank: DayRank;
  /**
   * 번갈아 예비 규칙(하체 · 상체 마지막 날이 둘 다 없을 때)에서 고를 쪽 — R5 상체(다리를 아낌) · R6 하체(등판에서 먼 날, 조건은 머리
   * 주석), 그 밖 null(날짜 홀짝 그대로).
   */
  side: 'lower' | 'upper' | null;
  /** 무거운 하체를 들 수 있는 날인가 — 안전 거르기 2-2(prescription.ts)와 같은 창 · 같은 문턱. 거기가 걸리면 false */
  heavyLowerAllowed: boolean;
  /** 구원 '어제 실전 강도로 20구 넘게 → 짧게'(회복 날이면 buildDailyPlan 이 안 줄인다) */
  shorten: boolean;
  /** 오늘 · 어제 세게 던진 날(R1 재료 · 글), 없으면 null */
  hard: HardOuting | null;
  /** 어제 던진 날의 재료(facts.patterns.hardOutings 의 daysAgo 1 — R2 · 짧게 · 글), 어제 안 던졌으면 null */
  yesterday: HardOuting | null;
  /** 등판 한 곳(outingOf)의 값 그대로 — 글 · 시험이 읽는다 */
  outing: Outing;
};

/** 실전 강도로 던진 공 — 옛 facts(load 없음)는 pitches 가 곧 그것이다(facts.ts HardOuting 주석) */
function nearMaxOf(o: HardOuting): number {
  return o.nearMaxPitches ?? (o.load == null ? o.pitches : 0);
}

/** 오늘의 날 종류. facts 를 바꾸지 않고, 같은 facts 면 늘 같은 값이다. */
export function dayKindOf(facts: ReportFacts): DayKind {
  const outing = outingOf(facts);
  const hard = recentHardOuting(facts);
  const yesterday =
    (facts.patterns.hardOutings ?? []).find((o) => o.daysAgo === 1) ?? null;
  const spike = facts.condition.trainingEffort?.spikeFlag ?? false;
  const w = outing.daysUntilNext;
  const soon = w != null && w.max != null && w.max <= HEAVY_LOWER_BLOCK_WITHIN_DAYS;
  const shorten =
    hard == null && yesterday != null && nearMaxOf(yesterday) > RELIEF_SHORTEN_PITCHES;

  const rule: DayRule =
    hard != null
      ? 'hard'
      : outing.nextDay === 0
        ? 'outingToday'
        : spike && yesterday?.load != null && yesterday.load >= MODERATE_OUTING_MIN_LOAD
          ? 'moderateSpike'
          : outing.lastSource === 'checkin-yesterday'
            ? 'claimedNoLog'
            : outing.nextDay === 1
              ? 'outingTomorrow'
              : soon
                ? 'outingSoon'
                : w != null
                  ? 'outingFar'
                  : 'none';

  /* 등판에서 먼 날 — 짐작한 출처(달력 · 같은 요일)는 무거운 쪽을 허락하지 않는다(outing.ts soft) */
  const farFromOuting =
    w != null &&
    w.min >= FAR_OUTING_MIN_DAYS &&
    !outing.soft &&
    (outing.daysSinceLast == null || outing.daysSinceLast >= 2);
  const side =
    rule === 'outingSoon'
      ? 'upper'
      : rule === 'outingFar' && farFromOuting
        ? 'lower'
        : null;

  return {
    rule,
    rank: DAY_RULE_RANK[rule],
    side,
    heavyLowerAllowed: !soon,
    shorten,
    hard: hard ? { ...hard } : null,
    yesterday: yesterday ? { ...yesterday } : null,
    outing,
  };
}

/** 구원 '짧게' — 5분 단위로 내리고 바닥 30분(이미 그보다 짧으면 그대로). 회복 날에는 부르지 않는다(effectiveMinutes 가 줄인다) */
export function shortenedMinutes(minutes: number): number {
  const cut = Math.floor((minutes * SHORTEN_SHARE) / 5) * 5;
  return Math.min(minutes, Math.max(SHORTEN_MIN_MINUTES, cut));
}

/** 짧게 잡은 까닭의 재료 — 어제 실전 강도로 던진 공(글은 theme · daily-plan 이 만든다) */
export function shortenPitchesOf(kind: DayKind): number | null {
  return kind.shorten && kind.yesterday ? nearMaxOf(kind.yesterday) : null;
}
