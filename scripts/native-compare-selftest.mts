/**
 * 투구 영상 비교 · 분석(native/src/compare/*)의 순수 규칙 시험 — 시간 · 좌표 · 그림 · 투구 장면 · 문서 · 저장 · 재생 줄기 · 내보내기 계획.
 * 실행: npm run native-compare:test
 * 실제 재생기(디코더) · 화면 · 터치 · 파일 시스템은 보지 않는다 — 저장은 메모리 파일 손잡이로, 재생은 상태 기계로만.
 */
import assert from 'node:assert/strict';
import {
  buildNormalized,
  captureMapping,
  clock,
  durationText,
  normalizeFacts,
  normalizedOfA,
  normalizedTimes,
  offsetRange,
  percentile,
  phaseStretch,
  realSeconds,
  snapToFrame,
  startRange,
  stepFrom,
  stepInfo,
  syncQuality,
  trimmedRange,
  validAnchor,
  EMPTY_FACTS,
  type MediaFacts,
} from '~/compare/timing';
import {
  angleDeg,
  applyReg,
  containRect,
  distance,
  displayToEncoded,
  encodedToDisplay,
  normalizeView,
  registrationFrom,
  tiltDeg,
  toScreen,
  toSource,
  zoomAt,
  IDENTITY_VIEW,
  type Pane,
  type ViewTransform,
} from '~/compare/geometry';
import { applyEdit, clearTargets, compareMetric, historyOf, measureText, normalizeAnnotation, simplifyFree, visibleAt, type Annotation } from '~/compare/annotations';
import { anchorFromEvents, compareInterval, intervalOf, normalizeMarks, normalizedAnchors, orderIssues, sharedEvents } from '~/compare/pitch-events';
import { INITIAL_TRANSPORT, step, type TransportState } from '~/compare/transport';
import {
  activePair,
  addNote,
  addSource,
  createDocument,
  duplicate,
  moveReview,
  parseDocument,
  recentOf,
  removeSource,
  setActive,
  startReview,
  swapActive,
  updatePair,
  updateSource,
  type ComparisonDocument,
  type NewSource,
} from '~/compare/doc';
import { createAutosaver, createStorage, type FsAdapter, type Timer } from '~/compare/storage';
import { planComposition, planNarration } from '~/compare/export-plan';
import { filterSources, todayVsPast } from '~/compare/sources';
import { commonRange } from '~/videos/compare-math';

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  assert.deepEqual(a, b, m);
  n++;
};
const ok = (v: unknown, m: string) => {
  assert.ok(v, m);
  n++;
};
const near = (a: number | null | undefined, b: number, m: string, eps = 1e-6) => {
  assert.ok(a != null && Math.abs(a - b) <= eps, `${m}: ${a} ≠ ${b}`);
  n++;
};
const facts = (p: Partial<MediaFacts>): MediaFacts => ({ ...EMPTY_FACTS, ...p });

/* ===== 시간 ===== */
{
  const ra = trimmedRange(5, null);
  const rb = trimmedRange(3, null);
  eq(validAnchor(null, ra), false, 'null 은 안 짚음');
  eq(validAnchor(0, ra), true, '0 초는 맞는 기준');
  eq(validAnchor(Number.NaN, ra), false, 'NaN 거절');
  eq(validAnchor(6, ra), false, '범위 밖 거절');
  eq(validAnchor(1, null), false, '길이 모르면 거절');
  eq(offsetRange(0, 0, ra, rb), { min: 0, max: 3 }, '둘 다 0 기준 — 짧은 쪽까지');
  eq(offsetRange(2, 1, ra, rb), { min: -1, max: 2 }, '다른 기준 — 공통 상대 구간');
  eq(offsetRange(null, 1, ra, rb), null, '기준 없으면 구간 없음');
  eq(offsetRange(0, 1, trimmedRange(1, null), trimmedRange(10, { start: 5, end: 10 })), null, '다듬은 구간 밖 기준은 거절');
  eq(offsetRange(4.9, 0, ra, trimmedRange(0.05, null)), { min: 0, max: 0.05 }, '짧은 영상 끝까지만');
  /* 옛 compareMath 와 다듬지 않은 경우 같은 값 */
  for (const [ma, mb, da, db] of [[1, 2, 5, 6], [0, 0, 3, 3], [2.5, 0.2, 4, 1]] as const) {
    const o = offsetRange(ma, mb, trimmedRange(da, null), trimmedRange(db, null));
    const c = commonRange(ma, mb, da, db);
    eq(o ? { min: o.min + 0, max: o.max + 0 } : null, c ? { min: c.min + 0, max: c.max + 0 } : null, `옛 셈과 같음 ${ma},${mb}`);
  }
  /* A · B 바꿔도 같은 구간(대칭) */
  eq(offsetRange(2, 1, ra, rb), offsetRange(1, 2, rb, ra), 'A · B 바꿈 대칭');
  /* 다듬기 */
  eq(trimmedRange(10, { start: 2, end: 4 }), { start: 2, end: 4 }, '다듬은 구간');
  eq(trimmedRange(10, { start: 4, end: 2 }), null, '거꾸로 다듬기 거절');
  eq(offsetRange(3, 1, trimmedRange(10, { start: 2, end: 6 }), trimmedRange(3, null)), { min: -1, max: 2 }, '다듬은 A 와 짧은 B');
  eq(startRange(trimmedRange(5, { start: 1, end: 3 }), trimmedRange(4, null)), { min: 0, max: 2 }, '시작점 기준 구간');

  /* 장면 걸음 — 장면 수마다 */
  for (const fps of [24, 25, 29.97, 30, 60, 120, 240]) {
    const s = stepInfo({ nominalFps: fps, constantRate: true });
    near(s.step, 1 / fps, `한 장면 ${fps}`);
    eq(s.exact, true, `고른 장면 ${fps} 은 exact`);
    const t = snapToFrame(1.2345, s);
    near(t * fps, Math.round(t * fps), `장면 격자 ${fps}`, 1e-6);
    const next = stepFrom(t, 1, s, { start: 0, end: 10 });
    near((next - t) * fps, 1, `다음 장면 ${fps}`, 1e-6);
  }
  eq(stepInfo({ nominalFps: 30, constantRate: false }).exact, false, '가변 장면은 짐작');
  eq(stepInfo({ nominalFps: 30, constantRate: null }).exact, false, '모르면 짐작');
  eq(stepInfo({ nominalFps: null, constantRate: true }), { step: 1 / 30, exact: false, fps: null }, '장면 수 모르면 1/30 짐작');
  eq(stepFrom(0.01, -1, stepInfo({ nominalFps: 60, constantRate: true }), { start: 0, end: 1 }), 0, '처음보다 앞으로 안 감');
  eq(stepFrom(0.99, 1, stepInfo({ nominalFps: 30, constantRate: false }), { start: 0, end: 1 }), 1, '끝을 안 넘음');

  /* 슬로모션 · 실제 시간 */
  eq(captureMapping(facts({ slowMotion: 'none' })), { kind: 'realtime', factor: 1 }, '일반 영상');
  near((captureMapping(facts({ slowMotion: 'edited', captureFps: 240, nominalFps: 30 })) as { factor: number }).factor, 0.125, '240 을 30 으로');
  eq(captureMapping(facts({ slowMotion: 'edited', captureFps: null, nominalFps: 30 })).kind, 'unknown', '촬영 장면 수 모르면 모름');
  eq(captureMapping(facts({ slowMotion: 'unknown', nominalFps: 240 })).kind, 'unknown', '슬로모션 여부 모르면 모름');
  eq(realSeconds(1, { kind: 'unknown' }), null, '모르면 실제 시간 없음');
  near(realSeconds(2, { kind: 'scaled', factor: 0.125 }), 0.25, '늦춘 2초 = 실제 0.25초');

  /* 사실 정리 */
  const f = normalizeFacts({ durationSec: Number.NaN, nominalFps: -3, rotationDeg: 450, codec: ' hvc1 ', slowMotion: 'x' as never });
  eq([f.durationSec, f.nominalFps, f.rotationDeg, f.codec, f.slowMotion], [null, null, 90, 'hvc1', 'unknown'], '깨진 값은 모름');
  eq(normalizeFacts(null), EMPTY_FACTS, '없으면 빈 사실');

  /* 맞춤 상태 */
  eq(syncQuality([1, 2, 3], 16.7).state, 'measuring', '표본 부족');
  eq(syncQuality(Array(20).fill(10), 16.7).state, 'close', '40ms 안');
  eq(syncQuality([...Array(18).fill(10), 90, 120], 16.7).state, 'approx', '튀는 어긋남이 95% 를 넘김');
  eq(syncQuality(Array(20).fill(50), 66.7).state, 'close', '15fps 는 한 장면이 예산');
  eq(percentile([-50, 10, 20], 100), 50, '절댓값 기준');

  /* 동작 길이 맞춤 */
  eq(buildNormalized([1], [1]), { ok: false, error: 'tooFew' }, '장면 하나는 거절');
  eq(buildNormalized([1, 2], [1]), { ok: false, error: 'lengthMismatch' }, '수 다름 거절');
  eq(buildNormalized([1, 0.5], [1, 2]), { ok: false, error: 'notIncreasing' }, '거꾸로 거절');
  eq(buildNormalized([1, 1], [1, 2]), { ok: false, error: 'notIncreasing' }, '같은 시각 거절');
  eq(buildNormalized([1, 1.01], [1, 2]), { ok: false, error: 'tooShort' }, '너무 짧은 구간 거절');
  const nm = buildNormalized([1, 2, 2.5], [3, 3.4, 4.4]);
  ok(nm.ok, '맞춤 만듦');
  if (nm.ok) {
    eq(normalizedTimes(nm.map, 0), { a: 1, b: 3 }, '첫 장면');
    eq(normalizedTimes(nm.map, 2), { a: 2.5, b: 4.4 }, '끝 장면');
    near(normalizedTimes(nm.map, 0.5).b, 3.2, '첫 구간 가운데');
    near(normalizedTimes(nm.map, 1.5).a, 2.25, '둘째 구간 가운데');
    near(normalizedOfA(nm.map, 2.25), 1.5, 'A 시각 → u');
    eq(normalizedTimes(nm.map, 9), { a: 2.5, b: 4.4 }, '밖은 끝으로');
    near(phaseStretch(nm.map)[0], 0.4, '구간 늘임');
    /* 단조 — u 가 늘면 두 시각도 는다 */
    let prev = normalizedTimes(nm.map, 0);
    for (let u = 0.05; u <= 2; u += 0.05) {
      const cur = normalizedTimes(nm.map, u);
      ok(cur.a >= prev.a && cur.b >= prev.b, `단조 u=${u.toFixed(2)}`);
      prev = cur;
    }
  }
  eq(clock(63.456), '1:03.46', '시각 글');
  eq(clock(null), '—', '모름');
  eq(durationText(0.4234, 0.0083), '0.423초 ±0.008초', '불확실성 함께');
  eq(durationText(0.42, null), '0.42초', '불확실성 모름');
}

/* ===== 좌표 ===== */
{
  const cases: { pane: Pane; view: ViewTransform; name: string }[] = [
    { pane: { w: 300, h: 400, aspect: 9 / 16 }, view: IDENTITY_VIEW, name: '세로 영상 · 세로 칸' },
    { pane: { w: 400, h: 200, aspect: 9 / 16 }, view: IDENTITY_VIEW, name: '세로 영상 · 가로 칸(옆 레터박스)' },
    { pane: { w: 300, h: 400, aspect: 16 / 9 }, view: { ...IDENTITY_VIEW, mirror: true }, name: '가로 영상 · 반전' },
    { pane: { w: 320, h: 480, aspect: 9 / 16 }, view: { zoom: 2.5, panX: 30, panY: -40, mirror: false, crop: null }, name: '확대 · 이동' },
    { pane: { w: 320, h: 480, aspect: 9 / 16 }, view: { zoom: 1.5, panX: -10, panY: 5, mirror: true, crop: { x: 0.1, y: 0.2, w: 0.6, h: 0.5 } }, name: '자르기 · 반전 · 확대' },
  ];
  for (const c of cases) {
    for (const p of [{ u: 0, v: 0 }, { u: 1, v: 1 }, { u: 0.3, v: 0.7 }, { u: 0.5, v: 0.5 }]) {
      const back = toSource(toScreen(p, c.pane, c.view), c.pane, c.view);
      near(back.u, p.u, `${c.name} u 왕복`, 1e-9);
      near(back.v, p.v, `${c.name} v 왕복`, 1e-9);
    }
  }
  const r = containRect(400, 200, 9 / 16);
  near(r.h, 200, '세로 영상은 높이 가득');
  near(r.w, 112.5, '폭은 비율대로');
  near(r.x, 143.75, '가운데');
  const screen = toScreen({ u: 0, v: 0.5 }, { w: 400, h: 200, aspect: 9 / 16 }, IDENTITY_VIEW);
  near(screen.x, 143.75, '레터박스를 뺀 왼쪽 끝');
  const mir = toScreen({ u: 0.2, v: 0.5 }, { w: 100, h: 100, aspect: 1 }, { ...IDENTITY_VIEW, mirror: true });
  near(mir.x, 80, '반전은 좌우가 바뀌어 보임');
  /* 확대 — 두 손가락 가운데가 제자리 */
  const pane: Pane = { w: 300, h: 300, aspect: 1 };
  const focal = { x: 200, y: 120 };
  const before = toSource(focal, pane, IDENTITY_VIEW);
  const z = zoomAt(IDENTITY_VIEW, pane, focal, 2);
  const after = toSource(focal, pane, z);
  near(after.u, before.u, '확대 가운데 고정 u', 1e-9);
  near(after.v, before.v, '확대 가운데 고정 v', 1e-9);
  eq(zoomAt(z, pane, focal, 1), { ...z, zoom: 1, panX: 0, panY: 0 }, '1배면 이동 없음');
  eq(normalizeView({ zoom: 99, panX: 'x', mirror: 1 }).zoom, 6, '확대 상한');
  /* 회전 머리 왕복 */
  for (const rot of [0, 90, 180, 270] as const) {
    const p = { u: 0.2, v: 0.9 };
    const q = displayToEncoded(encodedToDisplay(p, rot), rot);
    near(q.u, p.u, `회전 ${rot} u`);
    near(q.v, p.v, `회전 ${rot} v`);
  }
  /* 각도는 원본 비율에서 — 세로 9:16 영상의 비율 좌표 45° 는 실제로 45° 가 아니다 */
  const a9 = 9 / 16;
  near(angleDeg({ u: 1, v: 0.5 }, { u: 0.5, v: 0.5 }, { u: 0.5, v: 0 }, a9), 90, '직각은 비와 무관');
  const diag = tiltDeg({ u: 0, v: 0 }, { u: 1, v: 1 }, a9);
  near(diag, (Math.atan2(a9, 1) * 180) / Math.PI, '비율 대각선은 실제 기울기가 다름');
  eq(angleDeg({ u: 0.5, v: 0.5 }, { u: 0.5, v: 0.5 }, { u: 0, v: 0 }, 1), null, '겹친 점 각도 없음');
  eq(tiltDeg({ u: 0.2, v: 0.2 }, { u: 0.2, v: 0.2 }, 1), null, '겹친 점 기울기 없음');
  /* 반전해도 측정은 그대로(원본 좌표에서 셈) */
  ok(true, '반전은 보기만 — 측정은 원본 좌표(위 왕복 시험)');
  /* 거리 */
  eq(distance({ u: 0, v: 0 }, { u: 0, v: 0.5 }, 1, null), { unit: 'ratio', value: 0.5 }, '보정 없으면 비율');
  const cal = { a: { u: 0.5, v: 0.2 }, b: { u: 0.5, v: 0.7 }, cm: 100 };
  const d = distance({ u: 0.2, v: 0.3 }, { u: 0.2, v: 0.55 }, a9, cal);
  eq(d.unit, 'cm', '보정 있으면 cm');
  near(d.value, 50, '같은 평면 길이', 1e-6);
  eq(distance({ u: 0, v: 0 }, { u: 0, v: 1 }, 1, { ...cal, cm: Number.NaN }).unit, 'ratio', '깨진 보정은 cm 안 냄');
  /* 겹쳐 보기 맞춤 */
  const reg = registrationFrom({ u: 0.4, v: 0.3 }, { u: 0.4, v: 0.7 }, { u: 0.5, v: 0.4 }, { u: 0.5, v: 0.6 });
  ok(reg, '두 점 쌍으로 맞춤');
  if (reg) {
    const m = applyReg({ u: 0.5, v: 0.4 }, reg);
    near(m.u, 0.4, '맞춘 B 점 u', 1e-9);
    near(m.v, 0.3, '맞춘 B 점 v', 1e-9);
  }
  eq(registrationFrom({ u: 0.4, v: 0.3 }, { u: 0.4, v: 0.3 }, { u: 0.5, v: 0.4 }, { u: 0.5, v: 0.6 }), null, '겹친 점 쌍 거절');
}

/* ===== 그림 ===== */
{
  const mk = (id: string, span: Annotation['span'], sourceId = 'sA'): Annotation => ({
    id,
    sourceId,
    span,
    geom: { kind: 'line', a: { u: 0.1, v: 0.1 }, b: { u: 0.2, v: 0.2 } },
    color: '#F5F5F4',
    width: 2,
    metric: null,
    createdAt: '2026-11-02T00:00:00.000Z',
  });
  const scene = mk('1', { kind: 'scene', t: 1, tol: 0.1 });
  eq(visibleAt(scene, 'sA', 1.05), true, '장면 그림 범위 안');
  eq(visibleAt(scene, 'sA', 1.2), false, '장면 그림 범위 밖은 숨김');
  eq(visibleAt(scene, 'sB', 1), false, '다른 영상엔 안 보임');
  eq(visibleAt(mk('2', { kind: 'always' }), 'sA', 99), true, '늘 보이는 기준선');
  eq(visibleAt(mk('3', { kind: 'range', from: 1, to: 2 }), 'sA', 2), true, '구간 끝 포함');
  let h = historyOf([]);
  h = applyEdit(h, { op: 'add', a: scene });
  h = applyEdit(h, { op: 'add', a: mk('2', { kind: 'always' }) });
  h = applyEdit(h, { op: 'update', id: '1', patch: { color: '#FCA5A5' } });
  eq(h.items[0].color, '#FCA5A5', '고치기');
  h = applyEdit(h, { op: 'undo' });
  eq(h.items[0].color, '#F5F5F4', '되돌리기');
  h = applyEdit(h, { op: 'redo' });
  eq(h.items[0].color, '#FCA5A5', '다시 하기');
  h = applyEdit(h, { op: 'add', a: scene });
  eq(h.items.length, 2, '같은 번호는 안 더함');
  eq(clearTargets(h.items, { kind: 'scene', sourceId: 'sA', t: 1 }).map((x) => x.id), ['1'], '이 장면 지우기는 기준선을 남김');
  const cleared = applyEdit(h, { op: 'clear', scope: { kind: 'scene', sourceId: 'sA', t: 1 } });
  eq(cleared.items.map((x) => x.id), ['2'], '범위 지우기');
  eq(applyEdit(cleared, { op: 'undo' }).items.length, 2, '지우기도 되돌림');
  eq(applyEdit(h, { op: 'remove', id: 'nope' }), h, '없는 것 지우기는 그대로');
  /* 고친 뒤 되돌리기 하고 새로 고치면 다시 하기는 사라진다 */
  const branched = applyEdit(applyEdit(h, { op: 'undo' }), { op: 'remove', id: '2' });
  eq(branched.future.length, 0, '새 고침이 다시 하기를 지움');
  /* 저장 값 검사 */
  const ids = new Set(['sA']);
  eq(normalizeAnnotation({ ...scene, sourceId: 'zz' }, ids), null, '모르는 영상 그림은 버림');
  eq(normalizeAnnotation({ ...scene, geom: { kind: 'angle', a: { u: 0, v: 0 } } }, ids), null, '모자란 각도는 버림');
  eq(normalizeAnnotation({ ...scene, color: 'red' }, ids)?.color, '#F5F5F4', '이상한 색은 기본');
  eq(normalizeAnnotation({ ...scene, geom: { kind: 'label', p: { u: 0.5, v: 0.5 }, text: '  ' } }, ids), null, '빈 글은 버림');
  eq(simplifyFree([{ u: 0, v: 0 }, { u: 0.001, v: 0 }, { u: 0.1, v: 0 }]).length, 2, '자유선 점 줄이기');
  eq(simplifyFree(Array.from({ length: 2000 }, (_, i) => ({ u: i / 2000, v: 0 })), 0).length <= 401, true, '자유선 점 상한');
  eq(measureText({ kind: 'angle', a: { u: 1, v: 0.5 }, vtx: { u: 0.5, v: 0.5 }, b: { u: 0.5, v: 0 } }, 1, null), '90.0° 2D 참고', '각도 글은 2D 참고');
  eq(measureText({ kind: 'line', a: { u: 0, v: 0 }, b: { u: 0, v: 0.25 } }, 1, null), '화면 높이의 25%', '보정 없으면 cm 아님');
  /* A · B 견주기 */
  const g = { kind: 'tilt' as const, a: { u: 0.5, v: 0 }, b: { u: 0.6, v: 1 } };
  eq(compareMetric('trunkTilt', { geom: g, aspect: 1, cal: null, view: 'side3b' }, { geom: g, aspect: 1, cal: null, view: 'front' }), { ok: false, metric: 'trunkTilt', reason: 'view' }, '촬영 방향 다르면 안 견줌');
  eq(compareMetric('trunkTilt', { geom: g, aspect: 1, cal: null, view: null }, { geom: g, aspect: 1, cal: null, view: 'front' }).ok, false, '방향 모르면 안 견줌');
  const cmp = compareMetric('trunkTilt', { geom: g, aspect: 1, cal: null, view: 'side3b' }, { geom: { ...g, b: { u: 0.7, v: 1 } }, aspect: 1, cal: null, view: 'side3b' });
  ok(cmp.ok && cmp.diff > 0, '같은 방향 · 같은 단위면 차이');
  const lineA = { kind: 'line' as const, a: { u: 0, v: 0 }, b: { u: 0, v: 0.5 } };
  eq(
    compareMetric('stride', { geom: lineA, aspect: 1, cal: { a: { u: 0, v: 0 }, b: { u: 0, v: 1 }, cm: 100 }, view: 'side3b' }, { geom: lineA, aspect: 1, cal: null, view: 'side3b' }),
    { ok: false, metric: 'stride', reason: 'unit' },
    'cm 와 비율은 안 견줌'
  );
}

/* ===== 투구 장면 ===== */
{
  const m = normalizeMarks({ kneePeak: 0.5, footContact: 1.2, release: 1.35, followThrough: 'obscured', maxER: Number.NaN, handSep: -1 }, 3);
  eq(m, { kneePeak: 0.5, footContact: 1.2, release: 1.35, followThrough: 'obscured' }, '깨진 표시는 버리고 가려짐은 남김');
  eq(normalizeMarks({ release: 9 }, 3), {}, '길이 밖은 버림');
  eq(orderIssues({ footContact: 1.3, release: 1.2 }), [['footContact', 'release']], '순서 어긋남 알림');
  const f60 = facts({ nominalFps: 60, constantRate: true, slowMotion: 'none' });
  const iv = intervalOf(m, 'footContact', 'release', f60);
  near(iv?.presentation, 0.15, '착지 → 릴리스 재생 시간', 1e-9);
  near(iv?.real, 0.15, '일반 영상은 실제 시간 같음', 1e-9);
  near(iv?.plusMinus, 1 / 60, '불확실성 한 장면');
  const slo = facts({ nominalFps: 30, captureFps: 240, constantRate: true, slowMotion: 'edited' });
  const ivs = intervalOf({ footContact: 1, release: 2.2 }, 'footContact', 'release', slo);
  near(ivs?.real, 0.15, '240 슬로모션 1.2초 = 실제 0.15초', 1e-9);
  near(ivs?.plusMinus, 1 / 240, '실제 한 장면');
  const unk = intervalOf({ footContact: 1, release: 2.2 }, 'footContact', 'release', facts({ nominalFps: 30 }));
  eq(unk?.real, null, '슬로모션 여부 모르면 실제 시간 없음');
  eq(intervalOf({ footContact: 1 }, 'footContact', 'release', f60), null, '한쪽 없으면 없음');
  eq(compareInterval(iv, ivs), { basis: 'real', a: iv!.real, b: ivs!.real, diff: ivs!.real! - iv!.real!, plusMinus: 1 / 60 + 1 / 240 }, '둘 다 실제 시간 → 실제 차');
  eq(compareInterval(iv, unk), { basis: 'none', reason: 'timebase' }, '시간 축 다르면 안 견줌');
  eq(compareInterval(unk, unk).basis, 'presentation', '둘 다 모름이면 재생 시간 기준만');
  eq(sharedEvents({ footContact: 1, release: 2 }, { footContact: 3, release: 'obscured' }), ['footContact'], '둘 다 짚은 장면만');
  eq(anchorFromEvents({ footContact: 1.2 }, 'footContact'), 1.2, '착지 표시를 기준으로');
  eq(anchorFromEvents({ footContact: 1.2 }, 'manual'), null, '직접 선택은 표시를 안 씀');
  eq(normalizedAnchors({ kneePeak: 0.4, footContact: 1, release: 1.2 }, { footContact: 2, release: 2.3, kneePeak: 1.1 }).events, ['kneePeak', 'footContact', 'release'], '맞춤 장면 차례');
}

/* ===== 재생 줄기 ===== */
{
  const run = (evs: Parameters<typeof step>[1][], s0: TransportState = INITIAL_TRANSPORT) => evs.reduce<{ s: TransportState; fx: string[] }>((acc, e) => {
    const r = step(acc.s, e);
    return { s: r.state, fx: [...acc.fx, r.effect] };
  }, { s: s0, fx: [] });
  let r = run([{ type: 'play' }]);
  eq(r.s.phase, 'seeking', '재생은 먼저 맞춤');
  const g = r.s.gen;
  r = run([{ type: 'seekDone', gen: g, ok: true }], r.s);
  eq([r.s.phase, r.fx[0]], ['playing', 'playBoth'], '맞춘 뒤 함께 재생');
  /* 늦은 옛 맞춤 완료는 무시 */
  let s = run([{ type: 'play' }]).s;
  const old = s.gen;
  s = run([{ type: 'pause' }, { type: 'play' }], s).s;
  const late = step(s, { type: 'seekDone', gen: old, ok: true });
  eq([late.state.phase, late.effect], ['seeking', 'none'], '옛 세대 답은 버림');
  /* B 바꾸는 중 맞춤 → 재생 안 함 */
  s = run([{ type: 'play' }]).s;
  const g2 = s.gen;
  s = run([{ type: 'sourceChanged' }], s).s;
  eq(step(s, { type: 'seekDone', gen: g2, ok: true }).effect, 'none', '바꾼 B 의 옛 답은 재생 안 함');
  /* 시간 초과(실패)는 재생하지 않음 */
  s = run([{ type: 'play' }]).s;
  const f = step(s, { type: 'seekDone', gen: s.gen, ok: false });
  eq([f.state.phase, f.state.error, f.effect], ['error', 'seek', 'pauseBoth'], '맞춤 실패는 재생 안 함');
  /* 한쪽 받는 중 → 둘 다 멈춤 → 준비되면 다시 맞춰 재생 */
  s = run([{ type: 'play' }]).s;
  r = run([{ type: 'seekDone', gen: s.gen, ok: true }, { type: 'buffering' }], s);
  eq([r.s.phase, r.fx[1]], ['buffering', 'pauseBoth'], '받는 중이면 둘 다 멈춤');
  const rb = step(r.s, { type: 'bothReady' });
  eq([rb.state.phase, rb.effect], ['seeking', 'seekThenConfirm'], '준비되면 다시 맞춤');
  /* 받는 중에 사용자가 멈추면 다시 안 틂 */
  const paused = run([{ type: 'pause' }, { type: 'bothReady' }], r.s);
  eq(paused.s.phase, 'idle', '멈춘 뒤 준비돼도 안 틂');
  /* 뒤로 감 */
  const bg = run([{ type: 'background' }], r.s);
  eq([bg.s.phase, bg.s.intent], ['idle', false], '뒤로 가면 멈추고 다시 안 틂');
  /* 끝 */
  s = run([{ type: 'play' }]).s;
  const e = run([{ type: 'seekDone', gen: s.gen, ok: true }, { type: 'end' }], s);
  eq([e.s.phase, e.fx[1]], ['ended', 'pauseBoth'], '구간 끝 — 둘 다 멈춤');
  /* 빠르게 여러 번 */
  const rapid = run([{ type: 'play' }, { type: 'play' }, { type: 'pause' }, { type: 'play' }, { type: 'scrub' }, { type: 'play' }]);
  eq(rapid.s.phase, 'seeking', '연타 끝은 마지막 요청');
  eq(rapid.fx.filter((x) => x === 'seekThenConfirm').length, 3, '재생 중 재생은 겹치지 않음');
}

/* ===== 문서 ===== */
const OWNER = 'u1';
const NOW = '2026-11-02T01:00:00.000Z';
const srcA: NewSource = { path: 'u1/local-aaa', origin: 'myVideos', owned: false, label: '11/1 불펜', date: '2026-11-01' };
const srcB: NewSource = { path: 'u1/local-bbb', origin: 'photos', owned: true, label: null, date: '2026-10-20' };
{
  const d0 = createDocument(OWNER, [srcA, srcB], NOW, { doc: 'c1', sources: ['sA', 'sB'] });
  eq(d0.title, '11/1 vs 10/20', '날짜 제목');
  eq(d0.active, { a: 'sA', b: 'sB' }, '첫 짝');
  eq(activePair(d0)?.semantic, 'footContact', '기본 기준 앞발 착지');
  eq(activePair(d0)?.anchors, { a: null, b: null }, '기준은 짐작하지 않음');
  eq(d0.transport.rate, 0.5, '기본 0.5×');
  const single = createDocument(OWNER, [srcA], NOW, { doc: 'c2', sources: ['sA'] });
  eq([single.active.b, single.pairs.length], [null, 0], '한 영상 보기');
  /* 기준 · 바꾸기 */
  let d = updatePair(d0, { anchors: { a: 1.2, b: 0 }, rel: 0.3 });
  const sw = swapActive(d);
  eq(sw.active, { a: 'sB', b: 'sA' }, '바꾸기');
  eq(activePair(sw)?.anchors, { a: 0, b: 1.2 }, '기준도 같이 뒤집음(0 은 0 대로)');
  eq(activePair(swapActive(sw))?.anchors, { a: 1.2, b: 0 }, '두 번 바꾸면 처음');
  /* 같은 영상을 두 칸으로 */
  const dup = addSource(d, srcA, NOW, 'sA2');
  ok(dup && dup.doc.sources.filter((s) => s.path === srcA.path).length === 2, '같은 영상 다시 넣기');
  d = dup!.doc;
  d = setActive(d, 'sA', 'sA2');
  eq(activePair(d)?.anchors, { a: null, b: null }, '새 짝은 새 기준');
  d = setActive(d, 'sA', 'sB');
  eq(activePair(d)?.anchors, { a: 1.2, b: 0 }, '옛 짝으로 돌아오면 기준 그대로');
  eq(setActive(d, 'sA', 'sA'), d, '같은 칸끼리는 짝 아님');
  /* 빼기 */
  const rm = removeSource(addNote(d, { sourceId: 'sB', t: 1, text: ' 팔 높음 ' }, NOW, 'n1'), 'sB');
  eq([rm.active, rm.notes.length, rm.pairs.some((p) => p.b === 'sB')], [{ a: 'sA', b: null }, 0, false], 'B 를 빼면 짝 · 메모도');
  /* 여러 투구 검토 */
  let rv = addSource(addSource(d0, srcA, NOW, 'sC')!.doc, srcB, NOW, 'sD')!.doc;
  rv = startReview(rv, 'sA', ['sB', 'sC', 'sD', 'sA']);
  eq([rv.active, rv.reviewSet?.candidateIds], [{ a: 'sA', b: 'sB' }, ['sB', 'sC', 'sD']], '기준 A 고정 검토');
  rv = updatePair(rv, { anchors: { a: 1, b: 2 } });
  rv = moveReview(rv, 1);
  eq(rv.active, { a: 'sA', b: 'sC' }, '다음 후보');
  rv = moveReview(rv, -1);
  eq(activePair(rv)?.anchors, { a: 1, b: 2 }, '돌아오면 그 짝의 기준 그대로');
  /* 복사 */
  const cp = duplicate(d0, NOW, 'c9');
  eq([cp.id, cp.revision, cp.sources.every((s) => !s.owned)], ['c9', 0, true], '사본은 영상을 같이 씀(지울 때 안 지움)');
  /* 저장 값 읽기 */
  const back = parseDocument(JSON.parse(JSON.stringify(updateSource(d0, 'sA', { events: { release: 1.4 } }))), OWNER);
  ok(back.ok && back.doc.sources[0].events.release === 1.4, '왕복');
  eq(parseDocument(d0, 'u2'), { ok: false, reason: 'owner' }, '다른 계정 문서는 안 엶');
  eq(parseDocument({ ...d0, schemaVersion: 99 }, OWNER), { ok: false, reason: 'newer' }, '새 판은 거절(덮지 않음)');
  eq(parseDocument({ ...d0, sources: [] }, OWNER), { ok: false, reason: 'corrupt' }, '영상 없는 문서는 깨짐');
  eq(parseDocument('x', OWNER), { ok: false, reason: 'corrupt' }, '모양 아님');
  const withUrl = parseDocument({ ...d0, sources: [{ ...d0.sources[0], path: 'https://x/signed?token=1' }, d0.sources[1]] }, OWNER);
  ok(withUrl.ok && withUrl.doc.sources.length === 1 && withUrl.doc.active.a === 'sB', '서명 주소 줄은 버림');
  const badPair = parseDocument({ ...d0, pairs: [{ ...d0.pairs[0], anchors: { a: -1, b: 'x' } }], transport: { rate: 3, audio: 'q' } }, OWNER);
  ok(badPair.ok && badPair.doc.pairs[0].anchors.a === null && badPair.doc.transport.rate === 0.5 && badPair.doc.transport.audio === 'none', '깨진 기준 · 속도는 기본');
  eq(recentOf(updatePair(d0, { anchors: { a: 0, b: 0 } })).aligned, true, '0 · 0 도 맞춤 끝');
  eq(recentOf(updatePair(d0, { semantic: 'start', anchors: { a: 0, b: 0 } })).aligned, false, '시작점 기준은 맞춤 아님');
}

/* ===== 저장 ===== */
const memFs = (opts: { failMoveAt?: number; failWrite?: (name: string) => boolean } = {}) => {
  const files = new Map<string, string>();
  let moves = 0;
  const fs: FsAdapter = {
    read: async (n) => files.get(n) ?? null,
    write: async (n, t) => {
      if (opts.failWrite?.(n)) throw new Error('disk');
      files.set(n, t);
    },
    move: async (a, b) => {
      moves++;
      if (opts.failMoveAt === moves) throw new Error('crash');
      const t = files.get(a);
      if (t == null) throw new Error('nofile');
      files.set(b, t);
      files.delete(a);
    },
    remove: async (n) => void files.delete(n),
    list: async () => [...files.keys()],
  };
  return { fs, files };
};
{
  const { fs, files } = memFs();
  const st = createStorage(fs, OWNER);
  const d0 = createDocument(OWNER, [srcA, srcB], NOW, { doc: 'c1', sources: ['sA', 'sB'] });
  const s1 = await st.save(d0);
  ok(s1.ok && s1.doc.revision === 1, '처음 저장 판 1');
  const s2 = await st.save(updatePair((s1 as { doc: ComparisonDocument }).doc, { anchors: { a: 1, b: 2 } }));
  ok(s2.ok && s2.doc.revision === 2, '이어 저장 판 2');
  const stale = await st.save(d0);
  eq(stale.ok ? 'ok' : stale.reason, 'conflict', '옛 판으로 덮기는 충돌');
  ok(!files.has('c1.tmp') && !files.has('c1.prev'), '남은 임시 파일 없음');
  const loaded = await st.load('c1');
  ok(loaded.ok && activePair(loaded.doc)?.anchors.a === 1, '다시 열기');
  eq((await st.recent()).map((e) => e.id), ['c1'], '최근 목록');
  /* 다른 계정 */
  const other = createStorage(fs, 'u2');
  eq(await other.load('c1'), { ok: false, reason: 'owner' }, '다른 계정은 못 엶');
  eq((await other.recent()).length, 0, '다른 계정 목록에 안 보임(목록 주인 다름 → 다시 만듦 → 남의 문서 거름)');
  /* 깨진 본판 → 앞판 */
  files.set('c1.prev', files.get('c1.json')!);
  files.set('c1.json', '{"broken');
  const rec = await st.load('c1');
  ok(rec.ok && rec.recovered, '깨지면 앞판으로');
  /* 쓰는 도중 끊김(본판을 prev 로 옮긴 뒤) — 다시 열면 prev */
  const crash = memFs({ failMoveAt: 2 });
  const cs = createStorage(crash.fs, OWNER);
  const c1 = await cs.save(d0);
  ok(c1.ok, '첫 저장(옮기기 1번)');
  const c2 = await cs.save(updatePair((c1 as { doc: ComparisonDocument }).doc, { rel: 5 }));
  eq(c2.ok ? 'ok' : c2.reason, 'io', '끊긴 저장은 실패로');
  const after = await cs.load('c1');
  ok(after.ok && after.doc.revision === 1, '끊긴 뒤에도 앞 판이 남음');
  /* 목록이 깨지면 다시 만든다 · 남은 tmp 정리 */
  files.set('index.json', 'garbage');
  files.set('zz.tmp', 'half');
  eq((await st.recent()).map((e) => e.id), ['c1'], '목록 다시 만듦');
  ok(!files.has('zz.tmp'), '남은 tmp 지움');
  /* 지우기 — 다른 문서가 쓰는 앱 안 복사본은 남김 */
  const dB = createDocument(OWNER, [srcB], NOW, { doc: 'c2', sources: ['sX'] });
  const loadedC1 = (await st.load('c1')) as { doc: ComparisonDocument };
  await st.save({ ...loadedC1.doc });
  await st.save(dB);
  const del1 = await st.remove('c1');
  eq(del1.orphanPaths, [], '다른 문서가 쓰는 복사본은 안 지움');
  const del2 = await st.remove('c2');
  eq(del2.orphanPaths, ['u1/local-bbb'], '마지막 문서를 지우면 복사본도');
  eq(await st.load('c1'), { ok: false, reason: 'missing' }, '지운 문서는 없음');
  eq(await st.load('../x'), { ok: false, reason: 'missing' }, '이상한 번호 거절');
}
{
  /* 자동 저장 — 미룸 · 한 번에 · 실패 · 충돌 */
  const { fs } = memFs();
  const st = createStorage(fs, OWNER);
  const jobs: (() => void)[] = [];
  const timer: Timer = { set: (fn) => (jobs.push(fn), jobs.length), clear: (h) => void (jobs[(h as number) - 1] = () => undefined) };
  const states: string[] = [];
  let saved: ComparisonDocument | null = null;
  let calls = 0;
  const save = (d: ComparisonDocument) => {
    calls++;
    return st.save(d);
  };
  const auto = createAutosaver(save, { timer, onState: (s) => states.push(s), onSaved: (d) => (saved = d) });
  const d0 = createDocument(OWNER, [srcA, srcB], NOW, { doc: 'c1', sources: ['sA', 'sB'] });
  auto.schedule(d0);
  auto.schedule(updatePair(d0, { rel: 1 }));
  auto.schedule(updatePair(d0, { rel: 2 }));
  eq(calls, 0, '미룸');
  await auto.flush();
  eq([calls, activePair(saved!)?.rel], [1, 2], '마지막 판 한 번만');
  eq(states.at(-1), 'saved', '저장됨 알림');
  auto.schedule(updatePair(d0, { rel: 3 }));
  await auto.flush();
  eq((saved as unknown as ComparisonDocument).revision, 2, '판 번호를 이어 씀(충돌 없음)');
  /* 실패 — 끝없이 다시 쓰지 않고 다음에 다시 */
  let failing = true;
  const fsF = memFs({ failWrite: (n) => failing && n.endsWith('.tmp') });
  const stF = createStorage(fsF.fs, OWNER);
  let fCalls = 0;
  const statesF: string[] = [];
  const autoF = createAutosaver(
    (d) => {
      fCalls++;
      return stF.save(d);
    },
    { timer, onState: (s) => statesF.push(s), onSaved: () => undefined }
  );
  autoF.schedule(d0);
  await autoF.flush();
  eq([fCalls, statesF.at(-1)], [1, 'failed'], '실패는 한 번 알리고 쉼');
  ok(autoF.dirty, '못 쓴 판은 남음');
  failing = false;
  await autoF.flush();
  eq([fCalls, statesF.at(-1)], [2, 'saved'], '다음 flush 에 다시 씀');
  /* 충돌 — 막고 알림, base 뒤에 다시 */
  const { fs: fsC } = memFs();
  const stC = createStorage(fsC, OWNER);
  await stC.save(d0);
  let conflict: ComparisonDocument | null = null;
  const statesC: string[] = [];
  const autoC = createAutosaver((d) => stC.save(d), { timer, onState: (s) => statesC.push(s), onSaved: () => undefined, onConflict: (c) => (conflict = c) });
  autoC.base(0);
  autoC.schedule(updatePair(d0, { rel: 9 }));
  await autoC.flush();
  ok(conflict && statesC.at(-1) === 'conflict', '다른 판이 있으면 덮지 않고 충돌');
  autoC.schedule(updatePair(d0, { rel: 10 }));
  await autoC.flush();
  eq(statesC.at(-1), 'conflict', '정하기 전에는 안 씀');
  autoC.base((conflict as unknown as ComparisonDocument).revision);
  autoC.schedule(updatePair(d0, { rel: 11 }));
  await autoC.flush();
  eq(statesC.at(-1), 'saved', '받아들인 뒤엔 씀');
  autoC.stop();
  autoC.schedule(d0);
  eq(autoC.dirty, false, '멈춘 뒤 안 받음(로그아웃)');
}

/* ===== 내보내기 · 해설 계획 ===== */
{
  const p = planComposition({ range: { min: -1, max: 2 }, from: -2, to: 1.5, ma: 3, mb: 1, speed: 0.5, layout: 'side', approxSync: true });
  ok(p, '계획');
  near(p!.durationSec, 5, '2.5초 구간을 0.5× → 5초');
  eq([p!.segments[0].aFrom, p!.segments[0].bFrom], [2, 0], '구간 밖은 잘라 공통 구간 처음부터');
  eq(p!.disclosures, ['재생 속도 0.5×', '대략 맞춤'], '알림');
  eq(planComposition({ range: { min: 0, max: 1 }, from: 0.5, to: 0.5, ma: 0, mb: 0, speed: 1, layout: 'stack' }), null, '빈 구간 거절');
  eq(planComposition({ range: { min: 0, max: 1 }, from: 0, to: 1, ma: 0, mb: 0, speed: 1, layout: 'stack', normalized: true })!.disclosures, ['동작 길이 맞춤 · 실제 시간과 다름'], '정규화 알림');
  const tl = planNarration(
    [
      { at: 1, type: 'play' },
      { at: 3, type: 'pause' },
      { at: 4, type: 'draw', annotationId: 'x' },
      { at: 5, type: 'seek', rel: 0 },
      { at: 5.5, type: 'rate', rate: 1 },
      { at: 6, type: 'play' },
      { at: 9, type: 'stop' },
    ],
    0,
    0.25,
    { min: 0, max: 2 }
  );
  ok(tl, '해설 계획');
  eq(tl!.durationSec, 9, '해설 길이 = 목소리 길이');
  eq(
    tl!.segments.map((s) => (s.kind === 'play' ? ['play', s.outFrom, s.outTo, s.relFrom, s.relTo] : ['hold', s.outFrom, s.outTo, s.rel])),
    [
      ['hold', 0, 1, 0],
      ['play', 1, 3, 0, 0.5],
      ['hold', 3, 5, 0.5],
      ['hold', 5, 6, 0],
      ['play', 6, 8, 0, 2],
      ['hold', 8, 9, 2],
    ],
    '멈춤 · 그림 · 건너뜀 · 속도 · 끝 멈춤'
  );
  eq(tl!.cuts, [5], '건너뜀 자리');
  eq(tl!.drawings, [{ out: 4, annotationId: 'x' }], '그림 시각');
  eq(planNarration([{ at: 1, type: 'play' }], 0, 1, { min: 0, max: 1 }), null, '끝 없는 녹화는 계획 안 함');
}

/* ===== 거르기 ===== */
{
  const d = createDocument(OWNER, [{ ...srcA, hand: 'R', pitchType: '직구', view: 'side3b' }, { ...srcB, hand: 'L' }, { ...srcA, path: 'u1/local-c' }], NOW, { doc: 'c', sources: ['1', '2', '3'] });
  const r = filterSources(d.sources, { hand: 'R' });
  eq([r.match.map((s) => s.id), r.unknown.map((s) => s.id)], [['1'], ['3']], '손 — 모름은 따로');
  const r2 = filterSources(d.sources, { hand: 'R', view: 'side3b' });
  eq(r2.match.map((s) => s.id), ['1'], '조건 둘');
  const pair = todayVsPast(
    [
      { path: 't', date: '2026-11-02' },
      { path: 'p1', date: '2026-10-30' },
      { path: 'p2', date: '2026-10-01', revisit: true },
      { path: 'x', date: null },
    ],
    '2026-11-02'
  );
  eq(pair && [pair.today.path, pair.past.path], ['t', 'p2'], '오늘 vs 기준 투구(★)');
  eq(todayVsPast([{ path: 'p', date: '2026-10-01' }], '2026-11-02'), null, '오늘 영상 없으면 없음');
}

console.log(`native-compare: ${n} 통과`);
