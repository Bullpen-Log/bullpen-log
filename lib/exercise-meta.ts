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
  /*
   * 철봉.
   *
   * 처음에는 목록에 없었다. 그래서 풀업·친업·데드행이 '맨몸'으로 등록됐고,
   * 철봉이 없는 사람에게도 그 운동이 나왔다. 몸만 있으면 되는 것이 아니라
   * 매달릴 봉이 있어야 하는 운동이다.
   *
   * 없으면 상체 당기기가 크게 비는 것도 이유다. 등 운동의 대표가 풀업·친업·
   * 인버티드 로우인데, 봉을 못 쓰면 밴드 로우와 TRX 로우 정도만 남는다.
   * 학교 웨이트장과 공원 철봉은 흔하다.
   */
  '철봉',
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

/**
 * 무게를 숫자로 적을 수 있는 장비.
 *
 * 맨몸 스트레칭에 "몇 kg 들었나요"를 물으면 답할 것이 없다. 밴드는 무게가
 * 아니라 장력이라 kg으로 적을 수 없고, 메디신볼·짐볼은 무게가 고정이라
 * 매번 적을 값어치가 없다.
 */
const WEIGHTED_EQUIPMENT: readonly string[] = ['덤벨', '바벨', '원판', '케틀벨'];

/** 이 운동에 무게 칸을 낼 것인가 */
/* ------------------------------- 동작 패턴 ------------------------------- */

/**
 * 몸을 어떤 방식으로 쓰는가.
 *
 * BODY_PARTS 와 다른 축이다. 저쪽은 '어느 근육을 쓰나'이고 이쪽은 '어떻게
 * 움직이나'다. 데드리프트와 스쿼트는 둘 다 하체인데 몸을 쓰는 방식이 다르다.
 *
 * 하루 구성을 짤 때 필요한 축이다. 카테고리만 맞으면 무엇이든 들어가던 때는
 * 60일 중 25일이 본운동을 무릎 계열로만 채웠다.
 *
 * 빠른 동작을 따로 두지 않는다. 박스 점프는 빠른 스쿼트이지 다른 계열이
 * 아니다 — 관절이 하는 일로 가른다. 그래야 "스쿼트 하고 나서 점프"가
 * 겹친다는 것이 드러난다.
 */
export const MOVEMENT_PATTERNS = [
  { name: '힌지', desc: '고관절을 접었다 편다 — 데드리프트·RDL·브리지' },
  { name: '스쿼트', desc: '두 발로 무릎을 굽혔다 편다 — 스쿼트·레그프레스' },
  { name: '런지', desc: '한 발에 실어 무릎을 굽힌다 — 런지·스텝업·스플릿' },
  { name: '밀기', desc: '몸에서 밀어낸다 — 프레스·푸쉬업·딥스' },
  { name: '당기기', desc: '몸쪽으로 당긴다 — 로우·풀업·컬' },
  { name: '회전', desc: '몸통을 돌리거나 돌아가지 않게 버틴다' },
  { name: '운반', desc: '무게를 들고 버티거나 걷는다' },
] as const;

export const MOVEMENT_PATTERN_NAMES: readonly string[] = MOVEMENT_PATTERNS.map(
  (p) => p.name
);

export function usesWeight(equipment: readonly string[]): boolean {
  return equipment.some((e) => WEIGHTED_EQUIPMENT.includes(e));
}

/* ------------------------------ 세트·횟수·휴식 ----------------------------- */

/**
 * 운동을 어떻게 수행하는가.
 *
 * 아직 채우지 않은 운동이 있을 수 있어 전부 비어 있을 수 있다.
 * 비어 있으면 화면에 아무것도 내지 않는다 — 지어내는 것보다 낫다.
 */
export type Prescription = {
  sets: number | null;
  /** 횟수로 하는 운동 */
  reps: number | null;
  /** 시간으로 버티는 운동 (횟수 대신) */
  holdSeconds: number | null;
  restSeconds: number | null;
  /** 좌우를 따로 하는 운동인가 — 한 세트에 양쪽을 다 한다는 뜻 */
  perSide: boolean;
};

/** 초를 사람이 읽기 좋게. 180 → '3분', 90 → '1분 30초', 45 → '45초' */
export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}초`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}

/* ------------------------- 큰 근육 · 작은 근육 ------------------------- */

/**
 * 다관절(큰 근육) 운동으로 보는 부위.
 *
 * 세트 사이 쉬는 시간이 여기서 갈린다. 연구는 "다관절 vs 단관절"로 나누는데,
 * 앱에는 관절 수가 없고 목표 부위가 있다. 큰 근육이 목표에 하나라도 들어가면
 * 다관절 동작으로 본다 — 벤치프레스[가슴·삼두·어깨], 풀업[등·견갑·이두],
 * 스쿼트[고관절·햄스트링·둔근]가 모두 이 규칙으로 맞게 갈린다.
 */
export const LARGE_MUSCLE_PARTS: readonly string[] = [
  '햄스트링·둔근',
  '고관절',
  '등',
  '가슴',
  '전신',
];

/**
 * 큰 근육을 쓰는 다관절 동작인가.
 *
 * 큰 근육 부위가 있으면 다관절로 본다. 여기에 하나를 더 본다 — 어깨와 함께
 * 이두·삼두가 목표에 들어가면 어깨관절과 팔꿈치관절이 같이 움직이는 동작이다
 * (밀리터리 프레스, 덤벨 숄더 프레스). 부위 이름만으로는 작은 근육처럼 보이지만
 * 회복에 걸리는 시간은 다관절 쪽이다.
 *
 * 반대로 사이드 레터럴 레이즈[어깨·견갑]는 팔꿈치가 고정이라 단관절로 남는다.
 */
export function isCompound(bodyParts: readonly string[]): boolean {
  if (bodyParts.some((p) => LARGE_MUSCLE_PARTS.includes(p))) return true;
  const shoulder = bodyParts.includes('어깨');
  const elbow = bodyParts.includes('삼두') || bodyParts.includes('이두');
  return shoulder && elbow;
}

/* --------------------------- 걸리는 시간 --------------------------- */

/**
 * 한 번 반복하는 데 걸리는 대략의 시간(초).
 *
 * 파워는 뛰는 것 자체는 1초여도 다시 자세를 잡는 시간이 붙는다.
 * NSCA는 뎁스 점프의 반복 사이에 5~10초를 두라고 한다.
 */
export function secondsPerRep(category: string, intensityLevel: number): number {
  if (category === '파워') return 6;
  if (intensityLevel >= 4) return 4; // 무거운 것은 천천히
  return 3;
}

/** 세트·휴식이 비어 있을 때 쓸 값 */
export const FALLBACK_REST_SECONDS = 60;

/**
 * 한 세트에 걸리는 시간(초) = 실제 수행 + 세트 사이 휴식.
 *
 * 이 단위로 잡아두면 "3세트 짜줬는데 2세트만 했다"를 그대로 계산할 수 있다.
 * 계획이 아니라 실제로 한 만큼이 부하가 되어야 한다.
 */
export function secondsPerSet(
  ex: { category: string; intensity: string } & Partial<Prescription>
): number | null {
  const level = intensityLevel(ex.intensity);
  const work =
    ex.holdSeconds ??
    (ex.reps != null ? ex.reps * secondsPerRep(ex.category, level) : null);
  if (work == null) return null;
  return (ex.perSide ? work * 2 : work) + (ex.restSeconds ?? FALLBACK_REST_SECONDS);
}

/**
 * 이 운동을 지정한 세트만큼 했을 때 걸리는 시간(분).
 *
 * 마지막 세트 뒤의 휴식은 다음 운동으로 넘어가는 시간이라 빼지 않고 그대로 둔다.
 * 세트 수를 안 주면 운동에 적힌 기본 세트로 센다.
 */
export function minutesForSets(
  ex: { category: string; intensity: string } & Partial<Prescription>,
  sets?: number
): number | null {
  const perSet = secondsPerSet(ex);
  const count = sets ?? ex.sets ?? null;
  if (perSet == null || count == null || count <= 0) return null;
  return (count * perSet) / 60;
}

/**
 * "3세트 × 10회 (좌우 각각) · 휴식 45초" 처럼 한 줄로 만든다.
 * 세트나 횟수가 비어 있으면 null 을 준다.
 */
export function formatPrescription(p: Partial<Prescription>): string | null {
  if (p.sets == null) return null;
  const amount =
    p.holdSeconds != null
      ? `${formatSeconds(p.holdSeconds)} 버티기`
      : p.reps != null
        ? `${p.reps}회`
        : null;
  if (amount == null) return null;

  const side = p.perSide ? ' (좌우 각각)' : '';
  const rest = p.restSeconds != null ? ` · 세트 사이 ${formatSeconds(p.restSeconds)} 휴식` : '';
  return `${p.sets}세트 × ${amount}${side}${rest}`;
}

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

/* ------------------------------ 실제로 한 만큼 ------------------------------ */

/**
 * 사람이 하루에 할 수 있는 범위.
 *
 * 잘못 눌러 999세트가 저장되는 것을 막는 자리다. 서버(app/actions/exercise-log.ts)와
 * 화면(트레이닝 목록)이 같은 값을 봐야 한다 — 화면이 더 큰 값을 받아주면,
 * 서버가 그것을 '안 적음'으로 버리는데 화면에는 친 숫자가 그대로 남는다.
 * 실제로 250회를 치면 화면엔 250이 남고 DB에는 아무것도 안 들어갔다.
 */
export const AMOUNT_LIMITS = {
  sets: 30,
  reps: 200,
  holdSeconds: 600,
  /** 사람이 드는 무게의 위쪽 끝. 세계기록도 여기 안에 들어온다. */
  weightKg: 500,
} as const;

export type AmountField = keyof typeof AMOUNT_LIMITS;

/** 실제로 한 만큼. 안 적은 칸은 null 이다. */
export type DoneAmount = {
  setsDone: number | null;
  repsDone: number | null;
  holdSecondsDone: number | null;
  weightKg: number | null;
};

/**
 * 실제로 한 만큼을 사람 말로. 아무것도 안 적었으면 null.
 *
 * '3세트 × 10회 · 20kg' 처럼 만든다. 수량과 무게를 다른 기호로 나누는 이유는,
 * 무게가 곱해지는 값이 아니라서다 — 3세트 × 10회 × 20kg 은 읽는 순간
 * 600 이라는 없는 숫자를 떠올리게 한다.
 *
 * 기록 화면과 트레이닝 화면이 같은 것을 보여줘야 해서 여기 둔다. 양쪽에
 * 따로 두면 한쪽만 고치고 다른 쪽을 잊는다.
 */
export function formatAmount(a: DoneAmount): string | null {
  const parts: string[] = [];
  if (a.setsDone != null) parts.push(`${a.setsDone}세트`);
  if (a.repsDone != null) parts.push(`${a.repsDone}회`);
  if (a.holdSecondsDone != null) parts.push(`${a.holdSecondsDone}초`);
  const amount = parts.join(' × ');
  const weight = a.weightKg != null ? `${a.weightKg}kg` : null;
  if (!amount && !weight) return null;
  return [amount, weight].filter(Boolean).join(' · ');
}
