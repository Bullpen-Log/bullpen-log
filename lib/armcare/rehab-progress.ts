import { type ArmcareAreaKey } from '@/lib/armcare/anatomy';
import { withJosa } from '@/lib/korean';
import { shiftDateKey } from '@/lib/pitch-stats';
import {
  rehabJoint,
  type RehabSeverity,
  type RehabStage,
  SHOULDER_AREAS,
} from '@/lib/armcare/rehab-regions';
import {
  afterBadSession,
  cleanSessionsNeeded,
  conditionFloorDays,
  RED_PAIN,
  REHAB_CONDITIONS,
  type RehabConditionKey,
  type RehabSessionLike,
  STAGE_DAYS,
  stageMinDays,
} from '@/lib/armcare/rehab-plan';

/** 재활 규칙 — 지금 상태 · 단계 올리기 · 단계 시험 · 투구 복귀표. 밖에서는 입구 '@/lib/armcare/rehab' 로 가져다 쓴다. */

/* ─────────────────────────────── 지금 상태 ─────────────────────────────── */

/** 상태 계산이 보는 재활 — DB 줄을 읽어 맞춘 것(lib/armcare/rehab-store.ts) */
export type RehabProgramLike = {
  area: ArmcareAreaKey;
  condition: RehabConditionKey | null;
  severity: RehabSeverity;
  stage: RehabStage;
  /** 이 단계를 시작한 날 YYYY-MM-DD */
  stageStartedOn: string;
  stageShortenDays: number;
  /** 재활을 시작한 날 YYYY-MM-DD */
  startedOn: string;
};

/** 상태 계산이 보는 체크인 — 최근 7일(오늘 포함) */
export type RehabCheckinLike = {
  date: string;
  shoulder: string;
  elbow: string;
  armPainLevel: number | null;
};

/** 두 쪽 기록 — 다친 쪽 · 반대쪽(횟수 · 거리) */
export type SidePair = { injured: number; other: number };

/** 투구 복귀표 열기 시험의 기록(가이드라인 9절 마지막 줄) — 통과한 기록의 on 이 투구 복귀표를 연 날이다 */
export type ThrowingTestRecord = {
  pass: boolean;
  /** 앉아서 한 팔 메디신볼 밀기(3번 평균 거리) */
  push: SidePair;
  /** 프론 볼 드롭 30초 · 한 팔 90/90 벽 던지기 30초 — 플라이오볼이 없으면 null */
  drop: SidePair | null;
  wall: SidePair | null;
  /** 시험 중 가장 아팠던 정도 */
  pain: number;
  /** 시험한 날 YYYY-MM-DD */
  on: string;
};

/**
 * 매주 확인이 정한 것 — 다음 확인이 '두 번 이어서'를 세고(calmStreak · testStreak), 카드가 7일 동안 한 줄
 * (진료 권유 · 정도 낮아짐)을 띄운다. 정도가 바뀐 줄을 따로 남길 칸이 프로그램에 없어 확인 줄에 남긴다.
 */
export type WeeklyOutcomeRecord = {
  /** 이어서 '조용한' 주(최고 통증 3 이하 · 밤 통증 없음 · 생활 통증 없음) — 정도를 낮추면 0 부터 다시 */
  calmStreak: number;
  /** 이어서 그 단계 시험을 통과한 확인 수 */
  testStreak: number;
  eased: boolean;
  shortened: boolean;
  lowered: boolean;
  steppedDown: boolean;
  refer: string | null;
};

/**
 * 매주 확인의 test 칸(Json, 설계의 { kind, injured, other } 에 더한 것).
 *   kind      ⑤ 그 단계의 단계 시험 — 1→2 'rom' · 2→3 · 3→4 'strength' · 4단계 'throwing'(투구 복귀표 열기), 건너뛰면 null
 *   pass      그 시험을 통과했나(서버가 다시 판정한 값)
 *   ckc       팔굽혀 터치 15초(CKCUEST) 오늘 기록 — 이 재활의 첫 기록이 '내 첫 기록'이 된다
 *   throwing  투구 복귀표 열기 시험 — 4단계 확인의 ⑤ 이거나, 4단계 카드의 열기 시트가 가장 최근 확인에 붙인 것
 *   outcome   이 확인으로 정한 것
 */
export type RehabWeeklyTest = {
  kind: 'rom' | 'strength' | 'throwing' | null;
  pass: boolean;
  painFree?: boolean;
  similar?: boolean;
  injured?: number;
  other?: number;
  pain?: number;
  ckc?: number | null;
  throwing?: ThrowingTestRecord | null;
  outcome?: WeeklyOutcomeRecord | null;
};

/** 매주 확인 한 줄(UserRehabWeekly) — 상태 계산 · 매주 결과가 보는 것 */
export type RehabWeeklyLike = {
  /** YYYY-MM-DD */
  date: string;
  /** 확인할 때의 단계(결과로 바뀌기 전) */
  stage: number;
  /** 다치기 전 대비 % 0~100 */
  normalPct: number;
  /** 이번 주 가장 아팠던 정도 0~10 */
  worstPain: number;
  /** 밤이나 쉴 때 아픈 적이 있었나 */
  nightPain: boolean;
  /** 내 활동 두 개의 점수 0~10 */
  activities: number[];
  /** 세게 던질 자신감 0~10 */
  confidence: number;
  test: RehabWeeklyTest | null;
};

/** 'YYYY-MM-DD' 두 날 사이의 날 수(to − from) */
export function daysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** 단계 올리기 조건 하나 — 펼친 카드의 '올리는 조건'에 체크 표시와 함께 */
export type GateCheck = { label: string; ok: boolean };

export type StageGate = {
  /** 단계 시험을 해 볼 수 있는가(시험 통과는 따로 — judgeStageTest) */
  ready: boolean;
  checks: GateCheck[];
  minDays: number;
  elapsed: number;
  clean: number;
  cleanNeeded: number;
};

/** 심함이 1단계에 머무는 동안 보는 기간 — 밤 · 쉴 때 통증(체크인 정도 3)이 이만큼 없어야 */
export const NIGHT_PAIN_FREE_DAYS = 7;

export type RehabStatus = {
  /** 시작부터 며칠째(시작한 날이 1) */
  day: number;
  /** 이 단계를 시작하고 지난 날 */
  elapsed: number;
  minDays: number;
  /** 오늘 남긴 세션 — 없으면 null */
  today: RehabSessionLike | null;
  /** 오늘 쉬는 날이면 그 까닭 한 줄 */
  rest: string | null;
  /** 오늘 한 칸 낮춘 운동으로 하는가 */
  lowered: boolean;
  loweredReason: string | null;
  /** 진료 권유 한 줄 */
  refer: string | null;
  /** 심함 — 밤 · 쉴 때 통증이 7일 없을 때까지 1단계에 머무는 중 */
  nightHold: boolean;
  gate: StageGate;
  /** 매주 확인 — 할 때가 됐나 · 지금 할 수 있나 · 가장 최근 것 */
  weekly: WeeklyDueState & { last: RehabWeeklyLike | null };
  /** 지난 7일 안의 매주 확인이 정도를 낮췄다 */
  eased: boolean;
  /** 4단계 — 공 운동을 통증 없이 한 날 · 필요한 날 · 투구 복귀표를 연 날. 4단계가 아니면 null */
  throwing: {
    painFreeBallDays: number;
    needed: number;
    openedOn: string | null;
  } | null;
  /** 카드 위에 뜨는 한 줄(하나만) */
  line: RehabLine | null;
};

export type RehabLineKind =
  'refer' | 'rest' | 'lowered' | 'stage-test' | 'weekly' | 'eased';
export type RehabLine = { kind: RehabLineKind; text: string };

/**
 * 카드 위에 뜨는 한 줄 — 하나만, 우선순위 순(설계 4-2): 진료 권유 > 쉬는 날 > 낮추기 > 단계 시험 > 매주 확인 > 정도가 낮아졌어요.
 * 매주 확인 · 정도 낮아짐은 rehabStatus 가 매주 확인 기록으로 채운다(weeklyDueState · 지난 확인의 outcome.eased).
 */
export function rehabCardLine({
  refer,
  rest,
  lowered,
  stageTest,
  weeklyDue = false,
  eased = false,
}: {
  refer: string | null;
  rest: string | null;
  lowered: string | null;
  stageTest: boolean;
  weeklyDue?: boolean;
  eased?: boolean;
}): RehabLine | null {
  if (refer) return { kind: 'refer', text: refer };
  if (rest) return { kind: 'rest', text: rest };
  if (lowered) return { kind: 'lowered', text: lowered };
  if (stageTest)
    return {
      kind: 'stage-test',
      text: '다음 단계로 갈 준비가 됐어요. 단계 시험을 해 보세요.',
    };
  if (weeklyDue) return { kind: 'weekly', text: '이번 주 확인(1분)을 해 주세요.' };
  if (eased) return { kind: 'eased', text: '통증 정도가 낮아졌어요. 기간이 짧아져요.' };
  return null;
}

/** 이 날 수 안의 빨강 셋이면 진료(가이드라인 10절) */
const REFER_WINDOW_DAYS = 14;
const REFER_RED_COUNT = 3;
/** 한 칸 낮춘 뒤 이만큼 초록이면 원래 단계로 */
export const RETURN_GREENS = 3;

/**
 * 지금 상태 — 쉬는 날인가 · 낮춘 날인가 · 진료를 권할까 · 단계를 올릴 수 있는가 · 카드 한 줄.
 *
 *   쉬는 날   빨강 · 진료 뒤 하루/이틀, 2 · 3 · 4단계는 하루 걸러(어제 했으면 오늘 쉼), 오늘 체크인에서 그 관절이
 *             '통증'인데 정도가 1이 아님(평소에도 · 밤에도 · 모름) — 이때는 진료도 권한다
 *   낮춘 날   이 단계에서 낮추는 빨강이 나온 뒤(또는 이 단계의 매주 확인에서 최고 통증 5 이상 — 가이드라인 10절) 초록이
 *             세 번 나오기 전, 또는 오늘 체크인에서 그 관절이 '던질 때만' 아픔
 *   진료      14일 안에 진료 판정 · 빨강(진료 포함) 셋 · 1단계에서 낮추기 조건 · 지난 7일 안의 매주 확인이 권한 진료
 *   깨끗한 세션  이 단계의 마지막 빨강 · 진료(· 최고 통증 5 이상인 매주 확인) 뒤로 낮추지 않고 한 초록
 *   매주 확인  시작(또는 마지막 확인) 7일 뒤부터 — weeklyDueState
 */
export function rehabStatus({
  program,
  sessions,
  checkins = [],
  weeklies = [],
  todayKey,
}: {
  program: RehabProgramLike;
  /** 이 재활의 세션 전부(차례는 상관없다) */
  sessions: readonly RehabSessionLike[];
  /** 최근 7일(오늘 포함) 체크인 */
  checkins?: readonly RehabCheckinLike[];
  /** 이 재활의 매주 확인 전부(차례는 상관없다) */
  weeklies?: readonly RehabWeeklyLike[];
  todayKey: string;
}): RehabStatus {
  const sorted = [...sessions].sort((a, b) => (a.date < b.date ? -1 : 1));
  const today = sorted.find((s) => s.date === todayKey) ?? null;
  const past = sorted.filter((s) => s.date < todayKey);
  const inStage = sorted.filter(
    (s) => s.stage === program.stage && s.date >= program.stageStartedOn
  );
  const weeklySorted = [...weeklies]
    .filter((w) => w.date <= todayKey)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const lastWeekly = weeklySorted.at(-1) ?? null;
  /* 지난 7일 안의 확인 — 그 주의 밤 통증 · 진료 권유 · 정도 낮아짐을 카드에 이어 보인다 */
  const recentWeekly =
    lastWeekly && daysBetween(lastWeekly.date, todayKey) < WEEKLY_EVERY_DAYS
      ? lastWeekly
      : null;
  /* 이 단계에서 최고 통증 5 이상이던 매주 확인 중 마지막 날 — 한 칸 낮춤 · 깨끗한 세션을 새로 세는 기준 */
  const weeklyLowerOn =
    weeklySorted
      .filter(
        (w) =>
          w.stage === program.stage &&
          w.date >= program.stageStartedOn &&
          w.worstPain >= RED_PAIN
      )
      .at(-1)?.date ?? null;
  const joint = rehabJoint(program.area);
  const todayCheckin = checkins.find((c) => c.date === todayKey) ?? null;
  const jointPainToday = todayCheckin?.[joint] === '통증';

  /* 쉬는 날 — 지난 세션만 본다(오늘 이미 한 것은 '오늘 끝'이다) */
  let rest: string | null = null;
  for (const s of past) {
    const after = afterBadSession(s);
    if (!after) continue;
    const gap = daysBetween(s.date, todayKey);
    if (gap >= 1 && gap <= after.restDays) {
      rest =
        s.result === 'refer'
          ? '오늘은 쉬는 날이에요. 저리거나 빠질 것 같은 느낌이 있었어요.'
          : `오늘은 쉬는 날이에요. 지난번이 빨강이었어요(${after.restDays === 1 ? '하루' : '이틀'} 쉬기).`;
    }
  }
  const last = past.at(-1) ?? null;
  if (!rest && program.stage >= 2 && last && daysBetween(last.date, todayKey) === 1) {
    rest = '오늘은 쉬는 날이에요. 2단계부터는 하루 걸러 해요.';
  }
  let refer: string | null = null;
  if (jointPainToday && todayCheckin?.armPainLevel !== 1) {
    rest = '오늘 체크인에 평소에도 아프다고 하셨어요. 오늘은 쉬어요.';
    refer = '평소에도 아프거나 밤에도 아프면 진료를 받아보세요.';
  }

  /*
   * 한 칸 낮춤 — 이 단계에서 낮추는 빨강 · 진료, 또는 최고 통증 5 이상인 매주 확인(가이드라인 10절 '이번 주 최고 통증 5 이상
   * → 한 칸 낮춤') 뒤 초록 셋 전까지. 세션은 하루 한 줄이라 '뒤'를 날짜로 센다 — 확인한 날의 세션은 확인 앞으로 본다.
   */
  let lowerOn: string | null = null;
  for (const s of inStage) {
    if (afterBadSession(s)?.lower) lowerOn = s.date;
  }
  if (weeklyLowerOn && (!lowerOn || weeklyLowerOn >= lowerOn)) lowerOn = weeklyLowerOn;
  const greensSince = lowerOn
    ? inStage.filter((s) => s.date > lowerOn && s.result === 'green').length
    : 0;
  const loweredBySession = lowerOn != null && greensSince < RETURN_GREENS;
  const loweredByCheckin = jointPainToday && todayCheckin?.armPainLevel === 1;
  const lowered = loweredBySession || loweredByCheckin;
  const loweredReason = loweredBySession
    ? program.stage === 1
      ? '1단계에서도 아팠어요. 아프지 않은 범위에서만 해요.'
      : `한 칸 낮춰 하는 중이에요. 초록 ${RETURN_GREENS - greensSince}번 더면 돌아가요.`
    : loweredByCheckin
      ? '오늘 체크인에 던질 때 아프다고 하셨어요. 한 칸 낮춰 해요.'
      : null;

  /* 진료 권유 */
  const recent = sorted.filter((s) => {
    const gap = daysBetween(s.date, todayKey);
    return gap >= 0 && gap < REFER_WINDOW_DAYS;
  });
  if (!refer) {
    if (recent.some((s) => s.result === 'refer')) {
      refer = '저리거나 빠질 것 같은 느낌이 있었어요. 진료를 받아보세요.';
    } else if (
      recent.filter((s) => s.result === 'red' || s.result === 'refer').length >=
      REFER_RED_COUNT
    ) {
      refer = '2주 안에 빨강이 세 번 나왔어요. 진료를 받아보세요.';
    } else if (loweredBySession && program.stage === 1) {
      refer = '1단계에서도 아파요. 진료를 받아보세요.';
    } else if (recentWeekly?.test?.outcome?.refer) {
      refer = recentWeekly.test.outcome.refer;
    }
  }

  /*
   * 심함 — 밤 · 쉴 때 통증(체크인 정도 3, 또는 지난 7일 안의 매주 확인에서 '밤 · 쉴 때 아팠다')이 7일 없을 때까지
   * 1단계에 머묾
   */
  const nightPainFree =
    !checkins.some(
      (c) =>
        c.armPainLevel === 3 &&
        daysBetween(c.date, todayKey) >= 0 &&
        daysBetween(c.date, todayKey) < NIGHT_PAIN_FREE_DAYS
    ) && !recentWeekly?.nightPain;
  const nightHold =
    program.severity === 'severe' && program.stage === 1 && !nightPainFree;

  const gate = stageGate({
    program,
    inStage,
    todayKey,
    nightPainFree,
    blocked: lowered || refer != null,
    resetOn: weeklyLowerOn,
  });
  const weekly = weeklyDueState({
    startedOn: program.startedOn,
    lastWeeklyOn: lastWeekly?.date ?? null,
    stage: program.stage,
    todayKey,
  });
  const eased = recentWeekly?.test?.outcome?.eased === true;

  return {
    day: daysBetween(program.startedOn, todayKey) + 1,
    elapsed: gate.elapsed,
    minDays: gate.minDays,
    today,
    rest,
    lowered,
    loweredReason,
    refer,
    nightHold,
    gate,
    weekly: { ...weekly, last: lastWeekly },
    eased,
    throwing:
      program.stage === 4
        ? {
            painFreeBallDays: painFreeBallDays({ program, sessions: sorted, todayKey }),
            needed: ballWorkPainFreeDays(program.severity),
            openedOn: throwingOpenedOn(program, weeklySorted),
          }
        : null,
    line: rehabCardLine({
      refer,
      rest: today ? null : rest,
      lowered: today ? null : loweredReason,
      stageTest: gate.ready,
      weeklyDue: weekly.due,
      eased,
    }),
  };
}

/**
 * 단계를 올려도 되는가(시험을 해 볼 수 있는가) — 최소 기간 + 깨끗한 세션 수(cleanSessionsNeeded) + 최근 세 세션(필요한 수가
 * 셋보다 적으면 그만큼) 초록 + (심함 1단계) 밤 · 쉴 때 통증 7일 없음. 낮춘 날 · 진료를 권하는 날은 올리지 않는다.
 * 4단계 다음은 투구 복귀표(judgeThrowingOpen).
 */
export function stageGate({
  program,
  inStage,
  todayKey,
  nightPainFree,
  blocked = false,
  resetOn = null,
}: {
  program: RehabProgramLike;
  /** 이 단계의 세션 — 날짜 차례 */
  inStage: readonly RehabSessionLike[];
  todayKey: string;
  nightPainFree: boolean;
  /** 낮춘 날 · 진료를 권하는 날 */
  blocked?: boolean;
  /** 이 날까지의 세션은 깨끗한 세션으로 세지 않는다 — 최고 통증 5 이상이던 매주 확인(빨강과 같게 본다) */
  resetOn?: string | null;
}): StageGate {
  const minDays = stageMinDays(program);
  const elapsed = Math.max(0, daysBetween(program.stageStartedOn, todayKey));
  if (program.stage === 4) {
    return { ready: false, checks: [], minDays, elapsed, clean: 0, cleanNeeded: 0 };
  }
  const cleanNeeded = cleanSessionsNeeded(program);
  let lastBad = -1;
  inStage.forEach((s, i) => {
    if (s.result === 'red' || s.result === 'refer' || (resetOn && s.date <= resetOn))
      lastBad = i;
  });
  const clean = inStage
    .slice(lastBad + 1)
    .filter((s) => s.result === 'green' && !s.lowered).length;
  const recentNeeded = Math.min(3, cleanNeeded);
  const recent = inStage.slice(-recentNeeded);
  const threeGreen =
    recent.length === recentNeeded &&
    recent.every((s) => s.result === 'green' && !s.lowered);

  const checks: GateCheck[] = [
    { label: `이 단계 ${minDays}일 이상 (지금 ${elapsed}일)`, ok: elapsed >= minDays },
    {
      label: `깨끗한(초록) 세션 ${cleanNeeded}번 (지금 ${Math.min(clean, cleanNeeded)}번)`,
      ok: clean >= cleanNeeded,
    },
    { label: `최근 ${recentNeeded}번 모두 초록`, ok: threeGreen },
  ];
  if (program.severity === 'severe' && program.stage === 1) {
    checks.push({
      label: `밤 · 쉴 때 통증 없이 ${NIGHT_PAIN_FREE_DAYS}일`,
      ok: nightPainFree,
    });
  }
  return {
    ready: !blocked && checks.every((c) => c.ok),
    checks,
    minDays,
    elapsed,
    clean,
    cleanNeeded,
  };
}

/* ─────────────────────────────── 단계 시험 ─────────────────────────────── */

/**
 * 단계 시험(가이드라인 9절 — 던지는 팔 기준).
 *   1→2  양쪽 움직임 비교 — 다친 쪽이 아프지 않고 반대쪽과 비슷
 *   2→3  양쪽 힘 횟수 — 다친 쪽 ≥ 반대쪽 90% · 시험 중 통증 2 이하
 *   3→4  같은 힘 횟수 ≥ 100%(어깨 바깥 돌리기는 95%) + (어깨 부위) 팔굽혀 터치 15초(CKCUEST)가 통증 없이 내 첫 기록보다 늘어남
 */
export type StageTest =
  | { kind: 'rom'; from: 1; method: string }
  | {
      kind: 'strength';
      from: 2 | 3;
      /** 힘 비교에 쓰는 운동 */
      exercise: string;
      /** 통과선(반대쪽 대비, %) */
      percent: number;
      /** CKCUEST 를 함께 보는가(3→4 어깨 부위) */
      ckc: boolean;
      method: string;
    };

/** 시험 중 이 통증까지 '통증 없음'(3 · 4단계와 같은 선) */
export const TEST_PAIN_LIMIT = 2;

export const CKCUEST_METHOD =
  '손을 91cm 떨어진 두 줄에 두고 엎드려 버틴 채, 15초 동안 한 손씩 반대 줄을 번갈아 터치해요. 세 번 해서 평균을 적어요.';

/** 힘 비교 운동 — 어깨 넷: 사이드라잉 외회전, 팔꿈치 안쪽 · 뒤쪽: 덤벨 전완 굴곡, 바깥쪽: 덤벨 전완 신전, 앞쪽: 덤벨 해머컬 */
function strengthExercise(area: ArmcareAreaKey): string {
  if (SHOULDER_AREAS.includes(area)) return '사이드라잉 외회전';
  if (area === 'elbow-outer') return '덤벨 전완 신전';
  if (area === 'elbow-front') return '덤벨 해머컬';
  return '덤벨 전완 굴곡';
}

/** 이 단계에서 다음으로 가는 시험 — 4단계는 투구 복귀표 열기(judgeThrowingOpen)라 null */
export function stageTestFor(
  area: ArmcareAreaKey,
  stage: RehabStage
): StageTest | null {
  const shoulder = SHOULDER_AREAS.includes(area);
  if (stage === 1) {
    return {
      kind: 'rom',
      from: 1,
      method: shoulder
        ? '팔을 앞 · 옆으로 머리 위까지 올리고, 팔꿈치를 옆에 붙여 안팎으로 돌려 양쪽을 견줘요.'
        : '팔꿈치를 끝까지 굽히고 펴서 양쪽을 견줘요.',
    };
  }
  if (stage === 4) return null;
  const exercise = strengthExercise(area);
  return {
    kind: 'strength',
    from: stage,
    exercise,
    percent: stage === 2 ? 90 : shoulder ? 95 : 100,
    ckc: stage === 3 && shoulder,
    method: `같은 가벼운 덤벨(또는 밴드)로 ${withJosa(exercise, '을/를')} 지칠 때까지 해서, 양쪽 횟수를 세요.`,
  };
}

export type StageTestInput = {
  /** 1→2: 다친 쪽을 움직일 때 아프지 않았는가 */
  painFree?: boolean;
  /** 1→2: 반대쪽과 비슷하게 움직이는가 */
  similar?: boolean;
  /** 힘 비교: 다친 쪽 · 반대쪽 횟수 */
  injured?: number;
  other?: number;
  /** 시험 중 가장 아팠던 정도 0~10 */
  pain?: number;
  /** CKCUEST: 오늘 · 처음 기록(3번 평균) */
  ckcNow?: number | null;
  ckcFirst?: number | null;
};

/** a 가 b 의 percent% 이상인가 — 소수 오차 없이 정수로 견준다 */
export function atLeastPercent(a: number, b: number, percent: number): boolean {
  return Math.round(a * 1000) * 100 >= Math.round(b * 1000) * percent;
}

/** 단계 시험 판정 — 통과 못 한 까닭을 한 줄씩 */
export function judgeStageTest(
  test: StageTest,
  input: StageTestInput
): { pass: boolean; fails: string[] } {
  const fails: string[] = [];
  if (test.kind === 'rom') {
    if (input.painFree !== true) fails.push('움직일 때 아프지 않아야 해요.');
    if (input.similar !== true) fails.push('반대쪽과 비슷하게 움직여야 해요.');
    return { pass: fails.length === 0, fails };
  }
  const injured = input.injured ?? NaN;
  const other = input.other ?? NaN;
  if (!(injured >= 0) || !(other > 0)) {
    fails.push('양쪽 횟수를 적어 주세요.');
  } else if (!atLeastPercent(injured, other, test.percent)) {
    fails.push(`다친 쪽이 반대쪽의 ${test.percent}% 이상이어야 해요.`);
  }
  if (input.pain == null || input.pain > TEST_PAIN_LIMIT) {
    fails.push(`시험 중 통증이 ${TEST_PAIN_LIMIT} 이하여야 해요.`);
  }
  if (test.ckc) {
    const now = input.ckcNow ?? null;
    const first = input.ckcFirst ?? null;
    if (now == null || first == null) {
      fails.push(
        '팔굽혀 터치는 첫 기록과 오늘 기록이 둘 다 있어야 해요. 오늘 기록을 적어 두고 다음에 견줘요.'
      );
    } else if (!(now > first)) {
      fails.push('팔굽혀 터치가 첫 기록보다 늘어야 해요.');
    }
  }
  return { pass: fails.length === 0, fails };
}

/* ─────────────────────────────── 투구 복귀표 열기 ─────────────────────────────── */

/**
 * 4단계 공 운동을 이만큼 통증 없이 해야 한다(일) — 정도의 4단계 최소 기간(가벼움 4 · 보통 5 · 심함 7일).
 * 2026-10-04 고침: 처음에는 Wilk 의 '공 운동 2주'를 그대로 14일로 두었는데, 정도별 기간 표(사용자 "너무 보수적")와
 * 어긋났다. 진단받은 병은 병명 바닥(시작부터 UCL 6주 등)이 따로 지킨다.
 */
export function ballWorkPainFreeDays(severity: RehabSeverity): number {
  return STAGE_DAYS[severity][3];
}

/**
 * 4단계에서 공 운동을 통증 없이 한 날 — judgeThrowingOpen 의 painFreeBallDays.
 *
 * [정리] 4단계(이 단계를 시작한 날부터)에서 낮추지 않은 초록 세션이 이어진 첫날부터 오늘까지 지난 날(오늘 − 첫날).
 * 노랑 · 빨강 · 진료, 또는 낮춘 초록(아래 단계 운동이라 공 운동이 아니다)이 끼면 그 뒤의 초록부터 새로 센다.
 * 하는 날이 하루 걸러라 세션이 없는 날도 이어진 것으로 본다. 날 수는 단계 기간(elapsed)과 같이 '지난 날'로 센다 —
 * 첫 초록이 오늘이면 0, 4단계 최소 기간만큼 지나야 그 기간을 채운다.
 */
export function painFreeBallDays({
  program,
  sessions,
  todayKey,
}: {
  program: Pick<RehabProgramLike, 'stage' | 'stageStartedOn'>;
  sessions: readonly RehabSessionLike[];
  todayKey: string;
}): number {
  if (program.stage !== 4) return 0;
  const inStage = sessions
    .filter(
      (s) => s.stage === 4 && s.date >= program.stageStartedOn && s.date <= todayKey
    )
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  let runFrom: string | null = null;
  for (const s of inStage) {
    if (s.result === 'green' && !s.lowered) runFrom ??= s.date;
    else runFrom = null;
  }
  return runFrom ? daysBetween(runFrom, todayKey) : 0;
}

/**
 * 투구 복귀표를 연 날 — 이 4단계(단계를 시작한 날부터)에서 통과한 열기 시험 중 가장 이른 날. 없으면 null.
 * 연 날을 남길 칸이 프로그램에 없어 매주 확인의 test.throwing 에 남긴다. 단계를 바꾸면(내렸다 다시 4단계) 새로 열어야 한다.
 */
export function throwingOpenedOn(
  program: Pick<RehabProgramLike, 'stage' | 'stageStartedOn'>,
  weeklies: readonly RehabWeeklyLike[]
): string | null {
  if (program.stage !== 4) return null;
  const days = weeklies
    .map((w) => w.test?.throwing)
    .filter(
      (t): t is ThrowingTestRecord =>
        t != null && t.pass && t.on >= program.stageStartedOn
    )
    .map((t) => t.on)
    .sort();
  return days[0] ?? null;
}

/** 플라이오볼(0.5~1kg 작은 공)이 있나 — 장비를 아직 안 골랐으면 있다고 본다(buildRehabSession 과 같다) */
export function hasPlyoBall(ownedEquipment: readonly string[]): boolean {
  return ownedEquipment.length === 0 || ownedEquipment.includes('플라이오볼');
}

/**
 * 투구 복귀표를 여는가(가이드라인 9절 마지막 줄 — 화면은 4단계 카드의 열기 시트 · 4단계 매주 확인의 ⑤).
 *   4단계 공 운동을 정도의 4단계 기간만큼 통증 없이 + 병명 바닥(시작부터) + 앉아서 한 팔 메디신볼 밀기 ≥ 100% +
 *   (플라이오볼이 있으면) 프론 볼 드롭 30초 ≥ 110% · 한 팔 90/90 벽 던지기 30초 ≥ 115% + 시험 중 통증 없이 +
 *   정상 대비 90% 이상 + 던질 자신감 7 이상
 * 플라이오볼이 없으면 볼 드롭 · 벽 던지기는 건너뛰고 밀기 · 힘 비교로 본다.
 */
export function judgeThrowingOpen(input: {
  severity: RehabSeverity;
  painFreeBallDays: number;
  daysSinceStart: number;
  condition: RehabConditionKey | null;
  hasPlyo: boolean;
  push: { injured: number; other: number };
  drop?: { injured: number; other: number } | null;
  wall?: { injured: number; other: number } | null;
  pain: number;
  normalPct: number;
  confidence: number;
}): { pass: boolean; fails: string[] } {
  const fails: string[] = [];
  const ballDays = ballWorkPainFreeDays(input.severity);
  if (input.painFreeBallDays < ballDays) {
    fails.push(`4단계 공 운동을 ${ballDays}일 통증 없이 해야 해요.`);
  }
  const floor = conditionFloorDays(input.condition);
  if (input.condition && input.daysSinceStart < floor) {
    const label = withJosa(REHAB_CONDITIONS[input.condition].label, '은/는');
    fails.push(`${label} 시작하고 ${floor / 7}주가 지나야 해요.`);
  }
  if (!atLeastPercent(input.push.injured, input.push.other, 100)) {
    fails.push('앉아서 한 팔 메디신볼 밀기가 반대쪽만큼 나가야 해요.');
  }
  if (input.hasPlyo) {
    const { drop, wall } = input;
    if (!drop || !atLeastPercent(drop.injured, drop.other, 110)) {
      fails.push('프론 볼 드롭이 반대쪽의 110% 이상이어야 해요.');
    }
    if (!wall || !atLeastPercent(wall.injured, wall.other, 115)) {
      fails.push('한 팔 90/90 벽 던지기가 반대쪽의 115% 이상이어야 해요.');
    }
  }
  if (input.pain > TEST_PAIN_LIMIT) fails.push('시험 중 아프지 않아야 해요.');
  if (input.normalPct < 90) fails.push('팔 상태가 다치기 전의 90% 이상이어야 해요.');
  if (input.confidence < 7) fails.push('세게 던질 자신감이 7 이상이어야 해요.');
  return { pass: fails.length === 0, fails };
}

/* ─────────────────────────────── 투구 복귀표 ─────────────────────────────── */

/** 투구 복귀표 여섯 칸(가이드라인 11절) — 기록은 남기지 않는다(표만) */
export const THROWING_STEPS: readonly { distance: string; plan: string }[] = [
  { distance: '14m', plan: '가볍게 몸 풀기 → 25개 → 쉬기 → 25개' },
  { distance: '18m', plan: '같은 방식' },
  { distance: '27m', plan: '같은 방식' },
  { distance: '37m', plan: '같은 방식' },
  { distance: '46m', plan: '같은 방식' },
  {
    distance: '마운드',
    plan: '직구만 15개(절반 힘) → 30개 → 45개(3/4 힘) → 60개(거의 전력) → 변화구 섞기',
  },
];

/** 정도별 빈도(가이드라인 11절 — Axe 2009 · Reinold) */
export function throwingFrequency(severity: RehabSeverity): string {
  switch (severity) {
    case 'mild':
      return '각 칸 한 번씩, 하루 던지고 하루 쉬어요(약 2주).';
    case 'moderate':
      return '각 칸 두 번씩, 하루 걸러 던져요.';
    case 'severe':
      return '각 칸 두 번씩 해요. 처음 네 칸은 사흘에 한 칸씩 올라가요.';
  }
}

/** 던지기 통증 규칙(가이드라인 11절 — Axe 2009 그대로) */
export const THROWING_PAIN_RULES: readonly { when: string; then: string }[] = [
  { when: '안 아프면', then: '다음 던지는 날 다음 칸으로 가요.' },
  {
    when: '몸 풀 때 아프다가 처음 15개 안에 사라지면',
    then: '지난 칸을 다시 해요. 그러다 또 아프면 멈추고 이틀 쉰 뒤 한 칸 내려가요.',
  },
  {
    when: '몸 풀 때 아프고 15개가 지나도 계속 아프면',
    then: '멈추고 이틀 쉰 뒤 한 칸 내려가요.',
  },
  {
    when: '던지고 1시간 넘게, 또는 다음 날 아프면',
    then: '하루 쉬고 같은 칸을 해요.',
  },
];

/** 절반 힘 한 줄(가이드라인 11절 — Fleisig, Chang 2016 인용) */
export const HALF_EFFORT_NOTE =
  "'절반 힘'으로 던진다고 생각해도 실제로는 구속의 약 85%가 나와요. 힘을 일부러 덜 써요.";
/* ─────────────────────────────── 매주 확인 때 ─────────────────────────────── */

/** 매주 확인 사이(일) — 시작(또는 마지막 확인)에서 이만큼 지나면 카드에 '이번 주 확인' */
export const WEEKLY_EVERY_DAYS = 7;

export type WeeklyDueState = {
  /** 할 때가 됐다 — 카드에 '이번 주 확인(1분)' */
  due: boolean;
  /** 지금 할 수 있다 — 때가 됐거나, 4단계인데 아직 한 번도 안 했다(투구 복귀표 열기에 최근 확인이 필요하다) */
  allowed: boolean;
};

/**
 * 매주 확인 때 — 마지막 확인(없으면 시작한 날)에서 7일이 지나면 한다. 미리 하면 '두 번 이어서'가 빨리 차서 앞당기기가
 * 빨라지므로 때 전에는 받지 않는다. 4단계에서 아직 한 번도 안 했으면 예외 — 투구 복귀표를 열려면 최근 확인이 있어야 한다.
 */
export function weeklyDueState({
  startedOn,
  lastWeeklyOn,
  stage,
  todayKey,
}: {
  startedOn: string;
  lastWeeklyOn: string | null;
  stage: number;
  todayKey: string;
}): WeeklyDueState {
  const due = daysBetween(lastWeeklyOn ?? startedOn, todayKey) >= WEEKLY_EVERY_DAYS;
  return { due, allowed: due || (stage === 4 && lastWeeklyOn == null) };
}

/* ─────────────────────────────── 투구 복귀표 기록 ─────────────────────────────── */

/**
 * 던진 날 남기기(2026-10-09 트레이닝 검토 3-⑧) — 가이드라인 11절은 '기록 없음'이었다. 표만 보여 주고 던진 것은 어디에도
 * 안 남아, 통증 규칙(다음 칸 · 다시 · 한 칸 내려가기)을 사람이 머릿속으로 돌려야 했고 투구 부하에도 안 잡혔다.
 *
 * DB 칸을 새로 만들지 않고(마이그레이션은 사용자가 백업 뒤 직접) 투구 기록(PitchLog)에 남긴다 — 캐치볼(마운드 칸은 불펜)로
 * 공 수 · 강도가 부하 지수에 그대로 들어가고, 메모의 꼬리표(THROW_TAG)로 몇 칸 · 통증을 다시 읽는다(parseThrowMemo).
 * 꼬리표 글자를 바꾸면 옛 기록을 못 읽으니 바꾸지 않는다. 제대로 된 칸은 TODOS.md.
 */
export const THROW_TAG = '재활 투구 복귀표';

export type ThrowPain = 'none' | 'faded' | 'stayed';

/** 던질 때 통증 — 가이드라인 11절의 규칙 셋(던진 뒤 1시간 넘게 · 다음 날 아픈 것은 따로, laterPain) */
export const THROW_PAIN_OPTIONS: readonly { value: ThrowPain; label: string }[] = [
  { value: 'none', label: '안 아팠어요' },
  { value: 'faded', label: '몸 풀 때 아프다가 15개 안에 사라졌어요' },
  { value: 'stayed', label: '15개가 지나도 계속 아팠어요' },
];

const THROW_PAIN_TEXT: Record<ThrowPain, string> = {
  none: '통증 없음',
  faded: '몸 풀 때 통증(15개 안에 사라짐)',
  stayed: '통증 계속',
};
const LATER_PAIN_TEXT = '던진 뒤 통증';

export type ThrowRecord = {
  /** 'YYYY-MM-DD' */
  date: string;
  /** 1~6 칸(THROWING_STEPS) */
  step: number;
  pitches: number;
  pain: ThrowPain;
  /** 던지고 1시간 넘게 · 다음 날 아팠다(나중에 붙인다) */
  laterPain: boolean;
};

/** 마운드 칸의 묶음 — 공 수로 고르고 강도는 여기서 정한다(직구 절반 힘 → 거의 전력) */
export const MOUND_SETS: readonly { pitches: number; label: string; intensity: number }[] = [
  { pitches: 15, label: '15개 · 절반 힘', intensity: 5 },
  { pitches: 30, label: '30개 · 절반 힘', intensity: 5 },
  { pitches: 45, label: '45개 · 3/4 힘', intensity: 7 },
  { pitches: 60, label: '60개 · 거의 전력', intensity: 9 },
];

/** 거리 칸의 공 수(25개 → 쉬기 → 25개) · 강도(절반 힘) */
export const DISTANCE_PITCHES = 50;
export const DISTANCE_INTENSITY = 5;

export const isThrowStep = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= THROWING_STEPS.length;
export const isThrowPain = (v: unknown): v is ThrowPain =>
  v === 'none' || v === 'faded' || v === 'stayed';

/** 투구 기록의 강도 — 거리 칸은 절반 힘, 마운드 칸은 공 수로 */
export function throwIntensity(step: number, pitches: number): number {
  if (step < THROWING_STEPS.length) return DISTANCE_INTENSITY;
  return [...MOUND_SETS].reverse().find((m) => pitches >= m.pitches)?.intensity ?? DISTANCE_INTENSITY;
}

/** 투구 기록의 종류 — 마운드 칸만 불펜, 나머지는 캐치볼(가볍게 주고받기와 같은 무게로 센다) */
export const throwSessionType = (step: number) =>
  step >= THROWING_STEPS.length ? '불펜' : '캐치볼';

/** 투구 기록 메모 — '재활 투구 복귀표 2칸 · 18m · 통증 없음' */
export function throwMemo(step: number, pain: ThrowPain, laterPain = false): string {
  const distance = THROWING_STEPS[step - 1]?.distance ?? '';
  return [`${THROW_TAG} ${step}칸`, distance, THROW_PAIN_TEXT[pain], ...(laterPain ? [LATER_PAIN_TEXT] : [])].join(' · ');
}

const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const THROW_MEMO_RE = new RegExp(
  `^${esc(THROW_TAG)} (\\d)칸 · [^·]+ · (${(Object.keys(THROW_PAIN_TEXT) as ThrowPain[]).map((k) => esc(THROW_PAIN_TEXT[k])).join('|')})( · ${esc(LATER_PAIN_TEXT)})?\\s*$`
);

/** 메모 → 칸 · 통증. 꼬리표가 아니면 null */
export function parseThrowMemo(memo: string | null | undefined): Pick<ThrowRecord, 'step' | 'pain' | 'laterPain'> | null {
  if (!memo) return null;
  const m = THROW_MEMO_RE.exec(memo);
  if (!m) return null;
  const step = Number(m[1]);
  const pain = (Object.keys(THROW_PAIN_TEXT) as ThrowPain[]).find((k) => THROW_PAIN_TEXT[k] === m[2]);
  if (!isThrowStep(step) || !pain) return null;
  return { step, pain, laterPain: m[3] != null };
}

export type ThrowingNext = {
  /** 다음에 던질 칸 */
  step: number;
  /** 이날부터 던진다 — 오늘이거나 지났으면 null */
  restUntil: string | null;
  /** 왜 이 칸인가 — 한 줄 */
  reason: string;
  /** 마운드 칸까지 통증 없이 마쳤다 → 재활 끝내기 */
  done: boolean;
};

/** 정도별로 한 칸을 몇 번 하나(가이드라인 11절 — 가벼움 한 번, 보통 · 심함 두 번) */
export const repeatsPerStep = (severity: RehabSeverity) => (severity === 'mild' ? 1 : 2);

/**
 * 다음에 던질 칸 — 던진 기록과 통증 규칙(Axe 2009)으로.
 *   안 아픔 → 그 칸을 정도만큼(한 번 · 두 번) 통증 없이 했으면 다음 칸, 아니면 같은 칸 한 번 더
 *   몸 풀 때 아프다 사라짐 → 지난 칸을 다시. 그 칸에서 두 번 이어 그러면 이틀 쉬고 한 칸 내려감
 *   계속 아픔 → 이틀 쉬고 한 칸 내려감
 *   던진 뒤 · 다음 날 아픔(laterPain) → 하루 쉬고 같은 칸
 * 던지는 날은 모든 정도가 하루 걸러(하루 던지고 하루 쉬기)라 다음 날은 늘 쉰다. 심함은 처음 네 칸을 사흘에 한 칸 —
 * 그 칸의 첫 던진 날에서 사흘이 지나야 올라간다.
 */
export function throwingNext({
  records,
  severity,
  todayKey,
}: {
  records: readonly ThrowRecord[];
  severity: RehabSeverity;
  todayKey: string;
}): ThrowingNext {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted.at(-1);
  if (!last) return { step: 1, restUntil: null, reason: '첫 칸부터 시작해요.', done: false };

  const until = (days: number) => {
    const key = shiftDateKey(last.date, days);
    return key > todayKey ? key : null;
  };
  const down = Math.max(1, last.step - 1);

  if (last.laterPain) {
    return { step: last.step, restUntil: until(2), reason: '던진 뒤에 아파서 하루 쉬고 같은 칸을 해요.', done: false };
  }
  if (last.pain === 'stayed') {
    return { step: down, restUntil: until(3), reason: '15개가 지나도 아파서 이틀 쉬고 한 칸 내려가요.', done: false };
  }
  if (last.pain === 'faded') {
    const prev = sorted.at(-2);
    const again = prev != null && prev.step === last.step && prev.pain === 'faded';
    return again
      ? { step: down, restUntil: until(3), reason: '같은 칸에서 또 아파서 이틀 쉬고 한 칸 내려가요.', done: false }
      : { step: last.step, restUntil: until(2), reason: '몸 풀 때 아팠으니 지난 칸을 다시 해요.', done: false };
  }

  /* 안 아픔 — 그 칸을 정도만큼 통증 없이 이어서 했나(내려갔다 다시 올라온 것은 새로 센다) */
  const atStep = [];
  for (let i = sorted.length - 1; i >= 0 && sorted[i].step === last.step && sorted[i].pain === 'none' && !sorted[i].laterPain; i--) {
    atStep.unshift(sorted[i]);
  }
  const need = repeatsPerStep(severity);
  if (atStep.length < need) {
    return { step: last.step, restUntil: until(2), reason: `이 칸을 통증 없이 ${need}번 하면 다음 칸으로 가요(지금 ${atStep.length}번).`, done: false };
  }
  if (last.step >= THROWING_STEPS.length) {
    return { step: last.step, restUntil: null, reason: '마운드 칸까지 통증 없이 마쳤어요. 재활을 끝낼 수 있어요.', done: true };
  }
  /* 심함은 처음 네 칸을 사흘에 한 칸 — 그 칸의 첫 던진 날에서 사흘 */
  let rest = until(2);
  if (severity === 'severe' && last.step <= 4) {
    const slow = shiftDateKey(atStep[0].date, 3);
    if (slow > (rest ?? todayKey)) rest = slow > todayKey ? slow : rest;
  }
  return { step: last.step + 1, restUntil: rest, reason: '안 아팠으니 다음 칸으로 가요.', done: false };
}
