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
export const BODY_PARTS = [
  '어깨',
  '견갑',
  '가슴',
  '등',
  '팔꿈치',
  '손목·전완',
  '코어',
  '허리',
  '고관절',
  '햄스트링·둔근',
  '전신',
] as const;

/**
 * 운동 강도. 부하 지수가 높을 때 '높음'을 후보에서 빼는 데 쓰이므로
 * 기준을 설명과 함께 못 박아 둔다.
 */
export const INTENSITY_LEVELS = [
  { name: '낮음', desc: '회복·이완 수준. 투구한 날에도 할 수 있음' },
  { name: '중간', desc: '평소 훈련일에 하는 수준' },
  { name: '높음', desc: '최대 근력·전력 동작. 다음 날 회복 필요' },
] as const;

export const DIFFICULTY_LEVELS = [
  { name: '초급', desc: '처음 봐도 따라 할 수 있음' },
  { name: '중급', desc: '기본 동작이 익숙해야 함' },
  { name: '상급', desc: '숙련자용' },
] as const;

export const EXERCISE_EQUIPMENT = [
  '맨몸',
  '밴드',
  '덤벨',
  '바벨',
  '케틀벨',
  '메디신볼',
  '폼롤러',
  '마사지볼',
  '케이블',
  '머신',
  '박스',
  '야구공',
] as const;

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
