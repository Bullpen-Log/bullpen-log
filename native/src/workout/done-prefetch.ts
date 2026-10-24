import { rpc } from '~/lib/rpc';

/*
 * 축하 화면 자료를 미리 부른다 — 운동 화면이 마치기 답을 받는 순간 부르고(화면을 바꾸는 움직임과 겹친다), 축하 화면은 이 약속을 먼저 쓴다.
 * 예전엔 화면을 바꾼 뒤에야 불러 돌개가 그만큼 오래 떴다(2026-10-24 전체 검토). 한 번 쓰면 지운다(다시 불러오기는 새로).
 */
const pending = new Map<string, Promise<unknown>>();

export function prefetchWorkoutDone(id: string) {
  const p = rpc('app-workout.loadAppWorkoutDone', id);
  p.catch(() => undefined);
  pending.set(id, p);
}

export function takeWorkoutDone<T>(id: string): Promise<T> | null {
  const p = pending.get(id);
  pending.delete(id);
  return (p as Promise<T> | undefined) ?? null;
}
