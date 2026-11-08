/**
 * 몰입 비교(IM01~IM12) 시험 — native/src/compare/immersive/* 의 순수 계산과 문서(doc.ts) 저장 호환.
 * 화면(workbench · pane)에 이은 뒤의 화면 쪽 시험은 native-compare-regress-ui.mts(UI03 · UI10 · IM04 · IM06).
 * 실제 렌더 · 영상 합성 · 터치 · 상태 막대 · 노치는 보지 않는다(기기 확인 필요).
 * 실행: node --import ./scripts/native-test-register.mjs scripts/native-compare-immersive-selftest.mts
 */
import * as geo from '~/compare/geometry';
import * as ws from '~/compare/workspace-layout';
import * as im from '~/compare/immersive/geometry';
import * as pres from '~/compare/immersive/presentation';
import * as vis from '~/compare/immersive/visibility';
import * as pal from '~/compare/immersive/palette';
import { PALETTES, PALETTES_HIGH_CONTRAST } from '~/lib/design-tokens';
import * as doc from '~/compare/doc';
import * as timing from '~/compare/timing';

let pass = 0;
const fails: string[] = [];
function check(name: string, fn: () => void) {
  try {
    fn();
    pass++;
  } catch (e) {
    fails.push(`${name}: ${(e as Error).message}`);
  }
}
const assert = (v: unknown, m: string) => {
  if (!v) throw new Error(m);
};
const near = (a: number, b: number, m: string, eps = 1e-6) => assert(Math.abs(a - b) <= eps, `${m}: ${a} ≠ ${b}`);

/* 같은 씨앗이면 같은 수 — 실패를 되풀이할 수 있게 */
let seed = 20261103;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const ASPECTS = [9 / 16, 16 / 9, 4 / 3, 3 / 4, 1];
const PHONES: [number, number][] = [
  [320, 568],
  [375, 667],
  [390, 844],
  [430, 932],
];
const VIEWPORTS: [number, number][] = [...PHONES, ...PHONES.map(([w, h]) => [h, w] as [number, number]), [820, 1180], [1180, 820], [507, 1180], [694, 1024]];
const randView = (): geo.ViewTransform => {
  const zoom = 1 + rnd() * 3;
  const lim = (zoom - 1) / 2;
  const crop = rnd() < 0.3 ? { x: rnd() * 0.3, y: rnd() * 0.3, w: 0.4 + rnd() * 0.3, h: 0.4 + rnd() * 0.3 } : null;
  return { zoom, panX: (rnd() * 2 - 1) * lim, panY: (rnd() * 2 - 1) * lim, mirror: rnd() < 0.5, crop };
};

/* ---- IM05 하나의 변환 길 ---- */

check('IM05 전체 + 가운데 맞춤은 기존 geometry.toScreen/toSource 와 같은 값', () => {
  for (let i = 0; i < 400; i++) {
    const pane = { w: 100 + rnd() * 500, h: 100 + rnd() * 700, aspect: ASPECTS[i % ASPECTS.length] };
    const view = randView();
    const m = im.layerMap(pane, pane.aspect, view, 'full', 'center');
    const p = { u: rnd(), v: rnd() };
    const a = geo.toScreen(p, pane, view);
    const b = im.mapToScreen(p, m);
    near(a.x, b.x, `x ${i}`, 1e-6);
    near(a.y, b.y, `y ${i}`, 1e-6);
    const s = { x: rnd() * pane.w, y: rnd() * pane.h };
    const q1 = geo.toSource(s, pane, view);
    const q2 = im.mapToSource(s, m);
    near(q1.u, q2.u, `u ${i}`, 1e-9);
    near(q1.v, q2.v, `v ${i}`, 1e-9);
  }
});

check('IM05 원본 → 화면 → 원본 왕복 오차(채움 · 전체 · 위/가운데 · 반전 · 확대 · 이동 · crop)', () => {
  let worst = 0;
  for (let i = 0; i < 2000; i++) {
    const slot = { w: 80 + rnd() * 900, h: 80 + rnd() * 900 };
    const view = randView();
    const mode: im.DisplayMode = rnd() < 0.5 ? 'fill' : 'full';
    const m = im.layerMap(slot, ASPECTS[i % ASPECTS.length], view, mode, rnd() < 0.5 ? 'top' : 'center');
    const p = { u: rnd(), v: rnd() };
    const q = im.mapToSource(im.mapToScreen(p, m), m);
    worst = Math.max(worst, Math.abs(q.u - p.u), Math.abs(q.v - p.v));
  }
  assert(worst < 1e-9, `왕복 최대 오차 ${worst}`);
});

check('IM03 찌그러짐 없음 — 원본 한 단위의 가로 · 세로 px 비가 원본 비율과 같다(채움 · 전체 · 겹침 위 영상)', () => {
  for (let i = 0; i < 300; i++) {
    const a = ASPECTS[i % ASPECTS.length];
    const slot = { w: 100 + rnd() * 600, h: 100 + rnd() * 600 };
    for (const mode of ['fill', 'full'] as const) {
      const m = im.layerMap(slot, a, { ...geo.IDENTITY_VIEW, zoom: 1 + rnd() }, mode);
      near(m.w / m.h, a, `비 ${mode}`, 1e-9);
    }
    const b = ASPECTS[(i + 2) % ASPECTS.length];
    const t = im.overlayTopMap(slot, { aspect: a, view: geo.IDENTITY_VIEW }, { aspect: b, mirror: false }, { dx: 0.1, dy: -0.05, scale: 1.3 }, 'fill');
    near(t.w / t.h, b, '겹침 위 영상 비', 1e-9);
  }
});

check('IM03 채움은 칸을 다 덮고 전체는 칸 안 · 위에 붙는다', () => {
  for (let i = 0; i < 300; i++) {
    const slot = { w: 60 + rnd() * 900, h: 60 + rnd() * 900 };
    const a = ASPECTS[i % ASPECTS.length];
    const f = im.imageRect(slot, a, 'fill');
    assert(f.x <= 1e-9 && f.y <= 1e-9 && f.x + f.w >= slot.w - 1e-9 && f.y + f.h >= slot.h - 1e-9, `채움이 칸을 다 덮지 않음 ${i}`);
    const c = im.imageRect(slot, a, 'full');
    assert(c.x >= -1e-9 && c.x + c.w <= slot.w + 1e-9 && c.h <= slot.h + 1e-9, `전체가 칸 밖 ${i}`);
    near(c.y, 0, '전체는 위에 붙음');
    /* 한 변은 칸에 꼭 맞는다(남는 띠는 비율 때문인 만큼만) */
    assert(Math.abs(c.w - slot.w) < 1e-6 || Math.abs(c.h - slot.h) < 1e-6, `전체가 한 변도 안 맞음 ${i}`);
  }
});

check('IM03 전체 보기에서는 원본 네 모서리가 모두 칸 안(손 · 공 · 머리 · 발을 볼 수 있다)', () => {
  for (const [w, h] of VIEWPORTS)
    for (const a of ASPECTS) {
      const m = im.layerMap({ w, h }, a, geo.IDENTITY_VIEW, 'full');
      for (const p of [
        { u: 0, v: 0 },
        { u: 1, v: 0 },
        { u: 0, v: 1 },
        { u: 1, v: 1 },
      ]) {
        const s = im.mapToScreen(p, m);
        assert(s.x >= -1e-6 && s.x <= w + 1e-6 && s.y >= -1e-6 && s.y <= h + 1e-6, `${w}×${h} ${a} 모서리 밖`);
      }
    }
});

check('IM03 채움 잘림 표시 — 비율이 같으면 잘림 없음, 다르면 일부 잘림', () => {
  assert(!im.isCropped(im.shownFraction({ w: 180, h: 320 }, 9 / 16, 'fill')), '같은 비율인데 잘림');
  const f = im.shownFraction({ w: 390, h: 285 }, 9 / 16, 'fill');
  assert(im.isCropped(f) && f.u === 1 && f.v < 0.5, `세로 영상을 가로 칸에 채우면 위아래가 잘림 ${JSON.stringify(f)}`);
  assert(!im.isCropped(im.shownFraction({ w: 390, h: 285 }, 9 / 16, 'full')), '전체는 잘림 없음');
});

check('IM03 확대 · 이동 뒤 보이는 원본 범위가 원본 안(visibleSource)', () => {
  for (let i = 0; i < 200; i++) {
    const slot = { w: 200 + rnd() * 400, h: 200 + rnd() * 400 };
    const m = im.layerMap(slot, ASPECTS[i % ASPECTS.length], randView(), rnd() < 0.5 ? 'fill' : 'full');
    const v = im.visibleSource(slot, m);
    assert(v.x >= 0 && v.y >= 0 && v.x + v.w <= 1 + 1e-9 && v.y + v.h <= 1 + 1e-9, `범위 밖 ${JSON.stringify(v)}`);
  }
});

/* ---- IM04 · IM05 겹침 ---- */

check('IM05 겹침 위 영상 — 비율 · 반전이 같으면 예전 applyReg 와 같은 자리(저장된 맞춤 값 뜻 유지)', () => {
  for (let i = 0; i < 400; i++) {
    const a = ASPECTS[i % ASPECTS.length];
    const slot = { w: 150 + rnd() * 500, h: 150 + rnd() * 700 };
    const view = { ...randView(), crop: null };
    const reg = geo.normalizeReg({ dx: rnd() * 0.6 - 0.3, dy: rnd() * 0.6 - 0.3, scale: 0.6 + rnd() * 1.2 });
    const mode: im.DisplayMode = rnd() < 0.5 ? 'fill' : 'full';
    const A = im.layerMap(slot, a, view, mode);
    const T = im.overlayTopMap(slot, { aspect: a, view }, { aspect: a, mirror: view.mirror }, reg, mode);
    const p = { u: rnd(), v: rnd() };
    const viaReg = im.mapToScreen(geo.applyReg(p, reg), A);
    const viaTop = im.mapToScreen(p, T);
    near(viaReg.x, viaTop.x, `x ${i}`, 1e-6);
    near(viaReg.y, viaTop.y, `y ${i}`, 1e-6);
  }
});

check('IM04 맞춤 초기화(IDENTITY_REG)면 같은 비율 위 영상이 아래 영상과 정확히 겹친다', () => {
  const slot = { w: 390, h: 571 };
  const A = im.layerMap(slot, 9 / 16, geo.IDENTITY_VIEW, 'fill');
  const T = im.overlayTopMap(slot, { aspect: 9 / 16, view: geo.IDENTITY_VIEW }, { aspect: 9 / 16, mirror: false }, geo.IDENTITY_REG, 'fill');
  near(A.x, T.x, 'x');
  near(A.y, T.y, 'y');
  near(A.w, T.w, 'w');
  near(A.h, T.h, 'h');
});

check('IM04 위 영상의 공간 맞춤은 시간과 따로 — 맞춤을 바꿔도 아래 영상 변환은 그대로', () => {
  const slot = { w: 390, h: 571 };
  const base = im.layerMap(slot, 9 / 16, geo.IDENTITY_VIEW, 'fill');
  const t1 = im.overlayTopMap(slot, { aspect: 9 / 16, view: geo.IDENTITY_VIEW }, { aspect: 16 / 9, mirror: false }, { dx: 0.2, dy: 0, scale: 1.5 }, 'fill');
  const again = im.layerMap(slot, 9 / 16, geo.IDENTITY_VIEW, 'fill');
  assert(JSON.stringify(base) === JSON.stringify(again), '아래 영상이 바뀜');
  assert(t1.w > 0, '위 영상 없음');
});

/* ---- IM02 · IM03 배치 ---- */

check('IM02 배치 전후 — 390×571 무대, 세로 9:16 두 영상(순수 계산, 기기 측정 아님)', () => {
  const old = ws.planStage({ w: 390, h: 571, aspectA: 9 / 16, aspectB: 9 / 16, hasB: true, mode: 'pair', pref: 'auto' });
  assert(old.panes.a && Math.round(old.panes.a.y) === 235, `예전 계산은 위 235pt 빈자리 — 지금 ${old.panes.a?.y}`);
  const neu = im.planImmersive({ stage: { w: 390, h: 571 }, view: 'pair', hasB: true, aspectA: 9 / 16, aspectB: 9 / 16, mode: 'fill', pref: 'auto' });
  assert(neu.shape === 'side', `새 자동 배치는 나란히 — ${neu.shape}`);
  near(neu.topGap, 0, '채움 위 빈자리', 1e-9);
  assert(neu.slotCoverage > 0.995, `칸이 무대를 덮음 ${neu.slotCoverage}`);
  assert(neu.cropped.a && neu.cropped.b, '나란히 채움은 일부 잘림(좌우)');
  const full = im.planImmersive({ stage: { w: 390, h: 571 }, view: 'pair', hasB: true, aspectA: 9 / 16, aspectB: 9 / 16, mode: 'full', pref: 'auto' });
  near(full.topGap, 0, '전체도 위에 붙음', 1e-9);
});

check('IM03 모든 화면 크기 · 비율 · 보기에서 채움 위 빈자리 0~2pt, 칸이 무대를 빈틈없이 덮음', () => {
  const views: im.StageView[] = ['pair', 'overlay', 'single', 'focusA', 'focusB'];
  for (const [w, h] of VIEWPORTS)
    for (const aA of ASPECTS)
      for (const aB of [...ASPECTS, null])
        for (const view of views)
          for (const pref of ['auto', 'stack', 'side'] as const) {
            const stageH = Math.max(0, h - 230);
            const p = im.planImmersive({ stage: { w, h: stageH }, view, hasB: true, aspectA: aA, aspectB: aB, mode: 'fill', pref });
            assert(p.topGap <= 2, `${w}×${h} ${view} ${pref} 위 빈자리 ${p.topGap}`);
            const sep = p.view === 'pair' ? (p.shape === 'stack' ? w : stageH) * im.SPLIT_SEPARATOR : 0;
            near(p.slotCoverage * w * stageH + sep, w * stageH, `${w}×${h} ${view} 덮음`, 1e-6);
          }
});

check('IM03 두 칸은 겹치지 않고 무대 안 · 정수 이음새', () => {
  for (const [w, h] of VIEWPORTS)
    for (const shape of ['stack', 'side'] as const) {
      const s = im.splitSlots({ w, h }, shape);
      if (shape === 'stack') assert(s.a.y + s.a.h <= s.b.y && s.b.y + s.b.h === h, `${w}×${h} 위아래`);
      else assert(s.a.x + s.a.w <= s.b.x && s.b.x + s.b.w === w, `${w}×${h} 나란히`);
      assert(Number.isInteger(s.a.h) && Number.isInteger(s.a.w), '정수 아님');
    }
});

check('IM03 사람이 고른 방향은 그대로, 자동은 흔들림에 안 뒤집힘', () => {
  assert(im.chooseSplit({ stage: { w: 390, h: 571 }, aspectA: 9 / 16, aspectB: 9 / 16, mode: 'fill', pref: 'stack' }) === 'stack', '고른 방향');
  /* 거의 같은 두 후보 — 지난번 것을 지킨다 */
  const sq = { w: 600, h: 600 };
  const a = im.chooseSplit({ stage: sq, aspectA: 1, aspectB: 1, mode: 'fill', pref: 'auto', prev: 'stack' });
  const b = im.chooseSplit({ stage: sq, aspectA: 1, aspectB: 1, mode: 'fill', pref: 'auto', prev: 'side' });
  assert(a === 'stack' && b === 'side', `흔들림 ${a} ${b}`);
  /* 가로 영상 둘은 위아래가 낫다 */
  assert(im.chooseSplit({ stage: { w: 390, h: 571 }, aspectA: 16 / 9, aspectB: 16 / 9, mode: 'fill', pref: 'auto' }) === 'stack', '가로 영상 둘');
});

check('IM03 비율을 모르는 영상(불러오는 중 · 실패)도 배치가 무너지지 않음', () => {
  for (const bad of [null, undefined, 0, NaN, -1, Infinity, 50]) {
    const p = im.planImmersive({ stage: { w: 390, h: 600 }, view: 'pair', hasB: true, aspectA: bad as number, aspectB: bad as number, mode: 'fill', pref: 'auto' });
    assert(p.slots.a && p.slots.b && p.images.a && Number.isFinite(p.images.a.w), `비율 ${bad}`);
  }
  const one = im.planImmersive({ stage: { w: 390, h: 600 }, view: 'pair', hasB: false, aspectA: 9 / 16, aspectB: null, mode: 'fill', pref: 'auto' });
  assert(one.view === 'single' && one.slots.b === null, 'B 없으면 한 영상');
});

/* ---- IM02 · IM06 화면 틀 ---- */

check('IM02 영상은 화면 위부터, 조작은 안전 영역 안, 도구는 아래', () => {
  const ins = { top: 59, bottom: 34, left: 0, right: 0 };
  const f = im.immersiveFrame({ root: { w: 390, h: 844 }, insets: ins, toolsHidden: false, bottomH: 210 });
  near(f.stage.y, 0, '영상 위 끝');
  near(f.stage.h, 844 - 210, '남는 높이 = 영상');
  assert(f.header && f.header.y >= ins.top, '머리 단추가 안전 영역 밖');
  assert(f.bottomTools && f.bottomTools.y + f.bottomTools.h === 844, '도구는 아래 끝까지');
  const safe = im.immersiveFrame({ root: { w: 390, h: 844 }, insets: ins, toolsHidden: false, bottomH: 210, videoTop: 'safe' });
  near(safe.stage.y, 59, '안전 영역 아래부터 고르면');
});

check('IM06 도구 숨김 — 위 · 아래 · 옆 예약이 모두 풀려 영상이 실제로 커지고, 되살리기는 44pt · 안전 영역 안', () => {
  for (const [w, h] of VIEWPORTS) {
    const ins = w > h ? { top: 0, bottom: 21, left: 59, right: 59 } : { top: 59, bottom: 34, left: 0, right: 0 };
    const side = ws.sideDock(w, h) ? 120 : 0;
    const shown = im.immersiveFrame({ root: { w, h }, insets: ins, toolsHidden: false, bottomH: 200, sideW: side });
    const hidden = im.immersiveFrame({ root: { w, h }, insets: ins, toolsHidden: true, bottomH: 200, sideW: side });
    assert(hidden.stage.w * hidden.stage.h > shown.stage.w * shown.stage.h, `${w}×${h} 숨겨도 안 커짐`);
    near(hidden.stage.w * hidden.stage.h, w * h, `${w}×${h} 숨김이면 화면 전체`);
    assert(!hidden.header && !hidden.bottomTools && !hidden.sideTools, '숨긴 도구 자리가 남음');
    const r = hidden.restore;
    assert(r && r.w >= 44 && r.h >= 44, '되살리기 44pt');
    assert(r && r.x >= ins.left && r.x + r.w <= w - ins.right && r.y >= ins.top, `${w}×${h} 되살리기가 안전 영역 밖`);
    assert(!shown.restore, '보일 때 되살리기 단추');
  }
});

/* ---- IM04 · IM09 보기 상태 ---- */

check('IM04 새 비교: 분할에서 시작 → 기준을 맞추면 한 번 겹침 B 45%', () => {
  const p0 = pres.newPresentation();
  assert(p0.view === 'split' && p0.display === 'fill', '시작');
  const p1 = pres.onAnchorsReady(p0, true);
  assert(p1.view === 'overlay' && p1.top === 'b' && p1.opacity === 0.45, '첫 겹침');
  assert(pres.opacityLabel(p1) === 'B 진하기45%', pres.opacityLabel(p1));
  const p2 = pres.setView(p1, 'split');
  const p3 = pres.onAnchorsReady(p2, true);
  assert(p3.view === 'split', '사람이 분할을 고른 뒤 다시 겹치면 안 됨');
  assert(pres.onAnchorsReady(p0, false).view === 'split', 'B 없으면 겹치지 않음');
});

check('IM09 예전 문서: 저장된 겹침 켬/끔 · 진하기 · 반반 그대로, 표시는 채움(고른 것 아님), 자동 겹침 없음', () => {
  const legOn = pres.parsePresentation(undefined, { on: true, opacity: 0.7, wipe: null });
  assert(legOn.view === 'overlay' && legOn.opacity === 0.7 && legOn.display === 'fill' && !legOn.displayChosen && legOn.origin === 'legacy', JSON.stringify(legOn));
  const legOff = pres.parsePresentation(undefined, { on: false, opacity: 0.3, wipe: 0.4 });
  assert(legOff.view === 'split' && legOff.opacity === 0.3 && legOff.wipe === 0.4, '끔 · 반반');
  assert(pres.onAnchorsReady(legOff, true).view === 'split', '예전 문서를 자동으로 겹침');
  /* 새 칸이 있으면 그것 — 깨진 칸은 하나씩 기본으로 */
  const saved = pres.parsePresentation({ view: 'overlay', display: 'full', displayChosen: true, top: 'a', opacity: 0.333, origin: 'new', viewChosen: true }, { on: false, opacity: 0.5, wipe: null });
  assert(saved.display === 'full' && saved.displayChosen && saved.top === 'a' && saved.opacity === 0.35, JSON.stringify(saved));
  const broken = pres.parsePresentation({ view: 7, display: 'x', opacity: 'nan', top: null }, null);
  assert(broken.view === 'split' && broken.display === 'fill' && broken.opacity === 0.45 && broken.top === 'b', JSON.stringify(broken));
  /* 저장 → 읽기 왕복 */
  const rt = pres.parsePresentation(pres.serializePresentation(saved), null);
  assert(JSON.stringify(rt) === JSON.stringify(saved), '왕복');
});

check('IM04 진하기 — 0~100% 5% 걸음 · 25/50/75 빠른 값 · 끝점 뜻', () => {
  let p = pres.newPresentation();
  p = pres.setOpacity(p, 0.43);
  near(p.opacity, 0.45, '5% 걸음', 1e-9);
  for (let i = 0; i < 30; i++) p = pres.stepOpacity(p, 1);
  assert(p.opacity === 1, '100% 넘음');
  for (let i = 0; i < 30; i++) p = pres.stepOpacity(p, -1);
  assert(p.opacity === 0, '0% 밑');
  assert(pres.opacityA11y(p).includes('A만 보임'), pres.opacityA11y(p));
  assert(pres.opacityA11y(pres.setOpacity(p, 1)).includes('B만 보임'), '100 끝점');
  assert(JSON.stringify(pres.OPACITY_PRESETS) === '[0.25,0.5,0.75]', '빠른 값');
});

check('IM04 그림 불투명도 — 아래 영상은 늘 100%, 위 영상만 진하기, 분할은 둘 다 100%', () => {
  const p = pres.onAnchorsReady(pres.newPresentation(), true);
  assert(JSON.stringify(pres.layerOpacity(p)) === JSON.stringify({ a: 1, b: 0.45 }), JSON.stringify(pres.layerOpacity(p)));
  const sw = pres.swapTop(p);
  assert(JSON.stringify(pres.layerOpacity(sw)) === JSON.stringify({ a: 0.45, b: 1 }) && pres.opacityLabel(sw) === 'A 진하기45%', '위 영상 바꾸기');
  assert(JSON.stringify(pres.layerOpacity(pres.setView(p, 'split'))) === JSON.stringify({ a: 1, b: 1 }), '분할');
  const w = pres.setWipe(p, 0.5);
  assert(!pres.opacityApplies(w) && pres.layerOpacity(w).b === 1, '반반이면 진하기를 쓰지 않음');
});

check('IM04 보기 바꾸기는 보기 칸만 바꾼다(위 영상 · 진하기 · 표시 유지)', () => {
  const p = pres.setDisplay(pres.setOpacity(pres.onAnchorsReady(pres.newPresentation(), true), 0.6), 'full');
  const q = pres.toggleView(pres.toggleView(p));
  assert(q.view === p.view && q.opacity === p.opacity && q.display === 'full' && q.top === p.top, '왕복에서 다른 칸이 바뀜');
  assert(pres.displayBadge(pres.newPresentation(), true) === '채움 · 일부 잘림' && pres.displayBadge(p, true) === '전체', '표시 줄');
});

check('IM09 예전 판에 같이 쓰는 겹침 칸은 0.1~0.9(옛 판 읽기 범위)', () => {
  const p = pres.setOpacity(pres.onAnchorsReady(pres.newPresentation(), true), 0);
  const l = pres.legacyOverlayOf(p);
  assert(l.on && l.opacity === 0.1, JSON.stringify(l));
});

/* ---- IM06 · IM07 도구 숨김 상태 ---- */

const PLAYBACK = /play|pause|seek|rate|loop|restart|reload|player/i;
check('IM06 숨김 · 되살리기 · 뒤로 · 탭 — 결과에 재생 명령이 없다', () => {
  let s = vis.CHROME_SHOWN;
  const r1 = vis.chromeReduce(s, { type: 'hide' });
  assert(r1.state.hidden && r1.handled, '숨김');
  s = r1.state;
  const back = vis.chromeReduce(s, { type: 'back' });
  assert(!back.state.hidden && back.handled, '뒤로는 먼저 숨김만 끝냄');
  const back2 = vis.chromeReduce(back.state, { type: 'back' });
  assert(!back2.handled, '두 번째 뒤로는 기존 계약');
  for (const r of [r1, back, back2]) for (const e of r.effects) assert(!PLAYBACK.test(JSON.stringify(e)), `재생 명령 ${JSON.stringify(e)}`);
  const tap = { pointers: 1, dx: 2, dy: 3, ms: 120, drawing: false, scrubbing: false };
  assert(!vis.chromeReduce(s, { type: 'tapVideo', gesture: tap }).state.hidden, '일부러 누른 탭은 되살림');
  assert(!vis.chromeReduce(vis.CHROME_SHOWN, { type: 'tapVideo', gesture: tap }).state.hidden, '보일 때 탭으로 숨기지 않음');
});

check('IM06 그리기 · 두 손가락 · 끌기 · 긴 누름은 탭이 아니다', () => {
  const s = { hidden: true };
  const g = (o: Partial<vis.GestureSample>): vis.GestureSample => ({ pointers: 1, dx: 0, dy: 0, ms: 100, drawing: false, scrubbing: false, ...o });
  for (const [name, gest] of [
    ['그리기', g({ drawing: true })],
    ['두 손가락', g({ pointers: 2 })],
    ['끌기', g({ dx: 30 })],
    ['타임라인', g({ scrubbing: true })],
    ['긴 누름', g({ ms: 800 })],
  ] as const)
    assert(vis.chromeReduce(s, { type: 'tapVideo', gesture: gest }).state.hidden, `${name}이 탭으로 되살림`);
  assert(vis.chromeReduce(s, { type: 'tapVideo', gesture: g({}) }, { ...vis.IDLE, manipulating: true }).state.hidden, '손대는 중');
});

check('IM06 편집 · 창 · 손대는 중엔 숨기지 않고, 메모 · 창이 필요하면 먼저 되살린다', () => {
  for (const k of ['editing', 'inspector', 'manipulating'] as const) {
    const r = vis.chromeReduce(vis.CHROME_SHOWN, { type: 'hide' }, { ...vis.IDLE, [k]: true });
    assert(!r.state.hidden && r.blocked === k, `${k} 중 숨김`);
  }
  assert(!vis.chromeReduce({ hidden: true }, { type: 'needControls' }).state.hidden, '조작이 필요하면 보이게');
});

check('IM06 숨김은 저장 · 이어가지 않는다 · 예약 0 · 읽어 주기에서 빠짐 · 되살리기는 닿음', () => {
  assert(!vis.restoreChrome({ hidden: true }).hidden, '다시 열면 보임');
  assert(!vis.chromeReduce({ hidden: true }, { type: 'leave' }).state.hidden, '떠나면 보임');
  assert(JSON.stringify(vis.chromeReservation({ hidden: true }, { header: 44, bottom: 210, side: 120 })) === JSON.stringify({ header: 0, bottom: 0, side: 0 }), '예약');
  const a = vis.chromeA11y({ hidden: true });
  assert(a.toolsHidden && a.restoreVisible && a.restoreLabel === '도구 보이기', '읽어 주기');
});

check('IM07 틀 전환 — 200ms, 동작 줄이기면 0', () => {
  assert(vis.chromeTransitionMs(false) >= 180 && vis.chromeTransitionMs(false) <= 220, '시간');
  assert(vis.chromeTransitionMs(true) === 0, '동작 줄이기');
});


/* ---- 통합(2026-11-03): 확대 · 이동 한계 · 문서 저장 호환 ---- */

check('IM03 채움은 확대 1 이어도 잘린 만큼 밀어 볼 수 있고 · 전체는 예전처럼 확대한 만큼만 · 저장 한계 안', () => {
  const slot = { w: 194, h: 571 };
  const v0 = { ...geo.IDENTITY_VIEW };
  const lf = im.panLimit(slot, 16 / 9, v0, 'fill');
  assert(lf.x > 0.5 && lf.y === 0, `가로 영상 채움 — 옆으로 밀 수 있음: ${JSON.stringify(lf)}`);
  const lfull = im.panLimit(slot, 16 / 9, v0, 'full');
  assert(lfull.x === 0 && lfull.y === 0, '전체 — 확대 1 이면 이동 없음');
  const far = im.panByFor(v0, slot, 16 / 9, 'fill', 1e6, 0);
  assert(far.panX <= (geo.MAX_ZOOM - 1) / 2 + 1e-9, '저장 한계 안');
  /* 다 밀면 원본 가장자리가 칸 가장자리에 닿는다(잘린 손 · 공을 되찾음) — 그 너머 빈자리는 없음 */
  const m = im.layerMap(slot, 16 / 9, far, 'fill');
  near(m.x, 0, '왼쪽 끝이 칸 끝에', 1e-6);
  for (let i = 0; i < 200; i++) {
    const a = ASPECTS[Math.floor(rnd() * ASPECTS.length)];
    const sl = { w: 100 + rnd() * 600, h: 100 + rnd() * 700 };
    const v = { ...v0, zoom: 1 + rnd() * 5, panX: (rnd() - 0.5) * 8, panY: (rnd() - 0.5) * 8 };
    const c = im.clampPanFor(v, sl, a, 'fill');
    const mm = im.layerMap(sl, a, c, 'fill');
    assert(mm.x <= 1e-6 && mm.y <= 1e-6 && mm.x + mm.w >= sl.w - 1e-6 && mm.y + mm.h >= sl.h - 1e-6, `채움 — 밀어도 칸에 빈자리 없음 ${JSON.stringify({ sl, a, c })}`);
  }
});

check('IM05 손가락으로 확대하면 짚은 원본 자리가 그대로(채움 · 전체)', () => {
  for (let i = 0; i < 300; i++) {
    const mode: im.DisplayMode = rnd() < 0.5 ? 'fill' : 'full';
    const a = ASPECTS[Math.floor(rnd() * ASPECTS.length)];
    const slot = { w: 150 + rnd() * 500, h: 150 + rnd() * 600 };
    const v = { ...geo.IDENTITY_VIEW, mirror: rnd() < 0.3 };
    const m0 = im.layerMap(slot, a, v, mode);
    const focal = { x: m0.x + m0.w * (0.3 + rnd() * 0.4), y: Math.max(0, m0.y) + Math.min(slot.h, m0.h) * (0.3 + rnd() * 0.4) };
    if (focal.x < 0 || focal.x > slot.w || focal.y < 0 || focal.y > slot.h) continue;
    const before = im.mapToSource(focal, m0);
    const z = im.zoomAtFor(v, slot, a, mode, focal, 2);
    const after = im.mapToSource(focal, im.layerMap(slot, a, z, mode));
    /* 한계에 걸리면 조금 밀릴 수 있다 — 안 걸린 경우만 같은 자리 */
    const l = im.panLimit(slot, a, z, mode);
    if (Math.abs(z.panX) < l.x - 1e-6 && Math.abs(z.panY) < l.y - 1e-6) {
      near(after.u, before.u, '짚은 u', 1e-6);
      near(after.v, before.v, '짚은 v', 1e-6);
    }
  }
  const back = im.zoomAtFor({ ...geo.IDENTITY_VIEW, zoom: 3, panX: 0.4 }, { w: 300, h: 500 }, 9 / 16, 'fill', { x: 10, y: 10 }, 1);
  assert(back.zoom === 1 && back.panX === 0 && back.panY === 0, '확대 1 로 돌아가면 기본 구도');
  assert(!im.isFramed(back) && im.isFramed({ ...back, panX: 0.1 }), '맞춤 단추는 이동만 있어도 보임');
});

const SRC = (p: string) => ({ path: p, origin: 'myVideos' as const, owned: false, label: null, date: null, facts: timing.normalizeFacts({ durationSec: 10 }) });
const newDoc = () => doc.createDocument('u1', [SRC('u1/local-a'), SRC('u1/local-b')], '2026-11-03T00:00:00.000Z', { doc: 'im', sources: ['sa', 'sb'] });
const roundtrip = (d: doc.ComparisonDocument) => {
  const r = doc.parseDocument(JSON.parse(JSON.stringify(d)), 'u1');
  assert(r.ok, `다시 읽기 실패 ${JSON.stringify(r)}`);
  return (r as { ok: true; doc: doc.ComparisonDocument }).doc;
};

check('IM09 새 짝은 몰입 보기 칸을 갖고 · 저장 → 읽기 왕복 · 진하기 0 · 100% 끝점은 present 에만', () => {
  let d = newDoc();
  const p0 = doc.presentOf(doc.activePair(d)!);
  assert(p0.origin === 'new' && p0.view === 'split' && p0.display === 'fill', '새 짝 기본');
  for (const o of [0, 1, 0.45, 0.05, 0.95]) {
    d = doc.setPresent(d, pres.setOpacity({ ...p0, view: 'overlay' }, o));
    const back = roundtrip(d);
    const p = doc.presentOf(doc.activePair(back)!);
    near(p.opacity, o, `진하기 ${o}`, 1e-9);
    const ov = doc.activePair(back)!.overlay;
    assert(ov.on === true && ov.opacity >= 0.1 && ov.opacity <= 0.9, `예전 칸은 옛 앱이 읽는 범위로 같이 맞춤: ${JSON.stringify(ov)}`);
  }
  d = doc.setPresent(d, pres.swapTop(pres.setDisplay(doc.presentOf(doc.activePair(d)!), 'full')));
  const p2 = doc.presentOf(doc.activePair(roundtrip(d))!);
  assert(p2.display === 'full' && p2.top === 'a' && p2.displayChosen, '표시 · 위 영상 왕복');
});

check('IM09 예전 문서(present 칸 없음)는 저장된 겹침 · 진하기 · 반반을 그대로 · 자동 겹침 없음 · 확대 · 기준 · 맞춤 그대로', () => {
  let d = newDoc();
  d = doc.updatePair(d, { anchors: { a: 1.2, b: 2.3 }, views: { a: { ...geo.IDENTITY_VIEW, zoom: 2, panX: 0.2 }, b: { ...geo.IDENTITY_VIEW }, linked: false }, overlay: { on: true, opacity: 0.3, wipe: 0.4, reg: { dx: 0.05, dy: -0.02, scale: 1.1 } } });
  const raw = JSON.parse(JSON.stringify(d));
  for (const p of raw.pairs) delete p.present;
  const r = doc.parseDocument(raw, 'u1');
  assert(r.ok, '예전 문서 읽힘');
  const back = (r as { ok: true; doc: doc.ComparisonDocument }).doc;
  const pair = doc.activePair(back)!;
  const p = doc.presentOf(pair);
  assert(p.origin === 'legacy' && p.view === 'overlay' && Math.abs(p.opacity - 0.3) < 1e-9 && p.wipe === 0.4, `예전 보기 그대로: ${JSON.stringify(p)}`);
  assert(pres.onAnchorsReady(p, true) === p, '자동 겹침 없음');
  assert(pair.views.a.zoom === 2 && pair.views.a.panX === 0.2 && pair.anchors.a === 1.2 && pair.overlay.reg.scale === 1.1, '확대 · 기준 · 맞춤 그대로');
  /* 한 영상 문서의 표시(transport.display)는 선택 칸 — 없으면 안 생긴다 */
  assert(!('display' in back.transport), '없는 칸은 만들지 않음');
  const withDisp = roundtrip({ ...back, transport: { ...back.transport, display: 'full' } });
  assert(withDisp.transport.display === 'full', '한 영상 표시 왕복');
});

/* ---- IM01 검은 팔레트 ---- */

check('IM01 앱 테마(라이트 · 다크 · 네이비 · 대비 높이기)와 상관없이 검은 화면 · 읽히는 글자', () => {
  const bases = [...Object.values(PALETTES), ...Object.values(PALETTES_HIGH_CONTRAST)];
  for (const base of bases) {
    const hc = (PALETTES_HIGH_CONTRAST as Record<string, unknown>) && Object.values(PALETTES_HIGH_CONTRAST).includes(base);
    const c = pal.compareBlackPalette(base, { highContrast: hc });
    assert(c.page === '#000000', '바탕');
    assert(pal.contrast(c.ink, c.page) >= 15, `주 글자 ${pal.contrast(c.ink, c.page)}`);
    for (const bg of [c.page, c.card, c.chip]) {
      assert(pal.contrast(c.muted, bg) >= 4.5, `보조 글자 ${c.muted} on ${bg}: ${pal.contrast(c.muted, bg).toFixed(2)}`);
      assert(pal.contrast(c.link, bg) >= 4.5, `링크 on ${bg}`);
      assert(pal.contrast(c.danger, bg) >= 4.5, `오류 on ${bg}`);
    }
    assert(pal.contrast(c.onAction, c.action) >= 4.5, '주 단추 글자');
    /* 고른 칩 · 선은 바탕과 구별돼야(경계가 사라져 잘림을 감추지 않게) */
    assert(pal.contrast(c.lineStrong, c.page) >= 1.9, `진한 선 ${pal.contrast(c.lineStrong, c.page)}`);
  }
  assert(pal.COMPARE_STATUS_BAR === 'light', '상태 막대');
});

check('IM01 팔레트는 앱 팔레트 꼴 그대로 — 색 아닌 칸(그림자 등)은 지킨다', () => {
  const c = pal.compareBlackPalette(PALETTES.light);
  for (const k of Object.keys(PALETTES.light)) assert(k in c, `칸 빠짐 ${k}`);
  assert(c.float === PALETTES.light.float, '그림자 칸이 바뀜');
});

console.log(`몰입 비교 독립 시험: ${pass} 통과 · ${fails.length} 실패`);
for (const f of fails) console.log(`  ✗ ${f}`);
if (fails.length) process.exit(1);
