import { createActiveRegistry } from '@/lib/exercise-video-state';

/** 이 브라우저 창에서 동시에 도는 운동영상은 하나 — 자체 영상과 YouTube 모두 여기에 올린다(VP01). */
export const activeExercisePlayer = createActiveRegistry();

let seq = 0;
/** 플레이어마다 한 번 받는 번호. */
export function nextPlayerId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}
