import { SHORT_SLEEP_HOURS, formatSleepHours, sorenessWord } from '@/lib/checkin';
import type { DayState } from '@/lib/engine/day-state';
import { HEAVY_CATEGORIES } from '@/lib/engine/exercise-class';
import { goalPrescription } from '@/lib/report/goal-prescription';

/**
 * 그날 일정의 양 조절(세트 조절)과 처방 한 길 — 트레이닝 추천 2판 P5(2026-10-12, docs/designs/training-recommendation-engine.md).
 *
 * 왜 두는가. 2판 P5 는 컨디션이 평소보다 낮은 날 · 최근 운동이 힘들었던 날 · 잠이 모자라거나 근육통이 '많이'인 날에 본운동을
 * 한 세트씩 줄인다. 그런데 세트 · 횟수는 일정을 만들 때 저장하지 않고, 보일 때마다 목표(goal-prescription.ts)로 다시 센다 —
 * 일정을 짤 때 · 트레이닝 화면 목록 · '운동 추가' 목록 · 홈의 운동 시간 · 운동 시작 때 얼리기 · 운동 중 바꿔 넣기 · 기록의 '계획'이
 * 모두 그렇다(2026-10-12 아홉 자리). 한 자리라도 줄인 세트를 모르면 목록에는 3세트인데 운동 화면에는 4세트가 나온다. 그래서 일정
 * (DailyPlan)과 세션 판(FrozenPlan)에 줄인 것을 volume 칸으로 싣고, 아홉 자리가 모두 planPrescription 하나로 센다.
 *
 * 순수 파일이다 — DB · server-only · 날짜 함수가 없고, exercise-class(잎) · goal-prescription · checkin(문턱 · 말)만 값으로 부른다.
 * 오늘 상태 한 장(day-state)은 타입만 부른다. theme · prescription · daily-plan 을 값으로 부르지 않는다(그쪽이 이 파일을 부를 수
 * 있게 — theme → prescription → 여기 → theme 순환을 막는다).
 *
 * 처음 커밋(P5-b)은 길만 놓았다(만드는 쪽이 없어 늘 없었다). P5-d(2026-10-12)부터 decideVolume · volumeForDay 가 언제 줄이는지
 * 정하고, 매일 일정(daily-plan.ts buildDailyPlan)이 그 결과를 싣는다. P5-e(2026-10-12)부터 최근 운동 힘듦 급증도 '직접 고르기'에서
 * 세트를 줄인다(그래도 고른 대로 만들 수 있다 — 아래 VolumeSignal).
 */

/** 세트를 줄여도 이만큼은 남긴다 — 3세트 이상인 운동만 한 세트 줄인다(두 세트 운동을 한 세트로 만들면 운동 자체가 흐려진다) */
export const VOLUME_MIN_SETS = 2;

/**
 * 그날 일정의 양 조절. 일정(DailyPlan.volume)과 그 일정으로 연 세션 판(FrozenPlan.volume)에 같은 모양으로 실린다.
 * 줄인 것이 없는 날은 칸 자체가 없다(옛 줄과 같은 모양 — 그래서 DailyPlan.version 은 그대로).
 */
export type PlanVolume = {
  /** 본운동(무게 드는 카테고리) 세트를 몇 개 줄였나 — 지금은 한 세트(−1)만 있다 */
  setDelta: -1 | 0;
  /**
   * 그날 강도 상한이 한 칸 내려간 날인가(−1 — 가장 센 운동('매우 높음')을 빼는 신호가 걸린 날). 처방 숫자로는 못 내린다 —
   * 라이브러리 강도가 운동마다 하나라, 빼는 일은 안전 거르기(lib/report/prescription.ts 의 강도 상한)가 하고 실제로 뺀 수는
   * 그쪽 excluded 가 센다. 여기는 그 사실을 적어 두는 칸이다(무게를 올리지 않는 판단 등이 읽는다).
   */
  intensityStep: -1 | 0;
  /** 화면에 보일 까닭 한 줄(해요체, 줄표 없음) */
  why: string;
};

/** 판정에 필요한 칸 — 라이브러리 줄 · 캐시 · 목표 처방을 거친 운동이 모두 넘길 수 있게 좁게 둔다(goal-prescription 의 Prescribed 와 같은 칸) */
type Prescribed = {
  category: string;
  intensity: string;
  sets?: number | null;
  reps?: number | null;
};

/**
 * 저장된 칸을 읽는다. 모양이 아니면 null — 줄이지 않는다(옛 줄 · 깨진 값 · 남이 고쳐 보낸 값).
 *
 * 새 객체로 돌려준다(모르는 칸은 버린다). intensityStep 이 없는 것은 0 으로 읽는다. 둘 다 0 이면 줄인 것이 없으니 null —
 * '칸이 있으면 무언가 줄였다'가 늘 참이게 한다. 일정은 JSON 으로 저장돼(DailyTrainingSetup.plan · TrainingSession.plan) 읽을 때마다
 * 여기를 거친다 — planPrescription 이 이것만 믿는다.
 */
export function readPlanVolume(value: unknown): PlanVolume | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const setDelta = v.setDelta;
  const intensityStep = v.intensityStep === undefined ? 0 : v.intensityStep;
  if (setDelta !== -1 && setDelta !== 0) return null;
  if (intensityStep !== -1 && intensityStep !== 0) return null;
  if (typeof v.why !== 'string' || v.why.trim() === '') return null;
  if (setDelta === 0 && intensityStep === 0) return null;
  return { setDelta, intensityStep, why: v.why };
}

/**
 * 양 조절을 운동 하나에 댄다. 바꿀 것이 없으면 받은 그대로(같은 객체).
 *
 *   줄이는 것  무게 드는 카테고리(하체 · 상체 스트렝스 · 파워 — lib/engine/exercise-class.ts HEAVY_CATEGORIES)의 세트를 setDelta 만큼,
 *             단 VOLUME_MIN_SETS 밑으로는 안 내린다(3세트 이상만 줄어든다)
 *   그대로     코어 · 회복 및 보강 · 가동성 · 암케어 · 유산소(몸에 남는 쪽이 아니다), 세트를 안 채운 운동, 횟수 · 시간 · 휴식
 *
 * 목표 처방(goalPrescription) 다음에 댄다 — 근력 향상이 무거운 운동을 4세트로 정한 뒤 그 4를 줄여야 한다(앞에 대면 목표가 덮는다).
 */
export function applyVolume<T extends Prescribed>(
  ex: T,
  volume: PlanVolume | null | undefined
): T {
  if (!volume || volume.setDelta === 0) return ex;
  if (!HEAVY_CATEGORIES.includes(ex.category)) return ex;
  if (ex.sets == null) return ex;
  const sets = ex.sets + volume.setDelta;
  if (sets < VOLUME_MIN_SETS) return ex;
  return { ...ex, sets };
}

/**
 * 처방 한 길 — 그날 목표에 맞춘 세트 · 횟수(goalPrescription) 위에 그날 양 조절(volume)을 댄 것.
 *
 * 세트 · 횟수를 세는 모든 자리가 이것을 부른다(2026-10-12 아홉 자리 — 일정을 짤 때 · 트레이닝 화면 목록 · '운동 추가' 목록 · 홈의
 * 운동 시간 · 운동 시작 때 얼리기 · 운동 중 [교체] 목록 · 바꿔 넣기 · 기록의 '계획' 둘, 기준선 도구의 세트 어댑터도). 한 곳이라도
 * goalPrescription 을 바로 부르면 그 자리만 줄인 세트를 모른다.
 *
 * plan 은 저장된 일정(DailyPlan) · 세션 판(FrozenPlan) · 그 둘에서 고른 칸({ goal, volume }) 무엇이든 된다 — goal 과 volume 만 본다.
 * volume 은 저장된 값이라 여기서 readPlanVolume 으로 다시 읽는다(깨진 값은 안 줄임). 프로그램 날(근력 · 파워 프로그램)의 운동은
 * 이 길을 안 거친다 — 프로그램 처방(lib/program/program.ts)이 따로 있다(D6).
 */
export function planPrescription<T extends Prescribed>(
  ex: T,
  plan: { goal?: string | null; volume?: unknown } | null | undefined
): T {
  return applyVolume(goalPrescription(ex, plan?.goal), readPlanVolume(plan?.volume));
}

/* ─────────────────────────── 언제 줄이나(2판 P5-d) ─────────────────────────── */

/**
 * 세트를 한 개씩 줄이는 신호 — 오늘 상태 한 장(lib/engine/day-state.ts body)의 칸 그대로 읽는다(사용자 결정 2026-10-12, 조이는 쪽).
 *   belowUsual  오늘 컨디션이 평소(28일 중앙값)보다 2점 이상 낮다(바닥 4 위에서만 — facts.ts belowUsualCondition)
 *   sleepShort  짧은 밤 — 느낌 '부족'이거나 6시간 미만(lib/checkin.ts isShortSleep)
 *   soreHigh    전신 근육통 '많이' 이상(HIGH_SORENESS — '심함'은 보통 회복날이지만 '그래도 하기'로 근력 날이 된 날도 줄인다)
 * 셋 다 안전 거르기가 가장 센 운동을 이미 빼는 날이다(prescription.ts 4-1 · 4-2 · 4-2-1) — 강도를 한 칸 내렸으면 양도 한 칸 내린다.
 * 근력 프로그램의 칸 조정(lib/program/program.ts decideToday — 근육통 '많이' · 짧은 밤이면 큰 하체 세트 −1)과 같은 뜻이다.
 *
 *   effortSpike 최근 운동 힘듦 급증(오늘 상태 한 장의 load.effortSpike — facts.condition.trainingEffort.spikeFlag, 2판 P2: 7일 안 3개
 *               이상 · 7일 평균이 28일 평균보다 2 이상 높음). P5-e(2026-10-12) — 부르는 쪽이 reduceForEffort 를 켤 때만 읽는다.
 *               '직접 고르기'만 켠다(app/actions/training-setup.ts): 일정 만들기 폼이 경고 한 줄과 '그래도 고른 대로'를 보이고, 고르면
 *               이 신호만 끈다(overrideEffort — 다른 신호 · 안전 거르기는 그대로). 자동 맞춤은 끄고 대신 시간을 한 단계 줄인다
 *               (auto-setup.ts — 세트와 시간을 두 번 줄이지 않게, 사용자 결정 2026-10-12). 이 신호는 강도를 안 내린다(intensityStep 0) —
 *               가장 센 운동을 빼는 안전 거르기가 급증을 안 읽기 때문이다(몸이 아니라 지난 운동의 느낌이라 양만 줄인다).
 * 차례는 오늘 몸(평소 · 잠 · 근육통) 먼저, 지난 운동의 느낌(급증)이 끝 — 한 줄도 그 차례로 잇는다.
 */
export type VolumeSignal = 'belowUsual' | 'sleepShort' | 'soreHigh' | 'effortSpike';

/** 신호를 읽는 차례 — 이유 글 · 화면 한 줄이 이 차례로 적는다(같은 상태면 늘 같은 글) */
export const VOLUME_SIGNALS: readonly VolumeSignal[] = [
  'belowUsual',
  'sleepShort',
  'soreHigh',
  'effortSpike',
];

/** 오늘 몸에서 온 신호 — 걸리면 안전 거르기가 가장 센 운동도 빼는 날이라 강도도 한 칸(intensityStep −1) */
const BODY_SIGNALS: readonly VolumeSignal[] = ['belowUsual', 'sleepShort', 'soreHigh'];

/**
 * decideVolume 이 읽는 칸 — DayState 를 통째로 넘기면 된다(자체 시험은 이 칸만 만들어도 된다). load 는 P5-e 의 힘듦 급증 칸 —
 * 없으면 급증이 없는 것으로 읽는다(P5-d 의 입력 그대로 돈다).
 */
export type VolumeStateInput = {
  load?: Pick<DayState['load'], 'effortSpike'>;
  body: Pick<
    DayState['body'],
    | 'belowUsual'
    | 'condition'
    | 'usualCondition'
    | 'sleepShort'
    | 'sleepHours'
    | 'soreness'
    | 'soreMany'
    | 'soreSevere'
  >;
};

/** 오늘 상태로 정한 양 조절 — 아직 일정에 대기 전(그날 운동 · 테마를 모른다). 일정에 실을지는 volumeForDay 가 정한다 */
export type VolumeDecision = {
  setDelta: -1 | 0;
  intensityStep: -1 | 0;
  /** 걸린 신호(VOLUME_SIGNALS 차례) */
  signals: VolumeSignal[];
  /** 걸린 신호마다 한 줄(해요체 · 줄표 없음) — 오늘 상태 한 장의 이유 줄과 같은 말 */
  why: string[];
  /** 실제로 줄였을 때 화면에 보일 한 줄(PlanVolume.why) — '잠이 부족해 본운동을 한 세트씩 줄였어요.' */
  line: string;
};

/** 신호마다 화면 한 줄의 마디 — 앞 마디는 '…하고', 마지막은 '…해'로 잇는다 */
function clauseOf(signal: VolumeSignal, severe: boolean): { and: string; so: string } {
  if (signal === 'belowUsual') {
    return { and: '컨디션이 평소보다 낮고', so: '컨디션이 평소보다 낮아' };
  }
  if (signal === 'sleepShort') return { and: '잠이 부족하고', so: '잠이 부족해' };
  if (signal === 'effortSpike') {
    return { and: '최근 운동이 평소보다 힘들었고', so: '최근 운동이 평소보다 힘들어' };
  }
  return severe
    ? { and: '근육통이 심하고', so: '근육통이 심해' }
    : { and: '근육통이 많고', so: '근육통이 많아' };
}

/** 컨디션 숫자 — 반 점 평소(6.5)도 그대로 '6.5/10' */
const outOfTen = (n: number) => `${n}/10`;

/**
 * 오늘 상태로 양 조절을 정한다 — 걸린 신호가 없으면 null(줄이지 않는다). 같은 상태면 늘 같은 값(날짜 · 난수 없음).
 *
 * 오늘 상태 한 장(DayState)의 body · load 만 읽는다 — 독자가 facts 를 저마다 읽지 않게(2판 P3 의 원칙). 장의 칸은 안전 거르기와 같은
 * 함수로 만든 값이라(belowUsualCondition · isShortSleep · HIGH_SORENESS) 세트를 줄이는 날과 가장 센 운동을 빼는 날이 어긋나지 않는다.
 * 바닥 4 이하 · 근육통 '심함' 날은 보통 회복날이라 일정에 대지 않는다(volumeForDay 가 근력 날에만 댄다).
 *
 * 힘듦 급증(load.effortSpike)은 reduceForEffort 가 참일 때만 신호가 된다(P5-e — 직접 고르기에서 '그래도 고른 대로'를 안 골랐을 때,
 * VolumeSignal 주석). 급증만 걸린 날은 세트만 줄이고 강도는 그대로(intensityStep 0) — 몸 신호가 하나라도 걸리면 −1.
 */
export function decideVolume(
  state: VolumeStateInput,
  { reduceForEffort = false }: { reduceForEffort?: boolean } = {}
): VolumeDecision | null {
  const b = state.body;
  const effort = reduceForEffort && state.load?.effortSpike === true;
  const signals = VOLUME_SIGNALS.filter((s) =>
    s === 'belowUsual'
      ? b.belowUsual
      : s === 'sleepShort'
        ? b.sleepShort
        : s === 'soreHigh'
          ? b.soreMany || b.soreSevere
          : effort
  );
  if (signals.length === 0) return null;

  const why = signals.map((s) => {
    if (s === 'belowUsual') {
      return b.condition != null && b.usualCondition != null
        ? `오늘 컨디션 ${outOfTen(b.condition)}이 평소 ${outOfTen(b.usualCondition)}보다 낮아요.`
        : '오늘 컨디션이 평소보다 낮아요.';
    }
    if (s === 'sleepShort') {
      return b.sleepHours != null && b.sleepHours < SHORT_SLEEP_HOURS
        ? `어젯밤 ${formatSleepHours(b.sleepHours)}만 잤어요.`
        : '잠이 부족했다고 적었어요.';
    }
    /* 오늘 상태 한 장(day-state.ts whyLines)이 같은 날 하는 말 그대로 */
    if (s === 'effortSpike') return '최근 운동 힘듦이 평소보다 높아요.';
    const word = sorenessWord(b.soreness);
    return word ? `전신 근육통이 '${word}'이에요.` : '전신 근육통이 심해요.';
  });
  const clauses = signals.map((s) => clauseOf(s, b.soreSevere));
  const head = [
    ...clauses.slice(0, -1).map((c) => c.and),
    clauses[clauses.length - 1].so,
  ].join(' ');
  return {
    setDelta: -1,
    intensityStep: signals.some((s) => BODY_SIGNALS.includes(s)) ? -1 : 0,
    signals,
    why,
    line: `${head} 본운동을 한 세트씩 줄였어요.`,
  };
}

/** 세트를 줄이는 날 — 하체 · 상체(근력) 날만. 회복 · 보조 날은 이미 가벼운 날이다(ThemeKey 를 글자로 견준다 — theme.ts 를 안 부르려고) */
const VOLUME_THEMES: readonly string[] = ['lower', 'upper'];

/**
 * 오늘 상태의 양 조절을 그날 일정에 댈지 — 대면 일정에 실을 PlanVolume, 아니면 null.
 *
 *   대는 날   하체 · 상체 날이고 목표가 컨디셔닝이 아니고(무게 드는 운동이 없는 날), 그날 운동 가운데 실제로 세트가 줄어드는
 *             운동이 하나라도 있을 때(applyVolume 이 바꾸는 것 — 무게 드는 카테고리 3세트 이상)
 *   글        실제로 줄였을 때만 '…본운동을 한 세트씩 줄였어요.'(auto-setup 의 '실제로 줄 때만 줄였다고 한다'와 같은 원칙)
 *
 * exercises 는 목표 처방을 거친 그날 운동이다(buildDailyPlan 이 고른 것) — 근력 향상의 4세트가 여기서 3세트가 된다.
 * 고르는 목록 자체는 줄이지 않는다 — 줄인 세트만큼 남는 시간을 다른 운동으로 메우면 양을 줄인 뜻이 사라진다(daily-plan.ts).
 */
export function volumeForDay<T extends Prescribed>({
  decision,
  themeKey,
  conditioning,
  exercises,
}: {
  decision: VolumeDecision | null;
  themeKey: string;
  /** 목표가 컨디셔닝인가 */
  conditioning: boolean;
  exercises: readonly T[];
}): PlanVolume | null {
  if (!decision || decision.setDelta === 0) return null;
  if (!VOLUME_THEMES.includes(themeKey) || conditioning) return null;
  const volume: PlanVolume = {
    setDelta: decision.setDelta,
    intensityStep: decision.intensityStep,
    why: decision.line,
  };
  if (!exercises.some((ex) => applyVolume(ex, volume) !== ex)) return null;
  return volume;
}

/**
 * 무게를 올리지 않는 날인가 — 양을 줄인 판(일정 · 세션 판의 volume 칸이 있다). 자유 운동 무게 추천(lib/workout/free-weight.ts)이
 * '다 채웠으면 올림'을 그날은 멈춘다. 세트를 줄인 날 무게를 올리면 양을 줄인 뜻과 반대로 간다. 저장된 값이라 다시 읽는다.
 */
export function holdsWeight(plan: { volume?: unknown } | null | undefined): boolean {
  return readPlanVolume(plan?.volume) != null;
}
