/**
 * 운동 화면의 휴식 시계 — 마지막 세트로부터 몇 초 쉬었나.
 *
 * 10분이 넘으면 시계를 거둔다(null). 세트 사이에 10분을 쉬는 일은 거의 없다 —
 * 그만큼 지났으면 운동을 마치고 [운동 종료]를 안 누른 채 떠난 경우가 대부분이다.
 * 예전에는 그래도 계속 올라가 '47:12 쉬는 중'이 떠 있었다. 다음 세트를 남기면
 * 0 부터 다시 센다.
 *
 * 화면(app/(session)/workout/run/session-client.tsx)과 시험
 * (scripts/training-selftest.mts)이 같이 쓴다.
 */
export const REST_CLOCK_LIMIT_SECONDS = 10 * 60;

export function restSeconds(since: string | null, now: number): number | null {
  if (!since) return null;
  const start = Date.parse(since);
  if (Number.isNaN(start)) return null;
  /* 폰 시계가 조금 틀려 마지막 세트가 '미래'로 찍혀도 0 으로 둔다 */
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  return seconds >= REST_CLOCK_LIMIT_SECONDS ? null : seconds;
}
