import { exactOutingDay, nextOutingDays, todayOutingRole } from '@/lib/checkin';
import type { YesterdayArmLoad, YesterdayArmLoadKind } from '@/lib/engine/arm-load';
import type { DayState } from '@/lib/engine/day-state';
import {
  LOWER_POWER_KEY,
  UPPER_POWER_KEY,
  movementKeyOf,
  type ClassifiableExercise,
} from '@/lib/engine/exercise-class';
import { ALSO_IN, inCategory } from '@/lib/categories';
import { intensityLevel } from '@/lib/exercise-meta';
import { canDo } from '@/lib/report/equipment';
import { filterByLevel } from '@/lib/report/personalize';
import { YOUTH_AGE_THRESHOLD } from '@/lib/report/plan';
import { withJosa } from '@/lib/korean';

/**
 * 근력 · 파워 프로그램 — 프로그램 목록 · 시작 자격 · 운동 고정 · 오늘 판정 · 일차 넘기기. 순수 함수만(DB 를 모른다).
 *
 * 안전 · 화면 규칙: docs/designs/pitcher-strength-power-programs.md. 프로그램 목록은 이 파일의 PROGRAMS.
 * 2026-10-07 사용자: "실제 있는 프로그램을 기반으로" — 스트롱리프트 5×5 · 5/3/1 · (텍사스 메소드 — 2026-10-14 지움: 주 3번 무거운 스쿼트라 투구 일정과 부딪힘) ·
 * 저거넛 5회 파도 · WS4SB · 투수 파워(2026-10-16 프렌치 컨트라스트 대신). 모두 4주. 투수라서 원본과 다르게 한 곳에는 '투수 맞춤' 주석을 단다.
 * 옛 '비시즌 근력 → 파워'(8주)는 목록에서 숨기고, 진행 중인 줄만 같은 모양(LEGACY)으로 이어 간다.
 * 2026-10-09 기본기 4주(BASICS) — 성장기 · 입문용, 무게 추천 없이 횟수 · 세트로만(docs/designs/youth-beginner-path.md).
 *
 * 무게는 따로 둔다(lib/program/next-weight.ts). 화면 글은 해요체 · 줄표 없이(HANDOFF 2026-10-04).
 */

/** 기능 전체의 스위치 — 끄면 트레이닝 화면의 입구 · 카드가 사라진다. 진행 중이던 줄은 그대로 남는다. */
export const PROGRAMS_ENABLED = true;

/* ─────────────────────────────── 이름들 ─────────────────────────────── */

export type SlotKind = 'power' | 'bigLower' | 'pushPull' | 'singleLeg' | 'core';
/** 고정하는 단위(U6) — 운동 하나가 하나의 변형에 고정된다 */
export type VariantKey =
  | 'squat'
  | 'hinge'
  | 'push'
  /* 머리 위 밀기(오버헤드 프레스) — 스트롱리프트 B 날. 벤치(push)와 따로 고정해야 두 무게가 따로 오른다 */
  | 'ohp'
  | 'pull'
  | 'singleLeg'
  | 'jump'
  | 'medball'
  | 'antiRotation'
  | 'rotationalThrow'
  /* 플라이오 푸시업 — 상체를 빠르게 미는 맨몸 파워(웨스트사이드 파워 상체 반복 날, 2026-10-16 김민 '파워 비중 늘리기') */
  | 'plyoPush'
  /* 보조 메뉴 칸(ACCESSORY_KEYS) — 고정하지 않고 세션마다 후보를 돌며 고른다(accessoryPick) */
  /* 몸통 안정(플랭크 · 데드버그 · 버드독 · 캐리) — 몸통 버티기(돌지 않게)와 한 쌍으로 날마다 둘(2026-10-16 김민) */
  | 'coreStab'
  | 'hpull'
  | 'vpull'
  | 'pushAcc'
  | 'hamstring'
  | 'scap'
  | 'triceps'
  | 'biceps'
  | 'forearm';

export const VARIANT_KEYS: readonly VariantKey[] = [
  'squat',
  'hinge',
  'push',
  'ohp',
  'pull',
  'singleLeg',
  'jump',
  'medball',
  'antiRotation',
  'rotationalThrow',
  'plyoPush',
];

export const VARIANT_LABELS: Record<VariantKey, string> = {
  squat: '스쿼트',
  hinge: '힌지',
  push: '밀기',
  ohp: '머리 위 밀기',
  pull: '당기기',
  singleLeg: '한 다리',
  jump: '점프',
  medball: '메디신볼',
  antiRotation: '몸통 버티기',
  coreStab: '몸통 안정',
  rotationalThrow: '회전 던지기',
  plyoPush: '플라이오 푸시업',
  hpull: '가로 당기기',
  vpull: '세로 당기기',
  pushAcc: '보조 밀기',
  hamstring: '햄스트링 · 둔근',
  scap: '어깨 뒤쪽',
  triceps: '삼두',
  biceps: '이두',
  forearm: '전완',
};

/**
 * 보조 메뉴 칸 — 시작할 때 고정하지 않는다(VARIANT_KEYS 에 없어 고르기 화면 · pickPinned 가 안 본다). 세션마다 그 칸 후보 전체를
 * 사람마다 섞은 차례로 돌아 한 바퀴 전에는 같은 운동이 다시 안 나온다(accessoryPick). 2026-10-14 사용자: "보조운동은 다양하고 세션마다
 * 다른 걸로 · 바벨 로우만 나오면 안 된다".
 */
export const ACCESSORY_KEYS: readonly VariantKey[] = [
  'coreStab',
  'hpull',
  'vpull',
  'pushAcc',
  'hamstring',
  'scap',
  'triceps',
  'biceps',
  'forearm',
];

/** 변형 → 칸 종류. 그날 조정(가볍게 · 빼기 · 대체)과 '몇 개 더?'는 칸 종류로 정한다. */
export const SLOT_OF: Record<VariantKey, SlotKind> = {
  squat: 'bigLower',
  hinge: 'bigLower',
  push: 'pushPull',
  ohp: 'pushPull',
  pull: 'pushPull',
  singleLeg: 'singleLeg',
  jump: 'power',
  medball: 'power',
  antiRotation: 'core',
  coreStab: 'core',
  rotationalThrow: 'core',
  plyoPush: 'power',
  /* 팔 · 어깨 보조도 상체 칸 — 그날 조정(팔 피로 · 통증으로 가볍게 · 빼기)을 같이 받는다 */
  hpull: 'pushPull',
  vpull: 'pushPull',
  pushAcc: 'pushPull',
  hamstring: 'singleLeg',
  scap: 'pushPull',
  triceps: 'pushPull',
  biceps: 'pushPull',
  forearm: 'pushPull',
};

/** 무게를 드는 칸 */
export const WEIGHTED_SLOTS: readonly SlotKind[] = [
  'bigLower',
  'pushPull',
  'singleLeg',
];

/**
 * 시작에 꼭 있어야 하는 장비(§1) — 모든 성인 프로그램이 같다. 트랩바는 '바벨'에 들어간다(§13-21).
 * 2026-10-16 김민: 바벨 · 덤벨만으로는 너무 적다 → 일반 헬스장 장비(바벨 · 원판 · 덤벨 · 벤치 · 철봉 · 밴드 · 케이블). 실제 운동 표로 세니
 * 바벨 · 덤벨만이면 세로 당기기 · 삼두 후보가 0, 회전 던지기가 1(세션마다 같은 운동)이었고, 이 일곱이면 모든 칸이 둘 넘게(햄스트링 2 ·
 * 메디신볼 칸은 아래 대체) 되어 같은 운동이 연달아 안 나온다. 박스 · 메디신볼은 헬스장에 없는 곳이 많아 넣지 않았다.
 * 메디신볼은 2026-10-14 에 뺐다(김민 — 못 던지는 환경일 수 있다). 없으면 메디신볼 칸은 플라이오 푸시업으로, 있어도 선택 운동이다(isOptionalProgramExercise).
 * 이미 진행 중인 프로그램은 막지 않는다 — 시작할 때만 본다(checkEligibility).
 */
export const REQUIRED_EQUIPMENT: readonly string[] = [
  '바벨',
  '원판',
  '덤벨',
  '벤치',
  '철봉',
  '밴드',
  '케이블',
];
/**
 * 기본기 4주의 필수 장비 — 기본 근력 운동(스쿼트 · 힌지 · 밀기 · 당기기 · 한 다리)이 되게(2026-10-16 김민). 맨몸만이면 당기기 후보가 0,
 * 힌지가 1이었다. 밴드 · 덤벨이면 일곱 칸 모두 셋 넘게. 메디신볼은 못 던지는 곳이 많아 넣지 않는다(없으면 던지기 칸은 점프).
 */
export const BASICS_REQUIRED_EQUIPMENT: readonly string[] = ['덤벨', '밴드'];

/**
 * 있으면 좋은 장비(필수 아님) — 메디신볼이 있으면 메디신볼 · 회전 던지기 칸이 실제 던지기로, 박스가 있으면 점프가 다양해진다(2026-10-16,
 * 벤치 · 밴드는 필수로 올림). 시작 시트가 '권장'으로 보여 준다.
 */
export const RECOMMENDED_EQUIPMENT: readonly string[] = ['메디신볼', '박스'];

/**
 * 선택 운동 — 메디신볼을 던지는 칸(메디신볼 · 회전 던지기)은 건너뛰어도 된다(2026-10-14 김민: 못 던지는 환경일 수 있다).
 * 카드 · 운동 화면이 '선택'으로 적고, 세션을 마쳤다고 세는 세트(절반)에 넣지 않는다. 메디신볼이 없어 점프 · 돌리는 코어로 채운 칸은 그대로 센다.
 */
export function isOptionalProgramExercise(ex: {
  programSlot?: { variant: VariantKey } | null;
  equipment: readonly string[];
}): boolean {
  return (
    ex.programSlot != null &&
    (ex.programSlot.variant === 'medball' || ex.programSlot.variant === 'rotationalThrow') &&
    ex.equipment.includes('메디신볼')
  );
}

/** 기준 무게(TM) = 추정 최대 × 0.9 — 5/3/1 · 저거넛 원본 규칙 */
export const TM_RATIO = 0.9;

/** '+' 세트에서 남기는 개수 — 투수 맞춤: 원본처럼 끝까지 가지 않는다 */
export const PLUS_RESERVE = 2;

/** 기준 무게를 정할 때 보는 시작 전 기간(일) */
export const TM_LOOKBACK_DAYS = 42;

/* ─────────────────────────────── 프로그램 모양 ─────────────────────────────── */

export type ProgramId =
  | 'stronglifts-5x5'
  | '531'
  | 'juggernaut-5s'
  | 'ws4sb'
  | 'pitcher-power'
  | 'offseason-strength-power'
  | 'basics-4w';
export type ProgramGoal = 'base' | 'strength' | 'power';
/**
 * 누구의 프로그램인가 — adult: 만 18세 이상 · 입문 아님(설계 D10), basics: 만 13세부터 · 경력 상관없이(기본기 4주).
 * 고르기 화면 · 시작 자격 · 운동 고르기 규칙이 이것으로 갈린다.
 */
export type ProgramAudience = 'adult' | 'basics';
export type PerWeek = 2 | 3;

export const GOAL_LABELS: Record<ProgramGoal, string> = {
  base: '기초',
  strength: '근력',
  power: '파워',
};

/**
 * 무게를 정하는 방식(lib/program/next-weight.ts).
 *   pct     — 기준 무게(TM)의 몇 %. TM 은 시작 전 기록으로 정해 4주 동안 그대로(5/3/1 · 저거넛)
 *   linear  — 다 채우면 다음 회차 한 칸(스트롱리프트)
 *   reserve — '몇 개 남기고' + 지난 기록(보조 운동 · 최고까지 올리기 · 옛 프로그램)
 *   none    — 무게 없음(점프 · 메디신볼 · 몸통)
 */
export type WeightMode = 'pct' | 'linear' | 'reserve' | 'none';

export type SetRx = {
  reps: number;
  /** pct 방식 — TM 비율(0.65 = 65%) */
  pct?: number;
  /** reserve 방식 — 목표 여유(몇 개 남기고) */
  reserve?: number | null;
  /** '+' — 할 수 있는 만큼, 단 PLUS_RESERVE 개 남기고 */
  plus?: boolean;
};

type Item = {
  variant: VariantKey;
  mode: WeightMode;
  sets: readonly SetRx[];
  /** 세트 사이 쉬는 시간(초) */
  rest: number;
  /** 앞 운동과 묶음 — 한 세트씩 번갈아 바로 이어서(지금 쓰는 프로그램은 없다 — 2026-10-16 프렌치 컨트라스트를 지움) */
  group?: boolean;
  /** 준비 세트로 올라가 본 세트 하나(WS4SB 최대 노력) */
  top?: boolean;
  /** 보조 운동 — 세션마다 같은 칸 후보에서 돌아가며 고른다(assistFor). 본운동은 고정 그대로 */
  assist?: boolean;
};

type DayBuild = { label: string | null; items: readonly Item[] };

export type ProgramDef = {
  id: ProgramId;
  goal: ProgramGoal;
  name: string;
  /** 원작자 · 원래 이름 */
  origin: string;
  /** 카드 한 줄 — 무엇을 어떻게 하나 */
  summary: string;
  /**
   * 고르기 목록의 두 줄 — 왜 하나(무엇이 좋아지나) · 이런 분께(2026-10-16 김민: "고를 때 이게 뭔지 알기 쉽지 않다 — 길게 말고 핵심만,
   * 뭘 왜 하는 건지"). 옛 프로그램(목록에서 숨김)은 없다.
   */
  why?: string;
  fit?: string;
  /** 하루가 어떻게 짜이나 — 목록 · 소개의 한 줄(같은 날 '조금만 더 자세히') */
  how?: string;
  /** '자세히' — 원본에서 가져온 것 · 투수라서 바꾼 것 */
  detail: readonly string[];
  weeks: number;
  /** 고를 수 있는 주당 횟수 — 원본을 따른다 */
  perWeek: readonly PerWeek[];
  lightWeeks: readonly number[];
  /** 그 주로 넘어가는 날 끝 화면의 한 줄(옛 프로그램의 5주 '파워 블록') */
  weekNotes?: Readonly<Record<number, string>>;
  /** day = 프로그램 안 일차(1부터), light = 가벼운 주(lightWeeks) */
  build: (day: number, week: number, perWeek: PerWeek, light: boolean) => DayBuild;
  /** 없으면 adult */
  audience?: ProgramAudience;
  /** 시작에 꼭 있어야 하는 장비 — 없으면 REQUIRED_EQUIPMENT(바벨 · 덤벨) */
  required?: readonly string[];
};

export const audienceOf = (def: Pick<ProgramDef, 'audience'>): ProgramAudience =>
  def.audience ?? 'adult';
export const requiredOf = (def: Pick<ProgramDef, 'required'>): readonly string[] =>
  def.required ?? REQUIRED_EQUIPMENT;

/* ─────────────────────────────── 만드는 도구 ─────────────────────────────── */

const reps = (n: number, count: number, reserve: number | null = null): SetRx[] =>
  Array.from({ length: n }, () => ({ reps: count, reserve }));
const pctSets = (n: number, count: number, pct: number): SetRx[] =>
  Array.from({ length: n }, () => ({ reps: count, pct }));
const at = (count: number, pct: number, plus = false): SetRx =>
  plus ? { reps: count, pct, plus } : { reps: count, pct };
const cycle = <T>(list: readonly T[], day: number): T => list[(day - 1) % list.length];
const item = (
  variant: VariantKey,
  mode: WeightMode,
  sets: readonly SetRx[],
  rest: number,
  extra: { group?: boolean; top?: boolean; assist?: boolean } = {}
): Item => ({ variant, mode, sets, rest, ...extra });

/** 보조 메뉴 한 칸의 횟수 — 큰 동작은 8~10회, 팔 · 어깨 뒤쪽 · 전완은 12~15회 */
const ACC_REPS: Partial<Record<VariantKey, number>> = {
  hpull: 10,
  vpull: 8,
  pushAcc: 10,
  hamstring: 8,
  singleLeg: 8,
  scap: 12,
  triceps: 12,
  biceps: 12,
  forearm: 15,
};

/**
 * 그날 보조 메뉴(2026-10-14 사용자와 정함) — 본운동에 맞춰 칸 넷, 각 2~3세트. 웬들러 원칙대로 당기기는 날마다(밀기보다 많이), 그날
 * 본운동과 같은 근육은 피한다(벤치 날은 보조 밀기 대신 삼두 · 어깨 뒤쪽).
 *   스쿼트 날  가로 당기기 · 보조 밀기 · 햄스트링 · 몸통
 *   벤치 날    세로 당기기 · 어깨 뒤쪽 · 삼두 · 몸통
 *   힌지 날    가로 당기기 · 보조 밀기 · 한 다리 · 전완
 * 한 날에 스쿼트와 벤치가 같이 있으면(주 2번) 스쿼트 날 메뉴에서 보조 밀기를 이두로. 회전 던지기를 한 날은 그것이 몸통 칸이라 몸통을 뺀다.
 */
function accessoryMenu(
  lifts: readonly VariantKey[],
  sets: number,
  light: boolean,
  hasThrow = false
): Item[] {
  const first = lifts[0];
  let keys: VariantKey[] =
    first === 'push'
      ? ['vpull', 'scap', 'triceps', 'antiRotation']
      : first === 'hinge'
        ? ['hpull', 'pushAcc', 'singleLeg', 'forearm']
        : ['hpull', 'pushAcc', 'hamstring', 'antiRotation'];
  if (first !== 'push' && lifts.includes('push')) keys = keys.map((k) => (k === 'pushAcc' ? 'biceps' : k));
  return keys.flatMap((k) =>
    k === 'antiRotation'
      ? /* 회전 던지기를 한 날은 그것이 돌리는 몸통 — 몸통 안정만 */
        coreItems().slice(hasThrow ? 1 : 0)
      : [
          item(k, 'reserve', light ? reps(2, ACC_REPS[k] ?? 10, 4) : reps(sets, ACC_REPS[k] ?? 10, 2), 75, {
            assist: true,
          }),
        ]
  );
}

/* 투수 맞춤: 날마다 끝에 몸통 둘(원본의 보조 운동 자리) — 돌지 않게 버티기 + 몸통 안정, 각 2세트(2026-10-16 김민: 3세트 하나 → 2세트 둘) */
const coreItems = (): Item[] => [
  item('antiRotation', 'none', reps(2, 10), 60, { assist: true }),
  item('coreStab', 'none', reps(2, 10), 60, { assist: true }),
];

/* ─────────────────────────────── 기초 ─────────────────────────────── */

const STRONGLIFTS: ProgramDef = {
  id: 'stronglifts-5x5',
  goal: 'base',
  name: '5×5 기초 근력',
  origin: 'StrongLifts 5×5 · 메흐디 하딤',
  summary: '매번 5회 5세트, 다 채우면 다음에 무게를 올려요',
  how: 'A 날은 스쿼트 · 벤치 · 로우, B 날은 데드리프트 · 오버헤드 프레스예요. 두 날을 번갈아 해요',
  why: '웨이트를 제대로 시작할 때 많이 하는 프로그램이에요. 큰 운동 몇 개만 반복해서 하체랑 몸통 힘부터 올려요',
  fit: '웨이트를 해 봤지만 무게를 꾸준히 올려 본 적은 없는 분',
  detail: [
    'A 날(스쿼트 · 벤치 프레스 · 바벨 로우)과 B 날(데드리프트 · 오버헤드 프레스)을 번갈아 해요. 투수에 맞춰 스쿼트는 A 날만, B 날은 데드리프트를 3세트로 해요.',
    '다 채우면 다음 회차에 2.5kg(데드리프트 5kg)을 올리고, 세 번 연속 못 채우면 10% 낮춰요.',
    '본운동 뒤 짧은 보조(A 날 세로 당기기 · 삼두, B 날 가로 당기기 · 이두, 날마다 몸통)를 2세트씩 하고, 보조는 세션마다 바뀌어요.',
  ],
  weeks: 4,
  perWeek: [3],
  lightWeeks: [],
  build: (day) => {
    const a = day % 2 === 1;
    return {
      label: a ? 'A 날' : 'B 날',
      /*
       * 원본 그대로 B 날 오버헤드 프레스(2026-10-14 사용자: 투수도 머리 위 운동을 한다 — 예전엔 뺐다). 벤치(push)와 따로 고정(ohp)이라 무게가
       * 따로 오른다. 투수 맞춤(2026-10-15 사용자): 스쿼트는 A 날만 — 원본은 매 세션 스쿼트라 투구와 겹쳐 다리가 쉬지 못한다. B 날은 그 자리를
       * 데드리프트 3세트(원본 1세트)로. 본운동 뒤 짧은 보조 2세트(웬들러 원칙대로 당기기는 날마다 — A 날은 로우가 본운동이라 세로 당기기) · 몸통.
       */
      items: a
        ? [
            item('squat', 'linear', reps(5, 5), 180),
            item('push', 'linear', reps(5, 5), 120),
            item('pull', 'linear', reps(5, 5), 120),
            item('vpull', 'reserve', reps(2, 8, 2), 75, { assist: true }),
            item('triceps', 'reserve', reps(2, 12, 2), 60, { assist: true }),
            ...coreItems(),
          ]
        : [
            item('hinge', 'linear', reps(3, 5), 180),
            item('ohp', 'linear', reps(5, 5), 120),
            item('hpull', 'reserve', reps(2, 10, 2), 75, { assist: true }),
            item('biceps', 'reserve', reps(2, 12, 2), 60, { assist: true }),
            ...coreItems(),
          ],
    };
  },
};

/*
 * 5/3/1 · 저거넛은 하루에 본 운동 하나(주 3번: 스쿼트 · 밀기 · 힌지). 주 2번은 1일 스쿼트 + 밀기, 2일 힌지 —
 * 투수 맞춤: 원본 2일 판(이틀 다 누르기)과 달리 밀기는 주 1번, 스쿼트 · 힌지와 같게.
 */
const mainLifts = (day: number, perWeek: PerWeek): readonly VariantKey[] =>
  perWeek === 3
    ? [cycle(['squat', 'push', 'hinge'] as const, day)]
    : cycle([['squat', 'push'], ['hinge']] as const, day);

/** 5/3/1 의 주마다 세트(TM %) — 4주는 가볍게 */
const WAVE_531: readonly (readonly SetRx[])[] = [
  [at(5, 0.65), at(5, 0.75), at(5, 0.85, true)],
  [at(3, 0.7), at(3, 0.8), at(3, 0.9, true)],
  [at(5, 0.75), at(3, 0.85), at(1, 0.95, true)],
  [at(5, 0.4), at(5, 0.5), at(5, 0.6)],
];

/** 저거넛 5회 파도(쌓기 · 세게 · 기록 · 가볍게, TM %) */
const WAVE_JUGGERNAUT_5S: readonly (readonly SetRx[])[] = [
  [...pctSets(4, 5, 0.7), at(5, 0.7, true)],
  [at(5, 0.625), at(5, 0.7), at(5, 0.775), at(5, 0.775), at(5, 0.775, true)],
  [at(3, 0.6), at(2, 0.7), at(1, 0.775), at(5, 0.85, true)],
  [at(5, 0.4), at(5, 0.5), at(5, 0.6)],
];


function waveDay(
  wave: readonly (readonly SetRx[])[],
  primer: boolean
): ProgramDef['build'] {
  return (day, week, perWeek, light) => {
    const lifts = mainLifts(day, perWeek);
    /*
     * 원저자 권장: 들기 전에 뛰고 던지기. 힌지 날은 회전 던지기(2026-10-14 김민 — 투구는 회전이라 주 1번 이상 회전 파워를.
     * 주 3번 · 2번 모두 힌지 날이 주 1번), 스쿼트 날은 점프. 근력이 목적이라 워밍업으로만 — 2세트 × 3회 · 60초
     * (2026-10-14 김민: "파워가 목적이 아니잖아"). 저거넛은 넣지 않는다(primer false).
     * 밀기 날의 메디신볼은 뺐다(2026-10-16 김민) — 워밍업 루틴을 만들면 그 자리에 넣는다.
     */
    const items: Item[] =
      primer && lifts[0] !== 'push'
        ? [item(lifts[0] === 'hinge' ? 'rotationalThrow' : 'jump', 'none', reps(2, 3), 60)]
        : [];
    lifts.forEach((v) => {
      items.push(item(v, 'pct', wave[week - 1], v === 'push' ? 150 : 180));
    });
    /*
     * 보조 메뉴(accessoryMenu) — 칸마다 3세트. 몸통 칸은 하루 하나 — 회전 던지기를 한 날은 그것이
     * 몸통 운동(옛 프로그램의 파워 블록과 같다).
     */
    items.push(...accessoryMenu(lifts, 3, light, items[0]?.variant === 'rotationalThrow'));
    return { label: null, items };
  };
}

/* ─────────────────────────────── 근력 ─────────────────────────────── */

const W531: ProgramDef = {
  id: '531',
  goal: 'strength',
  name: '5/3/1 근력',
  origin: '5/3/1 · 짐 웬들러',
  summary: '1주 5회, 2주 3회, 3주 5·3·1회, 4주는 가볍게 해요',
  how: '큰 운동은 하루 3세트뿐이에요. 마지막 세트만 2개 남을 때까지 많이 해요',
  why: '무게를 천천히 올리는 대신 오래 꾸준히 늘어요. 하루 운동량이 적어서 공 던지는 주에도 부담이 덜해요',
  fit: '매번 무게를 올리기가 버거워진 분',
  detail: [
    '본 운동 3세트의 마지막(+)은 할 수 있는 만큼 하되 2개 남기고 멈춰요.',
    '%는 기준 무게(추정 최대의 90%)의 비율이에요. 기준 무게는 시작 전 기록으로 정하고 4주 동안 그대로예요.',
    '원저자 권장대로 스쿼트 날은 들기 전에 워밍업으로 점프를 가볍게 해요(힌지 날은 회전 던지기). 보조는 그날 본운동에 맞춘 넷(당기기는 날마다 · 보조 밀기나 삼두 · 다리나 전완 · 몸통)이고, 세션마다 다른 운동이 나와요.',
  ],
  weeks: 4,
  perWeek: [2, 3],
  lightWeeks: [4],
  build: waveDay(WAVE_531, true),
};

const JUGGERNAUT: ProgramDef = {
  id: 'juggernaut-5s',
  goal: 'strength',
  name: '저거넛 근력',
  origin: 'Juggernaut Method 5s wave · 채드 웨슬리 스미스',
  summary: '쌓기, 세게, 기록 내기, 가볍게 순서로 4주를 가요',
  how: '처음 2주는 세트를 많이 쌓고, 3주째에 기록을 내 봐요',
  why: '운동량이 많은 편이에요. 힘도 늘지만 시즌 내내 버티는 체력을 만드는 데 좋아요',
  fit: '운동량을 견딜 수 있고 기록을 내 보고 싶은 분',
  detail: [
    '1주는 5회를 여러 세트 쌓고, 2주는 무게를 올리고, 3주는 + 세트로 기록을 내고, 4주는 가볍게 해요.',
    '%는 기준 무게(추정 최대의 90%)의 비율이에요. + 세트는 2개 남기고 멈춰요.',
    '보조는 그날 본운동에 맞춘 넷(당기기는 날마다 · 보조 밀기나 삼두 · 다리나 전완 · 몸통)이고, 세션마다 다른 운동이 나와요.',
  ],
  weeks: 4,
  perWeek: [2, 3],
  lightWeeks: [4],
  build: waveDay(WAVE_JUGGERNAUT_5S, false),
};

/* ─────────────────────────────── 파워 ─────────────────────────────── */

const WS4SB: ProgramDef = {
  id: 'ws4sb',
  goal: 'power',
  name: '웨스트사이드 파워',
  origin: 'Westside for Skinny Bastards · 조 디프랑코',
  summary: '최고 기록 날과 점프 날로 힘과 탄력을 같이 길러요',
  how: '매번 점프나 던지기로 먼저 몸을 빠르게 써요. 무거운 날엔 3~5회 최고 무게까지 들어요',
  why: '무겁게 드는 힘과 빠르게 쓰는 힘을 같이 키워요. 구속을 올리고 싶을 때 맞아요',
  fit: '근력 바탕이 있고 폭발력을 더 키우고 싶은 분',
  detail: [
    '웨스트사이드를 운동선수용으로 바꾼 프로그램이에요. 1회 최대 대신 3~5회 최대, 속도 스쿼트 대신 점프를 해요.',
    '무거운 날은 점프 · 던지기 뒤에 준비 세트로 올라가 본 세트 하나를 1개 남기고 해요. 운동은 매주 스쿼트와 힌지를 바꿔요.',
    '점프 날은 점프 · 회전 던지기 · 앞으로 던지기가 중심이에요. 주 3번이면 상체를 여러 번 하는 날이 더해지고, 플라이오 푸시업으로 시작해요.',
    '빠르게 하는 동작은 2 · 3주에 한 세트 늘고 4주에 줄어요.',
  ],
  weeks: 4,
  perWeek: [2, 3],
  lightWeeks: [],
  build: (day, week, perWeek) => {
    /*
     * 파워 비중(2026-10-16 김민 "파워 비중이 너무 낮다" — 세트로 무거운 날 18% · 점프 날 50% · 상체 날 15%, 한 주 27%). 보조를 덜어 낸 자리에
     * 던지기 · 점프 · 플라이오 푸시업을 넣어 한 주 40%쯤, 세션 길이는 그대로. 주마다: 2 · 3주 파워 세트 +1, 4주 -1(점프 단계는 jumpFitsWeek).
     * 점프 날 던지기는 늘리지 않는다 — 한 번에 28개(회전 좌우 3 × 3 + 앞으로 2 × 5), 투수 파워의 '30개 안팎'(10-16) 안.
     */
    const plus = [0, 1, 1, -1][week - 1];
    const pw = (n: number) => Math.max(2, n + plus);
    const main = (['squat', 'hinge', 'squat', 'hinge'] as const)[week - 1];
    const heavy: DayBuild = {
      label: '무거운 날',
      items: [
        item('jump', 'none', reps(pw(3), 3), 90),
        /* 들기 전에 던지기 — 무거운 날도 빠르게 하는 동작을 둘 */
        item('medball', 'none', reps(pw(3), 3), 90),
        item(main, 'reserve', [{ reps: week <= 2 ? 5 : 3, reserve: 1 }], 180, { top: true }),
        /* 보조 셋 + 몸통 하나(예전 넷 + 몸통 둘 · 전완에서 줄임) */
        item('hpull', 'reserve', reps(3, ACC_REPS.hpull ?? 10, 2), 75, { assist: true }),
        item('pushAcc', 'reserve', reps(3, ACC_REPS.pushAcc ?? 10, 2), 75, { assist: true }),
        main === 'squat'
          ? item('hamstring', 'reserve', reps(3, ACC_REPS.hamstring ?? 8, 2), 75, { assist: true })
          : item('singleLeg', 'reserve', reps(3, ACC_REPS.singleLeg ?? 8, 2), 75, { assist: true }),
        coreItems()[0],
      ],
    };
    const jumps: DayBuild = {
      label: '점프 날',
      items: [
        item('jump', 'none', reps(pw(5), 3), 90),
        /* 회전 던지기 — 투구는 회전이라 주 1번 이상(2026-10-14). 회전 던지기가 이날의 몸통 칸 */
        item('rotationalThrow', 'none', reps(3, 3), 90),
        item('medball', 'none', reps(2, 5), 90),
        /* 점프 날 보조 둘 — 한 다리 · 세로 당기기 */
        item('singleLeg', 'reserve', reps(3, 10, 2), 75, { assist: true }),
        item('vpull', 'reserve', reps(3, 8, 2), 75, { assist: true }),
      ],
    };
    const upper: DayBuild = {
      label: '상체 반복 날',
      items: [
        item('medball', 'none', reps(pw(3), 5), 90),
        item('plyoPush', 'none', reps(pw(3), 5), 90),
        /* 당기기를 밀기보다 많이(가로 · 세로 둘), 팔은 주마다 삼두 · 이두 번갈아 하나, 몸통 하나 */
        item('pushAcc', 'reserve', reps(3, 12, 2), 75, { assist: true }),
        item('hpull', 'reserve', reps(3, 10, 2), 75, { assist: true }),
        item('vpull', 'reserve', reps(3, 8, 2), 75, { assist: true }),
        item(week % 2 === 1 ? 'triceps' : 'biceps', 'reserve', reps(2, 12, 2), 60, { assist: true }),
        coreItems()[0],
      ],
    };
    return cycle(perWeek === 3 ? [heavy, jumps, upper] : [heavy, jumps], day);
  },
};

/*
 * 투수 파워(2026-10-16 김민 — 컨트라스트 대신). 투구 구속 트레이닝에서 흔히 쓰는 차례: 던지기(면마다 가볍게 · 많이) → 점프 → 근력(유지,
 * 몇 개 남기고) → 보조. 회전 던지기는 날마다(투구는 회전), 큰 하체는 주 2번(스쿼트 날 · 힌지 날), 셋째 날은 큰 하체 없이 밀기 · 한 다리.
 * 주마다 던지기 2 → 3 → 3세트(한 번에 22 → 33개) · 점프 3 → 4 → 4세트, 근력 5 → 4 → 3회(2개 남기고), 4주는 가볍게(세트 줄이고 4개 남기고).
 */
/* sets = 점프 세트, throws = 던지기 세트(회전 좌우 3회씩 + 앞 · 위로 5회 — 한 번에 22 → 33 → 33 → 22개, 2026-10-16 김민: "60개는 많다, 30개쯤") */
const POWER_WEEKS = [
  { sets: 3, throws: 2, lift: 5 },
  { sets: 4, throws: 3, lift: 4 },
  { sets: 4, throws: 3, lift: 3 },
  { sets: 2, throws: 2, lift: 5 },
];

const PITCHER_POWER: ProgramDef = {
  id: 'pitcher-power',
  goal: 'power',
  name: '투수 파워',
  origin: '투구 구속 트레이닝 원칙 · 메디신볼 · 점프 · 근력 유지',
  summary: '메디신볼을 여러 방향으로 던지고 뛴 뒤, 근력은 유지해요',
  how: '매번 메디신볼 던지기로 시작해요. 스쿼트 날엔 점프도 해요',
  why: '메디신볼 던지기가 중심이에요. 투구할 때처럼 몸을 돌려 던지는 힘을 키우고, 근력은 떨어지지 않을 만큼만 해요',
  fit: '시즌을 앞두고 구속에 가까운 힘을 쓰고 싶은 분',
  detail: [
    '날마다 메디신볼 던지기로 시작해요. 돌려 던지기는 좌우 각각, 앞 · 위로 던지기까지 한 번에 30개쯤을 가볍게, 매번 최대 속도로 던져요.',
    '점프는 스쿼트 날에 해요. 1~2주는 박스 · 브로드 점프, 3주부터 바운드 · 뎁스 점프까지 올려요. 큰 운동은 2개 남기고 3세트만 해서 근력을 지켜요.',
    '당기기를 밀기보다 많이 해요(투수 어깨).',
    '주마다 던지기 세트가 늘고 근력 횟수는 5회에서 3회로 줄어요. 4주는 가볍게 해요.',
  ],
  weeks: 4,
  perWeek: [2, 3],
  lightWeeks: [4],
  build: (day, week, perWeek, light) => {
    const w = POWER_WEEKS[week - 1];
    const lift = (v: VariantKey): Item => item(v, 'reserve', reps(light ? 2 : 3, w.lift, light ? 4 : 2), 150);
    /* 회전 던지기는 좌우 각각(라이브러리 perSide) — 앞 · 위로 던지기와 합쳐 한 번에 30개 안팎 */
    const throwRot = item('rotationalThrow', 'none', reps(w.throws, 3), 60);
    const throwFront = item('medball', 'none', reps(w.throws, 5), 60);
    /* 당기기 ≥ 밀기(투수 어깨) — 스쿼트 날 보조 밀기는 세로 당기기로 */
    const pullForPush = (xs: Item[]): Item[] =>
      xs.map((x) => (x.variant === 'pushAcc' ? { ...x, variant: 'vpull', sets: reps(x.sets.length, ACC_REPS.vpull ?? 8, x.sets[0].reserve) } : x));
    const squatDay: DayBuild = {
      label: '스쿼트 날',
      items: [
        throwRot,
        throwFront,
        item('jump', 'none', reps(w.sets, 3), 75),
        lift('squat'),
        ...pullForPush(accessoryMenu(['squat'], 2, light, true)),
      ],
    };
    /* 힌지 날 — 앞 · 위로 던지기. 주 2번이면 밀기도 여기서(밀기를 주 1번은 하게) — 그때 보조 밀기는 세로 당기기로(당기기 ≥ 밀기) */
    const hingeAcc = accessoryMenu(['hinge'], 2, light, true);
    const hingeDay: DayBuild = {
      label: '힌지 날',
      items: [
        throwRot,
        throwFront,
        lift('hinge'),
        ...(perWeek === 2 ? [lift('push'), ...pullForPush(hingeAcc)] : hingeAcc),
      ],
    };
    const upperDay: DayBuild = {
      label: '밀기 · 한 다리 날',
      /* 점프는 스쿼트 날만 — 다리를 매일 뛰지 않게, 한 시간 안 */
      items: [
        throwRot,
        throwFront,
        lift('push'),
        item('singleLeg', 'reserve', reps(2, 6, light ? 4 : 2), 90),
        ...accessoryMenu(['push'], 2, light, true),
      ],
    };
    return cycle(perWeek === 3 ? [squatDay, hingeDay, upperDay] : [squatDay, hingeDay], day);
  },
};

/* ─────────────────────────── 옛 프로그램(숨김) ─────────────────────────── */

/**
 * '비시즌 근력 → 파워'(주 3번 × 8주) — 2026-10-07 까지의 하나뿐인 프로그램. 진행 중인 줄만 이어 간다.
 * 1~24일차의 차례 · 변형 · 처방이 예전과 같은지는 scripts/fixtures/legacy-program.json 으로 셀프테스트가 본다.
 */
const LEGACY_TABLE: Record<SlotKind, readonly (readonly [number, number, number | null])[]> = {
  power: [[3, 3, null], [3, 3, null], [3, 3, null], [2, 3, null], [4, 3, null], [4, 3, null], [4, 3, null], [2, 3, null]],
  bigLower: [[3, 8, 3], [4, 6, 2], [4, 5, 2], [2, 5, 4], [4, 4, 2], [4, 3, 2], [5, 3, 1], [2, 3, 4]],
  pushPull: [[3, 10, 3], [3, 8, 2], [4, 6, 2], [2, 8, 4], [3, 5, 2], [3, 5, 2], [4, 4, 2], [2, 5, 4]],
  singleLeg: [[3, 8, 3], [3, 8, 2], [3, 6, 2], [2, 6, 4], [3, 5, 2], [3, 5, 2], [3, 5, 2], [2, 5, 4]],
  core: [[3, 10, null], [3, 10, null], [3, 10, null], [2, 10, null], [3, 5, null], [3, 5, null], [3, 5, null], [2, 5, null]],
};
const LEGACY_REST: Record<SlotKind, number> = {
  power: 120,
  bigLower: 180,
  pushPull: 120,
  singleLeg: 90,
  core: 60,
};

const LEGACY: ProgramDef = {
  id: 'offseason-strength-power',
  goal: 'strength',
  name: '비시즌 근력 → 파워',
  origin: '',
  summary: '1~4주는 근력, 5~8주는 파워예요',
  detail: [],
  weeks: 8,
  perWeek: [3],
  lightWeeks: [4, 8],
  weekNotes: { 5: '다음 주부터 파워 블록이에요. 점프가 큰 하체 바로 뒤로 와요.' },
  build: (day, week) => {
    const a = day % 2 === 1;
    const powerBlock = week >= 5;
    /* 5~7주는 대비 — 큰 하체 바로 뒤에 파워를 짝으로 */
    const contrast = powerBlock && week !== 8;
    const variant: Record<SlotKind, VariantKey> = {
      power: a ? 'jump' : 'medball',
      bigLower: a ? 'squat' : 'hinge',
      pushPull: a ? 'push' : 'pull',
      singleLeg: 'singleLeg',
      core: powerBlock ? 'rotationalThrow' : 'antiRotation',
    };
    const order: SlotKind[] = contrast
      ? ['bigLower', 'power', 'pushPull', 'singleLeg', 'core']
      : ['power', 'bigLower', 'pushPull', 'singleLeg', 'core'];
    return {
      label: null,
      items: order.map((s) => {
        const [n, count, reserve] = LEGACY_TABLE[s][week - 1];
        return item(
          variant[s],
          WEIGHTED_SLOTS.includes(s) ? 'reserve' : 'none',
          reps(n, count, reserve),
          LEGACY_REST[s],
          s === 'power' && contrast ? { group: true } : {}
        );
      }),
    };
  },
};

/* ─────────────────────────── 기본기(성장기 · 입문) ─────────────────────────── */

/**
 * 기본기 4주 — 2026-10-09 사용자가 정함(docs/designs/youth-beginner-path.md): 만 13세부터 · 보호자 확인 없음 ·
 * 한 번에 7개(약 35분) · 성인 입문은 다 마치면 성인 프로그램이 열린다(profileBlock 의 basicsDone).
 *
 * 무게를 올려 주지 않는다 — 모두 mode 'none'(무게 추천 · '몇 개 더?' 없음). 청소년 웨이트는 감독 아래에서 안전하다는
 * 근거(Lloyd 2014, 설계 D10)와 부딪히지 않게 횟수 · 세트로만 올린다: 1주 2세트 × 8회 → 2주 세트 +1 → 3주 횟수 +2 → 4주 가볍게.
 * 날마다 같은 일곱 칸(전신) — 칸마다 운동 셋을 세션마다 돌린다(BASICS_ROTATION, 2026-10-16 김민 '같은 운동 연속 반복 금지').
 * 처음 배우는 사람은 같은 동작을 자주 하는 편이 자세가 빨리 익어(Faigenbaum 2009) 셋만 돌려 사흘마다 다시 만나게 했다.
 * 몸 상태 규칙(통증 멈춤 · 경기 앞뒤 쉼 · 회복 데이 가볍게)은 성인 프로그램과 같은 decideToday 를 탄다.
 */
const BASICS_WEEKS: readonly { sets: number; count: number }[] = [
  { sets: 2, count: 8 },
  { sets: 3, count: 8 },
  { sets: 3, count: 10 },
  { sets: 2, count: 8 },
];

const BASICS: ProgramDef = {
  id: 'basics-4w',
  goal: 'base',
  audience: 'basics',
  required: BASICS_REQUIRED_EQUIPMENT,
  name: '기본기 4주',
  origin: '성장기 · 입문 투수용 맨몸 · 가벼운 저항',
  summary: '무게 없이 자세부터 익혀요. 횟수와 세트만 조금씩 늘려요',
  how: '매번 7가지 동작을 운동만 바꿔 가며 해요. 처음 2주는 쉬운 동작이에요',
  why: '무게보다 자세부터 잡는 4주예요. 12번 중 10번 넘게 하면 다른 프로그램을 시작할 수 있어요',
  fit: '웨이트가 처음인 분',
  detail: [
    '날마다 일곱 가지를 해요. 던지기(메디신볼이 없으면 점프) · 스쿼트 · 밀기 · 힌지 · 당기기 · 한 다리 · 몸통 버티기예요. 세션마다 다른 운동으로 바꿔 가며 해요.',
    '1~2주는 쉬운 동작으로 자세를 익히고, 3~4주에 기본 동작으로 올라가요. 2주차에 세트가 하나 늘고, 3주차에 횟수가 둘 늘어요.',
    '4주는 가볍게 하고, 마지막 세션에 스쿼트 · 밀기를 자세가 무너지기 전까지 해 봐요.',
    '무게는 추천하지 않아요. 덤벨이나 밴드를 쓰면 같은 자세가 끝까지 유지되는 가장 가벼운 것으로 해요.',
    '12번 중 10번 넘게 하면 성인은 근력 · 파워 프로그램이 열려요. 만 18세 전이면 코치나 트레이너와 함께 무게를 시작해요.',
  ],
  weeks: 4,
  perWeek: [3],
  lightWeeks: [4],
  build: (day, week) => {
    const w = BASICS_WEEKS[week - 1];
    /* 무게는 추천하지 않되 얼마나 힘들게는 알려 준다 — 2개 남기고(2026-10-16 검토 ⑤) */
    const lift = (v: VariantKey) => item(v, 'none', reps(w.sets, w.count, 2), 60);
    /*
     * 마지막 세션(4주 셋째)은 점검 — 스쿼트 · 밀기 한 세트를 자세가 무너지기 전까지(2026-10-16 검토 ④). 4주차가 1주차와 같은 2×8 로만
     * 끝나 넘어갈 준비가 됐는지 알 길이 없었다. 적은 횟수는 세트 기록에 남는다.
     */
    const check = week === 4 && day % 3 === 0;
    const tested = (v: VariantKey) =>
      check ? item(v, 'none', [...reps(w.sets - 1, w.count, 2), { reps: w.count, plus: true }], 90) : lift(v);
    return {
      label: check ? '점검' : null,
      items: [
        /* 던지기 · 점프는 지치기 전에 맨 앞 */
        item('medball', 'none', reps(w.sets, 5), 90),
        tested('squat'),
        tested('push'),
        lift('hinge'),
        lift('pull'),
        lift('singleLeg'),
        item('antiRotation', 'none', reps(w.sets, 8), 45),
      ],
    };
  },
};

/* ─────────────────────────────── 시즌 중 ─────────────────────────────── */

/** 고르기 화면의 차례 — 기본기는 화면이 따로 맨 위에 둔다(audience) */
export const PROGRAMS: readonly ProgramDef[] = [
  STRONGLIFTS,
  W531,
  JUGGERNAUT,
  WS4SB,
  PITCHER_POWER,
  BASICS,
];
const ALL_PROGRAMS: readonly ProgramDef[] = [...PROGRAMS, LEGACY];

/* ─────────────────────────── 키 · 하루 만들기 ─────────────────────────── */

/** 진행 중인 줄의 프로그램 — DB 의 programKey 를 읽은 것 */
export type ProgramPlan = {
  key: string;
  def: ProgramDef;
  perWeek: PerWeek;
  totalWeeks: number;
  totalDays: number;
};

/** DB 의 programKey — 주 3번은 id 그대로, 주 2번은 'id:2'(DB 구조를 바꾸지 않으려고 키에 싣는다) */
export function programKeyOf(id: ProgramId, perWeek: PerWeek): string {
  return perWeek === 3 ? id : `${id}:2`;
}

/** programKey 를 읽는다. 모르는 키 · 그 프로그램에 없는 주당 횟수면 null */
export function parseProgram(key: string): ProgramPlan | null {
  const [id, suffix, ...rest] = key.split(':');
  if (rest.length > 0 || (suffix !== undefined && suffix !== '2')) return null;
  const def = ALL_PROGRAMS.find((p) => p.id === id);
  const perWeek: PerWeek = suffix === '2' ? 2 : 3;
  if (!def || !def.perWeek.includes(perWeek)) return null;
  return {
    key,
    def,
    perWeek,
    totalWeeks: def.weeks,
    totalDays: def.weeks * perWeek,
  };
}

export function programDef(id: string): ProgramDef | null {
  return PROGRAMS.find((p) => p.id === id) ?? null;
}

/** 카드 부제 — '세션 12번 · 주 3번이면 4주'(세션은 몸 상태에 따라 당기거나 미룬다 — dayLabel) */
export function planSubtitle(plan: ProgramPlan): string {
  return `세션 ${plan.totalDays}번 · 주 ${plan.perWeek}번이면 ${plan.totalWeeks}주`;
}

export function weekOfDay(plan: ProgramPlan, day: number): number {
  return Math.min(plan.totalWeeks, Math.max(1, Math.ceil(day / plan.perWeek)));
}

export function isLightWeek(plan: ProgramPlan, week: number): boolean {
  return plan.def.lightWeeks.includes(week);
}

/** 운동 하나의 그날 처방 — 운동 중 [교체]도 이 값을 쓴다(U3) */
export type ItemRx = {
  slot: SlotKind;
  variant: VariantKey;
  mode: WeightMode;
  sets: readonly SetRx[];
  /** 본 세트(가장 무거운 세트)의 횟수 — 카드의 '세트 × 횟수' · 무게 기록의 기준 */
  reps: number;
  /** reserve 방식의 목표 여유. 그 밖은 null */
  reserve: number | null;
  restSeconds: number;
  light: boolean;
  /** 앞 운동과 묶음(바로 이어서) */
  group: boolean;
  /** 최고까지 올리기(준비 세트 + 본 세트 하나) */
  top: boolean;
  /** 보조 운동 — 그날 운동을 돌아가며 고른다(assistFor) */
  assist: boolean;
};

/** 본 세트 — % 가 가장 높은 세트 중 마지막(5/3/1 의 + 세트). % 가 없으면 마지막 세트 */
export function topSetIndex(sets: readonly SetRx[]): number {
  let best = 0;
  sets.forEach((s, i) => {
    if ((s.pct ?? 0) >= (sets[best].pct ?? 0)) best = i;
  });
  return best;
}

function toRx(x: Item, light: boolean): ItemRx {
  const top = x.sets[topSetIndex(x.sets)];
  return {
    slot: SLOT_OF[x.variant],
    variant: x.variant,
    mode: x.mode,
    sets: x.sets,
    reps: top.reps,
    reserve: x.mode === 'reserve' ? (top.reserve ?? null) : null,
    restSeconds: x.rest,
    light,
    group: x.group === true,
    top: x.top === true,
    assist: x.assist === true,
  };
}

/** 그날 하는 것 — 차례대로. 일차는 1~totalDays 로 자른다. */
export function dayPlan(
  plan: ProgramPlan,
  day: number
): { label: string | null; items: ItemRx[] } {
  const d = Math.min(plan.totalDays, Math.max(1, day));
  const week = weekOfDay(plan, d);
  const light = isLightWeek(plan, week);
  const built = plan.def.build(d, week, plan.perWeek, light);
  return { label: built.label, items: built.items.map((x) => toRx(x, light)) };
}

/** 그날 그 변형의 처방(없으면 null) — 한 날에 같은 변형은 하나뿐이다(셀프테스트) */
export function itemRx(plan: ProgramPlan, day: number, variant: VariantKey): ItemRx | null {
  return dayPlan(plan, day).items.find((x) => x.variant === variant) ?? null;
}

/**
 * 변형이 쓰는 동작 열쇠(lib/engine/exercise-class.ts movementKeyOf 와 같은 말) — 고정 운동을 모를 때 쓰는 기본값.
 *
 * 변형 규칙(VARIANT_RULES)이 고르는 운동의 열쇠와 같다: 큰 하체 · 한 다리 · 밀기 · 당기기는 그 계열(하체 · 상체 스트렝스만 고르므로),
 * 점프는 하체 파워(파워 · 스쿼트 · 런지), 메디신볼 · 회전 던지기는 상체 파워(먼저 고르는 것이 던지기 — 밀기 · 당기기 · 회전).
 * 몸통 버티기는 코어라 열쇠가 없다(null). 기본기의 메디신볼 칸은 공이 없으면 맨몸 점프로 채운다 — 그런 칸 · 뛰며 던지는 것을 고정한
 * 칸은 기본값이 틀리니, 고정 운동을 아는 쪽은 patternsOfProgramDay 의 exerciseOf 로 넘긴다.
 */
export const VARIANT_MOVEMENT_KEY: Record<VariantKey, string | null> = {
  squat: '스쿼트',
  hinge: '힌지',
  push: '밀기',
  ohp: '밀기',
  pull: '당기기',
  singleLeg: '런지',
  jump: LOWER_POWER_KEY,
  medball: UPPER_POWER_KEY,
  antiRotation: null,
  coreStab: null,
  rotationalThrow: UPPER_POWER_KEY,
  /* 플라이오 푸시업도 팔 플라이오(isArmPlyo — 파워 · 밀기) — 팔을 다 쓴 날 던지기와 같이 미룬다(ARM_THROW_VARIANTS) */
  plyoPush: UPPER_POWER_KEY,
  hpull: '당기기',
  vpull: '당기기',
  pushAcc: '밀기',
  hamstring: '힌지',
  scap: null,
  triceps: null,
  biceps: null,
  forearm: null,
};

/**
 * 그날(일차) 프로그램이 쓰는 동작 열쇠 — 매일 일정이 같은 동작을 겹쳐 내지 않게 고르기 점수(2판 P5)가 읽는다. 예: 내일 프로그램
 * 일차에 스쿼트 · 밀기 칸이 있으면 오늘 일정의 바벨 스쿼트 · 벤치 프레스를 뒤로 민다.
 *
 * 순수 도우미다 — 무엇을 할지(dayPlan)만 읽고 몸 상태 · 그날 조정(decideToday)은 보지 않는다(그날 빠지는 칸이 있어도 '하기로 한 것'을
 * 센다). plan 이 null(모르는 키 — parseProgram 실패)이면 빈 집합. exerciseOf 로 변형마다 고정한 운동을 넘기면 그 운동의 열쇠를 쓰고
 * (movementKeyOf — 기본값보다 정확하다), 운동을 모르는 변형은 VARIANT_MOVEMENT_KEY 로. 열쇠가 없는 칸(코어)은 넣지 않는다.
 * 같은 plan · day · 고정이면 늘 같은 집합이다.
 */
export function patternsOfProgramDay(
  plan: ProgramPlan | null,
  day: number,
  exerciseOf?: (variant: VariantKey) => (ClassifiableExercise & { title?: string }) | null | undefined
): Set<string> {
  const out = new Set<string>();
  if (!plan) return out;
  for (const x of dayPlan(plan, day).items) {
    const ex = exerciseOf?.(x.variant);
    /* 두 분류에 드는 운동(박스 스쿼트 — 파워)은 그 칸의 열쇠로 — 본운동 칸에서는 스트렝스 계열이다 */
    const key = ex && !(ex.title && ALSO_IN[ex.title]) ? movementKeyOf(ex) : VARIANT_MOVEMENT_KEY[x.variant];
    if (key != null) out.add(key);
  }
  return out;
}

/** 칸 이름 — 기본기의 첫 칸은 메디신볼이 없으면 점프로 채워 '던지기 · 점프'라 부른다 */
export function variantLabel(v: VariantKey, audience: ProgramAudience = 'adult'): string {
  return audience === 'basics' && v === 'medball' ? '던지기 · 점프' : VARIANT_LABELS[v];
}

/** 이 프로그램이 쓰는 변형 — 시작 시트 · 고정 운동 바꾸기는 이것만 보여 준다 */
export function usedVariants(def: ProgramDef): VariantKey[] {
  const used = new Set<VariantKey>();
  for (const perWeek of def.perWeek) {
    for (let day = 1; day <= def.weeks * perWeek; day++) {
      const week = Math.ceil(day / perWeek);
      for (const x of def.build(day, week, perWeek, def.lightWeeks.includes(week)).items)
        used.add(x.variant);
    }
  }
  return VARIANT_KEYS.filter((v) => used.has(v));
}

/*
 * 이름표 — 'N번 세션'(2026-10-14 김민: 'N주차 · M일차' 대신 세션으로). 프로그램은 달력이 아니라 차례로 나아간다 — 마친 세션만큼 넘어가고,
 * 막는 날은 통증 · 경기 앞뒤뿐이라(decideToday) 몸 상태에 따라 날마다 이어 하거나 미뤄 4주 앞뒤로 맞출 수 있다. 주차는 이름표에서 빼고
 * 가벼운 주(lightWeeks) · 처방에만 쓴다(세션 차례로 셈 — weekOfDay).
 */
export function dayLabel(plan: ProgramPlan, day: number): string {
  const label = dayPlan(plan, day).label;
  return `${day}번 세션${label ? ` · ${label}` : ''}`;
}

/** 세트만 바꾼 처방 — 본 세트 횟수 · 여유를 남은 세트로 다시 정한다(가볍게 · 운동 중 교체) */
export function withSets(rx: ItemRx, sets: readonly SetRx[]): ItemRx {
  const top = sets[topSetIndex(sets)];
  return {
    ...rx,
    sets,
    reps: top.reps,
    reserve: rx.mode === 'reserve' ? (top.reserve ?? null) : null,
  };
}

/** 세트를 하나 줄인 처방 — 그날 '가볍게'(D19) */
export function lighterRx(rx: ItemRx): ItemRx {
  return withSets(rx, rx.sets.slice(0, Math.max(1, rx.sets.length - 1)));
}

/**
 * 운동 화면이 마지막 세트 뒤에 '몇 개 더?'를 묻는가 — 무게 칸 · '몇 개 남기고' 방식 · 가벼운 주가 아닐 때만.
 * % 방식은 기준 무게가 4주 동안 그대로, 스트롱리프트는 다 채웠는지만 본다. mode 가 없는 옛 판은 '몇 개 남기고'다.
 */
export function asksReserve(
  slot: { slot: SlotKind; light: boolean; mode?: WeightMode } | null | undefined,
  plannedSets: number | null
): boolean {
  return (
    slot != null &&
    (slot.mode ?? 'reserve') === 'reserve' &&
    WEIGHTED_SLOTS.includes(slot.slot) &&
    !slot.light &&
    plannedSets != null
  );
}

/** 시작할 때 저장하는 키 — 목록에 없는 프로그램(옛 프로그램 포함) · 그 프로그램에 없는 주당 횟수면 null */
export function startProgramKey(programId: string, perWeek: number): string | null {
  const def = programDef(programId);
  const pw = perWeek === 2 ? 2 : perWeek === 3 ? 3 : null;
  if (!def || pw == null || !def.perWeek.includes(pw)) return null;
  return programKeyOf(def.id, pw);
}

const pctText = (pct: number) => `${Math.round(pct * 200) / 2}%`;
const kgText = (kg: number) => `${Number.isInteger(kg) ? kg : kg.toFixed(1)}kg`;

/**
 * 처방 한 줄(§13-3) — '4세트 × 5회 · 2개 남기고', 가벼운 주는 '가볍게 · 4개 남기고', 파워는 '최대 속도 · 충분히 쉬고'.
 * % 방식은 같은 세트끼리 묶어 '5회 65% → 5회 75% → 5회+ 85%', 무게(kgs)를 알면 % 대신 kg.
 */
export function prescriptionLine(
  rx: ItemRx,
  opts: { perSide?: boolean; kgs?: readonly (number | null)[] } = {}
): string {
  const side = opts.perSide ? ' (좌우 각각)' : '';
  const n = rx.sets.length;
  if (rx.mode === 'none') {
    /* 기본기 점검 세트('+') — 앞 세트는 그대로, 마지막은 자세가 무너지기 전까지 */
    if (rx.sets[n - 1].plus) {
      return n > 1
        ? `${n - 1}세트 × ${rx.sets[0].reps}회 · 마지막 세트는 자세가 무너지기 전까지${side}`
        : `1세트 · 자세가 무너지기 전까지${side}`;
    }
    const base = `${n}세트 × ${rx.sets[0].reps}회${side}`;
    if (rx.slot === 'power') return `${base} · 최대 속도 · 충분히 쉬고`;
    /* 무게 없이도 여유는 알려 준다(기본기, SetRx.reserve) */
    return rx.sets[0].reserve != null ? `${base} · ${rx.sets[0].reserve}개 남기고` : base;
  }
  if (rx.top) {
    return `준비 세트로 올려 ${rx.reps}회 1세트${side} · ${rx.reserve ?? 1}개 남기고`;
  }
  if (rx.mode === 'reserve') {
    const base = `${n}세트 × ${rx.reps}회${side}`;
    if (rx.reserve == null) return base;
    return rx.light
      ? `${base} · 가볍게 · ${rx.reserve}개 남기고`
      : `${base} · ${rx.reserve}개 남기고`;
  }
  if (rx.mode === 'linear')
    return `${n}세트 × ${rx.reps}회${side} · ${rx.reserve != null ? `${rx.reserve}개 남기고 · ` : ''}다 채우면 다음에 올려요`;
  const kgs = opts.kgs;
  const same = (i: number, j: number) =>
    rx.sets[i].reps === rx.sets[j].reps &&
    rx.sets[i].pct === rx.sets[j].pct &&
    !rx.sets[i].plus &&
    !rx.sets[j].plus &&
    (kgs?.[i] ?? null) === (kgs?.[j] ?? null);
  const parts: string[] = [];
  for (let i = 0; i < n; ) {
    let j = i;
    while (j + 1 < n && same(j + 1, i)) j++;
    const s = rx.sets[i];
    const kg = kgs?.[i];
    const amount = kg != null ? kgText(kg) : pctText(s.pct ?? 0);
    const count = j > i ? `${j - i + 1}세트 × ${s.reps}회` : `${s.reps}회${s.plus ? '+' : ''}`;
    parts.push(`${count} ${amount}`);
    i = j + 1;
  }
  /* 성장기(youthRx)면 reserve 가 + 세트의 남김이다 */
  const plus = rx.sets.some((s) => s.plus) ? ` · +는 ${rx.reserve ?? PLUS_RESERVE}개 남기고` : '';
  return `${parts.join(' → ')}${side}${plus}`;
}

/* ─────────────────────────── 고르기 화면 ─────────────────────────── */

/** 고르기 화면(program-start.tsx)에 넘기는 것 — 글과 숫자만 */
export type ProgramChoice = Pick<
  ProgramDef,
  'id' | 'goal' | 'name' | 'origin' | 'summary' | 'detail' | 'perWeek'
> & {
  why: string | null;
  fit: string | null;
  how: string | null;
  /** 주마다 본 운동 한 줄 — '1주 · 스쿼트 5회 65% → 5회 75% → 5회+ 85%' */
  weeks: string[];
  /** 기준 무게(% 방식)를 쓰는가 — 요약의 무게 안내가 다르다 */
  usesPct: boolean;
  audience: ProgramAudience;
  /** 꼭 있어야 하는 장비 — 기본기는 없음(맨몸) */
  required: string[];
};

export function programChoiceList(): ProgramChoice[] {
  return PROGRAMS.map((def) => {
    const perWeek = def.perWeek.includes(3) ? 3 : 2;
    const plan = parseProgram(programKeyOf(def.id, perWeek)) as ProgramPlan;
    const weeks = Array.from({ length: def.weeks }, (_, i) => {
      const week = i + 1;
      const items = dayPlan(plan, i * perWeek + 1).items;
      /* 무게 없는 프로그램(기본기)은 큰 하체 칸으로 보인다 */
      const main =
        items.find((x) => x.mode !== 'none') ?? items.find((x) => x.slot === 'bigLower');
      const light = isLightWeek(plan, week) ? ' (가볍게)' : '';
      return main
        ? `${week}주${light} · ${VARIANT_LABELS[main.variant]} ${prescriptionLine(main)}`
        : `${week}주${light}`;
    });
    return {
      id: def.id,
      goal: def.goal,
      name: def.name,
      origin: def.origin,
      summary: def.summary,
      why: def.why ?? null,
      fit: def.fit ?? null,
      how: def.how ?? null,
      detail: def.detail,
      perWeek: def.perWeek,
      weeks,
      usesPct: Array.from({ length: plan.totalDays }, (_, d) => dayPlan(plan, d + 1)).some(
        (p) => p.items.some((x) => x.mode === 'pct')
      ),
      audience: audienceOf(def),
      required: [...requiredOf(def)],
    };
  });
}

/* ─────────────────────────── 시작 자격(§1) ─────────────────────────── */

/**
 * 근력 · 파워 프로그램의 아래 끝 — 2026-10-14 사용자: "중학생들도 다 웨이트 할 수 있어"(예전 18). 만 16세 미만은 성장기 규칙을 같이 건다
 * (매일 일정과 같은 선 lib/report/plan.ts YOUTH_AGE_THRESHOLD): 강도 '매우 높음' 운동은 안 고르고(variantCandidates youth), 본 세트 ·
 * + 세트 · 직선 증량도 YOUTH_RESERVE 개 남기고(youthRx).
 */
export const PROGRAM_MIN_AGE = 13;

/** 성장기 처방에서 남기는 개수 — 매일 일정의 CAUTIOUS_RESERVE(lib/workout/free-weight.ts)와 같다 */
export const YOUTH_RESERVE = 3;

/** 성장기인가 — 매일 일정과 같은 선(만 16세 미만). 나이를 모르면 아니다 */
export function isYouthAge(age: number | null | undefined): boolean {
  return age != null && age < YOUTH_AGE_THRESHOLD;
}

/** 성장기 처방 — 무게를 드는 칸은 YOUTH_RESERVE 개 남기고(% 방식의 + 세트 · 직선 증량 포함). 무게 없는 칸(none)은 그대로 */
export function youthRx(rx: ItemRx): ItemRx {
  if (rx.mode === 'none') return rx;
  return { ...rx, reserve: Math.max(rx.reserve ?? 0, YOUTH_RESERVE) };
}
/** 기본기 4주의 아래 끝(2026-10-09 사용자) */
export const BASICS_MIN_AGE = 13;

export type EligibilityInput = {
  /** 어느 프로그램의 자격인가 — 없으면 adult */
  audience?: ProgramAudience;
  /** 기본기 4주를 다 마친 적이 있는가 — 성인 입문은 마치면 성인 프로그램이 열린다(2026-10-09) */
  basicsDone?: boolean;
  /** 만 나이. 생년월일이 없으면 null */
  age: number | null;
  /** 경력 이름(입문 · 초급 · 중급 · 상급). 안 골랐으면 null */
  trainingLevel: string | null;
  /** 가진 장비. 비어 있으면 아직 안 고른 것(§13-21 — '모두'로 보지 않는다) */
  ownedEquipment: readonly string[];
};

export type EligibilityStep = 'birth' | 'level' | 'equipment';

export type Eligibility =
  | { ok: true }
  /** 시작 흐름에서 마저 받으면 되는 것 */
  | { ok: false; kind: 'ask'; step: EligibilityStep; message: string }
  /** 이 프로그램은 안 되는 사람 — 까닭 한 줄 + 할 일 하나 */
  | { ok: false; kind: 'blocked'; reason: string; action: string };

export type ProgramBlock = { reason: string; action: string };

/**
 * 프로필(나이 · 경력)로 이미 아는 막힘 — 고르기 화면(training/page.tsx)과 시작 자격이 같은 글을 쓴다. 나이를 모르면 나이는 안 본다
 * (시작 흐름이 묻는다). 성인: 만 18세 미만 · 입문(기본기를 마쳤으면 열림). 기본기: 만 13세 미만.
 */
export function profileBlock(input: {
  audience?: ProgramAudience;
  age: number | null;
  trainingLevel: string | null;
  basicsDone?: boolean;
}): ProgramBlock | null {
  const basics = input.audience === 'basics';
  if (input.age != null) {
    if (basics && input.age < BASICS_MIN_AGE) {
      return {
        reason: `기본기 4주는 만 ${BASICS_MIN_AGE}세부터 해요.`,
        action: '직접 고르기의 가벼운 운동으로 몸을 익혀요.',
      };
    }
    if (!basics && input.age < PROGRAM_MIN_AGE) {
      return {
        reason: `이 프로그램은 만 ${PROGRAM_MIN_AGE}세부터 해요.`,
        action:
          input.age >= BASICS_MIN_AGE
            ? '기본기 4주로 자세부터 익혀요.'
            : '직접 고르기의 가벼운 운동으로 자세부터 익혀요.',
      };
    }
  }
  if (!basics && input.trainingLevel === '입문' && !input.basicsDone) {
    return {
      reason: '웨이트를 6개월 넘게 한 사람에게 맞춘 프로그램이에요.',
      action: '기본기 4주를 마치면 열려요. 건너뛴 날은 세지 않아요.',
    };
  }
  return null;
}

/**
 * 시작할 수 있는가. 묻는 차례는 시작 시트의 차례(§13-12)와 같다 — 생년월일 · 경력 · 장비.
 * 시즌은 2026-10-10 에 묻지 않기로 했다(사용자: "시즌 정하는 건 다 빼").
 * 고르기 카드는 프로필로 이미 아는 막힘만 보고(나이 · 경력 — profileBlock), 나머지는 시트에서 받는다.
 * 기본기는 덤벨 · 밴드(BASICS_REQUIRED_EQUIPMENT).
 */
export function checkEligibility(input: EligibilityInput): Eligibility {
  const audience = input.audience ?? 'adult';
  if (input.age == null) {
    return { ok: false, kind: 'ask', step: 'birth', message: '생년월일을 알려 주세요' };
  }
  const block = profileBlock(input);
  if (block) return { ok: false, kind: 'blocked', ...block };
  if (input.trainingLevel == null) {
    return {
      ok: false,
      kind: 'ask',
      step: 'level',
      message: '운동 경력을 골라 주세요',
    };
  }
  if (input.ownedEquipment.length === 0) {
    return {
      ok: false,
      kind: 'ask',
      step: 'equipment',
      message: '가진 장비를 골라 주세요',
    };
  }
  const gear = equipmentBlock(
    input.ownedEquipment,
    audience === 'basics' ? BASICS_REQUIRED_EQUIPMENT : REQUIRED_EQUIPMENT
  );
  if (gear) return { ok: false, kind: 'blocked', ...gear };
  return { ok: true };
}

export function missingEquipment(
  owned: readonly string[],
  required: readonly string[] = REQUIRED_EQUIPMENT
): string[] {
  const has = new Set(owned);
  return required.filter((e) => !has.has(e));
}

/**
 * 저장된 장비로 막힘 — 시작 자격과 고르기 화면의 소개 쪽이 같은 글을 쓴다(2026-10-09 검토: 장비가 이미 저장된 사람은 시트에서
 * 장비 칸을 건너뛰어, 빠진 장비를 마지막 [시작]에서야 알았다 — 기본기를 맨몸으로 마친 성인 입문이 바로 그 길이다).
 */
export function equipmentBlock(
  owned: readonly string[],
  required: readonly string[] = REQUIRED_EQUIPMENT
): ProgramBlock | null {
  const missing = missingEquipment(owned, required);
  if (missing.length === 0) return null;
  return {
    reason: `${withJosa(missing.join(', '), '이/가')} 있어야 할 수 있어요.`,
    action: '트레이닝 설정에서 장비를 고치거나, 장비가 생기면 다시 시작해요.',
  };
}

/**
 * 기본기를 '마쳤다'고 칠 만큼 했나 — 일차 절반(올림) 넘게 실제로 한 날(건너뛴 날 빼고). 프로그램의 '다 마침'(status done)은
 * 완료 + 건너뜀으로 끝까지 간 것이라(설계 §9), 열두 날을 다 건너뛰어도 done 이 된다. 성인 입문의 막힘을 푸는 데는 그것으로
 * 모자란다(2026-10-09 검토).
 */
export function basicsDoneEnough(plan: ProgramPlan, nextDay: number, skippedDays: number): boolean {
  const did = Math.min(plan.totalDays, nextDay - 1) - skippedDays;
  /* 12번 중 10번(2026-10-16 검토 ③ — 예전 절반 6번은 화면 글 '다 마치면'과 어긋났다) */
  return did >= plan.totalDays - 2;
}

/* ─────────────────────────── 운동 고정(§3 · U6) ─────────────────────────── */

export type PinnableExercise = {
  id: string;
  title: string;
  category: string;
  movementPattern: string | null;
  equipment: string[];
  intensity: string;
  difficulty: string | null;
  perSide: boolean;
};

/*
 * 몸통 칸은 라이브러리에 동작 계열이 없다(코어는 movementPattern 이 비어 있다). 그래서 이름으로 고른다.
 * 항회전 = 돌아가지 않게 버티기, 회전 던지기 = 메디신볼로 돌려 던지기(없으면 돌리는 코어로 대신).
 */
const ANTI_ROTATION_WORDS = ['팔로프', '안티 로테이션', '찹', '리프트'];
/* 밴드 · 케이블이 없는 사람의 대신 — 한쪽으로 들고 걷기(돌아가지 않게 버틴다) · 플랭크 계열 */
const ANTI_ROTATION_FALLBACK_WORDS = ['캐리', '사이드 플랭크', '버드독', '데드버그'];
const ROTATION_WORDS = ['로테이션', '트위스트', '회전'];

const BARBELL_FIRST = (ex: PinnableExercise) => (ex.equipment.includes('바벨') ? 0 : 1);
/** 머리 위로 미는 운동 — 투수 어깨라 밀기 칸에서 맨 뒤 */
const OVERHEAD_PRESS = /숄더 프레스|밀리터리|푸시 프레스|오버헤드/;

type VariantRule = {
  /** 후보인가 */
  match: (ex: PinnableExercise) => boolean;
  /** 앞에 올수록 먼저 고른다(작을수록 앞) */
  rank: (ex: PinnableExercise) => number[];
};

const isWeighted = (ex: PinnableExercise) =>
  ex.equipment.some((e) => ['바벨', '덤벨', '케틀벨', '원판', '케이블'].includes(e));
/*
 * 근력 보조(당기기 · 보조 밀기 · 햄스트링) — 무게를 올려 갈 수 있는 것만. 풀업 · 친업은 맨몸이라도 든다. 2026-10-16 김민: 밴드 · 튜빙 ·
 * 맨몸 회복형(하프닐링 밴드 풀다운 · 인클라인 푸시업 · 햄스트링 다이버 · 보수볼 RDL)이 근력 프로그램 보조로 나왔다 — 그건 암케어 · 회복 몫.
 */
const loadableAccessory = (ex: PinnableExercise) =>
  (isWeighted(ex) || /풀업|친업/.test(ex.title)) &&
  intensityLevel(ex.intensity) >= 3 &&
  !/보수볼/.test(ex.title);

const VARIANT_RULES: Record<VariantKey, VariantRule> = {
  /* 큰 하체는 두 발로, 무게를 들고, 강도 '높음' 이상 — 바벨을 먼저 */
  squat: {
    match: (ex) =>
      inCategory(ex, '하체 스트렝스') &&
      ex.movementPattern === '스쿼트' &&
      !ex.perSide &&
      isWeighted(ex) &&
      intensityLevel(ex.intensity) >= 4,
    rank: (ex) => [BARBELL_FIRST(ex)],
  },
  hinge: {
    match: (ex) =>
      inCategory(ex, '하체 스트렝스') &&
      ex.movementPattern === '힌지' &&
      !ex.perSide &&
      isWeighted(ex) &&
      intensityLevel(ex.intensity) >= 4,
    /* 데드리프트 · RDL 이 큰 힌지다 — 힙 쓰러스트는 보조라 뒤로 */
    /* 원본(5×5 · 5/3/1)의 큰 힌지는 데드리프트 — RDL 은 그다음(2026-10-14) */
    rank: (ex) => [/데드리프트/.test(ex.title) ? 0 : /RDL/.test(ex.title) ? 1 : 2, BARBELL_FIRST(ex)],
  },
  /*
   * 밀기는 바벨 벤치 프레스를 먼저(2026-10-14 김민: "벤치를 덤벨 프레스로 바꿀 필요 없다 — 벤치도 중요하다". 예전엔 어깨 보호로 덤벨을 먼저 골랐다).
   * 퍼센트 · 직선 증량 프로그램은 2.5kg 씩 오르는 바벨이 맞다(덤벨은 한 걸음이 짝마다 2.5kg 라 너무 크다). 투수 맞춤은 그대로 — 머리 위로 미는 것은
   * 맨 뒤, 느리게 내리기 · 인클라인은 그 앞. 바벨 · 벤치가 없으면 덤벨 벤치 프레스 · 중량 푸시업으로.
   */
  push: {
    match: (ex) =>
      inCategory(ex, '상체 스트렝스') &&
      ex.movementPattern === '밀기' &&
      !ex.perSide &&
      isWeighted(ex) &&
      intensityLevel(ex.intensity) >= 4,
    rank: (ex) => [
      OVERHEAD_PRESS.test(ex.title) ? 1 : 0,
      ex.title.includes('에센트릭') ? 1 : 0,
      ex.title.includes('인클라인') ? 1 : 0,
      BARBELL_FIRST(ex),
    ],
  },
  /* 머리 위 밀기 — 바벨(밀리터리 프레스)을 먼저, 없으면 덤벨 숄더 프레스 */
  ohp: {
    match: (ex) =>
      inCategory(ex, '상체 스트렝스') &&
      ex.movementPattern === '밀기' &&
      OVERHEAD_PRESS.test(ex.title) &&
      isWeighted(ex) &&
      intensityLevel(ex.intensity) >= 3,
    rank: (ex) => [ex.perSide ? 1 : 0, BARBELL_FIRST(ex)],
  },
  /*
   * 당기기(로우) — 스트롱리프트 본운동. 바벨 로우를 먼저(원본 그대로 — 2026-10-15 사용자: '허리 부담이라 바벨 로우는 맨 뒤' 규칙을 없앰).
   * 무거운 것이 적어 '중간'까지 받는다. 버티기(아이소) · 빠르게(스피드) · 풀오버 · 풀다운(세로 당기기 칸의 것)은 뒤로.
   */
  pull: {
    match: (ex) =>
      inCategory(ex, '상체 스트렝스') &&
      ex.movementPattern === '당기기' &&
      isWeighted(ex) &&
      intensityLevel(ex.intensity) >= 3,
    rank: (ex) => [
      /로우/.test(ex.title) && !/아이소|스피드/.test(ex.title) ? 0 : 1,
      BARBELL_FIRST(ex),
      ex.perSide ? 1 : 0,
      -intensityLevel(ex.intensity),
    ],
  },
  singleLeg: {
    match: (ex) =>
      inCategory(ex, '하체 스트렝스') &&
      ex.movementPattern === '런지' &&
      loadableAccessory(ex),
    /* 스플릿 스쿼트 · 리버스 런지가 무게를 올려 가기 좋은 한쪽 하체다. 불안정 지면(보수볼)은 빠진다(보조 칸은 차례를 섞어 rank 가 안 막는다) */
    rank: (ex) => [
      /보수볼/.test(ex.title) ? 1 : 0,
      /스플릿 스쿼트|리버스 런지/.test(ex.title) ? 0 : 1,
      ex.equipment.includes('덤벨') ? 0 : 1,
      -intensityLevel(ex.intensity),
    ],
  },
  /* 파워 점프는 맨몸 · 박스로 뛰는 것 — 두 발 점프를 먼저 */
  jump: {
    match: (ex) =>
      inCategory(ex, '파워') &&
      (ex.movementPattern === '스쿼트' || ex.movementPattern === '런지') &&
      ex.equipment.every((e) => e === '맨몸' || e === '박스'),
    rank: (ex) => [ex.perSide ? 1 : 0, ex.title.includes('점프') ? 0 : 1],
  },
  medball: {
    /* 앞 · 위로 던지기 — 돌려 던지기(회전)는 회전 던지기 칸 몫이라 뺀다(2026-10-16: 투수 파워에서 두 칸이 같은 회전 토스를 고르던 것) */
    match: (ex) =>
      inCategory(ex, '파워') &&
      ex.equipment.includes('메디신볼') &&
      /* 뛰며 던지는 것(바운드 + 슬램)도 뺀다 — 점프는 점프 칸 몫(투수 파워 밀기 날에 다리를 또 뛰던 것) */
      /* 힌지 = 엉덩이를 펴며 앞으로 던지기(헤비 메디신볼 힌지 토스, 2026-10-16 — 이 칸이 운동 둘만 번갈아 나와 큰 공 드릴을 옮겼다) */
      (ex.movementPattern === '밀기' || ex.movementPattern === '당기기' || ex.movementPattern === '힌지'),
    /* 던지기(밀기 · 당기기 · 힌지 계열)를 먼저, 뛰며 던지는 것은 맨 뒤 */
    rank: (ex) => [
      ex.movementPattern === '밀기' || ex.movementPattern === '당기기' || ex.movementPattern === '힌지'
        ? 0
        : ex.movementPattern === '회전'
          ? 1
          : 2,
    ],
  },
  antiRotation: {
    match: (ex) =>
      inCategory(ex, '코어') &&
      [...ANTI_ROTATION_WORDS, ...ANTI_ROTATION_FALLBACK_WORDS].some((w) =>
        ex.title.includes(w)
      ),
    rank: (ex) => [
      ANTI_ROTATION_WORDS.some((w) => ex.title.includes(w)) ? 0 : 1,
      ex.title.includes('팔로프') ? 0 : ex.title.includes('캐리') ? 1 : 2,
    ],
  },
  /* 회전 던지기 — 메디신볼을 먼저, 없으면 돌리는 코어 */
  /*
   * 회전 던지기 — 이름에 회전 동작이 든 메디신볼 던지기(스쿱 · 사이드 · 로테이셔널)를 먼저. 2026-10-14 라이브러리에는 그런 던지기가 없고
   * 오버헤드 · 푸시 슬램이 '회전'으로 적혀 이 칸에 들어왔다(위아래로 던지는 것이라 회전이 아니다) — 그래서 이름도 본다. 없으면 돌리는 코어
   * (케이블 · 랜드마인 로테이션을 앉아서 비트는 러시안 트위스트보다 먼저).
   * 2026-10-15 투구 드릴의 회전 던지기 6개를 파워로 복사했다(scripts/library-power-plyo-2026-10-15.mjs) — 이름이 '… 스로우 · 토스 · 숏풋'이라
   * 그 낱말도 본다(슬램은 여전히 빠진다).
   */
  /* 플라이오 푸시업 — 바닥(맨몸)을 먼저, 없으면 인클라인(박스). 밴드 보조(매우 높음)는 뺀다 */
  plyoPush: {
    match: (ex) =>
      inCategory(ex, '파워') &&
      ex.movementPattern === '밀기' &&
      ex.title.includes('플라이오 푸시업') &&
      intensityLevel(ex.intensity) <= intensityLevel('높음'),
    rank: (ex) => [ex.title.includes('인클라인') ? 1 : 0],
  },
  rotationalThrow: {
    match: (ex) =>
      (inCategory(ex, '파워') &&
        ex.equipment.includes('메디신볼') &&
        ex.movementPattern === '회전' &&
        /로테이션|로테이셔널|회전|스쿱|사이드|쉿|스로우|토스|숏풋/.test(ex.title)) ||
      (inCategory(ex, '코어') &&
        ROTATION_WORDS.some((w) => ex.title.includes(w)) &&
        !ANTI_ROTATION_WORDS.some((w) => ex.title.includes(w))),
    rank: (ex) => [inCategory(ex, '파워') ? 0 : 1, /트위스트/.test(ex.title) ? 1 : 0],
  },
  /*
   * 보조 메뉴 칸(ACCESSORY_KEYS) — 고르기 차례(rank)는 쓰지 않는다(accessoryPick 이 사람마다 섞는다). 버티기(아이소 · 홀드)는 처방이
   * '세트 × 회'라 빠진다. 팔 · 어깨 뒤쪽은 암케어 운동도 쓴다 — 무게 · 횟수로 하는 것만(에센트릭 오버로드 · 아이소메트릭 프레스는 암케어 몫).
   */
  /* 몸통 안정 — 앞 · 옆으로 버티는 것(플랭크 · 데드버그 · 버드독 · 캐리 · 베어). 돌거나 돌지 않게 버티는 것(몸통 버티기 칸)은 뺀다 */
  coreStab: {
    match: (ex) =>
      inCategory(ex, '코어') &&
      /플랭크|데드버그|버드독|캐리|베어|바디 소|겟업|레그 드롭|스터 더 팟/.test(ex.title) &&
      !ANTI_ROTATION_WORDS.some((w) => ex.title.includes(w)) &&
      !ROTATION_WORDS.some((w) => ex.title.includes(w)),
    rank: () => [],
  },
  hpull: {
    match: (ex) =>
      inCategory(ex, '상체 스트렝스') &&
      ex.movementPattern === '당기기' &&
      !VERTICAL_PULL.test(ex.title) &&
      !ex.title.includes('풀오버') &&
      loadableAccessory(ex),
    rank: () => [],
  },
  vpull: {
    match: (ex) =>
      inCategory(ex, '상체 스트렝스') && ex.movementPattern === '당기기' && VERTICAL_PULL.test(ex.title) && loadableAccessory(ex),
    rank: () => [],
  },
  /* 보조 밀기 — 덤벨 · 케이블 · 푸시업 종류(바벨은 본운동 몫). 머리 위 프레스도 든다(2026-10-14 사용자: 투수도 머리 위 운동을 한다) */
  pushAcc: {
    match: (ex) =>
      inCategory(ex, '상체 스트렝스') && ex.movementPattern === '밀기' && !ex.equipment.includes('바벨') && loadableAccessory(ex),
    rank: () => [],
  },
  hamstring: {
    match: (ex) =>
      inCategory(ex, '하체 스트렝스') && ex.movementPattern === '힌지' && !ex.equipment.includes('바벨') && loadableAccessory(ex),
    rank: () => [],
  },
  scap: {
    match: (ex) => ARM_ACCESSORY_CATEGORIES.includes(ex.category) && SCAP_WORDS.test(ex.title),
    rank: () => [],
  },
  triceps: {
    match: (ex) =>
      ARM_ACCESSORY_CATEGORIES.includes(ex.category) &&
      /트라이셉스|푸시다운|킥백/.test(ex.title) &&
      !/리스트|힙|레그/.test(ex.title) &&
      /* 강도 '낮음'(덤벨 킥백 · 밴드 푸시다운)은 프로그램에 안 넣는다 — 2026-10-16 김민 */
      intensityLevel(ex.intensity) >= 3,
    rank: () => [],
  },
  biceps: {
    match: (ex) =>
      ARM_ACCESSORY_CATEGORIES.includes(ex.category) &&
      /컬/.test(ex.title) &&
      !/노르딕|레그|핑거|리스트|드롭 캐치|에센트릭/.test(ex.title),
    rank: () => [],
  },
  forearm: {
    match: (ex) =>
      ARM_ACCESSORY_CATEGORIES.includes(ex.category) &&
      /리스트 (익스텐션|플렉션)|전완|디비에이션|파머스|바텀업/.test(ex.title) &&
      !/에센트릭|아이소메트릭/.test(ex.title),
    rank: () => [],
  },
};

const VERTICAL_PULL = /풀업|친업|풀다운/;
const ARM_ACCESSORY_CATEGORIES = ['상체 스트렝스', '암케어'];
const SCAP_WORDS = /페이스 ?풀|풀 어파트|리버스 플라이|리어델트|[YTW] 레이즈|튜빙 W/;

/*
 * 기본기(성장기 · 입문)의 고르기 — 바벨 · 원판 · 케이블 없이, 강도 '매우 높음' · 난이도 상급은 빼고. 2026-10-09 라이브러리를
 * 읽어 보고 정했다: 맨몸만 있어도 일곱 칸이 다 찬다(템포 맨몸 스쿼트 · 푸시업 · 양발 글루트 브리지 · 레터럴 런지 · 데드버그 · 포고 홉,
 * 당기기만 맨몸이 없어 철봉 · 밴드 · TRX · 덤벨 중 하나가 있어야 한다).
 */
const BASICS_EQUIPMENT = new Set([
  '맨몸',
  '밴드',
  '덤벨',
  '케틀벨',
  '메디신볼',
  '박스',
  '벤치',
  '철봉',
  'TRX',
]);
const basicFit = (ex: PinnableExercise) =>
  ex.equipment.every((e) => BASICS_EQUIPMENT.has(e)) &&
  intensityLevel(ex.intensity) <= 4 &&
  ex.difficulty !== '상급';
/** 이름에 든 말의 차례 — 앞에 있을수록 먼저, 없으면 맨 뒤 */
const wordRank = (title: string, words: readonly string[]) => {
  const at = words.findIndex((w) => title.includes(w));
  return at === -1 ? words.length : at;
};
/* 버티기(아이소) · 불안정 지면(보수볼) · 느리게 내리기 · 한쪽 커시는 처음 배우는 동작으로 두지 않는다 — 맨 뒤 */
const LATER = /아이소|보수볼|에센트릭|커시/;
const later = (ex: PinnableExercise) => (LATER.test(ex.title) ? 1 : 0);

const BASICS_RULES: Record<VariantKey, VariantRule> = {
  ...VARIANT_RULES,
  /* 맨몸 → 고블렛(설계 메모) — 덤벨이 있으면 고블렛 스쿼트, 없으면 템포 맨몸 스쿼트 */
  squat: {
    match: (ex) =>
      ex.category === '하체 스트렝스' &&
      ex.movementPattern === '스쿼트' &&
      !ex.perSide &&
      basicFit(ex),
    rank: (ex) => [
      later(ex),
      wordRank(ex.title, ['고블렛 스쿼트', '맨몸 스쿼트', '스쿼트']),
      intensityLevel(ex.intensity),
    ],
  },
  hinge: {
    match: (ex) =>
      ex.category === '하체 스트렝스' &&
      ex.movementPattern === '힌지' &&
      !ex.perSide &&
      basicFit(ex),
    rank: (ex) => [
      later(ex),
      wordRank(ex.title, ['RDL', '굿모닝', '스모 데드리프트', '글루트 브리지']),
      intensityLevel(ex.intensity),
    ],
  },
  /* 푸시업을 먼저 — 어려운 푸시업(파이크 · 다이아몬드 · 저항)과 머리 위로 미는 것은 뒤로(투수 어깨) */
  push: {
    match: (ex) =>
      ex.category === '상체 스트렝스' &&
      ex.movementPattern === '밀기' &&
      !ex.perSide &&
      basicFit(ex),
    rank: (ex) => [
      later(ex),
      /파이크|다이아몬드|핸드 릴리스|스퀴즈|저항|숄더 프레스|푸시 프레스|헥스/.test(ex.title) ? 1 : 0,
      ex.title === '푸시업' ? 0 : 1,
      wordRank(ex.title, ['푸시업', '플로어 프레스', '벤치 프레스']),
    ],
  },
  pull: {
    match: (ex) =>
      ex.category === '상체 스트렝스' && ex.movementPattern === '당기기' && basicFit(ex),
    rank: (ex) => [
      later(ex),
      /풀오버|중량/.test(ex.title) ? 1 : 0,
      wordRank(ex.title, ['TRX 로우', '밴드 로우', '덤벨 로우', '보조 친업', '보조 풀업', '풀업', '친업']),
      ex.perSide ? 1 : 0,
    ],
  },
  singleLeg: {
    match: (ex) =>
      ex.category === '하체 스트렝스' && ex.movementPattern === '런지' && basicFit(ex),
    rank: (ex) => [
      later(ex),
      wordRank(ex.title, ['리버스 런지', '스플릿 스쿼트', '스텝업', '레터럴 런지', '박스 스쿼트']),
      intensityLevel(ex.intensity),
    ],
  },
  /* 던지기를 먼저, 메디신볼이 없으면 맨몸 점프(포고 홉이 가장 가볍다) */
  medball: {
    match: (ex) =>
      ex.category === '파워' &&
      basicFit(ex) &&
      (ex.equipment.includes('메디신볼') ||
        (ex.movementPattern === '스쿼트' && ex.equipment.every((e) => e === '맨몸'))),
    rank: (ex) => [
      ex.equipment.includes('메디신볼') ? 0 : 1,
      ex.movementPattern === '밀기' || ex.movementPattern === '당기기'
        ? 0
        : ex.movementPattern === '회전'
          ? 1
          : 2,
      wordRank(ex.title, ['포고', '버티컬 점프', '브로드 점프']),
    ],
  },
  /* 캐리는 뺀다 — 처방이 '세트 × 회'라 '파머스 캐리 8회'가 됐다(거리 · 시간이 맞다, 2026-10-16 검토 ⑥) */
  antiRotation: {
    match: (ex) => VARIANT_RULES.antiRotation.match(ex) && basicFit(ex) && !ex.title.includes('캐리'),
    rank: VARIANT_RULES.antiRotation.rank,
  },
};

function compareRank(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * 한 변형의 후보 — 가진 장비로 할 수 있고, 경력에 맞는 것을 고를 차례대로.
 * 시작 시트의 '바꾸기'와 '고정 운동 바꾸기'(§13-17)가 이 목록을 보여 준다.
 * 그날 몸 상태 규칙은 쓰지 않는다(§3 — 고정은 장비 · 경력만으로).
 */
export function variantCandidates<T extends PinnableExercise>(
  variant: VariantKey,
  library: readonly T[],
  owned: readonly string[],
  trainingLevel: string | null,
  /** 기본기는 다른 규칙(BASICS_RULES) — 바벨 없이, 가벼운 것부터 */
  audience: ProgramAudience = 'adult',
  /** 성장기(isYouthAge) — 강도 '매우 높음'은 빼고 고른다 */
  youth = false
): T[] {
  const ownedSet = new Set(owned);
  const rule = (audience === 'basics' ? BASICS_RULES : VARIANT_RULES)[variant];
  const usable = library.filter(
    (ex) =>
      rule.match(ex) &&
      canDo(ex, ownedSet) &&
      (!youth || intensityLevel(ex.intensity) < intensityLevel('매우 높음'))
  );
  /*
   * 메디신볼이 없어 메디신볼 칸 후보가 하나도 없으면 상체를 빠르게 밀고 당기는 파워로 — 같은 '상체를 빠르게 쓰는' 동작이라 그날 목적에
   * 맞는다(2026-10-16 김민, 아래 거르기). 기본기는 제 규칙(맨몸 점프)이 있다.
   */
  /*
   * 기본기 당기기 — 맨몸뿐이면 당기기 후보가 없어 4주 내내 당기기 0번(푸시업만)이었다(2026-10-16 검토 ①). 등 · 견갑을 맨몸으로 끄는
   * 암케어 운동으로 채운다.
   */
  if (usable.length === 0 && variant === 'pull' && audience === 'basics') {
    usable.push(
      ...library.filter(
        (ex) =>
          inCategory(ex, '암케어') && /쿼드러펫 [YT] 레이즈|프론 슈퍼맨/.test(ex.title) && canDo(ex, ownedSet)
      )
    );
  }
  /*
   * 메디신볼이 없으면 상체를 빠르게 밀고 당기는 파워(바벨 없이) — 플라이오 푸시업 · 밴드 스피드 벤치 프레스 · 스피드 밴드 로우. 예전엔 플라이오
   * 푸시업만이라 박스 없는 초급은 하나뿐이었다(2026-10-16 트레이닝 50명 — 12세션 내내 같은 운동). 바벨 로우(펜들레이)는 무게 운동이라 뺀다.
   */
  if (usable.length === 0 && variant === 'medball' && audience !== 'basics') {
    usable.push(
      ...library.filter(
        (ex) =>
          inCategory(ex, '파워') &&
          (ex.movementPattern === '밀기' || ex.movementPattern === '당기기') &&
          !ex.equipment.includes('메디신볼') &&
          !ex.equipment.includes('바벨') &&
          canDo(ex, ownedSet)
      )
    );
  }
  const leveled = filterByLevel(usable, trainingLevel).pool;
  /* filterByLevel 이 경력 순으로 세운 것을 지키며, 같은 경력 안에서 변형 규칙의 차례로 */
  const levelRank = new Map(leveled.map((ex, i) => [ex.id, i]));
  return [...leveled].sort(
    (a, b) =>
      compareRank(rule.rank(a), rule.rank(b)) ||
      (levelRank.get(a.id) ?? 0) - (levelRank.get(b.id) ?? 0)
  );
}

/**
 * 그날 대체 운동 — 같은 칸 후보에서 고정 운동 · 같은 날 다른 칸이 이미 고른 운동을 빼고 오늘 할 수 있는 첫 것(2026-10-16 검토 8:
 * 대체가 다른 칸의 운동과 겹쳐 한 날에 같은 운동이 두 번 나왔다). 없으면 null.
 */
export function pickSubstitute<T extends { id: string }>(
  candidates: readonly T[],
  skipIds: ReadonlySet<string>,
  safeIds: ReadonlySet<string>
): T | null {
  return candidates.find((c) => !skipIds.has(c.id) && safeIds.has(c.id)) ?? null;
}

export type Pinned = Partial<Record<VariantKey, string>>;

/**
 * 세션마다 돌리는 보조 칸(2026-10-14 김민: "4주 고정이면 안 돼 — 세션마다 다르게"). 본 운동(스쿼트 · 힌지 · 밀기)은 무게 흐름(TM · 직선 증량)
 * 때문에 그대로 두고, 나머지는 같은 칸의 후보를 그 칸이 나올 때마다 다음 것으로 바꾼다. 고정 운동(pinned)이 첫째. 기본기는 일곱 칸 모두 돌린다(BASICS_ROTATION).
 */
export const ROTATING_VARIANTS: readonly VariantKey[] = [
  /* 당기기(pull)는 뺀다 — 이제 스트롱리프트의 본운동(바벨 로우 5×5 직선 증량)뿐이라 돌리면 무게 흐름이 끊긴다. 보조 당기기는 hpull · vpull(accessoryPick) */
  'singleLeg',
  'jump',
  'medball',
  'antiRotation',
  'rotationalThrow',
];
/** 한 칸에서 돌리는 운동 수 — 후보 순서(변형 규칙)의 앞에서 이만큼 */
export const ROTATION_MAX = 6;
/**
 * 기본기 4주는 일곱 칸 모두 세션마다 돌린다(2026-10-16 김민 "같은 운동을 연속으로 반복하지 말라고 했잖아" — 예전엔 12번이 같은
 * 일곱이었다). 무게를 올리지 않으니 본 운동도 돌려도 끊길 흐름이 없다. 셋만 돌려 사흘에 한 번 같은 동작이 돌아온다 — 연달아는
 * 안 하되 처음 배우는 동작을 자주 다시 만나게.
 */
export const BASICS_ROTATION = 3;

/**
 * 기본기의 주차별 돌리는 후보(2026-10-16 검토 ② — 예전엔 처음 고정된 운동이 4주 내내였고, 돌리기를 넣은 뒤에는 쉬운 것과 어려운 것이
 * 섞여 돌았다). 1~2주는 쉬운 동작(난이도 초급 · 강도 중간 이하 — 인클라인 푸시업 · 글루트 브리지 · 맨몸 스쿼트)을 쉬운 것부터, 맞는 것이
 * 없으면 후보 그대로. 3~4주는 강도 중간까지(던지기 칸은 높음까지)에서 변형 규칙의 차례(푸시업 · RDL · 고블렛). 던지기 칸은 3~4주에 돌려 던지기를 앞으로 — 투구는 회전이라.
 * 돌리는 차례의 첫째(고정 운동)는 3~4주에만 앞에 둔다(load.ts pinnedOf).
 */
export function basicsPool<T extends PinnableExercise>(pool: readonly T[], variant: VariantKey, week: number): T[] {
  if (week <= 2) {
    const easy = pool.filter(
      (ex) => ex.difficulty === '초급' && intensityLevel(ex.intensity) <= intensityLevel('중간')
    );
    const list = easy.length > 0 ? easy : [...pool];
    return list
      .map((ex, i) => ({ ex, i }))
      .sort((a, b) => intensityLevel(a.ex.intensity) - intensityLevel(b.ex.intensity) || a.i - b.i)
      .map((x) => x.ex);
  }
  /*
   * 3~4주도 강도 '중간'까지 — 돌리기에 덤벨 프론트 스쿼트 · 불가리안 스플릿 스쿼트 · 브로드 점프(높음)가 들어와 입문자의 12번 점검(끝까지
   * 하는 세트)에까지 걸렸다. 맞는 것이 없으면 후보 그대로.
   * 던지기 칸만 '높음'까지 — 덤벨 · 밴드뿐이면 맨몸 점프로 대신하는데 중간 이하는 로우 포고 홉 하나라 12번 내내 같았다(2026-10-16 트레이닝
   * 50명). 버티컬 · 브로드 점프가 같이 돈다. 1~2주는 그대로 쉬운 것만. 점검 세션은 스쿼트 · 밀기만 보아 상관없다.
   */
  const cap = variant === 'medball' ? '높음' : '중간';
  const mid = pool.filter((ex) => intensityLevel(ex.intensity) <= intensityLevel(cap));
  pool = mid.length > 0 ? mid : pool;
  if (variant === 'medball') {
    /* 슬램은 '회전'으로 적혀 있어도 위아래로 던지는 것이라 빼고 센다(rotationalThrow 규칙과 같은 까닭) */
    const spins = (ex: T) => Number(ex.movementPattern === '회전' && !ex.title.includes('슬램'));
    return [...pool].sort((a, b) => spins(b) - spins(a));
  }
  return [...pool];
}

/** 이 세션 앞에서 그 칸이 나온 세션 수 — 돌리는 차례 */
export function variantTurn(plan: ProgramPlan, day: number, variant: VariantKey): number {
  let n = 0;
  for (let d = 1; d < day; d++) if (dayPlan(plan, d).items.some((x) => x.variant === variant)) n++;
  return n;
}

/** 그 차례의 운동 — 고정 운동을 첫째로, 같은 칸 후보를 차례로(앞에서 ROTATION_MAX 개). 후보가 없으면 고정 운동 */
export function rotatedPick<T extends { id: string }>(
  anchor: T | null,
  candidates: readonly T[],
  turn: number,
  max = ROTATION_MAX
): T | null {
  const list = [...(anchor ? [anchor] : []), ...candidates.filter((c) => c.id !== anchor?.id)].slice(
    0,
    max
  );
  return list.length ? list[turn % list.length] : null;
}

/**
 * 그날 돌리지 않는 칸(본운동 · 플라이오 푸시업)에 나온 운동 — 돌리는 칸은 이것을 빼고 고른다(2026-10-16 트레이닝 50명: 메디신볼이 없으면
 * 메디신볼 칸 대체가 플라이오 푸시업이라 웨스트사이드 파워의 플라이오 푸시업 칸과 같은 날 두 번 나왔다). 보조 메뉴 칸은 따로 막는다(accessoryWithFallback).
 */
export function fixedIdsOnDay(
  plan: ProgramPlan,
  day: number,
  exerciseOf: (v: VariantKey) => { id: string } | null
): Set<string> {
  const out = new Set<string>();
  for (const x of dayPlan(plan, day).items) {
    if (x.assist || ROTATING_VARIANTS.includes(x.variant)) continue;
    const ex = exerciseOf(x.variant);
    if (ex) out.add(ex.id);
  }
  return out;
}

/** 돌리는 칸 후보에서 그날 고정 칸 운동을 뺀다 — 다 빠지면 그대로 둔다(칸을 비우지 않는다) */
export function withoutFixed<T extends { id: string }>(
  anchor: T | null,
  pool: readonly T[],
  fixed: ReadonlySet<string>
): { anchor: T | null; pool: T[] } {
  const rest = pool.filter((e) => !fixed.has(e.id));
  if (rest.length === 0) return { anchor, pool: [...pool] };
  return { anchor: anchor && fixed.has(anchor.id) ? null : anchor, pool: rest };
}

/**
 * 점프 단계(2026-10-16) — 1~2주는 착지 충격이 작은 점프만(뎁스 · 드롭 · 바운드 · 강도 '매우 높음' 빼고), 3주부터 다. 돌리는 점프 칸(load.ts pinnedOf)이 본다.
 */
const ADVANCED_JUMP = /뎁스|드롭|바운드/;
export function jumpFitsWeek(ex: { title: string; intensity: string }, week: number): boolean {
  return week >= 3 || (!ADVANCED_JUMP.test(ex.title) && intensityLevel(ex.intensity) < 5);
}

/** 시작할 때 9개를 고른다. 후보가 없는 변형은 비워 둔다 — 그 칸은 그날 대체 규칙으로 간다. */
export function pickPinned<T extends PinnableExercise>(
  library: readonly T[],
  owned: readonly string[],
  trainingLevel: string | null,
  keep: Pinned = {},
  audience: ProgramAudience = 'adult',
  youth = false
): Pinned {
  const out: Pinned = {};
  for (const v of VARIANT_KEYS) {
    const candidates = variantCandidates(v, library, owned, trainingLevel, audience, youth);
    const kept = keep[v];
    if (kept && candidates.some((c) => c.id === kept)) {
      out[v] = kept;
      continue;
    }
    if (candidates[0]) out[v] = candidates[0].id;
  }
  return out;
}

/** 문자열 → 32비트 수(FNV-1a) — 보조 칸을 사람마다 다른 차례로 섞을 때 */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * 보조 칸의 그날 운동 — 그 칸 후보 전체를 사람(seed)마다 섞은 차례에서 occurrence 번째(0부터). 한 바퀴를 다 돌기 전에는 같은 운동이
 * 다시 안 나온다. 버티기(아이소 · 홀드)는 '세트 × 회' 처방이라 빼고(몸통 칸은 둔다), 그날 본운동(exclude)과 같은 운동도 뺀다.
 * 같은 입력이면 늘 같은 답 — 운동 화면 · 다시 열기 · 미리보기가 어긋나지 않는다.
 */
export function accessoryPick<T extends PinnableExercise>(
  variant: VariantKey,
  candidates: readonly T[],
  seed: string,
  occurrence: number,
  exclude: ReadonlySet<string> = new Set()
): T | null {
  const holdsOk = variant === 'antiRotation';
  const pool = candidates
    .filter((c) => !exclude.has(c.id) && (holdsOk || !/아이소|홀드/.test(c.title)))
    .map((c) => ({ c, k: hash32(`${seed}|${c.id}`) }))
    .sort((a, b) => a.k - b.k || a.c.id.localeCompare(b.c.id))
    .map((x) => x.c);
  return pool.length > 0 ? pool[Math.max(0, occurrence) % pool.length] : null;
}

/**
 * 보조 칸의 그날 운동 — 그 칸에서 고르고(accessoryPick), 가진 장비로 할 것이 없으면 비슷한 칸(ACCESSORY_FALLBACK)에서 차례로. 대신 골랐으면
 * substituted 가 참(화면 '대체 · 장비'). 고른 운동은 used 에 넣는다 — 같은 날 두 칸에 같은 운동이 안 나오게.
 */
export function accessoryWithFallback<T extends PinnableExercise>(
  variant: VariantKey,
  candidatesOf: (v: VariantKey) => readonly T[],
  seed: string,
  occurrence: number,
  used: Set<string>
): { ex: T | null; substituted: boolean } {
  const tries = [{ variant, only: ACCESSORY_ONLY[variant] }, ...(ACCESSORY_FALLBACK[variant] ?? [])];
  for (const [i, { variant: v, only }] of tries.entries()) {
    const pool = candidatesOf(v).filter((c) => !only || only.test(c.title));
    const ex = accessoryPick(v, pool, seed, occurrence, used);
    if (ex) {
      used.add(ex.id);
      return { ex, substituted: i > 0 };
    }
  }
  return { ex: null, substituted: false };
}

/**
 * 보조를 같은 운동으로 이어 가는 주 수 — 2주 동안 같은 운동으로 무게를 올리고, 다음 2주에 그 칸 다음 운동으로 바꾼다(2026-10-16 김민 —
 * 세션마다 바꾸면 무게를 못 올린다).
 */
export const ACCESSORY_BLOCK_WEEKS = 2;

/**
 * 그날 그 칸의 차례(accessoryPick 의 occurrence). 2주 묶음마다 하나씩 나아가고, 같은 묶음 안에서도 본운동이 다른 날(5/3/1 의 스쿼트 날 ·
 * 데드 날 가로 당기기)은 다른 차례라 다른 운동이 나온다 — 같은 날 종류는 2주 동안 같은 운동.
 */
export function accessoryOccurrence(plan: ProgramPlan, day: number, variant: VariantKey): number {
  const mainsOf = (d: number) =>
    dayPlan(plan, d)
      .items.filter((x) => !x.assist)
      .map((x) => x.variant)
      .join();
  const kinds: string[] = [];
  for (let d = 1; d <= plan.totalDays; d++) {
    if (!dayPlan(plan, d).items.some((x) => x.assist && x.variant === variant)) continue;
    const k = mainsOf(d);
    if (!kinds.includes(k)) kinds.push(k);
  }
  const block = Math.floor((weekOfDay(plan, day) - 1) / ACCESSORY_BLOCK_WEEKS);
  return block * kinds.length + Math.max(0, kinds.indexOf(mainsOf(day)));
}

/** 저장된 pinned 를 읽는다(Json). 모르는 키 · 문자열이 아닌 값은 버린다. */
export function readPinned(value: unknown): Pinned {
  if (!value || typeof value !== 'object') return {};
  const out: Pinned = {};
  for (const v of VARIANT_KEYS) {
    const id = (value as Record<string, unknown>)[v];
    if (typeof id === 'string' && id) out[v] = id;
  }
  return out;
}

/* ─────────────────────────── 오늘 판정(§4~6 · §13) ─────────────────────────── */

/** 회복 데이로 바뀐 까닭(지금 규칙의 이름을 이 모양으로 옮겨 받는다) */
export type RecoveryReason = 'loadRisk' | 'soreSevere' | 'lowCondition';

export type TodaySignals = {
  /** 다음에 할 일차(1~totalDays, 넘으면 다 끝남) */
  nextDay: number;
  /** 오늘 · 마지막 프로그램 세션 날짜 'YYYY-MM-DD' */
  today: string;
  lastProgramDate: string | null;
  /** 오늘 체크인이 있는가 — 없으면 일정을 만들지 않는다(지금 규칙) */
  checkedIn: boolean;
  /** 오늘 다른 방식(자동 맞춤 · 직접 고르기)으로 이미 운동을 시작했는가 */
  otherWorkoutStarted: boolean;
  /** 오늘 통증으로 운동이 멈췄는가(halted) */
  halted: boolean;
  /** 던지는 일정 — 아래 programSignalsOf 가 등판 답 · 투구 기록으로 만든다 */
  gameToday: boolean;
  gameTomorrow: boolean;
  /**
   * 어제 팔 부담이 컸다 — 이름은 예전 그대로지만 2판 P4 커밋 F(D3)부터 달력('어제 경기')이 아니라 부하다: 어제 세게 던진 날 · 중간 부하 +
   * 운동 힘듦 급증 · 기록 없는 등판 다음 날(lib/engine/arm-load.ts yesterdayArmLoadOf). 어제 경기 15구는 아니고, 어제 불펜 40구 90% 는 그렇다.
   */
  gameYesterday: boolean;
  bullpenToday: boolean;
  /**
   * 오늘 · 어제 세게 던진 날이 있다 — 매일 일정과 같은 판정(lib/report/theme.ts hardOuting = 오늘 상태 한 장의 load.hardOuting,
   * 문턱은 lib/report/facts.ts isHardOuting: Σ 투구수 × 체감 강도 ≥ 2,700, 경기는 100%, 2판 D2). 프로그램이 따로 세지 않는다.
   * 어제 세게 던진 날은 2판 P4 커밋 F 부터 gameYesterday 로 먼저 쉬므로(넘기면 gameOverride 가 앞선다) 이 주의는 사실상 오늘 세게 던진 날에 붙는다.
   * 2판 P6-2 부터 앱은 오늘 세게 던진 날도 hardToday 로 먼저 쉬어, 이 주의는 그 신호를 안 주는 옛 입력에서만 보인다.
   */
  hardThrowRecent: boolean;
  /** 경기 때문에 쉬는 날을 '그래도 오늘 할래요'로 넘겼는가(D24) */
  override: boolean;
  /** 안전 신호 */
  recovery: RecoveryReason | null;
  loadCaution: boolean;
  soreMany: boolean;
  sleepShort: boolean;
  /** 부하 지수 모름 · 메모 통증 확인 전 · 상하체 함께 통증(D22) */
  uncertain: boolean;
  /** 특정 부위 통증 · 뻐근 · 재활 관절 · 팔 피로 '심함'으로 그날 대체할 칸 */
  painSlots: readonly SlotKind[];
  /**
   * 대체할 칸의 까닭(painSlotsOf 가 만든다) — 없는 칸은 '통증 부위'. 팔 피로 '심함'(안전 거르기 5-2)만으로 고정 운동이 빠진 칸은 '팔 피로'다
   * (2판 P4 검토 — 통증을 안 적은 날 '대체 · 통증 부위'가 보였다). 선택 칸이라 옛 입력 · 시험의 신호는 그대로 '통증 부위'.
   */
  slotReasons?: Partial<Record<SlotKind, string>>;
  /*
   * ── 중재 신호(트레이닝 추천 2판 P6-2, 2026-10-13) ── 모두 선택 칸이다. 안 주면 판정이 예전과 글자 하나 같다(옛 입력 · 시험 그대로).
   * 앱(lib/program/load.ts) · 자체 시험 · 기준선 도구는 lib/engine/arbiter.ts 의 programArbiterSignals 하나로 만든다. 이 파일이 중재를
   * 부르면 중재가 이 파일을 부르므로 순환이라, 신호는 부르는 쪽이 만들어 넘긴다(비판 1 빈틈 3).
   */
  /**
   * 오늘 팔을 다 썼다(중재 armBudget.spent — 오늘 등판 · 오늘 경기 기록 · 오늘 세게 던진 날). 오늘 일차의 팔로 던지는 변형(armThrows)을
   * 그날 뺀다(go 의 deferVariants) — 칸이 아니라 변형으로 빼서 같은 파워 칸의 점프는 남는다. '그래도 오늘 할래요'로도 안 풀린다(중재의
   * 등판 보호 층 — 쉬는 날을 넘겨도 팔은 아낀다).
   */
  armSpent?: boolean;
  /** 팔로 던지는 변형 — 고정 운동으로 가른 것(programArbiterSignals). 없으면 ARM_THROW_VARIANTS 로 짐작한다 */
  armThrows?: readonly VariantKey[];
  /**
   * 어제 하체 날이었다(프로그램 날이 아닌 매일 일정의 하체 — 중재 lowerBudget.programLighter). 오늘 일차에 큰 하체가 있으면 빼지 않고
   * 가볍게 한다(D6 '그날의 프로그램 운동 그대로'를 지킨다, 무거운 하체가 48시간 안에 두 번 없게). '그래도 오늘 할래요'면 그대로(중재와 같은 규칙).
   */
  heavyLowerYesterday?: boolean;
  /**
   * 오늘 세게 던진 날(오늘 상태 한 장 load.hardOuting 이 오늘 — facts.ts isHardOuting). 쉬는 날(rest 'hardToday')이다. 같은 날 매일 일정은
   * 회복(날 종류 R1)이고 중재도 프로그램을 쉬게 해서(비판 1 빈틈 28), 프로그램 카드만 '하는 날'이라 말하지 않게 맞춘다. 넘길 수 있다.
   */
  hardToday?: boolean;
  /** 오늘 체크인에서 운동 종류 '회복'을 골랐다 — 쉬는 날(rest 'chooseRecovery'). 넘길 수 있다(중재의 사용자 선택 층과 같은 날) */
  choseRecovery?: boolean;
  /**
   * 다음 등판 창의 끝이 3일 안이다(중재 outingNearOf.soon — 매일 일정 안전 거르기 2-2 와 같은 창, 짐작한 출처 포함, 2판 P6 검토). 그날 큰 하체를
   * 빼지 않고 가볍게 한다 — 매일 일정은 이날 무거운 하체를 빼는데 프로그램만 처방대로 내던 것을 맞춘다. '그래도 오늘 할래요'로 넘겨도 가볍게
   * (매일 일정의 등판 창 거르기가 '그래도 하기'로 안 풀리는 것과 같다).
   */
  outingSoon?: boolean;
  /**
   * 짐작한(달력 · 같은 요일) 다음 등판이 오늘이나 내일이다(중재 outingNearOf.softNear — 날 종류 R4' 와 같은 조건, 2판 P6 검토). 큰 하체 · 파워를
   * 가볍게 한다 — P4 결정 '짐작은 가볍게 하는 쪽에만'(쉬게 하지 않는다).
   */
  softOutingNear?: boolean;
};

/**
 * 팔로 던지는 프로그램 변형 — 메디신볼 · 회전 던지기. 둘 다 메디신볼을 던지는 상체 파워다(VARIANT_MOVEMENT_KEY 가 상체 파워로 적고, 고정
 * 운동은 exercise-class.ts isArmPlyo 가 참 — 메디신볼 장비). 점프(하체 파워)는 같은 파워 칸이지만 팔을 안 쓴다 — 그래서 칸(SlotKind)이
 * 아니라 변형 단위로 뺀다(칸 단위로 빼면 점프까지 지운다, 비판 1 빈틈 35). 기본기의 메디신볼 칸에 맨몸 점프를, 회전 던지기 칸에 돌리는
 * 코어를 고정했으면 던지지 않는다 — 고정 운동을 알면 programArbiterSignals 가 그 운동으로 가른다(armThrows).
 * lib/engine/arbiter.ts 가 같은 상수를 다시 내보낸다(한 곳 — 중재가 이 파일을 부르므로 여기 둔다).
 */
/** 팔 보조 — 팔을 아끼는 날(deferVariants 가 있는 날) 같이 빠진다 */
export const ARM_ACCESSORIES: readonly VariantKey[] = ['triceps', 'biceps', 'forearm'];

export const ARM_THROW_VARIANTS: readonly VariantKey[] = ['medball', 'rotationalThrow', 'plyoPush'];

/** 팔을 아끼는 날 뺀 변형의 줄 표시 — 카드의 '오늘 뺌: 메디신볼 체스트 패스 · 팔 아끼는 날' */
export const ARM_DEFER_REASON = '팔 아끼는 날';

/** 그날 대체한 칸 · 운동의 까닭 — 화면 꼬리표 '대체 · …'에 그대로 붙는다 */
export const SUBSTITUTE_REASON = { pain: '통증 부위', armFatigue: '팔 피로', gear: '장비' } as const;

/**
 * 보조 칸에 가진 장비로 할 운동이 하나도 없을 때 대신 고르는 비슷한 칸 — 앞에서부터 본다(2026-10-15 사용자: "프로그램은 본운동 장비만 있으면
 * 되게, 보조는 장비가 없으면 비슷한 걸로"). 바벨 · 덤벨만 있으면 세로 당기기(철봉 · 케이블 · 밴드)와 삼두(케이블 · 벤치 · 밴드)가 빈다.
 * 화면에는 '대체 · 장비'와 '오늘은 세로 당기기 대신이에요'가 붙는다.
 */
/* 보조 칸에서 먼저 고르는 것 — 몸통 버티기는 팔로프 · 찹 · 리프트(밴드 · 케이블)를 먼저, 없으면 대신(ACCESSORY_FALLBACK) */
const ACCESSORY_ONLY: Partial<Record<VariantKey, RegExp>> = {
  antiRotation: new RegExp(ANTI_ROTATION_WORDS.join('|')),
};

export const ACCESSORY_FALLBACK: Partial<
  Record<VariantKey, readonly { variant: VariantKey; only?: RegExp }[]>
> = {
  /* 로우까지 다 쓰면 어깨 뒤쪽(덤벨 레이즈) — 등 위쪽을 같이 쓴다 */
  vpull: [{ variant: 'hpull' }, { variant: 'scap' }],
  hpull: [{ variant: 'vpull' }, { variant: 'scap' }],
  scap: [{ variant: 'hpull' }],
  /* 삼두는 삼두를 많이 쓰는 푸시업 종류부터, 없으면 보조 밀기 */
  triceps: [{ variant: 'pushAcc', only: /푸시업/ }, { variant: 'pushAcc' }],
  biceps: [{ variant: 'hpull' }, { variant: 'vpull' }],
  forearm: [{ variant: 'biceps' }],
  pushAcc: [{ variant: 'triceps' }],
  hamstring: [{ variant: 'singleLeg' }],
  /* 밴드 · 케이블이 없으면 캐리 · 사이드 플랭크 같은 몸통 버티기 대신(같은 날 몸통 안정과 겹치지 않는 것) */
  antiRotation: [{ variant: 'antiRotation' }],
  coreStab: [{ variant: 'antiRotation' }],
  singleLeg: [{ variant: 'hamstring' }],
};

/**
 * 그날 대체할 칸 — 고정 운동(pinnedOf)이 안전 거르기(partsOnly)를 못 지난 칸과 그 까닭. 앱(lib/program/load.ts)과 자체 시험이 이 함수
 * 하나를 부른다(2판 P4 검토 — 시험이 painSlots 를 빈 목록으로 두어 앱과 다른 모양을 쟀다).
 *
 * 까닭은 팔 피로 '심함'만으로 빠진 운동(lib/report/prescription.ts droppedOnlyForArmFatigue)이면 '팔 피로', 그 밖은 '통증 부위'. 한 칸에
 * 둘이 섞이면(스쿼트 · 힌지처럼 한 칸에 둘) '통증 부위'가 이긴다 — 더 조심할 까닭을 말한다.
 */
export function painSlotsOf(
  items: readonly { slot: SlotKind; variant: VariantKey }[],
  pinnedOf: (variant: VariantKey) => { id: string } | null,
  safeIds: ReadonlySet<string>,
  armFatigueOnlyIds: ReadonlySet<string>
): { painSlots: SlotKind[]; slotReasons: Partial<Record<SlotKind, string>> } {
  const painSlots: SlotKind[] = [];
  const slotReasons: Partial<Record<SlotKind, string>> = {};
  for (const x of items) {
    const ex = pinnedOf(x.variant);
    if (!ex || safeIds.has(ex.id)) continue;
    const reason = armFatigueOnlyIds.has(ex.id)
      ? SUBSTITUTE_REASON.armFatigue
      : SUBSTITUTE_REASON.pain;
    if (!painSlots.includes(x.slot)) painSlots.push(x.slot);
    if (slotReasons[x.slot] !== SUBSTITUTE_REASON.pain) slotReasons[x.slot] = reason;
  }
  return { painSlots, slotReasons };
}

/** 프로그램이 읽는 던지는 신호 — TodaySignals 의 넷 칸 그대로 */
export type ProgramSignals = Pick<
  TodaySignals,
  'gameToday' | 'gameTomorrow' | 'gameYesterday' | 'bullpenToday'
>;

export type ProgramSignalsInput = {
  /** 오늘 · 어제 등판 답 — 오늘 상태 한 장(lib/engine/day-state.ts)의 outing 칸 그대로(목록 밖 글자는 이미 null) */
  outing: Pick<DayState['outing'], 'answerToday' | 'answerYesterday'>;
  /** 오늘 투구 기록의 세션 종류 — 투구수는 보지 않는다(0구 '경기' 줄도 오늘은 경기로 읽는다) */
  typesToday: readonly string[];
  /**
   * 어제 팔 부담(lib/engine/arm-load.ts yesterdayArmLoadOf(facts) 그대로) — 세게 던진 날 · 중간 부하 + 힘듦 급증 · 기록 없는 등판, 아니면 null.
   * 2판 P4 커밋 F 전에는 어제 기록의 세션 종류(typesYesterday)를 받아 '경기'면 쉬었다.
   */
  yesterdayArmLoad: Pick<YesterdayArmLoad, 'kind'> | null;
};

/**
 * 프로그램의 던지는 신호 — 경기 날 · 전날, 어제 팔 부담이 큰 날은 쉬고(넘기기 가능), 불펜 날은 회전 던지기 칸을 뺀다(decideToday).
 *
 * 왜 여기 두는가. 2판 P3(2026-10-12) 전에는 lib/program/load.ts 의 throwSignals 가 체크인 두 줄을 따로 읽어 '오늘 등판' 같은
 * 글자를 직접 견줬고, 자체 시험 엇갈림 표가 그 식을 베껴 두었다(앱이 바뀌면 시험이 옛 식을 재는 셈). 이제 답은 오늘 상태 한
 * 장에서 받고, 답을 날로 읽는 것은 lib/checkin.ts 의 nextOutingDays · exactOutingDay · todayOutingRole 로만 한다 — 앱(load.ts)과 시험이 이
 * 함수 하나를 부른다.
 *
 *   gameToday     오늘 '오늘 등판' · 어제 '내일 등판' · 오늘 '경기' 기록
 *   gameTomorrow  오늘 '내일 등판'
 *   gameYesterday 어제 팔 부담이 컸다(yesterdayArmLoad — 세게 던진 날 · 중간 부하 + 힘듦 급증 · 어제 '오늘 등판' 답에 기록 없음)
 *   bullpenToday  오늘 '오늘 불펜' · 오늘 불펜 · 라이브 기록
 *   '2~3일 뒤' · '4일 이상 뒤' · '없음'은 날을 못 박지 못하니 앞의 둘 · 불펜은 false.
 *
 * 2판 P4 커밋 F(D3, 2026-10-12)에서 gameYesterday 를 달력에서 부하로 바꿨다. 예전에는 어제 '경기' 기록이면 0구 · 15구라도, 어제 '오늘
 * 등판' 답이면 가볍게 던진 기록이 있어도 '경기 다음 날'로 쉬었고, 어제 불펜 40구 90% 처럼 세게 던진 날은 주의 한 줄만 달고 했다. 이제
 * 매일 일정의 날 종류(R1 의 어제 쪽 · R2 · R3') · 암케어의 회복 루틴과 같은 함수(yesterdayArmLoadOf)로 같은 어제를 같게 읽는다.
 *
 * 다른 독자와 다른 곳 하나(지금 값 그대로 — 맞출지는 사용자 확인 뒤):
 *   - 어제 '내일 등판'은 오늘 답과 상관없이 경기 날이다. 매일 일정 · 영양 · 투구 계획은 오늘 답이 이긴다(nextOutingWindow) —
 *     오늘 '없음'으로 고친 날 프로그램만 '경기 날이에요'로 쉬고, 비로 밀려 오늘 다시 '내일 등판'이면 '내일 경기예요'가 아니라
 *     '경기 날이에요'가 앞선다(쉬는 것은 같다).
 */
export function programSignalsOf(x: ProgramSignalsInput): ProgramSignals {
  const today = exactOutingDay(nextOutingDays(x.outing.answerToday));
  /* 어제 답을 어제 기준으로 — 1 은 오늘이 등판 날(어제 '오늘 등판'은 이제 yesterdayArmLoad 가 부하로 본다) */
  const yesterday = exactOutingDay(nextOutingDays(x.outing.answerYesterday));
  return {
    gameToday: today === 0 || yesterday === 1 || x.typesToday.includes('경기'),
    gameTomorrow: today === 1,
    gameYesterday: x.yesterdayArmLoad != null,
    /* 불펜은 오늘 답만(어제 답은 불펜을 이월하지 않는다) — 투구 계획 · 암케어와 같은 함수 */
    bullpenToday:
      todayOutingRole(x.outing.answerToday, x.outing.answerYesterday) === 'bullpen' ||
      x.typesToday.some((t) => t === '불펜' || t === '라이브'),
  };
}

/**
 * 쉬는 까닭 — 경기 날 · 전날 · 어제 팔 부담, 그리고 2판 P6-2 부터 오늘 세게 던진 날(hardToday) · 오늘 '회복'을 고름(chooseRecovery).
 * 뒤의 둘은 그 신호를 넘긴 부르는 쪽에서만 나온다.
 */
export type RestReason =
  | 'gameToday'
  | 'gameTomorrow'
  | 'gameYesterday'
  | 'hardToday'
  | 'chooseRecovery';

export type CautionCode =
  | 'armRest'
  | 'gameOverride'
  | 'recovery'
  | 'hardThrow'
  | 'uncertain'
  | 'outingGuess'
  | 'outingSoon'
  | 'lowerBudget'
  | 'lighter'
  | 'restGap'
  | 'lightWeek';

export type SlotAdjust =
  /** 그날 칸을 뺀다 */
  | { kind: 'drop'; reason: string }
  /** 추천 −10% · 세트 −1 (D19) */
  | { kind: 'lighter' }
  /** 같은 칸 · 같은 계열로 그날 대체(§3 (a)). 그 칸이 '가볍게'였으면 lighter — 대체한 운동 · 같은 칸의 다른 운동도 가볍게 */
  | { kind: 'substitute'; reason: string; lighter?: true };

export type TodayDecision =
  | { kind: 'done' }
  | { kind: 'needCheckin'; day: number }
  | { kind: 'painWait'; day: number }
  | { kind: 'otherMode'; day: number }
  /** 더는 내지 않는다(2026-10-16 검토 4 — 어제 했어도 오늘 할 수 있다). 중재(lib/engine/arbiter.ts)가 읽는 이름이라 남긴다 */
  | { kind: 'spacing'; day: number }
  | { kind: 'rest'; day: number; reason: RestReason; canOverride: true }
  | {
      kind: 'go';
      day: number;
      week: number;
      caution: CautionCode | null;
      adjust: Partial<Record<SlotKind, SlotAdjust>>;
      /** 마지막 프로그램 세션 뒤 쉰 날 수(무게 추천의 '쉰 기간'에 쓴다) */
      gapDays: number | null;
      /**
       * 오늘 뺄 변형 — 팔을 다 쓴 날(armSpent) 오늘 일차의 팔로 던지는 변형(2판 P6-2). 칸 조정(adjust)과 따로 둔다 — 칸은 점프와 메디신볼이
       * 같은 파워 칸이라 칸으로 빼면 점프까지 빠진다. 뺄 것이 있을 때만 칸이 생긴다(옛 판정과 모양이 같게). 읽는 쪽은 `?? []`.
       */
      deferVariants?: VariantKey[];
    };

export function daysBetween(fromKey: string, toKey: string): number {
  const a = Date.parse(`${fromKey}T00:00:00.000Z`);
  const b = Date.parse(`${toKey}T00:00:00.000Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * 오늘 프로그램 날인가, 무엇을 바꾸는가.
 *
 * 프로그램은 스스로 진행한다(D22). 기다리는 것은 통증 멈춤 · 경기 앞뒤(넘길 수 있음)뿐이고,
 * 나머지 나쁜 날은 진행하되 주의 한 줄과 칸 조정으로 알린다(§4 · §5 · §6).
 *
 * 2판 P6-2(2026-10-13) — 중재(lib/engine/arbiter.ts)가 정한 하루를 프로그램 카드도 같은 말로 하게 신호 다섯을 더 받는다(모두 선택 칸,
 * 안 주면 예전과 같다. armThrows 는 armSpent 가 뺄 변형을 고정 운동으로 가르는 칸). 오늘 세게 던진 날 · 오늘 '회복'을 고른 날은 쉬는 날(넘길 수 있음 — 중재의 쉬라는 날 · 사용자 선택 층), 팔을 다 쓴
 * 날은 팔로 던지는 변형을 뺀다(넘겨도 뺀다 — 등판 보호 층), 어제 하체 날이면 큰 하체를 가볍게(넘기면 그대로 — 예산 층).
 * 2판 P6 검토(같은 날) — 둘 더(outingSoon · softOutingNear, 선택 칸): 다음 등판 창의 끝이 3일 안이면 큰 하체를, 짐작한 등판이 오늘 · 내일이면
 * 큰 하체 · 파워를 가볍게(넘겨도 — 매일 일정의 등판 창 거르기와 같은 원칙).
 */
export function decideToday(plan: ProgramPlan, s: TodaySignals): TodayDecision {
  const day = s.nextDay;
  if (day > plan.totalDays) return { kind: 'done' };
  if (s.halted) return { kind: 'painWait', day };
  if (!s.checkedIn) return { kind: 'needCheckin', day };
  if (s.otherWorkoutStarted) return { kind: 'otherMode', day };

  /* 쉰 날 수는 무게 추천(쉰 기간)에만 — 어제 했어도 오늘 다음 세션을 할 수 있다(2026-10-16 검토 4). 오늘 이미 했으면 여기 오지 않는다. */
  const gapDays = s.lastProgramDate ? daysBetween(s.lastProgramDate, s.today) : null;

  const restReason: RestReason | null = s.gameToday
    ? 'gameToday'
    : s.gameTomorrow
      ? 'gameTomorrow'
      : s.gameYesterday
        ? 'gameYesterday'
        : s.hardToday
          ? 'hardToday'
          : s.choseRecovery
            ? 'chooseRecovery'
            : null;
  if (restReason && !s.override) {
    return { kind: 'rest', day, reason: restReason, canOverride: true };
  }

  const week = weekOfDay(plan, day);
  const items = dayPlan(plan, day).items;
  const adjust: Partial<Record<SlotKind, SlotAdjust>> = {};

  /* 칸 조정 — 회복 데이(컨디션 4 이하)는 큰 하체 · 파워를 가볍게(D19 · D25) */
  if (s.recovery === 'lowCondition') {
    adjust.bigLower = { kind: 'lighter' };
    adjust.power = { kind: 'lighter' };
  }
  /* 근육통 '많이' · 잠 부족 — 가장 센 칸(큰 하체)만 가볍게 */
  if (s.soreMany || s.sleepShort) adjust.bigLower = { kind: 'lighter' };
  /*
   * 어제 하체 날(매일 일정) — 오늘 큰 하체를 빼지 않고 가볍게(무거운 하체가 48시간 안에 두 번 없게, D6 '그대로'를 지킨다). 그날 큰 하체가
   * 있을 때만 칸을 건드린다(주의 한 줄이 실제로 바뀐 것만 말하게). '그래도 오늘 할래요'로 연 날은 그대로 — 중재(arbitrate 의
   * lighterBigLower)와 같은 규칙이다.
   */
  const lowerBudget =
    s.heavyLowerYesterday === true &&
    !s.override &&
    items.some((x) => x.slot === 'bigLower');
  if (lowerBudget) adjust.bigLower = { kind: 'lighter' };
  /*
   * 다음 등판이 가깝다(2판 P6 검토) — 창의 끝이 3일 안이면 큰 하체를, 짐작한 등판이 오늘 · 내일이면 큰 하체 · 파워를 가볍게. 빼지 않는다(D6 '그대로').
   * 넘긴 날(override)에도 한다 — 매일 일정의 등판 창 거르기와 같은 원칙(쉬는 날은 넘겨도 다리는 아낀다). 파워 칸은 아래 부하 '주의'가 빼면 그쪽이 이긴다.
   */
  const hasBig = items.some((x) => x.slot === 'bigLower');
  const hasPower = items.some((x) => x.slot === 'power');
  const outingGuess = s.softOutingNear === true && (hasBig || hasPower);
  const outingSoon = !outingGuess && s.outingSoon === true && hasBig;
  if ((outingGuess || outingSoon) && hasBig) adjust.bigLower = { kind: 'lighter' };
  if (outingGuess && hasPower) adjust.power = { kind: 'lighter' };
  /* 부하 '주의' — 파워 칸을 뺀다 */
  if (s.loadCaution) adjust.power = { kind: 'drop', reason: '부하 주의' };
  /* 불펜 날 — 회전 던지기를 뺀다(몸통 칸) */
  if (s.bullpenToday && items.some((x) => x.variant === 'rotationalThrow')) {
    adjust[SLOT_OF.rotationalThrow] = { kind: 'drop', reason: '오늘 불펜' };
  }
  /* 부위 통증 — 그 칸은 그날 대체(없으면 화면이 '오늘 뺌'으로) */
  for (const slot of s.painSlots) {
    if (adjust[slot]?.kind !== 'drop')
      adjust[slot] = {
        kind: 'substitute',
        reason: s.slotReasons?.[slot] ?? SUBSTITUTE_REASON.pain,
        ...(adjust[slot]?.kind === 'lighter' ? { lighter: true as const } : {}),
      };
  }
  /*
   * 팔을 다 쓴 날 — 오늘 일차의 팔로 던지는 변형을 뺀다(칸이 아니라 변형 — 점프는 남는다). 넘긴 날(override)에도 뺀다: 쉬는 날은
   * 사용자가 넘길 수 있어도 등판 · 세게 던진 날의 팔은 아낀다(중재의 등판 보호 층은 '그래도 하기'로 안 풀린다). 통증으로 대체할 칸이어도
   * 먼저 뺀다(대체 후보도 같은 변형이라 또 던진다 — 읽는 쪽 load.ts 가 뺀 변형을 대체보다 먼저 본다).
   */
  const throws = s.armThrows ?? ARM_THROW_VARIANTS;
  const deferVariants: VariantKey[] = [];
  if (s.armSpent) {
    for (const x of items) {
      if (throws.includes(x.variant) && !deferVariants.includes(x.variant))
        deferVariants.push(x.variant);
    }
  }

  return {
    kind: 'go',
    day,
    week,
    caution: pickCaution(s, isLightWeek(plan, week), gapDays, {
      armRest: deferVariants.length > 0,
      lowerBudget,
      outingGuess,
      outingSoon,
    }),
    adjust,
    gapDays,
    ...(deferVariants.length > 0 ? { deferVariants } : {}),
  };
}

/**
 * 맨 위 주의는 한 줄만 — 우선순위(§13-6). 칸에만 해당하는 것은 줄 표시로 간다.
 * 팔 아낌 > 쉬는 날 넘김 > 회복 데이 > 센 불펜 · 라이브 > 부하 모름 · 통증 확인 전 > 짐작한 등판 오늘 · 내일 > 등판 3일 안 > 어제 하체 >
 * 부하 주의 · 근육통 · 잠 > 오래 쉼 > 가벼운 주.
 *
 * applied 는 판정이 실제로 바꾼 것(2판 P6-2) — armRest 팔로 던지는 변형을 뺐다 · lowerBudget 어제 하체 날이라 큰 하체를 가볍게 했다. 신호만
 * 있고 바뀐 것이 없으면(그날 메디신볼 · 큰 하체가 없음) 말하지 않는다. 안 주면 예전 차례 그대로다.
 *
 * 팔 아낌이 쉬는 날 넘김보다 앞인 까닭: 앱에서 팔을 다 쓴 날(오늘 등판 · 경기 기록 · 세게 던진 날)은 모두 쉬는 날이라, 하는 날이 되는 것은
 * '그래도 오늘 할래요'로 넘긴 날뿐이다. 그날 '쉬는 게 좋은 날이에요'만 보이면 메디신볼이 왜 빠졌는지 모른다 — 팔 아낌 글에 '아프면 바로
 * 멈춰요'를 같이 적어 넘김 글의 몫도 한다. 어제 하체가 부하 모름 · 통증 확인 전 뒤인 까닭: 안전 쪽 글이 먼저고(가볍게 한 까닭은 줄 표시
 * '−10% · −1세트'가 보인다), 근육통 · 잠의 '가볍게'(lighter)보다는 까닭이 구체적이라 앞이다.
 */
export function pickCaution(
  s: TodaySignals,
  lightWeek: boolean,
  gapDays: number | null,
  applied: {
    armRest?: boolean;
    lowerBudget?: boolean;
    outingGuess?: boolean;
    outingSoon?: boolean;
  } = {}
): CautionCode | null {
  if (applied.armRest) return 'armRest';
  if (
    s.override &&
    (s.gameToday || s.gameTomorrow || s.gameYesterday || s.hardToday || s.choseRecovery)
  )
    return 'gameOverride';
  if (s.recovery) return 'recovery';
  if (s.hardThrowRecent) return 'hardThrow';
  if (s.uncertain) return 'uncertain';
  /* 등판이 가까워 가볍게 한 날(2판 P6 검토) — 어제 하체보다 앞(다음 등판이 더 가까운 까닭이다) */
  if (applied.outingGuess) return 'outingGuess';
  if (applied.outingSoon) return 'outingSoon';
  if (applied.lowerBudget) return 'lowerBudget';
  if (s.loadCaution || s.soreMany || s.sleepShort) return 'lighter';
  if (gapDays != null && gapDays >= 8) return 'restGap';
  if (lightWeek) return 'lightWeek';
  return null;
}

/**
 * 주의 한 줄 문구 — 해요체, 줄표 없이.
 *
 * gameOverride 는 쉬는 날을 넘긴 세 경우(경기 날 · 전날 · 어제 팔 부담) 모두에 붙는다. 예전 글 '경기 날이에요.'는 전날 · 다음 날에도
 * 맞지 않았고, 2판 P4 커밋 F 부터 어제 세게 던진 불펜 다음 날도 여기 들어와 더 틀린 말이 돼서 까닭을 가리지 않는 글로 바꿨다. 2판 P6-2 부터
 * 오늘 세게 던진 날 · 오늘 '회복'을 고른 날을 넘긴 때도 이 글이다(까닭을 가리지 않는 글이라 그대로 맞다).
 *
 * armRest 는 빼기만 하고 다시 넣는 날을 약속하지 않는다 — 다음 날 일정이 뺀 것을 읽는 곳이 없어서 '내일로 미뤘어요'는 거짓이 된다(비판 1
 * 빈틈 31 · 32, 중재 ARM_BUDGET_TEXT 와 같은 꼴). lowerBudget 은 중재 LOWER_BUDGET_TEXT.programLighter 가 이 글을 그대로 쓴다(한 곳).
 */
export const CAUTION_TEXT: Record<CautionCode, string> = {
  armRest: '팔을 아끼는 날이라 던지기 운동은 뺐어요. 아프면 바로 멈춰요.',
  gameOverride: '쉬는 게 좋은 날이에요. 가볍게 하고, 아프면 바로 멈춰요.',
  recovery: '몸이 지쳐 있어요. 무리하지 말고 천천히 해요.',
  hardThrow: '최근에 많이 던졌어요. 무리하지 마요.',
  uncertain: '오늘 상태를 다 알지 못해요. 조심해서 해요.',
  /* 짐작한(달력 · 같은 요일) 등판이 오늘 · 내일 — 확정이 아니라 '일 수 있어요'(2판 P6 검토) */
  outingGuess: '곧 등판일 수 있어 큰 하체와 파워는 가볍게 해요.',
  outingSoon: '등판이 가까워 큰 하체는 가볍게 해요.',
  /* 어제 하체 날(저장만 한 일정 · 가벼운 하체 날도 센다 — 중재 lowerBudget)이라 '무겁게 했어요'로 단정하지 않는다(2판 P6 검토) */
  lowerBudget: '어제가 하체 날이라 큰 하체는 가볍게 해요.',
  lighter: '오늘은 조금 가볍게 했어요.',
  restGap: '오래 쉬었어요. 무게를 낮춰 다시 시작해요.',
  lightWeek: '가볍게 하는 세션이에요. 무게가 낮은 게 맞아요.',
};

/**
 * 쉬는 까닭 — 카드 밑 한 줄과 '그래도 할까요?' 창 제목('…. 그래도 할까요?')에 쓰인다. gameYesterday 는 2판 P4 커밋 F 부터 경기가 아니라
 * 어제 팔 부담(세게 던진 날 · 중간 부하 + 운동 힘듦 급증 · 기록 없는 등판)이라 '경기 다음 날이에요'가 아니다. hardToday · chooseRecovery 는
 * 2판 P6-2 — 중재의 쉬는 글(PROGRAM_YIELD_TEXT hard · chooseRecovery)과 같은 날을 카드 한 줄 꼴로 말한다.
 */
export const REST_TEXT: Record<RestReason, string> = {
  gameToday: '경기 날이에요',
  gameTomorrow: '내일 경기예요',
  gameYesterday: '어제 팔 부담이 컸어요',
  hardToday: '오늘 많이 던졌어요',
  chooseRecovery: '오늘 회복을 골랐어요',
};

/**
 * 어제 팔 부담으로 쉬는 날의 까닭 — 까닭(yesterdayArmLoadOf 의 kind)마다 다르게(2판 P4 검토). 셋을 한 글('어제 팔 부담이 컸어요')로 쓰면
 * 기록 없는 등판(투구수를 모름)에도 '컸어요'라고 단정하고, 중간 부하 + 힘듦 급증 날엔 매일 일정('어제 N구를 던졌고 최근 운동도
 * 힘들었어요') · 암케어('어제 N구')와 다른 말을 했다. REST_TEXT.gameYesterday 는 까닭을 모를 때(옛 신호)만 쓴다.
 */
export const REST_YESTERDAY_TEXT: Record<YesterdayArmLoadKind, string> = {
  hard: '어제 많이 던졌어요',
  moderateSpike: '어제 던졌고 최근 운동도 힘들었어요',
  claimedNoLog: '어제 등판한 다음 날이에요',
};

/** 쉬는 까닭 한 줄 — 어제 팔 부담이면 그 까닭대로, 아니면 REST_TEXT */
export function restTextOf(
  reason: RestReason,
  yesterday: YesterdayArmLoadKind | null = null
): string {
  return reason === 'gameYesterday' && yesterday
    ? REST_YESTERDAY_TEXT[yesterday]
    : REST_TEXT[reason];
}

/* ─────────────────────────── 일차 넘기기(§9 · U2 · U4) ─────────────────────────── */

export type SessionProgramTag = {
  key: string;
  day: number;
  week: number;
  /** 운동 시작 때 판정한 쉰 기간(일) — 운동 중 [교체]의 무게가 카드와 같게. 2026-10-07 앞의 판에는 없다 */
  gapDays?: number | null;
};

/** 얼린 목록의 program 을 읽는다. 모양이 아니면 null(프로그램 아닌 날) */
export function readSessionProgram(value: unknown): SessionProgramTag | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<SessionProgramTag>;
  if (
    typeof v.key !== 'string' ||
    !Number.isInteger(v.day) ||
    !Number.isInteger(v.week)
  ) {
    return null;
  }
  return {
    key: v.key,
    day: v.day as number,
    week: v.week as number,
    ...(typeof v.gapDays === 'number' ? { gapDays: v.gapDays } : {}),
  };
}

/** 다음 일차로 가려면 처방 세트의 절반(올림) 이상 */
export function setsNeeded(plannedTotal: number): number {
  return Math.ceil(plannedTotal / 2);
}

export type AdvanceInput = {
  /** 세션 얼린 목록의 program(없으면 프로그램 아닌 날) */
  program: SessionProgramTag | null;
  /** 진행 중인 프로그램의 nextDay. 진행 중이 아니면 null */
  nextDay: number | null;
  /** programSlot 이 있는 운동들의 처방 세트 합 */
  plannedSets: number;
  /** 그 운동들에 남긴 세트 수(대체 운동 세트 포함) */
  loggedSets: number;
};

/**
 * 이 세션으로 일차를 넘기는가. 넘기는 쓰기는 'nextDay = program.day 일 때만 +1'(조건부 한 번 쓰기, U2)이라
 * [종료] · 저절로 닫기 · 늦은 세트(U4) 세 곳에서 불러도 한 번만 넘어간다.
 */
export function shouldAdvance(a: AdvanceInput): boolean {
  if (!a.program || a.nextDay == null) return false;
  if (a.program.day !== a.nextDay) return false;
  if (a.plannedSets <= 0) return false;
  return a.loggedSets >= setsNeeded(a.plannedSets);
}

/* ─────────────────────────── 진행 · 끝(§13-13 · 15) ─────────────────────────── */

/**
 * 끝내기 창의 한 줄(§13-9) — '16세트 중 7세트. 8세트를 하면 다음 세션으로 가요'.
 * 넘었으면 '2번 세션을 마쳐요'.
 */
export function finishLine(
  day: number,
  plannedSets: number,
  loggedSets: number
): string {
  const need = setsNeeded(plannedSets);
  if (loggedSets >= need) return `${day}번 세션을 마쳐요`;
  return `${plannedSets}세트 중 ${loggedSets}세트. ${need}세트를 하면 다음 세션으로 가요`;
}

/** 준비 세트 한 줄(§13-8) — 바벨 큰 운동만. 빈 봉 20kg 에서 60% · 80% 를 2.5kg 단위로. */
export function warmupLine(targetKg: number | null, unit = 2.5): string | null {
  if (targetKg == null || targetKg < 40) return null;
  const round = (kg: number) => Math.round(kg / unit) * unit;
  const steps = [
    { kg: 20, reps: 8 },
    { kg: round(targetKg * 0.6), reps: 5 },
    { kg: round(targetKg * 0.8), reps: 3 },
  ].filter((s, i, all) => i === 0 || (s.kg > all[i - 1].kg && s.kg < targetKg));
  const text = steps
    .map((s, i) => (i === 0 ? `빈 봉×${s.reps}` : `${formatKg(s.kg)}×${s.reps}`))
    .join(' → ');
  return `${text} · 적지 않아도 돼요`;
}

function formatKg(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(1);
}
