import {
  INTENSITY_CAP,
  intensityLevel,
  type MOVEMENT_PATTERNS,
} from '@/lib/exercise-meta';
import type { SlotKey } from '@/lib/report/theme';

/**
 * 하루 일정 안에서 운동을 어떤 차례로 하는가(2026-10-04).
 *
 * 사용자분: "운동 강도가 뒤죽박죽이다 — 처음에 강도 높은 운동이 나왔다가 다음엔 낮은 게 나온다. 운동 순서는 굉장히 중요하다."
 * 예전에는 구간(가동성 · 본운동 · 코어 …) 안의 차례가 고른 차례 그대로였다. 고르는 차례는 '오래 안 한 운동 먼저'라는
 * 돌려쓰기 규칙(theme.ts 의 orderCandidates)이라 강도 · 종류와 상관없이 섞였다. 고르는 일과 하는 차례는 다른 일이라
 * 여기서 따로 정한다 — 무엇을 고르는지는 바꾸지 않는다.
 *
 * 근거(NSCA 의 운동 순서 지침 · 운동 순서 연구들의 공통 결론): 신경을 가장 많이 쓰는 운동을 몸이 새것일 때 먼저 한다 —
 * 파워(점프 · 메디신볼 던지기) → 큰 근육을 여럿 쓰는 무거운 운동 → 한 근육만 쓰는 보조 운동. 뒤에 둔 운동일수록 할 수
 * 있는 횟수 · 힘이 떨어지고, 지친 채 빠르거나 무거운 운동을 하면 자세가 무너진다.
 * 준비(가동성 · 회복날의 가벼운 유산소)는 거꾸로 가벼운 것부터 점점 활발하게 — 몸을 데워 가는 차례다.
 *
 * 처음 판(같은 날)은 '종류(양발 · 한쪽씩 · 보조) 먼저, 강도는 그다음'이었다. 검토에서 실제 일정 120개를 돌려 보니 근력
 * 날의 절반(58개)에서 강도가 오르내렸다 — 덤벨 프론트 스쿼트(높음) → 밴드 굿모닝(낮음) → 싱글렉 스쿼트(중간)처럼, 계열
 * 이름만 큰 운동인 가벼운 드릴이 무거운 운동 사이에 끼었다. 그래서 본 운동 안에서는 강도를 먼저 보고, 가벼운 드릴은
 * 보조로 돌렸다(오르내림 58 → 3일). 사용자분이 고른 판이다.
 *
 * 파워끼리는 가벼운 것부터다(사용자분 2026-10-04) — 스냅다운 · 포고 홉 같은 착지 · 가벼운 홉으로 시작해 박스 점프 · 뎁스
 * 드롭으로 올라간다. 착지를 먼저 익히고 몸이 데워진 뒤 큰 점프를 하는 현장 관행이다(논문이 정한 차례는 아니다 — NSCA 는
 * '지치기 전에, 세션 앞쪽'까지만 분명히 말한다).
 *
 * '권하지 않음'(그날 몸 상태로는 권하지 않는 운동) 표시는 차례에 넣지 않는다 — 규칙 하나로 둔다(사용자분 2026-10-04).
 * 같은 칸 · 같은 단계끼리는 들어온 차례를 지킨다(정렬이 안정적이다) — 그래야 같은 일정이 열 때마다 같은 차례다.
 */

/** 차례를 정하는 데 보는 것 — 라이브러리 운동이면 다 있다 */
export type OrderableExercise = {
  category: string;
  intensity: string;
  movementPattern?: string | null;
  /** 한쪽씩 하는 운동인가(싱글렉 RDL · 한팔 로우처럼 계열 이름은 양발 운동과 같은 것) */
  perSide?: boolean | null;
};

type PatternName = (typeof MOVEMENT_PATTERNS)[number]['name'];

/** 큰 근육을 여럿 쓰는 두 발 · 두 팔 운동 — 본 운동의 중심 */
const BILATERAL_PATTERNS: readonly PatternName[] = ['스쿼트', '힌지', '밀기', '당기기'];
/** 한쪽씩 하거나 몸통을 버티는 여러 관절 운동 — 같은 강도면 양발 · 양팔 운동 다음 */
const UNILATERAL_PATTERNS: readonly PatternName[] = ['런지', '회전', '운반'];

const isPattern = (list: readonly PatternName[], p: string | null | undefined) =>
  p != null && (list as readonly string[]).includes(p);

/** '중간' — 이보다 가벼운 여러 관절 운동(막대 RDL · 밴드 굿모닝 · 밴드 풀 어파트)은 본 운동이 아니라 드릴로 본다 */
const WORK_MIN_LEVEL = INTENSITY_CAP.MODERATE;

/**
 * 본운동 안의 묶음(작을수록 먼저).
 *   0 파워 — 점프 · 메디신볼 던지기
 *   1 본 운동 — 스트렝스 중 여러 관절을 쓰는 '중간' 이상(스쿼트 · 힌지 · 밀기 · 당기기 · 런지 · 회전 · 운반)
 *   2 보조 — 한 근육(고립 · 카프) · 계열 없음 · 가벼운 드릴 · 스트렝스가 아닌 운동
 *
 * 스트렝스가 아닌 운동이 본운동에 오는 것은 보조 데이(코어만이라 모두 2 — 강도로만 선다)이거나, 하체 · 상체 날에
 * 코어 · 스트레칭을 직접 더한 때다(slotForTheme 은 목표와 상관없는 기본 구성을 봐서 하체 · 상체 날의 코어 · 스트레칭을 본운동에 둔다) — 그때는 스트렝스 운동을 다 한 뒤에 온다.
 */
function mainGroup(ex: OrderableExercise): number {
  if (ex.category === '파워') return 0;
  const multiJoint =
    isPattern(BILATERAL_PATTERNS, ex.movementPattern) ||
    isPattern(UNILATERAL_PATTERNS, ex.movementPattern);
  if (
    ex.category.endsWith('스트렝스') &&
    multiJoint &&
    intensityLevel(ex.intensity) >= WORK_MIN_LEVEL
  ) {
    return 1;
  }
  return 2;
}

/** 같은 강도의 본 운동끼리 — 양발 · 양팔(0)이 한쪽씩(1)보다 먼저 */
function sideRank(ex: OrderableExercise): number {
  return ex.perSide || isPattern(UNILATERAL_PATTERNS, ex.movementPattern) ? 1 : 0;
}

/** 가벼운 것부터 점점 활발하게 — 몸을 데우는 구간 */
const WARMING_SLOTS: readonly SlotKey[] = ['cardio', 'mobility'];

/**
 * 한 구간 안의 차례.
 *   가동성 · 유산소       강도 낮은 것 → 높은 것
 *   본운동                파워(가벼운 것 → 센 것) → 본 운동(센 것 → 가벼운 것, 같으면 양발 먼저) → 보조(센 것 → 가벼운 것)
 *   코어 · 보강 · 암케어  강도 높은 것 먼저
 *
 * 항목이 운동 그 자체면 exerciseOf 를 생략한다 — 다른 모양이면 꼭 넘긴다(넘기지 않으면 컴파일이 막는다).
 */
export function orderWithinSlot<T extends OrderableExercise>(
  slot: SlotKey,
  items: readonly T[]
): T[];
export function orderWithinSlot<T>(
  slot: SlotKey,
  items: readonly T[],
  exerciseOf: (item: T) => OrderableExercise
): T[];
export function orderWithinSlot<T>(
  slot: SlotKey,
  items: readonly T[],
  exerciseOf?: (item: T) => OrderableExercise
): T[] {
  /* 생략할 수 있는 것은 위의 첫 꼴(T 가 운동)뿐이다 */
  const of = exerciseOf ?? ((item: T) => item as unknown as OrderableExercise);
  const warming = WARMING_SLOTS.includes(slot);
  const ranked = items.map((item, i) => {
    const ex = of(item);
    return {
      item,
      i,
      group: mainGroup(ex),
      side: sideRank(ex),
      level: intensityLevel(ex.intensity),
    };
  });
  ranked.sort((a, b) => {
    if (warming) return a.level - b.level || a.i - b.i;
    if (slot === 'main') {
      if (a.group !== b.group) return a.group - b.group;
      if (a.group === 0) return a.level - b.level || a.i - b.i;
      return b.level - a.level || (a.group === 1 ? a.side - b.side : 0) || a.i - b.i;
    }
    return b.level - a.level || a.i - b.i;
  });
  return ranked.map((r) => r.item);
}

/**
 * 일정 전체의 차례 — 구간 차례(slotOrder) 다음 구간 안의 차례(orderWithinSlot).
 *
 * 일정 화면 · 운동 시작(freezePlan)이 같은 것을 쓴다. 이미 만들어 저장해 둔 일정도 열 때 이 차례로 보인다
 * (저장된 것은 고른 차례 그대로라). 운동을 시작한 뒤의 목록은 그때 찍어 둔 차례다 — 운동 중에 바꾼 차례를 지킨다.
 */
export function orderSession<T extends { slot: SlotKey; ex: OrderableExercise }>(
  items: readonly T[],
  slotOrder: readonly SlotKey[]
): T[] {
  const rank = (slot: SlotKey) => {
    const i = slotOrder.indexOf(slot);
    return i < 0 ? slotOrder.length : i;
  };
  const slots = [...new Set(items.map((it) => it.slot))].sort(
    (a, b) => rank(a) - rank(b)
  );
  return slots.flatMap((slot) =>
    orderWithinSlot(
      slot,
      items.filter((it) => it.slot === slot),
      (it) => it.ex
    )
  );
}
