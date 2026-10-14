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
 *   nextSource  다음 등판을 무엇으로 아나 — 오늘 답 'checkin' · 어제 답을 하루 당김 'checkin-yesterday' · 달력 'calendar' ·
 *               같은 요일 짐작 'estimate' · 없음 'none'
 *   lastSource  지난 등판을 무엇으로 아나 — 투구 기록 'log' · 어제 '오늘 등판' 답(기록 없음) 'checkin-yesterday' · 없음 'none'
 * 지난 등판에 투구 기록을 쓰지만 다음 등판에는 쓰지 않는다 — 오늘 던진 기록은 세게 던진 날(부하, facts.ts isHardOuting)이
 * 보는 것이지 다음 등판이 아니다(오늘 경기 20구가 '오늘 등판'이 되면 부하 기준(D3)과 부딪친다 — 설계 검토 G15).
 *
 * 달력 · 같은 요일 짐작(2판 P4 커밋 G, 2026-10-12). 답을 안 적는 날에는 경기 아침에도 근력 날이 나왔다(기준선 ⑤ '답을 지운 경기
 * 아침'). 그래서 체크인 답이 다음 등판을 말하지 않을 때만 두 출처를 차례로 본다:
 *   1. 체크인 — 오늘 답, 없으면 어제 답을 하루 당겨(lib/checkin.ts nextOutingWindow). 이것이 범위를 주면 끝(짐작이 답을 뒤집지 않는다).
 *      오늘 '없음'은 '가까운 등판 없음'이라는 답이라 여기서 멈춘다 — 달력 · 짐작을 안 본다.
 *   2. 달력 — 홈 캘린더의 내 일정 중 이름이 등판으로 읽히는 가장 가까운 것(오늘 ~ 14일 뒤, facts.condition.outingCalendar).
 *   3. 같은 요일 — 최근 4주(어제부터 28일 전까지) 같은 요일에 경기가 ESTIMATE_MIN_GAMES(3)번 이상이면 오늘부터 가장 가까운 그 요일
 *      (오늘도 된다 — 경기 아침, facts.patterns.gameDates). 5일 로테이션은 요일이 돌아 안 걸린다.
 *   오늘 '오늘 불펜'이면 두 짐작 모두 오늘(0일)은 건너뛴다 — 오늘이 무슨 날인지는 답이 말했다(다음 등판은 아직 모른다).
 * 달력이 있으면 같은 요일은 안 본다 — 달력은 사람이 적은 것이고 요일은 기록으로 어림한 것이라.
 *
 * soft 는 짐작한 출처(달력 · 같은 요일)일 때만 참이다 — 그런 출처는 조이는 쪽(무거운 하체 빼기 · 보조 날)에만 쓰고, 회복으로 보내거나
 * 무거운 쪽을 허락하는 데는 쓰지 않는다(설계 검토 G22). 그래서 짐작한 날은 범위(daysUntilNext — 안전 거르기 2-2 가 읽는다)에는 싣고
 * 하루로 못 박힌 날(nextDay — 회복 · 쉬기를 내는 독자가 읽는다)은 비운다. 날 종류(lib/engine/microcycle.ts)는 짐작한 오늘 · 내일을
 * 보조 날(softOutingNear)로, 짐작한 4일 이상 뒤를 '모름'으로 읽는다. 근력 프로그램 · 암케어 · 영양은 짐작을 안 읽는다(답 · 기록만).
 *
 * 어제 답의 이월. 범위(daysUntilNext)는 어제 답을 하루 당긴 값까지 싣는다(어제 '2~3일 뒤' → 오늘 1~2일 뒤 — 짐작이 아니라 같은 말의
 * 다른 기준일, lib/checkin.ts nextOutingWindow). 그날로 못 박힌 날(nextDay)은 꼭 오늘 · 꼭 내일만 나오고, 어제 답에서는
 * '내일 등판' 하나만 오늘(0)이 된다 — 날을 못 박는 독자(plannedOuting · 영양 · 프로그램)가 이것만 쓴다.
 *
 * 순수 파일이다 — 'server-only' · prisma · 날짜 함수(appNow · new Date) · 난수 없음, import 는 lib/checkin.ts 와 facts 의 타입뿐. theme ·
 * day-state · 일정 지문이 모두 이것을 부르므로 이 파일이 그쪽을 부르면 순환이 된다(자체 시험이 import 를 지킨다). 요일은 날짜 글자를
 * Date.UTC 로 날 번호로 바꿔 셈한다(시각 · 시간대를 안 읽는다).
 */
import {
  exactOutingDay,
  nextOutingDays,
  nextOutingWindow,
  parseThrowPlan,
  saysNoOuting,
  todayOutingRole,
  type OutingWindow,
  type ThrowPlan,
} from '@/lib/checkin';
import type { ReportFacts } from '@/lib/report/facts';

/** 다음 등판을 무엇으로 아나 — 위 머리 주석. 'calendar' · 'estimate' 는 짐작한 출처(soft, 커밋 G) */
export type OutingNextSource =
  'checkin' | 'checkin-yesterday' | 'calendar' | 'estimate' | 'none';

/** 지난 등판을 무엇으로 아나 — 투구 기록 · 어제 '오늘 등판' 답(어제 기록이 쉰 날 줄까지 없음) · 없음 */
export type OutingLastSource = 'log' | 'checkin-yesterday' | 'none';

/** 짐작한 출처인가 — 조이는 쪽에만 쓰고 무거운 쪽을 허락하는 데는 안 쓴다 */
export function isSoftOutingSource(source: OutingNextSource): boolean {
  return source === 'calendar' || source === 'estimate';
}

/**
 * 같은 요일 짐작 — 최근 이 날수(어제부터, 4주) 안의 경기 날짜를 요일마다 센다. 재료(facts.patterns.gameDates)를 고르는 창(facts.ts
 * GAME_DATES_DAYS)과 같은 값이어야 한다(자체 시험이 본다) — 여기서 한 번 더 거르는 것은 손으로 만든 facts 를 막으려는 것뿐.
 */
export const ESTIMATE_LOOKBACK_DAYS = 28;

/**
 * 같은 요일에 경기가 이만큼 있어야 짐작한다 — 4주 중 3번. 2번이면 격주 경기도 잡지만 우연이 너무 많이 걸리고, 4번이면 비로 한 주
 * 거른 선수가 바로 빠진다. 짐작은 가볍게 하는 쪽에만 쓰니(soft) 조금 넉넉한 쪽을 골랐다.
 */
export const ESTIMATE_MIN_GAMES = 3;

/** 짐작한 다음 등판 — 어느 출처로 며칠 뒤인지(이유 글 · 시험이 읽는다). 달력 일정의 이름은 싣지 않는다(글이 안 쓴다) */
export type OutingGuess =
  | { source: 'calendar'; days: number }
  | {
      source: 'estimate';
      days: number;
      /** 그 요일 — 0 일요일 ~ 6 토요일 */
      weekday: number;
      /** 최근 4주 그 요일의 경기 수(ESTIMATE_MIN_GAMES 이상) */
      games: number;
    };

/**
 * 짐작의 재료를 판단 단위로 — 일정 지문(lib/report/plan-fingerprint.ts)이 이 값을 담는다(판단이 읽는 칸 = 지문 칸, P2 규칙).
 * 달력은 다음 등판까지 며칠, 같은 요일은 오늘부터 0~6일 뒤 중 짐작이 서는 날 모두(오름차순 — '오늘 불펜'이면 오늘을 건너뛰어 다른 날을
 * 쓰므로 가장 가까운 하루만 담으면 바뀜을 놓친다). facts 에 두 칸이 다 없으면(옛 facts · 달력을 안 넘긴 입력) null.
 */
export type OutingGuessInputs = { calendar: number | null; estimate: number[] };

export type Outing = {
  /**
   * 다음 등판까지 남은 날(오늘 답, 없으면 어제 답을 하루 당겨, 그것도 없으면 달력 · 같은 요일 짐작 — 머리 주석), 모르면 null. max null 은
   * 끝이 없음(4일 이상 뒤). 짐작한 날도 여기는 싣는다 — 안전 거르기(prescription.ts 2-2)가 무거운 하체를 빼는 조이는 쪽이라.
   */
  daysUntilNext: OutingWindow | null;
  /**
   * 그 범위가 하루로 못 박히면 그날(0 = 오늘 · 1 = 내일), 아니면 null(lib/checkin.ts exactOutingDay). 짐작한 출처(soft)면 늘 null —
   * 이 값을 읽는 독자(plannedOuting · 날 종류의 오늘 등판 · 내일 등판)는 회복 · 보조를 내므로, 짐작으로 회복을 내지 않게 비운다.
   */
  nextDay: number | null;
  /** daysUntilNext 를 무엇으로 아나 */
  nextSource: OutingNextSource;
  /** 짐작한 출처(달력 · 같은 요일)인가 — 조이는 쪽에만 쓴다 */
  soft: boolean;
  /** 짐작했으면 그 재료(어느 출처 · 며칠 뒤 · 요일), 아니면 null */
  guess: OutingGuess | null;
  /** 오늘 할 일 — 등판(오늘 0~0) · 불펜(오늘 '오늘 불펜') · 없음(lib/checkin.ts todayOutingRole) */
  role: 'game' | 'bullpen' | null;
  /** 오늘 · 어제 답(목록 밖 글자는 null) */
  answerToday: ThrowPlan | null;
  answerYesterday: ThrowPlan | null;
  /** 오늘 답을 남겼는가 — '없음'이나 목록 밖 글자도 답이다(그때 daysUntilNext 는 null 이고 어제 답을 이월하지 않는다) */
  answeredToday: boolean;
  /**
   * 마지막 등판으로부터 지난 날 — 기록이 먼저, 기록이 없거나 어제 답보다 멀면 어제 '오늘 등판' 답(1, 어제 기록이 한 줄도 없을 때만), 둘 다
   * 없으면 null
   */
  daysSinceLast: number | null;
  /** daysSinceLast 를 무엇으로 아나 */
  lastSource: OutingLastSource;
  /**
   * 어제 '오늘 등판'이라 답했는데 어제 투구 기록이 한 줄도 없다(쉰 날 줄까지 센다 — facts.patterns.loggedYesterday). 지난 등판(lastSource)과
   * 따로 둔다(2판 P4 검토, 2026-10-12): lastSource 는 '가장 최근 던진 날'이라 오늘 캐치볼 한 줄만 남겨도 'log' 가 되어, 어제의 기록 없는
   * 등판이 지워졌다(날 종류 R3' · 프로그램 쉬기 · 암케어 회복이 꺼짐). 어제 팔 부담(lib/engine/arm-load.ts claimedNoLog) · 오늘 상태 한 장의
   * 이유 줄 · 체크인의 어제 등판 줄(lib/outing-line.ts asksYesterdayPitches)이 모두 이 규칙 하나다.
   */
  claimedYesterdayNoLog: boolean;
  /** 마지막으로 던진 날의 투구수(기록에서만) */
  lastPitches: number | null;
  /** 마지막으로 던진 날의 Σ 투구수 × 체감 강도(%)(facts.patterns.hardOutings 의 그날, 이레 안 · 옛 facts 는 null) */
  lastLoad: number | null;
};

/**
 * outingOf 가 읽는 등판 답 — facts 칸 글자 그대로(목록 밖 글자도 버리지 않는다 — '답함'을 가르는 데 쓴다). 칸이 없는 옛 facts 는 null.
 *
 * 일정 지문(lib/report/plan-fingerprint.ts)이 같은 함수로 같은 칸을 담는다 — 판단이 읽는 칸과 지문 칸이 어긋나지 않게(P2 규칙).
 * 달력 · 같은 요일 짐작(커밋 G)의 칸은 아래 outingGuessInputsOf 가 같은 일을 한다.
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

/** 최근 4주(어제까지) 마지막 경기 날 — 시즌 중 선발 프로그램이 '등판 며칠 뒤'를 센다(lib/program/load.ts inSeasonKindOf). 없으면 null */
export function lastGameDateOf(facts: ReportFacts): string | null {
  return facts.patterns.gameDates?.at(-1) ?? null;
}

const DAY_MS = 86_400_000;

/** 'YYYY-MM-DD' → 1970-01-01 부터 센 날 번호. 꼴이 아니면 null — 시각 · 시간대를 안 읽는다 */
function dayNumberOf(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS);
}

/** 날 번호의 요일 — 0 일요일 ~ 6 토요일(0번째 날 1970-01-01 이 목요일) */
const weekdayOfDay = (n: number) => (((n + 4) % 7) + 7) % 7;

/**
 * 같은 요일 짐작이 서는 날 — 오늘부터 0~6일 뒤마다, 그 요일에 최근 4주(어제 ~ ESTIMATE_LOOKBACK_DAYS 일 전) 경기 날이 ESTIMATE_MIN_GAMES
 * 이상이면 그날(오름차순). 같은 날짜가 두 번 와도 하루로 센다.
 */
function sameWeekdayGuesses(
  gameDates: readonly string[],
  asOf: string
): { days: number; weekday: number; games: number }[] {
  const today = dayNumberOf(asOf);
  if (today == null) return [];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const key of new Set(gameDates)) {
    const n = typeof key === 'string' ? dayNumberOf(key) : null;
    if (n == null) continue;
    const ago = today - n;
    if (ago < 1 || ago > ESTIMATE_LOOKBACK_DAYS) continue;
    counts[weekdayOfDay(n)]++;
  }
  const out: { days: number; weekday: number; games: number }[] = [];
  for (let d = 0; d < 7; d++) {
    const weekday = weekdayOfDay(today + d);
    if (counts[weekday] >= ESTIMATE_MIN_GAMES)
      out.push({ days: d, weekday, games: counts[weekday] });
  }
  return out;
}

/** 달력의 다음 등판까지 며칠 — 칸이 없거나 null · 0 밑 · 정수 아님이면 null */
function calendarDaysOf(facts: ReportFacts): number | null {
  const d = facts.condition.outingCalendar?.daysUntil;
  return typeof d === 'number' && Number.isInteger(d) && d >= 0 ? d : null;
}

/** 짐작의 재료를 판단 단위로(OutingGuessInputs 주석). 두 칸이 다 없는 facts 는 null */
export function outingGuessInputsOf(facts: ReportFacts): OutingGuessInputs | null {
  if (
    facts.condition.outingCalendar === undefined &&
    facts.patterns.gameDates === undefined
  )
    return null;
  return {
    calendar: calendarDaysOf(facts),
    estimate: sameWeekdayGuesses(facts.patterns.gameDates ?? [], facts.asOf).map(
      (g) => g.days
    ),
  };
}

/**
 * 짐작한 다음 등판 — 달력이 먼저, 없으면 같은 요일. fromDay(오늘 '오늘 불펜'이면 1) 앞의 날은 건너뛴다. 둘 다 없으면 null.
 * 체크인 답과의 차례(답이 범위를 주면 안 부름 · 오늘 '없음'이면 안 부름)는 outingOf 가 정한다.
 */
function guessOf(facts: ReportFacts, fromDay: number): OutingGuess | null {
  const calendar = calendarDaysOf(facts);
  if (calendar != null && calendar >= fromDay)
    return { source: 'calendar', days: calendar };
  const estimate = sameWeekdayGuesses(facts.patterns.gameDates ?? [], facts.asOf).find(
    (g) => g.days >= fromDay
  );
  return estimate ? { source: 'estimate', ...estimate } : null;
}

/**
 * 오늘의 등판 — 다음 것과 지난 것. 같은 facts 면 늘 같은 값이다(날짜 함수 · 난수 없음). facts 를 바꾸지 않고, 돌려주는 범위는 새 객체다.
 */
export function outingOf(facts: ReportFacts): Outing {
  const answers = outingAnswersOf(facts);
  const patterns = facts.patterns;
  const role = todayOutingRole(answers.today, answers.yesterday);
  const answerToday = parseThrowPlan(answers.today);

  /* 다음 등판 — 오늘 답이 이기고, 없으면 어제 답을 하루 당겨(lib/checkin.ts nextOutingWindow) */
  const next = nextOutingWindow(answers.today, answers.yesterday);
  /*
   * 답이 다음 등판을 말하지 않을 때만 짐작한다(머리 주석 차례). 오늘 '없음'은 '가까운 등판 없음'이라는 답이라 짐작하지 않고, 오늘 '오늘
   * 불펜'이면 오늘은 짐작하지 않는다(오늘이 무슨 날인지는 답이 말했다).
   */
  const guess =
    next.days == null && !saysNoOuting(answers.today)
      ? guessOf(facts, role === 'bullpen' ? 1 : 0)
      : null;
  const nextSource: OutingNextSource =
    next.from === 'today'
      ? 'checkin'
      : next.from === 'yesterday'
        ? 'checkin-yesterday'
        : guess
          ? guess.source
          : 'none';
  const answerYesterday = parseThrowPlan(answers.yesterday);

  /*
   * 지난 등판 — 기록이 먼저다. 어제 '오늘 등판'이라 답했는데 어제 기록이 없으면(던지고 안 적었거나 취소) 기록보다 가까운
   * 그 답을 1일 전 등판으로 둔다 — 투구수 · 부하는 모르니 null(D3 · P4 가 이 칸을 읽는다). 기록이 오늘 · 어제 것이면 기록이 이긴다.
   * 어제 답이 '그날 등판'이었나는 답 글자를 직접 견주지 않고 lib/checkin.ts 규칙으로 본다(어제 기준 꼭 0일 뒤).
   *
   * 어제 기록은 쉰 날 줄까지 센다(2판 P4 검토). 어제를 '휴식'으로 남겼으면 '안 던졌다'는 분명한 답이라 어제 답은 풀린 것으로 보고 기록을
   * 읽는다 — 예전에는 던진 날(restDays)만 보아, 휴식 줄을 남겨도 '기록 없는 등판'이 다음 날까지 남았다. 칸이 없는 옛 facts 는 던진 기록
   * (restDays · hardOutings · recentOutings 의 어제)으로만 가린다.
   */
  const logDays = patterns.restDays;
  const yesterdayGame = exactOutingDay(nextOutingDays(answerYesterday)) === 0;
  const loggedYesterday =
    patterns.loggedYesterday ??
    (logDays === 1 ||
      (patterns.hardOutings ?? []).some((o) => o.daysAgo === 1) ||
      (patterns.recentOutings ?? []).some((o) => o.daysAgo === 1));
  const claimedYesterdayNoLog = yesterdayGame && !loggedYesterday;
  const fromLog = logDays != null && (logDays <= 1 || !claimedYesterdayNoLog);
  const lastSource: OutingLastSource = fromLog
    ? 'log'
    : claimedYesterdayNoLog
      ? 'checkin-yesterday'
      : 'none';

  return {
    daysUntilNext: next.days
      ? { ...next.days }
      : guess
        ? { min: guess.days, max: guess.days }
        : null,
    /* 짐작한 날은 못 박지 않는다 — 회복 · 쉬기를 내는 독자가 짐작으로 움직이지 않게(머리 주석 soft) */
    nextDay: exactOutingDay(next.days),
    nextSource,
    soft: isSoftOutingSource(nextSource),
    guess: guess ? { ...guess } : null,
    role,
    answerToday,
    answerYesterday,
    answeredToday: answers.today != null,
    daysSinceLast: fromLog ? logDays : claimedYesterdayNoLog ? 1 : null,
    lastSource,
    claimedYesterdayNoLog,
    lastPitches: fromLog ? patterns.lastOutingPitches : null,
    lastLoad: fromLog
      ? ((patterns.hardOutings ?? []).find((o) => o.daysAgo === logDays)?.load ?? null)
      : null,
  };
}
