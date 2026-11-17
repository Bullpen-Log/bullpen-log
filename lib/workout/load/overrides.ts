/**
 * EX-LOAD01 — 검토한 예외(운동 id 열쇠). 순수.
 *
 * 장비만으로 답이 안 나오는 곳(밴드 역할 · 같이/골라 쓰기 · 받침으로 쓰는 봉 · 무게를 더한 맨몸 변형 · 1RM 켜고 끄기)에만 쓴다.
 * 비어 있는 것이 정상이다 — 운동마다 기록 방식을 고르는 표가 아니다. 넣는 것은 인벤토리(scripts/load-contract-inventory.mts)로
 * 장비를 확인하고 검토한 id 뿐이다. 제목 글자로 넣지 않는다.
 *
 * 스키마를 적용하면(WORKOUT_LOAD_SCHEMA) 관리자가 고친 ExerciseVideo.loadSemantics 가 이 표 위에 온다(이 표의 locked 만 이긴다).
 * 앞서는 차례(R1-04, semantics.ts 머리말): 잠근 코드 예외 > 저장된 loadSemantics > 잠그지 않은 코드 예외 > 장비 기본값 — 한 층이 통째로 정한다.
 */

import type { EffectiveOverrides, SemanticOverrides } from '@/lib/workout/load/contract';
import { effectiveOverrides, readLoadSemantics, type CodeOverride, type SemanticsSource } from '@/lib/workout/load/semantics';

export const LOAD_OVERRIDES: Readonly<Record<string, SemanticOverrides & { locked?: boolean }>> = {
  /*
   * 2026-11-16 인벤토리(459개, scripts/load-contract-inventory.mts) 검토 — 장비만으로 뜻이 틀리게 풀리던 운동만.
   * 받침으로 쓰는 봉: 인버티드 로우는 고정한 바벨 밑에 매달려 몸을 당긴다 — 봉은 드는 무게가 아니다(맨몸).
   */
  '92ec03d2-93e6-4d86-ae50-4ae590552a1b': { fixedSupport: ['바벨'] },
  /* 무게를 더한 맨몸 변형: 등에 얹은 원판 · 벨트에 단 무게는 '더한 무게'(드는 원판 합이 아니다) */
  'a2f81d6b-fc34-40b8-a82b-47fb9884c757': { fixedSupport: ['원판'], weightedVariation: true },
  'dc0e488b-dea5-4a36-89e1-510bc57ca3a3': { weightedVariation: true },
  /* 밴드 + 무게를 같이 쓰는 운동: 밴드 저항 데드리프트 — 바벨 무게와 밴드(저항)를 따로 남긴다 */
  '50298d2b-fd1f-4265-8b67-e95c7815335e': { use: 'combined', bandRole: 'resistance' },
  /* 보조 밴드 — 이름이 아니라 동작으로 검토: 몸무게 일부를 밴드가 덜어 주는 풀업 · 친업 · 푸시업 · 점프 */
  '6533120b-38ae-4db7-9257-a6956447bc1a': { bandRole: 'assistance' },
  '08d51d4b-3ebd-4c3e-a03b-8d14f3944be9': { bandRole: 'assistance' },
  '787563dd-83e7-46a8-af68-918e8a717c1c': { bandRole: 'assistance' },
  '00e3aa2c-052a-4b01-be1e-e96aa446d58d': { bandRole: 'assistance' },
  '412e7916-4db6-48c6-9f07-62849ae65e2d': { bandRole: 'assistance' },
  'dc822a45-81a6-4ae0-9edf-fc23f9869a9d': { bandRole: 'assistance' },
  /*
   * 일부러 비운 것(검토 메모): 밴드 보조 고관절 내 · 외회전 셋은 모빌리티의 '당겨 주는' 밴드라 저항 · 보조 어느 쪽 진행도 맞지 않다 — 세트마다 고름.
   * 숨긴 '싱글렉 케틀벨 교대 + 밴드 흔들기'는 밴드 역할(흔들기)이 둘 어디에도 안 맞아 미정으로 둔다(수량만, 관리자 검토 표시).
   */
};

/**
 * 검토해서 '그 장비로는 무게가 없다'고 확인한 운동 — 이 운동의 옛 kg 은 '확인 전'이 아니라 '맞지 않음'으로 표시한다.
 * 줄의 값은 지우지 않는다(원래 값 보존). 계산에서만 뺀다.
 */
export const REVIEWED_INCOMPATIBLE_LOAD: ReadonlySet<string> = new Set([
  /* 낮은 포고 홉(맨몸 점프) — 시험으로 넣은 kg 이 kg 기록 · 추정 1RM 을 만들던 사례(EX-LOAD01 회귀 시험) */
  '258c0eee-85fe-46dd-b6a1-d2639bb58345',
]);

/** 코드 검토 표의 한 줄(잠금 표시 포함) — 없으면 null */
export function codeOverrideOf(exerciseId: string | null | undefined): CodeOverride | null {
  if (!exerciseId) return null;
  return LOAD_OVERRIDES[exerciseId] ?? null;
}

/**
 * 해석기에 넘길 예외. 둘째 인자 stored 는 ExerciseVideo.loadSemantics 의 날것이다:
 *   - 넘기지 않음(undefined) — 저장 칸을 읽지 않았다(스키마 꺼짐 · 앱 화면). 코드 표만 쓴다 — 예전과 같은 값.
 *   - null — 칸은 읽었고 비어 있다. 코드 표.
 *   - 값 — 앞서는 차례대로(잠근 코드 > 저장값 > 잠그지 않은 코드). 읽지 못하면 { unsupported } → 계약이 '미정'.
 */
export function overridesFor(exerciseId: string | null | undefined, stored?: unknown): EffectiveOverrides | null {
  return effectiveOverrides(codeOverrideOf(exerciseId), stored === undefined ? undefined : readLoadSemantics(stored)).overrides;
}

/** 위와 같은 판단의 출처(어느 층이 정했나) — 관리자 화면 · 인벤토리 */
export function overridesSourceFor(exerciseId: string | null | undefined, stored?: unknown): SemanticsSource {
  return effectiveOverrides(codeOverrideOf(exerciseId), stored === undefined ? undefined : readLoadSemantics(stored)).source;
}
