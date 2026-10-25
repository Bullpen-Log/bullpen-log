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
 *
 * 지름을 모르는 후보(d ≤ 0 — 2026-10-25 설계안 작업 B: 열지도 봉우리 폭 · 거친 크기 머리를 지름으로 믿지 않을 때)는 따로 잇는다 — 둘레 문은
 * minGatePx(분석 px, 부르는 쪽이 화면 크기로 정한다) + 한 장 움직임, 지름 규칙(되돌아 커짐 · 줄어듦)은 안 보고 대신 넷 넘게 이어지고 처음 → 끝이
 * 둘레 문의 세 배는 움직인 길만(제자리 손 · 쥔 공을 가른다).
 * d 를 모두 아는 입력에서는 결과가 예전과 글자까지 같다(minGatePx 는 d ≤ 0 인 점에만 쓴다).
 */
export const NET_FLIGHT_MIN_RUN_NO_D = 4;
export function netFlight(points: NetPoint[], dt: number, minGatePx = 0): NetPoint[] | null {
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
      const sized = p.d > 0 && q.d > 0;
      const gate = (q.d > 0 ? 2 * q.d : minGatePx) + step * (p.t - q.t) * 1.5;
      if (Math.hypot(p.u - q.u, p.v - q.v) <= gate && (!sized || p.d <= q.d * 1.35)) run.push(p);
    }
    for (const p of run) used.add(p);
    const strong = run.filter((p) => p.score >= NET_FLIGHT_STRONG).length;
    if (strong < 3) continue;
    const allSized = run.every((p) => p.d > 0);
    if (allSized) {
      if (!(run[0].d >= NET_FLIGHT_MIN_SHRINK * run[run.length - 1].d)) continue;
    } else {
      /* 지름이 없으면 줄어듦을 못 본다 — 대신 넷 넘게 이어지고 처음에서 끝까지 둘레 문의 세 배는 움직인 길만(제자리 손 · 쥔 공은 빠진다) */
      const first = run[0], last = run[run.length - 1];
      if (run.length < NET_FLIGHT_MIN_RUN_NO_D || Math.hypot(last.u - first.u, last.v - first.v) < 3 * minGatePx) continue;
    }
    if (!best || run.length > best.length) best = run;
  }
  return best;
}
