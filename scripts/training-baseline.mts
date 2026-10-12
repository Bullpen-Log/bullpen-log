/**
 * 트레이닝 추천 기준선 — 가상 선수 12명 × 28일을 실제 운동 표로 돌려 잰다.
 *
 *   npm run training:baseline
 *   npm run training:baseline -- --out=<JSON 경로>
 *
 * 왜 있나. 추천 메커니즘 2판 검토안(docs/designs/training-recommendation-engine.md)이 낸 수치 — 씨앗만 바꾸면 목록
 * 90.9% 바뀜 · 체크인만 바꾸면 30.2% · 같은 설정 새 사용자 둘이 같은 목록 46.9% … — 는 스크래치에서 라이브러리를
 * 재구성해 돌린 것이라 저장소에 없다. 단계(P1~P6 · Y)마다 같은 잣대로 다시 재려면, 실제 운동 표로 도는 도구가 저장소
 * 안에 있어야 한다. 이 파일이 그 잣대다. 수치의 뜻은 아래 '재는 것' 표의 주석에 한 줄씩 적어 두었다.
 *
 * 무엇을 하나. 운동 표만 DB 에서 읽고(읽기만 — 자체 시험과 같은 findMany), 선수 12명의 투구 기록 · 체크인 · '마침'
 * 습관은 대본으로 지어낸다. 날마다 앱이 밟는 길(app/actions/training-setup.ts 의 createDailySetup)과 같은 인자로
 * buildDailyPlan 을 부른다. recentIds · sessionsAgo · lastLowerKey/UpperKey 는 DB 함수(lib/report/gather.ts)를
 * 스크립트에서 못 부르니 같은 뜻을 메모리에서 센다. 무작위가 없어 돌릴 때마다 같은 결과가 나온다.
 *
 * 앱과 다른 점 하나. 앱은 오늘 체크인이 없으면 일정을 만들지 않는다. 여기서는 '가끔' 체크인하는 선수도 날마다
 * 만든다 — 검토안의 336 일정(12 × 28)과 같은 분모로 견주기 위해서다. 그래서 주요 지표는 두 분모로 나란히 낸다:
 * 전체(336)와 '체크인 있는 날'(앱이 실제로 만드는 날). 체크인 없는 날의 수도 따로 센다.
 *
 * 결과는 표(stdout)와 JSON(임시 폴더, --out= 으로 바꿈)으로 남긴다. 지표 · 날별 기록은 돌릴 때마다 같다(무작위 없음,
 * DB 순서도 createdAt 으로 고정) — 바뀌는 것은 JSON 의 meta(만든 시각 · 걸린 시간)뿐이라, 단계 전후를 diff 로 견줄 때는
 * meta 를 빼고 본다.
 *
 * 대본 2판(2026-10-12, 2판 P3). 앱이 등판 답을 간편 체크인에서 받고(D1) 투구 강도를 체감 % 로 받게(D2) 돼, 대본도 그 꼴로 바꿨다 —
 * 체크인마다 등판 답 여섯 중 하나, 투구 기록마다 effortPct(대본 1판 강도 × 10 이라 세게 던진 날 · 부하는 같은 값). 그래서 P2 까지의
 * 표와는 ⑤ · ⑫ 의 정의가 다르고(답을 지운 변형으로 옛 숫자를 같이 낸다), 답이 새로 닿은 선수(선발B · 선발D · 구원A)의 날이
 * 바뀐다. 2판 전후를 견줄 때는 그 셋만 바뀌었는지 본다 — 상세 선수 · 비시즌 · 같은 설정 쌍은 그대로여야 한다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  buildFacts,
  HARD_OUTING_MIN_LOAD,
  NEAR_MAX_EFFORT_PCT,
  type CheckinLike,
} from '../lib/report/facts.ts';
import { buildPitchPlan, YOUTH_AGE_THRESHOLD } from '../lib/report/plan.ts';
import {
  buildDailyPlan,
  isHalted,
  strengthDatesFrom,
  type DailyPlan,
} from '../lib/report/daily-plan.ts';
import {
  CONDITIONING_GOAL,
  minutesChoicesFor,
  type ThemeKey,
} from '../lib/report/theme.ts';
import { RECENT_DAYS } from '../lib/report/today-pick.ts';
import {
  ALWAYS_OWNED,
  SELECTABLE_EQUIPMENT,
  filterByEquipment,
} from '../lib/report/equipment.ts';
import { TRAINING_LEVEL_NAMES, filterByLevel } from '../lib/report/personalize.ts';
import { intensityLevel, MAX_INTENSITY_LEVEL } from '../lib/exercise-meta.ts';
import {
  effortPctOf,
  effortToIntensity,
  outingLoadOf,
  shiftDateKey,
  type PitchLogLike,
} from '../lib/pitch-stats.ts';
import {
  LOW_CONDITION_THRESHOLD,
  nextOutingDays,
  SEVERE_ARM_FATIGUE,
  THROW_PLANS,
  type ThrowPlan,
} from '../lib/checkin.ts';
import { isArmPlyo, isHeavyUpperPush } from '../lib/engine/exercise-class.ts';

const startedAt = Date.now();

/* ------------------------------ 결과를 둘 곳 ------------------------------ */

/**
 * JSON 은 저장소 밖의 임시 폴더에 둔다 — 큰 파일이라 커밋할 것이 아니고, 어느 컴퓨터(노트북 · 김민)에서 돌려도 남의 홈
 * 경로를 만들지 않게 기계마다 제 임시 폴더를 쓴다. 전후를 견주려면 --out= 으로 따로 둔다.
 */
const DEFAULT_OUT = path.join(os.tmpdir(), 'bullpen-log', 'training-baseline.json');
const outArg = process.argv.find((a) => a.startsWith('--out='));
const OUT_PATH = outArg ? outArg.slice('--out='.length) : DEFAULT_OUT;

/* ------------------------------ 실제 운동 표 ------------------------------ */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
/* 자체 시험(scripts/training-selftest.mts)과 같은 조회 — 앱의 visibleExercises 와 같은 줄이 나온다 */
const library = await prisma.exerciseVideo.findMany({
  where: { hiddenAt: null },
  orderBy: { createdAt: 'asc' },
});
/*
 * 실제 투구 기록의 투구수 · 강도 · 종류(집계용). D2(체감 강도 0~100%) · D3(세게 던진 날 = 투구수 × 강도)의 문턱을 정할 때
 * 대본 숫자만으로는 모자라서, 실제 분포를 참고 표로 곁들인다. userId · date 는 '같은 사람의 같은 날' 기록을 합쳐 날 단위로
 * 세는 데만 쓰고(facts.ts outingByDay 가 날 단위다) 출력하지 않는다 — 이름 · 메모 같은 개인 정보는 읽지 않는다.
 */
const realLogs = await prisma.pitchLog.findMany({
  where: { pitchCount: { gt: 0 } },
  select: {
    userId: true,
    date: true,
    pitchCount: true,
    intensity: true,
    /* 체감 강도(%) — 2판 D2. 옛 줄은 null(세게 던진 날은 intensity × 10 으로 읽는다) */
    effortPct: true,
    sessionType: true,
  },
});
await prisma.$disconnect();

type Exercise = (typeof library)[number];
const byId = new Map<string, Exercise>(library.map((ex) => [ex.id, ex]));

/** '매우 높음'인가 — 이름이 아니라 단계 숫자로 본다(prescription.ts 와 같은 판단) */
const isVeryHigh = (ex: Exercise | undefined) =>
  ex != null && intensityLevel(ex.intensity) >= MAX_INTENSITY_LEVEL;

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
}

/** 메타 채움률 — 계열 · 난이도 · 강도(기본값 '중간'이 아닌 것) · 부위 · 세트/횟수 · 장비 */
const STRENGTH_OR_POWER = ['하체 스트렝스', '상체 스트렝스', '파워'];
const filledOf = (pool: Exercise[]) => ({
  total: pool.length,
  movementPattern: pool.filter((ex) => !!ex.movementPattern).length,
  difficulty: pool.filter((ex) => ex.difficulty != null).length,
  intensityNotDefault: pool.filter((ex) => ex.intensity !== '중간').length,
  bodyParts: pool.filter((ex) => ex.bodyParts.length > 0).length,
  setsAndReps: pool.filter(
    (ex) => ex.sets != null && (ex.reps != null || ex.holdSeconds != null)
  ).length,
  equipment: pool.filter((ex) => ex.equipment.length > 0).length,
});
const libraryStats = {
  total: library.length,
  byCategory: countBy(library, (ex) => ex.category),
  byIntensity: countBy(library, (ex) => ex.intensity),
  byDifficulty: countBy(library, (ex) => ex.difficulty ?? '(비어 있음)'),
  filled: filledOf(library),
  /* 계열은 스트렝스 · 파워에서만 뜻이 있다(theme.ts 가 그 카테고리에서만 겹침을 본다) */
  filledStrengthPower: filledOf(
    library.filter((ex) => STRENGTH_OR_POWER.includes(ex.category))
  ),
};

/* --------------------------------- 날짜 --------------------------------- */

/** 월요일부터 4주. 고정값이라 언제 돌려도 같은 결과다. */
const START_KEY = '2026-05-04';
const DAYS = 28;
/** 첫날부터 부하 지수 · 등판 여파가 있게 앞서 이만큼의 기록을 깔아 둔다 */
const PREHISTORY_DAYS = 14;
/** lib/report/gather.ts 의 ROTATION_LOOKBACK_DAYS · HISTORY_DAYS 와 같은 값 — DB 함수를 못 부르니 숫자를 옮긴다 */
const ROTATION_LOOKBACK_DAYS = 14;
const HISTORY_DAYS = 180;

const keyOf = (i: number) => shiftDateKey(START_KEY, i);
const dateOf = (i: number) => new Date(`${keyOf(i)}T09:00:00+09:00`);
const mod = (n: number, m: number) => ((n % m) + m) % m;

/**
 * 이름 → uuid 꼴 글자(8-4-4-4-12). 앱의 User.id 는 uuid 라 씨앗에 들어가는 글자 모양을 맞춘다 — 섞기(theme.ts 의 mix,
 * FNV-1a)가 긴 16진수 id 를 받았을 때 실제로 흩어지는지 재는 것이 ④ 의 뜻이다. FNV-1a 를 네 번 돌려 128비트를 만든다.
 */
function uuidOf(name: string): string {
  const hex: string[] = [];
  for (let round = 0; round < 4; round++) {
    let h = (0x811c9dc5 ^ round) >>> 0;
    for (let i = 0; i < name.length; i++) {
      h ^= name.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    hex.push(h.toString(16).padStart(8, '0'));
  }
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/* --------------------------------- 선수 --------------------------------- */

type Role = 'starter-weekly' | 'starter-biweekly' | 'reliever' | 'offseason';
type CheckinHabit = 'simple-daily' | 'detail-daily' | 'sometimes';
/** 숫자면 늘 그 값(같은 설정 쌍에서 쓴다) */
type ConditionPattern = 'high' | 'low' | 'swing' | number;
type DoneHabit = 'always' | 'sometimes' | 'never';
type Kit = 'bodyweight' | 'dumbbell' | 'gym';

type Player = {
  name: string;
  /**
   * 앱의 User.id 자리 — 섞기 씨앗 맨 앞에 들어간다(training-setup.ts, P1). 이름에서 결정적으로 만든 uuid 꼴이라 언제 돌려도
   * 같다. 같은 설정 쌍(④)의 두 사람은 id 가 다르고, 쌍둥이는 같은 id 를 받는다 — 그래야 '설정이 같아도 사람이 다르면 다른
   * 목록'과 '입력이 같으면 같은 목록'을 따로 잰다.
   */
  id: string;
  age: number;
  level: string;
  kit: Kit;
  goal: string;
  minutes: number;
  role: Role;
  checkin: CheckinHabit;
  condition: ConditionPattern;
  done: DoneHabit;
  /** 잔 느낌 — 안 주면 '보통' */
  sleep?: string;
};

const ROLE_LABEL: Record<Role, string> = {
  'starter-weekly': '선발 주1회',
  'starter-biweekly': '선발 격주',
  reliever: '구원',
  offseason: '비시즌',
};
const CHECKIN_LABEL: Record<CheckinHabit, string> = {
  'simple-daily': '매일 간편',
  'detail-daily': '매일 상세',
  sometimes: '가끔',
};
const DONE_LABEL: Record<DoneHabit, string> = {
  always: '늘',
  sometimes: '가끔',
  never: '안 누름',
};
const KIT_LABEL: Record<Kit, string> = {
  bodyweight: '맨몸',
  dumbbell: '덤벨',
  gym: '헬스장',
};
const conditionLabel = (c: ConditionPattern) =>
  typeof c === 'number'
    ? `늘 ${c}`
    : c === 'high'
      ? '늘 높음'
      : c === 'low'
        ? '늘 낮음'
        : '들쭉날쭉';

/**
 * 가진 장비 — 앱이 User.ownedEquipment 에 저장하는 꼴 그대로(readOwnedEquipment · ownedEquipmentToSave: 늘 '맨몸'이 앞에).
 * '맨몸뿐'을 빈 목록으로 두면 안 된다 — filterByEquipment 는 빈 목록을 '아직 안 고른 사람'으로 보고 아무것도 안 걸러서,
 * 맨몸 선수가 바벨 · 케이블 운동까지 다 받는 시뮬레이션이 된다(첫 판의 실수).
 */
function ownedOf(kit: Kit): string[] {
  if (kit === 'bodyweight') return [ALWAYS_OWNED];
  if (kit === 'dumbbell') return [ALWAYS_OWNED, '덤벨', '밴드'];
  return [ALWAYS_OWNED, ...SELECTABLE_EQUIPMENT];
}

/**
 * 가상 선수 12명. 나이 14/15/16/17/22/28 · 경력 입문~상급 · 장비 셋 · 목표 셋 · 역할 넷 · 체크인 습관 셋 · 컨디션 셋 · 마침 습관
 * 셋을 섞었다. 한 축을 재는 선수가 둘 이상 있게 짰다 — 매일 상세 · 매일 간편 · 가끔 체크인하는 선발, 늘 낮은 컨디션 셋, 맨몸 셋.
 * 대본 1판(P0 ~ P2)은 상세만 등판 답을 적어 '답 하는 선발 셋 · 안 하는 선발 셋'이었다. 2판(P3, 2026-10-12)부터는 체크인하는 날이면
 * 모두 답한다(간편에 들어갔다) — 답을 안 적는 경우는 선수를 더하지 않고 ⑤ · ⑫ 의 변형(답만 지움)으로 잰다.
 */
const PLAYER_SPECS: Omit<Player, 'id'>[] = [
  {
    name: '선발A',
    age: 17,
    level: '중급',
    kit: 'gym',
    goal: '근력 향상',
    minutes: 60,
    role: 'starter-weekly',
    checkin: 'detail-daily',
    condition: 'high',
    done: 'always',
  },
  {
    name: '선발B',
    age: 22,
    level: '상급',
    kit: 'gym',
    goal: '파워 향상',
    minutes: 75,
    role: 'starter-weekly',
    checkin: 'simple-daily',
    condition: 'high',
    done: 'sometimes',
  },
  {
    name: '선발C',
    age: 16,
    level: '초급',
    kit: 'dumbbell',
    goal: '근력 향상',
    minutes: 45,
    role: 'starter-biweekly',
    checkin: 'detail-daily',
    condition: 'swing',
    done: 'never',
  },
  {
    name: '선발D',
    age: 28,
    level: '상급',
    kit: 'gym',
    goal: '근력 향상',
    minutes: 90,
    role: 'starter-biweekly',
    checkin: 'sometimes',
    condition: 'high',
    done: 'always',
  },
  {
    name: '구원A',
    age: 15,
    level: '입문',
    kit: 'bodyweight',
    goal: '컨디셔닝',
    minutes: 45,
    role: 'reliever',
    checkin: 'simple-daily',
    condition: 'swing',
    done: 'sometimes',
  },
  {
    name: '구원B',
    age: 22,
    level: '중급',
    kit: 'dumbbell',
    goal: '파워 향상',
    minutes: 60,
    role: 'reliever',
    checkin: 'detail-daily',
    condition: 'high',
    done: 'never',
  },
  {
    name: '구원C',
    age: 17,
    level: '초급',
    kit: 'gym',
    goal: '근력 향상',
    minutes: 60,
    role: 'reliever',
    checkin: 'sometimes',
    condition: 'low',
    done: 'always',
  },
  {
    name: '비시즌A',
    age: 14,
    level: '입문',
    kit: 'bodyweight',
    goal: '근력 향상',
    minutes: 45,
    role: 'offseason',
    checkin: 'simple-daily',
    condition: 'high',
    done: 'always',
  },
  {
    name: '비시즌B',
    age: 28,
    level: '중급',
    kit: 'gym',
    goal: '파워 향상',
    minutes: 75,
    role: 'offseason',
    checkin: 'simple-daily',
    condition: 'low',
    done: 'sometimes',
  },
  {
    name: '비시즌C',
    age: 16,
    level: '입문',
    kit: 'dumbbell',
    goal: '컨디셔닝',
    minutes: 60,
    role: 'offseason',
    checkin: 'sometimes',
    condition: 'swing',
    done: 'never',
  },
  {
    name: '선발E',
    age: 22,
    level: '중급',
    kit: 'gym',
    goal: '근력 향상',
    minutes: 60,
    role: 'starter-weekly',
    checkin: 'simple-daily',
    condition: 'low',
    done: 'always',
  },
  {
    name: '선발F',
    age: 22,
    level: '중급',
    kit: 'gym',
    goal: '근력 향상',
    minutes: 60,
    role: 'starter-weekly',
    checkin: 'detail-daily',
    condition: 'high',
    done: 'never',
  },
];
const PLAYERS: Player[] = PLAYER_SPECS.map((p) => ({ ...p, id: uuidOf(p.name) }));

for (const p of PLAYERS) {
  if (!minutesChoicesFor(p.goal).includes(p.minutes)) {
    throw new Error(`${p.name}: ${p.goal} 에서 고를 수 없는 시간 ${p.minutes}분`);
  }
}

/* --------------------------------- 대본 --------------------------------- */

/**
 * 대본의 투구 기록 한 줄 — 앱이 % 칩으로 받은 기록을 저장하는 꼴 그대로(2판 D2): effortPct 와 그것을 1~10 으로 내린
 * intensity(effortToIntensity)를 같이 둔다. 계산은 앱처럼 effortPctOf · intensityOf · outingLoadOf 로만 읽는다.
 */
type Throw = {
  pitchCount: number;
  intensity: number;
  effortPct: number;
  sessionType: string;
};

/** 체감 강도(%)로 기록 한 줄을 만든다 — intensity 는 앱이 저장할 때처럼 effortToIntensity(5% 단위 → 1~10) */
function thrown(pitchCount: number, effortPct: number, sessionType: string): Throw {
  return {
    pitchCount,
    intensity: effortToIntensity(effortPct),
    effortPct,
    sessionType,
  };
}

/**
 * 역할별 던지는 날. 날 번호(i)만으로 정해진다(앞선 기록 14일 포함). 체감 강도는 대본 1판의 강도(1~10) × 10 이라 세게 던진
 * 날 · 부하 지수가 1판과 같은 값으로 읽힌다(effortPctOf = intensity × 10, intensityOf = effortPct ÷ 10).
 *   선발 주1회  i ≡ 2 (mod 7) 경기 70~90구 90~100% · +2일 불펜 30구 70% · +4일 캐치볼 25구 50%
 *   선발 격주   i ≡ 2 (mod 14) 경기 85구 100% · +3일 불펜 35구 70% · +6일 불펜 30구 70% · +9일 캐치볼 25구 50%
 *   구원        사흘에 한 번 경기 20구와 35구를 번갈아(90%) — 세게 던진 날 문턱(경기 100% 로 2,000 · 3,500 ↔ HARD_OUTING_MIN_LOAD 2,700) 양쪽에 걸치게 · 다음 날 캐치볼 20구 50%
 *   비시즌      안 던진다(최근 투구 기록 없음 → 투구 부하로 거르지 않는 길)
 */
function throwOn(role: Role, i: number): Throw | null {
  if (role === 'starter-weekly') {
    const r = mod(i - 2, 7);
    if (r === 0) {
      const g = mod(Math.round((i - 2) / 7), 6);
      return thrown([70, 80, 90, 85, 75, 88][g], g % 2 === 0 ? 100 : 90, '경기');
    }
    if (r === 2) return thrown(30, 70, '불펜');
    if (r === 4) return thrown(25, 50, '캐치볼');
    return null;
  }
  if (role === 'starter-biweekly') {
    const r = mod(i - 2, 14);
    if (r === 0) return thrown(85, 100, '경기');
    if (r === 3) return thrown(35, 70, '불펜');
    if (r === 6) return thrown(30, 70, '불펜');
    if (r === 9) return thrown(25, 50, '캐치볼');
    return null;
  }
  if (role === 'reliever') {
    const r = mod(i, 3);
    if (r === 0) {
      const odd = mod(Math.round(i / 3), 2) === 1;
      return thrown(odd ? 35 : 20, 90, '경기');
    }
    if (r === 1) return thrown(20, 50, '캐치볼');
    return null;
  }
  return null;
}

/** 컨디션 — 늘 높음 8 · 늘 낮음 3(회복 문턱 LOW_CONDITION_THRESHOLD 아래) · 들쭉날쭉은 이레 주기로 3~9 */
function conditionOn(pattern: ConditionPattern, i: number): number {
  if (typeof pattern === 'number') return pattern;
  if (pattern === 'high') return 8;
  if (pattern === 'low') return 3;
  return [8, 6, 3, 7, 9, 5, 4][mod(i, 7)];
}

/**
 * 다음 경기까지 이만큼 앞을 본다 — 대본에서 경기 사이가 가장 긴 것이 선발 격주의 14일이라, 시즌 중인 선수는 늘 다음 경기를
 * 찾고 비시즌만 못 찾는다('없음').
 */
const OUTING_LOOKAHEAD_DAYS = 14;

/** 오늘부터 다음 경기까지 남은 날(오늘 경기면 0). 앞을 봐도 경기가 없으면 null */
function daysToNextGame(role: Role, i: number): number | null {
  for (let d = 0; d <= OUTING_LOOKAHEAD_DAYS; d++) {
    if (throwOn(role, i + d)?.sessionType === '경기') return d;
  }
  return null;
}

/**
 * 체크인의 던지는 일정 답(2판 D1 — 답 여섯, 간편 체크인에 있다). 대본의 경기 날짜를 보고 사람이 고를 답을 고른다:
 *   경기 날 '오늘 등판' · 그 전날 '내일 등판' · 불펜 날 '오늘 불펜' · 다음 경기가 2~3일 뒤 '2~3일 뒤' · 4일 이상 뒤 '4일 이상 뒤' ·
 *   다음 경기가 없음(비시즌) '없음'
 * 불펜이 다음 경기 2~3일 전이어도 '오늘 불펜' — 칩 하나만 고르니 오늘 할 일을 먼저 적는다(lib/checkin.ts 의 차례와 같다).
 * 구원은 '오늘 등판 · 2~3일 뒤 · 내일 등판'만, 선발은 넷 다(불펜 날 포함) 나온다.
 */
function throwPlanOn(role: Role, i: number): ThrowPlan {
  const next = daysToNextGame(role, i);
  if (next === 0) return '오늘 등판';
  if (next === 1) return '내일 등판';
  if (throwOn(role, i)?.sessionType === '불펜') return '오늘 불펜';
  if (next == null) return '없음';
  return next <= 3 ? '2~3일 뒤' : '4일 이상 뒤';
}

/*
 * 답이 대본과 맞나 — 답을 날로 읽는 앱의 규칙(lib/checkin.ts nextOutingDays)으로 되읽어 다음 경기 날이 그 범위 안인지 본다.
 * '오늘 불펜' · '없음'은 범위가 없다(불펜은 날을 안 정하고, 없음은 다음 경기가 없다). 대본이나 앱 규칙이 바뀌어 어긋나면
 * 숫자를 내기 전에 멈춘다 — 틀린 답으로 잰 기준선은 다음 단계를 잘못 이끈다.
 */
for (const role of Object.keys(ROLE_LABEL) as Role[]) {
  for (let i = -PREHISTORY_DAYS; i < DAYS; i++) {
    const answer = throwPlanOn(role, i);
    const next = daysToNextGame(role, i);
    const range = nextOutingDays(answer);
    const ok =
      range == null
        ? answer === '오늘 불펜' || (answer === '없음' && next == null)
        : next != null && next >= range.min && (range.max == null || next <= range.max);
    if (!ok)
      throw new Error(
        `${ROLE_LABEL[role]} ${keyOf(i)}: 답 '${answer}' 이 다음 경기 ${next}일 뒤와 안 맞는다`
      );
  }
}

type DayLog = { day: number; log: PitchLogLike };
type DayCheckin = { day: number; checkin: CheckinLike };

function logsFor(p: Player): DayLog[] {
  const out: DayLog[] = [];
  for (let i = -PREHISTORY_DAYS; i < DAYS; i++) {
    const t = throwOn(p.role, i);
    if (!t) continue;
    out.push({
      day: i,
      log: { date: keyOf(i), ...t, maxVelocity: null, avgVelocity: null },
    });
  }
  return out;
}

function checkinsFor(p: Player): DayCheckin[] {
  const out: DayCheckin[] = [];
  for (let i = -PREHISTORY_DAYS; i < DAYS; i++) {
    if (p.checkin === 'sometimes' && mod(i, 3) !== 0) continue;
    const detail = p.checkin === 'detail-daily';
    out.push({
      day: i,
      checkin: {
        date: keyOf(i),
        condition: conditionOn(p.condition, i),
        sleep: p.sleep ?? '보통',
        shoulder: '정상',
        elbow: '정상',
        wrist: '정상',
        lowerBack: '정상',
        lowerBody: '정상',
        preferredParts: [],
        preferredWorkout: null,
        /*
         * 던지는 일정은 체크인하는 날이면 늘 적는다 — 2판 D1(2026-10-12)로 간편 체크인에 들어가 전신 컨디션 바로 밑에 있다.
         * 대본 1판은 상세만 적어 '간편 · 가끔 = 답 없는 선발'이었다. 답을 안 적는 사람은 선수를 더하지 않고 ⑤ · ⑫ 의 변형
         * (답만 지움 · 기록만 지움)으로 잰다 — 분모 336 을 P0 ~ P2 표와 나란히 두려고.
         */
        throwPlan: throwPlanOn(p.role, i),
        /* 잔 시간 · 근육통은 상세 습관만 칸을 만든다 — 간편에서는 고르지 않은 날과 같은 모양 */
        ...(detail ? { sleepHours: 7, soreness: 2 } : {}),
      },
    });
  }
  return out;
}

/** 마침을 누르는 날인가 — 늘 · 사흘에 한 번 · 안 누름 */
function marksDoneOn(habit: DoneHabit, i: number): boolean {
  if (habit === 'always') return true;
  if (habit === 'sometimes') return mod(i, 3) === 0;
  return false;
}

/* ------------------------------ 하루 만들기 ------------------------------ */

type DoneEntry = { id: string; category: string };
type State = {
  logs: DayLog[];
  checkins: DayCheckin[];
  /** 날짜 키 → 그날 마친 운동 */
  done: Map<string, DoneEntry[]>;
  /** 날짜 키 → 그날 저장된 일정(앱의 DailyTrainingSetup.plan — 하루의 첫 만들기, 변형은 저장 안 함) */
  planned: Map<string, DailyPlan>;
};

/**
 * gather.ts 의 recentExerciseIds · exerciseSessionsAgo · lastStrengthDates 와 같은 뜻.
 * 모두 '오늘 아침'(오늘 마친 것은 아직 없다)에 읽는다.
 */
function historyOf(st: State, i: number) {
  const todayKey = keyOf(i);
  const recentIds = new Set<string>();
  for (let d = i - RECENT_DAYS; d < i; d++) {
    for (const e of st.done.get(keyOf(d)) ?? []) recentIds.add(e.id);
  }

  /* 세션 = 운동을 하나라도 마친 날(암케어 뺌 — gather.ts 와 같다). 최근 순으로 번호 */
  const sinceKey = keyOf(i - HISTORY_DAYS);
  const sessionDays = [...st.done.entries()]
    .filter(
      ([key, entries]) =>
        key >= sinceKey &&
        key <= todayKey &&
        entries.some((e) => e.category !== '암케어')
    )
    .map(([key]) => key)
    .sort()
    .reverse();
  const order = new Map(sessionDays.map((key, at) => [key, at]));
  const sessionsAgo = new Map<string, number>();
  for (const key of sessionDays) {
    for (const e of st.done.get(key) ?? []) {
      if (e.category === '암케어' || sessionsAgo.has(e.id)) continue;
      sessionsAgo.set(e.id, order.get(key)!);
    }
  }

  /* 하체 · 상체 마지막 날 — gather.ts 의 lastStrengthDates 와 같은 규칙(daily-plan.ts 의 strengthDatesFrom): 완료 기록이 먼저, 없는 날은 저장된 일정 */
  const done: { date: string; category: string }[] = [];
  const planned: { date: string; plan: unknown }[] = [];
  for (let d = i - ROTATION_LOOKBACK_DAYS; d < i; d++) {
    const key = keyOf(d);
    for (const e of st.done.get(key) ?? [])
      done.push({ date: key, category: e.category });
    const plan = st.planned.get(key);
    if (plan) planned.push({ date: key, plan });
  }
  const dates = strengthDatesFrom({ done, planned, todayKey });
  return {
    recentIds,
    sessionsAgo,
    lastLowerKey: dates.lower,
    lastUpperKey: dates.upper,
  };
}

/** 한 가지만 바꿔 다시 만들 때 쓰는 손잡이 */
type Variant = {
  /** rotationSeed 뒤에 붙일 글자 */
  seedSuffix?: string;
  age?: number;
  /** 오늘 체크인만 바꾼다 */
  patchCheckin?: (c: CheckinLike) => CheckinLike;
  /** 어제 투구 기록만 바꾼다 */
  patchYesterday?: (log: PitchLogLike) => PitchLogLike;
  /**
   * 체크인의 등판 답을 모두 지운다(오늘 것만이 아니라 어제 것도 — 어제 '내일 등판'이 오늘로 이월되니 오늘 것만 지우면 '답을 안
   * 적는 사람'이 안 된다). ⑤ · ⑫ 가 대본 1판의 '답 없는 선발'을 같은 날 같은 기록으로 다시 잰다.
   */
  clearThrowPlans?: boolean;
  /** 어제 투구 기록을 뺀다 — 등판 답은 적고 기록은 안 남긴 날(⑫) */
  dropYesterdayLog?: boolean;
};

let buildCalls = 0;

/** 앱(createDailySetup)이 buildDailyPlan 을 부르는 인자 그대로. 멈춘 날(통증 등)은 null */
function buildDay(p: Player, i: number, st: State, v: Variant = {}): DailyPlan | null {
  buildCalls++;
  const todayKey = keyOf(i);
  /* 아침에 만든다 — 오늘 던진 것은 아직 기록에 없다 */
  const logs = st.logs
    .filter((l) => l.day < i && !(v.dropYesterdayLog && l.day === i - 1))
    .map((l) =>
      l.day === i - 1 && v.patchYesterday ? v.patchYesterday(l.log) : l.log
    );
  const checkins = st.checkins
    .filter((c) => c.day <= i)
    .map((c) => (c.day === i && v.patchCheckin ? v.patchCheckin(c.checkin) : c.checkin))
    .map((c) => (v.clearThrowPlans ? { ...c, throwPlan: null } : c));
  const facts = buildFacts({
    nickname: p.name,
    age: v.age ?? p.age,
    heightCm: 180,
    trainingLevel: p.level,
    /* 가입 문진의 추정 부하 — 자체 시험과 같은 값. 없으면 기록 28일 전까지 부하 지수가 안 나온다 */
    baselineDailyLoad: 100,
    rehab: null,
    today: dateOf(i),
    logs,
    checkins,
    memos: [],
  });
  const plan = buildPitchPlan(facts);
  const owned = ownedOf(p.kit);
  const history = historyOf(st, i);
  const built = buildDailyPlan({
    user: { ownedEquipment: owned, trainingLevel: p.level },
    facts,
    plan,
    library,
    /* 폼이 넘기는 꼴([맨몸, ...오늘 고른 것], training-setup.ts) — 가진 것을 다 골랐다고 보니 owned 와 같다 */
    availableToday: owned,
    requestedMinutes: p.minutes,
    trainingGoal: p.goal,
    trainingFocus: null,
    recentIds: history.recentIds,
    sessionsAgo: history.sessionsAgo,
    /* 하루의 첫 '만들기'는 저장된 일정이 없어 씨앗이 '사용자 id|날짜'다(training-setup.ts, P1 부터 id 가 맨 앞) */
    rotationSeed: [p.id, todayKey].join('|') + (v.seedSuffix ?? ''),
    lastLowerKey: history.lastLowerKey,
    lastUpperKey: history.lastUpperKey,
    override: false,
    caution: [],
  });
  return isHalted(built) ? null : built;
}

const idsOf = (plan: DailyPlan) =>
  plan.picks
    .map((pick) => pick.exerciseId)
    .sort()
    .join(',');
const sameList = (a: DailyPlan | null, b: DailyPlan | null) =>
  a != null && b != null && idsOf(a) === idsOf(b);
const differs = (a: DailyPlan | null, b: DailyPlan | null) => !sameList(a, b);

/* ----------------------------- 체크인 바꾸기 ----------------------------- */

type CheckinVariant = 'condition' | 'part' | 'soreness';
const CHECKIN_VARIANTS: CheckinVariant[] = ['condition', 'part', 'soreness'];
const CHECKIN_VARIANT_LABEL: Record<CheckinVariant, string> = {
  condition: '컨디션 ±2',
  part: '뻐근한 부위 하나 추가',
  soreness: '근육통 변경',
};

/** 컨디션은 1~10 안에서 2 옮기고, 뻐근은 어깨에(이미 뻐근이면 팔꿈치), 근육통은 '많이'(4) 로(이미 4 이상이면 2 로) */
function patchCheckinBy(kind: CheckinVariant): (c: CheckinLike) => CheckinLike {
  if (kind === 'condition') {
    return (c) => ({
      ...c,
      condition: c.condition >= 6 ? c.condition - 2 : c.condition + 2,
    });
  }
  if (kind === 'part') {
    return (c) =>
      c.shoulder === '뻐근' ? { ...c, elbow: '뻐근' } : { ...c, shoulder: '뻐근' };
  }
  return (c) => ({ ...c, soreness: (c.soreness ?? 0) >= 4 ? 2 : 4 });
}

/**
 * ③ 어제 투구 기록만 바꾸는 세 가지. 따로 잰다 — 경기 기록은 체감과 상관없이 100% 로 보므로(pitch-stats.ts outingLoadOf ·
 * stressFactor) '90% → 60%'는 경기 날에 설계상 아무것도 안 바꾼다. 셋을 하나로 섞으면 그 사실이 0% 속에 묻힌다.
 *   double     투구수 두 배(구원 20구 경기 2,000 이 문턱 2,700 을 넘는다)
 *   intensity  체감 90% 이상 → 60%(어제 체감이 90% 이상인 날만 분모 — 이 대본에서는 경기 날뿐이라 0% 가 정답이다)
 *   lighter    경기 → 불펜 · 60%(어제가 경기인 날만 분모 — 같은 공을 '경기가 아닌 날 60%'로 적으면 무엇이 바뀌나. 경기 100% 특례가
 *              빠져 구원 35구 3,500 이 2,100 으로 문턱 밑이 된다 — 종류가 아니라 부하로 가르는 규칙의 증거)
 * 앱이 저장하는 꼴처럼 effortPct 와 intensity 를 같이 바꾼다 — intensity 만 바꾸면 계산(effortPctOf · intensityOf)이 effortPct 를
 * 먼저 읽어 아무것도 안 바뀐다(대본 2판에서 한 번 그렇게 0% 가 나왔다).
 */
type PitchVariant = 'double' | 'intensity' | 'lighter';
const PITCH_VARIANTS: PitchVariant[] = ['double', 'intensity', 'lighter'];
const PITCH_VARIANT_LABEL: Record<PitchVariant, string> = {
  double: '투구수 ×2',
  intensity: '체감 90% 이상 → 60%',
  lighter: '경기 → 불펜 · 60%',
};
/** 바꾼 체감 강도(%) — 대본 1판의 '강도 6' 과 같은 값 */
const LIGHTER_EFFORT_PCT = 60;
function pitchVariantApplies(kind: PitchVariant, t: Throw): boolean {
  if (kind === 'double') return true;
  /* 체감 90% 이상(옛 강도 9~10 과 같은 날) */
  if (kind === 'intensity') return effortPctOf(t) >= NEAR_MAX_EFFORT_PCT;
  return t.sessionType === '경기';
}
function patchYesterdayBy(kind: PitchVariant): (log: PitchLogLike) => PitchLogLike {
  if (kind === 'double') return (log) => ({ ...log, pitchCount: log.pitchCount * 2 });
  const lighter = {
    effortPct: LIGHTER_EFFORT_PCT,
    intensity: effortToIntensity(LIGHTER_EFFORT_PCT),
  };
  if (kind === 'intensity') return (log) => ({ ...log, ...lighter });
  return (log) => ({ ...log, sessionType: '불펜', ...lighter });
}

/**
 * 지금 코드의 '세게 던진 날' — 투구수 × 체감 강도(%) ≥ HARD_OUTING_MIN_LOAD(2,700), 경기는 100%(facts.ts · pitch-stats.ts
 * outingLoadOf 그대로, 2판 D2). 대본은 하루 한 번만 던져 기록 하나 = 그날. 이 대본의 던지는 날(불펜 30 · 35구 7, 캐치볼 20 · 25구 5,
 * 경기 20구 · 35구 · 70~90구)은 옛 규칙(경기 또는 강도 9~10 · 30구)과 같은 날만 세게 던진 날이다 — 전후 수치를 견줄 수 있다.
 * 앱(facts.ts isHardOuting)은 P3 검토부터 옛 규칙의 날(nearMaxPitches ≥ 30 — 85% × 30 같은 날)도 세게로 보는데, 이 대본에는
 * 그런 날(경기가 아닌 85% 이상 30구)이 없어 곱만 봐도 같은 값이다.
 */
function isHardThrow(t: Throw | null): boolean {
  if (!t) return false;
  return outingLoadOf(t) >= HARD_OUTING_MIN_LOAD;
}

/* ------------------------------ 시뮬레이션 ------------------------------ */

type DayRecord = {
  date: string;
  theme: ThemeKey;
  label: string;
  ids: string[];
  mainCount: number;
  veryHigh: boolean;
  hasCheckin: boolean;
  seedChanged: boolean;
  remakeChanged: boolean;
  checkinChanged: Partial<Record<CheckinVariant | 'one', boolean>>;
  /** 변형마다 테마 · 목록이 바뀌었나. 그 변형이 어제 기록에 해당하지 않으면 칸이 없다 */
  pitchChanged: Partial<Record<PitchVariant, { theme: boolean; list: boolean }>>;
  /** 오늘 아침 체크인의 컨디션(없으면 null) — 경기 날 근력을 셀 때 낮은 컨디션 때문에 회복이 된 날을 가른다 */
  condition: number | null;
  /** 오늘 체크인의 등판 답(체크인 없는 날 null) — 답별 테마 표에 쓴다 */
  throwPlan: string | null;
  /**
   * ⑤ 경기 날 아침(체크인 있음)에 등판 답을 모두 지우고 다시 만든 테마 — '답을 안 적는 사용자'. null 은 멈춘 날(통증 등).
   * 경기 날 아침이 아니거나 체크인이 없으면 칸이 없다.
   */
  answerClearedTheme?: ThemeKey | null;
  /**
   * ⑫ 어제 경기 기록이 있고 어제 체크인이 '오늘 등판'이던 날 — 등판 답을 모두 지운 변형(기록만 있음)과 어제 기록만 뺀 변형
   * (답만 있음)의 테마. 그런 날이 아니면 칸이 없다.
   */
  afterGame?: { cleared: ThemeKey | null; dropped: ThemeKey | null };
  /**
   * ⑬ 팔 피로 '심함' 변형(2판 P4 커밋 C) — 체크인 있는 날 오늘 체크인에 팔 피로 5 만 얹어 다시 만든 일정의 무거운 상체 밀기 · 팔
   * 플라이오 수(lib/engine/exercise-class.ts 판정)와, 같은 날 원래 일정의 수. 체크인이 없는 날은 칸이 없다. 대본의 체크인에는 팔 피로가
   * 없어 원래 일정은 그대로다 — 이 변형이 '팔이 심하게 지친 아침'을 대신 잰다. 멈춘 날(변형에서만 생길 수 있다)은 null.
   */
  armSevere?: {
    pushBase: number;
    plyoBase: number;
    push: number | null;
    plyo: number | null;
  };
  age15vs22Differs: boolean;
  age14vs22Differs: boolean;
  /** 어제 던진 것(대본) */
  yesterday: Throw | null;
  /** 오늘 던질 것(대본) — 경기 당일 아침을 찾는 데 쓴다 */
  today: Throw | null;
};

type PlayerResult = {
  player: Player;
  days: DayRecord[];
  halted: number;
};

const results: PlayerResult[] = [];

for (const p of PLAYERS) {
  const st: State = {
    logs: logsFor(p),
    checkins: checkinsFor(p),
    done: new Map(),
    planned: new Map(),
  };
  const days: DayRecord[] = [];
  let halted = 0;

  for (let i = 0; i < DAYS; i++) {
    const base = buildDay(p, i, st);
    if (!base) {
      halted++;
      continue;
    }
    const hasCheckin = st.checkins.some((c) => c.day === i);
    const yesterday = throwOn(p.role, i - 1);

    /* ① 씨앗에 글자 하나 · ①' 다시 만들기(사용자 id|날짜|지금 목록 — training-setup.ts 가 하는 것) */
    const seedChanged = differs(base, buildDay(p, i, st, { seedSuffix: 'x' }));
    const remakeChanged = differs(
      base,
      buildDay(p, i, st, {
        seedSuffix: '|' + base.picks.map((k) => k.exerciseId).join('|'),
      })
    );

    /* ② 체크인만 — 세 가지 각각과, 그중 하나(날마다 돌아가며) */
    const checkinChanged: DayRecord['checkinChanged'] = {};
    if (hasCheckin) {
      for (const kind of CHECKIN_VARIANTS) {
        checkinChanged[kind] = differs(
          base,
          buildDay(p, i, st, { patchCheckin: patchCheckinBy(kind) })
        );
      }
      checkinChanged.one = checkinChanged[CHECKIN_VARIANTS[mod(i, 3)]];
    }

    /* ③ 어제 투구 기록만 — 해당하는 변형만 */
    const pitchChanged: DayRecord['pitchChanged'] = {};
    if (yesterday) {
      for (const kind of PITCH_VARIANTS) {
        if (!pitchVariantApplies(kind, yesterday)) continue;
        const changed = buildDay(p, i, st, { patchYesterday: patchYesterdayBy(kind) });
        pitchChanged[kind] = {
          theme: changed == null || changed.theme.key !== base.theme.key,
          list: differs(base, changed),
        };
      }
    }

    /* ⑨ 나이만 — 15↔22(지금 문턱 15 라 같을 것), 14↔22(성장기 규칙이 실제로 갈리는 쌍) */
    const at15 = buildDay(p, i, st, { age: 15 });
    const at22 = buildDay(p, i, st, { age: 22 });
    const at14 = buildDay(p, i, st, { age: 14 });

    /* ⑤ 경기 날 아침(체크인 있음) — 같은 아침에 등판 답만 모두 지우면(답을 안 적는 사람) 무엇이 나오나 */
    const today = throwOn(p.role, i);
    const themeOf = (plan: DailyPlan | null) => plan?.theme.key ?? null;
    const answerClearedTheme =
      today?.sessionType === '경기' && hasCheckin
        ? themeOf(buildDay(p, i, st, { clearThrowPlans: true }))
        : undefined;

    /*
     * ⑫ 경기 다음 날 — 어제 '오늘 등판'이라 답하고 경기 기록도 남긴 날. 답을 지운 변형은 '기록이 다음 날을 정하나',
     * 어제 기록만 뺀 변형은 '답만으로 다음 날을 아나'(엇갈림 표 C6 과 같은 알려진 빈틈 — D3 · P4 가 부하와 답으로 가른다).
     */
    const yesterdayPlan =
      st.checkins.find((c) => c.day === i - 1)?.checkin.throwPlan ?? null;
    const afterGame =
      yesterday?.sessionType === '경기' && yesterdayPlan === '오늘 등판'
        ? {
            cleared: themeOf(buildDay(p, i, st, { clearThrowPlans: true })),
            dropped: themeOf(buildDay(p, i, st, { dropYesterdayLog: true })),
          }
        : undefined;

    /* ⑬ 팔 피로 '심함' — 체크인 있는 날 그 체크인에 팔 피로 5 만 얹은 변형(2판 P4 커밋 C) */
    const armCount = (plan: DailyPlan, isIt: (ex: Exercise) => boolean) =>
      plan.picks.filter((k) => {
        const ex = byId.get(k.exerciseId);
        return ex != null && isIt(ex);
      }).length;
    const severe = hasCheckin
      ? buildDay(p, i, st, {
          patchCheckin: (c) => ({ ...c, armFatigue: SEVERE_ARM_FATIGUE }),
        })
      : null;
    const armSevere = hasCheckin
      ? {
          pushBase: armCount(base, isHeavyUpperPush),
          plyoBase: armCount(base, isArmPlyo),
          push: severe ? armCount(severe, isHeavyUpperPush) : null,
          plyo: severe ? armCount(severe, isArmPlyo) : null,
        }
      : undefined;

    const ids = base.picks.map((k) => k.exerciseId);
    days.push({
      date: keyOf(i),
      theme: base.theme.key,
      label: base.theme.label,
      ids,
      mainCount: base.picks.filter((k) => k.slot === 'main').length,
      veryHigh: ids.some((id) => isVeryHigh(byId.get(id))),
      hasCheckin,
      seedChanged,
      remakeChanged,
      checkinChanged,
      pitchChanged,
      condition: st.checkins.find((c) => c.day === i)?.checkin.condition ?? null,
      throwPlan: st.checkins.find((c) => c.day === i)?.checkin.throwPlan ?? null,
      ...(answerClearedTheme !== undefined ? { answerClearedTheme } : {}),
      ...(afterGame ? { afterGame } : {}),
      ...(armSevere ? { armSevere } : {}),
      age15vs22Differs: differs(at15, at22),
      age14vs22Differs: differs(at14, at22),
      yesterday,
      today,
    });

    /* 저장 — 앱은 만든 일정을 그날 DailyTrainingSetup.plan 에 둔다(번갈아 가기의 계획 기록, P1) */
    st.planned.set(keyOf(i), base);
    /* 마침 — 그날 목록을 통째로 마친 것으로 적는다(앱은 운동마다 UserExerciseLog 가 남는다) */
    if (marksDoneOn(p.done, i)) {
      st.done.set(
        keyOf(i),
        ids.map((id) => ({ id, category: byId.get(id)?.category ?? '' }))
      );
    }
  }
  results.push({ player: p, days, halted });
}

/* ------------------------- ④ 같은 설정 새 사용자 쌍 ------------------------- */

/**
 * 경력 · 장비 · 목표 · 시간이 같고 기록이 하나도 없는 새 사용자 둘. 12명 안에는 기록 없는 같은 설정 쌍이 없어 따로 여섯 쌍을
 * 둔다. 두 사람은 앱이 목록을 가르는 데 쓰지 않는 것만 다르다 — 이름 · 나이(22/24, 둘 다 성인) · 컨디션(7/8, 둘 다 문턱 위) ·
 * 잔 느낌. 같은 입력을 똑같이 넣은 쌍(쌍둥이)도 같이 재서 도구 자체가 결정적인지 본다.
 */
const PAIR_SETTINGS: { level: string; kit: Kit; goal: string; minutes: number }[] = [
  { level: '입문', kit: 'bodyweight', goal: '근력 향상', minutes: 45 },
  { level: '초급', kit: 'dumbbell', goal: '근력 향상', minutes: 60 },
  { level: '중급', kit: 'gym', goal: '근력 향상', minutes: 60 },
  { level: '중급', kit: 'gym', goal: '파워 향상', minutes: 75 },
  { level: '상급', kit: 'gym', goal: '파워 향상', minutes: 90 },
  { level: '초급', kit: 'dumbbell', goal: '컨디셔닝', minutes: 45 },
];

function newUser(
  name: string,
  s: (typeof PAIR_SETTINGS)[number],
  who: { age: number; condition: number; sleep: string },
  /** id 를 만들 이름 — 쌍둥이는 원본의 이름을 넘겨 같은 id 를 받는다 */
  idName = name
): Player {
  return {
    name,
    id: uuidOf(idName),
    ...s,
    role: 'offseason',
    checkin: 'simple-daily',
    condition: who.condition,
    sleep: who.sleep,
    done: 'never',
    age: who.age,
  };
}

const pairRows: { setting: string; same: number; twinSame: number; days: number }[] =
  [];
for (const [n, s] of PAIR_SETTINGS.entries()) {
  const a = newUser(`쌍${n + 1}A`, s, { age: 22, condition: 7, sleep: '보통' });
  const b = newUser(`쌍${n + 1}B`, s, { age: 24, condition: 8, sleep: '충분' });
  const twin = newUser(
    `쌍${n + 1}A'`,
    s,
    { age: 22, condition: 7, sleep: '보통' },
    `쌍${n + 1}A`
  );
  const stateOf = (p: Player): State => ({
    logs: logsFor(p),
    checkins: checkinsFor(p),
    done: new Map(),
    planned: new Map(),
  });
  const [sa, sb, stw] = [stateOf(a), stateOf(b), stateOf(twin)];
  let same = 0;
  let twinSame = 0;
  for (let i = 0; i < DAYS; i++) {
    /* 마침을 안 누르는 새 사용자라 번갈아 가기는 저장된 일정(계획 기록)으로만 돈다 — 그날 만든 것을 저장해 둔다 */
    const keep = (st: State, built: DailyPlan | null) => {
      if (built) st.planned.set(keyOf(i), built);
      return built;
    };
    const pa = keep(sa, buildDay(a, i, sa));
    if (sameList(pa, keep(sb, buildDay(b, i, sb)))) same++;
    if (sameList(pa, keep(stw, buildDay(twin, i, stw)))) twinSame++;
  }
  pairRows.push({
    setting: `${s.level} · ${KIT_LABEL[s.kit]} · ${s.goal} · ${s.minutes}분`,
    same,
    twinSame,
    days: DAYS,
  });
}

/* --------------------------------- 집계 --------------------------------- */

const allDays = results.flatMap((r) => r.days);
const total = allDays.length;
/*
 * 앱이 실제로 일정을 만드는 날 = 오늘 체크인이 있는 날. '가끔' 체크인하는 선수 셋의 나머지 날(54일)은 검토안과 분모를 맞추려
 * 만든 것이라, 주요 지표는 전체와 이 분모를 나란히 찍는다.
 */
const appDays = allDays.filter((d) => d.hasCheckin);
const appTotal = appDays.length;
const ratio = (n: number, d: number) => (d === 0 ? null : n / d);
const pct = (n: number, d: number) =>
  d === 0 ? '해당 없음' : `${((n / d) * 100).toFixed(1)}% (${n}/${d})`;
/** 같은 지표를 두 분모로 — 전체(검토안과 같은 분모) · 체크인 있는 날만(앱이 만드는 날) */
const both = (n: number, d: number, nApp: number, dApp: number) =>
  `${pct(n, d)} · 체크인 있는 날만 ${pct(nApp, dApp)}`;
const ratioPair = (n: number, d: number, nApp: number, dApp: number) => ({
  n,
  d,
  ratio: ratio(n, d),
  app: { n: nApp, d: dApp, ratio: ratio(nApp, dApp) },
});

/* ① 씨앗만 바꿈 → 목록(운동 id 집합)이 바뀐 날 / 336 */
const seedChanged = allDays.filter((d) => d.seedChanged).length;
const remakeChanged = allDays.filter((d) => d.remakeChanged).length;
const seedChangedApp = appDays.filter((d) => d.seedChanged).length;
const remakeChangedApp = appDays.filter((d) => d.remakeChanged).length;

/* ② 체크인만 바꿈 → 목록이 바뀐 날 / 체크인이 있는 날 */
const withCheckin = allDays.filter((d) => d.hasCheckin);
const checkinOne = withCheckin.filter((d) => d.checkinChanged.one).length;
const checkinEach = Object.fromEntries(
  CHECKIN_VARIANTS.map((k) => [
    k,
    withCheckin.filter((d) => d.checkinChanged[k]).length,
  ])
) as Record<CheckinVariant, number>;

/* ③ 어제 투구 기록만 바꿈 → 테마 · 목록이 바뀐 날 / 그 변형이 해당하는 날(어제 기록이 있고, 변형의 조건에 맞는 날) */
const pitchStats = Object.fromEntries(
  PITCH_VARIANTS.map((k) => {
    const rows = allDays.filter((d) => d.pitchChanged[k] != null);
    return [
      k,
      {
        d: rows.length,
        theme: rows.filter((d) => d.pitchChanged[k]!.theme).length,
        list: rows.filter((d) => d.pitchChanged[k]!.list).length,
      },
    ];
  })
) as Record<PitchVariant, { d: number; theme: number; list: number }>;

/* ④ 같은 설정 새 사용자 쌍이 같은 날 같은 목록 / 쌍 × 28일 */
const pairSame = pairRows.reduce((s, r) => s + r.same, 0);
const pairTwinSame = pairRows.reduce((s, r) => s + r.twinSame, 0);
const pairDays = pairRows.reduce((s, r) => s + r.days, 0);

/*
 * ⑤ 경기 날 아침 테마가 하체/상체(근력)인 횟수 / 경기 수.
 *
 * 대본 1판(P0 ~ P2)은 등판 답이 상세 체크인에만 있어 '답 하는 선발(매일 상세) 0/10 · 답 없는 선발(간편 · 가끔) 6/10'으로 갈랐다.
 * 2판 D1 로 간편에도 답이 들어가 체크인하는 날은 모두 답한다 — 그래서 셋으로 가른다:
 *   답 있음     체크인한 경기 아침(이제 모든 습관) — 앱이 실제로 만드는 날
 *   답을 지움   같은 아침에 등판 답만 모두 지운 변형(Variant.clearThrowPlans) — 답을 안 적는 사람. 대본 1판의 '답 없는 선발'과 같은 뜻
 *   체크인 없음 그 아침에 체크인이 없는 경기(선발D 가끔) — 앱이면 일정을 안 만든다. 어제 '내일 등판'이 이월되면 회복이 된다
 * 컨디션이 회복 문턱 이하인 아침은 등판과 상관없이 회복이라, '등판을 알아서'를 셀 때는 문턱 위만 따로 본다(fit).
 */
const isStarter = (p: Player) =>
  p.role === 'starter-weekly' || p.role === 'starter-biweekly';
const isStrengthTheme = (t: ThemeKey | null | undefined) =>
  t === 'lower' || t === 'upper';
/** 테마 분포 — 멈춘 날(통증 등, 변형에서만 생길 수 있다)은 '멈춤' */
const themeCounts = (list: DayRecord[], pick: (d: DayRecord) => ThemeKey | null) =>
  countBy(list, (d) => pick(d) ?? '멈춤');
function gameMornings(pickPlayer: (p: Player) => boolean) {
  const rows = results
    .filter((r) => pickPlayer(r.player))
    .flatMap((r) => r.days.filter((d) => d.today?.sessionType === '경기'));
  const answered = rows.filter((d) => d.hasCheckin);
  const fit = answered.filter((d) => d.condition! > LOW_CONDITION_THRESHOLD);
  const noCheckin = rows.filter((d) => !d.hasCheckin);
  const strength = (list: DayRecord[], pick: (d: DayRecord) => ThemeKey | null) =>
    list.filter((d) => isStrengthTheme(pick(d))).length;
  const base = (d: DayRecord) => d.theme;
  const cleared = (d: DayRecord) => d.answerClearedTheme ?? null;
  return {
    games: rows.length,
    answered: {
      games: answered.length,
      strength: strength(answered, base),
      themes: themeCounts(answered, base),
      fitGames: fit.length,
      fitStrength: strength(fit, base),
    },
    cleared: {
      games: answered.length,
      strength: strength(answered, cleared),
      themes: themeCounts(answered, cleared),
      fitGames: fit.length,
      fitStrength: strength(fit, cleared),
    },
    noCheckin: {
      games: noCheckin.length,
      strength: strength(noCheckin, base),
      themes: themeCounts(noCheckin, base),
    },
  };
}
const gameMorningStarters = gameMornings(isStarter);
const gameMorningAll = gameMornings(() => true);

/* 등판 답별 테마(체크인 있는 날) — 새 답 둘('2~3일 뒤' · '4일 이상 뒤')은 지금 '없음'과 같이 읽힌다(P5 · P6 가 쓴다) */
const planThemes = THROW_PLANS.map((plan) => {
  const rows = allDays.filter((d) => d.throwPlan === plan);
  return { plan, days: rows.length, themes: themeCounts(rows, (d) => d.theme) };
});

/*
 * ⑥ 하체 · 상체 한쪽 연속 최대 일수 — 근력 날(lower/upper)만 차례로 보고 같은 쪽이 이어진 가장 긴 줄.
 *
 * liftingOnly 면 본운동이 실제로 있는 날만 센다(P1 ②부터 이 값이 주 지표). 컨디셔닝 목표의 날은 이름이 '컨디셔닝 데이'고 무게
 * 드는 구간이 없는데 key 는 lower/upper 로 남아(theme.ts conditioningDay — 그 쪽 근력은 다음 근력 날로 넘긴다는 화면 글 그대로),
 * key 만 보면 몸에 아무 부하도 안 준 날이 '한쪽 연속'으로 잡힌다. 옛 값(key 기준, 본운동 0 인 날 포함)도 같이 남긴다.
 */
function sideRun(days: DayRecord[], liftingOnly = false) {
  let best = 0;
  let bestSide: ThemeKey | null = null;
  let run = 0;
  let side: ThemeKey | null = null;
  for (const d of days) {
    if (d.theme !== 'lower' && d.theme !== 'upper') continue;
    if (liftingOnly && d.mainCount === 0) continue;
    run = d.theme === side ? run + 1 : 1;
    side = d.theme;
    if (run > best) {
      best = run;
      bestSide = side;
    }
  }
  return { best, bestSide };
}

type PlayerSummary = {
  name: string;
  themes: Record<ThemeKey, number>;
  /** 본운동이 있는 근력 날만(주 지표) */
  sideRun: ReturnType<typeof sideRun>;
  /** key 기준(본운동 0 인 날 포함 — P0 와 같은 셈) */
  sideRunKey: ReturnType<typeof sideRun>;
  emptyMainStrengthDays: number | null;
  veryHighDays: number;
  noCheckinDays: number;
  /** 체크인 있는 날(앱이 만드는 날) 수와 그중 회복 날 — '가끔' 체크인 선수의 회복 비율을 바로 읽으려고 */
  appDays: number;
  recoveryAppDays: number;
  halted: number;
  distinctExercises: number;
};
const summaries: PlayerSummary[] = results.map((r) => ({
  name: r.player.name,
  themes: {
    recovery: r.days.filter((d) => d.theme === 'recovery').length,
    assist: r.days.filter((d) => d.theme === 'assist').length,
    lower: r.days.filter((d) => d.theme === 'lower').length,
    upper: r.days.filter((d) => d.theme === 'upper').length,
  },
  appDays: r.days.filter((d) => d.hasCheckin).length,
  recoveryAppDays: r.days.filter((d) => d.hasCheckin && d.theme === 'recovery').length,
  sideRun: sideRun(r.days, true),
  sideRunKey: sideRun(r.days),
  /* 컨디셔닝 목표는 본운동 구간이 애초에 없다(GOAL_SHAPES) — 그 선수는 세지 않는다(null) */
  emptyMainStrengthDays:
    r.player.goal === CONDITIONING_GOAL
      ? null
      : r.days.filter(
          (d) => (d.theme === 'lower' || d.theme === 'upper') && d.mainCount === 0
        ).length,
  veryHighDays: r.days.filter((d) => d.veryHigh).length,
  noCheckinDays: r.days.filter((d) => !d.hasCheckin).length,
  halted: r.halted,
  distinctExercises: new Set(r.days.flatMap((d) => d.ids)).size,
}));

/* ⑦ 선수별 회복 날 수 / 28 — 위 summaries.themes.recovery */

/*
 * ⑥ 의 '상체 후보 0' — 장비 × 경력만으로 스트렝스 · 파워 후보가 몇 개 남는지(안전 거르기 전). 0 인 칸이 있으면 그 설정의 선수는
 * 그쪽 날에 본운동이 비고, 마침을 눌러도 그쪽 기록이 안 생겨 번갈기가 한쪽에 갇힌다.
 */
const KITS: Kit[] = ['bodyweight', 'dumbbell', 'gym'];
const poolByKitLevel = KITS.flatMap((kit) =>
  TRAINING_LEVEL_NAMES.map((level) => {
    /* ownedOf 가 이미 맨몸을 앞에 둔 앱 저장 꼴이라 그대로 넘긴다 */
    const pool = filterByLevel(
      filterByEquipment(library, ownedOf(kit)).pool,
      level
    ).pool;
    const count = (cat: string) => pool.filter((ex) => ex.category === cat).length;
    return {
      kit,
      level,
      lower: count('하체 스트렝스'),
      upper: count('상체 스트렝스'),
      power: count('파워'),
      total: pool.length,
    };
  })
);

/*
 * ⑧ 라이브러리 노출 — 336 일정에 한 번이라도 뽑힌 운동 / 보이는 운동 전체(카테고리별도).
 * 일정 구성(theme.ts 의 COMPOSITIONS)에 없는 카테고리(암케어는 따로 하는 루틴, 워밍업은 촬영용 이름만)를 뺀 값도 적는다 —
 * 그쪽은 아무리 돌려도 0 이라 전체 비율을 끌어내린다.
 */
const NEVER_SCHEDULED = ['암케어', '워밍업'];
const exposed = new Set(allDays.flatMap((d) => d.ids));
for (const id of exposed) {
  if (NEVER_SCHEDULED.includes(byId.get(id)?.category ?? '')) {
    throw new Error(`일정에 없다고 본 카테고리가 뽑혔다: ${byId.get(id)?.category}`);
  }
}
const schedulable = library.filter((ex) => !NEVER_SCHEDULED.includes(ex.category));
const exposedApp = new Set(appDays.flatMap((d) => d.ids));
const exposureByCategory = Object.fromEntries(
  Object.keys(libraryStats.byCategory).map((cat) => [
    cat,
    {
      exposed: library.filter((ex) => ex.category === cat && exposed.has(ex.id)).length,
      total: libraryStats.byCategory[cat],
    },
  ])
);

/* ⑨ 나이만 15↔22 로 바꾼 쌍의 목록이 다른 날 / 336. 영양은 facts 에 입력 자체가 없다 */
const age15vs22 = allDays.filter((d) => d.age15vs22Differs).length;
const age14vs22 = allDays.filter((d) => d.age14vs22Differs).length;
const age15vs22App = appDays.filter((d) => d.age15vs22Differs).length;
const age14vs22App = appDays.filter((d) => d.age14vs22Differs).length;

/* ⑩ D4 — 16~18세 선수의 일정에 '매우 높음' 강도 운동이 든 날 수(15세는 Y 뒤 성장기가 됐으니 따로 센다 — 0 이어야) */
const veryHighByAge = (pick: (age: number) => boolean) => {
  const rows = results.filter((r) => pick(r.player.age));
  const days = rows.flatMap((r) => r.days);
  const app = days.filter((d) => d.hasCheckin);
  return {
    players: rows.map((r) => `${r.player.name}(${r.player.age})`),
    days: days.filter((d) => d.veryHigh).length,
    total: days.length,
    app: { days: app.filter((d) => d.veryHigh).length, total: app.length },
  };
};
const veryHigh16to18 = veryHighByAge((age) => age >= 16 && age <= 18);
const veryHighAt15 = veryHighByAge((age) => age === 15);
const veryHighUnder15 = veryHighByAge((age) => age < YOUTH_AGE_THRESHOLD);

/* ⑪ D3 — 세게 던진 다음 날(D+1)에 지금 코드가 회복을 낸 날 / 세게 던진 다음 날 */
const afterHard = allDays.filter((d) => isHardThrow(d.yesterday));
const afterHardRecovery = afterHard.filter((d) => d.theme === 'recovery').length;
const afterHardApp = afterHard.filter((d) => d.hasCheckin);
const afterHardRecoveryApp = afterHardApp.filter((d) => d.theme === 'recovery').length;
/* 달력으로 '경기 다음 날'이면서 문턱 밑이라(경기 20구 = 2,000) 세게 던진 날이 아닌 것(구원 20구) — D3 가 가르는 경계 */
const afterLightGame = allDays.filter(
  (d) => d.yesterday?.sessionType === '경기' && !isHardThrow(d.yesterday)
);

/**
 * 투구수 × 체감 강도(%) 분포 — 세게 던진 날 문턱(HARD_OUTING_MIN_LOAD)을 정하고 다시 볼 참고 숫자. 대본과 실제 기록 둘 다.
 * 값은 판정과 같은 outingLoadOf(경기 100%)라 칸 하나가 문턱에서 끊긴다. 대본 1판은 투구수 × 강도(1~10)로 0~900 칸이었다.
 */
const PRODUCT_BUCKETS = [0, 1500, HARD_OUTING_MIN_LOAD, 4500, 6000, 7500, 9000];
const PITCH_BANDS = [
  { label: '30구 미만', min: 0, max: 29 },
  { label: '30~59구', min: 30, max: 59 },
  { label: '60~89구', min: 60, max: 89 },
  { label: '90구 이상', min: 90, max: Infinity },
];
/* 체감 강도(effortPctOf — 옛 줄은 강도 × 10) 칸. % 칩은 5% 단위라 61~64 · 86~89 는 없다 */
const INTENSITY_BANDS = [
  { label: '체감 ≤60%', min: 0, max: 60 },
  { label: '체감 65~85%', min: 61, max: 89 },
  { label: '체감 90~100%', min: 90, max: 100 },
];
type LogShape = {
  pitchCount: number;
  intensity: number;
  /** 체감 강도(%) — 옛 줄 · 대본은 없음(null) */
  effortPct?: number | null;
  sessionType: string | undefined;
  /** '같은 사람의 같은 날' 열쇠 — 날 단위로 합칠 때만 쓴다(출력하지 않는다) */
  dayKey: string;
};
function loadDistribution(logs: LogShape[]) {
  const product: Record<string, number> = {};
  for (let b = 0; b < PRODUCT_BUCKETS.length; b++) {
    const lo = PRODUCT_BUCKETS[b];
    const hi = PRODUCT_BUCKETS[b + 1];
    const label = hi == null ? `${lo}+` : `${lo}~${hi - 1}`;
    product[label] = logs.filter((l) => {
      const v = outingLoadOf({ ...l, sessionType: l.sessionType ?? '' });
      return v >= lo && (hi == null || v < hi);
    }).length;
  }
  const cross: Record<string, Record<string, number>> = {};
  for (const pb of PITCH_BANDS) {
    cross[pb.label] = {};
    for (const ib of INTENSITY_BANDS) {
      cross[pb.label][ib.label] = logs.filter(
        (l) =>
          l.pitchCount >= pb.min &&
          l.pitchCount <= pb.max &&
          effortPctOf(l) >= ib.min &&
          effortPctOf(l) <= ib.max
      ).length;
    }
  }
  /* 기록 한 줄씩 보면 — 한 줄이 그 자체로 지금 규칙(투구수 × 체감 강도 ≥ 2,700, 경기 100%)에 드는 것 */
  const hardLogs = logs.filter(
    (l) =>
      outingLoadOf({ ...l, sessionType: l.sessionType ?? '' }) >= HARD_OUTING_MIN_LOAD
  ).length;
  /*
   * 날 단위 — 지금 코드(facts.ts outingByDay → isHardOuting)가 실제로 판정하는 꼴. 기록마다 투구수 × 체감 강도(%)(경기 100%)를
   * 그날 합쳐 2,700 이상이면 세게 던진 날. 사용 통계 도구(training-usage-stats.mts)와 같은 식이라 두 숫자를 맞댈 수 있다.
   */
  const loadByDay = new Map<string, number>();
  const thrownDays = new Set<string>();
  for (const l of logs) {
    thrownDays.add(l.dayKey);
    const load = outingLoadOf({ ...l, sessionType: l.sessionType ?? '' });
    loadByDay.set(l.dayKey, (loadByDay.get(l.dayKey) ?? 0) + load);
  }
  const hardDays = [...loadByDay.values()].filter(
    (load) => load >= HARD_OUTING_MIN_LOAD
  ).length;
  return {
    count: logs.length,
    /* 체감 강도(%)별 — effortPctOf(옛 줄은 강도 × 10). % 로 적은 줄 수를 따로 둔다(D2 이행이 얼마나 됐나) */
    byEffortPct: countBy(logs, (l) => String(effortPctOf(l))),
    effortPctLogs: logs.filter((l) => l.effortPct != null).length,
    bySessionType: countBy(logs, (l) => l.sessionType ?? '(없음)'),
    product,
    cross,
    hardLogsByCurrentRule: hardLogs,
    thrownDays: thrownDays.size,
    hardDaysByCurrentRule: hardDays,
  };
}
/* 대본은 하루에 한 번만 던지니 날 열쇠 = 선수|날짜(어제 기록이라 날짜는 하루 앞) */
const scriptedLogs: LogShape[] = results.flatMap((r) =>
  r.days
    .filter((d) => d.yesterday != null)
    .map((d) => ({ ...d.yesterday!, dayKey: `${r.player.name}|${d.date}` }))
);
const scriptedDistribution = loadDistribution(scriptedLogs);
/* 날짜는 gather.ts(toISOString) → facts.ts(앞 10자리)와 같은 식으로 자른다 — 시간대에 안 흔들린다 */
const realDistribution = loadDistribution(
  realLogs.map((l) => ({
    pitchCount: l.pitchCount,
    intensity: l.intensity,
    effortPct: l.effortPct,
    sessionType: l.sessionType,
    dayKey: `${l.userId}|${l.date.toISOString().slice(0, 10)}`,
  }))
);

/*
 * ⑫ 경기 다음 날 — 어제 '오늘 등판'이라 답하고 경기 기록도 남긴 날(모든 역할). 대본 1판은 '답 없는 선발 · 답 하는 선발' 둘로
 * 갈라 둘 다 회복 10/10(기록이 있어 답과 무관)이었다. 이제 모두 답하니 같은 날을 두 변형으로 다시 잰다:
 *   기록만(답을 모두 지움)   기록이 다음 날을 정하나 — 대본 1판의 '답 없는 선발'과 같은 뜻
 *   답만(어제 기록을 뺌)     '던졌다고 답했지만 기록은 안 남긴' 다음 날 — 지금 테마는 어제 '오늘 등판'을 안 읽는다(엇갈림 표 C6
 *                            과 같은 알려진 빈틈). D3 · P4 가 부하와 답으로 이 날을 회복 쪽으로 뒤집는다
 * 어제 기록은 있는데 어제 체크인이 없는 날(가끔 체크인 선발D 의 경기 다음 날)은 세지 않고 수만 따로 적는다.
 */
const afterGameRows = allDays.filter((d) => d.afterGame != null);
const afterGameUnanswered = allDays.filter(
  (d) => d.yesterday?.sessionType === '경기' && d.afterGame == null
).length;
const afterGame = {
  count: afterGameRows.length,
  unanswered: afterGameUnanswered,
  themes: themeCounts(afterGameRows, (d) => d.theme),
  cleared: themeCounts(afterGameRows, (d) => d.afterGame!.cleared),
  dropped: themeCounts(afterGameRows, (d) => d.afterGame!.dropped),
  droppedStrength: afterGameRows.filter((d) => isStrengthTheme(d.afterGame!.dropped))
    .length,
  /* 기록이 있으면 회복이던 날(세게 던진 다음 날)만 — 구원 20구처럼 기록이 있어도 근력인 날을 빼고 빈틈의 크기를 본다 */
  recoveryDays: afterGameRows.filter((d) => d.theme === 'recovery').length,
  recoveryDroppedStrength: afterGameRows.filter(
    (d) => d.theme === 'recovery' && isStrengthTheme(d.afterGame!.dropped)
  ).length,
};

/*
 * ⑬ 팔 피로 '심함'(2판 P4 커밋 C) — 체크인 있는 날마다 그 체크인에 팔 피로 5 만 얹은 변형. 원래 일정에 무거운 상체 밀기 · 팔 플라이오가
 * 든 날과 수, 변형에 든 날과 수(안전 거르기 5-2 가 빼니 0 이어야 한다). 멈춘 변형 날은 따로 센다.
 */
const armRows = allDays.filter((d) => d.armSevere != null);
const sumOf = (pick: (a: NonNullable<DayRecord['armSevere']>) => number | null) =>
  armRows.reduce((s, d) => s + (pick(d.armSevere!) ?? 0), 0);
const armSevere = {
  days: armRows.length,
  halted: armRows.filter((d) => d.armSevere!.push == null).length,
  pushDaysBase: armRows.filter((d) => d.armSevere!.pushBase > 0).length,
  pushDays: armRows.filter((d) => (d.armSevere!.push ?? 0) > 0).length,
  plyoDaysBase: armRows.filter((d) => d.armSevere!.plyoBase > 0).length,
  plyoDays: armRows.filter((d) => (d.armSevere!.plyo ?? 0) > 0).length,
  pushBase: sumOf((a) => a.pushBase),
  push: sumOf((a) => a.push),
  plyoBase: sumOf((a) => a.plyoBase),
  plyo: sumOf((a) => a.plyo),
};

/* 컨디션 늘 낮음 · 맨몸 늘 마침 — 검토안의 두 줄과 견줄 선수 */
const lowConditionRows = summaries.filter(
  (s) => PLAYERS.find((p) => p.name === s.name)!.condition === 'low'
);
const bodyweightAlwaysRows = summaries.filter((s) => {
  const p = PLAYERS.find((q) => q.name === s.name)!;
  return p.kit === 'bodyweight' && p.done === 'always';
});
const noCheckinDays = allDays.filter((d) => !d.hasCheckin).length;
const haltedDays = results.reduce((s, r) => s + r.halted, 0);

/* --------------------------------- 출력 --------------------------------- */

function table(headers: string[], rows: (string | number | null)[][]): string {
  const line = (cells: (string | number | null)[]) =>
    `| ${cells.map((c) => (c == null ? '' : String(c))).join(' | ')} |`;
  return [
    line(headers),
    `|${headers.map(() => ' --- ').join('|')}|`,
    ...rows.map(line),
  ].join('\n');
}
const n = (v: number | null) => (v == null ? '해당 없음' : `${(v * 100).toFixed(1)}%`);
const sideText = (r: ReturnType<typeof sideRun>) =>
  r.bestSide ? `${r.best}일(${r.bestSide === 'lower' ? '하체' : '상체'})` : '0';
/** 테마 분포 한 줄 — 'recovery 18 · assist 2' */
const themeText = (themes: Record<string, number>) =>
  Object.entries(themes).length
    ? Object.entries(themes)
        .map(([k, v]) => `${k} ${v}`)
        .join(' · ')
    : '없음';
const veryHighText = (v: ReturnType<typeof veryHighByAge>) =>
  both(v.days, v.total, v.app.days, v.app.total);
/** 회복 날 수 — 가끔 체크인하는 선수는 앱이 만드는 날(체크인 있는 날) 중 수를 곁들인다 */
const recoveryText = (s: PlayerSummary) =>
  s.noCheckinDays > 0
    ? `${s.name} ${s.themes.recovery}/${DAYS}(체크인 있는 ${s.appDays}일 중 ${s.recoveryAppDays})`
    : `${s.name} ${s.themes.recovery}/${DAYS}`;

const out: string[] = [];
out.push(
  `# 트레이닝 추천 기준선 — 가상 선수 ${PLAYERS.length}명 × ${DAYS}일, 실제 운동 표`
);
out.push(
  `\n시작 ${START_KEY} · 일정 ${total}개(멈춤 ${haltedDays}) · 체크인 있는 날 ${appTotal}(앱이 만드는 날) · 체크인 없는 날 ${noCheckinDays}(앱이면 안 만드는 날) · buildDailyPlan ${buildCalls}번`
);

out.push('\n## 라이브러리(보이는 운동)');
out.push(
  table(
    ['항목', '수', '비율'],
    [
      ['전체', libraryStats.total, ''],
      ...Object.entries(libraryStats.byCategory).map(([k, v]) => [
        `카테고리 · ${k}`,
        v,
        n(ratio(v, libraryStats.total)),
      ]),
      ...(
        [
          ['movementPattern 있음', libraryStats.filled.movementPattern],
          [
            'movementPattern 있음(스트렝스 · 파워만)',
            libraryStats.filledStrengthPower.movementPattern,
            libraryStats.filledStrengthPower.total,
          ],
          ['difficulty 있음', libraryStats.filled.difficulty],
          ["intensity 기본값('중간') 아님", libraryStats.filled.intensityNotDefault],
          ['bodyParts 비어 있지 않음', libraryStats.filled.bodyParts],
          ['sets + reps/holdSeconds 있음', libraryStats.filled.setsAndReps],
          ['equipment 비어 있지 않음', libraryStats.filled.equipment],
        ] as [string, number, number?][]
      ).map(([k, v, d]) => [
        k,
        `${v}/${d ?? libraryStats.total}`,
        n(ratio(v, d ?? libraryStats.total)),
      ]),
      ...Object.entries(libraryStats.byIntensity).map(([k, v]) => [
        `강도 · ${k}`,
        v,
        n(ratio(v, libraryStats.total)),
      ]),
    ]
  )
);

out.push('\n## 선수와 28일 결과');
out.push(
  table(
    [
      '#',
      '이름',
      '나이',
      '경력',
      '장비',
      '목표',
      '분',
      '역할',
      '체크인',
      '컨디션',
      '마침',
      '회복(체크인 있는 날만)',
      '보조',
      '하체',
      '상체',
      '한쪽 연속 최대',
      '본운동 0 근력 날',
      '매우 높음 날',
      '쓴 운동 수',
      '체크인 없는 날',
    ],
    results.map((r, at) => {
      const p = r.player;
      const s = summaries[at];
      return [
        at + 1,
        p.name,
        p.age,
        p.level,
        KIT_LABEL[p.kit],
        p.goal,
        p.minutes,
        ROLE_LABEL[p.role],
        CHECKIN_LABEL[p.checkin],
        conditionLabel(p.condition),
        DONE_LABEL[p.done],
        /* 가끔 체크인하는 선수는 앱이 만드는 날의 회복 수를 곁들인다 — 54일 때문에 흐려진 숫자를 그대로 읽지 않게 */
        s.noCheckinDays > 0
          ? `${s.themes.recovery} (${s.appDays}일 중 ${s.recoveryAppDays})`
          : s.themes.recovery,
        s.themes.assist,
        s.themes.lower,
        s.themes.upper,
        /* 본운동 있는 날 기준. key 기준이 다르면(컨디셔닝 — 무게 없는 날의 숨은 키) 괄호로 곁들인다 */
        s.sideRunKey.best === s.sideRun.best
          ? sideText(s.sideRun)
          : `${sideText(s.sideRun)} (키 기준 ${sideText(s.sideRunKey)})`,
        s.emptyMainStrengthDays ?? '(컨디셔닝)',
        s.veryHighDays,
        s.distinctExercises,
        s.noCheckinDays,
      ];
    })
  )
);

out.push('\n## 재는 것');
out.push(
  table(
    ['번호', '재는 것(정의)', '값'],
    [
      [
        '①',
        '씨앗에 글자 하나 더함 → 목록(운동 id 집합)이 바뀐 날 / 전체',
        both(seedChanged, total, seedChangedApp, appTotal),
      ],
      [
        "①'",
        "'다시 만들기'(날짜|지금 목록) → 목록이 바뀐 날 / 전체",
        both(remakeChanged, total, remakeChangedApp, appTotal),
      ],
      [
        '②',
        '체크인만 바꿈(셋 중 하나, 날마다 돌아가며) → 목록이 바뀐 날 / 체크인 있는 날',
        pct(checkinOne, withCheckin.length),
      ],
      ...CHECKIN_VARIANTS.map((k) => [
        '②',
        `  ${CHECKIN_VARIANT_LABEL[k]} 만`,
        pct(checkinEach[k], withCheckin.length),
      ]),
      ...PITCH_VARIANTS.flatMap((k) => [
        [
          '③',
          `어제 투구 기록만 ${PITCH_VARIANT_LABEL[k]} → 테마 바뀜 / 그 변형이 해당하는 날`,
          pct(pitchStats[k].theme, pitchStats[k].d),
        ],
        [
          '③',
          `  ${PITCH_VARIANT_LABEL[k]} → 목록 바뀜`,
          pct(pitchStats[k].list, pitchStats[k].d),
        ],
      ]),
      [
        '④',
        '같은 설정(경력 · 장비 · 목표 · 시간) 새 사용자 둘(이름 · 나이 22/24 · 컨디션 7/8 · 잔 느낌만 다름)이 같은 날 같은 목록 / 쌍 × 28일',
        pct(pairSame, pairDays),
      ],
      ['④', '  입력까지 똑같은 쌍둥이(도구가 결정적인지)', pct(pairTwinSame, pairDays)],
      [
        '⑤',
        '선발의 경기 날 아침(체크인 있음 — 이제 간편 · 상세 모두 등판 답을 적는다) 테마가 하체/상체 / 그런 아침',
        pct(gameMorningStarters.answered.strength, gameMorningStarters.answered.games),
      ],
      [
        '⑤',
        `  그중 아침 컨디션이 회복 문턱(${LOW_CONDITION_THRESHOLD}) 위인 아침만`,
        pct(
          gameMorningStarters.answered.fitStrength,
          gameMorningStarters.answered.fitGames
        ),
      ],
      [
        '⑤',
        '  같은 아침에 등판 답만 모두 지운 변형(답을 안 적는 사람 — 대본 1판의 답 없는 선발)',
        `${pct(gameMorningStarters.cleared.strength, gameMorningStarters.cleared.games)} · 문턱 위만 ${pct(gameMorningStarters.cleared.fitStrength, gameMorningStarters.cleared.fitGames)}`,
      ],
      [
        '⑤',
        "  체크인 없는 경기 아침(앱이면 일정을 안 만든다 — 어제 '내일 등판'이 이월되면 회복)",
        `${pct(gameMorningStarters.noCheckin.strength, gameMorningStarters.noCheckin.games)} · ${themeText(gameMorningStarters.noCheckin.themes)}`,
      ],
      [
        '⑤',
        '모든 역할(선발 · 구원)의 경기 날 아침(체크인 있음) 테마가 하체/상체',
        `${pct(gameMorningAll.answered.strength, gameMorningAll.answered.games)} · 답을 지운 변형 ${pct(gameMorningAll.cleared.strength, gameMorningAll.cleared.games)}(문턱 위만 ${pct(gameMorningAll.cleared.fitStrength, gameMorningAll.cleared.fitGames)})`,
      ],
      [
        '⑥',
        '하체 · 상체 한쪽 연속 최대 일수(본운동이 있는 근력 날만 차례로) — 선수별은 위 표',
        `최대 ${Math.max(...summaries.map((s) => s.sideRun.best))}일`,
      ],
      [
        '⑥',
        '  key 기준(본운동 0 인 날 포함 — P0 와 같은 셈, 컨디셔닝 목표의 숨은 키가 섞인다)',
        `최대 ${Math.max(...summaries.map((s) => s.sideRunKey.best))}일`,
      ],
      [
        '⑥',
        '  맨몸 · 늘 마침 선수',
        bodyweightAlwaysRows
          .map(
            (s) =>
              `${s.name} ${sideText(s.sideRun)}, 본운동 0 근력 날 ${s.emptyMainStrengthDays}`
          )
          .join(' / '),
      ],
      [
        '⑦',
        '회복 날 수 / 28 — 컨디션 늘 낮음 선수(가끔 체크인이면 체크인 있는 날 중 수를 곁들임)',
        lowConditionRows.map(recoveryText).join(' / '),
      ],
      [
        '⑦',
        '  전체 평균',
        `${(summaries.reduce((s, r) => s + r.themes.recovery, 0) / summaries.length).toFixed(1)}/${DAYS}`,
      ],
      [
        '⑧',
        '라이브러리 노출 — 336 일정에 한 번이라도 뽑힌 운동 / 보이는 운동 전체',
        both(exposed.size, library.length, exposedApp.size, library.length),
      ],
      [
        '⑧',
        `  일정 구성에 없는 카테고리(${NEVER_SCHEDULED.join(' · ')})를 뺀 전체 기준`,
        both(exposed.size, schedulable.length, exposedApp.size, schedulable.length),
      ],
      ...Object.entries(exposureByCategory).map(([k, v]) => [
        '⑧',
        `  ${k}`,
        pct(v.exposed, v.total),
      ]),
      [
        '⑨',
        '나이만 15↔22 로 바꾼 쌍의 목록이 다른 날 / 전체',
        both(age15vs22, total, age15vs22App, appTotal),
      ],
      [
        '⑨',
        '  나이만 14↔22(성장기 규칙이 실제로 갈리는 쌍)',
        both(age14vs22, total, age14vs22App, appTotal),
      ],
      [
        '⑨',
        '영양만 바꾼 쌍',
        'facts 에 영양 입력 자체가 없음(buildFacts 가 받지 않는다)',
      ],
      [
        '⑩',
        `D4 — 16~18세 선수(${veryHigh16to18.players.join(' · ')})의 일정에 '매우 높음' 운동이 든 날 / 그들의 일정`,
        veryHighText(veryHigh16to18),
      ],
      [
        '⑩',
        `  15세(${veryHighAt15.players.join(' · ')}) — Y(D4) 뒤 문턱 ${YOUTH_AGE_THRESHOLD} 미만이라 성장기 취급, 0 이어야 한다`,
        veryHighText(veryHighAt15),
      ],
      [
        '⑩',
        `  15세 미만(${veryHighUnder15.players.join(' · ')}) — 0 이어야 한다`,
        veryHighText(veryHighUnder15),
      ],
      [
        '⑪',
        `D3 — 세게 던진 다음 날(투구수 × 체감 강도 ≥ ${HARD_OUTING_MIN_LOAD.toLocaleString('en-US')}, 경기 100% 의 다음 날)에 지금 코드가 회복을 낸 날 / 그런 날`,
        both(
          afterHardRecovery,
          afterHard.length,
          afterHardRecoveryApp,
          afterHardApp.length
        ),
      ],
      [
        '⑪',
        `  경기 다음 날인데 문턱 밑이라(경기 20구 = 2,000) 세게 던진 날이 아닌 것(구원 20구)의 테마`,
        themeText(countBy(afterLightGame, (d) => d.theme)),
      ],
      [
        '⑫',
        `경기 다음 날(어제 '오늘 등판'이라 답하고 기록도 남김, 모든 역할 ${afterGame.count}일 — 어제 체크인 없는 ${afterGame.unanswered}일은 뺌) 테마`,
        themeText(afterGame.themes),
      ],
      [
        '⑫',
        '  같은 날 등판 답을 모두 지운 변형(기록만 — 기록이 다음 날을 정하나)',
        themeText(afterGame.cleared),
      ],
      [
        '⑫',
        '  같은 날 어제 기록만 뺀 변형(답만 — 던졌다고 답하고 기록은 안 남김, 엇갈림 표 C6 과 같은 알려진 빈틈 · P4 가 뒤집는다)',
        `${themeText(afterGame.dropped)} · 근력 ${pct(afterGame.droppedStrength, afterGame.count)} · 기록이 있으면 회복이던 날 중 근력 ${pct(afterGame.recoveryDroppedStrength, afterGame.recoveryDays)}`,
      ],
      [
        '⑬',
        `팔 피로 '심함' 변형(체크인 있는 ${armSevere.days}일에 팔 피로 5 만 얹음) — 무거운 상체 밀기가 든 날: 원래 일정 → 변형(0 이어야 한다, 2판 P4)`,
        `${pct(armSevere.pushDaysBase, armSevere.days)} → ${pct(armSevere.pushDays, armSevere.days)} · 운동 수 ${armSevere.pushBase} → ${armSevere.push}`,
      ],
      [
        '⑬',
        '  같은 변형 — 팔 플라이오(메디신볼 · 플라이오 푸시업 …)가 든 날: 원래 일정 → 변형',
        `${pct(armSevere.plyoDaysBase, armSevere.days)} → ${pct(armSevere.plyoDays, armSevere.days)} · 운동 수 ${armSevere.plyoBase} → ${armSevere.plyo}${armSevere.halted > 0 ? ` · 멈춘 변형 ${armSevere.halted}일` : ''}`,
      ],
    ]
  )
);

out.push("\n## 등판 답별 테마(체크인 있는 날) — 새 답 둘은 지금 '없음'과 같이 읽힌다");
out.push(
  table(
    ['등판 답', '날', '테마'],
    planThemes.map((r) => [r.plan, r.days, r.days ? themeText(r.themes) : '·'])
  )
);

out.push('\n## ④ 같은 설정 쌍');
out.push(
  table(
    ['설정', '같은 목록 / 28', '쌍둥이 같은 목록 / 28'],
    pairRows.map((r) => [r.setting, r.same, r.twinSame])
  )
);

out.push(
  '\n## ⑥ 장비 × 경력별 본운동 후보 수(안전 거르기 전) — 0 인 칸이 한쪽 갇힘의 자리'
);
out.push(
  table(
    ['장비', '경력', '하체 스트렝스', '상체 스트렝스', '파워', '전체 후보'],
    poolByKitLevel.map((r) => [
      KIT_LABEL[r.kit],
      r.level,
      r.lower,
      r.upper,
      r.power,
      r.total,
    ])
  )
);

out.push(
  '\n## ⑪ 투구수 × 체감 강도(%, 경기 100%) 분포 — 대본(선수 12명 28일) vs 실제 기록(집계만)'
);
out.push(
  table(
    ['투구수 × 체감 강도', '대본', '실제'],
    Object.keys(scriptedDistribution.product).map((k) => [
      k,
      scriptedDistribution.product[k],
      realDistribution.product[k],
    ])
  )
);
out.push('');
out.push(
  table(
    ['실제 기록 · 투구수 \\ 체감 강도', ...INTENSITY_BANDS.map((b) => b.label)],
    PITCH_BANDS.map((pb) => [
      pb.label,
      ...INTENSITY_BANDS.map((ib) => realDistribution.cross[pb.label][ib.label]),
    ])
  )
);
out.push(
  `\n실제 기록 ${realDistribution.count}건(% 로 적은 줄 ${realDistribution.effortPctLogs}) · 체감 강도(%, 옛 줄은 강도 × 10)별 ${Object.entries(
    realDistribution.byEffortPct
  )
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([k, v]) => `${k}:${v}`)
    .join(' ')} · 종류별 ${Object.entries(realDistribution.bySessionType)
    .map(([k, v]) => `${k}:${v}`)
    .join(
      ' '
    )} · 지금 규칙의 세게 던진 날(같은 사람의 같은 날 기록을 합쳐 투구수 × 체감 강도 ≥ ${HARD_OUTING_MIN_LOAD.toLocaleString('en-US')} — facts.ts 와 같은 날 단위) ${pct(realDistribution.hardDaysByCurrentRule, realDistribution.thrownDays)}, 기록 한 줄씩 보면 ${pct(realDistribution.hardLogsByCurrentRule, realDistribution.count)}`
);

/* 검토안 2판 수치 — docs/designs/training-recommendation-engine.md '검토안 요지'와 P0 과제 메모에서 옮김 */
const comparison: { no: string; what: string; review: string; actual: string }[] = [
  {
    no: '①',
    what: '씨앗만 바꿈 → 목록 바뀜',
    review: '90.9%',
    actual: both(seedChanged, total, seedChangedApp, appTotal),
  },
  {
    no: '②',
    what: '체크인만 바꿈 → 목록 바뀜',
    review: '30.2%',
    actual: pct(checkinOne, withCheckin.length),
  },
  {
    no: '③',
    what: '투구 기록만 바꿈 → 테마 바뀜 = 목록 바뀜',
    review: '32.4%',
    actual: PITCH_VARIANTS.map(
      (k) =>
        `${PITCH_VARIANT_LABEL[k]}: 테마 ${pct(pitchStats[k].theme, pitchStats[k].d)} · 목록 ${pct(pitchStats[k].list, pitchStats[k].d)}`
    ).join(' / '),
  },
  {
    no: '④',
    what: '같은 설정 새 사용자 쌍 같은 목록',
    review: '46.9%',
    actual: pct(pairSame, pairDays),
  },
  {
    no: '⑤',
    what: '등판 답 없는 선발의 경기 날 근력',
    review: '10/11',
    /* 대본 2판 — 체크인하면 모두 답하니 '답 없는 선발'은 답을 지운 변형으로 잰다. 답 있는 아침을 나란히 */
    actual: `답을 지운 변형 ${gameMorningStarters.cleared.strength}/${gameMorningStarters.cleared.games}(컨디션 문턱 위만 ${gameMorningStarters.cleared.fitStrength}/${gameMorningStarters.cleared.fitGames}) · 답 있음 ${gameMorningStarters.answered.strength}/${gameMorningStarters.answered.games}`,
  },
  {
    no: '⑥',
    what: '상체 후보 0 일 때 한쪽 갇힘',
    review: '28일 중 21일',
    actual: bodyweightAlwaysRows
      .map((s) => `${s.name} ${sideText(s.sideRun)}`)
      .join(' / '),
  },
  {
    no: '⑦',
    what: '컨디션 늘 낮은 사용자 회복 날',
    review: '19~20/28',
    actual: lowConditionRows.map(recoveryText).join(' / '),
  },
  {
    no: '⑧',
    what: '라이브러리 노출',
    review: '55%',
    actual: `${both(exposed.size, library.length, exposedApp.size, library.length)} · 일정에 들어가는 카테고리만 ${both(exposed.size, schedulable.length, exposedApp.size, schedulable.length)}`,
  },
  {
    no: '⑨',
    what: '영양 · 나이(15↔22) 영향',
    review: '0',
    actual: `나이 ${pct(age15vs22, total)} · 영양 입력 없음`,
  },
];
out.push('\n## 검토안 2판 수치 vs 실제 표');
out.push(
  table(
    ['번호', '재는 것', '검토안 2판', '실제 표'],
    comparison.map((c) => [c.no, c.what, c.review, c.actual])
  )
);

console.log(out.join('\n'));

/* ---------------------------------- JSON ---------------------------------- */

const elapsedMs = Date.now() - startedAt;
const json = {
  /*
   * 3 = 대본 2판(2026-10-12): 체크인마다 등판 답 · 기록에 체감 강도(%) · ⑤ ⑫ 를 변형으로. 2 와 metrics.gameMorning · afterGame 모양이 다르다.
   * 4 = 2판 P4 커밋 C: 날마다 armSevere · metrics.armSevere(⑬ 팔 피로 '심함' 변형)를 더했다(buildCalls 도 그만큼 는다). 3 과 견줄 때는 이 칸을 뺀다.
   */
  version: 4,
  /* 돌릴 때마다 바뀌는 것은 이 칸뿐 — 단계 전후를 diff 로 견줄 때는 meta 를 빼고 본다 */
  meta: { generatedAt: new Date().toISOString(), elapsedMs },
  startKey: START_KEY,
  days: DAYS,
  appDays: appTotal,
  buildCalls,
  library: libraryStats,
  players: results.map((r, at) => ({
    ...r.player,
    summary: summaries[at],
    days: r.days.map((d) => ({
      date: d.date,
      theme: d.theme,
      label: d.label,
      mainCount: d.mainCount,
      veryHigh: d.veryHigh,
      hasCheckin: d.hasCheckin,
      seedChanged: d.seedChanged,
      remakeChanged: d.remakeChanged,
      checkinChanged: d.checkinChanged,
      pitchChanged: d.pitchChanged,
      age15vs22Differs: d.age15vs22Differs,
      age14vs22Differs: d.age14vs22Differs,
      throwPlan: d.throwPlan,
      answerClearedTheme: d.answerClearedTheme,
      afterGame: d.afterGame,
      armSevere: d.armSevere,
      yesterday: d.yesterday,
      today: d.today,
      ids: d.ids,
    })),
  })),
  metrics: {
    total,
    haltedDays,
    noCheckinDays,
    seedChanged: ratioPair(seedChanged, total, seedChangedApp, appTotal),
    remakeChanged: ratioPair(remakeChanged, total, remakeChangedApp, appTotal),
    checkinOne: {
      n: checkinOne,
      d: withCheckin.length,
      ratio: ratio(checkinOne, withCheckin.length),
    },
    checkinEach: Object.fromEntries(
      CHECKIN_VARIANTS.map((k) => [
        k,
        {
          n: checkinEach[k],
          d: withCheckin.length,
          ratio: ratio(checkinEach[k], withCheckin.length),
        },
      ])
    ),
    pitchChanged: Object.fromEntries(
      PITCH_VARIANTS.map((k) => [
        k,
        {
          ...pitchStats[k],
          themeRatio: ratio(pitchStats[k].theme, pitchStats[k].d),
          listRatio: ratio(pitchStats[k].list, pitchStats[k].d),
        },
      ])
    ),
    pairSame: {
      n: pairSame,
      d: pairDays,
      ratio: ratio(pairSame, pairDays),
      rows: pairRows,
    },
    pairTwinSame: {
      n: pairTwinSame,
      d: pairDays,
      ratio: ratio(pairTwinSame, pairDays),
    },
    gameMorning: { starters: gameMorningStarters, all: gameMorningAll },
    planThemes,
    sideRunMax: Math.max(...summaries.map((s) => s.sideRun.best)),
    sideRunKeyMax: Math.max(...summaries.map((s) => s.sideRunKey.best)),
    exposure: {
      ...ratioPair(exposed.size, library.length, exposedApp.size, library.length),
      schedulable: schedulable.length,
      schedulableRatio: ratio(exposed.size, schedulable.length),
      schedulableRatioApp: ratio(exposedApp.size, schedulable.length),
      byCategory: exposureByCategory,
    },
    poolByKitLevel,
    age15vs22: ratioPair(age15vs22, total, age15vs22App, appTotal),
    age14vs22: ratioPair(age14vs22, total, age14vs22App, appTotal),
    nutrition: '입력 자체가 없음',
    veryHigh: {
      age16to18: veryHigh16to18,
      age15: veryHighAt15,
      under15: veryHighUnder15,
    },
    afterHard: ratioPair(
      afterHardRecovery,
      afterHard.length,
      afterHardRecoveryApp,
      afterHardApp.length
    ),
    afterLightGameThemes: countBy(afterLightGame, (d) => d.theme),
    afterGame,
    armSevere,
    loadDistribution: { scripted: scriptedDistribution, real: realDistribution },
  },
  comparison,
};

mkdirSync(path.dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(json, null, 2));
console.log(`JSON → ${OUT_PATH}`);
/* 걸린 시간은 stdout 마지막 줄에만 — 위 표는 돌릴 때마다 같아야 diff 로 견줄 수 있다 */
console.log(`걸린 시간 ${(elapsedMs / 1000).toFixed(1)}초`);
