import { readMechanicsReview, reviewView, type MechanicsReview, type MechanicsReviewView } from '@/lib/mechanics/comparison';
/**
 * 메카닉 연습의 공통 규칙. 2026-10-25: 기존 드릴 구성을 유지한다.
 * 12회는 학습 순서이며 정해진 4주·주 3회·전력 투구 프로그램이 아니다.
 * 횟수는 실제 입력을 기록하고, 통증·현재 투구 계획을 서버에서도 확인한다.
 * 다른 동작을 같은 요소라는 이유만으로 대체하지 않는다.
 * 진도·수행·영상 비교는 기존 JSON 안에서 보존한다(DB 구조 변경 없음).
 */
import { REPORT_CRITERIA, LEGACY_FOCUS_NOTE } from '@/lib/pitch-3d/v2/report-policy';
import {
  readProgression,
  skillFinished,
  skillStage,
  skillView,
  SKILL_STAGES,
  type SkillProgression,
  type SkillFeedback,
  type SkillView,
} from '@/lib/mechanics/progression';
import type { SessionDrillView } from '@/lib/mechanics/load';
import {
  ARM_PAIN_ROUTINE_MIN_AGE,
  CHECKIN_PARTS,
  armPainJointsToday,
  type ArmPainJoint,
} from '@/lib/checkin';
import { DRILL_STAGE_NAMES } from '@/lib/exercise-meta';
import { josa } from '@/lib/korean';
import {
  MECHANICS_ELEMENTS,
  mechanicsElement,
  type MechanicsElementName,
} from '@/lib/mechanics/elements';
import { isLevelKey, levelSession, mechanicsLevel, nextLevel, prevLevel, SESSIONS_PER_LEVEL, type LevelKey } from '@/lib/mechanics/levels';
import type { ElementRx } from '@/lib/pitch-3d/v2/report';

export type DrillStage = (typeof DRILL_STAGE_NAMES)[number];
export type DrillFeel = 'hard' | 'ok' | 'easy';

/**
 * 요소 하나의 느낌 — easy: '쉬움'을 넘긴 날 수 · easyOn: 마지막으로 센 날(YYYY-MM-DD, 하루 한 번만 세려고)
 * hard: '어려움'이 이어진 날 수 · hardOn: 마지막으로 센 날.
 */
export type ElementFeel = { easy: number; easyOn: string | null; hard: number; hardOn: string | null };
export type FeelCounts = Record<MechanicsElementName, ElementFeel>;

/** 찍어서 처음과 견준 결과 */
export type FilmVerdict = 'better' | 'same' | 'unsure';
export type FilmNote = {
  /** 수준과 상관없는 세션 번호(MechanicsProgram.sessionsDone 기준) */
  session: number;
  /** 남긴 날 'YYYY-MM-DD' */
  on: string;
  verdict: FilmVerdict;
  level?: LevelKey | null;
  comparable?: boolean;
  transferred?: boolean;
  response?: 'clear' | 'pain' | 'unknown';
};

export const FILM_VERDICTS: { value: FilmVerdict; label: string }[] = [
  { value: 'better', label: '좋아졌어요' },
  { value: 'same', label: '비슷해요' },
  { value: 'unsure', label: '아직 못 견줬어요' },
];

export function isFilmVerdict(value: unknown): value is FilmVerdict {
  return value === 'better' || value === 'same' || value === 'unsure';
}

/**
 * 오늘 드릴로 던진 공을 투구 기록에 남겼나(2026-10-16 사용자: "기록에 바로 넣으면 투구 기록과 겹치니 카드로 알리고, 투구 기록하면 없어지게").
 * on: 그날 처음 스로잉 드릴을 한 날 · base: 그때 그날 투구 기록의 투구수 합 — 그 뒤 합이 늘면(새 기록 · 기존 기록에 더하기) 남긴 것으로 본다.
 * PitchLog 에 고친 시각이 없어 시각으로는 못 가린다. closed: '이미 넣었어요 · 안 적을래요'로 그날 닫음.
 */
export type ThrowLog = { on: string; base: number; closed: boolean };

/** MechanicsProgram.progress 에 두는 것 */
export type ProgramState = {
  focusHistory?: { focus: ProgramFocus; endedOn: string; reason: 'replaced' | 'closed' | 'reset' }[];
  /** 고른 수준 — 안 골랐으면 null */
  level: LevelKey | null;
  /** 이 수준에서 마친 세션 수(0~12) */
  index: number;
  feels: FeelCounts;
  /** 찍어서 견준 결과 — 세션 번호 순. 2026-10-09 앞에 쓴 줄에는 없다(빈 목록) */
  films: FilmNote[];
  /** 오늘 드릴로 던진 공의 기록 알림 — 2026-10-16 앞에 쓴 줄 · 스로잉 드릴을 안 한 날은 null */
  throwLog: ThrowLog | null;
  /** 3D 리포트 처방 — 진행 중이거나 마친 처방(새 처방 · 끝내기 전까지 남는다). 없으면 null */
  focus: ProgramFocus | null;
  /** 실제 수행량. 투구와 반복 횟수를 구분하고 날짜·드릴마다 합계를 저장한다. */
  practice?: PracticeRecord[];
  /** 시작 때의 배정과 이 세션에서 한 드릴. 날짜별 체크와 구분한다. */
  attempt?: MechanicsAttempt | null;
  gear?: { on: string; equipment: string[] };
  /**
   * 마친 세션의 완료 요약(2026-10-31 완료 화면 03) — attempt 는 다음 세션을 열면 바뀌고 practice 는 같은 날 다시 고치면 바뀐다. 지난 완료를
   * 다시 볼 때 그 둘로 거꾸로 셈하지 않고 마친 때 묶어 둔 이것만 읽는다. 최근 FINISHED_KEEP 개.
   */
  finishedRuns?: MechanicsFinishSummary[];
};

export type MechanicsAttempt = {
  id: string;
  requirementsVersion?: 1;
  on: string;
  session: number;
  planKey: string;
  items: SessionDrillView[];
  doneIds: string[];
  completed: boolean;
  /** slot: 그 기록이 들어간 배정 칸(item.guideId) — 응답을 잃은 저장을 다시 물을 때 그 칸의 기록을 돌려준다 */
  receipts?: { id: string; fingerprint: string; slot?: string }[];
  skillFeedback?: Record<string, SkillFeedback>;
  painGuideIds?: string[];
  /** 배정 칸마다 이 세션에서 저장한 기록(저장한 그대로) — 2026-10-31 앞에 연 세션에는 없다 */
  records?: Record<string, DrillRecordSnapshot>;
  /** 세션을 마친 때 묶은 요약 — 같은 마무리를 다시 보내도 이 값을 그대로 돌려준다 */
  summary?: MechanicsFinishSummary | null;
};

/**
 * 드릴 하나를 저장한 그대로(2026-10-31 실행 화면 02 · 완료 화면 03). count 는 오늘 이 드릴의 합계(서버 계약 그대로) — 세션에서 새로 한 양이 아니다.
 * 같은 칸을 다시 저장하면 바뀐다(마지막 저장). 처방(목표량)은 여기 넣지 않는다.
 */
export type DrillRecordSnapshot = {
  /** 실제로 한 동작 · 도구의 드릴 id */
  guideId: string;
  /** 배정 칸(item.guideId) */
  slot: string;
  title: string;
  tool: string;
  category: string;
  kind: 'throws' | 'repetitions';
  count: number;
  effortPct: number;
  response: 'clear' | 'pain';
  feel: DrillFeel;
  alreadyLogged: boolean;
  /** 3D 연계 칸이면 서버에 남긴 자가 확인(어려움이면 quality 가 no 로 바뀐 값) */
  skill?: SkillFeedback;
  on: string;
  savedAt: string;
};

export type MechanicsFinishProgress =
  | { kind: 'level'; level: LevelKey; before: number; after: number; total: number }
  | { kind: 'skill'; elements: { element: string; stage: DrillStage; finished: boolean }[] }
  | { kind: 'focus'; before: number; after: number; total: number };

/**
 * 세션 마무리의 요약(완료 화면 03) — 마친 그 순간의 배정 · 저장한 칸 · 기록 · 진도 · 권하기를 묶는다. 완료면 attempt.summary 와
 * finishedRuns 에 남고(다시 보내도 같은 값), 일부(partial)는 남기지 않고 그 응답에만 싣는다(같은 세션을 이어서 하니까).
 */
export type MechanicsFinishSummary = {
  v: 1;
  attemptId: string;
  session: number;
  on: string;
  finishedAt: string;
  status: 'completed' | 'partial';
  /** '입문 · 2번째 훈련' · '3D 연계 · 드리프트 · 기초' */
  label: string;
  kind: 'level' | 'linked' | 'focus';
  items: { slot: string; title: string; required: boolean; category: string }[];
  /** 저장한 칸(서버 doneIds 기준 — 기록 세부가 없는 옛 칸도 센다) */
  savedSlots: string[];
  /** 기록 세부 — 칸 차례. 2026-10-31 앞에 저장한 칸은 없을 수 있다(그때는 세부를 보이지 않는다) */
  records: DrillRecordSnapshot[];
  progress: MechanicsFinishProgress | null;
  message: string | null;
  advice: { kind: 'done' | 'up' | 'down'; to: LevelKey | null } | null;
  /** 이 세션을 마쳐 영상 비교 차례가 됐나 */
  film: 'compare' | null;
  /** 마친 때 아직 투구 기록에 안 남긴 드릴 공 — 다시 볼 때는 쓰지 않는다(그새 남겼을 수 있다) */
  throwNote: DrillThrowNote | null;
};

/** 남겨 둘 완료 요약 수 */
export const FINISHED_KEEP = 30;

function readFinishedRuns(raw: unknown): MechanicsFinishSummary[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (x): x is MechanicsFinishSummary =>
        !!x &&
        typeof x === 'object' &&
        (x as MechanicsFinishSummary).v === 1 &&
        typeof (x as MechanicsFinishSummary).attemptId === 'string' &&
        !!dayOf((x as MechanicsFinishSummary).on) &&
        Array.isArray((x as MechanicsFinishSummary).items) &&
        Array.isArray((x as MechanicsFinishSummary).savedSlots) &&
        Array.isArray((x as MechanicsFinishSummary).records)
    )
    .slice(-FINISHED_KEEP);
}

/** 배정 칸 하나가 저장됐나 — 칸의 어느 동작 · 도구로 했어도 */
export const slotDone = (item: { alternatives: { variants: { id: string }[] }[] }, doneIds: readonly string[]) =>
  item.alternatives.some((a) => a.variants.some((v) => doneIds.includes(v.id)));

/** 이 세션의 이름 — 완료 요약 · 실행 화면 머리. 3D 연계 처방 중이면 그 요소 · 단계, 아니면 수준 · 몇 번째 */
export function attemptLabel(state: ProgramState, today: string): { label: string; kind: MechanicsFinishSummary['kind'] } {
  return labelOf(state.focus ? focusView(state.focus, today) : null, state.level, state.index);
}

/** attemptLabel 의 화면 쪽 — 프로그램 칸 자료(MechanicsProgramView)로도 같은 이름을 짓는다(실행 화면 머리 · 첫 화면 카드) */
export function labelOf(
  fv: FocusView | null,
  level: LevelKey | null,
  index: number
): { label: string; kind: MechanicsFinishSummary['kind'] } {
  if (fv && !fv.finished) {
    if (fv.skill) {
      const el = fv.skill.elements.find((e) => !e.finished) ?? fv.skill.elements[0];
      return { kind: 'linked', label: `3D 연계 · ${el?.element ?? fv.rx[0]?.element ?? ''} · ${el?.stage ?? fv.stage ?? '기초'}` };
    }
    return { kind: 'focus', label: `3D 처방 · ${Math.min(fv.done + 1, fv.total)}/${fv.total}` };
  }
  return { kind: 'level', label: level ? `${mechanicsLevel(level).name} · ${Math.min(index + 1, SESSIONS_PER_LEVEL)}번째 훈련` : '메커니즘 훈련' };
}

/**
 * 마무리 요약을 묶는다(순수) — before 는 마치기 전 상태, after 는 마친 뒤(일부면 before 그대로). 기록 세부는 attempt.records 에 남은 것만.
 */
export function buildFinishSummary({
  attempt,
  before,
  after,
  status,
  today,
  finishedAt,
  message,
  throwNote,
}: {
  attempt: MechanicsAttempt;
  before: ProgramState;
  after: ProgramState;
  status: 'completed' | 'partial';
  today: string;
  finishedAt: string;
  message: string | null;
  throwNote: DrillThrowNote | null;
}): MechanicsFinishSummary {
  const { label, kind } = attemptLabel(before, today);
  const items = attempt.items.map((i) => ({ slot: i.guideId, title: i.title, required: i.required !== false, category: i.category }));
  const savedSlots = attempt.items.filter((i) => slotDone(i, attempt.doneIds)).map((i) => i.guideId);
  const records = savedSlots.flatMap((slot) => (attempt.records?.[slot] ? [attempt.records[slot]] : []));
  const fv = after.focus ? focusView(after.focus, today) : null;
  const progress: MechanicsFinishProgress | null =
    kind === 'linked' && fv?.skill
      ? { kind: 'skill', elements: fv.skill.elements.map((e) => ({ element: e.element, stage: e.stage, finished: e.finished })) }
      : kind === 'focus' && before.focus && after.focus
        ? { kind: 'focus', before: before.focus.done, after: after.focus.done, total: FOCUS_SESSIONS }
        : before.level
          ? { kind: 'level', level: before.level, before: before.index, after: after.index, total: SESSIONS_PER_LEVEL }
          : null;
  return {
    v: 1,
    attemptId: attempt.id,
    session: attempt.session,
    on: attempt.on,
    finishedAt,
    status,
    label,
    kind,
    items,
    savedSlots,
    records,
    progress,
    message,
    advice: status === 'completed' ? levelAdvice(after) : null,
    film: status === 'completed' && kind === 'level' && filmPrompt(attempt.session) === 'compare' ? 'compare' : null,
    throwNote,
  };
}

function readAttempt(value: unknown): MechanicsAttempt | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as MechanicsAttempt;
  if (
    typeof v.id !== 'string' ||
    !dayOf(v.on) ||
    !Number.isInteger(v.session) ||
    v.session < 1 ||
    typeof v.planKey !== 'string' ||
    typeof v.completed !== 'boolean' ||
    (v.receipts != null &&
      (!Array.isArray(v.receipts) || !v.receipts.every((r) => r && typeof r.id === 'string' && typeof r.fingerprint === 'string'))) ||
    (v.painGuideIds != null && (!Array.isArray(v.painGuideIds) || !v.painGuideIds.every((id) => typeof id === 'string'))) ||
    !Array.isArray(v.doneIds) ||
    !v.doneIds.every((id) => typeof id === 'string') ||
    !Array.isArray(v.items) ||
    !v.items.length ||
    !v.items.every(
      (i) =>
        i &&
        typeof i.guideId === 'string' &&
        i.variant &&
        Array.isArray(i.alternatives) &&
        i.alternatives.every((a) => a && Array.isArray(a.variants) && a.variants.every((x) => x && typeof x.id === 'string'))
    )
  )
    return null;
  return v;
}

export type PracticeRecord = {
  guideId: string;
  on: string;
  throws: number;
  /** 새 기록은 운동 단위를 명시한다. 옛 기록의 단위는 추정하지 않는다. */
  kind?: 'throws' | 'repetitions';
  reps?: number;
  effortPct: number;
  response: 'clear' | 'pain';
  alreadyLogged: boolean;
  recorded?: boolean;
};

export function practiceInput(value: unknown, category?: string): Omit<PracticeRecord, 'guideId' | 'on'> | null {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const repetitions = category !== undefined ? !isThrowingDrill(category) : v.kind === 'repetitions';
  // 이전 앱의 throws 필드도 비투구 운동에서는 반복 횟수로만 해석한다.
  const count = repetitions ? (v.reps ?? v.throws) : v.throws;
  if (
    typeof count !== 'number' ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > 1000 ||
    typeof v.effortPct !== 'number' ||
    !Number.isInteger(v.effortPct) ||
    v.effortPct < 0 ||
    v.effortPct > 100 ||
    (v.response !== 'clear' && v.response !== 'pain') ||
    typeof v.alreadyLogged !== 'boolean'
  )
    return null;
  return {
    throws: repetitions ? 0 : count,
    ...(repetitions ? { kind: 'repetitions' as const, reps: count } : category !== undefined || v.kind === 'throws' ? { kind: 'throws' as const } : {}),
    effortPct: v.effortPct,
    response: v.response,
    alreadyLogged: repetitions ? false : v.alreadyLogged,
  };
}

function readPractice(value: unknown): PracticeRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((x) => {
    const v = x as Record<string, unknown>;
    const input = practiceInput(v);
    return input && typeof v.guideId === 'string' && dayOf(v.on)
      ? [{ ...input, recorded: v.recorded === true, guideId: v.guideId, on: dayOf(v.on)! }] : [];
  });
}

/**
 * 3D 리포트 처방(docs/designs/pitch-3d-report.md 6-2 · 6-4절) — [처방 시작]을 누를 때 리포트의 처방 한 장들(ElementRx[])을 그대로 베낀다.
 * 메카닉은 리포트 파일을 다시 읽지 않는다. 리포트 번호는 지금 샘플 번호(리포트가 분석 결과로 셈해서 — 3D 세션).
 */
export type ProgramFocus = {
  review?: MechanicsReview;
  reviewHistory?: MechanicsReview[];
  reviewInvalid?: boolean;
  progression?: SkillProgression;
  progressionInvalid?: boolean;
  criteria?: string | null;
  reportId: string;
  /** 처방을 뽑은 분석 결과의 작업 번호 — 같은 샘플을 다시 분석하면 리포트가 바뀌어 견줄 때 쓴다 */
  jobId: string | null;
  /** 흐름 차례 · 많아야 두 장 — 첫 장이 주 문제 */
  rx: ElementRx[];
  startedOn: string;
  /** 마친 처방 연습 수. 이전 진행 방식만 9회 상한을 사용한다. */
  done: number;
};

/** 이전 저장 처방의 호환 상수. 새 진행 방식은 수행 조건으로 전환한다. */
export const FOCUS_WEEKS = 3;
export const FOCUS_SESSIONS = FOCUS_WEEKS * 3;

/** 다음 수준을 권하는 데 필요한 '쉬움' 날 수(요소마다) · 그런 요소 수 */
export const EASY_DAYS = 3;
export const EASY_ELEMENTS_TO_SUGGEST_UP = 4;
/** 아래 수준을 권하는 데 필요한 '어려움'이 이어진 날 수(요소마다) · 그런 요소 수 */
export const HARD_DAYS = 2;
export const HARD_ELEMENTS_TO_SUGGEST_DOWN = 2;

export const FEELS: { value: DrillFeel; label: string; hint: string }[] = [
  { value: 'hard', label: '어려움', hint: '자세가 자주 무너졌어요' },
  { value: 'ok', label: '적당', hint: '집중하면 돼요' },
  { value: 'easy', label: '쉬움', hint: '생각 안 해도 돼요' },
];

const ELEMENT_NAMES = MECHANICS_ELEMENTS.map((e) => e.name);

export function isElementName(value: unknown): value is MechanicsElementName {
  return typeof value === 'string' && (ELEMENT_NAMES as string[]).includes(value);
}

export function isFeel(value: unknown): value is DrillFeel {
  return value === 'hard' || value === 'ok' || value === 'easy';
}

const dayOf = (x: unknown) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null);
const countOf = (x: unknown, max = Infinity) =>
  typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(max, Math.floor(x))) : 0;

function readFeels(raw: Record<string, unknown>): FeelCounts {
  const out = {} as FeelCounts;
  for (const name of ELEMENT_NAMES) {
    const v = (raw[name] ?? {}) as Record<string, unknown>;
    out[name] = {
      easy: countOf(v.easy, EASY_DAYS),
      easyOn: dayOf(v.easyOn),
      hard: countOf(v.hard),
      hardOn: dayOf(v.hardOn),
    };
  }
  return out;
}

/** 견준 결과 목록 — 모양이 아닌 줄은 버리고, 세션 번호마다 하나(뒤에 쓴 것이 이긴다), 번호 순 */
function readFilms(raw: unknown): FilmNote[] {
  if (!Array.isArray(raw)) return [];
  const by = new Map<number, FilmNote>();
  for (const x of raw) {
    const v = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const session = countOf(v.session);
    const on = dayOf(v.on);
    if (session <= 0 || !on || !isFilmVerdict(v.verdict)) continue;
    by.set(session, { session, on, verdict: v.verdict,
      level: isLevelKey(v.level) ? v.level : null, comparable: v.comparable === true, transferred: v.transferred === true,
      response: v.response === 'clear' || v.response === 'pain' ? v.response : 'unknown' });
  }
  return [...by.values()].sort((a, b) => a.session - b.session);
}

/** 견준 결과 하나를 남긴다 — 같은 세션 번호면 바꾼다 */
export function withFilm(films: readonly FilmNote[], note: FilmNote): FilmNote[] {
  return [...films.filter((f) => f.session !== note.session), note].sort((a, b) => a.session - b.session);
}

/**
 * DB 의 progress(Json) → 진행. 지금 모양은 { v: 2, level, index, feels, films }. 옛 모양(요소 이름이 맨 위에 있고 stage 를 둔
 * 것)은 수준을 안 고른 것으로 읽는다 — 옛 '단계'는 새 수준과 뜻이 달라 옮기지 않는다. films 가 없는 줄은 빈 목록.
 */
function readThrowLog(raw: unknown): ThrowLog | null {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const on = dayOf(v.on);
  return on ? { on, base: countOf(v.base), closed: v.closed === true } : null;
}

const STAGES = new Set<string>(DRILL_STAGE_NAMES);
const str = (x: unknown) => (typeof x === 'string' ? x : null);

/** 베낀 처방 한 장 — 모양이 아니면 버린다(Json 이라 무엇이 들어 있을지 모른다) */
function readRx(x: unknown): ElementRx | null {
  const v = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const fault = str(v.fault);
  if (!isElementName(v.element) || !fault || (v.level !== 'improve' && v.level !== 'edge')) return null;
  const weeks = (Array.isArray(v.weeks) ? v.weeks : []).flatMap((w) => {
    const o = (w && typeof w === 'object' ? w : {}) as Record<string, unknown>;
    const week: 1 | 2 | 3 | null = o.week === 1 || o.week === 2 || o.week === 3 ? o.week : null;
    const stage = str(o.stage);
    if (!week || !stage || !STAGES.has(stage)) return [];
    const drills = (Array.isArray(o.drills) ? o.drills : []).flatMap((d) => {
      const t = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
      const title = str(t.title);
      return title ? [{ title, thumbUrl: str(t.thumbUrl), dose: str(t.dose) ?? '' }] : [];
    });
    return [{ week, label: str(o.label) ?? `${week}주`, stage: stage as DrillStage, drills }];
  });
  const t = (v.target && typeof v.target === 'object' ? v.target : null) as Record<string, unknown> | null;
  const label = str(t?.label);
  const now = str(t?.now);
  const goal = str(t?.goal);
  return {
    element: v.element,
    key: str(v.key) ?? '',
    fault: fault as ElementRx['fault'],
    level: v.level,
    slots: v.slots === 2 ? 2 : 1,
    cue: str(v.cue) ?? '',
    weeks,
    target: label && now && goal ? { label, now, goal } : null,
  };
}

function readFocus(raw: unknown): ProgramFocus | null {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const reportId = str(v.reportId);
  const startedOn = dayOf(v.startedOn);
  const rx = (Array.isArray(v.rx) ? v.rx : []).map(readRx).filter((r): r is ElementRx => r != null);
  if (!reportId || !startedOn || rx.length === 0) return null;
  return {
    reportId,
    jobId: str(v.jobId),
    ...(str(v.criteria) ? { criteria: str(v.criteria) } : {}),
    rx: rx.slice(0, 2),
    startedOn,
    done: countOf(v.done, v.progression ? Number.MAX_SAFE_INTEGER : FOCUS_SESSIONS),
    ...(Array.isArray(v.reviewHistory)
      ? { reviewHistory: v.reviewHistory.map(readMechanicsReview).filter((r): r is MechanicsReview => r !== null) }
      : {}),
    ...(v.review || v.reviewInvalid
      ? readMechanicsReview(v.review)
        ? { review: readMechanicsReview(v.review)! }
        : { reviewInvalid: true }
      : {}),
    ...(v.progression || v.progressionInvalid
      ? readProgression(v.progression, rx.slice(0, 2))
        ? { progression: readProgression(v.progression, rx.slice(0, 2))! }
        : { progressionInvalid: true }
      : {}),
  };
}

export function readProgramState(json: unknown): ProgramState {
  const raw = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  if (raw.v !== 2) return freshState(null);
  const level = isLevelKey(raw.level) ? raw.level : null;
  return {
    level,
    index: level ? countOf(raw.index, SESSIONS_PER_LEVEL) : 0,
    feels: readFeels((raw.feels && typeof raw.feels === 'object' ? raw.feels : {}) as Record<string, unknown>),
    films: readFilms(raw.films),
    throwLog: readThrowLog(raw.throwLog),
    focus: readFocus(raw.focus),
    focusHistory: Array.isArray(raw.focusHistory)
      ? raw.focusHistory.flatMap((v) => {
          if (!v || typeof v !== 'object') return [];
          const h = v as Record<string, unknown>,
            focus = readFocus(h.focus);
          return focus && dayOf(h.endedOn) && ['replaced', 'closed', 'reset'].includes(h.reason as string)
            ? [{ focus, endedOn: h.endedOn as string, reason: h.reason as 'replaced' | 'closed' | 'reset' }]
            : [];
        })
      : [],
    practice: readPractice(raw.practice),
    attempt: readAttempt(raw.attempt),
    finishedRuns: readFinishedRuns(raw.finishedRuns),
    ...(raw.gear &&
    typeof raw.gear === 'object' &&
    dayOf((raw.gear as Record<string, unknown>).on) &&
    Array.isArray((raw.gear as Record<string, unknown>).equipment)
      ? {
          gear: {
            on: dayOf((raw.gear as Record<string, unknown>).on)!,
            equipment: ((raw.gear as Record<string, unknown>).equipment as unknown[])
              .filter((e): e is string => typeof e === 'string')
              .slice(0, 50),
          },
        }
      : {}),
  };
}

/** 진행 → DB 에 쓸 Json */
export function programStateJson(state: ProgramState) {
  return {
    v: 2,
    level: state.level,
    index: state.index,
    feels: state.feels,
    films: state.films,
    throwLog: state.throwLog,
    focus: state.focus,
    focusHistory: state.focusHistory ?? [],
    practice: state.practice ?? [],
    attempt: state.attempt ?? null,
    finishedRuns: (state.finishedRuns ?? []).slice(-FINISHED_KEEP),
    ...(state.gear ? { gear: state.gear } : {}),
  };
}

/** 새로 시작하는 수준 — 세션 0, 느낌도 처음부터(다른 수준의 쉬움을 끌고 오지 않는다). 견준 결과 · 던진 공 알림 · 처방은 부르는 쪽이 이어 붙인다 */
export function freshState(level: LevelKey | null): ProgramState {
  return { level, index: 0, feels: readFeels({}), films: [], throwLog: null, focus: null };
}

/* ------------------------- 드릴로 던진 공 알림(2026-10-16) ------------------------- */

/** 스로잉 드릴인가 — 투구 기록에 남길 공은 이것만(메디신볼은 투구가 아니라 뺀다) */
export const isThrowingDrill = (category: string) => category === THROWING;

/** 처음 스로잉 드릴을 한 때 — 그날 처음이면 그때 투구수 합을 기억한다(이미 기억했으면 그대로) */
export function withThrowLog(state: ProgramState, todayKey: string, pitchedToday: number): ProgramState {
  if (state.throwLog?.on === todayKey) return state;
  return { ...state, throwLog: { on: todayKey, base: Math.max(0, Math.floor(pitchedToday)), closed: false } };
}

/**
 * 투구 기록 칸에 미리 채울 체감 강도 — 단계마다 하는 세기의 위쪽 끝(STAGE_TEMPO: 기초 50~60 · 연결 60~70 · 통합 60~75%).
 * 부하를 덜 세지 않게 위쪽으로 잡는다.
 */
export const DRILL_THROW_EFFORT: Record<DrillStage, number> = { 기초: 60, 연결: 70, 통합: 75 };

export type DrillThrowNote = {
  throws: number;
  effortPct: number;
  /** 투구 기록 화면 — 그날 기록 칸이 채워져 열린다(drillThrowHref) */
  href: string;
};

/**
 * 오늘 드릴로 던진 공을 투구 기록에 남기라고 알릴까 — 알릴 것이 없으면 null.
 * throws: 오늘 '했다'로 남은 스로잉 드릴마다 처방 세트 × 횟수(doseOf — 실제로 몇 번 던졌는지는 모른다, 어림).
 * 오늘 처음 스로잉 드릴을 한 뒤 투구 기록의 합이 늘었거나(남겼다) 닫았으면 null.
 */
export function drillThrowNote({
  throwLog,
  todayKey,
  practice = [],
}: {
  throwLog: ThrowLog | null;
  todayKey: string;
  /** 오늘 '했다'로 남은 드릴의 분류 · 단계 */
  doneToday: readonly { category: string; stage: string | null }[];
  /** 지금 오늘 투구 기록의 투구수 합 */
  pitchedToday: number;
  practice?: readonly PracticeRecord[];
}): DrillThrowNote | null {
  if (!throwLog || throwLog.on !== todayKey || throwLog.closed) return null;
  const records = practice.filter((p) => p.on === todayKey && p.kind !== 'repetitions' && !p.alreadyLogged && !p.recorded);
  const throws = records.reduce((sum, p) => sum + p.throws, 0);
  if (throws === 0) return null;
  const effortPct = Math.round(records.reduce((sum, p) => sum + p.throws * p.effortPct, 0) / throws);
  return { throws, effortPct, href: drillThrowHref(todayKey, throws, effortPct) };
}

/** 알림 글 — 해요체 · 줄표 없이 */
export const DRILL_THROW_TEXT = {
  line: (n: number) => `드릴에서 기록한 실제 투구 ${n}회`,
  record: '투구 기록에 남기기',
  done: '이미 넣었어요',
  skip: '안 적을래요',
  /** 투구 기록 칸에 미리 채울 메모 */
  memo: (n: number) => `메카닉 드릴 ${n}회`,
} as const;

/** 투구 기록 화면으로 — 그날 기록 칸이 캐치볼 · 투구수 · 체감 강도 · 메모로 채워져 열린다(app/(app)/pitch-log/[date]/load.ts) */
export const drillThrowHref = (todayKey: string, throws: number, effortPct: number) =>
  `/pitch-log/${todayKey}?drill=${throws}&pct=${effortPct}`;

/**
 * 느낌 하나를 센다(today = 'YYYY-MM-DD'). 저절로 수준을 바꾸지 않는다.
 * - 쉬움: 오늘 이미 셌으면 그대로, 아니면 하루 하나(세 날까지). '어려움' 줄은 끊긴다.
 * - 적당: 쉬움 수는 그대로, '어려움' 줄은 끊긴다.
 * - 어려움: 쉬움 수는 처음부터. '어려움' 줄은 하루 하나씩 는다.
 */
export function countFeel(
  feels: FeelCounts,
  element: MechanicsElementName,
  feel: DrillFeel,
  today: string
): FeelCounts {
  const cur = feels[element];
  let next: ElementFeel;
  if (feel === 'hard') {
    next = { easy: 0, easyOn: cur.easyOn, hard: cur.hardOn === today ? cur.hard : cur.hard + 1, hardOn: today };
  } else if (feel === 'ok' || cur.easyOn === today) {
    next = { ...cur, hard: 0, hardOn: null };
  } else {
    next = { easy: Math.min(cur.easy + 1, EASY_DAYS), easyOn: today, hard: 0, hardOn: null };
  }
  return { ...feels, [element]: next };
}

/**
 * 권하기 — 저절로 바꾸지 않고, 끝 화면 · 프로그램 칸이 단추와 함께 보여 준다.
 * done: 12세션을 다 마쳤다(다음 수준이 있으면 그것을 권하고, 고급이면 한 번 더) · up: 여섯 요소 중 넷이 서로 다른 날 '쉬움'
 * 세 번 · down: 둘이 '어려움' 두 날. 둘 다면 down 이 먼저다(무리하지 않게).
 */
export function levelAdvice(
  state: ProgramState
): { kind: 'done' | 'up' | 'down'; to: LevelKey | null } | null {
  if (!state.level) return null;
  const up = nextLevel(state.level);
  const down = prevLevel(state.level);
  const hardCount = ELEMENT_NAMES.filter((n) => state.feels[n].hard >= HARD_DAYS).length;
  const easyCount = ELEMENT_NAMES.filter((n) => state.feels[n].easy >= EASY_DAYS).length;
  if (hardCount >= HARD_ELEMENTS_TO_SUGGEST_DOWN && down) return { kind: 'down', to: down.key };
  if (state.index >= SESSIONS_PER_LEVEL) return { kind: 'done', to: null };
  const latest = state.films.at(-1);
  if (easyCount >= EASY_ELEMENTS_TO_SUGGEST_UP && up && latest?.verdict === 'better' && latest.level === state.level && latest.comparable === true && latest.transferred === true && latest.response === 'clear') return { kind: 'up', to: up.key };
  return null;
}

/* ------------------------------- 세션 펼치기 ------------------------------- */

/** 세션에 넣을 동작 — lib/mechanics/drills.ts 의 MechanicsDrillView 에서 필요한 것만 */
export type ProgramDrill = {
  title: string;
  focusPoints: string[];
  stage: string | null;
  /** equipment 가 없으면 맨몸으로 본다 */
  variants: { id: string; category: string; tool: string; equipment?: string[] }[];
};

/** 투수라면 누구나 가진 것 — 프로필 장비 목록에 없어도 된다 */
const ALWAYS_HAVE = new Set(['맨몸', '야구공']);

/** 이 도구로 할 수 있나 — owned 가 null 이면 장비를 아직 안 고른 사람이라 다 된다 */
export function canUseVariant(
  variant: { equipment?: string[] },
  owned: ReadonlySet<string> | null
): boolean {
  if (!owned) return true;
  return (variant.equipment ?? []).every((e) => ALWAYS_HAVE.has(e) || owned.has(e));
}

/** 바꿔 할 수 있는 같은 요소 · 같은 단계의 다른 동작 — 따라 하기의 '다른 드릴' */
export type SessionSwap = { title: string; guideId: string; category: string; tool: string };

export type SessionItem = {
  required?: boolean;
  skill?: { fault: string; stage: DrillStage; cue: string; requiresTransfer: boolean };
  element: MechanicsElementName;
  stage: DrillStage;
  title: string;
  /** 고른 도구의 드릴 id — '했다' · 느낌이 이 드릴에 남는다 */
  guideId: string;
  category: string;
  tool: string;
  /** 몇 번 할지 — 드릴에는 처방이 없어 분류 · 단계별 기본값(doseOf) */
  dose: string;
  /** 세트 수 — 따라 하기의 세트 세기 */
  sets: number;
  /** 이 단계에서 어떻게 할지 한 줄(STAGE_TEMPO) */
  tempo: string;
  /** 이 드릴을 할 때 떠올릴 느낌 신호 한 줄(lib/mechanics/elements.ts cues) */
  cue: string;
  /**
   * 장비 알림 — need: 있으면 되는 장비(예: '메디신볼'). replaced: 프로그램에 정해진 드릴(그 이름)을 할 장비가 없어 같은
   * 요소 · 같은 단계의 드릴로 바꿨을 때, 아니면 null(고른 드릴 자체에 장비가 모자랄 때 — 바꿀 드릴도 없던 자리)
   */
  gearNote: { need: string; replaced: string | null } | null;
  /** 같은 요소 · 같은 단계에서 할 수 있는 다른 동작(이 세션에 이미 든 것은 뺀다, 최대 4) */
  swaps: SessionSwap[];
  /** 3D 리포트 처방 칸이면 그 처방의 요소 · 집중(improve) | 보조(edge) — '처방' 꼬리표. 수준 프로그램 칸은 null */
  rx: { element: MechanicsElementName; level: 'improve' | 'edge' } | null;
};

const MOVEMENT = '무브먼트 패턴 드릴';
const MEDBALL = '메디신볼 드릴';
const THROWING = '스로잉 드릴';
const STRENGTH = '근력 · 안정 드릴';

export type Dose = { sets: number; reps: number };

/** 분류 이름만으로 운동량을 처방하지 않는다. reps=0은 횟수를 정하지 않았다는 뜻이다.
 * 특정 팔 타이밍 드릴의 예시는 itemsFromTitles에서 별도로 표시한다.
 */
const MEDBALL_DOSE: Dose = { sets: 1, reps: 0 };
const THROWING_DOSE: Dose = { sets: 1, reps: 0 };
const MOVEMENT_DOSE: Dose = { sets: 1, reps: 0 };
const DOSES: Record<string, Record<DrillStage, Dose>> = {
  [MOVEMENT]: { 기초: MOVEMENT_DOSE, 연결: MOVEMENT_DOSE, 통합: MOVEMENT_DOSE },
  [MEDBALL]: { 기초: MEDBALL_DOSE, 연결: MEDBALL_DOSE, 통합: MEDBALL_DOSE },
  [THROWING]: { 기초: THROWING_DOSE, 연결: THROWING_DOSE, 통합: THROWING_DOSE },
  /* 근력 · 안정은 무브먼트와 같은 양 — 버티는 드릴은 '회'를 '초'로 읽게 설명에 적혀 있다 */
  [STRENGTH]: { 기초: MOVEMENT_DOSE, 연결: MOVEMENT_DOSE, 통합: MOVEMENT_DOSE },
};

/** 단계마다 어떻게 할지 — 따라 하기의 처방 밑 한 줄. 스로잉은 [T7] 의 세 걸음 */
export const STAGE_TEMPO: Record<DrillStage, string> = {
  기초: '천천히 감을 잡고, 오늘 투구 계획 안에서 낮거나 중간인 세기로 해요',
  연결: '리듬을 연결하되, 난이도가 올라도 오늘 정한 세기는 유지해요',
  통합: '전체 동작에서도 타이밍을 지켜요. 전력으로 던지는 프로그램은 아니에요',
};

/**
 * 스로잉이 아닌 드릴의 한 줄 — 메디신볼은 트레드가 일 년 내내 넣고 거리 · 속도로 힘을 보는 운동이라 몸에 익으면 빠르게,
 * 무브먼트는 [T7] 처럼 느린 동작으로 감을 잡은 뒤 속도를 올린다. 드릴 자세 설명의 '세기'와 같은 말이다
 * (scripts/mechanics-descriptions-2026-10-04.mts).
 */
const CATEGORY_TEMPO: Record<string, string> = {
  [MEDBALL]: '처음 몇 번은 동작을 익히고, 몸에 익으면 빠르게 던져요',
  [MOVEMENT]: '처음에는 천천히 정확하게, 익숙해지면 속도를 올려요',
  [STRENGTH]: '자세를 정확히 잡고, 버티는 동안 흔들리지 않게 해요',
};

/** 이만큼 세션마다 영상을 찍어 처음과 견주게 한다(2분할 비교) */
export const FILM_EVERY = 6;

/**
 * 영상으로 확인할 때인가 — 첫 세션 전에는 처음 모습을 찍어 두고(baseline), {FILM_EVERY}번째 세션을 마칠 때마다 다시 찍어
 * 처음 영상과 나란히 견준다(compare). 느낌과 실제 동작은 자주 달라서, 드릴만 하고 확인하지 않으면 무엇이 바뀌었는지
 * 모른다(2026-10-04 검토). sessionsDone 은 수준과 상관없이 지금까지 마친 세션 수다.
 */
export function filmPrompt(sessionsDone: number): 'baseline' | 'compare' | null {
  const n = Math.max(0, Math.floor(sessionsDone));
  if (n === 0) return 'baseline';
  return n % FILM_EVERY === 0 ? 'compare' : null;
}

/** 분류 · 단계별 몇 번 — 따라 하기에서 도구를 바꾸면 그 분류의 것으로 */
export function doseOf(category: string, stage: DrillStage): Dose {
  return (DOSES[category] ?? DOSES[MOVEMENT])[stage];
}

export const doseText = (d: Dose) => (d.reps > 0 ? `${d.sets}세트 × ${d.reps}회` : '오늘 투구 계획 안에서 짧게 연습');

/** 세션 한 줄의 처방 칸 — dose · sets · tempo */
export function doseFields(category: string, stage: DrillStage) {
  const d = doseOf(category, stage);
  return { dose: doseText(d), sets: d.sets, tempo: CATEGORY_TEMPO[category] ?? STAGE_TEMPO[stage] };
}

const stageOf = (d: ProgramDrill): DrillStage =>
  (DRILL_STAGE_NAMES as readonly string[]).includes(d.stage ?? '') ? (d.stage as DrillStage) : '기초';

/** 할 수 있는 도구 중 앞의 것 — 묶음의 도구는 실제 공에 가까운 것부터 놓여 있다(drills.ts TOOL_ORDER) */
function usableVariant(drill: ProgramDrill, owned: ReadonlySet<string> | null) {
  return drill.variants.find((v) => canUseVariant(v, owned)) ?? null;
}

/** 처방 칸 꼬리표 — 드릴 이름마다(처방 칸이 아니면 없음) */
type RxTag = { element: MechanicsElementName; level: 'improve' | 'edge'; cue: string };

/**
 * 이름이 같은 동작 묶음 안에서 사용할 도구만 고른다. 누락된 필수 이름·장비는 assessMechanicsSession이 별도로 보고한다.
 * 처방 칸(tags)은 처방 꼬리표와 동작 신호를 단다.
 */
function itemsFromTitles({
  drills,
  titles,
  index,
  owned,
  tags = new Map(),
}: {
  drills: ProgramDrill[];
  titles: string[];
  index: number;
  owned: ReadonlySet<string> | null;
  tags?: ReadonlyMap<string, RxTag>;
}): SessionItem[] {
  const byTitle = new Map(drills.map((d) => [d.title, d] as const));
  const picks: {
    drill: ProgramDrill;
    variant: ProgramDrill['variants'][number];
    replaced: string | null;
    need: string[];
    tag: RxTag | null;
  }[] = [];

  for (const title of titles) {
    const drill = byTitle.get(title);
    if (!drill) continue;
    const tag = tags.get(title) ?? null;
    const own = usableVariant(drill, owned);
    if (own) {
      picks.push({ drill, variant: own, replaced: null, need: [], tag });
      continue;
    }
    /*
     * 이 드릴을 할 장비가 없다 — 같은 주 요소 · 같은 단계의 할 수 있는 드릴로. 보조로만 그 요소를 쓰는 드릴은 넣지 않는다 — 주 요소가 달라져
     * 세션의 투구 차례(하체 → 상체)가 깨지고 그 요소가 빠졌다(2026-10-16, 맨몸 · 야구공만인 고급 9 · 12번째). 없으면 그대로 두고 알린다.
     */
    // 필요한 장비가 없으면 이 칸을 건너뛴다. 같은 요소만으로 다른 동작을 대신하지 않는다.
    continue;
  }

  return picks.flatMap(({ drill, variant, replaced, need, tag }, i) => {
    const element = drill.focusPoints[0];
    if (!isElementName(element)) return [];
    const stage = stageOf(drill);
    const cues = mechanicsElement(element)?.cues ?? [];
    return [
      {
        element,
        stage,
        title: drill.title,
        guideId: variant.id,
        category: variant.category,
        tool: variant.tool,
        ...doseFields(variant.category, stage),
        // 특정 팔 타이밍 예시 밖으로 횟수를 일반화하지 않는다.
        dose: ['텐 토즈 스로우', '8자 리듬 로커'].includes(drill.title) ? '예시 2세트 × 8회 · 오늘 투구량 안에서 조절' : drill.title === '워킹 와인드업' ? '예시 1세트 × 8회 · 오늘 투구량 안에서 조절' : '오늘 투구 계획에 맞춰 짧게 연습',
        sets: ['텐 토즈 스로우', '8자 리듬 로커'].includes(drill.title) ? 2 : 1,
        cue: tag?.cue || (cues.length > 0 ? cues[(index + i) % cues.length] : ''),
        gearNote: need.length > 0 ? { need: need.join(' · '), replaced } : null,
        swaps: [],
        rx: tag ? { element: tag.element, level: tag.level } : null,
      },
    ];
  });
}

/**
 * 고른 수준의 index 번째 세션을 펼친다 — 정해진 드릴(levels.ts)을 itemsFromTitles 로. 12세션을 다 마쳤으면 빈 배열.
 */
export function buildLevelSession({
  drills,
  level,
  index,
  owned = null,
}: {
  drills: ProgramDrill[];
  level: LevelKey;
  index: number;
  /** 가진 장비 — null 이면 거르지 않는다(아직 안 고른 사람) */
  owned?: ReadonlySet<string> | null;
}): SessionItem[] {
  const plan = levelSession(level, index);
  if (!plan) return [];
  return itemsFromTitles({ drills, titles: plan.titles, index, owned });
}

/* ------------------------- 3D 리포트 처방(6-2 · 6-4절) ------------------------- */

/** 새 방식은 요소별 자가 확인 완료까지, 이전 방식은 저장된 9회 기준을 유지한다. */
export const focusActive = (focus: ProgramFocus | null): focus is ProgramFocus =>
  focus != null &&
  (focus.progressionInvalid === true || (focus.progression ? !skillFinished(focus.progression) : focus.done < FOCUS_SESSIONS));

/** 처방 몇 주차인가(1~3) — 마친 세션 수로 */
export const focusWeek = (done: number) => Math.min(FOCUS_WEEKS, Math.floor(Math.max(0, done) / 3) + 1);

/** 그 주에 할 처방 단계 — 경계 처방은 '1주 연결 · 2~3주 통합'이라 3주차는 2주차 칸을 쓴다(주차가 그보다 작거나 같은 마지막 칸) */
export function rxWeek(rx: ElementRx, week: number): ElementRx['weeks'][number] | null {
  return (
    [...rx.weeks]
      .sort((a, b) => a.week - b.week)
      .filter((w) => w.week <= week)
      .at(-1) ?? null
  );
}

/**
 * 처방 세션의 드릴 이름 — 6-2절 세션 틀. 지금 수준 세션(base)의 칸 수는 그대로(입문 · 초급 셋, 중급 · 고급 넷), 드릴 칸만 바꾼다:
 *   ① 주 문제 처방(고칠 점 2칸 · 경계 1칸) ② 다음 문제 처방 1칸 ③ 통합 — 두 요소를 같이 쓰는 통합 드릴(없으면 주 문제의 통합 드릴).
 *   칸이 모자라면 앞 차례가 먼저, 남으면 지금 수준 드릴로 채우고, 투구 차례(여섯 요소 차례)로 다시 놓는다.
 * 처방 드릴 이름은 리포트가 넘긴 것 그대로(lib/mechanics/prescriptions.ts 로 리포트가 고른 것) — 라이브러리에 없으면 itemsFromTitles 가 건너뛴다.
 */
export function focusPlan({
  rx,
  done,
  base,
  drills,
  criteria,
}: {
  rx: ElementRx[];
  done: number;
  base: string[];
  drills: ProgramDrill[];
  criteria?: string | null;
}): {
  titles: string[];
  tags: Map<string, RxTag>;
} {
  const week = focusWeek(done);
  const slots = Math.max(1, base.length);
  const picks: { title: string; tag: RxTag }[] = [];
  const add = (title: string | undefined, r: ElementRx) => {
    if (!title || !drills.some((d) => d.title === title) || picks.some((p) => p.title === title) || picks.length >= slots) return;
    picks.push({ title, tag: { element: r.element, level: r.level, cue: r.cue } });
  };
  const [main, next] = rx;
  if (main) for (const d of (rxWeek(main, week)?.drills ?? []).slice(0, main.slots)) add(d.title, main);
  if (next) {
    const w = rxWeek(next, week);
    add(w?.drills.find((d) => !picks.some((p) => p.title === d.title))?.title, next);
  }
  if (main && (criteria !== REPORT_CRITERIA || rxWeek(main, week)?.stage === '통합')) {
    const both = drills.find(
      (d) =>
        d.stage === '통합' &&
        d.focusPoints.includes(main.element) &&
        (!next || d.focusPoints.includes(next.element)) &&
        !picks.some((p) => p.title === d.title)
    );
    const own = main.weeks.find((w) => w.stage === '통합')?.drills.find((d) => !picks.some((p) => p.title === d.title));
    add(next ? (both?.title ?? own?.title) : own?.title, main);
  }
  const tags = new Map(picks.map((p) => [p.title, p.tag] as const));
  const stageOrder = ['기초', '연결', '통합'];
  const allowedStage = (title: string) => {
    if (criteria !== REPORT_CRITERIA) return true;
    const drill = drills.find((d) => d.title === title);
    return !rx.some(
      (r) =>
        drill?.focusPoints.includes(r.element) &&
        stageOrder.indexOf(drill.stage ?? '') > stageOrder.indexOf(rxWeek(r, week)?.stage ?? '기초')
    );
  };
  const titles = [...picks.map((p) => p.title), ...base.filter((t) => !tags.has(t) && allowedStage(t))].slice(0, slots);
  const order = (t: string) => {
    const el = tags.get(t)?.element ?? drills.find((d) => d.title === t)?.focusPoints[0];
    const i = ELEMENT_NAMES.indexOf(el as MechanicsElementName);
    return i < 0 ? ELEMENT_NAMES.length : i;
  };
  return {
    titles: titles
      .map((t, i) => ({ t, i }))
      .sort((a, b) => order(a.t) - order(b.t) || a.i - b.i)
      .map((x) => x.t),
    tags,
  };
}

/** 프로그램 칸 · 앱이 그리는 처방 요약(처방 카드 · 머리 '처방 4/9' · 요소 탭 점) */
/** 처방 요소의 몫 이름 — 웹 · 앱 칩이 같이 쓴다 */
export const RX_LEVEL_TEXT = { improve: '집중', edge: '보조' } as const;
/** 요소 탭의 '내 리포트' 칸 — 리포트의 판정 말 */
export const RX_REPORT_TEXT = { improve: '고칠 점', edge: '경계' } as const;

export type FocusView = {
  runId: string;
  review: MechanicsReviewView | null;
  reviewHistory: MechanicsReviewView[];
  reviewInvalid: boolean;
  skill: SkillView | null;
  canConvert: boolean;
  criteriaNote: string | null;
  reportId: string;
  startedOn: string;
  /** 마친 처방 세션 수 · 모두 몇 번 */
  done: number;
  total: number;
  finished: boolean;
  /** 다음 세션의 주차 · 주 문제의 그 주 단계 */
  week: number;
  stage: DrillStage | null;
  /** 요소 칩 — 흐름 차례 · 집중(improve) | 보조(edge) */
  rx: { element: MechanicsElementName; key: string; level: 'improve' | 'edge'; fault: string; target: ElementRx['target'] }[];
  /** 주 문제의 느낌 신호 · 다음 재기에서 볼 숫자 */
  cue: string;
  target: ElementRx['target'];
};

export function focusView(focus: ProgramFocus, today?: string): FocusView {
  const main = focus.rx[0];
  const active = focus.progression
    ? (focus.rx.find((r) => !focus.progression!.elements.find((e) => e.fault === r.fault)?.finished) ?? main)
    : main;
  const week = focus.progression ? SKILL_STAGES.indexOf(skillStage(focus.progression, active.fault)) + 1 : focusWeek(focus.done);
  return {
    reportId: focus.reportId,
    runId: focusRunId(focus),
    review: focus.review ? reviewView(focus.review) : null,
    reviewHistory: (focus.reviewHistory ?? []).map(reviewView),
    reviewInvalid: !!focus.reviewInvalid,
    skill: focus.progression ? skillView(focus.progression, focus.rx, today) : null,
    canConvert: !focus.progression && !focus.progressionInvalid && focus.criteria === REPORT_CRITERIA,
    criteriaNote: focus.criteria === REPORT_CRITERIA ? null : LEGACY_FOCUS_NOTE,
    startedOn: focus.startedOn,
    done: focus.progression ? focus.done : Math.min(focus.done, FOCUS_SESSIONS),
    total: FOCUS_SESSIONS,
    finished: focus.progressionInvalid ? false : focus.progression ? skillFinished(focus.progression) : focus.done >= FOCUS_SESSIONS,
    week,
    stage: focus.progression ? skillStage(focus.progression, active.fault) : (rxWeek(main, week)?.stage ?? null),
    rx: focus.rx.map((r) => ({ element: r.element, key: r.key, level: r.level, fault: r.fault, target: r.target })),
    cue: main.cue,
    target: main.target,
  };
}

/**
 * 오늘의 세션 — 처방 중이면 지금 수준 세션의 드릴 칸을 처방으로 바꾼 것, 아니면 수준 세션 그대로.
 * 수준 12세션을 다 마친 뒤에도 처방이 남았으면 마지막 세션을 틀로 쓴다.
 */
export function buildProgramSession({
  drills,
  state,
  owned = null,
}: {
  drills: ProgramDrill[];
  state: Pick<ProgramState, 'level' | 'index' | 'focus'>;
  owned?: ReadonlySet<string> | null;
}): SessionItem[] {
  if (!state.level) return [];
  if (state.focus?.progression && !skillFinished(state.focus.progression)) return assessMechanicsSession({ drills, state, owned }).items;
  if (state.focus?.progressionInvalid) return [];
  if (!focusActive(state.focus)) return buildLevelSession({ drills, level: state.level, index: state.index, owned });
  const index = Math.min(state.index, SESSIONS_PER_LEVEL - 1);
  const base = levelSession(state.level, index)?.titles ?? [];
  const { titles, tags } = focusPlan({ rx: state.focus.rx, done: state.focus.done, base, drills, criteria: state.focus.criteria });
  return itemsFromTitles({ drills, titles, index, owned, tags });
}

export type MissingRequirement = { title: string; need: string[]; reason: 'library' | 'gear' | 'recipe' };
export function assessMechanicsSession({
  drills,
  state,
  owned,
}: {
  drills: ProgramDrill[];
  state: Pick<ProgramState, 'level' | 'index' | 'focus'>;
  owned: ReadonlySet<string> | null;
}): { items: SessionItem[]; missing: MissingRequirement[] } {
  const missing: MissingRequirement[] = [];
  const items: SessionItem[] = [];
  if (!state.level || state.focus?.progressionInvalid) return { items, missing: [{ title: '진행 정보 확인', need: [], reason: 'recipe' }] };
  if (!focusActive(state.focus) && state.index >= SESSIONS_PER_LEVEL) return { items, missing };
  const index = Math.min(state.index, SESSIONS_PER_LEVEL - 1);
  const base = levelSession(state.level, index)?.titles ?? [];
  const focus = state.focus;
  if (focus?.progression && !skillFinished(focus.progression)) {
    for (const r of focus.rx) {
      const el = focus.progression.elements.find((e) => e.fault === r.fault)!;
      if (el.finished) continue;
      const titles =
        r.weeks
          .find((w) => w.stage === el.stage)
          ?.drills.slice(0, r.slots)
          .map((d) => d.title) ?? [];
      if (titles.length < r.slots) missing.push({ title: `${r.element} ${el.stage} 필수 드릴`, need: [], reason: 'recipe' });
      for (const title of titles) {
        const drill = drills.find((d) => d.title === title && d.stage === el.stage);
        if (!drill) {
          missing.push({ title, need: [], reason: 'library' });
          continue;
        }
        const found = itemsFromTitles({
          drills,
          titles: [title],
          index,
          owned,
          tags: new Map([[title, { element: r.element, level: r.level, cue: r.cue }]]),
        })[0];
        if (!found) {
          missing.push({
            title,
            need: [...new Set(drill.variants.flatMap((v) => v.equipment ?? []))].filter((e) => !ALWAYS_HAVE.has(e) && !owned?.has(e)),
            reason: 'gear',
          });
          continue;
        }
        if (items.some((i) => i.guideId === found.guideId && i.skill?.fault !== r.fault)) {
          missing.push({ title, need: [], reason: 'recipe' });
          continue;
        }
        items.push({
          ...found,
          required: true,
          skill: { fault: r.fault, stage: el.stage, cue: r.cue, requiresTransfer: el.stage !== '기초' },
        });
      }
    }
    for (const title of base) {
      if (items.length >= Math.max(base.length, 3) || items.some((i) => i.title === title)) continue;
      const d = drills.find((d) => d.title === title);
      if (
        focus.rx.some(
          (r) =>
            d?.focusPoints.includes(r.element) &&
            SKILL_STAGES.indexOf(d.stage as DrillStage) > SKILL_STAGES.indexOf(skillStage(focus.progression!, r.fault))
        )
      )
        continue;
      const item = itemsFromTitles({ drills, titles: [title], index, owned })[0];
      if (item) items.push({ ...item, required: false });
    }
    return { items, missing };
  }
  // 일반 세션·이전 처방도 장비 때문에 빠진 필수 칸을 조용히 완료로 넘기지 않는다.
  const titles = focusActive(focus) ? focusPlan({ rx: focus.rx, done: focus.done, base, drills, criteria: focus.criteria }).titles : base;
  const original = buildProgramSession({ drills, state, owned });
  for (const title of titles) {
    const d = drills.find((d) => d.title === title);
    const item = original.find((i) => i.title === title);
    if (!d) missing.push({ title, need: [], reason: 'library' });
    else if (!item)
      missing.push({
        title,
        need: [...new Set(d.variants.flatMap((v) => v.equipment ?? []))].filter((e) => !ALWAYS_HAVE.has(e) && !owned?.has(e)),
        reason: 'gear',
      });
    else items.push({ ...item, required: true });
  }
  return { items, missing };
}

/* -------------------------- 팔이 아픈 날 접기(D5) -------------------------- */

/**
 * 팔에 싣는 드릴인가 — 고른 도구의 분류(MechanicsGuide.category)가 무브먼트 패턴 · 근력 · 안정 드릴이 아니면 다 그렇다고 본다.
 * 스로잉 드릴은 공을 던지고, 메디신볼 드릴은 공을 던지거나 내리친다. 분류 이름은 DB 글자라 모르는 분류(새 분류 · 오타)가
 * 오면 접는 쪽이 안전하다. 이름(P1~P5)이나 동작 묶음으로 가르지 않는다 — 한 묶음에 스로잉 · 메디신볼 도구가 섞여 있다
 * (운영 DB 98묶음 중 11). 메카닉 화면 · 따라 하기 · 시험이 모두 이 하나를 쓴다.
 */
export function isArmLoaded(category: string): boolean {
  return category !== MOVEMENT && category !== STRENGTH;
}

/**
 * 왜 접나(2판 P6 검토) — pain 오늘 어깨 · 팔꿈치 '통증'(D5) · armSpent 오늘 팔을 다 쓴 날(오늘 등판 · 경기 기록 · 세게 던진 날, 중재의 등판 보호 층) ·
 * painUnknown 최근 통증인데 오늘 체크인이 없음(중재의 안전 층). 판정은 lib/mechanics/fold.ts mechanicsFoldOf 한 곳.
 */
export type MechanicsFoldCause = 'pain' | 'armSpent' | 'painUnknown';

/** 오늘 팔에 싣는 드릴을 접는 날 — 접을 것이 없으면 null(mechanicsPainFold · mechanicsFoldOf) */
export type MechanicsPainFold = {
  /** 오늘 '통증'인 팔 관절 — 어깨 → 팔꿈치(통증 날만, 그 밖은 빈 목록) */
  joints: ArmPainJoint[];
  /** '어깨' · '팔꿈치' · '어깨 · 팔꿈치'(통증 날만, 그 밖은 빈 글) */
  label: string;
  /** 접은 까닭 한 줄 — 프로그램 칸 카드 */
  reason: string;
  because: MechanicsFoldCause;
  /**
   * '펼치기 → 그래도 하기'를 내는가 — 성인의 통증 날(D5)만. 팔을 다 쓴 날 · 통증 확인 전 · 성장기(만 16세 미만, ARM_PAIN_ROUTINE_MIN_AGE)의 통증
   * 날은 못 펼친다(따라 하기도 ?anyway=1 을 무시한다).
   */
  canUnfold: boolean;
  /** 트레이닝 홈 한 줄의 까닭 머리말 — '어깨 통증으로' · '등판이라' · '체크인 전이라'(MECHANICS_FOLD_TEXT.homeOpen) */
  cause: string;
};

/** 접는 날 화면 글 — 해요체 · 줄표 없이(시험이 본다). label 은 MechanicsPainFold.label */
export const MECHANICS_FOLD_TEXT = {
  reason: (label: string) => `오늘 ${label}${josa(label, '이/가')} 아파 던지기 · 메디신볼 드릴은 접었어요. 그래도 하려면 펼쳐요.`,
  /** 펼친 뒤(그래도 하기) 카드 · 따라 하기 위 한 줄 */
  anyway: (label: string) => `오늘 ${label}${josa(label, '이/가')} 아픈 날이에요. 아프면 바로 멈춰요.`,
  /** 따라 하기에서 팔에 싣는 드릴을 볼 때 */
  loadedDrill: (label: string) =>
    `오늘 ${label}${josa(label, '이/가')} 아픈 날이에요. 팔에 힘이 실리는 드릴이라 아프면 바로 멈추고 건너뛰어요.`,
  /** 펼친 카드의 팔에 싣는 드릴 줄 밑 */
  loadedTag: '팔에 힘이 실리는 드릴이에요.',
  /** 세 드릴이 다 접힌 날 — 시작 단추 대신 */
  /* 2판 P6 검토 — 통증 말고도(등판 날 · 체크인 전) 접어서 '아프지 않은 날'이 아니라 '다른 날'로 */
  allFolded: '오늘은 던지기 드릴을 쉬어요. 다른 날 이어서 해요.',
  /** 접힌 날 할 수 있는 드릴을 다 한 뒤 */
  openDone: '오늘 할 수 있는 드릴은 마쳤어요. 던지기 드릴은 다른 날 이어서 해요.',
  /** 무브먼트만 하고 마친 따라 하기 끝 화면 */
  partialFinish: '오늘은 안 던지는 드릴만 했어요. 이 세션은 다른 날 이어서 해요.',
  /**
   * 트레이닝 홈 카드 한 줄(다른 카드 줄처럼 마침표 없이). cause 는 MechanicsPainFold.cause('어깨 통증으로' · '등판이라' …) — 2판 P6 검토부터
   * 통증 말고도 접어서 까닭 머리말을 받는다.
   */
  homeOpen: (cause: string, n: number) => `오늘은 ${cause} 안 던지는 드릴 ${n}개만 해요`,
  /** 성장기(만 16세 미만)의 통증 날 — 펼치지 못하고 진료를 권한다(lib/checkin.ts ARM_PAIN_ROUTINE_MIN_AGE 와 같은 뜻) */
  youthReason: (label: string) => `오늘 ${label}${josa(label, '이/가')} 아파 던지기 · 메디신볼 드릴은 쉬어요. 진료가 먼저예요.`,
  /** 최근 통증인데 오늘 체크인이 없는 날(중재의 안전 층) — 홈 한 줄 머리말은 lib/mechanics/fold.ts MECHANICS_UNKNOWN_CAUSE */
  painUnknown: '최근 아팠던 곳이 있어요. 체크인을 남기기 전엔 던지기 드릴을 쉬어요.',
  homeAllFolded: '오늘은 던지기 드릴을 쉬어요',
  homeOpenDone: '오늘 할 수 있는 드릴은 마쳤어요',
} as const;

/** 단추 글 — 프로그램 칸 */
export const MECHANICS_FOLD_BUTTONS = {
  unfold: '펼치기',
  refold: '다시 접기',
  openOnly: '안 던지는 드릴만 하기',
  anyway: '그래도 하기',
} as const;

/**
 * 오늘 통증으로 접는가 — 오늘 체크인에서 어깨 · 팔꿈치가 '통증'인 날만(사용자 결정 D5). 뻐근 · 손목 · 허리 · 하체 통증 ·
 * 체크인 없음은 null(접지 않음). 판정은 lib/checkin.ts armPainJointsToday 한 곳 — 오늘 상태 한 장의 arm.painJoints 와
 * 같은 함수라 같은 체크인이면 같은 답이다(training:test 가 본다). 화면은 이것 하나가 아니라 lib/mechanics/fold.ts mechanicsFoldOf 를 쓴다 —
 * 그 위 두 층(팔을 다 쓴 날 · 통증 확인 전, 2판 P6 검토)이 먼저고, 아니면 이 함수의 답이다.
 */
export function mechanicsPainFold(
  checkin: { shoulder?: string | null; elbow?: string | null } | null | undefined,
  { age = null }: { age?: number | null } = {}
): MechanicsPainFold | null {
  const joints = armPainJointsToday(checkin);
  if (joints.length === 0) return null;
  const label = joints
    .map((j) => CHECKIN_PARTS.find((p) => p.key === j)?.label ?? j)
    .join(' · ');
  /*
   * 성장기는 못 펼친다(2판 P6 검토 · 가정 — 사용자 확인 전). D5 는 '그래도 하기'를 남기라고 했지만 성장기 예외는 정하지 않았다. 앱은 만 16세 밑의
   * 팔 통증을 성장판 부상이 섞일 수 있어 운동으로 다루지 않고 진료를 권한다(ARM_PAIN_ROUTINE_MIN_AGE — 통증 루틴 · 재활 프로그램을 안 연다).
   * 조이는 쪽이라 그 선을 따른다. 나이를 모르면 성인으로 본다(다른 나이 규칙과 같다).
   */
  const youth = age != null && age < ARM_PAIN_ROUTINE_MIN_AGE;
  return {
    joints,
    label,
    reason: youth
      ? MECHANICS_FOLD_TEXT.youthReason(label)
      : `${label} 통증이 있어 던지기 드릴은 쉬어요. 통증이 이어지면 진료를 받아보세요.`,
    because: 'pain',
    canUnfold: false,
    cause: `${label} 통증으로`,
  };
}

/** 세션 드릴을 접을 것 · 할 것으로 — 차례는 그대로. 접는 날이 아니면 다 open */
export function foldSession<T extends { category: string }>(
  items: readonly T[],
  fold: MechanicsPainFold | null
): { open: T[]; folded: T[] } {
  if (!fold) return { open: [...items], folded: [] };
  return {
    open: items.filter((x) => !isArmLoaded(x.category)),
    folded: items.filter((x) => isArmLoaded(x.category)),
  };
}

/**
 * 접은 날 따라 하기의 '다른 드릴' · 도구 칩에서 팔에 싣는 것을 뺀다 — 안 빼면 무브먼트 드릴 자리에서 '다른 드릴'을 눌러
 * 스로잉 · 메디신볼로 바꿔 할 수 있었다(2판 P6 비판). 동작마다 도구를 거르고, 도구가 다 빠진 동작은 뺀다. 처음 고를
 * 도구(guideId)가 빠졌으면 남은 첫 도구로.
 */
export function unloadedAlternatives<V extends { id: string; category: string }, A extends { guideId: string; variants: V[] }>(
  alternatives: readonly A[]
): A[] {
  return alternatives.flatMap((a) => {
    const variants = a.variants.filter((v) => !isArmLoaded(v.category));
    if (variants.length === 0) return [];
    const guideId = variants.some((v) => v.id === a.guideId) ? a.guideId : variants[0].id;
    return [{ ...a, variants, guideId }];
  });
}

/**
 * 따라 하기에 넘길 드릴 — 접는 날(펼치지 않음)은 무브먼트 드릴만, 그 바꾸기 목록도 무브먼트만. partial 은 접은 드릴이
 * 있었나 — 그러면 마쳐도 세션 수를 안 올린다(finishState). 펼친 날(anyway) · 접지 않는 날은 세션 그대로.
 */
export function playItemsFor<
  V extends { id: string; category: string },
  T extends { category: string; alternatives: { guideId: string; variants: V[] }[] },
>(
  items: readonly T[],
  fold: MechanicsPainFold | null,
  anyway: boolean
): { items: T[]; folded: number; partial: boolean } {
  if (!fold || (anyway && fold.canUnfold)) return { items: [...items], folded: 0, partial: false };
  const { open, folded } = foldSession(items, fold);
  return {
    items: open.map((it) => ({
      ...it,
      alternatives: unloadedAlternatives(it.alternatives),
    })),
    folded: folded.length,
    partial: folded.length > 0,
  };
}

/** 따라 하기를 어디서 시작하나 — 오늘 아직 안 한 첫 드릴, 다 했으면 처음(오늘 이미 마친 세션이면 done 을 비워 부른다) */
export function resumeAt(
  items: readonly { guideId: string }[],
  done: ReadonlySet<string>
): number {
  const first = items.findIndex((s) => !done.has(s.guideId));
  return first < 0 ? 0 : first;
}

/**
 * 세션을 마친 뒤의 진행 — 접은 드릴이 남은 채 마쳤으면(partial) 그대로 둔다: 던지기 · 메디신볼 드릴이 든 이 세션은
 * 아프지 않은 날 다시 한다(세션 수를 올리면 그 드릴들을 영영 건너뛴다). 아니면 다음 세션(12에서 멈춤).
 */
export function finishState(state: ProgramState, partial: boolean): ProgramState {
  if (partial) return state;
  return {
    ...state,
    index: Math.min(state.index + 1, SESSIONS_PER_LEVEL),
    /* 처방 중이면 처방 세션도 하나 — 수준 칸과 같은 세션이라 둘 다 오른다 */
    focus: focusActive(state.focus) ? { ...state.focus, done: state.focus.done + 1 } : state.focus,
  };
}

/** 이전 진행에는 실행 id가 없어 저장된 시작 기준으로 늦은 요청을 구분한다. */
export const focusRunId = (focus: ProgramFocus) =>
  focus.progression?.id ?? focus.review?.id ?? `${focus.reportId}:${focus.jobId ?? 'legacy'}:${focus.startedOn}`;
export function archiveFocus(state: ProgramState, reason: 'replaced' | 'closed' | 'reset', on: string) {
  return state.focus ? [...(state.focusHistory ?? []), { focus: state.focus, endedOn: on, reason }] : (state.focusHistory ?? []);
}
