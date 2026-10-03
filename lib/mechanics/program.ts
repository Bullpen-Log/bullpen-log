/**
 * 투구 메커니즘 향상 프로그램의 규칙 — 순수 계산(2026-10-04). 시험: npm run mechanics:test
 *
 * 사용자분과 정한 틀:
 * - 요소 여섯마다 지금 단계(기초 → 연결 → 통합)가 있다. 처음엔 모두 기초.
 * - 한 번(세션)에 드릴 3~4개, 15~20분 — 무브먼트 1 · 메디신볼 1~2 · 스로잉 1. 투구 차례대로(하체 → 팔) 한다.
 * - 드릴마다 느낌을 누른다(어려움 · 적당 · 쉬움). 같은 요소를 '쉬움'으로 세 번 넘기면 그 요소가 다음 단계로 오른다.
 *   '어려움'이면 세던 것을 처음부터. 기초가 쉽다고 느껴져야 다음 단계가 몸에 붙는다(설명글 '이렇게 쓰세요').
 * - 강조 요소를 하나 고르면 그 요소는 세션마다 들어가고 드릴도 둘이다. 안 고르면 여섯을 고르게 돌린다.
 * - 안전 규칙(통증 · 세게 던진 다음 날)은 이 프로그램에 걸지 않는다(사용자분 결정).
 */
import { DRILL_STAGE_NAMES } from '@/lib/exercise-meta';
import {
  MECHANICS_ELEMENTS,
  mechanicsElement,
  type MechanicsElementName,
} from '@/lib/mechanics/elements';

export type DrillStage = (typeof DRILL_STAGE_NAMES)[number];
export type ElementProgress = { stage: DrillStage; easy: number };
export type ProgramProgress = Record<MechanicsElementName, ElementProgress>;
export type DrillFeel = 'hard' | 'ok' | 'easy';

/** 다음 단계로 오르는 데 필요한 '쉬움' 수 */
export const EASY_TO_ADVANCE = 3;

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
    const v = (raw[name] ?? {}) as { stage?: unknown; easy?: unknown };
    const stage = (DRILL_STAGE_NAMES as readonly string[]).includes(v.stage as string)
      ? (v.stage as DrillStage)
      : '기초';
    const easy =
      typeof v.easy === 'number' && Number.isFinite(v.easy)
        ? Math.max(0, Math.min(EASY_TO_ADVANCE, Math.floor(v.easy)))
        : 0;
    out[name] = { stage, easy };
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
 * 느낌 하나를 반영한다. 오른 단계가 있으면 leveled 로 돌려준다(따라 하기 끝 화면이 알린다).
 * 통합에서는 더 오를 곳이 없어 '쉬움'을 세 번까지만 센다(다 익힘).
 */
export function applyFeel(
  progress: ProgramProgress,
  element: MechanicsElementName,
  feel: DrillFeel
): { progress: ProgramProgress; leveled: DrillStage | null } {
  const cur = progress[element];
  let next: ElementProgress = cur;
  let leveled: DrillStage | null = null;
  if (feel === 'hard') next = { stage: cur.stage, easy: 0 };
  if (feel === 'easy') {
    const easy = cur.easy + 1;
    const i = DRILL_STAGE_NAMES.indexOf(cur.stage);
    if (easy >= EASY_TO_ADVANCE && i < DRILL_STAGE_NAMES.length - 1) {
      leveled = DRILL_STAGE_NAMES[i + 1];
      next = { stage: leveled, easy: 0 };
    } else {
      next = { stage: cur.stage, easy: Math.min(easy, EASY_TO_ADVANCE) };
    }
  }
  return { progress: { ...progress, [element]: next }, leveled };
}

/* ------------------------------- 세션 짜기 ------------------------------- */

/** 세션에 넣을 동작 — lib/mechanics/drills.ts 의 MechanicsDrillView 에서 필요한 것만 */
export type ProgramDrill = {
  title: string;
  focusPoints: string[];
  stage: string | null;
  variants: { id: string; category: string; tool: string }[];
};

export type SessionItem = {
  element: MechanicsElementName;
  stage: DrillStage;
  title: string;
  /** 고른 도구의 드릴 id — '했다' · 느낌이 이 드릴에 남는다 */
  guideId: string;
  category: string;
  tool: string;
  /** 몇 번 할지 — 드릴에는 처방이 없어 분류별 기본값(DOSE) */
  dose: string;
  /** 이 드릴을 할 때 떠올릴 느낌 신호 한 줄(lib/mechanics/elements.ts cues) */
  cue: string;
};

const MOVEMENT = '무브먼트 패턴 드릴';
const MEDBALL = '메디신볼 드릴';
const THROWING = '스로잉 드릴';

/**
 * 몇 번 할지 — 드릴(MechanicsGuide)에는 세트 · 횟수가 없어서 분류별로 정했다. 기술을 익히는 드릴이라 적게, 매번 바르게.
 * 무브먼트는 자세를 천천히, 메디신볼은 힘껏 적게, 스로잉은 조금 더. 스로잉 드릴에도 공을 안 던지는 팔 동작(암 패스 ·
 * 90/90 월 드리블)이 있어 '구'가 아니라 '회'로 적는다.
 */
export const DOSE: Record<string, string> = {
  [MOVEMENT]: '2세트 × 6회',
  [MEDBALL]: '3세트 × 5회',
  [THROWING]: '2세트 × 8회',
};

/**
 * 이번 세션에 넣을 요소 — 투구 차례대로.
 *
 * 강조가 없으면 여섯을 반씩 번갈아 — [드리프트 · 드롭 · 상하체 분리] / [브레이크 · 몸통 회전 · 스로잉]. 두 번이면 한 바퀴다.
 * 강조가 있으면 강조 + 나머지 다섯 중 둘을 돌린다(다섯 번이면 모두 두 번씩 나온다).
 */
export function sessionElements(
  focus: MechanicsElementName | null,
  sessionsDone: number
): MechanicsElementName[] {
  const n = Math.max(0, Math.floor(sessionsDone));
  let picked: MechanicsElementName[];
  if (!focus) {
    picked = n % 2 === 0 ? ELEMENT_NAMES.slice(0, 3) : ELEMENT_NAMES.slice(3, 6);
  } else {
    const others = ELEMENT_NAMES.filter((name) => name !== focus);
    picked = [focus, others[n % others.length], others[(n + 1) % others.length]];
  }
  return ELEMENT_NAMES.filter((name) => picked.includes(name));
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
 */
export function buildSession({
  drills,
  progress,
  focus,
  sessionsDone,
}: {
  drills: ProgramDrill[];
  progress: ProgramProgress;
  focus: MechanicsElementName | null;
  sessionsDone: number;
}): SessionItem[] {
  const n = Math.max(0, Math.floor(sessionsDone));
  const slots: MechanicsElementName[] = [];
  for (const name of sessionElements(focus, n)) {
    slots.push(name);
    if (name === focus) slots.push(name);
  }

  const used = new Set<string>();
  const items: SessionItem[] = [];
  slots.forEach((element, index) => {
    const stage = progress[element].stage;
    const want = preferredCategory(index, slots.length);
    const pick = pickDrill(drills, element, stage, want, used, n + index);
    if (!pick) return;
    used.add(pick.drill.title);
    const cues = mechanicsElement(element)?.cues ?? [];
    items.push({
      element,
      stage: pick.stage,
      title: pick.drill.title,
      guideId: pick.variant.id,
      category: pick.variant.category,
      tool: pick.variant.tool,
      dose: DOSE[pick.variant.category] ?? DOSE[MOVEMENT],
      cue: cues.length > 0 ? cues[(n + index) % cues.length] : '',
    });
  });
  return items;
}

function pickDrill(
  drills: ProgramDrill[],
  element: MechanicsElementName,
  stage: DrillStage,
  want: string,
  used: Set<string>,
  turn: number
) {
  const free = drills.filter((d) => !used.has(d.title));
  const stages: DrillStage[] = [stage];
  for (let i = DRILL_STAGE_NAMES.indexOf(stage) - 1; i >= 0; i--) stages.push(DRILL_STAGE_NAMES[i]);

  for (const s of stages) {
    const main = free.filter((d) => d.stage === s && d.focusPoints[0] === element);
    const sub = free.filter(
      (d) => d.stage === s && d.focusPoints[0] !== element && d.focusPoints.includes(element)
    );
    for (const pool of [main, sub]) {
      if (pool.length === 0) continue;
      const withWant = pool.filter((d) => d.variants.some((v) => v.category === want));
      const from = withWant.length > 0 ? withWant : pool;
      const drill = from[turn % from.length];
      const variant = drill.variants.find((v) => v.category === want) ?? drill.variants[0];
      return { drill, variant, stage: s };
    }
  }
  return null;
}
