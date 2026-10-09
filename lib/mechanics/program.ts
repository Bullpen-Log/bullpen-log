/**
 * 투구 메커니즘 향상 프로그램의 규칙 — 순수 계산. 시험: npm run mechanics:test
 *
 * 2026-10-04 사용자분이 바꾼 틀: 세션을 저절로 짜지 않는다. 사용자가 수준(입문 · 초급 · 중급 · 고급)을 골라, 그 수준의
 * 4주 · 주 3번 · 정해진 세션을 차례로 한다(lib/mechanics/levels.ts). 쉬움이 쌓여도 저절로 올리지 않고 권하기만 한다.
 * - 드릴마다 느낌을 누른다(어려움 · 적당 · 쉬움). 요소마다 '쉬움'을 넘긴 날 · '어려움'이 이어진 날을 센다 — 하루에 몇 번을
 *   눌러도 한 번(countFeel). 여섯 요소 중 넷이 서로 다른 날 '쉬움' 세 번이면 다음 수준을, 둘이 '어려움' 두 날이면 아래
 *   수준을 권한다(levelAdvice). 12세션을 다 마치면 다음 수준을 권한다.
 * - 진행(고른 수준 · 이 수준에서 마친 세션 수 · 요소별 느낌)은 MechanicsProgram.progress(Json) 한 칸에 둔다 — DB 구조는 그대로다.
 *   옛 줄(요소마다 stage · easy 를 둔 2026-10-04 아침 모양)은 수준을 안 고른 것으로 읽는다.
 * - 가진 장비로 할 수 있는 도구를 먼저 고르고, 정해진 드릴을 할 장비가 없으면 같은 요소 · 같은 단계의 할 수 있는 드릴로 바꿔
 *   넣고 알린다(맨몸 · 야구공은 누구나). 장비를 아직 안 고른 사람은 거르지 않는다.
 * - 안전 규칙(통증 · 세게 던진 다음 날)은 이 프로그램에 걸지 않는다(사용자분 결정).
 * - 여섯 번째 세션마다 찍어 처음과 견준 결과(좋아짐 · 비슷 · 못 견줌)를 progress.films 에 남긴다(2026-10-09 — 그 전에는
 *   찍으라고만 하고 결과를 안 받아 드릴이 효과가 있었는지 앱에 남는 것이 없었다). 수준을 바꿔도 지킨다(세션 번호에 붙는 것).
 */
import { DRILL_STAGE_NAMES } from '@/lib/exercise-meta';
import {
  MECHANICS_ELEMENTS,
  mechanicsElement,
  type MechanicsElementName,
} from '@/lib/mechanics/elements';
import { isLevelKey, levelSession, nextLevel, prevLevel, SESSIONS_PER_LEVEL, type LevelKey } from '@/lib/mechanics/levels';

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
};

export const FILM_VERDICTS: { value: FilmVerdict; label: string }[] = [
  { value: 'better', label: '좋아졌어요' },
  { value: 'same', label: '비슷해요' },
  { value: 'unsure', label: '아직 못 견줬어요' },
];

export function isFilmVerdict(value: unknown): value is FilmVerdict {
  return value === 'better' || value === 'same' || value === 'unsure';
}

/** MechanicsProgram.progress 에 두는 것 */
export type ProgramState = {
  /** 고른 수준 — 안 골랐으면 null */
  level: LevelKey | null;
  /** 이 수준에서 마친 세션 수(0~12) */
  index: number;
  feels: FeelCounts;
  /** 찍어서 견준 결과 — 세션 번호 순. 2026-10-09 앞에 쓴 줄에는 없다(빈 목록) */
  films: FilmNote[];
};

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
    by.set(session, { session, on, verdict: v.verdict });
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
export function readProgramState(json: unknown): ProgramState {
  const raw = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  if (raw.v !== 2) return freshState(null);
  const level = isLevelKey(raw.level) ? raw.level : null;
  return {
    level,
    index: level ? countOf(raw.index, SESSIONS_PER_LEVEL) : 0,
    feels: readFeels((raw.feels && typeof raw.feels === 'object' ? raw.feels : {}) as Record<string, unknown>),
    films: readFilms(raw.films),
  };
}

/** 진행 → DB 에 쓸 Json */
export function programStateJson(state: ProgramState) {
  return { v: 2, level: state.level, index: state.index, feels: state.feels, films: state.films };
}

/** 새로 시작하는 수준 — 세션 0, 느낌도 처음부터(다른 수준의 쉬움을 끌고 오지 않는다). 견준 결과는 부르는 쪽이 이어 붙인다 */
export function freshState(level: LevelKey | null): ProgramState {
  return { level, index: 0, feels: readFeels({}), films: [] };
}

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
  if (state.index >= SESSIONS_PER_LEVEL) return { kind: 'done', to: up?.key ?? null };
  if (easyCount >= EASY_ELEMENTS_TO_SUGGEST_UP && up) return { kind: 'up', to: up.key };
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

/** 이 도구에 모자란 장비 */
function missingGear(variant: { equipment?: string[] }, owned: ReadonlySet<string> | null): string[] {
  if (!owned) return [];
  return (variant.equipment ?? []).filter((e) => !ALWAYS_HAVE.has(e) && !owned.has(e));
}

/** 바꿔 할 수 있는 같은 요소 · 같은 단계의 다른 동작 — 따라 하기의 '다른 드릴' */
export type SessionSwap = { title: string; guideId: string; category: string; tool: string };

export type SessionItem = {
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
};

const MOVEMENT = '무브먼트 패턴 드릴';
const MEDBALL = '메디신볼 드릴';
const THROWING = '스로잉 드릴';

export type Dose = { sets: number; reps: number };

/**
 * 몇 번 · 얼마나 세게 — 드릴(MechanicsGuide)에는 세트 · 횟수가 없어서 트레드 애슬레틱스의 드릴 진행표를 따랐다
 * (Fixing a Late Arm, lib/mechanics/elements.ts [T7]): 드릴마다 2세트 × 8회, 처음 몇 번은 느린 동작으로 감을 잡고
 * 다시 익히기 50~60% → 이어 하기 60~70% → 전체 동작에 옮기기 60~75%. 드라이브라인도 드릴은 전력이 아니라 그날 정한
 * 세기로 한다([D9]). 그래서 단계가 올라도 횟수는 같고 세기와 하는 법만 바뀐다. 분류마다 따로 둔 칸은 나중에 두 곳의 근거가
 * 생기면 고치려고 남겨 둔다. 스로잉 드릴에도 공을 안 던지는 팔 동작이 있어 '구'가 아니라 '회'로 적는다.
 */
const TREAD_DOSE: Dose = { sets: 2, reps: 8 };
const DOSES: Record<string, Record<DrillStage, Dose>> = {
  [MOVEMENT]: { 기초: TREAD_DOSE, 연결: TREAD_DOSE, 통합: TREAD_DOSE },
  [MEDBALL]: { 기초: TREAD_DOSE, 연결: TREAD_DOSE, 통합: TREAD_DOSE },
  [THROWING]: { 기초: TREAD_DOSE, 연결: TREAD_DOSE, 통합: TREAD_DOSE },
};

/** 단계마다 어떻게 할지 — 따라 하기의 처방 밑 한 줄. 스로잉은 [T7] 의 세 걸음 */
export const STAGE_TEMPO: Record<DrillStage, string> = {
  기초: '처음 몇 번은 느린 동작으로 감을 잡고, 50~60% 힘으로 해요',
  연결: '60~70% 힘으로, 느리게 몇 번 한 뒤 속도를 올려요',
  통합: '60~75% 힘으로, 전체 동작에서도 같은 타이밍을 지켜요',
};

/**
 * 스로잉이 아닌 드릴의 한 줄 — 메디신볼은 트레드가 일 년 내내 넣고 거리 · 속도로 힘을 보는 운동이라 몸에 익으면 빠르게,
 * 무브먼트는 [T7] 처럼 느린 동작으로 감을 잡은 뒤 속도를 올린다. 드릴 자세 설명의 '세기'와 같은 말이다
 * (scripts/mechanics-descriptions-2026-10-04.mts).
 */
const CATEGORY_TEMPO: Record<string, string> = {
  [MEDBALL]: '처음 몇 번은 동작을 익히고, 몸에 익으면 빠르게 던져요',
  [MOVEMENT]: '처음에는 천천히 정확하게, 익숙해지면 속도를 올려요',
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

export const doseText = (d: Dose) => `${d.sets}세트 × ${d.reps}회`;

/** 세션 한 줄의 처방 칸 — dose · sets · tempo */
export function doseFields(category: string, stage: DrillStage) {
  const d = doseOf(category, stage);
  return { dose: doseText(d), sets: d.sets, tempo: CATEGORY_TEMPO[category] ?? STAGE_TEMPO[stage] };
}

const stageOf = (d: ProgramDrill): DrillStage =>
  (DRILL_STAGE_NAMES as readonly string[]).includes(d.stage ?? '') ? (d.stage as DrillStage) : '기초';

/** 이 요소가 주(main) · 보조(sub)인 동작 — 그 단계 것만 */
function candidates(drills: ProgramDrill[], element: MechanicsElementName, stage: DrillStage) {
  const main = drills.filter((d) => d.stage === stage && d.focusPoints[0] === element);
  const sub = drills.filter(
    (d) => d.stage === stage && d.focusPoints[0] !== element && d.focusPoints.includes(element)
  );
  return [main, sub];
}

/** 할 수 있는 도구 중 앞의 것 — 묶음의 도구는 실제 공에 가까운 것부터 놓여 있다(drills.ts TOOL_ORDER) */
function usableVariant(drill: ProgramDrill, owned: ReadonlySet<string> | null) {
  return drill.variants.find((v) => canUseVariant(v, owned)) ?? null;
}

/** 같은 요소 · 같은 단계에서 바꿔 할 수 있는 동작 — 주 요소인 것 먼저, 이 세션에 든 것은 빼고 */
function swapsFor(
  drills: ProgramDrill[],
  element: MechanicsElementName,
  stage: DrillStage,
  used: Set<string>,
  owned: ReadonlySet<string> | null
): SessionSwap[] {
  const out: SessionSwap[] = [];
  for (const pool of candidates(drills, element, stage)) {
    for (const d of pool) {
      if (used.has(d.title) || out.length >= 4) continue;
      const v = usableVariant(d, owned);
      if (v) out.push({ title: d.title, guideId: v.id, category: v.category, tool: v.tool });
    }
  }
  return out;
}

/**
 * 고른 수준의 index 번째 세션을 펼친다 — 정해진 드릴(levels.ts)마다 할 수 있는 도구를 고르고, 장비가 없어 못 하면 같은
 * 요소 · 같은 단계의 할 수 있는 드릴로 바꿔 넣는다(없으면 그대로 두고 알린다). 라이브러리에 없는 이름은 건너뛴다(시험이 막는다).
 * 12세션을 다 마쳤으면 빈 배열.
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
  const byTitle = new Map(drills.map((d) => [d.title, d] as const));
  const used = new Set(plan.titles);
  const picks: { drill: ProgramDrill; variant: ProgramDrill['variants'][number]; replaced: string | null; need: string[] }[] = [];

  for (const title of plan.titles) {
    const drill = byTitle.get(title);
    if (!drill) continue;
    const element = drill.focusPoints[0];
    const own = usableVariant(drill, owned);
    if (own) {
      picks.push({ drill, variant: own, replaced: null, need: [] });
      continue;
    }
    /* 이 드릴을 할 장비가 없다 — 같은 요소 · 같은 단계의 할 수 있는 드릴로 */
    const need = missingGear(drill.variants[0], owned);
    const alt = isElementName(element)
      ? candidates(drills, element, stageOf(drill))
          .flat()
          .find((d) => !used.has(d.title) && usableVariant(d, owned))
      : undefined;
    const altVariant = alt ? usableVariant(alt, owned) : null;
    if (alt && altVariant) {
      used.add(alt.title);
      picks.push({ drill: alt, variant: altVariant, replaced: drill.title, need });
    } else {
      picks.push({ drill, variant: drill.variants[0], replaced: null, need });
    }
  }

  return picks.flatMap(({ drill, variant, replaced, need }, i) => {
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
        cue: cues.length > 0 ? cues[(index + i) % cues.length] : '',
        gearNote: need.length > 0 ? { need: need.join(' · '), replaced } : null,
        swaps: swapsFor(drills, element, stage, used, owned),
      },
    ];
  });
}
