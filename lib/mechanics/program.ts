/**
 * 투구 메커니즘 향상 프로그램의 규칙 — 순수 계산(2026-10-04). 시험: npm run mechanics:test
 *
 * 사용자분과 정한 틀:
 * - 요소 여섯마다 지금 단계(기초 → 연결 → 통합)가 있다. 처음엔 모두 기초.
 * - 한 번(세션)에 드릴 3~4개, 15~20분 — 무브먼트 1 · 메디신볼 1~2 · 스로잉 1. 투구 차례대로(하체 → 팔) 한다.
 *   여섯 요소를 세 묶음(하체: 드리프트 · 드롭 / 가운데: 상하체 분리 · 브레이크 / 상체: 몸통 회전 · 스로잉)으로 보고, 세션마다
 *   묶음에서 하나씩 뽑아 사슬을 잇는다(2026-10-04 검토 — 예전엔 앞 셋 · 뒤 셋을 번갈아, 한 번은 하체만 · 한 번은 팔만 했다).
 * - 드릴마다 느낌을 누른다(어려움 · 적당 · 쉬움). 같은 요소를 '쉬움'으로 서로 다른 날 세 번 넘기면 그 요소가 다음 단계로
 *   오른다 — 하루에 몇 번을 눌러도 한 번(다른 날에도 쉬워야 몸에 붙었다고 본다. 예전엔 하루 두 세션이면 그날 올랐다).
 *   '어려움'이면 세던 것을 처음부터. 올라간 단계에서 '어려움'이 서로 다른 날 두 번 이어지면 한 단계 내려갈지 묻는다.
 * - 강조 요소를 하나 고르면 그 요소는 세션마다 들어가고 드릴도 둘이다(그 묶음의 짝은 쉬고, 다른 두 묶음에서 하나씩).
 *   안 고르면 여섯을 고르게 돌린다(네 번이면 모두 두 번씩).
 * - 가진 장비로 할 수 있는 도구 · 드릴을 먼저 고른다(맨몸 · 야구공은 누구나). 지금 단계에 할 수 있는 드릴이 없으면 한 단계
 *   아래에서 고르고 무엇이 있으면 되는지 알린다. 장비를 아직 안 고른 사람은 거르지 않는다(2026-10-04 검토).
 * - 안전 규칙(통증 · 세게 던진 다음 날)은 이 프로그램에 걸지 않는다(사용자분 결정).
 */
import { DRILL_STAGE_NAMES } from '@/lib/exercise-meta';
import {
  MECHANICS_ELEMENTS,
  mechanicsElement,
  type MechanicsElementName,
} from '@/lib/mechanics/elements';

export type DrillStage = (typeof DRILL_STAGE_NAMES)[number];
/**
 * 요소 하나의 진행 — easy: 지금 단계에서 '쉬움'을 넘긴 날 수 · easyOn: 마지막으로 센 날(YYYY-MM-DD, 하루 한 번만 세려고)
 * hard: '어려움'이 이어진 날 수 · hardOn: 마지막으로 센 날. 옛 줄(stage · easy 만)도 그대로 읽는다.
 */
export type ElementProgress = {
  stage: DrillStage;
  easy: number;
  easyOn: string | null;
  hard: number;
  hardOn: string | null;
};
export type ProgramProgress = Record<MechanicsElementName, ElementProgress>;
export type DrillFeel = 'hard' | 'ok' | 'easy';

/** 다음 단계로 오르는 데 필요한 '쉬움' 날 수 */
export const EASY_TO_ADVANCE = 3;
/** 이만큼 '어려움'이 이어지면(서로 다른 날) 한 단계 내려갈지 묻는다 */
export const HARD_TO_STEP_DOWN = 2;

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

/** DB 의 progress(Json) → 여섯 요소 모두. 모르는 값 · 빠진 요소는 기초 · 0 */
export function readProgress(json: unknown): ProgramProgress {
  const raw = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const out = {} as ProgramProgress;
  for (const name of ELEMENT_NAMES) {
    const v = (raw[name] ?? {}) as {
      stage?: unknown;
      easy?: unknown;
      easyOn?: unknown;
      hard?: unknown;
      hardOn?: unknown;
    };
    const stage = (DRILL_STAGE_NAMES as readonly string[]).includes(v.stage as string)
      ? (v.stage as DrillStage)
      : '기초';
    const easy =
      typeof v.easy === 'number' && Number.isFinite(v.easy)
        ? Math.max(0, Math.min(EASY_TO_ADVANCE, Math.floor(v.easy)))
        : 0;
    const hard =
      typeof v.hard === 'number' && Number.isFinite(v.hard) ? Math.max(0, Math.floor(v.hard)) : 0;
    const day = (x: unknown) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null);
    out[name] = { stage, easy, easyOn: day(v.easyOn), hard, hardOn: day(v.hardOn) };
  }
  return out;
}

export function freshProgress(): ProgramProgress {
  return readProgress({});
}

/** 맨 위 단계(통합)를 '쉬움'으로 세 번 넘겼는가 — 그 요소는 다 익혔다 */
export function isMastered(p: ElementProgress): boolean {
  return p.stage === '통합' && p.easy >= EASY_TO_ADVANCE;
}

/**
 * 느낌 하나를 반영한다(today = 'YYYY-MM-DD'). 오른 단계가 있으면 leveled, 내려갈지 물을 때면 struggling 을 돌려준다
 * (따라 하기 끝 화면이 알린다). 통합에서는 더 오를 곳이 없어 '쉬움'을 세 번까지만 센다(다 익힘).
 *
 * - 쉬움: 오늘 이미 셌으면 그대로(강조 요소는 한 세션에 두 번 나온다), 아니면 하루 하나. '어려움' 줄은 끊긴다.
 * - 적당: 쉬움 수는 그대로, '어려움' 줄은 끊긴다.
 * - 어려움: 쉬움 수는 처음부터. '어려움' 줄은 하루 하나씩 늘고, 기초보다 위에서 두 날이 이어지면 struggling.
 */
export function applyFeel(
  progress: ProgramProgress,
  element: MechanicsElementName,
  feel: DrillFeel,
  today: string
): { progress: ProgramProgress; leveled: DrillStage | null; struggling: boolean } {
  const cur = progress[element];
  let next: ElementProgress = cur;
  let leveled: DrillStage | null = null;
  const i = DRILL_STAGE_NAMES.indexOf(cur.stage);
  if (feel === 'hard') {
    const hard = cur.hardOn === today ? cur.hard : cur.hard + 1;
    next = { ...cur, easy: 0, hard, hardOn: today };
  } else if (feel === 'ok') {
    next = { ...cur, hard: 0, hardOn: null };
  } else if (cur.easyOn === today) {
    next = { ...cur, hard: 0, hardOn: null };
  } else {
    const easy = cur.easy + 1;
    if (easy >= EASY_TO_ADVANCE && i < DRILL_STAGE_NAMES.length - 1) {
      leveled = DRILL_STAGE_NAMES[i + 1];
      /* 오른 날에는 새 단계의 쉬움을 세지 않는다 — 하루에 두 단계를 오르지 않게 */
      next = { stage: leveled, easy: 0, easyOn: today, hard: 0, hardOn: null };
    } else {
      next = { ...cur, easy: Math.min(easy, EASY_TO_ADVANCE), easyOn: today, hard: 0, hardOn: null };
    }
  }
  const struggling = feel === 'hard' && i > 0 && next.hard >= HARD_TO_STEP_DOWN;
  return { progress: { ...progress, [element]: next }, leveled, struggling };
}

/** 한 단계 내려간다(따라 하기 끝 화면의 '내려가기') — 기초면 그대로 */
export function stepDown(
  progress: ProgramProgress,
  element: MechanicsElementName
): ProgramProgress {
  const i = DRILL_STAGE_NAMES.indexOf(progress[element].stage);
  if (i <= 0) return progress;
  return {
    ...progress,
    [element]: { stage: DRILL_STAGE_NAMES[i - 1], easy: 0, easyOn: null, hard: 0, hardOn: null },
  };
}

/* ------------------------------- 세션 짜기 ------------------------------- */

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
   * 장비 알림 — need: 있으면 되는 장비(예: '메디신볼'). lowered: 지금 단계(그 값)에 할 수 있는 드릴이 없어 한 단계 아래로
   * 골랐을 때, 아니면 null(고른 드릴 자체에 장비가 모자랄 때 — 어느 단계에도 할 수 있는 것이 없던 요소)
   */
  gearNote: { need: string; lowered: DrillStage | null } | null;
  /** 같은 요소 · 같은 단계에서 할 수 있는 다른 동작(이 세션에 이미 든 것은 뺀다, 최대 4) */
  swaps: SessionSwap[];
};

const MOVEMENT = '무브먼트 패턴 드릴';
const MEDBALL = '메디신볼 드릴';
const THROWING = '스로잉 드릴';

export type Dose = { sets: number; reps: number };

/**
 * 몇 번 할지 — 드릴(MechanicsGuide)에는 세트 · 횟수가 없어서 분류 · 단계별로 정했다. 기술을 익히는 드릴이라 적게, 매번 바르게.
 * 무브먼트는 자세를 천천히, 메디신볼은 힘껏 적게, 스로잉은 조금 더. 단계가 오를수록 횟수는 줄고 힘은 실린다 — 기초는
 * 천천히 여러 번 자세를 맞추고, 통합은 실제 투구처럼 힘껏 적게(2026-10-04 검토 — 예전엔 단계와 상관없이 같았다).
 * 세션 하나(드릴 3~4개)가 15~20분 안에 들게 맞췄다. 스로잉 드릴에도 공을 안 던지는 팔 동작(암 패스 · 90/90 월 드리블)이
 * 있어 '구'가 아니라 '회'로 적는다.
 */
const DOSES: Record<string, Record<DrillStage, Dose>> = {
  [MOVEMENT]: { 기초: { sets: 2, reps: 8 }, 연결: { sets: 2, reps: 6 }, 통합: { sets: 2, reps: 5 } },
  [MEDBALL]: { 기초: { sets: 2, reps: 6 }, 연결: { sets: 3, reps: 5 }, 통합: { sets: 3, reps: 4 } },
  [THROWING]: { 기초: { sets: 2, reps: 10 }, 연결: { sets: 2, reps: 8 }, 통합: { sets: 3, reps: 5 } },
};

/** 단계마다 어떻게 할지 — 따라 하기의 처방 밑 한 줄 */
export const STAGE_TEMPO: Record<DrillStage, string> = {
  기초: '천천히 — 끝 자세에서 1초 멈춰 자세를 확인해요',
  연결: '두 동작을 끊지 말고 한 번에 이어요',
  통합: '실제로 던지듯 힘껏 — 세트 사이에 1분쯤 쉬어요',
};

/** 이만큼 세션마다 영상을 찍어 처음과 견주게 한다(2분할 비교) */
export const FILM_EVERY = 6;

/**
 * 영상으로 확인할 때인가 — 첫 세션 전에는 처음 모습을 찍어 두고(baseline), {FILM_EVERY}번째 세션을 마칠 때마다 다시 찍어
 * 처음 영상과 나란히 견준다(compare). 느낌과 실제 동작은 자주 달라서, 드릴만 하고 확인하지 않으면 무엇이 바뀌었는지
 * 모른다(2026-10-04 검토).
 */
export function filmPrompt(sessionsDone: number): 'baseline' | 'compare' | null {
  const n = Math.max(0, Math.floor(sessionsDone));
  if (n === 0) return 'baseline';
  return n % FILM_EVERY === 0 ? 'compare' : null;
}

/** 투구의 세 묶음 — 하체(드리프트 · 드롭) · 가운데(상하체 분리 · 브레이크) · 상체(몸통 회전 · 스로잉) */
const CHAIN: MechanicsElementName[][] = [
  ELEMENT_NAMES.slice(0, 2),
  ELEMENT_NAMES.slice(2, 4),
  ELEMENT_NAMES.slice(4, 6),
];

/**
 * 이번 세션에 넣을 요소 — 세 묶음에서 하나씩, 투구 차례대로(하체 → 가운데 → 상체).
 *
 * 강조가 없으면 묶음마다 짝을 번갈아 고르되 묶음끼리 박자를 어긋나게 한다 — 네 번이면 여섯 요소가 모두 두 번씩, 조합도
 * 매번 다르다. 강조가 있으면 그 묶음 자리는 강조 요소(드릴 둘 — buildSession), 다른 두 묶음은 번갈아.
 */
export function sessionElements(
  focus: MechanicsElementName | null,
  sessionsDone: number
): MechanicsElementName[] {
  const n = Math.max(0, Math.floor(sessionsDone));
  const turn = [n % 2, Math.floor(n / 2) % 2, (n + Math.floor(n / 2)) % 2];
  return CHAIN.map((group, g) => {
    if (focus && group.includes(focus)) return focus;
    return group[focus ? (n + g) % 2 : turn[g]];
  });
}

/** 세션의 자리마다 바라는 분류 — 첫 자리는 몸을 여는 무브먼트, 끝은 실제로 던지는 스로잉, 가운데는 메디신볼 */
function preferredCategory(index: number, count: number): string {
  if (index === 0) return MOVEMENT;
  if (index === count - 1) return THROWING;
  return MEDBALL;
}

/**
 * 오늘의 세션 — 요소마다 지금 단계의 드릴 하나(강조 요소는 둘).
 *
 * 고르는 차례: 그 요소가 주 요소이고 지금 단계인 동작 중 바라는 분류가 있는 것 → 분류가 없으면 아무 분류 → 그래도
 * 없으면 보조로 그 요소를 쓰는 동작 → 한 단계 아래. 같은 동작은 한 세션에 한 번만. 후보 안에서는 마친 세션 수로 돌려
 * 매번 같은 드릴만 나오지 않게 한다.
 *
 * owned(가진 장비)를 주면 그 장비로 할 수 있는 도구가 하나라도 있는 동작만 후보로 삼고, 도구도 할 수 있는 것으로 고른다.
 * 어느 단계에도 할 수 있는 것이 없으면 장비를 보지 않고 고른다(요소가 통째로 빠지는 것보다 낫다 — 따라 하기에서 도구를
 * 바꿀 수 있다).
 */
export function buildSession({
  drills,
  progress,
  focus,
  sessionsDone,
  owned = null,
}: {
  drills: ProgramDrill[];
  progress: ProgramProgress;
  focus: MechanicsElementName | null;
  sessionsDone: number;
  /** 가진 장비 — null 이면 거르지 않는다(아직 안 고른 사람) */
  owned?: ReadonlySet<string> | null;
}): SessionItem[] {
  const n = Math.max(0, Math.floor(sessionsDone));
  const slots: MechanicsElementName[] = [];
  for (const name of sessionElements(focus, n)) {
    slots.push(name);
    if (name === focus) slots.push(name);
  }

  const used = new Set<string>();
  const picks: { element: MechanicsElementName; pick: Pick; index: number }[] = [];
  slots.forEach((element, index) => {
    const stage = progress[element].stage;
    const want = preferredCategory(index, slots.length);
    const pick =
      pickDrill(drills, element, stage, want, used, n + index, owned) ??
      pickDrill(drills, element, stage, want, used, n + index, null);
    if (!pick) return;
    used.add(pick.drill.title);
    picks.push({ element, pick, index });
  });

  return picks.map(({ element, pick, index }) => {
    const cues = mechanicsElement(element)?.cues ?? [];
    const stage = progress[element].stage;
    return {
      element,
      stage: pick.stage,
      title: pick.drill.title,
      guideId: pick.variant.id,
      category: pick.variant.category,
      tool: pick.variant.tool,
      ...doseFields(pick.variant.category, pick.stage),
      cue: cues.length > 0 ? cues[(n + index) % cues.length] : '',
      gearNote: gearNoteOf(drills, element, stage, pick, owned),
      swaps: swapsFor(drills, element, pick.stage, used, owned, preferredCategory(index, slots.length)),
    };
  });
}

/** 분류 · 단계별 몇 번 — 따라 하기에서 도구를 바꾸면 그 분류의 것으로 */
export function doseOf(category: string, stage: DrillStage): Dose {
  return (DOSES[category] ?? DOSES[MOVEMENT])[stage];
}

export const doseText = (d: Dose) => `${d.sets}세트 × ${d.reps}회`;

/** 세션 한 줄의 처방 칸 — dose · sets · tempo */
export function doseFields(category: string, stage: DrillStage) {
  const d = doseOf(category, stage);
  return { dose: doseText(d), sets: d.sets, tempo: STAGE_TEMPO[stage] };
}

type Pick = {
  drill: ProgramDrill;
  variant: ProgramDrill['variants'][number];
  stage: DrillStage;
};

/** 이 요소가 주(main) · 보조(sub)인 동작 — 그 단계 것만 */
function candidates(drills: ProgramDrill[], element: MechanicsElementName, stage: DrillStage) {
  const main = drills.filter((d) => d.stage === stage && d.focusPoints[0] === element);
  const sub = drills.filter(
    (d) => d.stage === stage && d.focusPoints[0] !== element && d.focusPoints.includes(element)
  );
  return [main, sub];
}

/** 바라는 분류 · 할 수 있는 도구 순으로 */
function bestVariant(drill: ProgramDrill, want: string, owned: ReadonlySet<string> | null) {
  const ok = drill.variants.filter((v) => canUseVariant(v, owned));
  return ok.find((v) => v.category === want) ?? ok[0] ?? null;
}

function pickDrill(
  drills: ProgramDrill[],
  element: MechanicsElementName,
  stage: DrillStage,
  want: string,
  used: Set<string>,
  turn: number,
  owned: ReadonlySet<string> | null
): Pick | null {
  const free = drills.filter(
    (d) => !used.has(d.title) && d.variants.some((v) => canUseVariant(v, owned))
  );
  const stages: DrillStage[] = [stage];
  for (let i = DRILL_STAGE_NAMES.indexOf(stage) - 1; i >= 0; i--) stages.push(DRILL_STAGE_NAMES[i]);

  for (const s of stages) {
    for (const pool of candidates(free, element, s)) {
      if (pool.length === 0) continue;
      const withWant = pool.filter((d) =>
        d.variants.some((v) => v.category === want && canUseVariant(v, owned))
      );
      const from = withWant.length > 0 ? withWant : pool;
      const drill = from[turn % from.length];
      const variant = bestVariant(drill, want, owned);
      if (variant) return { drill, variant, stage: s };
    }
  }
  return null;
}

function gearNoteOf(
  drills: ProgramDrill[],
  element: MechanicsElementName,
  stage: DrillStage,
  pick: Pick,
  owned: ReadonlySet<string> | null
): SessionItem['gearNote'] {
  const lacking = missingGear(pick.variant, owned);
  if (lacking.length > 0) return { need: lacking.join(' · '), lowered: null };
  if (pick.stage === stage) return null;
  /* 지금 단계에 할 수 있는 드릴이 있었는데 이 세션에 이미 들어 내려온 것이면 장비 탓이 아니다 */
  const doable = candidates(drills, element, stage).some((pool) =>
    pool.some((d) => d.variants.some((v) => canUseVariant(v, owned)))
  );
  if (doable) return null;
  const need = gearFor(drills, element, stage, owned);
  return need ? { need, lowered: stage } : null;
}

/** 지금 단계 드릴을 열려면 무엇이 있으면 되나 — 모자란 것이 가장 적은 도구의 것 */
function gearFor(
  drills: ProgramDrill[],
  element: MechanicsElementName,
  stage: DrillStage,
  owned: ReadonlySet<string> | null
): string | null {
  let best: string[] | null = null;
  for (const pool of candidates(drills, element, stage)) {
    for (const d of pool) {
      for (const v of d.variants) {
        const miss = missingGear(v, owned);
        if (miss.length > 0 && (!best || miss.length < best.length)) best = miss;
      }
    }
  }
  return best ? best.join(' · ') : null;
}

/** 같은 요소 · 같은 단계에서 바꿔 할 수 있는 동작 — 주 요소인 것 먼저, 이 세션에 든 것은 빼고 */
function swapsFor(
  drills: ProgramDrill[],
  element: MechanicsElementName,
  stage: DrillStage,
  used: Set<string>,
  owned: ReadonlySet<string> | null,
  want: string
): SessionSwap[] {
  const out: SessionSwap[] = [];
  for (const pool of candidates(drills, element, stage)) {
    for (const d of pool) {
      if (used.has(d.title) || out.length >= 4) continue;
      const v = bestVariant(d, want, owned);
      if (v) out.push({ title: d.title, guideId: v.id, category: v.category, tool: v.tool });
    }
  }
  return out;
}
