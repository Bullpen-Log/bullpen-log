import { isNearMaxOuting, type ReportFacts } from '@/lib/report/facts';
import { hardOuting } from '@/lib/report/theme';
import { outingAnswersOf, outingGuessInputsOf } from '@/lib/engine/outing';
import {
  CHECKIN_PARTS,
  armFatigueWord,
  isShortSleep,
  sorenessWord,
  type CheckinPartKey,
} from '@/lib/checkin';
import { ACWR_ZONE_ORDER, ACWR_ZONES, type AcwrZone } from '@/lib/pitch-stats';
import { josa, withJosa } from '@/lib/korean';

/**
 * 일정 지문 — 오늘 일정을 만들 때 본 '판단 입력'의 요약(트레이닝 추천 2판 P2, 2026-10-12).
 *
 * 왜 두는가. 저장된 일정(DailyTrainingSetup.plan)에는 근거 글(basis · notes · theme.reason)만 남고, 만들 때 본
 * 상태 값(컨디션 · 아픈 부위 · 등판 답 · 마지막 투구 · 재활)은 어디에도 구조로 남지 않았다. 그래서 아침에 만든 뒤
 * 체크인을 고쳐 컨디션 8 → 3 이 돼도, '오늘 등판'이라고 적거나 오후에 60구를 던져도 화면은 '하체 스트렝스 데이 ·
 * 부하가 적정 범위예요'를 그대로 보였다(안전 재검사는 무거운 운동만 뺀다). 만들 때 지문을 같이 저장해 두고, 읽을 때
 * 지금 facts 로 다시 찍어 다르면 '상태가 바뀌었어요'(화면은 P6 몫 — 여기서는 글만 만든다).
 *
 * 무엇을 넣는가. decideTheme · selectCandidates · buildPitchPlan 이 실제로 읽는 facts 칸과 1:1 — 그보다 많으면 알림이
 * 날마다 뜨고(운동 부하 · ratio), 적으면 '다시 만들면 달라지는데 알림이 없다'. 규칙 하나: theme.ts · prescription.ts ·
 * plan.ts · auto-setup.ts 가 facts 의 새 칸을 읽게 되면 같은 커밋에서 여기에 칸을 더한다(자체 시험이 칸 목록을 고정해
 * 둔다 — FINGERPRINT_KEYS). 넣지 않는 것과 까닭:
 *   preferredParts(하고 싶은 부위)   — 목록 순서만 바꾼다(theme.ts 의 pickForTheme). 안전 · 테마에 안 닿는다.
 *   profile(나이 · 경력)             — 설정 창이 '오늘 일정은 그대로'라고 약속한다(today-data.ts 의 safeIds 주석).
 *   load.ratio · recentOutings · volume — 판단은 zone · hardOutings · lastThrow 만 읽는다.
 *   자동 맞춤의 운동 부하 · poorSleepDays — facts 밖이거나 자동 맞춤만 읽고, 오늘 운동을 마치면 늘 바뀐다(auto.rules 글에 남는다).
 *   recentIds · sessionsAgo · lastLower/UpperKey · 씨앗 — 목록 순서 · 차례이지 '상태'가 아니다.
 *   '마지막 투구의 강도 · 종류' — facts 에 날 단위 칸이 없다. 전력 환산(lastOutingAdjusted — 강도 · 종류가 들어간 값)과
 *     hardOuting(그날 투구수 × 체감 강도 ≥ 2,700 — load 선택 칸, 2판 D2), lastThrow.load(마지막으로 던진 날의 투구수 × 체감
 *     강도 — 날 종류의 R2 가 어제 것을 읽어 2판 P4 커밋 E 에서 더함)로 덮는다. 날 종류의 '짧게'가 읽는 실전 강도 공 수
 *     (nearMaxPitches)는 따로 안 담는다 — 종류 · 강도가 바뀌면 전력 환산이 같이 바뀐다.
 *
 * 순수 함수만 둔다(DB · 날짜 함수 없음 — 같은 facts 면 같은 지문, JSON.stringify 까지 글자가 같다). 안전 재검사
 * (today-data.ts 의 safeIds · droppedForSafety)와는 독립이다 — 그쪽은 '후보'를 지금 기준으로 다시 걸러 운동을 빼는 것,
 * 지문은 '판단 입력'이 바뀌었는지 알리는 것이라 아무것도 빼지 않는다. 둘을 어떻게 한 줄로 합칠지는 P6 화면이 정한다
 * (onlyPainPartChanges 가 그 가름을 돕는다).
 */

export type PlanFingerprint = {
  /** 모양이 바뀌면 올린다. 옛 지문은 못 읽는 것으로 보고 '견줄 것 없음'. */
  v: 1;
  /** 만든 날(facts.asOf). 다른 날의 지문은 견주지 않는다. */
  asOf: string;
  /** 오늘 체크인 — 없는 날은 null */
  checkin: null | {
    condition: number;
    /** 뻐근 · 통증인 부위만 'shoulder:통증' 꼴, CHECKIN_PARTS 순서 */
    parts: string[];
    /** 전신 근육통 1~5. 안 적었거나 범위 밖이면 null */
    soreness: number | null;
    /** 짧은 밤인가(lib/checkin.ts 의 isShortSleep — 느낌 '부족' 또는 6시간 미만) */
    sleepShort: boolean;
    /** 오늘 고른 운동 종류(파워 · 웨이트 · 회복). 안 골랐으면 null */
    preferredWorkout: string | null;
    /** 던지는 일정 답(lib/checkin.ts 의 THROW_PLANS — 답이 늘어도 글자 그대로) */
    throwPlan: string | null;
    /**
     * 팔 피로 1~5, 안 적었거나 범위 밖이면 null — 안전 거르기(prescription.ts 5-2)가 '심함'을 읽는다(2판 P4 커밋 C). 선택 칸이다:
     * 칸이 생기기 전에 저장된 지문과, 칸이 없는 facts(저장해 둔 옛 facts · 자가 시험의 손 체크인)로 찍은 지문에는 없다. 견줄 때는
     * 둘 다 있을 때만 본다(hardOuting.load 와 같은 약속 — v 는 그대로, 배포 날 옛 지문에 '바뀌었어요'가 뜨지 않게). 안쪽 칸이라
     * 칸 목록(FINGERPRINT_KEYS)은 그대로다.
     */
    armFatigue?: number | null;
  };
  /** 어제 체크인의 던지는 일정 답 — 등판을 읽는 함수(lib/engine/outing.ts outingOf)가 오늘 답이 없을 때 읽는다 */
  throwPlanYesterday: string | null;
  /** 오늘을 뺀 최근 7일에 '통증'이라고 한 부위(CHECKIN_PARTS 순서) */
  painRecentParts: CheckinPartKey[];
  /** 메모에서 걸린 통증 표현(가나다순) — plan.needsPainCheck · recovering 이 읽는다 */
  painWords: string[];
  /** 진행 중인 재활 — 단계 · 던지기. rehabParts 는 단계로 따라온다 */
  rehab: null | { area: string; stage: number; throwing: 'light' | 'none' };
  /** 투구 부하 구간(ratio 는 안 넣는다 — 판단은 구간만 읽는다) */
  zone: AcwrZone | null;
  /**
   * 마지막으로 던진 날 — 날짜 · 구수 · 전력 환산 구수(정수). load 는 그날 투구수 × 체감 강도(%)(facts.ts HardOuting.load) — 날 종류
   * (lib/engine/microcycle.ts)의 R2 가 어제 load 를 읽어(2판 P4 커밋 E) 같은 커밋에서 더한 선택 칸이다. 칸이 생기기 전의 지문 · load 없는
   * facts(옛 저장 facts)로 찍은 지문에는 없고, 견줄 때는 둘 다 있을 때만 본다(hardOuting.load 와 같은 약속).
   */
  lastThrow: null | { date: string; pitches: number; adjusted: number; load?: number };
  /**
   * 세게 던진 날(theme.ts 의 hardOuting — 어제 · 오늘). pitches 는 그날 던진 공의 합, load 는 그날 투구수 × 체감 강도(%)
   * (facts.ts 의 HardOuting). load 는 선택 칸이다 — 2판 D2(2026-10-12) 전에 저장된 지문에는 없고(그때 pitches 는 거의 전력
   * 투구수), load 없는 facts(옛 저장 facts)로 찍은 지문에도 없다. 칸 목록(FINGERPRINT_KEYS)은 그대로다(안쪽 칸이라).
   */
  hardOuting: null | { daysAgo: number; pitches: number; load?: number };
  /**
   * 최근 운동 힘듦 급증(facts.condition.trainingEffort.spikeFlag — 2판 P2) — 날 종류의 R2(어제 중간 부하 + 힘듦 급증 → 회복)가 읽어
   * 2판 P4 커밋 E 에서 더한 바깥 선택 칸. trainingEffort 칸이 있는 facts(앱의 gather 는 늘 넘긴다)에서만 나오고, 칸이 생기기 전의 지문 ·
   * 그 칸이 없는 facts(자체 시험 · 기준선의 옛 입력)로 찍은 지문에는 없다. 그래서 늘 있는 칸 목록(FINGERPRINT_KEYS)이 아니라
   * FINGERPRINT_OPTIONAL_KEYS 에 둔다. 견줄 때는 둘 다 있을 때만 본다(v 는 1 그대로).
   */
  effortSpike?: boolean;
  /**
   * 다음 등판 짐작의 재료(lib/engine/outing.ts outingGuessInputsOf — 2판 P4 커밋 G): 달력의 다음 등판까지 며칠 · 같은 요일 짐작이 서는 날(오늘부터
   * 0~6일 뒤). 등판을 읽는 함수가 체크인 답이 없을 때 이 둘로 다음 등판을 짐작해, 날 종류(보조 날)와 안전 거르기(무거운 하체)가 읽는다.
   * 짐작한 결과가 아니라 재료를 담는다 — 결과를 담으면 체크인 답을 적는 순간 '달력의 경기가 빠졌어요'처럼 틀린 줄이 같이 뜬다(답이
   * 짐작을 덮었을 뿐 달력은 그대로다). 달력 일정의 이름은 안 담는다(판단이 안 읽는다). 달력을 넘긴 facts(앱의 gather 는 늘 넘긴다)에서만
   * 나오는 바깥 선택 칸이라 FINGERPRINT_OPTIONAL_KEYS 에 둔다. 견줄 때는 둘 다 있을 때만 본다(v 는 1 그대로).
   */
  outingGuess?: { calendar: number | null; estimate: number[] };
  /**
   * 어제 투구 기록 줄이 있나 — 쉰 날 줄까지(facts.patterns.loggedYesterday). 등판을 읽는 함수(lib/engine/outing.ts)가 어제 '오늘 등판' 답이
   * 기록으로 풀렸는지 이것으로 가려(2판 P4 검토 — 휴식 줄도 '안 던졌다'는 답) 같은 커밋에서 더한 바깥 선택 칸. 칸이 있는 facts(지금의 buildFacts 는
   * 늘 만든다)에서만 나오고, 칸이 생기기 전의 지문 · 옛 저장 facts 로 찍은 지문에는 없다. 견줄 때는 둘 다 있을 때만 본다(v 는 1 그대로).
   */
  loggedYesterday?: boolean;
};

/** 지문의 칸 목록(순서까지) — 칸을 더하거나 빼면 자체 시험이 이 목록과 견줘 알린다 */
export const FINGERPRINT_KEYS = [
  'v',
  'asOf',
  'checkin',
  'throwPlanYesterday',
  'painRecentParts',
  'painWords',
  'rehab',
  'zone',
  'lastThrow',
  'hardOuting',
] as const satisfies readonly (keyof PlanFingerprint)[];

/**
 * 칸이 있는 facts 에서만 붙는 바깥 칸(순서까지) — 늘 있는 칸(FINGERPRINT_KEYS) 뒤에 이 차례로 붙는다(2판 P4 커밋 E). 칸을 더하면
 * 자체 시험이 견줘 알린다.
 */
export const FINGERPRINT_OPTIONAL_KEYS = [
  'effortSpike',
  'outingGuess',
  'loggedYesterday',
] as const satisfies readonly (keyof PlanFingerprint)[];

/** 판단이 읽는 부위 값 — '정상' · 옛 기록의 '괜찮음' · 모르는 값은 안 넣는다(hasPain · 뻐근 규칙이 이 둘만 본다) */
const NOTABLE_FEELINGS: readonly string[] = ['뻐근', '통증'];

const PART_ORDER = new Map<string, number>(CHECKIN_PARTS.map((p, i) => [p.key, i]));

/** CHECKIN_PARTS 순서로 — facts 가 이미 그 순서로 주지만 지문은 순서까지 약속한다 */
function sortParts(parts: readonly string[]): CheckinPartKey[] {
  return [...parts]
    .filter((p): p is CheckinPartKey => PART_ORDER.has(p))
    .sort((a, b) => (PART_ORDER.get(a) ?? 0) - (PART_ORDER.get(b) ?? 0));
}

/** 지금 facts 의 지문. 같은 facts 면 글자까지 같은 JSON 이 나온다. */
export function fingerprintOf(facts: ReportFacts): PlanFingerprint {
  const today = facts.condition.today;
  const rehab = facts.condition.rehab ?? null;
  const outing = hardOuting(facts);
  /*
   * 등판 답 둘은 등판을 읽는 함수(lib/engine/outing.ts outingOf)가 읽는 바로 그 칸을 같은 함수(outingAnswersOf)로 담는다 — 판단이
   * 읽는 칸과 지문 칸이 어긋나지 않게(2판 P4 커밋 B). buildFacts 가 만든 facts 에서는 예전에 담던 오늘 체크인의 throwPlan 과
   * 글자까지 같다(throwPlanToday 가 그 값이다). 달력 · 같은 요일 짐작(커밋 G)처럼 outingOf 가 새 칸을 읽게 되면 그 칸도 여기 담는다.
   */
  const answers = outingAnswersOf(facts);
  const { lastThrowDate, lastOutingPitches, lastOutingAdjusted, restDays } =
    facts.patterns;
  /* 마지막으로 던진 날의 load — facts 의 hardOutings 에 그날이 있고 load 가 실렸을 때만(옛 facts 에는 없다) */
  const lastLoad = lastThrowDate
    ? (facts.patterns.hardOutings ?? []).find((o) => o.daysAgo === restDays)?.load
    : undefined;
  const effort = facts.condition.trainingEffort;
  /* 짐작의 재료 — 등판을 읽는 함수가 쓰는 같은 함수로(판단이 읽는 칸 = 지문 칸). 달력을 안 넘긴 facts 는 null 이라 칸이 없다 */
  const guess = outingGuessInputsOf(facts);
  return {
    v: 1,
    asOf: facts.asOf,
    checkin: today
      ? {
          condition: today.condition,
          parts: CHECKIN_PARTS.filter((p) =>
            NOTABLE_FEELINGS.includes(today[p.key])
          ).map((p) => `${p.key}:${today[p.key]}`),
          soreness:
            sorenessWord(today.soreness) != null ? (today.soreness ?? null) : null,
          sleepShort: isShortSleep(today),
          preferredWorkout: today.preferredWorkout ?? null,
          throwPlan: answers.today,
          /* 칸이 있는 facts 에서만 — 없는 facts 의 지문은 예전과 글자까지 같다. 범위 밖은 안 적은 것(null)으로 */
          ...(today.armFatigue !== undefined
            ? {
                armFatigue:
                  armFatigueWord(today.armFatigue) != null
                    ? (today.armFatigue ?? null)
                    : null,
              }
            : {}),
        }
      : null,
    throwPlanYesterday: answers.yesterday,
    painRecentParts: sortParts(facts.condition.painRecentParts ?? []),
    painWords: [...facts.condition.painWordsInMemo].sort(),
    rehab: rehab
      ? { area: rehab.area, stage: rehab.stage, throwing: rehab.throwing }
      : null,
    zone: facts.load.zone,
    lastThrow:
      lastThrowDate && lastOutingPitches != null
        ? {
            date: lastThrowDate,
            pitches: lastOutingPitches,
            adjusted: Math.round(lastOutingAdjusted ?? lastOutingPitches),
            /* load 는 있을 때만 — 없는 facts 의 지문은 예전과 글자까지 같다 */
            ...(lastLoad != null ? { load: lastLoad } : {}),
          }
        : null,
    /* load 는 있을 때만 — 없는 facts 의 지문은 예전과 글자까지 같다 */
    hardOuting: outing
      ? {
          daysAgo: outing.daysAgo,
          pitches: outing.pitches,
          ...(outing.load != null ? { load: outing.load } : {}),
        }
      : null,
    /* 칸이 있는 facts 에서만 — 없는 facts 의 지문은 예전과 글자까지 같다(FINGERPRINT_OPTIONAL_KEYS) */
    ...(effort ? { effortSpike: effort.spikeFlag } : {}),
    ...(guess
      ? { outingGuess: { calendar: guess.calendar, estimate: [...guess.estimate] } }
      : {}),
    ...(typeof facts.patterns.loggedYesterday === 'boolean'
      ? { loggedYesterday: facts.patterns.loggedYesterday }
      : {}),
  };
}

/* ─────────────────────────── 저장된 지문 읽기(모양 검사) ─────────────────────────── */

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStrOrNull = (v: unknown): v is string | null => v === null || isStr(v);
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

/**
 * 저장된 일정의 fingerprint 칸을 읽는다. 없거나(옛 일정) 모양이 다르면 null — '견줄 것 없음'.
 *
 * 안쪽 칸까지 하나하나 본다. plan 은 Json 이라 손으로 고친 자료 · 옛 시험 자료가 올 수 있고, 모양이 깨진 값으로 글을
 * 만들다 화면을 그리는 자리(today-data.ts)에서 던지면 안 된다. 돌려주는 것은 새 객체다(모르는 칸은 버린다).
 */
export function readPlanFingerprint(value: unknown): PlanFingerprint | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.v !== 1 || !isStr(v.asOf)) return null;

  let checkin: PlanFingerprint['checkin'] = null;
  if (v.checkin !== null) {
    if (!v.checkin || typeof v.checkin !== 'object') return null;
    const c = v.checkin as Record<string, unknown>;
    if (
      !isNum(c.condition) ||
      !isStrArray(c.parts) ||
      !(c.soreness === null || isNum(c.soreness)) ||
      typeof c.sleepShort !== 'boolean' ||
      !isStrOrNull(c.preferredWorkout) ||
      !isStrOrNull(c.throwPlan) ||
      /* 팔 피로는 선택 칸 — 없으면(옛 지문) 통과, 있는데 숫자 · null 이 아니면 깨진 지문 */
      !(c.armFatigue === undefined || c.armFatigue === null || isNum(c.armFatigue))
    ) {
      return null;
    }
    checkin = {
      condition: c.condition,
      parts: c.parts,
      soreness: c.soreness,
      sleepShort: c.sleepShort,
      preferredWorkout: c.preferredWorkout,
      throwPlan: c.throwPlan,
      ...(c.armFatigue !== undefined ? { armFatigue: c.armFatigue } : {}),
    };
  }

  if (!isStrOrNull(v.throwPlanYesterday)) return null;
  if (!isStrArray(v.painRecentParts) || !isStrArray(v.painWords)) return null;

  let rehab: PlanFingerprint['rehab'] = null;
  if (v.rehab !== null) {
    if (!v.rehab || typeof v.rehab !== 'object') return null;
    const r = v.rehab as Record<string, unknown>;
    if (
      !isStr(r.area) ||
      !isNum(r.stage) ||
      (r.throwing !== 'light' && r.throwing !== 'none')
    ) {
      return null;
    }
    rehab = { area: r.area, stage: r.stage, throwing: r.throwing };
  }

  if (!(
    v.zone === null ||
    (isStr(v.zone) && (ACWR_ZONE_ORDER as string[]).includes(v.zone))
  )) {
    return null;
  }

  let lastThrow: PlanFingerprint['lastThrow'] = null;
  if (v.lastThrow !== null) {
    if (!v.lastThrow || typeof v.lastThrow !== 'object') return null;
    const t = v.lastThrow as Record<string, unknown>;
    if (!isStr(t.date) || !isNum(t.pitches) || !isNum(t.adjusted)) return null;
    /* load 는 선택 칸 — 없으면(옛 지문) 통과, 있는데 숫자가 아니면 깨진 지문 */
    if (t.load !== undefined && !isNum(t.load)) return null;
    lastThrow = {
      date: t.date,
      pitches: t.pitches,
      adjusted: t.adjusted,
      ...(isNum(t.load) ? { load: t.load } : {}),
    };
  }

  let outing: PlanFingerprint['hardOuting'] = null;
  if (v.hardOuting !== null) {
    if (!v.hardOuting || typeof v.hardOuting !== 'object') return null;
    const o = v.hardOuting as Record<string, unknown>;
    if (!isNum(o.daysAgo) || !isNum(o.pitches)) return null;
    /* load 는 선택 칸 — 없으면(옛 지문) 통과, 있는데 숫자가 아니면 깨진 지문 */
    if (o.load !== undefined && !isNum(o.load)) return null;
    outing = {
      daysAgo: o.daysAgo,
      pitches: o.pitches,
      ...(isNum(o.load) ? { load: o.load } : {}),
    };
  }

  /* 힘듦 급증은 선택 칸 — 없으면(옛 지문 · 칸 없는 facts) 통과, 있는데 참 · 거짓이 아니면 깨진 지문 */
  if (v.effortSpike !== undefined && typeof v.effortSpike !== 'boolean') return null;

  /* 등판 짐작의 재료도 선택 칸 — 없으면 통과, 있는데 모양이 틀리면(달력이 숫자 · null 아님, 같은 요일이 숫자 목록 아님) 깨진 지문 */
  let outingGuess: PlanFingerprint['outingGuess'];
  if (v.outingGuess !== undefined) {
    if (!v.outingGuess || typeof v.outingGuess !== 'object') return null;
    const g = v.outingGuess as Record<string, unknown>;
    if (
      !(g.calendar === null || isNum(g.calendar)) ||
      !Array.isArray(g.estimate) ||
      !g.estimate.every(isNum)
    ) {
      return null;
    }
    outingGuess = { calendar: g.calendar, estimate: [...g.estimate] };
  }

  /* 어제 기록 유무도 선택 칸 — 없으면(옛 지문) 통과, 있는데 참 · 거짓이 아니면 깨진 지문 */
  if (v.loggedYesterday !== undefined && typeof v.loggedYesterday !== 'boolean')
    return null;

  return {
    v: 1,
    asOf: v.asOf,
    checkin,
    throwPlanYesterday: v.throwPlanYesterday,
    painRecentParts: sortParts(v.painRecentParts),
    painWords: v.painWords,
    rehab,
    zone: v.zone as AcwrZone | null,
    lastThrow,
    hardOuting: outing,
    ...(typeof v.effortSpike === 'boolean' ? { effortSpike: v.effortSpike } : {}),
    ...(outingGuess ? { outingGuess } : {}),
    ...(typeof v.loggedYesterday === 'boolean'
      ? { loggedYesterday: v.loggedYesterday }
      : {}),
  };
}

/* ─────────────────────────── 견주기 — 바뀐 항목을 사용자 말로 ─────────────────────────── */

export type FingerprintKey =
  | 'checkin'
  | 'condition'
  | 'parts'
  | 'soreness'
  | 'armFatigue'
  | 'sleep'
  | 'preferredWorkout'
  | 'throwPlan'
  | 'throwPlanYesterday'
  | 'painRecent'
  | 'memo'
  | 'rehab'
  | 'zone'
  | 'lastThrow'
  | 'hardOuting'
  | 'effortSpike'
  | 'outingGuess'
  | 'loggedYesterday';

/** 바뀐 항목 하나 — key 는 화면이 가르는 데(onlyPainPartChanges), text 는 그대로 띄우는 데 쓴다 */
export type FingerprintChange = { key: FingerprintKey; text: string };

/** '2026-06-15' → '6월 15일'. 지문은 올해만 다루니 해는 안 적는다(appNow 를 안 읽어 결정적이다) */
function monthDay(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number);
  return m && d ? `${m}월 ${d}일` : dateKey;
}

const quoted = (s: string) => `'${s}'`;

/*
 * '으로/로' — lib/korean.ts 의 josa 는 ㄹ 받침 예외를 한글 음절에서만 가려 숫자 1 · 7 · 8(일 · 칠 · 팔)에 '으로'를 붙인다.
 * 컨디션 글이 늘 숫자 뒤에 이 조사를 쓰니 숫자만 여기서 가른다(0 · 3 · 6 = 영 · 삼 · 육만 받침이 ㄹ이 아니다). 그 밖은 josa.
 */
function ro(word: string): string {
  const last = word.slice(-1);
  if (last >= '0' && last <= '9') return ['0', '3', '6'].includes(last) ? '으로' : '로';
  return josa(word, '으로/로');
}

/* 따옴표 안의 말에 조사를 붙일 때는 따옴표가 아니라 말을 보고 고른다 — withJosa("'웨이트'") 는 따옴표에 걸려 '으로'가 된다 */
const quotedRo = (s: string) => `${quoted(s)}${ro(s)}`;
const quotedEul = (s: string) => `${quoted(s)}${josa(s, '을/를')}`;

/** 'x:통증' → ['x', '통증'] */
function splitPart(entry: string): [string, string] {
  const i = entry.indexOf(':');
  return i < 0 ? [entry, ''] : [entry.slice(0, i), entry.slice(i + 1)];
}

/**
 * 저장된 지문(saved)과 지금 지문(now)을 견줘 바뀐 항목을 사용자 말로 — 해요체 · 줄표 없음 · 60자 안.
 *
 * 다른 날의 지문은 견주지 않는다([]) — 일정은 날마다 따로 저장되니 보통 같은 날이지만, 다른 날이면 모든 칸이 다른
 * 것이 당연해 알림이 뜻을 잃는다. 체크인이 통째로 생기거나 없어진 날은 그 한 줄만 말한다(안의 칸을 따로 세지 않는다).
 * 부위는 부위마다 한 줄, 그 밖은 항목마다 한 줄이다.
 */
export function diffFingerprintChanges(
  saved: PlanFingerprint,
  now: PlanFingerprint
): FingerprintChange[] {
  if (saved.asOf !== now.asOf) return [];
  const out: FingerprintChange[] = [];
  const push = (key: FingerprintKey, text: string) => out.push({ key, text });

  /* 오늘 체크인 */
  if ((saved.checkin == null) !== (now.checkin == null)) {
    push(
      'checkin',
      now.checkin ? '오늘 체크인을 새로 남겼어요' : '오늘 체크인이 지워졌어요'
    );
  } else if (saved.checkin && now.checkin) {
    const a = saved.checkin;
    const b = now.checkin;
    if (a.condition !== b.condition) {
      push(
        'condition',
        `컨디션이 ${a.condition}에서 ${b.condition}${ro(String(b.condition))} 바뀌었어요`
      );
    }
    const before = new Map(a.parts.map(splitPart));
    const after = new Map(b.parts.map(splitPart));
    for (const p of CHECKIN_PARTS) {
      const x = before.get(p.key) ?? null;
      const y = after.get(p.key) ?? null;
      if (x === y) continue;
      if (x == null && y != null) {
        push(
          'parts',
          y === '통증'
            ? `${p.label}에 통증이 있다고 적었어요`
            : `${withJosa(p.label, '이/가')} 뻐근하다고 적었어요`
        );
      } else if (x != null && y == null) {
        push('parts', `${p.label} ${x} 표시가 풀렸어요`);
      } else if (x != null && y != null) {
        push('parts', `${withJosa(p.label, '이/가')} ${x}에서 ${y}${ro(y)} 바뀌었어요`);
      }
    }
    if (a.soreness !== b.soreness) {
      const wa = sorenessWord(a.soreness);
      const wb = sorenessWord(b.soreness);
      push(
        'soreness',
        wb == null
          ? '근육통 표시를 지웠어요'
          : wa == null
            ? `근육통 ${quotedEul(wb)} 새로 적었어요`
            : `근육통이 ${quoted(wa)}에서 ${quotedRo(wb)} 바뀌었어요`
      );
    }
    /* 팔 피로 — 둘 다 칸이 있을 때만 견준다(칸이 생기기 전의 지문과는 안 견준다). 글은 근육통과 같은 틀 */
    if (
      a.armFatigue !== undefined &&
      b.armFatigue !== undefined &&
      a.armFatigue !== b.armFatigue
    ) {
      const wa = armFatigueWord(a.armFatigue);
      const wb = armFatigueWord(b.armFatigue);
      if (wa !== wb) {
        push(
          'armFatigue',
          wb == null
            ? '팔 피로 표시를 지웠어요'
            : wa == null
              ? `팔 피로 ${quotedEul(wb)} 새로 적었어요`
              : `팔 피로가 ${quoted(wa)}에서 ${quotedRo(wb)} 바뀌었어요`
        );
      }
    }
    if (a.sleepShort !== b.sleepShort) {
      push(
        'sleep',
        b.sleepShort ? '잠이 부족했다고 적었어요' : '잠 부족 표시가 풀렸어요'
      );
    }
    if (a.preferredWorkout !== b.preferredWorkout) {
      push(
        'preferredWorkout',
        b.preferredWorkout == null
          ? '고른 운동 종류를 지웠어요'
          : a.preferredWorkout == null
            ? `하고 싶은 운동을 ${quotedRo(b.preferredWorkout)} 골랐어요`
            : `하고 싶은 운동을 ${quoted(a.preferredWorkout)}에서 ${quotedRo(b.preferredWorkout)} 바꿨어요`
      );
    }
    if (a.throwPlan !== b.throwPlan) {
      push(
        'throwPlan',
        b.throwPlan == null
          ? '던지는 일정 표시를 지웠어요'
          : a.throwPlan == null
            ? `던지는 일정을 ${quotedRo(b.throwPlan)} 적었어요`
            : `던지는 일정을 ${quoted(a.throwPlan)}에서 ${quotedRo(b.throwPlan)} 바꿨어요`
      );
    }
  }

  /* 어제 체크인의 던지는 일정 */
  if (saved.throwPlanYesterday !== now.throwPlanYesterday) {
    const a = saved.throwPlanYesterday;
    const b = now.throwPlanYesterday;
    push(
      'throwPlanYesterday',
      b == null
        ? '어제 체크인의 던지는 일정 표시가 지워졌어요'
        : a == null
          ? `어제 체크인에 던지는 일정 ${quotedEul(b)} 적었어요`
          : `어제 체크인의 던지는 일정이 ${quoted(a)}에서 ${quotedRo(b)} 바뀌었어요`
    );
  }

  /* 최근 통증 부위(오늘 뺀 7일) */
  {
    const before = new Set(saved.painRecentParts);
    const after = new Set(now.painRecentParts);
    for (const p of CHECKIN_PARTS) {
      const x = before.has(p.key);
      const y = after.has(p.key);
      if (x === y) continue;
      push(
        'painRecent',
        y
          ? `최근 통증 부위에 ${withJosa(p.label, '이/가')} 더해졌어요`
          : `최근 통증 부위에서 ${withJosa(p.label, '이/가')} 빠졌어요`
      );
    }
  }

  /* 메모의 통증 표현 */
  if (saved.painWords.join('|') !== now.painWords.join('|')) {
    push(
      'memo',
      now.painWords.length === 0
        ? '메모의 통증 표현이 없어졌어요'
        : saved.painWords.length === 0
          ? '메모에 통증으로 보이는 말이 생겼어요'
          : '메모의 통증 표현이 바뀌었어요'
    );
  }

  /* 재활 — 단계 > 던지기 > 부위 순으로 하나만 */
  if ((saved.rehab == null) !== (now.rehab == null)) {
    push(
      'rehab',
      now.rehab ? `재활 ${now.rehab.stage}단계를 시작했어요` : '재활이 끝났어요'
    );
  } else if (saved.rehab && now.rehab) {
    const a = saved.rehab;
    const b = now.rehab;
    if (a.stage !== b.stage) {
      push('rehab', `재활이 ${a.stage}단계에서 ${b.stage}단계로 바뀌었어요`);
    } else if (a.throwing !== b.throwing) {
      push(
        'rehab',
        b.throwing === 'none'
          ? '재활 중 던지지 않기로 바뀌었어요'
          : '재활 중 가벼운 캐치볼이 허용됐어요'
      );
    } else if (a.area !== b.area) {
      push('rehab', '재활 부위가 바뀌었어요');
    }
  }

  /* 투구 부하 구간 */
  if (saved.zone !== now.zone) {
    push(
      'zone',
      now.zone == null
        ? '투구 부하 지수가 없어졌어요'
        : saved.zone == null
          ? `투구 부하가 ${ACWR_ZONES[now.zone].short} 구간으로 나왔어요`
          : `투구 부하가 ${ACWR_ZONES[saved.zone].short}에서 ${ACWR_ZONES[now.zone].short} 구간으로 바뀌었어요`
    );
  }

  /* 마지막 투구 */
  {
    const a = saved.lastThrow;
    const b = now.lastThrow;
    /* load 는 둘 다 있을 때만 견준다(2판 P4 커밋 E — 칸이 생기기 전의 지문과는 안 견준다) */
    const sameCount =
      a != null &&
      b != null &&
      a.date === b.date &&
      a.pitches === b.pitches &&
      a.adjusted === b.adjusted;
    const same =
      (a == null && b == null) ||
      (sameCount && (a.load == null || b.load == null || a.load === b.load));
    if (!same) {
      if (b == null) {
        push('lastThrow', '투구 기록이 없어졌어요');
      } else if (b.date === now.asOf && (a == null || a.date !== b.date)) {
        push('lastThrow', `오늘 ${b.pitches}구를 던졌어요`);
      } else if (sameCount) {
        /* 구수 · 전력 환산은 같고 투구수 × 체감 강도만 다르다 — 체감 강도를 고친 날 */
        const when = b.date === now.asOf ? '오늘' : monthDay(b.date);
        push('lastThrow', `${when} 투구 기록의 체감 강도가 바뀌었어요`);
      } else if (a != null && a.date === b.date) {
        const when = b.date === now.asOf ? '오늘' : monthDay(b.date);
        push('lastThrow', `${when} 투구 기록이 ${b.pitches}구로 바뀌었어요`);
      } else {
        push(
          'lastThrow',
          `마지막 투구가 ${monthDay(b.date)} ${b.pitches}구로 바뀌었어요`
        );
      }
    }
  }

  /* 세게 던진 날 */
  {
    const a = saved.hardOuting;
    const b = now.hardOuting;
    /*
     * load 는 둘 다 있을 때만 견준다 — 2판 D2 전에 저장된 지문(load 없음)과 지금 지문을 load 하나로 '바뀜'이라 하지 않게.
     * (그 지문의 pitches 는 거의 전력 투구수라, 경기 뒤 캐치볼을 한 날은 배포 당일 한 번 '바뀌었어요'가 뜰 수 있다.)
     */
    const samePitches =
      a != null && b != null && a.daysAgo === b.daysAgo && a.pitches === b.pitches;
    const same =
      (a == null && b == null) ||
      (samePitches && (a.load == null || b.load == null || a.load === b.load));
    if (!same) {
      const when = b && b.daysAgo === 0 ? '오늘' : '어제';
      push(
        'hardOuting',
        b == null
          ? '세게 던진 날 표시가 풀렸어요'
          : a == null
            ? isNearMaxOuting(b)
              ? `${when} 거의 전력으로 ${b.pitches}구를 던진 기록이 들어왔어요`
              : `${when} 팔 부담이 큰 ${b.pitches}구 기록이 들어왔어요`
            : samePitches
              ? `${when} 세게 던진 기록의 체감 강도가 바뀌었어요`
              : `세게 던진 기록이 ${when} ${b.pitches}구로 바뀌었어요`
      );
    }
  }

  /* 최근 운동 힘듦 급증 — 둘 다 칸이 있을 때만(2판 P4 커밋 E) */
  if (
    saved.effortSpike !== undefined &&
    now.effortSpike !== undefined &&
    saved.effortSpike !== now.effortSpike
  ) {
    push(
      'effortSpike',
      now.effortSpike
        ? '최근 운동 힘듦이 평소보다 높아졌어요'
        : '최근 운동 힘듦이 평소대로 돌아왔어요'
    );
  }

  /* 다음 등판 짐작의 재료 — 둘 다 칸이 있을 때만(2판 P4 커밋 G). 달력 · 같은 요일을 따로 한 줄씩 */
  if (saved.outingGuess !== undefined && now.outingGuess !== undefined) {
    const a = saved.outingGuess;
    const b = now.outingGuess;
    if (a.calendar !== b.calendar) {
      push(
        'outingGuess',
        b.calendar == null
          ? '달력의 경기 일정이 빠졌어요'
          : a.calendar == null
            ? `달력에 ${dayWord(b.calendar)} 경기가 생겼어요`
            : `달력의 다음 경기가 ${dayWord(a.calendar)}에서 ${dayWord(b.calendar)}로 바뀌었어요`
      );
    }
    if (a.estimate.join('|') !== b.estimate.join('|')) {
      push(
        'outingGuess',
        b.estimate.length === 0
          ? '같은 요일 경기로 등판을 짐작하지 않게 됐어요'
          : a.estimate.length === 0
            ? '최근 같은 요일 경기가 이어져 등판을 짐작했어요'
            : '같은 요일 경기로 짐작한 등판 날이 바뀌었어요'
      );
    }
  }

  /*
   * 어제 기록 유무 — 둘 다 칸이 있을 때만(2판 P4 검토). 어제 던진 기록이면 마지막 투구 · 세게 던진 날 줄이 이미 말하니 그 줄이 없을 때만
   * (어제를 휴식으로 남긴 날 · 오늘 기록이 마지막 투구라 어제 줄이 안 보이는 날) 한 줄 — 같은 바뀜을 두 줄로 말하지 않게.
   */
  if (
    saved.loggedYesterday !== undefined &&
    now.loggedYesterday !== undefined &&
    saved.loggedYesterday !== now.loggedYesterday &&
    !out.some((c) => c.key === 'lastThrow' || c.key === 'hardOuting')
  ) {
    push(
      'loggedYesterday',
      now.loggedYesterday ? '어제 투구 기록을 남겼어요' : '어제 투구 기록이 지워졌어요'
    );
  }

  return out;
}

/** 오늘부터 며칠 뒤를 말로 — '오늘' · '내일' · 'N일 뒤'(뒤에 '로'가 와도 맞게 끝이 받침 ㄹ 이거나 모음) */
function dayWord(days: number): string {
  return days === 0 ? '오늘' : days === 1 ? '내일' : `${days}일 뒤`;
}

/** 바뀐 항목의 글만 — 화면에 한 줄씩 그대로 띄운다 */
export function diffFingerprint(
  saved: PlanFingerprint,
  now: PlanFingerprint
): string[] {
  return diffFingerprintChanges(saved, now).map((c) => c.text);
}

/**
 * 바뀐 것이 아픈 부위(오늘 · 최근)뿐인가 — 그 변화는 안전 재검사(today-data.ts 의 droppedForSafety)가 이미 운동을 빼서
 * 알리니, 화면이 두 알림을 겹쳐 띄우지 않게 가르는 데 쓴다. 바뀐 것이 없으면 false.
 */
export function onlyPainPartChanges(changes: readonly FingerprintChange[]): boolean {
  return (
    changes.length > 0 &&
    changes.every((c) => c.key === 'parts' || c.key === 'painRecent')
  );
}

/**
 * 저장된 일정과 지금 facts 를 견준 결과 — today-data.ts 가 부른다.
 * 일정이 없거나 지문이 없는 옛 일정 · 모양이 깨진 지문이면 [](견줄 것 없음 = 바뀜 없음).
 */
export function stateChangesOf(
  savedPlan: object | null | undefined,
  facts: ReportFacts
): FingerprintChange[] {
  const saved = readPlanFingerprint(
    (savedPlan as { fingerprint?: unknown } | null | undefined)?.fingerprint
  );
  return saved ? diffFingerprintChanges(saved, fingerprintOf(facts)) : [];
}
