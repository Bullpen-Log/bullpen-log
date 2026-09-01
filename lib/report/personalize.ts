import { DIFFICULTY_LEVELS, pickMany, pickOne } from '@/lib/exercise-meta';
import { ALWAYS_OWNED, SELECTABLE_EQUIPMENT } from '@/lib/report/equipment';

/**
 * 사람마다 다른 두 가지 — 경력과 목표.
 *
 * 지금까지 트레이닝이 사람을 구별하는 기준은 몸 상태(체크인)와 투구량뿐이었다.
 * 그러다 보니 웨이트를 처음 하는 고등학생과 3년째 하는 선수가 같은 데드리프트를
 * 받았고, 구속을 올리고 싶은 사람과 어깨가 걱정인 사람이 같은 구성을 받았다.
 *
 * 여기서 정하는 것은 두 가지다.
 *   경력 → 어떤 난이도의 운동까지 줄 것인가 (lib/report/personalize.ts, 이 파일)
 *   목표 → 시간을 어디에 더 쓸 것인가      (lib/report/theme.ts 의 compositionFor)
 *
 * 둘 다 안전 규칙이 아니다. 안전은 lib/report/prescription.ts 가 따로 본다.
 * 다만 경력이 초급이면 최대 강도를 빼는 규칙 하나는 안전 쪽에 두었다 —
 * 그건 "못 한다"가 아니라 "다친다"에 가깝기 때문이다.
 */

/* ---------------------------------- 경력 ---------------------------------- */

/**
 * 웨이트 트레이닝 경력.
 *
 * 기간으로 묻는 이유는, 스스로 초급인지 중급인지 판단하기 어렵기 때문이다.
 * "얼마나 오래 했는가"는 누구나 답할 수 있다.
 */
export const TRAINING_LEVELS = [
  {
    name: '입문',
    desc: '웨이트 트레이닝을 안 해봤거나 6개월 미만',
    /** 이 난이도까지만 준다 */
    allow: ['초급'],
    /** 이 순서로 앞에 놓는다 */
    prefer: ['초급'],
  },
  {
    name: '초급',
    desc: '6개월 ~ 1년',
    allow: ['초급', '중급'],
    prefer: ['초급', '중급'],
  },
  {
    name: '중급',
    desc: '1년 ~ 3년',
    allow: ['초급', '중급', '상급'],
    prefer: ['중급', '초급', '상급'],
  },
  {
    name: '상급',
    desc: '3년 이상',
    allow: ['초급', '중급', '상급'],
    prefer: ['상급', '중급', '초급'],
  },
] as const;

export type TrainingLevelName = (typeof TRAINING_LEVELS)[number]['name'];

export const TRAINING_LEVEL_NAMES: readonly string[] = TRAINING_LEVELS.map(
  (l) => l.name
);

/** 목록에 없는 이름이 오면 null — 그러면 아무것도 거르지 않는다. */
export function findLevel(name: string | null) {
  return TRAINING_LEVELS.find((l) => l.name === name) ?? null;
}

/**
 * 경력이 '입문'이면 최대 강도를 뺀다.
 *
 * 이 값은 안전 필터(prescription.ts)가 쓴다. 난이도가 '초급'으로 적힌 운동이라도
 * 강도가 '매우 높음'이면 전력으로 뛰거나 최대 무게를 다루는 것이라,
 * 처음 하는 사람에게는 이르다.
 */
export const BEGINNER_LEVEL_NAME: TrainingLevelName = '입문';

type WithDifficulty = { difficulty: string | null };

export type LevelFilterResult<T> = {
  pool: T[];
  /** 경력에 안 맞아 뺀 개수. 0이면 화면에 아무 말도 하지 않는다. */
  excludedCount: number;
};

/**
 * 경력에 맞는 난이도만 남기고, 알맞은 것을 앞으로 당긴다.
 *
 * 난이도가 안 적힌 운동은 빼지 않는다. 등록하다 만 것을 벌주는 셈이 되고,
 * 무엇보다 "안 적혀 있다"가 "어렵다"를 뜻하지는 않는다.
 *
 * 경력을 아직 안 고른 사람은 아무것도 빼지 않는다. 장비와 같은 원칙이다 —
 * 안 고른 것과 없는 것은 다르다.
 */
export function filterByLevel<T extends WithDifficulty>(
  library: T[],
  levelName: string | null
): LevelFilterResult<T> {
  const level = findLevel(levelName);
  if (!level) return { pool: library, excludedCount: 0 };

  const allow: readonly string[] = level.allow;
  const kept = library.filter(
    (ex) => ex.difficulty == null || allow.includes(ex.difficulty)
  );

  /*
   * 남은 것을 경력에 맞는 순서로 놓는다. 빼지는 않고 순서만 바꾸므로,
   * 후보가 빠듯한 날에도 줄 것이 사라지지 않는다.
   */
  const rank = (ex: T) => {
    if (ex.difficulty == null) return level.prefer.length; // 안 적힌 것은 맨 뒤
    const at = level.prefer.indexOf(ex.difficulty as never);
    return at === -1 ? level.prefer.length : at;
  };
  const pool = [...kept].sort((a, b) => rank(a) - rank(b));

  return { pool, excludedCount: library.length - kept.length };
}

/* ---------------------------------- 목표 ---------------------------------- */

/**
 * 훈련 목표.
 *
 * 시간 배분을 바꾸는 데 쓴다. 어떤 운동을 주느냐가 아니라, 같은 시간을
 * 어디에 더 쓰느냐의 문제다. 그래서 안전과는 무관하다.
 *
 * `weights` 는 구간별 배분에 곱하는 값이다. 테마마다 표를 따로 만들지 않고
 * 곱셈으로 두는 이유가 있다 — 표를 네 벌 적어두면 나중에 테마를 하나 더
 * 만들 때 한 벌을 빠뜨리고, 빠뜨린 줄은 아무 일도 하지 않아 알아채기 어렵다.
 *
 * `prefer` 는 본운동 안에서 앞으로 당길 카테고리다.
 */
/**
 * 목표가 본운동의 섞임을 어떻게 가르는가.
 *
 * weights 는 구간별 '시간'을 나누고, prefer 는 '순서'를 당긴다. 둘 다 막지는
 * 않는다 — 그래서 근력 향상을 골라도 파워가 본운동에 들어왔다. 여기는 개수로
 * 가른다.
 *
 *   maxPower     본운동에 파워를 이만큼까지만. 0 이면 아예 안 넣는다.
 *   minStrength  스트렝스를 적어도 이만큼은 넣는다.
 *
 * 둘 다 본운동에만 걸린다. 워밍업·코어·보강·암케어는 파워가 애초에 안 들어간다.
 */
export type GoalMix = {
  maxPower?: number;
  /** 파워를 적어도 이만큼은 넣는다. 자리가 모자라면 들어가는 만큼만. */
  minPower?: number;
  minStrength?: number;
};

export const TRAINING_GOALS = [
  {
    name: '균형 잡힌 관리',
    desc: '근력 위주에 파워를 하나씩 · 어깨 관리까지 고르게',
    weights: { warmup: 1, main: 1, core: 1, prehab: 1, armcare: 1 },
    prefer: [] as string[],
    /* 파워도 넣되 하나까지 — '고르게'가 파워 위주가 되면 안 된다 */
    mix: { maxPower: 1 },
  },
  {
    /*
     * '구속 향상'이 아니라 '파워 향상'이다.
     *
     * 이름은 이 훈련이 실제로 하는 일까지만 말한다. 구속은 파워 말고도
     * 투구 동작·유연성·타이밍이 함께 만드는 것이라, 이 구성만으로 올려주겠다고
     * 할 수 있는 것이 아니다. 올려준다고 적어두면 안 오른 선수에게는 앱이
     * 약속을 어긴 것이 된다.
     */
    name: '파워 향상',
    desc: '빠르게 힘을 내는 훈련과 하체에 시간을 더 씁니다',
    weights: { warmup: 1, main: 1.15, core: 0.9, prehab: 0.8, armcare: 0.8 },
    prefer: ['파워'],
    /*
     * 파워를 먼저 둘 채우고, 무게 드는 운동을 하나 남긴다.
     *
     * 무게부터 채우면 파워가 들어갈 자리가 없어진다. 파워 운동은 3세트 × 5회에
     * 휴식이 3분이라 하나에 14분 남짓인데, 60분 본운동 몫이 41분이다. 무게
     * 운동(15분)을 먼저 넣으면 남는 12분에 파워가 안 들어가 파워 하나로 끝난
     * 날이 나왔다. 파워를 먼저 둘 채우면 남는 자리에 짧은 무게 운동이 들어간다.
     *
     * 무게를 하나 남기는 것은 그냥 두었더니 45분 상체날 60일이 전부 파워였기
     * 때문이다 — 근력이 받쳐주지 않으면 파워도 결국 안 는다.
     */
    mix: { minPower: 2, minStrength: 1 },
  },
  {
    name: '부상 방지',
    desc: '어깨·팔꿈치 관리와 보강 위주 — 점프·던지기는 빼고',
    weights: { warmup: 1.3, main: 0.7, core: 1, prehab: 1.7, armcare: 1.6 },
    prefer: [],
    /*
     * 파워를 아예 안 넣는다.
     *
     * 본운동 시간을 0.7배로 줄이는 목표라 45분 상체날에는 한 개만 들어가는데,
     * 그 한 개가 파워면 60일 중 13일은 무게 드는 운동이 통째로 없었다.
     * 몸을 아끼자고 고른 목표에서 착지·던지기가 나오는 것도 앞뒤가 안 맞는다.
     */
    mix: { maxPower: 0 },
  },
  {
    name: '근력 향상',
    desc: '무게를 다루는 운동으로만 채웁니다 — 점프·던지기는 빼고',
    weights: { warmup: 0.85, main: 1.2, core: 0.9, prehab: 0.8, armcare: 0.85 },
    prefer: ['하체 스트렝스', '상체 스트렝스'],
    /*
     * 파워를 아예 안 넣는다.
     *
     * '근력 향상'이라 적어놓고 점프가 나오면 이름이 약속한 것과 다르다.
     * 앞으로 당기기(prefer)만으로는 못 막았다 — 60분 상체날 60일 중 42일에
     * 파워가 끼어들었다. 시간이 늘면 스트렝스를 다 뽑고 남은 자리를 파워가
     * 채우기 때문이다.
     */
    mix: { maxPower: 0 },
  },
] as const;

export type TrainingGoal = (typeof TRAINING_GOALS)[number];

export const TRAINING_GOAL_NAMES: readonly string[] = TRAINING_GOALS.map((g) => g.name);

/** 아직 안 고른 사람은 '균형 잡힌 관리'로 본다. */
export function findGoal(name: string | null): TrainingGoal {
  return TRAINING_GOALS.find((g) => g.name === name) ?? TRAINING_GOALS[0];
}

/* 난이도 이름이 실제 목록과 어긋나면 조용히 아무 일도 안 하므로 여기서 막는다. */
const known = new Set<string>(DIFFICULTY_LEVELS.map((d) => d.name));
for (const level of TRAINING_LEVELS) {
  for (const name of [...level.allow, ...level.prefer]) {
    if (!known.has(name)) {
      throw new Error(`난이도 목록에 없는 이름: ${name} (${level.name})`);
    }
  }
}

/* ------------------------------- 프로필 저장 ------------------------------ */

/**
 * 프로필 폼에서 경력·목표·장비를 읽는다.
 *
 * 목록에 없는 값은 버린다. 화면에서 고르는 것이라 이상한 값이 올 일은 드물지만,
 * 폼은 누구나 고쳐 보낼 수 있고 여기 들어온 값은 그대로 DB에 남아 나중에 운동을
 * 고르는 데 쓰인다. 목록 밖의 이름이 저장되면 그 사용자는 어떤 규칙에도 걸리지
 * 않는 상태가 된다.
 *
 * 서버 액션 안에 두지 않고 따로 뺀 이유는 시험할 수 있게 하기 위해서다.
 */
export function readTrainingProfile(formData: FormData) {
  return {
    trainingLevel: pickOne(
      String(formData.get('trainingLevel') ?? ''),
      TRAINING_LEVEL_NAMES
    ),
  };
}

/**
 * 일정을 만드는 폼에서 온 오늘의 훈련 목표.
 *
 * 목록에 없는 이름이면 지난번에 고른 것으로 돌아간다. 아무것도 없으면 null 이고,
 * 그때는 균형 잡힌 관리로 본다(findGoal).
 *
 * 목표는 설정이 아니라 여기서 온다. 설정에 두었을 때는 한 번 '파워 향상'으로
 * 정해둔 사람의 모든 날이 파워 위주가 됐다 — 오늘은 어깨 관리에 쓰고 싶은
 * 날에도 그랬다.
 */
export function readTrainingGoal(
  formData: FormData,
  fallback: string | null
): string | null {
  return (
    pickOne(String(formData.get('trainingGoal') ?? ''), TRAINING_GOAL_NAMES) ?? fallback
  );
}

/**
 * 가지고 있는 장비만 읽는다.
 *
 * 경력과 폼을 나눠 둔 이유가 있다. 예전에는 셋이 한 폼이라, 경력만 고치러
 * 열었다가 저장해도 장비가 함께 저장됐다. 그런데 아직 장비를 안 고른 사람에게는
 * 화면이 전부 켜진 채로 나오므로(안 그러면 저장하는 순간 맨몸 운동만 남는다),
 * 결과적으로 있지도 않은 장비 열여섯 개를 "가지고 있다"고 저장하게 됐다.
 * 그러면 바벨이 없는데 바벨 운동이 나온다.
 *
 * 이제 장비는 자기 단추로만 저장된다. 안 건드리면 안 바뀐다.
 *
 * 하나도 안 고르고 저장하면 '맨몸'만 남는다. 빈 배열로 두면 "아직 안 골랐다"는
 * 뜻이 되어 아무것도 안 걸러지므로, 맨몸만 있다는 뜻과 구별할 수 없다.
 */
export function readOwnedEquipment(formData: FormData) {
  return {
    ownedEquipment: [
      ALWAYS_OWNED,
      ...pickMany(formData.getAll('ownedEquipment').map(String), SELECTABLE_EQUIPMENT),
    ],
  };
}
