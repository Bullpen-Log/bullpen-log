/**
 * 오늘 상태 한 장 — 트레이닝 추천 2판 P3(2026-10-12, docs/designs/training-recommendation-engine.md).
 *
 * 왜 두는가. '오늘 어떤 날인가'를 다섯 독자(매일 일정 theme.ts · 투구 계획 plan.ts · 암케어 armcare/routine.ts · 근력 프로그램
 * program/load.ts · 영양 nutrition/guide.ts)가 facts 를 저마다 다르게 읽어, 같은 아침에 일정은 회복인데 암케어는 강화,
 * 투구 계획은 평소대로 던지라고 하는 날이 생겼다(자체 시험 '[2판 안전망(P0)]' 엇갈림 표 C1~C6). 여기서 한 번 읽어 한 장으로
 * 만들고, 독자는 이것을 보고 저마다의 결론(테마 · 루틴 · 쉬기)을 낸다.
 *
 * 이 파일은 판단을 하지 않는다 — 신호를 모으기만 한다. 첫 단계(7ae15c7)에서는 아무 독자의 결론도 바뀌지 않았다:
 *   - 세게 던진 날(recentHardOuting)과 오늘 · 어제 등판 답 합치기(nextOutingWindow)는 theme.ts 의 hardOuting · plannedOuting 이
 *     그대로 여기에 맡긴다(규칙을 옮겼을 뿐 값은 같다 — 자체 시험이 옛 식과 160조합 · 등판 답 49쌍에서 견준다).
 *     2판 P4 커밋 B(2026-10-12)부터 등판(다음 것 · 지난 것)은 lib/engine/outing.ts 의 outingOf 한 곳에서 읽고, 이 장의 outing 칸과
 *     theme.ts plannedOuting 이 같은 함수를 부른다. 그때 출처 칸을 둘로 갈랐다(source → lastSource, nextFrom → nextSource — 값은 같다).
 *   - 그 밖의 칸은 기존 규칙 함수(prescription.ts 의 통증 함수 · plan.ts 의 pendingOuting · checkin.ts 의 문턱)를 그대로 부른다.
 *     문턱을 여기서 새로 정하지 않는다 — 새로 정하면 독자와 이 장이 어긋난다.
 * 독자를 이 장으로 옮기는 것은 단계마다 하나씩 — C1 · C4 뒤집기(2026-10-12): 투구 계획은 같은 등판 규칙(lib/checkin.ts
 * todayOutingRole)으로 등판 날을 '양은 경기가 정함'으로 내고, 암케어는 이 장(outing.role · arm.fatigue)을 받아 등판 날 회복으로 간다.
 * 프로그램 · 영양 읽기 통일(2026-10-12): 근력 프로그램(lib/program/load.ts)은 등판 답(outing.answerToday · answerYesterday)과
 * 세게 던진 날(load.hardOutingRecent)을 이 장에서 받아 lib/program/program.ts programSignalsOf 로 신호를 만든다. 영양(lib/nutrition/
 * guide.ts)은 받는 모양(GuideSignals)을 그대로 두고 안에서 lib/checkin.ts 의 같은 규칙으로 읽는다 — 이 장을 받는 것은 P6(영양 추세).
 *
 * 순수 파일이다 — 'server-only' · prisma · 날짜 함수(appNow) 없음. 자체 시험 · 기준선 도구가 node 로 그대로 부른다.
 * DB 를 읽는 쪽은 lib/report/gather.ts(gatherFactsAndPlan 이 state 를 같이 돌려준다 — 이미 react cache 로 읽은 45일치 줄에서
 * 팔 통증 자리만 더 꺼내므로 조회가 늘지 않는다). 팔 피로는 2판 P4 커밋 C 부터 facts(CheckinLike.armFatigue)에서 읽는다 — 그 전에는
 * extras 로 받았는데, 매일 일정의 안전 거르기 · 일정 지문도 같은 값을 읽어야 해서 facts 한 곳으로 옮겼다.
 *
 * import 금지: lib/report/theme.ts(theme 이 이 파일에 맡기므로 되부르면 순환) · lib/program/load.ts · lib/report/plan-fingerprint.ts
 * (둘 다 theme 을 부른다). 프로그램 · 메커니즘 · 체중 흐름은 DayStateExtras 로 받기만 한다.
 */
import {
  CHECKIN_PARTS,
  HIGH_ARM_FATIGUE,
  HIGH_SORENESS,
  LOW_CONDITION_THRESHOLD,
  SEVERE_SORENESS,
  SHORT_SLEEP_HOURS,
  armFatigueWord,
  armPainSpotsFor,
  formatSleepHours,
  isShortSleep,
  nextOutingWindow,
  sorenessWord,
  todayOutingRole,
  type CheckinPartKey,
  type OutingWindow,
} from '@/lib/checkin';
import type { ArmcareAreaKey } from '@/lib/armcare/anatomy';
import { outingOf, type Outing } from '@/lib/engine/outing';
import {
  isHardOuting,
  isNearMaxOuting,
  type HardOuting,
  type ReportFacts,
} from '@/lib/report/facts';
import { pendingOuting, type PitchPlan } from '@/lib/report/plan';
import {
  checkinPartLabel,
  painEasingParts,
  painPartsToday,
  painStateUnknown,
  rehabEasingParts,
} from '@/lib/report/prescription';

/* ─────────────────────────── 부분 함수(독자가 facts 만 가진 자리에서 같은 규칙을 쓰게) ─────────────────────────── */

/**
 * 세게 던진 날의 여파 — 오늘이나 어제 세게 던진 날이 있으면 그날(가까운 것), 없으면 null.
 *
 * '세게 던진 날'의 판정은 lib/report/facts.ts 의 isHardOuting 한 곳(Σ 투구수 × 체감 강도 ≥ 2,700 또는 경기 · 강도 9~10 으로 30구, 옛 facts 는 30구 — 2판 D2 · P3 검토).
 * 여기서는 '오늘 · 어제(daysAgo ≤ 1)'만 고른다. theme.ts 의 hardOuting 이 이 함수를 그대로 부른다(2판 P3에서 옮김 — 몸통은 같다).
 * 이 칸이 생기기 전에 저장된 facts(hardOutings 없음)는 빈 목록으로 본다.
 */
export function recentHardOuting(facts: ReportFacts): HardOuting | null {
  return (
    (facts.patterns.hardOutings ?? []).find((o) => o.daysAgo <= 1 && isHardOuting(o)) ??
    null
  );
}

/*
 * 오늘 · 어제 등판 답 합치기(nextOutingWindow)와 '오늘 등판 · 불펜인가'(todayOutingRole)는 lib/checkin.ts 에 있다 — 투구 계획
 * (lib/report/plan.ts)도 같은 규칙을 읽는데, 이 파일이 plan.ts 를 부르므로 plan.ts 가 이 파일을 부르면 순환이 된다(2판 P3 C1 · C4
 * 뒤집기에서 옮김). 이 파일을 부르던 곳(theme.ts · 자체 시험)이 그대로 맞게 여기서 다시 내보낸다.
 */
export { nextOutingWindow, todayOutingRole, type OutingWindow };

/* ─────────────────────────── 계약 ─────────────────────────── */

/** 진행 중인 근력 프로그램(UserTrainingProgram 한 줄에서) — 부르는 쪽이 넘긴다 */
export type ProgramCommitmentInput = {
  /** programKey — '531' · 'stronglifts-5x5:2' … */
  key: string;
  /** 다음에 할 일차(1부터) */
  nextDay: number;
  /** 전체 일차 — 알면 다 마쳤는지 셈한다(모르면 null) */
  totalDays?: number | null;
  /** 마지막으로 마친 날(YYYY-MM-DD), 없으면 null */
  lastDoneDate: string | null;
};

export type ProgramCommitment = ProgramCommitmentInput & {
  /** 다 마쳤는가 — totalDays 를 알고 nextDay 가 그보다 크면 */
  done: boolean;
  /** 마지막으로 마친 날로부터 지난 날(오늘 마쳤으면 0), 모르면 null */
  daysSinceLastDone: number | null;
};

/** 메커니즘 프로그램(lib/mechanics/load.ts 의 MechanicsProgramView 에서) — 부르는 쪽이 넘긴다 */
export type MechanicsCommitment = {
  level: string | null;
  /** 단계 안에서 몇 번째 세션인가 */
  index: number;
  /** 오늘 세션을 마쳤는가 */
  finishedToday: boolean;
};

/** 체중 흐름(lib/nutrition/weight-goal.ts — 영양 추세는 2판 P6) — 부르는 쪽이 넘긴다 */
export type NutritionTrend = {
  /** 일주일에 몇 kg 바뀌는가(늘면 +), 모르면 null */
  kgPerWeek: number | null;
  kind: 'gain' | 'lose' | 'flat' | 'unknown';
};

/** facts · plan 밖에 있는 것 — 모두 안 줘도 된다(안 주면 그 칸은 null · 모름) */
export type DayStateExtras = {
  /*
   * 팔 피로는 여기 없다 — facts.condition.today.armFatigue 를 읽는다(2판 P4 커밋 C). 칸이 두 곳에 있으면 장과 안전 거르기가 다른
   * 값을 볼 수 있다.
   */
  /**
   * 오늘 체크인에 저장된 팔 통증 자리 · 정도(lib/checkin.ts 의 pickArmPain 결과 그대로). 자리는 오늘 어깨 · 팔꿈치가 '통증'인
   * 관절의 것만 남긴다(armPainSpotsFor — lib/armcare/today.ts 와 같은 규칙).
   */
  armPain?: { spots: readonly string[]; level: number | null } | null;
  program?: ProgramCommitmentInput | null;
  mechanics?: MechanicsCommitment | null;
  nutritionTrend?: NutritionTrend | null;
};

export type DayState = {
  /** 기준일(YYYY-MM-DD) — facts.asOf */
  asOf: string;
  /** 넘을 수 없는 것 — 통증 · 재활 · 공을 쉬는 날 · 체크인 필요 · 팔 피로 */
  hard: {
    /** 오늘 체크인에서 '통증'이라고 한 관절(prescription.ts painPartsToday) */
    painParts: CheckinPartKey[];
    /** 최근 통증이 있는데 오늘 체크인이 없어 지금 아픈지 모른다(painStateUnknown) */
    painUnknown: boolean;
    /** 메모에 통증으로 보이는 말이 있는데 오늘 체크인이 없다(plan.needsPainCheck) */
    needsPainCheck: boolean;
    /** 투구 계획이 멈췄는가 — 통증 · 재활(plan.halted) */
    pitchHalted: boolean;
    /** 진행 중인 재활(facts.condition.rehab), 없으면 null */
    rehab: {
      /** 재활 중인 관절 — 어깨 · 팔꿈치(lib/armcare/rehab-regions.ts 의 RehabJoint) */
      joint: Extract<CheckinPartKey, 'shoulder' | 'elbow'>;
      stage: number;
      label: string;
      throwing: 'light' | 'none';
    } | null;
    /** 재활 1~3단계라 무거운 운동을 빼는 관절(rehabEasingParts — 오늘 통증인 관절은 painParts 가 본다) */
    rehabParts: CheckinPartKey[];
    /** 오늘 투구 계획이 공을 쉬는 날인가(plan.today.throwing 이 false — 이미 던진 날은 아니다) */
    restDay: boolean;
    /** 아직 여파가 남은 등판 — 전력 등판까지 남은 날(plan.ts pendingOuting, 나이별 표). 없으면 null */
    restLeft: number | null;
    /** 오늘 체크인이 없다 */
    needsCheckin: boolean;
    /** 팔 피로가 HIGH_ARM_FATIGUE('많이') 이상 — 암케어가 회복으로 가는 문턱과 같다 */
    armFatigueHigh: boolean;
  };
  /**
   * 등판 — 지난 것과 다음 것. lib/engine/outing.ts 의 outingOf 그대로(칸 설명은 그 파일의 Outing) + 오늘 던진 기록이 있는가.
   * 2판 P4 커밋 B 전에는 source(지난 등판 출처 'log' · 'checkin' · 'none') · nextFrom(다음 등판 출처 'today' · 'yesterday' · null)이었다.
   * 지금은 lastSource('checkin' → 'checkin-yesterday') · nextSource('today' → 'checkin', 'yesterday' → 'checkin-yesterday', null → 'none').
   */
  outing: Outing & {
    /** 오늘 이미 던진 기록이 있는가(plan.threwToday) */
    threwToday: boolean;
  };
  /** 팔 — 피로 · 통증 자리 */
  arm: {
    /** 오늘 팔 피로(1~5), 안 적었으면 null */
    fatigue: number | null;
    /** 그 말('많이' …), 범위 밖이면 null */
    fatigueWord: string | null;
    fatigueHigh: boolean;
    /** 오늘 '통증'인 팔 관절(어깨 · 팔꿈치 — 암케어 통증 루틴이 보는 관절) */
    painJoints: CheckinPartKey[];
    /** 그 관절이 있을 때만 자리 · 정도(lib/armcare/today.ts 의 armPain 과 같은 값), 없으면 null */
    pain: { spots: ArmcareAreaKey[]; level: number | null } | null;
  };
  /** 몸 — 컨디션 · 뻐근 · 근육통 · 수면 */
  body: {
    checkedIn: boolean;
    /** 오늘 컨디션(1~10), 체크인이 없으면 null */
    condition: number | null;
    /** LOW_CONDITION_THRESHOLD 이하 */
    conditionLow: boolean;
    /** 오늘 '뻐근'이라고 한 부위 */
    stiffParts: CheckinPartKey[];
    /** 최근 7일에 아팠는데 오늘은 통증이라고 하지 않은 부위(painEasingParts) */
    recentPainParts: CheckinPartKey[];
    /** 전신 근육통(1~5), 안 적었으면 null */
    soreness: number | null;
    /** '많이'(HIGH_SORENESS) — '심함'은 soreSevere */
    soreMany: boolean;
    /** '심함'(SEVERE_SORENESS) — 매일 일정 · 암케어가 회복으로 가는 문턱과 같다 */
    soreSevere: boolean;
    /** 잔 느낌 · 잔 시간 */
    sleep: string | null;
    sleepHours: number | null;
    /** 짧은 밤(isShortSleep) */
    sleepShort: boolean;
    /** 오늘 고른 운동 종류, 안 골랐으면 null */
    preferredWorkout: string | null;
  };
  /** 부하 — 세게 던진 날 · 운동 힘듦 급증 · 투구 부하 구간 */
  load: {
    /** 오늘 · 어제 세게 던진 날(recentHardOuting — theme.ts hardOuting 과 같은 값) */
    hardOuting: HardOuting | null;
    hardOutingRecent: boolean;
    /** 최근 운동 힘듦 급증(facts.condition.trainingEffort.spikeFlag — 2판 P2). 칸이 없으면 false */
    effortSpike: boolean;
    /** 투구 부하 지수 구간 · 값(facts.load) */
    pitchZone: ReportFacts['load']['zone'];
    pitchRatio: number | null;
  };
  /** 하기로 한 것 — 부르는 쪽이 extras 로 넘겼을 때만, 아니면 null */
  commitments: {
    program: ProgramCommitment | null;
    mechanics: MechanicsCommitment | null;
  };
  /** 체중 흐름 — extras 로 넘겼을 때만, 아니면 null(2판 P6) */
  nutritionTrend: NutritionTrend | null;
  /** 걸린 신호마다 한 줄(해요체 · 줄표 없음). 아무것도 안 걸렸으면 빈 목록 */
  why: string[];
};

/* ─────────────────────────── 만들기 ─────────────────────────── */

/** 날짜 키 둘의 차이(날) — from 이 앞이면 양수 */
function daysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

const labelsOf = (parts: readonly CheckinPartKey[]) =>
  parts.map(checkinPartLabel).join('·');

/** '오늘 등판이에요.' · '1~2일 뒤 등판이에요.' · '3일 이상 뒤 등판이에요.' */
function windowText(w: OutingWindow): string {
  if (w.max === 0) return '오늘 등판이에요.';
  if (w.min === 1 && w.max === 1) return '내일 등판이에요.';
  if (w.max == null) return `${w.min}일 이상 뒤 등판이에요.`;
  return w.min === w.max
    ? `${w.min}일 뒤 등판이에요.`
    : `${w.min}~${w.max}일 뒤 등판이에요.`;
}

/** 0.1kg 단위 — '0.3' */
const kgText = (kg: number) => String(Math.round(Math.abs(kg) * 10) / 10);

/**
 * 오늘 상태 한 장을 만든다. 같은 facts · plan · extras 면 늘 같은 값이다(날짜 함수 · 난수 없음). facts · plan 을 바꾸지 않고,
 * 돌려주는 목록은 모두 새 배열이다(읽는 쪽이 고쳐도 facts 가 안 바뀐다).
 */
export function buildDayState({
  facts,
  plan,
  extras = {},
}: {
  facts: ReportFacts;
  plan: PitchPlan;
  extras?: DayStateExtras;
}): DayState {
  const today = facts.condition.today;
  const patterns = facts.patterns;

  /* hard */
  const painParts = painPartsToday(facts);
  const painUnknown = painStateUnknown(facts);
  const rehabFacts = facts.condition.rehab ?? null;
  const rehab = rehabFacts
    ? {
        joint: rehabFacts.joint,
        stage: rehabFacts.stage,
        label: rehabFacts.label,
        throwing: rehabFacts.throwing,
      }
    : null;
  const restLeft = pendingOuting(patterns, 0, facts.profile.age)?.left ?? null;
  const restDay = plan.today?.throwing === false;

  /* arm — 팔 피로는 오늘 체크인 칸(facts, 2판 P4). 체크인이 없으면 null */
  const fatigue = today?.armFatigue ?? null;
  const fatigueHigh = fatigue != null && fatigue >= HIGH_ARM_FATIGUE;
  const painJoints = painParts.filter((p) => p === 'shoulder' || p === 'elbow');
  const saved = extras.armPain ?? null;
  const armPain =
    painJoints.length > 0
      ? {
          spots: armPainSpotsFor(today, saved?.spots ?? []),
          level: saved?.level ?? null,
        }
      : null;

  /* body */
  const condition = today?.condition ?? null;
  const soreness = today?.soreness ?? null;
  const soreKnown = sorenessWord(soreness) != null;
  const soreSevere = soreness != null && soreKnown && soreness >= SEVERE_SORENESS;
  const soreMany =
    soreness != null && soreKnown && soreness >= HIGH_SORENESS && !soreSevere;
  const sleepShort = today != null && isShortSleep(today);

  /*
   * outing — 다음 등판 · 지난 등판은 lib/engine/outing.ts 한 곳(theme.ts plannedOuting 과 같은 함수, 2판 P4 커밋 B). 오늘 할 일(role)도
   * 그 안에서 투구 계획(DayPlan.outing)과 같은 함수(lib/checkin.ts todayOutingRole)로 읽는다.
   */
  const outing = outingOf(facts);

  /* load */
  const hardOuting = recentHardOuting(facts);

  /* commitments */
  const programIn = extras.program ?? null;
  const program: ProgramCommitment | null = programIn
    ? {
        ...programIn,
        done: programIn.totalDays != null && programIn.nextDay > programIn.totalDays,
        daysSinceLastDone: programIn.lastDoneDate
          ? daysBetween(programIn.lastDoneDate, facts.asOf)
          : null,
      }
    : null;
  const mechanics = extras.mechanics ? { ...extras.mechanics } : null;
  const nutritionTrend = extras.nutritionTrend ? { ...extras.nutritionTrend } : null;

  const state: Omit<DayState, 'why'> = {
    asOf: facts.asOf,
    hard: {
      painParts,
      painUnknown,
      needsPainCheck: plan.needsPainCheck,
      pitchHalted: plan.halted,
      rehab,
      rehabParts: rehabEasingParts(facts),
      restDay,
      restLeft,
      needsCheckin: today == null,
      armFatigueHigh: fatigueHigh,
    },
    outing: { threwToday: plan.threwToday, ...outing },
    arm: {
      fatigue,
      fatigueWord: armFatigueWord(fatigue),
      fatigueHigh,
      painJoints,
      pain: armPain,
    },
    body: {
      checkedIn: today != null,
      condition,
      conditionLow: condition != null && condition <= LOW_CONDITION_THRESHOLD,
      stiffParts: today
        ? CHECKIN_PARTS.filter((p) => today[p.key] === '뻐근').map((p) => p.key)
        : [],
      recentPainParts: painEasingParts(facts),
      soreness,
      soreMany,
      soreSevere,
      sleep: today?.sleep ?? null,
      sleepHours: today?.sleepHours ?? null,
      sleepShort,
      preferredWorkout: today?.preferredWorkout ?? null,
    },
    load: {
      hardOuting: hardOuting ? { ...hardOuting } : null,
      hardOutingRecent: hardOuting != null,
      effortSpike: facts.condition.trainingEffort?.spikeFlag ?? false,
      pitchZone: facts.load.zone,
      pitchRatio: facts.load.ratio,
    },
    commitments: { program, mechanics },
    nutritionTrend,
  };
  return { ...state, why: whyLines(state) };
}

/**
 * 걸린 신호마다 한 줄 — 넘을 수 없는 것부터(통증 · 재활 · 체크인), 등판, 팔 · 몸, 부하, 하기로 한 것 차례.
 *
 * 독자의 이유 글(theme.ts 의 reason · plan.ts 의 basis)을 대신하지 않는다 — 그 글은 결론까지 말하고, 이 줄은 '무엇을 봤는지'만
 * 말한다(화면이 '오늘 본 것'으로 늘어놓을 수 있게). 해요체 · 줄표 없음 · 문장 속 굵게 없음.
 */
function whyLines(s: Omit<DayState, 'why'>): string[] {
  const out: string[] = [];
  const { hard, outing, arm, body, load, commitments, nutritionTrend } = s;

  if (hard.painParts.length > 0)
    out.push(`오늘 ${labelsOf(hard.painParts)} 통증이 있어요.`);
  if (hard.painUnknown) out.push('최근 통증 기록이 있는데 오늘 체크인이 없어요.');
  if (hard.needsPainCheck) out.push('메모에 통증으로 보이는 말이 있어요.');
  if (hard.rehab) out.push(`${hard.rehab.label} 재활 ${hard.rehab.stage}단계예요.`);
  if (hard.needsCheckin && !hard.painUnknown)
    out.push('오늘 체크인을 아직 안 남겼어요.');
  if (hard.restDay && !hard.pitchHalted && !hard.needsPainCheck) {
    out.push('오늘은 공을 쉬는 날이에요.');
  } else if (!hard.pitchHalted && hard.restLeft != null) {
    out.push(`전력 등판까지 ${hard.restLeft}일 남았어요.`);
  }

  if (load.hardOuting) {
    const when = load.hardOuting.daysAgo === 0 ? '오늘' : '어제';
    out.push(
      isNearMaxOuting(load.hardOuting)
        ? `${when} 거의 전력으로 ${load.hardOuting.pitches}구를 던졌어요.`
        : `${when} ${load.hardOuting.pitches}구를 던져 팔 부담이 컸어요.`
    );
  }
  /* 오늘 기록이 있어도 어제 줄이 없으면 말한다 — 지난 등판(lastSource)이 아니라 어제 기록 유무로(outing.ts claimedYesterdayNoLog) */
  if (outing.claimedYesterdayNoLog)
    out.push('어제 등판했다고 적었는데 투구 기록은 없어요.');
  /*
   * 다음 등판 — 어디서 알았는지를 앞에 붙인다(어제 답 · 달력 · 같은 요일 짐작, 2판 P4 커밋 G). 짐작은 '오늘 불펜'과 같이 올 수 있어
   * (불펜 날에도 내일 이후는 짐작한다 — outing.ts) 그때는 두 줄 다 말한다. 답으로 아는 범위는 불펜과 같이 오지 않는다.
   */
  if (outing.daysUntilNext) {
    const text = windowText(outing.daysUntilNext);
    out.push(
      outing.nextSource === 'checkin-yesterday'
        ? `어제 적은 답으로 보면 ${text}`
        : outing.nextSource === 'calendar'
          ? `달력으로 보면 ${text}`
          : outing.nextSource === 'estimate'
            ? `같은 요일 경기로 짐작하면 ${text}`
            : text
    );
  }
  if (outing.role === 'bullpen' && (!outing.daysUntilNext || outing.soft)) {
    out.push('오늘 불펜 날이에요.');
  }

  if (arm.fatigueHigh) out.push(`팔 피로가 '${arm.fatigueWord ?? arm.fatigue}'이에요.`);
  if (body.conditionLow) out.push(`오늘 컨디션이 ${body.condition}/10이에요.`);
  if (body.soreSevere || body.soreMany) {
    out.push(`전신 근육통이 '${sorenessWord(body.soreness)}'이에요.`);
  }
  if (body.sleepShort) {
    out.push(
      body.sleepHours != null && body.sleepHours < SHORT_SLEEP_HOURS
        ? `어젯밤 ${formatSleepHours(body.sleepHours)}만 잤어요.`
        : '잠이 부족했다고 적었어요.'
    );
  }

  if (load.pitchZone === 'danger') out.push('투구 부하가 위험 구간이에요.');
  else if (load.pitchZone === 'caution') out.push('투구 부하가 주의 구간이에요.');
  if (load.effortSpike) out.push('최근 운동 힘듦이 평소보다 높아요.');

  if (commitments.program) {
    out.push(
      commitments.program.done
        ? '근력 프로그램을 다 마쳤어요.'
        : `근력 프로그램 ${commitments.program.nextDay}일차를 할 차례예요.`
    );
  }
  if (commitments.mechanics) {
    out.push(
      commitments.mechanics.finishedToday
        ? '오늘 메커니즘 세션을 마쳤어요.'
        : '오늘 메커니즘 세션이 남아 있어요.'
    );
  }
  if (nutritionTrend?.kind === 'flat') {
    out.push('체중이 거의 그대로예요.');
  } else if (nutritionTrend?.kgPerWeek != null) {
    /* 늘고 줄고는 kgPerWeek 가 있을 때만 — 'unknown' 은 줄이 없다 */
    const kg = kgText(nutritionTrend.kgPerWeek);
    if (nutritionTrend.kind === 'gain')
      out.push(`체중이 일주일에 ${kg}kg씩 늘고 있어요.`);
    if (nutritionTrend.kind === 'lose')
      out.push(`체중이 일주일에 ${kg}kg씩 줄고 있어요.`);
  }
  return out;
}
