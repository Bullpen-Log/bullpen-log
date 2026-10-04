import { type ArmcareAreaKey } from '@/lib/armcare/anatomy';
import { withJosa } from '@/lib/korean';
import {
  isRehabArea,
  REHAB_ACTIVITY_MAX_LENGTH,
  REHAB_SEVERITIES,
  REHAB_STAGES,
  rehabJoint,
  type RehabJoint,
  type RehabSeverity,
  type RehabStage,
  severityLabel,
} from '@/lib/armcare/rehab-regions';
import {
  afterBadSession,
  atLeastConditionSeverity,
  cleanSessionsNeeded,
  isRehabCondition,
  RED_PAIN,
  REHAB_CONDITIONS,
  type RehabConditionKey,
  type RehabSessionLike,
  rehabTitle,
  SEVERITY_BY_RANK,
  SEVERITY_RANK,
  STAGE_DAYS,
  stageMinDays,
} from '@/lib/armcare/rehab-plan';
import {
  daysBetween,
  type RehabCheckinLike,
  type RehabProgramLike,
  type RehabWeeklyLike,
  type RehabWeeklyTest,
  RETURN_GREENS,
  type SidePair,
  type ThrowingTestRecord,
  type WeeklyOutcomeRecord,
} from '@/lib/armcare/rehab-progress';

/** 재활 규칙 — 매주 확인 · 저장된 줄 읽기 · 앱의 다른 곳이 읽는 것. 밖에서는 입구 '@/lib/armcare/rehab' 로 가져다 쓴다. */

/* ─────────────────────────────── 매주 확인 ─────────────────────────────── */

/** 변화가 '진짜'인 선(가이드라인 8절 — SANE · PSFS): 이보다 작은 변화는 흔들림 */
export const NOISE_NORMAL_PCT = 10;
export const NOISE_ACTIVITY = 1.2;
/** 정상 대비 %가 지난 확인보다 이만큼 떨어지면 한 단계 내림(가이드라인 10절) */
export const DROP_NORMAL_PCT = 15;
/** 정도를 낮추는 주의 최고 통증 상한(가이드라인 10절) */
export const CALM_PAIN = 3;
/** 이 날 수 안에 한 칸 낮춤이 두 번이면 한 단계 내림(가이드라인 10절) */
export const STEP_DOWN_WINDOW_DAYS = 14;
/** [정리] 두 확인이 이만큼 안에 있어야 '이어서'로 본다 — 한 주를 건너뛴 것까지 */
export const WEEKLY_LINK_DAYS = 14;
/** [정리] 이만큼(다치기 전 대비 %) 이상이면 '나아짐 없음' 진료 권유를 하지 않는다 — 투구 복귀표를 여는 선과 같다 */
export const NEAR_NORMAL_PCT = 90;

/** 내 활동 두 개의 평균(없으면 0) */
function activityMean(w: Pick<RehabWeeklyLike, 'activities'>): number {
  const scores = w.activities.filter((n) => Number.isFinite(n));
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
}

/**
 * [정리] 나아졌나 — 정상 대비 % 가 10점 이상, 또는 내 활동 평균이 1.2점 이상 올랐다(가이드라인 8절의 흔들림 선).
 * 이보다 작은 변화는 흔들림으로 본다.
 */
export function weeklyImproved(
  before: Pick<RehabWeeklyLike, 'normalPct' | 'activities'>,
  after: Pick<RehabWeeklyLike, 'normalPct' | 'activities'>
): boolean {
  return (
    after.normalPct - before.normalPct >= NOISE_NORMAL_PCT ||
    activityMean(after) - activityMean(before) >= NOISE_ACTIVITY - 1e-9
  );
}

/** [정리] 전혀 나아지지 않았나 — 정상 대비 % 와 내 활동 평균이 둘 다 오르지 않았다(같거나 낮다) */
function notImprovedAtAll(
  before: Pick<RehabWeeklyLike, 'normalPct' | 'activities'>,
  after: Pick<RehabWeeklyLike, 'normalPct' | 'activities'>
): boolean {
  return (
    after.normalPct <= before.normalPct && activityMean(after) <= activityMean(before)
  );
}

/** 생활 통증 — 그날 어깨 · 팔꿈치가 '통증'이고 정도가 '평소에도'(2) · '밤에도'(3) */
function dailyArmPain(c: RehabCheckinLike): boolean {
  return (
    (c.shoulder === '통증' || c.elbow === '통증') &&
    (c.armPainLevel === 2 || c.armPainLevel === 3)
  );
}

/** 정도 한 칸 내림 — 병명의 바닥(UCL 은 보통) 아래로는 안 간다 */
function easeSeverity(
  severity: RehabSeverity,
  condition: RehabConditionKey | null
): RehabSeverity {
  const lower = SEVERITY_BY_RANK[Math.max(0, SEVERITY_RANK[severity] - 1)];
  return atLeastConditionSeverity(lower, condition);
}

/** 정도 한 칸 올림 — 심함이 끝 */
function raiseSeverity(severity: RehabSeverity): RehabSeverity {
  return SEVERITY_BY_RANK[Math.min(2, SEVERITY_RANK[severity] + 1)];
}

export type WeeklyOutcome = {
  /** 확인 줄(test.outcome)에 남길 것 */
  record: WeeklyOutcomeRecord;
  /** 바뀐 프로그램 — 바뀐 것이 없으면 지금 값 그대로. stageChanged 면 그 단계의 날을 오늘로 · 줄인 날을 0으로(changeRehabStage 와 같다) */
  next: {
    stage: RehabStage;
    severity: RehabSeverity;
    stageShortenDays: number;
    stageChanged: boolean;
  };
  /** 확인을 남긴 뒤 시트에 보이는 한 줄들 — 앞의 것이 더 중요하다 */
  lines: string[];
};

/**
 * 매주 확인의 결과(가이드라인 10절) — 이번 확인과 지난 확인 · 세션 · 그 주 체크인으로 프로그램을 어떻게 바꿀지 정한다.
 * 저장 동작(app/actions/rehab.ts 의 saveRehabWeekly)이 서버에서 다시 계산해 프로그램을 고친다(화면을 믿지 않는다).
 *
 *   진료 권유  밤 · 쉴 때 통증이 새로 생김(지난 확인엔 없었음 — 첫 확인이면 '심함'으로 시작하지 않았는데 있음) ·
 *              1단계에서 낮추기 조건(최고 통증 5 이상 · 아래의 한 단계 내림 조건) ·
 *              2주째(시작 14일 뒤 첫 확인)에 첫 확인보다 전혀 나아지지 않음 · 6주째(42일 뒤 첫 확인)에 뚜렷이 나아지지 않음 ·
 *              매주 확인 세 번 이어 나아짐 없음(이번 확인이 세 번 전 확인보다 나아지지 않음 — 그사이 오르내린 것도 '없음').
 *              '나아짐 없음' 셋은 이미 다치기 전의 90% 이상이면 묻지 않는다
 *   한 단계 내림  14일 안에(이 단계에서) 한 칸 낮춤 두 번 — 낮추는 빨강 · 진료 세션과 최고 통증 5 이상인 확인 —
 *              또는 정상 대비 %가 지난 확인보다 15점 이상 떨어짐 → 한 단계 아래 + 정도 한 칸 올림(1단계면 정도만 + 진료)
 *   한 칸 낮춤   이번 주 최고 통증 5 이상 → 프로그램은 그대로, rehabStatus 가 이 확인을 보고 초록 셋까지 아래 단계 운동으로
 *   정도 낮추기  이어서 두 번(서로 14일 안) 최고 통증 3 이하 · 밤 · 쉴 때 통증 없음 · 그 주(확인한 날까지 7일) 체크인에
 *              생활 통증(팔 통증 정도 2 · 3) 없음 → 정도 한 칸 내림(병명 바닥 아래로는 안 감). 낮추면 두 번을 다시 센다
 *   기간 줄이기  깨끗한 세션이 이 단계에 필요한 수(최대 6) 이상 모두 이어서 초록 + 매주 확인 두 번 이어 그 단계 시험 통과 →
 *              stageShortenDays 를 그 단계 최소 기간의 절반으로(병명 바닥은 stageMinDays 가 지킨다). 1~3단계만
 *   머물기     위가 없고 지난 확인보다 나아지지 않았거나(흔들림 안) 그 주에 노랑 세션 — 프로그램은 그대로
 * 진료를 권하는 주에는 정도를 낮추거나 기간을 줄이지 않는다.
 */
export function weeklyOutcome({
  program,
  weekly,
  previous,
  sessions,
  checkins = [],
}: {
  program: RehabProgramLike;
  /** 이번 확인 — test.pass 는 서버가 다시 판정한 값 */
  weekly: RehabWeeklyLike;
  /** 이 재활의 지난 확인들(차례 상관없음 — 이번 날짜 이전 것만 본다) */
  previous: readonly RehabWeeklyLike[];
  /** 이 재활의 세션 전부 */
  sessions: readonly RehabSessionLike[];
  /** 확인한 날까지 7일 체크인 */
  checkins?: readonly RehabCheckinLike[];
}): WeeklyOutcome {
  const prevs = previous
    .filter((w) => w.date < weekly.date)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const prev = prevs.at(-1) ?? null;
  const first = prevs[0] ?? null;
  const day = daysBetween(program.startedOn, weekly.date);
  const within = (date: string, days: number) => {
    const gap = daysBetween(date, weekly.date);
    return gap >= 0 && gap < days;
  };
  const inStage = (x: { stage: number; date: string }) =>
    x.stage === program.stage && x.date >= program.stageStartedOn;

  /* 이어서 — 지난 확인이 14일 안에 있으면 그 기록의 이어진 수를 잇는다 */
  const linked =
    prev != null && daysBetween(prev.date, weekly.date) <= WEEKLY_LINK_DAYS;
  const prevRecord = linked ? (prev.test?.outcome ?? null) : null;
  const calm =
    weekly.worstPain <= CALM_PAIN &&
    !weekly.nightPain &&
    !checkins.some((c) => within(c.date, 7) && dailyArmPain(c));
  let calmStreak = calm ? (prevRecord?.calmStreak ?? 0) + 1 : 0;
  const testPass = weekly.test?.kind != null && weekly.test.pass === true;
  const testStreak = testPass
    ? (prevRecord && inStage(prev!) ? prevRecord.testStreak : 0) + 1
    : 0;

  /* 낮추기 · 한 단계 내림 */
  const thisLower = weekly.worstPain >= RED_PAIN;
  const lowerCount =
    sessions.filter(
      (s) =>
        inStage(s) && within(s.date, STEP_DOWN_WINDOW_DAYS) && afterBadSession(s)?.lower
    ).length +
    prevs.filter(
      (w) =>
        inStage(w) && within(w.date, STEP_DOWN_WINDOW_DAYS) && w.worstPain >= RED_PAIN
    ).length +
    (thisLower ? 1 : 0);
  const normalDrop =
    prev != null && prev.normalPct - weekly.normalPct >= DROP_NORMAL_PCT;
  const stepDown = lowerCount >= 2 || normalDrop;

  /*
   * 진료 권유 — 하나만, 앞의 것이 먼저.
   * [정리] 이미 다치기 전의 90% 이상이면(투구 복귀표를 여는 선) '나아짐 없음'으로 진료를 권하지 않는다 — 더 오를 자리가
   * 거의 없는 사람을 '안 나아진다'고 병원에 보내게 된다.
   */
  const reachedBefore = (days: number) =>
    prevs.some((p) => daysBetween(program.startedOn, p.date) >= days);
  const stallable = weekly.normalPct < NEAR_NORMAL_PCT;
  let refer: string | null = null;
  if (weekly.nightPain && (prev ? !prev.nightPain : program.severity !== 'severe')) {
    refer = '밤이나 쉴 때 아픈 것이 새로 생겼어요. 진료를 받아보세요.';
  } else if (program.stage === 1 && (stepDown || thisLower)) {
    refer = '1단계에서도 아파요. 진료를 받아보세요.';
  } else if (
    stallable &&
    first &&
    day >= 14 &&
    !reachedBefore(14) &&
    notImprovedAtAll(first, weekly)
  ) {
    refer = '2주가 지났는데 전혀 나아지지 않았어요. 진료를 받아보세요.';
  } else if (
    stallable &&
    first &&
    day >= 42 &&
    !reachedBefore(42) &&
    !weeklyImproved(first, weekly)
  ) {
    refer = '6주가 지났는데 뚜렷이 나아지지 않았어요. 진료를 받아보세요.';
  } else if (
    stallable &&
    prevs.length >= 3 &&
    !weeklyImproved(prevs[prevs.length - 3], weekly)
  ) {
    refer = '매주 확인 세 번 동안 나아지지 않았어요. 진료를 받아보세요.';
  }

  let stage = program.stage;
  let severity = program.severity;
  let stageShortenDays = program.stageShortenDays;
  let stageChanged = false;
  let eased = false;
  let shortened = false;
  const lines: string[] = refer ? [refer] : [];

  if (stepDown) {
    severity = raiseSeverity(program.severity);
    const raised = severity !== program.severity;
    if (program.stage > 1) {
      stage = (program.stage - 1) as RehabStage;
      stageChanged = true;
      stageShortenDays = 0;
      lines.push(
        `한 단계 내려가요(${stage}단계 ${REHAB_STAGES[stage].name}${raised ? `, 정도는 ${severityLabel(severity)}` : ''}).`
      );
    } else if (raised) {
      lines.push(
        `정도를 ${withJosa(severityLabel(severity), '으로/로')} 올려요. 1단계에 머물러요.`
      );
    }
  } else if (thisLower && program.stage > 1) {
    lines.push(
      `이번 주 가장 아팠던 정도가 ${RED_PAIN} 이상이에요. 한 칸 낮춘 운동으로 해요. 초록이 ${RETURN_GREENS}번 나오면 돌아가요.`
    );
  } else if (!thisLower && !refer) {
    if (calmStreak >= 2) {
      const lower = easeSeverity(program.severity, program.condition);
      if (lower !== program.severity) {
        severity = lower;
        eased = true;
        calmStreak = 0;
        lines.push(
          `통증 정도가 ${withJosa(severityLabel(lower), '으로/로')} 낮아졌어요. 남은 기간이 짧아져요.`
        );
      }
    }
    if (testStreak >= 2 && stage <= 3) {
      const base = STAGE_DAYS[severity][stage - 1];
      const target = Math.floor(base / 2);
      const needed = Math.min(
        6,
        cleanSessionsNeeded({
          severity,
          condition: program.condition,
          stage,
          stageShortenDays: 0,
        })
      );
      const run = cleanRun(sessions.filter(inStage));
      if (run >= needed && target > stageShortenDays) {
        stageShortenDays = target;
        shortened = true;
        lines.push(
          `이 단계 최소 기간을 ${stageMinDays({ severity, condition: program.condition, stage, stageShortenDays })}일로 줄였어요.`
        );
      }
    }
  }

  if (lines.length === 0) {
    const yellowThisWeek = sessions.some(
      (s) => within(s.date, 7) && s.result === 'yellow'
    );
    if (!prev) lines.push('첫 확인이에요. 다음 주부터 견줘요.');
    else if (weeklyImproved(prev, weekly) && !yellowThisWeek)
      lines.push('나아지고 있어요. 이대로 해요.');
    else lines.push('변화가 아직 작아요. 이 단계에 머물러요.');
  }

  return {
    record: {
      calmStreak,
      testStreak,
      eased,
      shortened,
      lowered: thisLower && !stepDown,
      steppedDown: stepDown && stageChanged,
      refer,
    },
    next: { stage, severity, stageShortenDays, stageChanged },
    lines,
  };
}

/** 끝에서부터 이어진 깨끗한(낮추지 않은 초록) 세션 수 */
function cleanRun(sessions: readonly RehabSessionLike[]): number {
  const sorted = [...sessions].sort((a, b) => (a.date < b.date ? -1 : 1));
  let run = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].result !== 'green' || sorted[i].lowered) break;
    run++;
  }
  return run;
}

/* ── 매주 확인 줄 읽기(DB 의 Json 은 믿지 않고 하나씩 본다) ── */

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function readPair(v: unknown): SidePair | null {
  if (!v || typeof v !== 'object') return null;
  const { injured, other } = v as Record<string, unknown>;
  return isNum(injured) && isNum(other) ? { injured, other } : null;
}

function readThrowing(v: unknown): ThrowingTestRecord | null {
  if (!v || typeof v !== 'object') return null;
  const t = v as Record<string, unknown>;
  const push = readPair(t.push);
  if (!push || !isNum(t.pain) || typeof t.on !== 'string') return null;
  return {
    pass: t.pass === true,
    push,
    drop: readPair(t.drop),
    wall: readPair(t.wall),
    pain: t.pain,
    on: t.on,
  };
}

function readOutcome(v: unknown): WeeklyOutcomeRecord | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  return {
    calmStreak: isNum(o.calmStreak) ? o.calmStreak : 0,
    testStreak: isNum(o.testStreak) ? o.testStreak : 0,
    eased: o.eased === true,
    shortened: o.shortened === true,
    lowered: o.lowered === true,
    steppedDown: o.steppedDown === true,
    refer: typeof o.refer === 'string' ? o.refer : null,
  };
}

/** 매주 확인의 test 칸(Json)을 읽는다 — 모르는 모양이면 null */
export function readRehabWeeklyTest(value: unknown): RehabWeeklyTest | null {
  if (!value || typeof value !== 'object') return null;
  const t = value as Record<string, unknown>;
  const kind =
    t.kind === 'rom' || t.kind === 'strength' || t.kind === 'throwing' ? t.kind : null;
  return {
    kind,
    pass: kind != null && t.pass === true,
    ...(typeof t.painFree === 'boolean' ? { painFree: t.painFree } : {}),
    ...(typeof t.similar === 'boolean' ? { similar: t.similar } : {}),
    ...(isNum(t.injured) ? { injured: t.injured } : {}),
    ...(isNum(t.other) ? { other: t.other } : {}),
    ...(isNum(t.pain) ? { pain: t.pain } : {}),
    ckc: isNum(t.ckc) ? t.ckc : null,
    throwing: readThrowing(t.throwing),
    outcome: readOutcome(t.outcome),
  };
}

/** 매주 확인 줄(DB)을 읽는다 */
export function readRehabWeekly(row: {
  date: string;
  stage: number;
  normalPct: number;
  worstPain: number;
  nightPain: boolean;
  activities: unknown;
  confidence: number;
  test: unknown;
}): RehabWeeklyLike {
  return {
    date: row.date,
    stage: row.stage,
    normalPct: row.normalPct,
    worstPain: row.worstPain,
    nightPain: row.nightPain,
    activities: Array.isArray(row.activities) ? row.activities.filter(isNum) : [],
    confidence: row.confidence,
    test: readRehabWeeklyTest(row.test),
  };
}

/** 이 재활의 팔굽혀 터치(CKCUEST) 첫 기록 — 가장 이른 확인의 test.ckc. 없으면 null */
export function firstCkcRecord(weeklies: readonly RehabWeeklyLike[]): number | null {
  const sorted = [...weeklies].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const w of sorted) {
    if (w.test?.ckc != null) return w.test.ckc;
  }
  return null;
}

/* ─────────────────────────────── 앱의 다른 곳 ─────────────────────────────── */

/**
 * 웨이트 · 투구 계획이 보는 재활(facts.condition.rehab) — DB 를 모르는 리포트 쪽이 이것만 받는다.
 * lib/report/facts.ts · plan.ts 는 이 파일을 값으로 읽지 않는다(투구 계획은 화면 부품에도 실려, 운동 목록까지 따라오지 않게).
 */
export type RehabFacts = {
  area: ArmcareAreaKey;
  /** 카드 제목과 같은 이름 — '팔꿈치 안쪽' · 'UCL 부분 손상' */
  label: string;
  stage: RehabStage;
  severity: RehabSeverity;
  joint: RehabJoint;
  /**
   * 투구 계획 대신 — 'light' 가벼운 캐치볼만(18m 안 · 25개 · 통증 2 이하) / 'none' 던지지 않기.
   * 가벼움만 캐치볼을 이어 간다(가이드라인 3절) — 팔꿈치 안쪽 · 뒤쪽은 첫 주 제외.
   */
  throwing: 'light' | 'none';
  /** 가벼움인데 팔꿈치 안쪽 · 뒤쪽이라 첫 주는 던지지 않는 중 */
  firstWeekNoThrow: boolean;
};

/** 가벼워도 첫 주는 던지지 않는 부위 — 인대 · 뼈일 수 있다(Wilk 2012) */
const FIRST_WEEK_NO_THROW: readonly ArmcareAreaKey[] = ['elbow-inner', 'elbow-back'];

export function rehabFacts(program: RehabProgramLike, todayKey: string): RehabFacts {
  const firstWeek =
    FIRST_WEEK_NO_THROW.includes(program.area) &&
    daysBetween(program.startedOn, todayKey) < 7;
  const light = program.severity === 'mild' && !firstWeek;
  return {
    area: program.area,
    label: rehabTitle(program.area, program.condition),
    stage: program.stage,
    severity: program.severity,
    joint: rehabJoint(program.area),
    throwing: light ? 'light' : 'none',
    firstWeekNoThrow: program.severity === 'mild' && firstWeek,
  };
}

/** DB 줄의 값을 읽는다 — 모르는 값이면 null(재활이 없는 것으로 본다) */
export function readRehabProgram(row: {
  area: string;
  condition: string | null;
  severity: string;
  stage: number;
  stageStartedOn: string;
  stageShortenDays: number;
  startedOn: string;
}): RehabProgramLike | null {
  if (!isRehabArea(row.area)) return null;
  if (!REHAB_SEVERITIES.some((s) => s.key === row.severity)) return null;
  const stage = Math.min(4, Math.max(1, Math.round(row.stage))) as RehabStage;
  const condition = isRehabCondition(row.condition) ? row.condition : null;
  return {
    area: row.area,
    condition:
      condition && REHAB_CONDITIONS[condition].area === row.area ? condition : null,
    severity: row.severity as RehabSeverity,
    stage,
    stageStartedOn: row.stageStartedOn,
    stageShortenDays: Math.max(0, row.stageShortenDays),
    startedOn: row.startedOn,
  };
}

/** 내 활동 두 개를 읽는다 — [{ label }] */
export function readRehabActivities(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (v && typeof v === 'object' ? (v as { label?: unknown }).label : null))
    .filter((l): l is string => typeof l === 'string' && l.trim() !== '')
    .slice(0, 2);
}

/** 폼에서 온 내 활동 — 두 개, 겹치지 않게, 한 줄 20자까지. 아니면 null */
export function normalizeRehabActivities(raw: readonly unknown[]): string[] | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const label = v.trim().replace(/\s+/g, ' ');
    if (!label || label.length > REHAB_ACTIVITY_MAX_LENGTH || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out.length === 2 ? out : null;
}
