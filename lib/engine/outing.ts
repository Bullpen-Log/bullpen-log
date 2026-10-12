/**
 * 등판 한 곳 — 다음 등판과 지난 등판을 facts 에서 읽는다. 트레이닝 추천 2판 P4 커밋 B(2026-10-12,
 * docs/designs/training-recommendation-engine.md).
 *
 * 왜 두는가. P3 까지 '다음 등판까지 며칠인가'를 facts 에서 꺼내는 곳이 둘이었다 — 매일 일정(lib/report/theme.ts 의
 * plannedOuting)과 오늘 상태 한 장(lib/engine/day-state.ts 의 outing 칸)이 저마다 lib/checkin.ts 의 nextOutingWindow 를 불렀고,
 * 지난 등판(기록이 먼저 · 기록이 없으면 어제 '오늘 등판' 답)은 day-state 안에만 있었다. P4 에서 등판 전 무거운 하체 빼기 ·
 * 날 종류(부하 기준) · 달력 · 같은 요일 짐작이 같은 값을 읽게 되는데, 부르는 곳마다 따로 꺼내면 같은 아침에 테마와 안전 거르기가
 * 다른 등판 창을 본다(설계 검토 G2). 그래서 facts 에서 등판을 읽는 일은 여기 한 곳에서 하고, 독자(plannedOuting · day-state · 일정 지문 ·
 * 앞으로의 안전 규칙)는 이것만 부른다.
 *
 * 이 파일이 새 규칙을 만들지는 않는다. 답 하나를 날로 읽는 규칙(nextOutingDays) · 오늘 · 어제 답 합치기(nextOutingWindow) ·
 * 하루로 못 박기(exactOutingDay) · 오늘 할 일(todayOutingRole)은 그대로 lib/checkin.ts 에 있고, 여기서는 facts 의 어느 칸을
 * 넘기는지와 두 출처를 가르는 것만 한다. 그래서 처음 커밋(동작 변화 0)에서 값은 P3 와 글자까지 같다 — 자체 시험
 * '[2판 P4] 등판 한 곳'이 P3 의 식(글자 그대로 옮겨 둔 것)과 견준다.
 *
 * 출처를 둘로 가른다(설계 검토 G3). P3 의 day-state 는 칸 하나(source)가 '지난 등판이 어디서 왔나'를 말하고 다음 등판의 출처는
 * nextFrom 으로 따로 두었다. 이름이 섞이면 "어제 등판이라 답했는데 기록이 없다"(lastSource 'checkin-yesterday')와 "다음 등판을
 * 어제 답으로 안다"(nextSource 'checkin-yesterday')를 가르기 어렵다. 그래서
 *   nextSource  다음 등판을 무엇으로 아나 — 오늘 답 'checkin' · 어제 답을 하루 당김 'checkin-yesterday' · 없음 'none'
 *               (달력 'calendar' · 같은 요일 짐작 'estimate' 은 커밋 G 몫이라 지금은 나오지 않는다)
 *   lastSource  지난 등판을 무엇으로 아나 — 투구 기록 'log' · 어제 '오늘 등판' 답(기록 없음) 'checkin-yesterday' · 없음 'none'
 * 지난 등판에 투구 기록을 쓰지만 다음 등판에는 쓰지 않는다 — 오늘 던진 기록은 세게 던진 날(부하, facts.ts isHardOuting)이
 * 보는 것이지 다음 등판이 아니다(오늘 경기 20구가 '오늘 등판'이 되면 부하 기준(D3)과 부딪친다 — 설계 검토 G15).
 *
 * soft 는 짐작한 출처(달력 · 같은 요일)일 때만 참이다 — 그런 출처는 조이는 쪽(가볍게 · 무게 빼기)에만 쓰고 무거운 쪽을 허락하는
 * 데는 쓰지 않는다(설계 검토 G22). 지금은 그 출처가 없어 늘 거짓이다.
 *
 * 어제 답의 이월. 범위(daysUntilNext)는 어제 답을 하루 당긴 값까지 싣는다(어제 '2~3일 뒤' → 오늘 1~2일 뒤 — 짐작이 아니라 같은 말의
 * 다른 기준일, lib/checkin.ts nextOutingWindow). 그날로 못 박힌 날(nextDay)은 꼭 오늘 · 꼭 내일만 나오고, 어제 답에서는
 * '내일 등판' 하나만 오늘(0)이 된다 — 날을 못 박는 독자(plannedOuting · 영양 · 프로그램)가 이것만 쓴다.
 *
 * 순수 파일이다 — 'server-only' · prisma · 날짜 함수(appNow) · 난수 없음, import 는 lib/checkin.ts 와 facts 의 타입뿐. theme ·
 * day-state · 일정 지문이 모두 이것을 부르므로 이 파일이 그쪽을 부르면 순환이 된다(자체 시험이 import 를 지킨다).
 */
import {
  exactOutingDay,
  nextOutingDays,
  nextOutingWindow,
  parseThrowPlan,
  todayOutingRole,
  type OutingWindow,
  type ThrowPlan,
} from '@/lib/checkin';
import type { ReportFacts } from '@/lib/report/facts';

/** 다음 등판을 무엇으로 아나 — 위 머리 주석. 'calendar' · 'estimate' 는 커밋 G(달력 · 같은 요일 짐작) 몫 */
export type OutingNextSource =
  'checkin' | 'checkin-yesterday' | 'calendar' | 'estimate' | 'none';

/** 지난 등판을 무엇으로 아나 — 투구 기록 · 어제 '오늘 등판' 답(기록 없음) · 없음 */
export type OutingLastSource = 'log' | 'checkin-yesterday' | 'none';

/** 짐작한 출처인가 — 조이는 쪽에만 쓰고 무거운 쪽을 허락하는 데는 안 쓴다 */
export function isSoftOutingSource(source: OutingNextSource): boolean {
  return source === 'calendar' || source === 'estimate';
}

export type Outing = {
  /** 다음 등판까지 남은 날(오늘 답, 없으면 어제 답을 하루 당겨), 모르면 null. max null 은 끝이 없음(4일 이상 뒤) */
  daysUntilNext: OutingWindow | null;
  /** 그 범위가 하루로 못 박히면 그날(0 = 오늘 · 1 = 내일), 아니면 null(lib/checkin.ts exactOutingDay) */
  nextDay: number | null;
  /** daysUntilNext 를 무엇으로 아나 */
  nextSource: OutingNextSource;
  /** 짐작한 출처(달력 · 같은 요일)인가 — 지금은 늘 false */
  soft: boolean;
  /** 오늘 할 일 — 등판(오늘 0~0) · 불펜(오늘 '오늘 불펜') · 없음(lib/checkin.ts todayOutingRole) */
  role: 'game' | 'bullpen' | null;
  /** 오늘 · 어제 답(목록 밖 글자는 null) */
  answerToday: ThrowPlan | null;
  answerYesterday: ThrowPlan | null;
  /** 오늘 답을 남겼는가 — '없음'이나 목록 밖 글자도 답이다(그때 daysUntilNext 는 null 이고 어제 답을 이월하지 않는다) */
  answeredToday: boolean;
  /** 마지막 등판으로부터 지난 날 — 기록이 먼저, 기록이 없거나 어제 답보다 멀면 어제 '오늘 등판' 답(1), 둘 다 없으면 null */
  daysSinceLast: number | null;
  /** daysSinceLast 를 무엇으로 아나 */
  lastSource: OutingLastSource;
  /** 마지막으로 던진 날의 투구수(기록에서만) */
  lastPitches: number | null;
  /** 마지막으로 던진 날의 Σ 투구수 × 체감 강도(%)(facts.patterns.hardOutings 의 그날, 이레 안 · 옛 facts 는 null) */
  lastLoad: number | null;
};

/**
 * outingOf 가 읽는 등판 답 — facts 칸 글자 그대로(목록 밖 글자도 버리지 않는다 — '답함'을 가르는 데 쓴다). 칸이 없는 옛 facts 는 null.
 *
 * 일정 지문(lib/report/plan-fingerprint.ts)이 같은 함수로 같은 칸을 담는다 — 판단이 읽는 칸과 지문 칸이 어긋나지 않게(P2 규칙).
 * 달력 · 같은 요일 짐작(커밋 G)처럼 outingOf 가 새 칸을 읽게 되면 그 칸도 지문에 넣는다.
 */
export function outingAnswersOf(facts: ReportFacts): {
  today: string | null;
  yesterday: string | null;
} {
  return {
    today: facts.condition.throwPlanToday ?? null,
    yesterday: facts.condition.throwPlanYesterday ?? null,
  };
}

/**
 * 오늘의 등판 — 다음 것과 지난 것. 같은 facts 면 늘 같은 값이다(날짜 함수 · 난수 없음). facts 를 바꾸지 않고, 돌려주는 범위는 새 객체다.
 */
export function outingOf(facts: ReportFacts): Outing {
  const answers = outingAnswersOf(facts);
  const patterns = facts.patterns;

  /* 다음 등판 — 오늘 답이 이기고, 없으면 어제 답을 하루 당겨(lib/checkin.ts nextOutingWindow) */
  const next = nextOutingWindow(answers.today, answers.yesterday);
  const nextSource: OutingNextSource =
    next.from === 'today'
      ? 'checkin'
      : next.from === 'yesterday'
        ? 'checkin-yesterday'
        : 'none';
  const answerYesterday = parseThrowPlan(answers.yesterday);

  /*
   * 지난 등판 — 기록이 먼저다. 어제 '오늘 등판'이라 답했는데 어제 기록이 없으면(던지고 안 적었거나 취소) 기록보다 가까운
   * 그 답을 1일 전 등판으로 둔다 — 투구수 · 부하는 모르니 null(D3 · P4 가 이 칸을 읽는다). 기록이 오늘 · 어제 것이면 기록이 이긴다.
   * 어제 답이 '그날 등판'이었나는 답 글자를 직접 견주지 않고 lib/checkin.ts 규칙으로 본다(어제 기준 꼭 0일 뒤).
   */
  const logDays = patterns.restDays;
  const yesterdayGame = exactOutingDay(nextOutingDays(answerYesterday)) === 0;
  const fromLog = logDays != null && (logDays <= 1 || !yesterdayGame);
  const lastSource: OutingLastSource = fromLog
    ? 'log'
    : yesterdayGame
      ? 'checkin-yesterday'
      : 'none';

  return {
    daysUntilNext: next.days ? { ...next.days } : null,
    nextDay: exactOutingDay(next.days),
    nextSource,
    soft: isSoftOutingSource(nextSource),
    role: todayOutingRole(answers.today, answers.yesterday),
    answerToday: parseThrowPlan(answers.today),
    answerYesterday,
    answeredToday: answers.today != null,
    daysSinceLast: fromLog ? logDays : yesterdayGame ? 1 : null,
    lastSource,
    lastPitches: fromLog ? patterns.lastOutingPitches : null,
    lastLoad: fromLog
      ? ((patterns.hardOutings ?? []).find((o) => o.daysAgo === logDays)?.load ?? null)
      : null,
  };
}
