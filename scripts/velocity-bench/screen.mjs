/**
 * 시험대의 화면 규칙 — 앱 화면(native/src/velocity/session.ts decide)과 **같은 함수**로 한 묶음(세션)의 공을 받은 차례로 판정한다:
 * lib/velocity-session.ts screenPitch(세션 거리로 다시 판정 → 엔진 거부 → 믿음 '높음' → 앞 공과 공 크기 거리 튐) → measuredFields → withSessionDistance
 * (세션 거리 보정). 예전 app-rules.mjs(규칙 복제본 — 세션 거리를 끝의 값으로 한 번에 옮기는 등 앱과 달랐다)는 지웠다(2026-10-25 설계안 작업 A:
 * "앱과 시험대의 최종 기록 판정은 동일한 함수를 사용한다").
 * '@/' 를 쓰는 lib 을 읽으므로 `node --import ./scripts/alias-register.mjs` 로 돈다(package.json velocity:bench).
 *
 * 입력: balls — 받은 차례의 { id, result }(result 는 엔진 결과 통째 — run.mjs measure 가 들고 있다), tape — 줄자 세션인가.
 *       출처는 늘 'camera'(앱 클립) · 투수 뒤(approaching false).
 * 출력: id → { kept: true, kmh(화면 값 — 세션 거리 보정 뒤 rawKmh), distM } | { kept: false, why('engine-reject' · 'low-confidence' · 'session-size'), code }
 */
import { analysisOf } from '../../lib/velocity-analysis.ts';
import { measuredFields, screenPitch, withSessionDistance } from '../../lib/velocity-session.ts';

export function screenGroup(balls, { tape = false } = {}) {
  let list = [];
  const out = new Map();
  for (const b of balls) {
    if (!b.result) continue;
    const sv = screenPitch(b.result, list, { source: 'camera', tape, approaching: false });
    if (!sv.kept) {
      out.set(b.id, { kept: false, why: sv.why, code: sv.code });
      continue;
    }
    /* 앱 decide() 가 만드는 공 칸 가운데 규칙이 읽는 것만(출처 · 숫자 · analysis) — 클립 · 존 · 알림은 화면 것 */
    const pitch = { _id: b.id, source: 'camera', ...measuredFields(sv.result, false), analysis: analysisOf(sv.result, 'receding') };
    list = withSessionDistance([...list, pitch], null, tape);
  }
  for (const p of list) out.set(p._id, { kept: true, kmh: p.rawKmh, distM: p.dist?.m ?? null });
  return out;
}

/** 묶음 한 줄 요약 — 기록 수 · 기록된 공의 거리 가운데 값(m) */
export function screenSummary(out) {
  const kept = [...out.values()].filter((o) => o.kept);
  const ds = kept.map((o) => o.distM).filter((v) => v != null).sort((a, b) => a - b);
  const n = ds.length;
  const distM = n ? (n % 2 ? ds[(n - 1) / 2] : (ds[n / 2 - 1] + ds[n / 2]) / 2) : null;
  const why = {};
  for (const o of out.values()) if (!o.kept) why[o.code ?? o.why] = (why[o.code ?? o.why] ?? 0) + 1;
  return { kept: kept.length, total: out.size, distM, why };
}
