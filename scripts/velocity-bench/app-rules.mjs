/**
 * 앱 화면 규칙 — 한 세션(묶음)에서 잰 공 가운데 무엇을 기록하고 어떤 값으로 보이나. 앱(native velocity · lib/velocity-session.ts)을 따른다.
 * scripts/velocity-lab/gun-table.mjs 에서 옮겼다 — 시험대(run.mjs)와 gun-table 이 같이 쓴다(규칙이 두 벌로 갈라지지 않게).
 *
 * 공 줄(row)에 필요한 칸: ok · kmh · conf · preConf · stab · source('ball' 이면 공 크기 자동 거리) · size(공 크기 거리) · slope ·
 * usedDist · impact · ext · frames · tape · dist(넣은 거리).
 *
 * 세션 거리는 깨끗한 공 셋부터의 가운데 값이고, 공을 받은 차례로 걸리는 앱과 달리 끝의 값으로 한 번에 옮긴다(견주는 도구다).
 * 공 크기로 잰 공(2.8.0)은 앱 규칙 그대로 — 받은 차례로 앞 공 셋 넘게의 공 크기 가운데에서 9% 넘게 튀면 빼고(sizeOutlier), 끝이 깨끗한 공
 * (튕김 · 이어 찾기 없음)의 가운데 거리에서 5% 안이면 그 거리로 옮긴다(withSessionDistance).
 */
import { sessionCorrection, sessionDistOf } from '../../lib/velocity-session-distance.ts';
import { SPEED_DISTANCE_EXPONENT, END_SIZE_AGREE } from '../../lib/velocity-engine/analyze-distance.ts';
import { INPUT_SIZE_MISMATCH } from '../../lib/velocity-engine/validate.ts';

/** lib/velocity-session.ts 의 SESSION_DIST_TOL · SESSION_SIZE_SPREAD — 그 파일은 '@/' 를 써서 노드가 못 읽는다 */
const AUTO_SESSION_TOL = 0.05;
const AUTO_SIZE_SPREAD = 0.09;
export const BASE_DIST = 20;

/**
 * 한 세션의 공(받은 차례) → 기록된 공과 화면 값. shown 의 차례: 공 크기로 잰 공 먼저, 그다음 넣은 거리로 잰 공(gun-table 출력과 같게).
 * corr — 넣은 거리 세션의 세션 거리 보정(sessionCorrection), sess — 공 크기 세션 거리.
 */
export function screenSession(rs) {
  const tape = rs.some((o) => o.tape);
  const isAuto = (o) => o.source === 'ball';
  const corr = tape
    ? null
    : sessionCorrection(
        rs.filter((o) => o.ok && !isAuto(o)).map((o) => ({ sizeDistM: o.size, sizeSlope: o.slope, extended: o.ext, impact: o.impact, confidence: o.preConf ?? o.conf, frames: o.frames })),
        BASE_DIST,
        SPEED_DISTANCE_EXPONENT
      );
  const ref = tape ? rs[0].dist : corr?.apply ? corr.m : BASE_DIST;
  const shown = [];
  /* 공 크기 거리로 잰 공 — 앱처럼 받은 차례로 */
  const kept = [];
  for (const o of rs) {
    if (!o.ok || !isAuto(o) || !(o.conf === 'high' || (o.conf === 'medium' && o.stab))) continue;
    const prior = kept.map((p) => p.size).filter((v) => v > 0).sort((a, b) => a - b);
    const n = prior.length;
    const mid = n % 2 ? prior[(n - 1) / 2] : (prior[n / 2 - 1] + prior[n / 2]) / 2;
    if (o.size > 0 && n >= 3 && Math.abs(o.size / mid - 1) > AUTO_SIZE_SPREAD) continue;
    kept.push(o);
  }
  const clean = (o) => o.impact === 'rebound' && o.ext === 0;
  const sess = sessionDistOf(kept.filter(clean).map((o) => o.usedDist), null);
  for (const o of kept) {
    const on = sess && clean(o) && Math.abs(o.usedDist / sess.m - 1) <= AUTO_SESSION_TOL;
    shown.push({ row: o, kmh: o.kmh * (on ? (sess.m / o.usedDist) ** SPEED_DISTANCE_EXPONENT : 1) });
  }
  for (const o of rs) {
    if (!o.ok || isAuto(o)) continue;
    let conf = o.preConf ?? o.conf;
    const off = o.size ? Math.abs(o.size / ref - 1) : 0;
    /* 세션 거리가 걸렸으면 그 기준은 믿을 만하다 — 튕긴 공도 10%(엔진 judgeSize strict, 2.7.6) */
    if (off > INPUT_SIZE_MISMATCH || ((tape || corr?.apply) && off > END_SIZE_AGREE) || (o.impact === 'end' && (o.size == null || off > END_SIZE_AGREE))) conf = 'low';
    if (conf === 'high' || (conf === 'medium' && o.stab)) shown.push({ row: o, kmh: o.kmh * (corr?.k ?? 1) });
  }
  return { shown, corr, sess };
}
