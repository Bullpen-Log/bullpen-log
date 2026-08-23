/**
 * 운동·드릴에 붙이는 분류 항목.
 *
 * 설명 글은 사람만 읽을 수 있어서, 나중에 "어깨가 뻐근할 때 할 운동"을
 * 코드로 추려내려면 이렇게 값이 정해진 항목이 따로 있어야 한다.
 *
 * 여기 목록을 바꾸면 이미 등록된 영상의 태그와 어긋날 수 있으므로,
 * 값을 지우거나 이름을 바꿀 때는 기존 데이터를 함께 손봐야 한다.
 */

/* --------------------------------- 트레이닝 -------------------------------- */

/** 운동이 목표로 하는 신체 부위 */
/** 부위 이름 하나. 이 목록 밖의 이름은 어디서도 쓸 수 없다. */
export type BodyPart = (typeof BODY_PARTS)[number];

export const BODY_PARTS = [
  '어깨',
  '견갑',
  '가슴',
  '등',
  '이두',
  '삼두',
  '팔꿈치',
  '손목·전완',
  '코어',
  '고관절',
  '햄스트링·둔근',
  /**
   * 종아리와 발목.
   *
   * 처음에는 이 항목이 없어서 카프 레이즈·발목 안정성 운동을 모두 '고관절'로
   * 넣어 두었는데, 그러면 하체 운동을 부위로 골라낼 때 엉뚱한 것이 섞인다.
   * 투수는 앞발로 착지해 버티는 순간 발목이 크게 일하므로 따로 둔다.
   */
  '종아리·발목',
  '전신',
] as const;

/**
 * 운동 강도 다섯 단계.
 *
 * 이 값은 안전 필터가 직접 쓴다. 부하가 높거나 몸이 안 좋은 날에는
 * 위쪽 단계를 후보에서 빼기 때문에, 올릴 때 정확히 매기는 것이 중요하다.
 *
 * `level` 숫자를 함께 두는 이유가 있다. 규칙을 이름으로 쓰면
 * ("'높음'이 아니면 통과") 나중에 단계를 늘렸을 때 새 이름이 그 조건을
 * 그냥 통과해버린다. 숫자로 비교하면 그런 구멍이 생기지 않는다.
 */
export const INTENSITY_LEVELS = [
  { level: 1, name: '매우 낮음', desc: '스트레칭·가동성. 통증만 없다면 매일 해도 되는 수준' },
  { level: 2, name: '낮음', desc: '회복·이완 수준. 많이 던진 날에도 할 수 있음' },
  { level: 3, name: '중간', desc: '평소 훈련일에 하는 수준' },
  { level: 4, name: '높음', desc: '무게를 다루는 근력 운동. 다음 날 뻐근함이 남음' },
  { level: 5, name: '매우 높음', desc: '최대 근력·전력 점프. 며칠 회복이 필요하고 등판 전후에는 피함' },
] as const;

export type IntensityName = (typeof INTENSITY_LEVELS)[number]['name'];

/** 이름 → 단계 숫자. 목록에 없는 값은 가장 위험한 쪽으로 본다. */
export function intensityLevel(name: string): number {
  const found = INTENSITY_LEVELS.find((l) => l.name === name);
  /*
   * 모르는 이름이 오면 최고 단계로 친다.
   * 안전 쪽에서 틀리는 편이 맞다 — 잘못 들어온 값이 필터를 통과해
   * 몸이 안 좋은 날 고강도 운동이 추천되는 것보다는, 빠지는 쪽이 낫다.
   */
  return found ? found.level : MAX_INTENSITY_LEVEL;
}

export const MAX_INTENSITY_LEVEL = 5;

/** 이 단계까지만 허용한다는 뜻 — 규칙을 읽기 쉽게 이름을 붙여 둔다. */
export const INTENSITY_CAP = {
  /** 스트레칭·가동성만 */
  MOBILITY_ONLY: 1,
  /** 가벼운 회복까지 */
  RECOVERY: 2,
  /** 평소 훈련까지 — 무게 드는 것은 제외 */
  MODERATE: 3,
  /** 근력까지 — 최대 강도만 제외 */
  STRENGTH: 4,
  /** 제한 없음 */
  ALL: 5,
} as const;

export const DIFFICULTY_LEVELS = [
  { name: '초급', desc: '처음 봐도 따라 할 수 있음' },
  { name: '중급', desc: '기본 동작이 익숙해야 함' },
  { name: '상급', desc: '숙련자용' },
] as const;

/**
 * 운동에 필요한 도구. 성격이 비슷한 것끼리 묶어 두었고,
 * 화면의 뱃지도 이 순서로 나온다.
 *
 * 여기 없는 이름은 등록 폼에서 걸러져 저장되지 않는다(pickMany).
 * 새 도구를 쓰는 운동이 생기면 반드시 여기에 먼저 넣어야 한다.
 */
export const EXERCISE_EQUIPMENT = [
  // 맨몸과 몸을 거는 것
  '맨몸',
  '밴드',
  'TRX',
  // 무게
  '덤벨',
  '바벨',
  '원판',
  '케틀벨',
  // 공
  '메디신볼',
  '짐볼',
  '야구공',
  // 이완 도구
  '폼롤러',
  '마사지볼',
  // 기구
  '케이블',
  '머신',
  // 받침
  '벤치',
  '박스',
] as const;

/** 도구 이름 하나. 이 목록 밖의 이름은 어디서도 쓸 수 없다. */
export type EquipmentName = (typeof EXERCISE_EQUIPMENT)[number];

/* --------------------------------- 메커니즘 -------------------------------- */

/** 드릴이 무엇을 교정하는지. 나중에 영상분석 결과와 이어지는 고리다. */
export const FOCUS_POINTS = ['스로잉', '상체', '하체', '전신'] as const;

export const DRILL_EQUIPMENT = [
  '맨몸',
  '야구공',
  '웨이티드볼',
  '메디신볼',
  '월볼',
  '밴드',
  '짐볼',
  '케틀벨',
  '케이블',
  '머신',
] as const;

/* ---------------------------------- 공통 ---------------------------------- */

export const INTENSITY_NAMES: readonly string[] = INTENSITY_LEVELS.map((l) => l.name);
export const DIFFICULTY_NAMES: readonly string[] = DIFFICULTY_LEVELS.map((l) => l.name);

/**
 * 여러 개 고르는 항목을 정리한다.
 * 목록에 없는 값은 버리고, 중복은 없애고, 정해진 순서대로 되돌린다.
 */
export function pickMany(
  values: (string | null)[],
  allowed: readonly string[]
): string[] {
  const chosen = new Set(values.filter((v): v is string => typeof v === 'string'));
  return allowed.filter((option) => chosen.has(option));
}

/** 하나만 고르는 항목. 목록에 없으면 null. */
export function pickOne(
  value: string | null,
  allowed: readonly string[]
): string | null {
  return value && allowed.includes(value) ? value : null;
}
