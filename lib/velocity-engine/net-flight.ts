/**
 * 공 길 안내 — 모델 봉우리(장면마다)를 날아가는 공 길로 잇는다. 순수 셈.
 * ball-net.ts 에서 뗐다(2026-10-24): analyze-distance 가 ball-net 을 들여오자 앱 묶음에 onnxruntime 동적 import 가 따라 들어가 Hermes 가
 * 'Invalid expression' 으로 멈췄고 앱 화면 업데이트가 모두 실패했다. 앱이 들여오는 엔진 파일은 ball-net.ts 를 들여오지 않는다.
 */

/** 장면마다 모델 봉우리 — 분석 px(엔진이 받는 꼴). 공 길 안내(netFlight)용 */
export type NetPoint = { t: number; u: number; v: number; d: number; score: number };

/** 공 길 안내 — 이어 붙일 최소 점수(센 점 NET_FLIGHT_STRONG 이 셋은 있어야), 건너뛸 장면 수, 날아간 공이면 줄어야 할 지름 배 */
export const NET_FLIGHT_WEAK = 0.3;
/** = ball-net.ts BALL_NET_THRESHOLD — 그 파일을 들여오지 않으려고 숫자로(웹 전용 동적 import 가 앱 Hermes 컴파일을 깬다) */
export const NET_FLIGHT_STRONG = 0.5;
export const NET_FLIGHT_MAX_GAP = 3;
export const NET_FLIGHT_MIN_SHRINK = 1.6;

/**
 * 장면마다의 모델 봉우리(points, 시각순 · 장면 하나에 하나) → 날아가는 공 길(가장 긴 것). 앞 점 둘레(지름의 2배 + 한 장 움직임)에
 * 있고 지름이 크게 되돌아 커지지 않는(×1.35) 점을 NET_FLIGHT_MAX_GAP 장까지 건너뛰며 잇는다. 센 점이 셋 넘고 지름이 NET_FLIGHT_MIN_SHRINK 배
 * 넘게 준 길만(멀어지는 공) — 팔 · 손에 쥔 공 · 되던진 공(커짐)은 여기서 빠진다. 없으면 null.
 * dt = 한 장 간격(초).
 */
export function netFlight(points: NetPoint[], dt: number): NetPoint[] | null {
  const pts = points.filter((p) => p.score >= NET_FLIGHT_WEAK);
  let best: NetPoint[] | null = null;
  const used = new Set<NetPoint>();
  for (const start of pts) {
    if (used.has(start)) continue;
    const run = [start];
    for (const p of pts) {
      const q = run[run.length - 1];
      if (p.t <= q.t) continue;
      if (p.t - q.t > (NET_FLIGHT_MAX_GAP + 0.5) * dt) break;
      const prev = run.length > 1 ? run[run.length - 2] : null;
      const step = prev ? Math.hypot(q.u - prev.u, q.v - prev.v) / Math.max(dt, q.t - prev.t) : 0;
      const gate = 2 * q.d + step * (p.t - q.t) * 1.5;
      if (Math.hypot(p.u - q.u, p.v - q.v) <= gate && p.d <= q.d * 1.35) run.push(p);
    }
    for (const p of run) used.add(p);
    const strong = run.filter((p) => p.score >= NET_FLIGHT_STRONG).length;
    if (strong < 3 || !(run[0].d >= NET_FLIGHT_MIN_SHRINK * run[run.length - 1].d)) continue;
    if (!best || run.length > best.length) best = run;
  }
  return best;
}
