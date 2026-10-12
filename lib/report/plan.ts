import type { ReportFacts } from '@/lib/report/facts';
/*
 * 등판 답(체크인 '던지는 일정')을 읽는 규칙 — lib/engine/day-state.ts 가 아니라 lib/checkin.ts 에서 부른다. day-state 가 이 파일
 * (pendingOuting)을 부르므로 거꾸로 부르면 순환이 된다. lib/checkin.ts 는 브라우저 부품도 부르는 파일이라 이 파일을 부르는
 * 화면 부품(insert-cards · pitch-setup-wizard)에 서버 코드가 섞이지 않는다.
 */
import { nextOutingWindow, todayOutingRole } from '@/lib/checkin';

/**
 * 향후 3일 투구 계획을 규칙만으로 만든다.
 *
 * 규칙만이다 — 여기서 나온 숫자가 홈 · 트레이닝 · 암케어의 근거다(예전에는 AI 가 이 숫자를
 * 문장으로 풀어 썼고, 2026-10-07 AI 를 뺀 뒤로는 문장도 코드가 쓴다).
 *
 * 아래 기준표는 절대 진리가 아니라 조정 가능한 설정값이다.
 * 팀 사정에 맞게 바꿔도 되며, 바꾸면 계획도 그대로 따라 바뀐다.
 */

/**
 * 나이별 하루 최대 투구수.
 * 유소년 투구수 가이드(Pitch Smart)에서 널리 쓰이는 구간을 옮긴 것으로,
 * 성장기일수록 상한을 낮게 잡는다.
 */
export const AGE_PITCH_LIMITS = [
  { throughAge: 10, dailyMax: 75 },
  { throughAge: 12, dailyMax: 85 },
  { throughAge: 14, dailyMax: 95 },
  { throughAge: 16, dailyMax: 95 },
  { throughAge: 18, dailyMax: 105 },
  { throughAge: 200, dailyMax: 120 },
] as const;

/** 나이를 모를 때 쓰는 보수적인 상한 */
export const UNKNOWN_AGE_DAILY_MAX = 95;

/**
 * 이 나이부터는 나이로 정한 하루 한도를 두지 않는다(2026-10-12 사용자: "미성년자일 경우에만 투구수 제한을 두고 성인에게는
 * 다른 문구로"). 만 19세 = 고등학교를 마친 나이. 성인은 평소 던지던 양 · 부하 지수 · 등판 뒤 휴식일로만 오늘 양을 정한다.
 */
export const ADULT_AGE = 19;
/** 성인이 평소 투구량 기록이 없을 때 시작점을 잡는 기준(그 절반에서 시작) — 한도가 아니다 */
const ADULT_REFERENCE_PITCHES = 120;

/**
 * 던진 투구수에 따라 필요한 휴식일.
 * 고교 연령(15~18) 기준표. 성인도 이 표를 쓴다(나이로 한도를 두지 않을 뿐 휴식은 같은 표).
 */
export const REST_REQUIREMENTS = [
  { minPitches: 76, restDays: 4 },
  { minPitches: 61, restDays: 3 },
  { minPitches: 46, restDays: 2 },
  { minPitches: 31, restDays: 1 },
  { minPitches: 0, restDays: 0 },
] as const;

/**
 * 만 14세 이하의 휴식일 표(2026-10-12, 트레이닝 추천 2판 Y — 사용자 결정 D4 와 함께).
 * 11~14세 표는 15~18세보다 열 구 앞에서 같은 휴식일이 걸린다(66 · 51 · 36 · 21). 성장기엔 같은 공 수가 더 큰 부담이라서다.
 * 투구수는 전력 환산값(adjusted)으로 센다 — 15~18세 표와 같은 방식.
 */
export const REST_REQUIREMENTS_YOUTH = [
  { minPitches: 66, restDays: 4 },
  { minPitches: 51, restDays: 3 },
  { minPitches: 36, restDays: 2 },
  { minPitches: 21, restDays: 1 },
  { minPitches: 0, restDays: 0 },
] as const;
/** 이 나이까지는 어린 표(REST_REQUIREMENTS_YOUTH)로 휴식일을 센다 */
export const YOUTH_REST_TABLE_THROUGH_AGE = 14;

/**
 * 강도와 상관없이 이만큼 던졌으면 최소 이 정도는 쉰다.
 *
 * 전력 환산은 선수가 매긴 강도에 기대는데, 강도 4 이하는 뒷받침하는 연구가
 * 없고 낮게 적으면 휴식일이 줄어든다. 순수한 양 자체도 피로 요인이므로
 * 바닥선을 하나 둔다. 대한야구소프트볼협회 고교 일일 상한이 105구인 것을
 * 감안했다.
 */
export const HIGH_VOLUME_PITCHES = 100;
export const HIGH_VOLUME_MIN_REST = 1;

/**
 * 성장기로 보아 추가 주의를 안내하고 '매우 높음' 강도를 빼는 나이(이 나이 미만).
 * 2026-10-11 사용자 결정 D4(트레이닝 추천 2판): 만 16세 이상은 성인 기준, 그 미만은 성장기. 예전엔 15 였다.
 * 암케어의 통증 루틴 나이(lib/checkin.ts ARM_PAIN_ROUTINE_MIN_AGE)도 같은 선이다.
 */
export const YOUTH_AGE_THRESHOLD = 16;

/** 나이로 정한 하루 한도. 성인(만 19세 이상)은 null — 한도를 두지 않는다 */
export function dailyPitchCap(age: number | null): number | null {
  if (age == null) return UNKNOWN_AGE_DAILY_MAX;
  if (age >= ADULT_AGE) return null;
  return (
    AGE_PITCH_LIMITS.find((r) => age <= r.throughAge)?.dailyMax ?? UNKNOWN_AGE_DAILY_MAX
  );
}

/** 필요한 휴식일 — 만 14세 이하는 어린 표, 나이를 모르거나 15세 이상이면 15~18세 표 */
export function requiredRestDays(pitches: number, age: number | null = null) {
  const table =
    age != null && age <= YOUTH_REST_TABLE_THROUGH_AGE
      ? REST_REQUIREMENTS_YOUTH
      : REST_REQUIREMENTS;
  return table.find((r) => pitches >= r.minPitches)?.restDays ?? 0;
}

/**
 * 한 등판이 요구하는 휴식일.
 *
 * 강도는 선수가 직접 매기는 값이라 낮게 적으면 휴식일이 줄어든다. 그리고
 * 계수의 근거가 있는 구간은 강도 5~10뿐이다. 그래서 양 자체로 거는 바닥선을
 * 하나 둔다 — 아무리 가볍게 던졌어도 하루에 이만큼을 던졌으면 하루는 쉰다.
 */
function restFor(pitches: number, adjusted: number, age: number | null = null): number {
  return Math.max(
    requiredRestDays(Math.round(adjusted), age),
    pitches >= HIGH_VOLUME_PITCHES ? HIGH_VOLUME_MIN_REST : 0
  );
}

/** 아직 여파가 남은 등판 */
export type PendingOuting = {
  /** 전력 등판까지 남은 날 수 */
  left: number;
  /** 그 등판으로부터 며칠 지났는가 */
  elapsed: number;
  pitches: number;
};

/**
 * 아직 여파가 남은 등판 중 가장 오래 쉬어야 하는 것.
 *
 * 마지막 등판 하나만 보면 안 된다. 100구 경기 이틀 뒤 가벼운 캐치볼 25구가
 * '마지막 등판'이 되면 전력 환산 18구라 필요한 휴식이 0일이 되고, 경기의
 * 4일 창이 통째로 사라진다. 회복 투구를 성실히 한 사람일수록 안전장치가
 * 꺼지는 셈이었다.
 *
 * @param offset 오늘로부터 며칠 뒤를 볼 것인가 (0=오늘, 1=내일)
 * @param age 만 나이 — 14세 이하는 어린 휴식표(Y). 모르면 15~18세 표
 */
export function pendingOuting(
  patterns: ReportFacts['patterns'],
  offset = 0,
  age: number | null = null
): PendingOuting | null {
  /* 옛 기록에는 목록이 없다. 그때는 마지막 등판 하나로 본다. */
  const outings = patterns.recentOutings ?? [
    {
      daysAgo: patterns.restDays ?? 99,
      pitches: patterns.lastOutingPitches ?? 0,
      adjusted: patterns.lastOutingAdjusted ?? patterns.lastOutingPitches ?? 0,
    },
  ];

  let worst: PendingOuting | null = null;
  for (const o of outings) {
    const elapsed = o.daysAgo + offset;
    const left = restFor(o.pitches, o.adjusted, age) - elapsed;
    if (left > 0 && (worst == null || left > worst.left)) {
      worst = { left, elapsed, pitches: o.pitches };
    }
  }
  return worst;
}

/** 부하 구간별 조절 계수 — 평소 투구수에 곱한다. */
const ZONE_ADJUSTMENT: Record<
  string,
  { volume: number; maxIntensity: number; label: string }
> = {
  danger: { volume: 0.5, maxIntensity: 5, label: '부하 위험 구간이라 절반으로 줄임' },
  caution: { volume: 0.7, maxIntensity: 6, label: '부하 주의 구간이라 30% 줄임' },
  optimal: { volume: 1.0, maxIntensity: 8, label: '부하가 적정해 평소 수준 유지' },
  low: { volume: 1.0, maxIntensity: 8, label: '부하가 낮아 평소 수준부터 서서히 회복' },
};

/** 부하 지수를 아직 낼 수 없을 때 쓰는 보수적인 기본값 */
const UNKNOWN_ZONE = {
  volume: 0.9,
  maxIntensity: 7,
  label: '4주치 기록이 아직 없어 보수적으로 잡음',
};

/**
 * 최근에 통증이 있었지만 오늘은 괜찮다고 한 경우의 상한.
 *
 * 통증이 사라진 다음 날 평소 양으로 돌아가는 것이 재발의 흔한 경로다.
 * 계획을 아예 멈추는 대신 절반에서 다시 올리도록 한다.
 */
const RECOVERY_ADJUSTMENT = {
  volume: 0.5,
  maxIntensity: 5,
  label: '최근 통증 기록이 있어 절반 수준에서 서서히 복귀',
};

export type DayPlan = {
  dateKey: string;
  /** 오늘 / 내일 */
  label: string;
  throwing: boolean;
  /** 큰 등판의 여파 안에서 가볍게 던지는 날인가 */
  recovery?: boolean;
  /**
   * 던지는 날의 권장 범위. 쉬는 날이면 전부 null.
   *
   * min 은 옛 리포트에 없다(상한 하나만 냈다). 화면은 pitchRangeText 로 읽어
   * 없으면 '60구 이하'로 낸다.
   */
  minPitches: number | null;
  maxPitches: number | null;
  minIntensity: number | null;
  maxIntensity: number | null;
  reason: string;
  /**
   * 오늘 할 일 — 체크인 '던지는 일정'(lib/checkin.ts todayOutingRole, 2판 P3 · 2026-10-12). 오늘 칸에만 있다.
   *
   *   'game'     등판 날 — 보통은 throwing true 에 아래끝 · 강도가 null 이고 위끝(maxPitches)은 나이별 하루 한도(성인 null)다.
   *              던질 양은 경기가 정하고(강판이면 20구, 완투면 100구), 평소 범위를 내면 회복 테마 · 회복 암케어와 서로 다른 날을
   *              말한다(자체 시험 엇갈림 표 C1 · C4). 큰 등판의 여파 · 최근 통증이 있으면 그 규칙이 먼저다 — 다음 날이면 쉬는 날
   *              (throwing false), 회복 중이면 가벼운 범위 그대로에 이 이름표만 붙는다(2판 P3 검토).
   *   'bullpen'  불펜 날 — 범위는 평소대로 낸다(2026-10-09 결정: 불펜은 날을 안 바꾼다). 이름표만 단다.
   *
   * 내일 칸 · 이 칸이 생기기 전의 계획에는 없다. 쉬는 날(통증 확인 · 등판 다음 날)에는 불펜 이름표를 달지 않는다.
   * 통증 확인 전(needsPainCheck)의 쉬는 날에는 등판 이름표도 안 단다.
   */
  outing?: 'game' | 'bullpen';
};

/**
 * 상한 하나가 아니라 범위로 낸다.
 *
 * '60구 이하'는 한꺼번에 두 가지를 말한다 — 60을 넘기지 말라는 것과, 오늘은
 * 그 언저리가 알맞다는 것. 그런데 읽는 쪽에 남는 것은 상한뿐이라 20구를 던져도
 * 지킨 것이고 60구를 던져도 지킨 것이 된다. 어느 쪽이 오늘 몸에 맞는 양인지는
 * 알려주지 못한다.
 *
 * 아래끝을 함께 낸다. 상한의 70% — 그보다 적으면 그날 던진 뜻이 옅어지는 선이다.
 */
export const RANGE_FLOOR = 0.7;

/** 강도 범위의 폭 */
export const INTENSITY_SPAN = 2;

/**
 * 회복 기간에도 가볍게는 던진다.
 *
 * 휴식일 표(Pitch Smart)는 전력 등판과 전력 등판 사이의 간격이지, 그사이에
 * 아무것도 던지지 말라는 표가 아니다. 실제 복귀 프로그램은 등판 다음 날부터
 * 가벼운 캐치볼을 넣는다 — 나흘을 통째로 멈춰 두는 것이 오히려 회복을 늦추고,
 * 무엇보다 선수가 그 말을 안 듣는다. 안 들을 안내를 내면 기록도 같이 끊긴다.
 *
 * 등판 바로 다음 날만 완전히 쉰다. 어깨가 가장 부은 날이다.
 */
export const RECOVERY_FULL_REST_DAYS = 1;

/**
 * 회복 며칠째에 평소의 몇 퍼센트까지 던지는가. 마지막 값이 그 뒤로 계속 쓰인다.
 */
export const RECOVERY_VOLUME = [0.5, 0.7] as const;

/** 회복 투구의 강도 상한. 날이 갈수록 한 칸 올린다. */
export const RECOVERY_INTENSITY = [5, 6] as const;

/**
 * 회복 투구 강도의 바닥.
 *
 * 평소 계획은 4 아래로 내려가지 않는다(환산 계수의 근거가 없는 구간이라).
 * 회복 투구는 '가벼운 캐치볼'이 정확히 그 구간이라 3까지 연다. 근거가 없는
 * 구간의 계수는 보수적으로(높게) 잡아 두었으므로, 그렇게 던져도 부하는
 * 실제보다 많이 세어진다 — 안전한 방향으로 틀린다.
 */
export const RECOVERY_MIN_INTENSITY = 3;

/**
 * 강도 아래끝의 바닥.
 *
 * 4 이하 구간은 전력 환산 계수를 뒷받침하는 근거가 없다(lib/pitch-stats.ts).
 * 근거가 없는 구간을 권장 범위의 끝으로 쓰지 않는다.
 */
export const MIN_MEANINGFUL_INTENSITY = 4;

/**
 * 권장 투구수 범위.
 *
 * 5구 단위로 다듬는다. 62구 같은 값은 계산이 그렇게 나왔을 뿐인데 지켜야 할
 * 정밀한 숫자처럼 읽힌다. 상한은 안전선이라 늘 내리고(올리지 않는다), 아래끝은
 * 안전선이 아니라 가까운 쪽으로 맞춘다.
 */
export function pitchRange(target: number): { min: number; max: number } {
  // 열다섯 구도 안 되는 양은 5구 단위로 다듬으면 범위가 뭉개진다.
  if (target < 15) {
    return {
      min: Math.min(Math.max(1, Math.round(target * RANGE_FLOOR)), target),
      max: target,
    };
  }
  const max = Math.floor(target / 5) * 5;
  const min = Math.max(5, Math.round((target * RANGE_FLOOR) / 5) * 5);
  return { min: Math.min(min, max), max };
}

/** '40~60구'. 범위가 없는 옛 리포트는 '60구 이하'로 읽는다. */
export function pitchRangeText(day: DayPlan): string {
  if (day.maxPitches == null) return '';
  return day.minPitches != null && day.minPitches < day.maxPitches
    ? `${day.minPitches}~${day.maxPitches}구`
    : `${day.maxPitches}구 이하`;
}

/**
 * '강도 60~80%'. 계획은 1~10 눈금(정수)으로 세우고 글만 체감 강도 % 로 보인다(2판 D2, 2026-10-12) — 사용자가 투구 강도를
 * % 칩으로 고르게 되어 '강도 6~8' 을 보면 무엇을 골라야 할지 한 번 더 바꿔 셈해야 했다. × 10 은 lib/pitch-effort.ts
 * scaleToEffortPct 와 같은 셈(이 파일은 import 없이 두려고 그대로 곱한다).
 */
export function intensityRangeText(day: DayPlan): string {
  if (day.maxIntensity == null) return '';
  return day.minIntensity != null && day.minIntensity < day.maxIntensity
    ? `강도 ${day.minIntensity * 10}~${day.maxIntensity * 10}%`
    : `강도 ${day.maxIntensity * 10}% 이하`;
}

export type PitchPlan = {
  /** 통증이 있으면 계획 대신 휴식·진료 안내만 낸다 */
  halted: boolean;
  haltReason: string | null;
  /**
   * 최근 통증이 있었지만 오늘은 괜찮다고 해서, 낮춘 수준으로 다시 시작하는 상태.
   * 운동 처방도 이 값을 보고 회복 수준까지만 남긴다.
   */
  recovering: boolean;
  /**
   * 메모에 통증으로 보이는 표현이 있는데 오늘 체크인이 없어, 실제로 아픈지
   * 확인이 필요한 상태. 확인될 때까지 투구는 쉬는 쪽으로 둔다.
   */
  needsPainCheck: boolean;
  /**
   * 오늘 하루의 안내. 오늘 이미 던진 기록이 있으면 null 이다.
   *
   * 한때는 오늘·내일·모레 사흘치를 그렸다. 주 사용자가 사회인·동호회 선수라
   * 다음 경기가 언제인지도 모르고 몇 구 던질지는 경기가 정하는데(강판당하면
   * 20구, 완투하면 100구), 모레 계획은 지킬 수 있는 것이 아니라 지어낸 이야기에
   * 가까웠다. 그래서 오늘 하나로 줄였다.
   *
   * 이제 내일까지 둘이다. 리포트를 하루 한 번 만들 수 있게 되면서, 아침에
   * 만들면 오늘을 보고 저녁에 던지고 나서 만들면 내일을 보게 됐다. 모레와
   * 달리 내일은 지어낸 이야기가 아니다 — 오늘 무엇을 했는지가 그대로 정한다.
   */
  today: DayPlan | null;
  /** 내일의 안내. 계획을 멈춘 경우에만 null 이다. */
  tomorrow: DayPlan | null;
  /**
   * 오늘 이미 던진 기록이 있는가.
   *
   * 있으면 오늘 몫은 내지 않는다 — 이미 벌어진 일에 "오늘 40~60구"라고 하는
   * 것은 조언이 아니다. 없으면 안 던진 것으로 본다. 계획대로 던졌다면 기록을
   * 남겼을 것이기 때문이다.
   */
  threwToday: boolean;
  /** 어떤 규칙이 적용됐는지 — 화면에 근거로 그대로 보여준다 */
  basis: string[];
  /** 성장기 회원에게 덧붙일 주의 */
  youthNote: string | null;
  /**
   * 재활 때문에 멈춘 계획인가(lib/armcare/rehab.ts) — 그때만 있고, 아니면 없거나 null.
   *
   * 통증 멈춤과 가르는 표시다. 재활 중에는 투구 계획만 멈추고 웨이트 AI 맞춤은 그대로 부른다(app/actions/training-setup.ts),
   * 암케어는 통증 쉬기로 보지 않는다(lib/armcare/routine.ts 의 decideArmcare). 오늘 체크인이 통증이면 통증 멈춤이 먼저라
   * 이 표시가 없다. 이 칸이 생기기 전에 저장된 계획에는 없다.
   */
  rehab?: { area: string; stage: number; throwing: 'light' | 'none' } | null;
};

/**
 * 오늘 하나만 만든다.
 *
 * 사흘치를 그리던 때의 흔적이 하나 사라진다 — '연투가 길면 첫 등판 다음 날을
 * 쉬게 한다'는 규칙은 내일·모레가 있어야 놓을 자리가 있었다. 연투가 길었다는
 * 사실 자체는 근거에 그대로 남긴다.
 */
const TODAY_LABEL = '오늘';
const TOMORROW_LABEL = '내일';

/** 쉬는 날. 이유만 다르고 모양은 늘 같다. */
function restDay(dateKey: string, label: string, reason: string): DayPlan {
  return {
    dateKey,
    label,
    throwing: false,
    recovery: false,
    minPitches: null,
    maxPitches: null,
    minIntensity: null,
    maxIntensity: null,
    reason,
  };
}

/** YYYY-MM-DD 의 다음 날 */
function nextDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export function buildPitchPlan(facts: ReportFacts): PitchPlan {
  const { patterns, load, profile, condition } = facts;
  const cap = dailyPitchCap(profile.age);
  const basis: string[] = [];

  const youthNote =
    profile.age != null && profile.age < YOUTH_AGE_THRESHOLD
      ? `만 ${profile.age}세는 성장기라 위 수치보다 더 보수적으로 잡는 것이 안전해요. 지도자와 상의하세요.`
      : null;

  /*
   * 1) 통증 신호. 다른 어떤 규칙보다 우선한다.
   *
   * 판정을 세 갈래로 나눈다. 예전에는 최근 7일 안에 통증이 한 번이라도
   * 있으면 무조건 멈췄는데, 지난 체크인은 고칠 수 없어서(어제~내일만 허용)
   * 실수로 한 번 누르면 이레 동안 아무것도 못 받는 상태가 됐다.
   * 화면은 "체크인에서 고쳐주세요"라고 안내하면서 고칠 수 없었다.
   *
   * 그래서 '지금 아픈가'를 기준으로 삼는다. 오늘 괜찮다고 하면 계획을 내되,
   * 곧바로 평소 양으로 돌아가지 않고 절반에서 다시 올린다.
   */
  if (condition.painToday) {
    return {
      halted: true,
      haltReason:
        '오늘 체크인에 통증이 있어요. 아픈 동안에는 투구 계획을 쉬어요. 통증이 이어지면 전문의 진료를 받아 보세요. 가라앉았다면 오늘 체크인을 다시 저장해 주세요.',
      today: restDay(facts.asOf, TODAY_LABEL, '통증 기록'),
      tomorrow: null,
      threwToday: false,
      recovering: false,
      needsPainCheck: false,
      basis: ['오늘 체크인 통증 → 계획 중단'],
      youthNote,
    };
  }

  // 최근에 통증이 있었는데 오늘 체크인이 없으면, 나은 것인지 알 수 없어 멈춘다.
  if (condition.painRecently && condition.today == null) {
    return {
      halted: true,
      haltReason:
        '최근 체크인에 통증이 있었어요. 지금 상태를 몰라 투구 계획을 쉬어요. 오늘 체크인을 남기면 상태에 맞춰 다시 짜요. 통증이 이어지면 전문의 진료를 받아 보세요.',
      today: restDay(facts.asOf, TODAY_LABEL, '통증 확인 필요'),
      tomorrow: null,
      threwToday: false,
      recovering: false,
      needsPainCheck: false,
      basis: ['최근 통증 기록 + 오늘 체크인 없음 → 계획 중단'],
      youthNote,
    };
  }

  /*
   * 1-1) 재활 중 — 끝낼 때까지 투구 계획 대신 재활 문구(재활 2편, lib/armcare/rehab.ts 의 rehabFacts).
   *
   * 오늘 통증이면 위의 통증 멈춤이 먼저다. 가벼움은 가벼운 캐치볼을 이어 간다 — 운동 중 통증 2 이하 · 다음 날 아침
   * 원래대로일 때(docs/rehab-guideline.md 3절). 팔꿈치 안쪽 · 뒤쪽은 첫 주 던지지 않는다(인대 · 뼈일 수 있다).
   * 투구 복귀표(4단계 끝)는 재활 화면이 따로 안내한다.
   */
  if (condition.rehab) {
    const rehab = condition.rehab;
    const head = `재활 중이에요(${rehab.label} · ${rehab.stage}단계). 재활을 마칠 때까지 투구 계획은 쉬어요.`;
    const tail =
      rehab.throwing === 'light'
        ? ' 가벼운 캐치볼만 해요(18m 안 · 25개 · 통증 2 이하).'
        : rehab.firstWeekNoThrow
          ? ' 팔꿈치 안쪽 · 뒤쪽은 첫 주에 던지지 않아요.'
          : '';
    return {
      halted: true,
      haltReason: head + tail,
      today: restDay(
        facts.asOf,
        TODAY_LABEL,
        rehab.throwing === 'light' ? '재활 중 · 가벼운 캐치볼만' : '재활 중'
      ),
      tomorrow: null,
      threwToday: false,
      recovering: false,
      needsPainCheck: false,
      basis: [`재활 중(${rehab.label} · ${rehab.stage}단계) → 투구 계획 중단`],
      youthNote,
      rehab: { area: rehab.area, stage: rehab.stage, throwing: rehab.throwing },
    };
  }

  /*
   * 메모의 통증 표현은 '확정'이 아니라 '추정'이다.
   *
   * "어제 결렸는데 오늘은 괜찮다"처럼 다 나은 이야기도 걸리고, 찾는 단어가
   * 넓어서(결림·저림·아프…) 잘못 잡히는 일이 잦다. 예전에는 이것만으로 계획을
   * 통째로 멈췄고, 메모를 고치지 않으면 풀리지 않았다.
   *
   * 그래서 오늘 체크인이 있으면 그쪽을 믿고 메모는 넘어간다. 체크인이 통증을
   * 받는 정식 창구이고, 오늘 상태가 지난 메모보다 최신이다.
   *
   * 체크인이 없을 때만 확인을 요청한다. 이때도 잠그지 않되, 확인되기 전까지
   * 투구는 쉬고 운동은 회복 수준까지만 남긴다. 아플 수도 있는 팔로 던지는
   * 것이 진짜 위험이고, 가벼운 가동성 운동은 그렇지 않다.
   */
  const needsPainCheck =
    condition.painWordsInMemo.length > 0 && condition.today == null;

  if (needsPainCheck) {
    basis.push(
      `메모의 통증 표현(${condition.painWordsInMemo.join(', ')}) 확인 전 → 투구는 휴식`
    );
  }

  /*
   * 오늘은 괜찮다고 했지만 최근에 통증이 있었던 경우, 또는 메모 확인을
   * 기다리는 경우 — 어느 쪽이든 낮춘 수준에서 다시 시작한다.
   */
  const recovering = condition.painRecently || needsPainCheck;

  /*
   * 2) 마지막 등판량에 따라 남은 휴식일을 센다.
   *
   * 투구수를 그대로 쓰지 않고 전력 환산 투구수를 쓴다. 휴식일 표는 '경기에서
   * 전력으로 던진 투구수' 기준이라, 캐치볼 80구에 그대로 적용하면 4일을
   * 쉬라고 하게 된다. (근거는 lib/pitch-stats.ts 의 INTENSITY_STRESS_FACTOR)
   */
  const lastOuting = patterns.lastOutingPitches ?? 0;
  const lastAdjusted = Math.round(patterns.lastOutingAdjusted ?? lastOuting);

  const needRest = restFor(lastOuting, lastAdjusted, profile.age);
  const restedSoFar = patterns.restDays ?? 99;

  if (needRest > 0 && patterns.lastThrowDate) {
    // 환산값이 실제 투구수와 다르면 둘 다 보여준다. 안 그러면 숫자가 어디서 왔는지 모른다.
    const amount =
      lastAdjusted === lastOuting
        ? `${lastOuting}구`
        : `${lastOuting}구(전력 환산 ${lastAdjusted}구)`;
    basis.push(
      `마지막 등판 ${amount} → 전력 등판까지 ${needRest}일 (경과 ${restedSoFar}일). 그사이에도 가볍게는 던져요`
    );
  }

  // 3) 부하 구간에 따른 조절 계수
  const zoneAdj = load.zone ? ZONE_ADJUSTMENT[load.zone] : UNKNOWN_ZONE;
  basis.push(
    load.zone
      ? `부하 지수 ${load.ratio?.toFixed(2)} (${load.zone === 'danger' ? '위험' : load.zone === 'caution' ? '주의' : load.zone === 'optimal' ? '적정' : '낮음'}) → ${zoneAdj.label}`
      : zoneAdj.label
  );

  /*
   * 회복 중이면 부하 구간이 좋게 나와도 더 풀어주지 않는다.
   * 두 기준 중 낮은 쪽을 쓴다 — 안전 쪽에서 틀리는 편이 맞다.
   */
  // 낮추는 까닭이 체크인 기록인지 메모 추정인지 밝혀야 안내가 사실과 맞는다.
  const recoveryLabel = needsPainCheck
    ? '메모의 통증 표현을 확인하기 전이라 절반 수준으로 낮춤'
    : RECOVERY_ADJUSTMENT.label;

  const adj = recovering
    ? {
        volume: Math.min(zoneAdj.volume, RECOVERY_ADJUSTMENT.volume),
        maxIntensity: Math.min(zoneAdj.maxIntensity, RECOVERY_ADJUSTMENT.maxIntensity),
        label: recoveryLabel,
      }
    : zoneAdj;
  if (recovering) basis.push(recoveryLabel);

  // 4) 기준 투구수 — 평소 던지던 양이 없으면 상한의 절반에서 시작한다.
  const baseline =
    patterns.baselinePitches ?? Math.round((cap ?? ADULT_REFERENCE_PITCHES) * 0.5);
  if (patterns.baselinePitches == null) {
    basis.push(
      cap == null
        ? `평소 투구량 기록이 없어 ${baseline}구에서 시작`
        : `평소 투구량 기록이 없어 상한의 절반(${baseline}구)에서 시작`
    );
  } else {
    basis.push(`평소 던진 날 평균 ${baseline}구를 기준으로 계산`);
  }

  let target = Math.round(baseline * adj.volume);

  // 5) 나이별 상한을 넘지 않게 자른다.
  if (cap != null && target > cap) {
    basis.push(
      `나이별 하루 상한 ${cap}구 적용 (${profile.age != null ? `만 ${profile.age}세` : '나이 미입력이라 보수적 기준'})`
    );
    target = cap;
  }

  /*
   * 6) 연투가 길었던 사실을 알린다.
   *
   * 예전에는 여기서 쉬는 날을 하나 끼워 넣었다. 사흘치를 그릴 때는 '첫 등판
   * 다음 날'이라는 놓을 자리가 있었지만, 오늘 하나만 정하는 지금은 없다.
   *
   * 그렇다고 오늘을 쉬라고 할 수도 없다. longestStreak 는 최근 4주의 최장
   * 연투라 지금 연투 중이라는 뜻이 아니다 — 넉 주 전 일로 오늘을 막는 셈이 된다.
   *
   * 그래서 사실만 적는다. 하는 일이 없어졌는데 문구만 남겨 두면, 화면에는
   * 규칙이 있어 보이지만 실제로는 아무 일도 안 하는 줄이 된다.
   */
  if (patterns.longestStreak >= 3) {
    basis.push(
      `최근 4주 최장 연투 ${patterns.longestStreak}일. 이어 던진 뒤에는 하루 쉬는 편이 좋아요`
    );
  }

  /*
   * 7) 오늘 할 일 — 체크인 '던지는 일정'(2판 P3, 2026-10-12 C1 · C4 뒤집기).
   *
   * 등판 날에는 평소 범위('40~60구')를 내지 않는다. 몇 구를 던질지는 경기가 정하고, 같은 아침에 매일 일정은 회복 테마 ·
   * 암케어는 회복 루틴인데 투구 계획만 '평소대로 던져요'라고 하면 앱이 한 날을 두 가지로 말한다. 그래서 '던지는 날'(throwing true)로
   * 두되 아래끝 · 강도를 비우고 까닭에 그렇게 적는다. 위끝은 나이별 하루 한도(cap, 성인은 null) — 등판 날에도 성장기 한도는
   * 그대로라 그날 화면의 '계획보다 N구 많아요'가 그것을 견준다.
   *
   * 다만 안전 규칙이 먼저다(2판 P3 검토, 2026-10-12 — 등판 답 하나로 여파 · 통증 · 한도가 다 풀리던 것을 되돌림):
   *   통증 확인 전(needsPainCheck)      그래도 쉰다 — 아플 수도 있는 팔이 먼저다(이름표도 안 단다)
   *   큰 등판 다음 날(pending 완전 휴식) 쉬는 날 그대로, 이름표 'game' 과 '오늘 등판은 권하지 않아요' 까닭만
   *   큰 등판 회복 중 · 최근 통증        지금의 가벼운 범위를 그대로 두고 이름표 'game' 과 '등판해도 이 양 안에서' 까닭
   * 쉬라고 막지는 않는다(경기는 앱이 정하지 않는다) — 계획이 말해 줄 뿐이고, 기록은 그대로 받는다.
   *
   * 불펜 날은 범위를 그대로 둔다(2026-10-09 결정: 불펜은 날을 안 바꾼다). 이름표(outing)만 단다.
   * 오늘 칸에만 쓴다 — 내일은 오늘 던진 양을 알아야 정해지고, 그 양은 기록이 들어오면 다시 짠다(threwToday).
   */
  const outing = todayOutingRole(
    condition.throwPlanToday,
    condition.throwPlanYesterday
  );
  if (outing === 'game') {
    /* 근거 줄도 오늘 칸(dayFor)과 같은 말을 한다 — 안전 규칙이 먼저인 날에 '양은 경기가 정함'이라 적으면 서로 어긋난다 */
    const owedToday = pendingOuting(patterns, 0, profile.age);
    const what = needsPainCheck
      ? '통증 확인 전이라 투구는 휴식'
      : owedToday && owedToday.elapsed <= RECOVERY_FULL_REST_DAYS
        ? '큰 등판 다음 날이라 등판은 권하지 않음'
        : owedToday || recovering
          ? '회복 중이라 가벼운 범위 안에서'
          : '양은 경기가 정함';
    basis.push(
      nextOutingWindow(condition.throwPlanToday, condition.throwPlanYesterday).from ===
        'yesterday'
        ? `어제 체크인 '내일 등판'(오늘 답 없음) → 오늘 등판, ${what}`
        : `체크인 '오늘 등판' → ${what}`
    );
  } else if (outing === 'bullpen') {
    basis.push("체크인 '오늘 불펜' → 범위는 평소대로");
  }

  /*
   * 오늘 하루만 정한다.
   *
   * 사흘치를 그리던 때에는 '연투가 길면 첫 등판 다음 날을 쉬게 한다'는 규칙이
   * 있었는데, 내일·모레가 있어야 놓을 자리가 있었다. 지금은 그 사실을 근거로만
   * 남긴다 — longestStreak 는 최근 4주의 최장 연투라, 그것만으로 오늘을
   * 쉬라고 하면 넉 주 전 일로 오늘을 막는 셈이 된다.
   */
  /*
   * 하루를 만드는 틀. 오늘과 내일은 다른 것이 다 같고 '얼마나 쉬었는가'만
   * 다르다 — 내일은 하루 더 쉰 셈이다.
   *
   * "오늘 계획대로 던졌다면 내일은" 같은 가정은 두지 않는다. 계획대로 던졌다면
   * 기록을 남겼을 것이고, 기록이 없다는 것은 안 던졌다는 뜻이다. 가정으로
   * 내일을 낮춰 두면, 오늘 쉬고 내일 던지려는 사람에게 근거 없이 적은 숫자를
   * 주게 된다.
   */
  const dayFor = (dateKey: string, label: string, offset: number): DayPlan => {
    if (needsPainCheck) {
      return restDay(dateKey, label, '메모의 통증 표현 확인 필요');
    }

    /* 등판 날(7) — 오늘 칸에만. 여파 · 통증이 있으면 아래 규칙이 먼저고 이름표만 단다 */
    const game = offset === 0 && outing === 'game';
    /* 불펜 날 이름표 — 던지는 날에만(아래 쉬는 날은 그대로 쉰다) */
    const bullpen =
      offset === 0 && outing === 'bullpen' ? { outing: 'bullpen' as const } : {};
    const gameTag = game ? { outing: 'game' as const } : {};

    /*
     * 아직 큰 등판의 여파 안이면 가볍게 던진다.
     *
     * 등판 바로 다음 날만 완전히 쉰다. 그 뒤로는 평소의 절반에서 시작해 조금씩
     * 올린다 — 나흘을 통째로 멈추는 것보다 이쪽이 실제 복귀 프로그램에 가깝고,
     * 무엇보다 선수가 지킬 수 있는 안내다. 안 지킬 안내를 내면 기록도 같이
     * 끊긴다.
     */
    const pending = pendingOuting(patterns, offset, profile.age);
    if (pending) {
      if (pending.elapsed <= RECOVERY_FULL_REST_DAYS) {
        /* 등판 답이 있어도 쉬는 날 그대로 — 큰 등판 다음 날 다시 전력으로 던지는 것이 휴식표가 막으려는 바로 그 일이다 */
        if (game) {
          return {
            ...restDay(
              dateKey,
              label,
              `${pending.pitches}구 등판 다음 날이라 오늘 등판은 권하지 않아요.`
            ),
            outing: 'game',
          };
        }
        return restDay(
          dateKey,
          label,
          `${pending.pitches}구 등판 다음 날이라 오늘은 완전히 쉬어요`
        );
      }
      const step = Math.min(
        pending.elapsed - RECOVERY_FULL_REST_DAYS - 1,
        RECOVERY_VOLUME.length - 1
      );
      const light = pitchRange(Math.round(target * RECOVERY_VOLUME[step]));
      const ceiling = Math.min(RECOVERY_INTENSITY[step], adj.maxIntensity);
      return {
        dateKey,
        label,
        throwing: true,
        recovery: true,
        minPitches: light.min,
        maxPitches: light.max,
        minIntensity: Math.max(RECOVERY_MIN_INTENSITY, ceiling - INTENSITY_SPAN),
        maxIntensity: ceiling,
        reason: game
          ? `${pending.pitches}구 등판 회복 중(${pending.elapsed}일째)이라 등판해도 이 양 안에서 가볍게 던져요.`
          : `${pending.pitches}구 등판 회복 중(${pending.elapsed}일째)이라 가볍게 던지며 풀어요`,
        ...bullpen,
        ...gameTag,
      };
    }

    /*
     * 등판 날 — 여파도 최근 통증도 없으면 양은 경기가 정한다(아래끝 · 강도 없음). 위끝은 나이별 하루 한도(성인 null):
     * 등판 날이라고 성장기 한도가 풀리지는 않는다.
     */
    if (game && !recovering) {
      return {
        dateKey,
        label,
        throwing: true,
        minPitches: null,
        maxPitches: cap,
        minIntensity: null,
        maxIntensity: null,
        reason:
          cap == null
            ? '오늘 등판이라 던질 양은 경기가 정해요.'
            : `오늘 등판이라 던질 양은 경기가 정해요. 하루 한도 ${cap}구는 넘기지 않아요.`,
        outing: 'game',
      };
    }

    const pitches = pitchRange(target);
    return {
      dateKey,
      label,
      throwing: true,
      minPitches: pitches.min,
      maxPitches: pitches.max,
      minIntensity: Math.max(
        MIN_MEANINGFUL_INTENSITY,
        adj.maxIntensity - INTENSITY_SPAN
      ),
      maxIntensity: adj.maxIntensity,
      /* 최근 통증이 있는 등판 날 — 낮춘 범위 그대로, 등판해도 그 안에서 */
      reason: game ? '최근 통증 기록이 있어 등판해도 이 양 안에서 던져요.' : adj.label,
      ...bullpen,
      ...gameTag,
    };
  };

  const threwToday = patterns.lastThrowDate === facts.asOf;

  return {
    halted: false,
    haltReason: null,
    recovering,
    needsPainCheck,
    threwToday,
    today: threwToday ? null : dayFor(facts.asOf, TODAY_LABEL, 0),
    tomorrow: dayFor(nextDayKey(facts.asOf), TOMORROW_LABEL, 1),
    basis,
    youthNote,
  };
}
