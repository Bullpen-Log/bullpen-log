/**
 * 운동 분류 판정 한 곳 — 트레이닝 추천 2판 P4(2026-10-12, docs/designs/training-recommendation-engine.md).
 *
 * 왜 두는가. '무거운 하체' · '팔 플라이오'(팔로 던지거나 미는 파워) · '무거운 상체 밀기'를 여러 층이 따로 알아야 한다 —
 * 안전 거르기(lib/report/prescription.ts — 등판 전 무거운 하체 · 팔 피로 '심함'), 하루 구성(lib/report/theme.ts 의 하체날 파워 계열),
 * 앞으로 들어올 중재(P6, 근력 프로그램과 매일 일정이 하체 · 팔을 나눠 쓰는 것), 기준선 도구가 같은 것을 센다. 층마다 판정을
 * 따로 두면 같은 날 다른 층이 다른 운동을 뺀다(설계 검토에서 팔 던지기 판정이 세 벌로 갈라질 뻔했다). 그래서 정의를 여기 한 곳에
 * 두고, 언제 빼는지(규칙)는 그것을 쓰는 쪽이 정한다 — 이 파일은 '이 운동이 무엇인가'만 말한다.
 *
 * 순수 잎 파일이다 — lib/exercise-meta.ts 만 import 한다. prescription · theme · day-state 가 모두 이것을 불러도 순환이 없고,
 * 자체 시험 · 기준선 도구가 node 로 그대로 부른다. lib/report/* 를 import 하면 theme → prescription → 여기 → theme 이 돌 수 있다.
 *
 * 처음 커밋에서는 theme.ts 의 하체날 파워 계열(LOWER_POWER_PATTERNS)만 이것을 쓰고, 세 판정을 부르는 규칙은 아직 없다(동작 변화 0).
 * 잰 수는 2026-10-12 운영 DB 의 보이는 운동 404개 — 자체 시험 '[2판 P4] 운동 분류'가 같은 수를 지킨다(판정이 넓어지거나 좁아지면 알린다).
 *
 * 2판 P5(2026-10-12)에 더한 것 — 무게 드는 카테고리(HEAVY_CATEGORIES, theme.ts 에서 옮김) · 하체 파워 · 상체 파워(isLowerPower ·
 * UPPER_POWER_PATTERNS · isUpperPower) · 천천히 내리는 운동(isEccentricOverload · isLowerEccentric) · 동작 열쇠(movementKeyOf).
 * 고르기 점수 · 양 조절 · 근력 프로그램 겹침이 같은 말로 보게 한 곳에 둔다(설계 검토: 갈래마다 '하체 플라이오' 정의가 달랐다 —
 * 부위 꼬리표로 가르면 코어 · 보강의 '고관절' 운동이 걸렸다). 처음 커밋에서는 theme.ts 가 두 목록을 가져다 쓰는 것뿐이다(동작 변화 0).
 */
import {
  INTENSITY_CAP,
  intensityLevel,
  type BodyPart,
  type EXERCISE_EQUIPMENT,
  type MOVEMENT_PATTERNS,
} from '@/lib/exercise-meta';

/** 판정에 필요한 칸 — 라이브러리 줄(ExerciseVideo · 캐시)과 자체 시험의 가짜 운동이 모두 넘길 수 있게 좁게 둔다 */
export type ClassifiableExercise = {
  category: string;
  intensity: string;
  bodyParts: readonly string[];
  equipment: readonly string[];
  /** 동작 계열(힌지 · 스쿼트 …). 안 적힌 운동이 있다 — 그때는 부위로 가른다 */
  movementPattern?: string | null;
};

type PatternName = (typeof MOVEMENT_PATTERNS)[number]['name'];
type EquipmentName = (typeof EXERCISE_EQUIPMENT)[number];

/**
 * 하체날에 들어오는 파워의 동작 계열 — 뛰고 미는 것. 하체날 본운동 구성(theme.ts COMPOSITIONS.lower)과 무거운 하체 판정이 같은
 * 목록을 쓴다. 두 곳에 따로 적으면 하체날에 들어가는 점프와 '등판 전에 빼는 점프'가 어긋난다.
 */
export const LOWER_POWER_PATTERNS: readonly string[] = [
  '스쿼트',
  '런지',
  '힌지',
] satisfies PatternName[];

/**
 * 계열이 안 적힌 파워를 하체로 보는 부위. '전신'은 넣지 않는다 — 메디신볼 던지기 · 슬램에도 붙어 있어 상체 던지기가 하체로 걸린다.
 */
const LOWER_BODY_PARTS: readonly string[] = [
  '고관절',
  '햄스트링·둔근',
  '종아리·발목',
] satisfies BodyPart[];

/**
 * 하체 스트렝스에서 강도와 상관없이 무겁게 보는 장비 — 두 발로 바벨이나 원판을 지는 것. 강도를 안 고쳐 기본값 '중간'으로 남은
 * 바벨 운동이 들어와도 무거운 하체로 잡히게 한다(지금 표에는 그런 운동이 없다 — 바벨 · 원판 하체는 모두 '높음' 이상).
 *
 * HEAVY_EQUIPMENT(덤벨 · 케틀벨 · 케이블까지)를 쓰지 않는 까닭: 고블렛 스쿼트 · 덤벨 리버스 런지 · 싱글렉 덤벨 RDL 같은
 * '중간' 한 다리 · 가벼운 하체는 등판 2~3일 전에도 하는 운동이다. 그것까지 빼면 그날 하체 구간이 빈다.
 */
const HEAVY_LOWER_EQUIPMENT: readonly string[] = [
  '바벨',
  '원판',
] satisfies EquipmentName[];

/**
 * 무거운 하체인가 — 다음 날 다리에 무게가 남는 것. 등판 며칠 전에 빼는 대상이다(P4 커밋 D).
 *
 *   하체 스트렝스  강도 '높음' 이상(무게를 다루는 근력 — exercise-meta INTENSITY_LEVELS 4) 또는 바벨 · 원판
 *   파워           하체 계열(스쿼트 · 런지 · 힌지 — 점프 · 바운드 · 스냅다운 · 스윙) 또는 계열 없음 + 하체 부위
 *
 * 2026-10-12 실측: 하체 스트렝스 53개 중 22개(바벨 백 스쿼트 · 데드리프트 · 불가리안 스플릿 스쿼트 …), 파워 44개 중 36개.
 * 하체 스트렝스 31개('중간' 이하 덤벨 · 맨몸 · 밴드 — 고블렛 스쿼트 · 덤벨 스텝업 …)는 남아 '한 다리 · 가벼운 하체' 날의 재료가 된다.
 * 강도를 모르는 이름은 intensityLevel 이 가장 센 쪽(5)으로 보므로 무거운 쪽으로 틀린다 — 안전 쪽이다.
 */
export function isHeavyLower(ex: ClassifiableExercise): boolean {
  if (ex.category === '하체 스트렝스') {
    return (
      intensityLevel(ex.intensity) >= INTENSITY_CAP.STRENGTH ||
      ex.equipment.some((e) => HEAVY_LOWER_EQUIPMENT.includes(e))
    );
  }
  return isLowerPower(ex);
}

/**
 * 무게를 드는 카테고리 — 운동을 바꿀 때 봉을 끼우고 원판을 가는 시간이 더 들고(theme.ts transitionFor), 본운동의 세트가
 * 몸에 남는 쪽이다(양 조절이 세트를 줄이는 대상 — 2판 P5). 2026-10-12 전에는 theme.ts 안에만 있었다(비공개라 다른 층이 베낄 뻔했다).
 * 카테고리 이름의 목록은 lib/categories.ts 에 있다 — 이 파일은 exercise-meta 만 부르므로 자체 시험이 그 목록 안에 있는지 본다.
 */
export const HEAVY_CATEGORIES: readonly string[] = [
  '상체 스트렝스',
  '하체 스트렝스',
  '파워',
];

/**
 * 하체 파워인가 — 다리로 뛰고 미는 파워(점프 · 바운드 · 스냅다운 · 스윙). 하체날 본운동에 들어오는 파워와 같은 뜻이다.
 *
 *   파워이고 계열이 하체(스쿼트 · 런지 · 힌지)이거나 · 계열이 없으면 하체 부위(고관절 · 햄스트링·둔근 · 종아리·발목)
 *
 * 2026-10-12 실측 44개 중 36개(계열 34 · 계열 없는 아이소 둘). 부위만으로 가르지 않는 까닭: 계열이 있는 상체 던지기에도
 * 고관절 꼬리표가 붙는다(레터럴 바운드 + 메디신볼 슬램처럼 둘 다인 것은 계열 '런지'로 하체 파워다 — 공을 내리치니 isArmPlyo 이기도).
 * 무거운 하체(isHeavyLower)의 파워 몫이 바로 이것이다 — 하체 파워는 모두 다음 날 다리에 남는 것으로 본다.
 */
export function isLowerPower(ex: ClassifiableExercise): boolean {
  if (ex.category !== '파워') return false;
  if (ex.movementPattern != null)
    return LOWER_POWER_PATTERNS.includes(ex.movementPattern);
  return ex.bodyParts.some((p) => LOWER_BODY_PARTS.includes(p));
}

/**
 * 상체날에 들어오는 파워의 동작 계열 — 몸통 · 팔로 던지고 미는 것. 상체날 본운동 구성(theme.ts COMPOSITIONS.upper)과 상체 파워
 * 판정이 같은 목록을 쓴다. 하체 계열(LOWER_POWER_PATTERNS)과 겹치지 않는다(같은 점프가 두 날에 들지 않게 — 자체 시험).
 */
export const UPPER_POWER_PATTERNS: readonly string[] = [
  '밀기',
  '당기기',
  '회전',
] satisfies PatternName[];

/**
 * 상체 파워인가 — 상체날 파워 칸에 드는 것(메디신볼 던지기 · 슬램 · 플라이오 푸시업 · 회전 던지기).
 *
 *   파워이고 계열이 상체(밀기 · 당기기 · 회전)이거나 · 계열이 없으면 메디신볼 · 플라이오볼을 쓰거나 어깨 · 팔꿈치를 쓴다
 *
 * 팔 플라이오(isArmPlyo)와 묻는 것이 다르다: 이쪽은 '어느 날 칸에 드는가', 저쪽은 '팔이 지치는가'. 그래서 계열 '회전'인 다리 점프
 * (워터볼 180도 연속 점프)는 상체 파워지만 팔 플라이오가 아니고, 레터럴 바운드 + 메디신볼 슬램은 하체 파워지만 팔 플라이오다.
 * 2026-10-12 실측 8개(밀기 3 · 당기기 2 · 회전 3), 계열 없는 상체 파워는 아직 없다. 계열이 있으면 하체 파워와 동시에 참일 수 없다
 * (계열이 하나). 계열이 없으면 하체 부위 + 메디신볼처럼 둘 다일 수 있다 — movementKeyOf 는 그때 하체를 먼저 본다(다리에 남는 쪽).
 */
export function isUpperPower(ex: ClassifiableExercise): boolean {
  if (ex.category !== '파워') return false;
  if (ex.movementPattern != null)
    return UPPER_POWER_PATTERNS.includes(ex.movementPattern);
  return (
    ex.equipment.some((e) => THROW_EQUIPMENT.includes(e)) ||
    ex.bodyParts.some((p) => ARM_PLYO_PARTS.includes(p))
  );
}

/** 팔로 던지는 공 — 이 장비가 든 파워는 팔 플라이오다 */
const THROW_EQUIPMENT: readonly string[] = [
  '메디신볼',
  '플라이오볼',
] satisfies EquipmentName[];

/**
 * 팔 플라이오의 부위 — 어깨 · 팔꿈치. '손목·전완'은 넣지 않는다: 밴드 저항 데드리프트의 그립 꼬리표라 하체 파워가 걸린다.
 */
const ARM_PLYO_PARTS: readonly string[] = ['어깨', '팔꿈치'] satisfies BodyPart[];

/**
 * 팔 플라이오인가 — 팔로 빠르게 던지거나 밀어내는 파워. 팔 피로가 '심함'인 날 · 성장기의 투구 쉬는 날에 빼는 대상이다
 * (P4 커밋 C), 등판 날 팔 예산(P6 중재)도 이것을 센다.
 *
 *   파워이고 (메디신볼 · 플라이오볼을 쓰거나 · 계열이 '밀기'이거나 · 어깨 · 팔꿈치를 쓴다)
 *
 * 2026-10-12 실측 7개, 오탐 0: 밴드 보조 플라이오 푸시업 · 밴드 스피드 벤치 프레스 · 톨닐링 메디신볼 체스트 패스 · 톨닐링 메디신볼
 * 오버헤드 스로우 · 오버헤드 메디신볼 슬램 · 메디신볼 푸시 슬램 · 레터럴 바운드 + 메디신볼 슬램(하체 바운드지만 공을 내리치니 둘 다).
 * 쓰면 안 되는 축 셋: '손목·전완'(밴드 저항 데드리프트), 계열 '당기기'(펜들레이 로우 — 바벨 로우), 계열 '회전'(워터볼 180도
 * 연속 점프 — 다리로 도는 점프). 이름으로 가르지 않는다 — 장비 · 계열 · 부위로 충분하고, 이름은 바뀐다.
 */
export function isArmPlyo(ex: ClassifiableExercise): boolean {
  if (ex.category !== '파워') return false;
  return (
    ex.equipment.some((e) => THROW_EQUIPMENT.includes(e)) ||
    ex.movementPattern === '밀기' ||
    ex.bodyParts.some((p) => ARM_PLYO_PARTS.includes(p))
  );
}

/**
 * 무거운 상체 밀기인가 — 어깨 앞쪽과 팔꿈치에 무게가 실리는 프레스. 팔 피로가 '심함'인 날에 빼는 대상이다(P4 커밋 C).
 *
 *   상체 스트렝스이고 계열이 '밀기'이고 강도 '높음' 이상
 *
 * 2026-10-12 실측 10개(벤치 프레스 · 인클라인 벤치 프레스 · 덤벨 벤치 프레스 · 밀리터리 프레스 · 덤벨 숄더 프레스 · 중량 푸시업 …).
 * '중간' 이하 밀기 13개(푸시업 · 덤벨 플로어 프레스 · 싱글암 덤벨 숄더 프레스 …)는 남는다 — 팔이 지친 날에도 가벼운 밀기는 할 수 있다.
 * 강도를 모르는 밀기는 무거운 쪽으로 본다(intensityLevel 이 5로 읽는다).
 */
export function isHeavyUpperPush(ex: ClassifiableExercise): boolean {
  return (
    ex.category === '상체 스트렝스' &&
    ex.movementPattern === '밀기' &&
    intensityLevel(ex.intensity) > INTENSITY_CAP.MODERATE
  );
}

/* ─────────────────────────── 천천히 내리는 운동(2판 P5) ─────────────────────────── */

/**
 * 암케어 방식 '에센트릭 오버로드'의 이름 표시 — lib/armcare/methods.ts 의 titleMarker 와 같은 말이다(이 파일은 exercise-meta 만
 * 부르므로 그 표를 import 하지 않고, 자체 시험이 두 값이 같은지 본다). 운동 이름 규칙(2026-10-09 김민): 과부하로 내리는 운동은
 * 이름을 '…에센트릭 오버로드'로 짓는다.
 */
export const ECCENTRIC_OVERLOAD_MARKER = '에센트릭 오버로드';

/**
 * 암케어의 에센트릭 오버로드 운동인가 — 혼자 못 올리는 무게를 천천히 내리며 버티는 방식. 이름에 표시가 들어 있으면 그렇다
 * (lib/armcare/methods.ts 의 methodOf 와 같은 규칙 — includes). 2026-10-12 실측 9개, 모두 암케어(전완 · 이두 · 어깨 회전근).
 */
export function isEccentricOverload(ex: { title: string }): boolean {
  return ex.title.includes(ECCENTRIC_OVERLOAD_MARKER);
}

/**
 * 내리는 데 힘을 싣는 운동의 이름 — 노르딕 컬 · 에센트릭 포즈 RDL · 싱글렉 에센트릭 스쿼트 같은 것. 라이브러리에 '천천히 내림'을
 * 적는 칸이 없어 이름으로 가른다(이 파일에서 이름을 읽는 곳은 여기뿐이다 — 다른 판정은 장비 · 계열 · 부위로 충분하다). 같은 말을
 * 촬영 계획(lib/shoot/schedule.ts SLOW_LOWER) · 기본기 차례(lib/program/program.ts LATER)도 이름에서 읽는다.
 */
const ECCENTRIC_TITLE = /에센트릭|노르딕/;

/**
 * 천천히 내리는 하체 운동인가 — 다음 날 근육통이 가장 크게 남는 하체 운동(근육이 늘어나며 버틸 때 가장 많이 상한다). 등판
 * 며칠 전에 뒤로 미룰 후보로 고르기 점수(2판 P5)가 읽는다.
 *
 *   이름에 '에센트릭' · '노르딕'이 들고 · 하체 스트렝스이거나 하체 파워(isLowerPower)
 *
 * 2026-10-12 실측 6개: 노르딕 햄스트링 컬 · 리버스 노르딕 컬 · 에센트릭 포즈 RDL · 에센트릭 포즈 고블렛 스쿼트 · 싱글렉 에센트릭
 * 스쿼트(원판) · 밴드 저항 스쿼트 점프(에센트릭). '에센트릭 오버로드'(암케어 9개)는 모두 팔이라 여기 안 든다 — 표시 하나로는 하체를
 * 못 가른다. 상체(에센트릭 덤벨 벤치 프레스)도 안 든다.
 */
export function isLowerEccentric(
  ex: ClassifiableExercise & { title: string }
): boolean {
  if (!ECCENTRIC_TITLE.test(ex.title)) return false;
  return ex.category === '하체 스트렝스' || isLowerPower(ex);
}

/* ─────────────────────────── 동작 열쇠(2판 P5) ─────────────────────────── */

/** 하체 파워 · 상체 파워의 동작 열쇠 — 동작 계열 이름(스쿼트 · 밀기 …)과 겹치지 않는 말 */
export const LOWER_POWER_KEY = '하체 파워';
export const UPPER_POWER_KEY = '상체 파워';

/**
 * 동작 열쇠 — '이 운동이 몸을 어떻게 쓰는가'를 근력 프로그램의 칸(lib/program/program.ts patternsOfProgramDay)과 매일 일정의
 * 후보가 같은 말로 견주게 한다. 프로그램이 내일 스쿼트를 하면 오늘 일정의 스쿼트를 뒤로 미는 식이다(고르기 점수, 2판 P5).
 *
 *   하체 · 상체 스트렝스   동작 계열 그대로(스쿼트 · 힌지 · 런지 · 밀기 · 당기기 · 고립 · 카프), 계열이 없으면 null
 *   파워                   하체 파워(isLowerPower) · 상체 파워(isUpperPower) · 둘 다 아니면 null
 *   그 밖(코어 · 모빌리티 · 암케어 · 회복 · 워밍업)   null — 겹침을 셀 무게가 아니다
 *
 * 파워를 계열 그대로 두지 않는 까닭: 박스 점프(파워 · 스쿼트)와 바벨 백 스쿼트(하체 스트렝스 · 스쿼트)를 같은 열쇠로 두면 점프 칸이
 * 있는 프로그램 날이 스쿼트 근력을 밀어낸다 — 프로그램은 점프 칸과 스쿼트 칸을 따로 둔다(program.ts VARIANT_RULES).
 */
export function movementKeyOf(ex: ClassifiableExercise): string | null {
  if (ex.category === '하체 스트렝스' || ex.category === '상체 스트렝스')
    return ex.movementPattern ?? null;
  if (isLowerPower(ex)) return LOWER_POWER_KEY;
  if (isUpperPower(ex)) return UPPER_POWER_KEY;
  return null;
}
