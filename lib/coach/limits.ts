import { isArmPlyo, isHeavyLower, isLowerPower, type ClassifiableExercise } from '@/lib/engine/exercise-class';
import type { CoachLimit } from '@/lib/coach/answers';

/**
 * 코치 질문의 '피해야 할 동작'(docs/designs/ai-coach.md 10-4) — 오늘 운동 만들기가 그 운동을 고르지 않게 거른다(빼기, 뒤로 미루기 아님 — 전문가가 정해 준 제한이라).
 * 분류는 엔진 것을 그대로 쓴다. 순수 파일.
 */
/* ponytail: '머리 위로 밀기'는 운동 칸에 없어 이름으로 본다(lib/program/program.ts OVERHEAD_PRESS 와 같은 낱말 + 파이크 푸시업) — 운동에 계열 칸이 생기면 그것으로 */
const OVERHEAD = /숄더 프레스|밀리터리|푸시 프레스|오버헤드|파이크/;

const LIMIT_TEST: Record<CoachLimit, (ex: ClassifiableExercise & { title: string }) => boolean> = {
  heavyLower: isHeavyLower,
  jump: isLowerPower,
  throwing: isArmPlyo,
  overhead: (ex) => OVERHEAD.test(ex.title),
};

export function limitedBy(ex: ClassifiableExercise & { title: string }, limits: readonly CoachLimit[]): boolean {
  return limits.some((l) => LIMIT_TEST[l]?.(ex));
}
