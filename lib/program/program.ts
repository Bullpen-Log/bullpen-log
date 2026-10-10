import { intensityLevel } from '@/lib/exercise-meta';
import { canDo } from '@/lib/report/equipment';
import { filterByLevel } from '@/lib/report/personalize';
import { withJosa } from '@/lib/korean';

/**
 * 근력 · 파워 프로그램 — 프로그램 목록 · 시작 자격 · 운동 고정 · 오늘 판정 · 일차 넘기기. 순수 함수만(DB 를 모른다).
 *
 * 안전 · 화면 규칙: docs/designs/pitcher-strength-power-programs.md. 프로그램 목록은 이 파일의 PROGRAMS.
 * 2026-10-07 사용자: "실제 있는 프로그램을 기반으로" — 스트롱리프트 5×5 · 5/3/1 BBB · 5/3/1 · 텍사스 메소드 ·
 * 저거넛 5회 파도 · WS4SB · 프렌치 컨트라스트. 모두 원본의 첫 4주. 투수라서 원본과 다르게 한 곳에는 '투수 맞춤' 주석을 단다.
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
  | 'pull'
  | 'singleLeg'
  | 'jump'
  | 'medball'
  | 'antiRotation'
  | 'rotationalThrow';

export const VARIANT_KEYS: readonly VariantKey[] = [
  'squat',
  'hinge',
  'push',
  'pull',
  'singleLeg',
  'jump',
  'medball',
  'antiRotation',
  'rotationalThrow',
];

export const VARIANT_LABELS: Record<VariantKey, string> = {
  squat: '스쿼트',
  hinge: '힌지',
  push: '밀기',
  pull: '당기기',
  singleLeg: '한 다리',
  jump: '점프',
  medball: '메디신볼',
  antiRotation: '몸통 버티기',
  rotationalThrow: '회전 던지기',
};

/** 변형 → 칸 종류. 그날 조정(가볍게 · 빼기 · 대체)과 '몇 개 더?'는 칸 종류로 정한다. */
export const SLOT_OF: Record<VariantKey, SlotKind> = {
  squat: 'bigLower',
  hinge: 'bigLower',
  push: 'pushPull',
  pull: 'pushPull',
  singleLeg: 'singleLeg',
  jump: 'power',
  medball: 'power',
  antiRotation: 'core',
  rotationalThrow: 'core',
};

/** 무게를 드는 칸 */
export const WEIGHTED_SLOTS: readonly SlotKind[] = [
  'bigLower',
  'pushPull',
  'singleLeg',
];

/** 시작에 꼭 있어야 하는 장비(§1) — 모든 프로그램이 같다. 트랩바는 '바벨'에 들어간다(§13-21). */
export const REQUIRED_EQUIPMENT: readonly string[] = ['바벨', '덤벨', '메디신볼'];

/** 기준 무게(TM) = 추정 최대 × 0.9 — 5/3/1 · 저거넛 원본 규칙 */
export const TM_RATIO = 0.9;

/** '+' 세트에서 남기는 개수 — 투수 맞춤: 원본처럼 끝까지 가지 않는다 */
export const PLUS_RESERVE = 2;

/** 기준 무게를 정할 때 보는 시작 전 기간(일) */
export const TM_LOOKBACK_DAYS = 42;

/* ─────────────────────────────── 프로그램 모양 ─────────────────────────────── */

export type ProgramId =
  | 'stronglifts-5x5'
  | '531-bbb'
  | '531'
  | 'texas-method'
  | 'juggernaut-5s'
  | 'ws4sb'
  | 'french-contrast'
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
 *   pct     — 기준 무게(TM)의 몇 %. TM 은 시작 전 기록으로 정해 4주 동안 그대로(5/3/1 · 저거넛 · 텍사스 · 프렌치 컨트라스트)
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
  /** 앞 운동과 묶음 — 한 세트씩 번갈아 바로 이어서(대비 · 프렌치 컨트라스트) */
  group?: boolean;
  /** 준비 세트로 올라가 본 세트 하나(WS4SB 최대 노력) */
  top?: boolean;
};

type DayBuild = { label: string | null; items: readonly Item[] };

export type ProgramDef = {
  id: ProgramId;
  goal: ProgramGoal;
  name: string;
  /** 원작자 · 원래 이름 */
  origin: string;
  /** 카드 한 줄 */
  summary: string;
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
  /** 시작에 꼭 있어야 하는 장비 — 없으면 REQUIRED_EQUIPMENT(바벨 · 덤벨 · 메디신볼) */
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
  extra: { group?: boolean; top?: boolean } = {}
): Item => ({ variant, mode, sets, rest, ...extra });

/** 보조 운동 — 가벼운 주는 2세트 · 4개 남기고 */
const assist = (
  variant: VariantKey,
  n: number,
  count: number,
  light: boolean,
  rest = 90
): Item =>
  item(variant, 'reserve', light ? reps(2, count, 4) : reps(n, count, 2), rest);

/* 투수 맞춤: 날마다 끝에 몸통 버티기 하나(원본의 보조 운동 자리) */
const coreItem = (light = false): Item =>
  item('antiRotation', 'none', light ? reps(2, 10) : reps(3, 10), 60);

/* ─────────────────────────────── 기초 ─────────────────────────────── */

const STRONGLIFTS: ProgramDef = {
  id: 'stronglifts-5x5',
  goal: 'base',
  name: '스트롱리프트 5×5',
  origin: 'StrongLifts 5×5 · 메흐디 하딤',
  summary: '매번 5회 5세트, 다 채우면 다음에 무게를 올려요',
  detail: [
    'A 날(스쿼트 · 밀기 · 당기기)과 B 날(스쿼트 · 데드리프트)을 번갈아 해요.',
    '다 채우면 다음 회차에 2.5kg(데드리프트 5kg)을 올리고, 세 번 연속 못 채우면 10% 낮춰요.',
    '투수에 맞춰 오버헤드 프레스는 빼고 밀기는 덤벨로 해요. 날마다 몸통 버티기를 더했어요.',
  ],
  weeks: 4,
  perWeek: [3],
  lightWeeks: [],
  build: (day) => {
    const a = day % 2 === 1;
    return {
      label: a ? 'A 날' : 'B 날',
      /* 투수 맞춤: B 날의 오버헤드 프레스는 뺀다 — 밀기가 매 회차면 덤벨 무게가 원본보다 세 배 빨리 오른다 */
      items: a
        ? [
            item('squat', 'linear', reps(5, 5), 180),
            item('push', 'linear', reps(5, 5), 120),
            item('pull', 'linear', reps(5, 5), 120),
            coreItem(),
          ]
        : [
            item('squat', 'linear', reps(5, 5), 180),
            item('hinge', 'linear', reps(1, 5), 180),
            coreItem(),
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

/** BBB 5×10 의 TM % — 4주(가볍게)는 하지 않는다 */
const BBB_PCT = [0.5, 0.6, 0.6];

function waveDay(
  wave: readonly (readonly SetRx[])[],
  bbb: boolean
): ProgramDef['build'] {
  return (day, week, perWeek, light) => {
    const lifts = mainLifts(day, perWeek);
    const items: Item[] = [
      /* 원저자 권장: 들기 전에 뛰고 던지기. 밀기 날은 메디신볼 */
      item(lifts[0] === 'push' ? 'medball' : 'jump', 'none', reps(3, 3), 90),
    ];
    lifts.forEach((v, i) => {
      const extra = bbb && i === 0 && !light ? pctSets(5, 10, BBB_PCT[week - 1]) : [];
      items.push(item(v, 'pct', [...wave[week - 1], ...extra], v === 'push' ? 150 : 180));
    });
    if (bbb) {
      items.push(assist('pull', 5, 10, light));
    } else {
      items.push(assist('pull', 3, 10, light), assist('singleLeg', 3, 8, light));
    }
    items.push(coreItem(light));
    return { label: null, items };
  };
}

const BBB_531: ProgramDef = {
  id: '531-bbb',
  goal: 'base',
  name: '5/3/1 BBB',
  origin: "5/3/1 Boring But Big · 짐 웬들러",
  summary: '5/3/1 뒤에 같은 운동을 10회씩 5세트 더 해 근육을 키워요',
  detail: [
    '본 운동은 5/3/1 과 같고, 그 뒤에 같은 운동을 가볍게(기준 무게의 50~60%) 10회씩 5세트 더 해요.',
    '%는 기준 무게(추정 최대의 90%)의 비율이에요. 기준 무게는 시작 전 기록으로 정하고 4주 동안 그대로예요.',
    '4주는 가볍게 해요. 투수에 맞춰 밀기는 덤벨로, + 세트는 2개 남기고 멈춰요.',
  ],
  weeks: 4,
  perWeek: [2, 3],
  lightWeeks: [4],
  build: waveDay(WAVE_531, true),
};

/* ─────────────────────────────── 근력 ─────────────────────────────── */

const W531: ProgramDef = {
  id: '531',
  goal: 'strength',
  name: '5/3/1',
  origin: '5/3/1 · 짐 웬들러',
  summary: '1주 5회, 2주 3회, 3주 5·3·1회, 4주는 가볍게 해요',
  detail: [
    '본 운동 3세트의 마지막(+)은 할 수 있는 만큼 하되 2개 남기고 멈춰요.',
    '%는 기준 무게(추정 최대의 90%)의 비율이에요. 기준 무게는 시작 전 기록으로 정하고 4주 동안 그대로예요.',
    '원저자 권장대로 들기 전에 점프나 메디신볼을 하고, 보조로 당기기 · 한 다리 · 몸통을 해요.',
  ],
  weeks: 4,
  perWeek: [2, 3],
  lightWeeks: [4],
  build: waveDay(WAVE_531, false),
};

/**
 * 텍사스 금요일 5회 1세트의 TM % — 매주 2.5%씩 최고 기록. 투수 맞춤: 4주차 92.5%(추정 최대의 83%)로 끝내
 * 5회 최대(약 86%)까지 가지 않는다 — 1~2개는 남는다.
 */
const texasFriday = (week: number) => 0.85 + 0.025 * (week - 1);

const TEXAS: ProgramDef = {
  id: 'texas-method',
  goal: 'strength',
  name: '텍사스 메소드',
  origin: 'Texas Method · 마크 리피토 · 글렌 펜들레이',
  summary: '월 많이, 수 가볍게, 금 최고 기록을 내요',
  detail: [
    '월요일은 5세트 × 5회(금요일 무게의 90%), 수요일은 가볍게(월요일의 80~90%), 금요일은 5회 1세트로 매주 기록을 올려요.',
    '%는 기준 무게(추정 최대의 90%)의 비율이에요.',
    '투수에 맞춰 파워 클린 대신 점프, 밀기는 덤벨로 해요. 주 3번만 할 수 있어요.',
  ],
  weeks: 4,
  perWeek: [3],
  lightWeeks: [],
  build: (day, week) => {
    const fri = texasFriday(week);
    const mon = fri * 0.9;
    return cycle<DayBuild>(
      [
        {
          label: '많이 하는 날',
          items: [
            item('squat', 'pct', pctSets(5, 5, mon), 180),
            item('push', 'pct', pctSets(5, 5, mon), 150),
            item('hinge', 'pct', pctSets(1, 5, fri), 180),
            coreItem(),
          ],
        },
        {
          label: '가벼운 날',
          items: [
            item('squat', 'pct', pctSets(2, 5, mon * 0.8), 120),
            item('push', 'pct', pctSets(3, 5, mon * 0.9), 120),
            assist('pull', 3, 8, false),
            coreItem(),
          ],
        },
        {
          label: '최고 기록 날',
          items: [
            /* 투수 맞춤: 파워 클린 대신 점프 */
            item('jump', 'none', reps(5, 3), 90),
            item('squat', 'pct', pctSets(1, 5, fri), 180),
            item('push', 'pct', pctSets(1, 5, fri), 150),
            coreItem(),
          ],
        },
      ],
      day
    );
  },
};

const JUGGERNAUT: ProgramDef = {
  id: 'juggernaut-5s',
  goal: 'strength',
  name: '저거넛 5회 파도',
  origin: 'Juggernaut Method 5s wave · 채드 웨슬리 스미스',
  summary: '쌓기, 세게, 기록 내기, 가볍게 순서로 4주를 가요',
  detail: [
    '1주는 5회를 여러 세트 쌓고, 2주는 무게를 올리고, 3주는 + 세트로 기록을 내고, 4주는 가볍게 해요.',
    '%는 기준 무게(추정 최대의 90%)의 비율이에요. + 세트는 2개 남기고 멈춰요.',
    '들기 전에 점프나 메디신볼을 하고, 보조로 당기기 · 한 다리 · 몸통을 해요.',
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
  name: '웨스트사이드 포 스키니 배스터즈',
  origin: 'Westside for Skinny Bastards · 조 디프랑코',
  summary: '최고 기록 날과 점프 날로 힘과 탄력을 같이 길러요',
  detail: [
    '웨스트사이드를 운동선수용으로 바꾼 프로그램이에요. 1회 최대 대신 3~5회 최대, 속도 스쿼트 대신 점프를 해요.',
    '무거운 날은 준비 세트로 올라가 본 세트 하나를 1개 남기고 해요. 운동은 매주 스쿼트와 힌지를 바꿔요.',
    '주 3번이면 상체를 여러 번 하는 날이 더해져요. 투수에 맞춰 밀기는 덤벨로 해요.',
  ],
  weeks: 4,
  perWeek: [2, 3],
  lightWeeks: [],
  build: (day, week, perWeek) => {
    const heavy: DayBuild = {
      label: '무거운 날',
      items: [
        item('jump', 'none', reps(3, 3), 90),
        item(
          (['squat', 'hinge', 'squat', 'hinge'] as const)[week - 1],
          'reserve',
          [{ reps: week <= 2 ? 5 : 3, reserve: 1 }],
          180,
          { top: true }
        ),
        assist('singleLeg', 3, 8, false),
        assist('pull', 3, 10, false),
        coreItem(),
      ],
    };
    const jumps: DayBuild = {
      label: '점프 날',
      items: [
        item('jump', 'none', reps(5, 3), 90),
        item('medball', 'none', reps(4, 3), 90),
        assist('singleLeg', 3, 10, false),
        assist('push', 3, 10, false),
        assist('pull', 3, 10, false),
        coreItem(),
      ],
    };
    const upper: DayBuild = {
      label: '상체 반복 날',
      items: [
        item('medball', 'none', reps(3, 5), 90),
        assist('push', 3, 12, false),
        assist('pull', 4, 10, false),
        coreItem(),
      ],
    };
    return cycle(perWeek === 3 ? [heavy, jumps, upper] : [heavy, jumps], day);
  },
};

/** 프렌치 컨트라스트 — 무겁게(추정 최대의 %) · 횟수 · 묶음 수, 주마다 */
const CONTRAST_WEEKS = [
  { max: 0.8, count: 3, rounds: 3 },
  { max: 0.85, count: 3, rounds: 4 },
  { max: 0.88, count: 2, rounds: 4 },
  { max: 0.7, count: 3, rounds: 2 },
];

const FRENCH_CONTRAST: ProgramDef = {
  id: 'french-contrast',
  goal: 'power',
  name: '프렌치 컨트라스트',
  origin: 'French Contrast · 칼 디츠',
  summary: '무겁게 들고 바로 점프, 메디신볼까지 한 묶음으로 해요',
  detail: [
    '무겁게(추정 최대의 80~88%, 기준 무게로는 89~98%) → 20초 → 점프 5회 → 20초 → 메디신볼 5회가 한 묶음이에요. 묶음 사이는 3분 쉬어요.',
    '원본의 넷째 · 다섯째 동작(무게 들고 점프, 도움 받는 점프)은 우리 장비에 맞춰 메디신볼 하나로 합쳤어요.',
    '4주는 가볍게 해요.',
  ],
  weeks: 4,
  perWeek: [2, 3],
  lightWeeks: [4],
  build: (day, week, _perWeek, light) => {
    const w = CONTRAST_WEEKS[week - 1];
    const bundle = (v: VariantKey): Item[] => [
      item(v, 'pct', pctSets(w.rounds, w.count, w.max / TM_RATIO), 20),
      item('jump', 'none', reps(w.rounds, 5), 20, { group: true }),
      item('medball', 'none', reps(w.rounds, 5), 180, { group: true }),
    ];
    return day % 2 === 1
      ? {
          label: 'A 날',
          items: [
            ...bundle('squat'),
            assist('singleLeg', 3, 6, light),
            assist('pull', 3, 8, light),
            coreItem(light),
          ],
        }
      : {
          label: 'B 날',
          items: [...bundle('hinge'), assist('push', 3, 8, light), coreItem(light)],
        };
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
 * 날마다 같은 일곱(전신) — 처음 배우는 사람은 같은 동작을 자주 하는 편이 자세가 빨리 익는다(Faigenbaum 2009).
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
  required: [],
  name: '기본기 4주',
  origin: '성장기 · 입문 투수용 맨몸 · 가벼운 저항',
  summary: '무게 없이 자세부터 익혀요. 횟수와 세트만 조금씩 늘려요',
  detail: [
    '날마다 같은 일곱 가지를 해요. 던지기(메디신볼이 없으면 점프) · 스쿼트 · 밀기 · 힌지 · 당기기 · 한 다리 · 몸통 버티기예요.',
    '2주차에 세트가 하나 늘고, 3주차에 횟수가 둘 늘어요. 4주는 가볍게 해요.',
    '무게는 추천하지 않아요. 덤벨이나 밴드를 쓰면 같은 자세가 끝까지 유지되는 가장 가벼운 것으로 해요.',
    '다 마치면 성인은 근력 · 파워 프로그램이 열려요. 만 18세 전이면 코치나 트레이너와 함께 무게를 시작해요.',
  ],
  weeks: 4,
  perWeek: [3],
  lightWeeks: [4],
  build: (_day, week) => {
    const w = BASICS_WEEKS[week - 1];
    const lift = (v: VariantKey) => item(v, 'none', reps(w.sets, w.count), 60);
    return {
      label: null,
      items: [
        /* 던지기 · 점프는 지치기 전에 맨 앞 */
        item('medball', 'none', reps(w.sets, 5), 90),
        lift('squat'),
        lift('push'),
        lift('hinge'),
        lift('pull'),
        lift('singleLeg'),
        item('antiRotation', 'none', reps(w.sets, 8), 45),
      ],
    };
  },
};

/** 고르기 화면의 차례 — 기본기는 화면이 따로 맨 위에 둔다(audience) */
export const PROGRAMS: readonly ProgramDef[] = [
  STRONGLIFTS,
  BBB_531,
  W531,
  TEXAS,
  JUGGERNAUT,
  WS4SB,
  FRENCH_CONTRAST,
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

/** 카드 부제 — '12회 · 주 3번 · 4주' */
export function planSubtitle(plan: ProgramPlan): string {
  return `${plan.totalDays}회 · 주 ${plan.perWeek}번 · ${plan.totalWeeks}주`;
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

export function dayLabel(plan: ProgramPlan, day: number): string {
  const week = weekOfDay(plan, day);
  const inWeek = ((day - 1) % plan.perWeek) + 1;
  const label = dayPlan(plan, day).label;
  return `${week}주차 · ${inWeek}일차${label ? ` · ${label}` : ''}`;
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
    const base = `${n}세트 × ${rx.sets[0].reps}회${side}`;
    return rx.slot === 'power' ? `${base} · 최대 속도 · 충분히 쉬고` : base;
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
  if (rx.mode === 'linear') return `${n}세트 × ${rx.reps}회${side} · 다 채우면 다음에 올려요`;
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
  const plus = rx.sets.some((s) => s.plus) ? ` · +는 ${PLUS_RESERVE}개 남기고` : '';
  return `${parts.join(' → ')}${side}${plus}`;
}

/* ─────────────────────────── 고르기 화면 ─────────────────────────── */

/** 고르기 화면(program-start.tsx)에 넘기는 것 — 글과 숫자만 */
export type ProgramChoice = Pick<
  ProgramDef,
  'id' | 'goal' | 'name' | 'origin' | 'summary' | 'detail' | 'perWeek'
> & {
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

export const PROGRAM_MIN_AGE = 18;
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
 * 기본기는 꼭 있어야 하는 장비가 없다(맨몸).
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
    audience === 'basics' ? [] : REQUIRED_EQUIPMENT
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
  return did >= Math.ceil(plan.totalDays / 2);
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

type VariantRule = {
  /** 후보인가 */
  match: (ex: PinnableExercise) => boolean;
  /** 앞에 올수록 먼저 고른다(작을수록 앞) */
  rank: (ex: PinnableExercise) => number[];
};

const isWeighted = (ex: PinnableExercise) =>
  ex.equipment.some((e) => ['바벨', '덤벨', '케틀벨', '원판', '케이블'].includes(e));

const VARIANT_RULES: Record<VariantKey, VariantRule> = {
  /* 큰 하체는 두 발로, 무게를 들고, 강도 '높음' 이상 — 바벨을 먼저 */
  squat: {
    match: (ex) =>
      ex.category === '하체 스트렝스' &&
      ex.movementPattern === '스쿼트' &&
      !ex.perSide &&
      isWeighted(ex) &&
      intensityLevel(ex.intensity) >= 4,
    rank: (ex) => [BARBELL_FIRST(ex)],
  },
  hinge: {
    match: (ex) =>
      ex.category === '하체 스트렝스' &&
      ex.movementPattern === '힌지' &&
      !ex.perSide &&
      isWeighted(ex) &&
      intensityLevel(ex.intensity) >= 4,
    /* 데드리프트 · RDL 이 큰 힌지다 — 힙 쓰러스트는 보조라 뒤로 */
    rank: (ex) => [/데드리프트|RDL/.test(ex.title) ? 0 : 1, BARBELL_FIRST(ex)],
  },
  /* 투수 맞춤: 밀기는 덤벨을 먼저(바벨 벤치 · 오버헤드 프레스 대신 — 어깨 보호) */
  push: {
    match: (ex) =>
      ex.category === '상체 스트렝스' &&
      ex.movementPattern === '밀기' &&
      !ex.perSide &&
      isWeighted(ex) &&
      intensityLevel(ex.intensity) >= 4,
    rank: (ex) => [ex.equipment.includes('덤벨') ? 0 : 1, BARBELL_FIRST(ex)],
  },
  /* 당기기는 무거운 것이 적어 '중간'까지 받는다. 덤벨 · 바벨 로우를 철봉보다 먼저(무게 흐름을 보려고) */
  pull: {
    match: (ex) =>
      ex.category === '상체 스트렝스' &&
      ex.movementPattern === '당기기' &&
      isWeighted(ex) &&
      intensityLevel(ex.intensity) >= 3,
    rank: (ex) => [ex.perSide ? 1 : 0, -intensityLevel(ex.intensity)],
  },
  singleLeg: {
    match: (ex) =>
      ex.category === '하체 스트렝스' &&
      ex.movementPattern === '런지' &&
      isWeighted(ex) &&
      intensityLevel(ex.intensity) >= 3,
    /* 스플릿 스쿼트 · 리버스 런지가 무게를 올려 가기 좋은 한쪽 하체다 */
    rank: (ex) => [
      /스플릿 스쿼트|리버스 런지/.test(ex.title) ? 0 : 1,
      ex.equipment.includes('덤벨') ? 0 : 1,
      -intensityLevel(ex.intensity),
    ],
  },
  /* 파워 점프는 맨몸 · 박스로 뛰는 것 — 두 발 점프를 먼저 */
  jump: {
    match: (ex) =>
      ex.category === '파워' &&
      (ex.movementPattern === '스쿼트' || ex.movementPattern === '런지') &&
      ex.equipment.every((e) => e === '맨몸' || e === '박스'),
    rank: (ex) => [ex.perSide ? 1 : 0, ex.title.includes('점프') ? 0 : 1],
  },
  medball: {
    match: (ex) => ex.category === '파워' && ex.equipment.includes('메디신볼'),
    /* 던지기(밀기 · 당기기 계열)를 먼저, 회전은 5~8주 몸통 칸이 쓰므로 뒤로, 뛰며 던지는 것은 맨 뒤 */
    rank: (ex) => [
      ex.movementPattern === '밀기' || ex.movementPattern === '당기기'
        ? 0
        : ex.movementPattern === '회전'
          ? 1
          : 2,
    ],
  },
  antiRotation: {
    match: (ex) =>
      ex.category === '코어' &&
      [...ANTI_ROTATION_WORDS, ...ANTI_ROTATION_FALLBACK_WORDS].some((w) =>
        ex.title.includes(w)
      ),
    rank: (ex) => [
      ANTI_ROTATION_WORDS.some((w) => ex.title.includes(w)) ? 0 : 1,
      ex.title.includes('팔로프') ? 0 : ex.title.includes('캐리') ? 1 : 2,
    ],
  },
  /* 회전 던지기 — 메디신볼을 먼저, 없으면 돌리는 코어 */
  rotationalThrow: {
    match: (ex) =>
      (ex.category === '파워' &&
        ex.equipment.includes('메디신볼') &&
        ex.movementPattern === '회전') ||
      (ex.category === '코어' &&
        ROTATION_WORDS.some((w) => ex.title.includes(w)) &&
        !ANTI_ROTATION_WORDS.some((w) => ex.title.includes(w))),
    rank: (ex) => [ex.category === '파워' ? 0 : 1],
  },
};

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
  antiRotation: {
    match: (ex) => VARIANT_RULES.antiRotation.match(ex) && basicFit(ex),
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
  audience: ProgramAudience = 'adult'
): T[] {
  const ownedSet = new Set(owned);
  const rule = (audience === 'basics' ? BASICS_RULES : VARIANT_RULES)[variant];
  const usable = library.filter((ex) => rule.match(ex) && canDo(ex, ownedSet));
  const leveled = filterByLevel(usable, trainingLevel).pool;
  /* filterByLevel 이 경력 순으로 세운 것을 지키며, 같은 경력 안에서 변형 규칙의 차례로 */
  const levelRank = new Map(leveled.map((ex, i) => [ex.id, i]));
  return [...leveled].sort(
    (a, b) =>
      compareRank(rule.rank(a), rule.rank(b)) ||
      (levelRank.get(a.id) ?? 0) - (levelRank.get(b.id) ?? 0)
  );
}

export type Pinned = Partial<Record<VariantKey, string>>;

/** 시작할 때 9개를 고른다. 후보가 없는 변형은 비워 둔다 — 그 칸은 그날 대체 규칙으로 간다. */
export function pickPinned<T extends PinnableExercise>(
  library: readonly T[],
  owned: readonly string[],
  trainingLevel: string | null,
  keep: Pinned = {},
  audience: ProgramAudience = 'adult'
): Pinned {
  const out: Pinned = {};
  for (const v of VARIANT_KEYS) {
    const candidates = variantCandidates(v, library, owned, trainingLevel, audience);
    const kept = keep[v];
    if (kept && candidates.some((c) => c.id === kept)) {
      out[v] = kept;
      continue;
    }
    if (candidates[0]) out[v] = candidates[0].id;
  }
  return out;
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
  /** 던지는 일정 */
  gameToday: boolean;
  gameTomorrow: boolean;
  gameYesterday: boolean;
  bullpenToday: boolean;
  /** 세게 던진 불펜 · 라이브(강도 9~10 · 30구+) 당일 또는 다음 날 */
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
  /** 특정 부위 통증 · 뻐근 · 재활 관절로 그날 대체할 칸 */
  painSlots: readonly SlotKind[];
};

export type RestReason = 'gameToday' | 'gameTomorrow' | 'gameYesterday';

export type CautionCode =
  | 'gameOverride'
  | 'recovery'
  | 'hardThrow'
  | 'uncertain'
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
    };

export function daysBetween(fromKey: string, toKey: string): number {
  const a = Date.parse(`${fromKey}T00:00:00.000Z`);
  const b = Date.parse(`${toKey}T00:00:00.000Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * 오늘 프로그램 날인가, 무엇을 바꾸는가.
 *
 * 프로그램은 스스로 진행한다(D22). 기다리는 것은 통증 멈춤 · 경기 앞뒤(넘길 수 있음) · 어제 프로그램 날뿐이고,
 * 나머지 나쁜 날은 진행하되 주의 한 줄과 칸 조정으로 알린다(§4 · §5 · §6).
 */
export function decideToday(plan: ProgramPlan, s: TodaySignals): TodayDecision {
  const day = s.nextDay;
  if (day > plan.totalDays) return { kind: 'done' };
  if (s.halted) return { kind: 'painWait', day };
  if (!s.checkedIn) return { kind: 'needCheckin', day };
  if (s.otherWorkoutStarted) return { kind: 'otherMode', day };

  const gapDays = s.lastProgramDate ? daysBetween(s.lastProgramDate, s.today) : null;
  /* 프로그램 날은 하루 한 번, 어제가 프로그램 날이면 오늘은 아님(§6). 오늘 이미 했으면 여기 오지 않는다. */
  if (gapDays === 1) return { kind: 'spacing', day };

  const restReason: RestReason | null = s.gameToday
    ? 'gameToday'
    : s.gameTomorrow
      ? 'gameTomorrow'
      : s.gameYesterday
        ? 'gameYesterday'
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
        reason: '통증 부위',
        ...(adjust[slot]?.kind === 'lighter' ? { lighter: true as const } : {}),
      };
  }

  return {
    kind: 'go',
    day,
    week,
    caution: pickCaution(s, isLightWeek(plan, week), gapDays),
    adjust,
    gapDays,
  };
}

/**
 * 맨 위 주의는 한 줄만 — 우선순위(§13-6). 칸에만 해당하는 것은 줄 표시로 간다.
 * 경기 날 넘김 > 회복 데이 > 센 불펜 · 라이브 > 부하 모름 · 통증 확인 전 > 부하 주의 · 근육통 · 잠 > 오래 쉼 > 가벼운 주.
 */
export function pickCaution(
  s: TodaySignals,
  lightWeek: boolean,
  gapDays: number | null
): CautionCode | null {
  if (s.override && (s.gameToday || s.gameTomorrow || s.gameYesterday))
    return 'gameOverride';
  if (s.recovery) return 'recovery';
  if (s.hardThrowRecent) return 'hardThrow';
  if (s.uncertain) return 'uncertain';
  if (s.loadCaution || s.soreMany || s.sleepShort) return 'lighter';
  if (gapDays != null && gapDays >= 8) return 'restGap';
  if (lightWeek) return 'lightWeek';
  return null;
}

/** 주의 한 줄 문구 — 해요체, 줄표 없이 */
export const CAUTION_TEXT: Record<CautionCode, string> = {
  gameOverride: '경기 날이에요. 가볍게 하고, 아프면 바로 멈춰요.',
  recovery: '몸이 지쳐 있어요. 무리하지 말고 천천히 해요.',
  hardThrow: '최근에 많이 던졌어요. 무리하지 마요.',
  uncertain: '오늘 상태를 다 알지 못해요. 조심해서 해요.',
  lighter: '오늘은 조금 가볍게 했어요.',
  restGap: '오래 쉬었어요. 무게를 낮춰 다시 시작해요.',
  lightWeek: '가벼운 주예요. 무게가 낮은 게 맞아요.',
};

export const REST_TEXT: Record<RestReason, string> = {
  gameToday: '경기 날이에요',
  gameTomorrow: '내일 경기예요',
  gameYesterday: '경기 다음 날이에요',
};

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
 * 끝내기 창의 한 줄(§13-9) — '16세트 중 7세트. 8세트를 하면 다음 일차로 가요'.
 * 넘었으면 '2일차를 마쳐요'.
 */
export function finishLine(
  day: number,
  plannedSets: number,
  loggedSets: number
): string {
  const need = setsNeeded(plannedSets);
  if (loggedSets >= need) return `${day}일차를 마쳐요`;
  return `${plannedSets}세트 중 ${loggedSets}세트. ${need}세트를 하면 다음 일차로 가요`;
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
