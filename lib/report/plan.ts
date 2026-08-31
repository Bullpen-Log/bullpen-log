import type { ReportFacts } from '@/lib/report/facts';

/**
 * 향후 3일 투구 계획을 규칙만으로 만든다.
 *
 * 이 파일에는 AI가 전혀 개입하지 않는다. 여기서 나온 숫자가 리포트의
 * 근거가 되고, AI는 그 숫자를 설명하는 문장만 쓴다.
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
 * 던진 투구수에 따라 필요한 휴식일.
 * 고교 연령(15~18) 기준표를 따르며, 그보다 어리면 더 보수적으로 봐야 한다.
 */
export const REST_REQUIREMENTS = [
  { minPitches: 76, restDays: 4 },
  { minPitches: 61, restDays: 3 },
  { minPitches: 46, restDays: 2 },
  { minPitches: 31, restDays: 1 },
  { minPitches: 0, restDays: 0 },
] as const;

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

/** 성장기로 보아 추가 주의를 안내할 나이 */
export const YOUTH_AGE_THRESHOLD = 15;

export function dailyPitchCap(age: number | null) {
  if (age == null) return UNKNOWN_AGE_DAILY_MAX;
  return (
    AGE_PITCH_LIMITS.find((r) => age <= r.throughAge)?.dailyMax ??
    UNKNOWN_AGE_DAILY_MAX
  );
}

export function requiredRestDays(pitches: number) {
  return REST_REQUIREMENTS.find((r) => pitches >= r.minPitches)?.restDays ?? 0;
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
  /** 오늘 / 내일 / 모레 */
  label: string;
  throwing: boolean;
  /** 던지는 날의 권장 상한. 쉬는 날이면 null */
  maxPitches: number | null;
  maxIntensity: number | null;
  reason: string;
};

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
   * 오늘 하루의 안내.
   *
   * 예전에는 오늘·내일·모레 사흘치를 그렸다. 그런데 주 사용자는 사회인·동호회
   * 선수라 다음 경기가 언제인지도 모르고, 몇 구 던질지는 경기 상황이 정한다 —
   * 강판당하면 20구, 완투하면 100구다. 모레 계획은 지킬 수 있는 것이 아니라
   * 지어낸 이야기에 가까웠다.
   *
   * 오늘 하나만 남긴다. 이것도 "몇 구 던져라"가 아니라 "여기까지"라는 상한이고,
   * 쉬는 날이면 숫자 없이 쉬라고만 한다. 미리 정하는 것이 아니라 이미 던진
   * 것에 대한 답이다.
   */
  today: DayPlan;
  /** 어떤 규칙이 적용됐는지 — 화면에 근거로 그대로 보여준다 */
  basis: string[];
  /** 성장기 회원에게 덧붙일 주의 */
  youthNote: string | null;
};

/**
 * 오늘 하나만 만든다.
 *
 * 사흘치를 그리던 때의 흔적이 하나 사라진다 — '연투가 길면 첫 등판 다음 날을
 * 쉬게 한다'는 규칙은 내일·모레가 있어야 놓을 자리가 있었다. 연투가 길었다는
 * 사실 자체는 근거에 그대로 남긴다.
 */
const TODAY_LABEL = '오늘';

/** 오늘은 쉬는 날. 이유만 다르고 모양은 늘 같다. */
function restDay(asOf: string, reason: string): DayPlan {
  return {
    dateKey: asOf,
    label: TODAY_LABEL,
    throwing: false,
    maxPitches: null,
    maxIntensity: null,
    reason,
  };
}

export function buildPitchPlan(facts: ReportFacts): PitchPlan {
  const { patterns, load, profile, condition } = facts;
  const cap = dailyPitchCap(profile.age);
  const basis: string[] = [];

  const youthNote =
    profile.age != null && profile.age < YOUTH_AGE_THRESHOLD
      ? `만 ${profile.age}세는 성장기라 위 수치보다 더 보수적으로 잡는 것이 안전합니다. 지도자와 상의하세요.`
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
        '오늘 체크인에 통증이 기록되어 있습니다. 통증이 있는 동안에는 투구 계획을 제공하지 않습니다. 통증이 이어지면 전문의 진료를 받아보세요. 통증이 가라앉았다면 오늘 체크인을 다시 저장해주세요.',
      today: restDay(facts.asOf, '통증 기록'),
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
        '최근 체크인에 통증이 기록되어 있습니다. 지금 어떤 상태인지 알 수 없어 계획을 내지 않았습니다. 오늘 체크인을 남겨주시면 상태에 맞춰 다시 계획을 만듭니다. 통증이 이어지면 전문의 진료를 받아보세요.',
      today: restDay(facts.asOf, '통증 확인 필요'),
      recovering: false,
      needsPainCheck: false,
      basis: ['최근 통증 기록 + 오늘 체크인 없음 → 계획 중단'],
      youthNote,
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

  /*
   * 다만 강도는 선수가 직접 매기는 값이라 낮게 적으면 휴식일이 줄어든다.
   * 그리고 계수의 근거가 있는 구간은 강도 5~10뿐이다. 그래서 양 자체로
   * 거는 바닥선을 하나 둔다 — 아무리 가볍게 던졌어도 하루에 이만큼을 던졌으면
   * 하루는 쉬는 것이 맞다.
   */
  const needRest = Math.max(
    requiredRestDays(lastAdjusted),
    lastOuting >= HIGH_VOLUME_PITCHES ? HIGH_VOLUME_MIN_REST : 0
  );
  const restedSoFar = patterns.restDays ?? 99;
  const remainingRest = Math.max(0, needRest - restedSoFar);

  if (needRest > 0 && patterns.lastThrowDate) {
    // 환산값이 실제 투구수와 다르면 둘 다 보여준다. 안 그러면 숫자가 어디서 왔는지 모른다.
    const amount =
      lastAdjusted === lastOuting
        ? `${lastOuting}구`
        : `${lastOuting}구(전력 환산 ${lastAdjusted}구)`;
    basis.push(`마지막 등판 ${amount} → 휴식 ${needRest}일 필요 (경과 ${restedSoFar}일)`);
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
  const baseline = patterns.baselinePitches ?? Math.round(cap * 0.5);
  if (patterns.baselinePitches == null) {
    basis.push(`평소 투구량 기록이 없어 상한의 절반(${baseline}구)에서 시작`);
  } else {
    basis.push(`평소 던진 날 평균 ${baseline}구를 기준으로 계산`);
  }

  let target = Math.round(baseline * adj.volume);

  // 5) 나이별 상한을 넘지 않게 자른다.
  if (target > cap) {
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
      `최근 4주 최장 연투 ${patterns.longestStreak}일 — 이어 던진 뒤에는 하루 쉬는 편이 좋습니다`
    );
  }

  /*
   * 오늘 하루만 정한다.
   *
   * 사흘치를 그리던 때에는 '연투가 길면 첫 등판 다음 날을 쉬게 한다'는 규칙이
   * 있었는데, 내일·모레가 있어야 놓을 자리가 있었다. 지금은 그 사실을 근거로만
   * 남긴다 — longestStreak 는 최근 4주의 최장 연투라, 그것만으로 오늘을
   * 쉬라고 하면 넉 주 전 일로 오늘을 막는 셈이 된다.
   */
  const today: DayPlan = needsPainCheck
    ? restDay(facts.asOf, '메모의 통증 표현 확인 필요')
    : remainingRest > 0
      ? restDay(facts.asOf, `마지막 등판(${lastOuting}구) 회복 중`)
      : {
          dateKey: facts.asOf,
          label: TODAY_LABEL,
          throwing: true,
          maxPitches: target,
          maxIntensity: adj.maxIntensity,
          reason: adj.label,
        };

  return {
    halted: false,
    haltReason: null,
    recovering,
    needsPainCheck,
    today,
    basis,
    youthNote,
  };
}

/**
 * 저장해 둔 계획을 읽는다.
 *
 * AiReport.plan 은 만들 때의 모양 그대로 Json 에 들어간다. 사흘치를 그리던
 * 때에 저장된 것은 today 가 없고 days 배열이 있다. 그대로 읽으면 화면이
 * 터지므로 여기서 옛 모양을 오늘 하나로 옮겨 준다.
 *
 * 모양을 알 수 없으면 null 이다 — 억지로 읽으려 하면 값이 비어 곳곳에서
 * 터진다. 다시 만들라고 하는 편이 낫다.
 */
export function readPitchPlan(value: unknown): PitchPlan | null {
  if (!value || typeof value !== 'object') return null;
  const plan = value as Partial<PitchPlan> & { days?: DayPlan[] };
  if (plan.today) return plan as PitchPlan;
  const first = plan.days?.[0];
  if (!first) return null;
  return { ...(plan as PitchPlan), today: first };
}
