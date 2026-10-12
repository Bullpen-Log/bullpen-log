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
  if (ex.category === '파워') {
    if (ex.movementPattern != null)
      return LOWER_POWER_PATTERNS.includes(ex.movementPattern);
    return ex.bodyParts.some((p) => LOWER_BODY_PARTS.includes(p));
  }
  return false;
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
