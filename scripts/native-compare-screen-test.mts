/**
 * 투구 영상 비교 — 한 화면(2026-11-02, docs/designs/sinker-pitch-video-single-screen-plan.md UI01~UI09) 순수 시험.
 * 실행: npm run native-compare:screen (npm run native-compare:test 가 같이 돌린다)
 *
 * - 화면 크기 · 글자 크기 · 안전 영역 · 영상 비율 조합마다 무대(영상 자리)와 실제 영상 사각형(contain)을 셈한다(compare/workspace-layout.ts).
 *   머리 · 타임라인 · 재생 줄 · 도구 줄 높이는 workbench.tsx 의 모양(st)에서 옮긴 어림이다 — 기기에서 잰 값이 아니다(기기 확인은 대장 문서).
 * - 쪽 나누기 · 긴 글 쪽 · 장면 표시 고르기 · 도구 상태 뒤로 차례 · 그림 손잡이 고치기.
 * 실패를 모아 끝에 한꺼번에 보이고, 하나라도 있으면 끝 코드 1. --report 면 크기별 표를 찍는다.
 */
import assert from 'node:assert/strict';
import { handlesOf, translate, withHandle } from '~/compare/shape-edit';
import { backStep, closeInspector, fixTarget, INITIAL_UI, openContext, targetsFor, toggleInspector } from '~/compare/workspace-context';
import {
  chromeBudget,
  clusterMarkers,
  fracOf,
  handleAt,
  HYSTERESIS,
  nearestMarker,
  packRows,
  pageOfIndex,
  pageSlice,
  paginateText,
  pairScore,
  perPage,
  planStage,
  sideDock,
  textCapacity,
  timeAt,
  type StagePlan,
} from '~/compare/workspace-layout';

const fails: string[] = [];
let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    fails.push(`${name}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
  }
}
const ok = (v: unknown, m: string) => assert.ok(v, m);
const report = process.argv.includes('--report');

/* ---- 화면 틀 어림(workbench.tsx st 와 같은 값) ---- */
type Device = { name: string; w: number; h: number; top: number; bottom: number; left: number; right: number };
const PORTRAIT: Device[] = [
  { name: '320×568', w: 320, h: 568, top: 20, bottom: 0, left: 0, right: 0 },
  { name: '375×667', w: 375, h: 667, top: 20, bottom: 0, left: 0, right: 0 },
  { name: '390×844', w: 390, h: 844, top: 47, bottom: 34, left: 0, right: 0 },
  { name: '430×932', w: 430, h: 932, top: 59, bottom: 34, left: 0, right: 0 },
];
const LANDSCAPE: Device[] = PORTRAIT.map((d) => ({ name: `${d.h}×${d.w}`, w: d.h, h: d.w, top: 0, bottom: d.bottom ? 21 : 0, left: d.top > 20 ? d.top : 0, right: d.top > 20 ? d.top : 0 }));
const IPAD: Device[] = [
  { name: 'iPad 820×1180', w: 820, h: 1180, top: 24, bottom: 20, left: 0, right: 0 },
  { name: 'iPad 1180×820', w: 1180, h: 820, top: 24, bottom: 20, left: 0, right: 0 },
  { name: 'iPad 분할 375×1180', w: 375, h: 1180, top: 24, bottom: 20, left: 0, right: 0 },
  { name: 'iPad 분할 507×820', w: 507, h: 820, top: 24, bottom: 20, left: 0, right: 0 },
];
/** 글자 배율별 높이 — 단추 글자는 1.4배 · 머리 1.4배 · 도구 이름 1.3배에서 멈춘다(maxFontSizeMultiplier). 줄은 44 아래로 줄지 않는다 */
function chrome(fs: number, context: 'view' | 'draw' | 'events' | 'align') {
  const k = Math.min(fs, 1.4);
  const header = Math.max(44, Math.ceil(17 * k * 1.3));
  const timeline = 44;
  const transport = Math.max(44, Math.ceil(21 * k + 18));
  const dockRow = Math.max(44, Math.ceil(21 * k + 18));
  const dock = context === 'view' ? Math.max(48, Math.ceil(20 + 1 + 11 * Math.min(fs, 1.3) * 1.3 + 8)) : 2 * dockRow + 4;
  /* controls gap 2 + 도구 줄 위 2 + 아래 4 */
  return { header, timeline, transport, dock, separators: 2 + 2 + 4 };
}
type Case = { device: Device; fs: number; context: 'view' | 'draw' | 'events' | 'align'; aspects: [number | null, number | null]; label: string };
function layoutFor(c: Case) {
  const d = c.device;
  const rootW = d.w - d.left - d.right;
  const land = sideDock(rootW, d.h - d.top);
  const sideW = land ? Math.round(Math.min(240, Math.max(176, rootW * 0.3))) : 0;
  const ch = chrome(c.fs, c.context);
  /* 가로 폰은 도구 줄이 오른쪽 칸으로 — 아래 줄에서 빠진다 */
  const b = chromeBudget({ rootH: d.h, insetTop: d.top, insetBottom: d.bottom, header: ch.header, timeline: ch.timeline, transport: ch.transport, dock: land ? 0 : ch.dock, separators: land ? 4 : ch.separators });
  const stage = { w: rootW - sideW, h: b.stageH };
  const plan = planStage({ w: stage.w, h: stage.h, aspectA: c.aspects[0], aspectB: c.aspects[1], hasB: c.aspects[1] !== undefined && c.label !== 'single', mode: c.label === 'single' ? 'single' : 'pair', pref: 'auto' });
  return { b, stage, plan, land, sideW, ch };
}
const PV = 9 / 16;
const LV = 16 / 9;
const SOURCES: { label: string; aspects: [number | null, number | null] }[] = [
  { label: '세로 둘', aspects: [PV, PV] },
  { label: '가로 둘', aspects: [LV, LV] },
  { label: '세로 + 가로', aspects: [PV, LV] },
  { label: '4:3 + 세로', aspects: [4 / 3, PV] },
  { label: '비율 모름', aspects: [null, null] },
  { label: 'single', aspects: [PV, null] },
];
const inside = (r: { x: number; y: number; w: number; h: number }, w: number, h: number) => r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= w + 0.5 && r.y + r.h <= h + 0.5;
const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => !(a.x + a.w <= b.x + 0.01 || b.x + b.w <= a.x + 0.01 || a.y + a.h <= b.y + 0.01 || b.y + b.h <= a.y + 0.01);
const near = (a: number, b: number, eps: number) => Math.abs(a - b) <= eps;

/* ---- UI02 · UI03: 무대 · 실제 영상 넓이 ---- */
const rows: string[] = [];
for (const device of [...PORTRAIT, ...LANDSCAPE, ...IPAD])
  for (const fs of [1, 1.6, 2])
    for (const context of ['view', 'draw'] as const)
      for (const s of SOURCES) {
        const c: Case = { device, fs, context, aspects: s.aspects, label: s.label };
        const { b, stage, plan, land } = layoutFor(c);
        const name = `${device.name} 글자${Math.round(fs * 100)}% ${context} ${s.label}`;
        check(`UI03 ${name} — 영상이 무대 안 · 겹치지 않음 · 원본 비율`, () => {
          const panes = [plan.panes.a, plan.panes.b].filter((r): r is NonNullable<typeof r> => !!r);
          ok(panes.length === (s.label === 'single' ? 1 : 2), `칸 수 ${panes.length}`);
          for (const r of panes) ok(inside(r, stage.w, stage.h), `무대 밖 ${JSON.stringify(r)} / ${stage.w}×${stage.h}`);
          if (panes.length === 2) ok(!overlap(panes[0], panes[1]), '겹침');
          const want = [s.aspects[0] ?? PV, s.aspects[1] ?? s.aspects[0] ?? PV];
          panes.forEach((r, i) => ok(r.h < 2 || near(r.w / r.h, want[i], 0.02), `비율 ${(r.w / r.h).toFixed(3)} ≠ ${want[i].toFixed(3)}`));
          /* UI04 영상 아래 끝은 무대 아래(=타임라인 바로 위) */
          ok(plan.bottomGap <= 1, `영상과 타임라인 사이 ${plan.bottomGap}`);
          /* 두 영상 비교의 작은 쪽도 쓸 만하게 — 큰 쪽의 15% 넘게 */
          if (panes.length === 2) ok(plan.minArea >= 0.15 * (plan.area - plan.minArea) || plan.area < 1, `작은 쪽 ${(plan.minArea / Math.max(1, plan.area - plan.minArea)).toFixed(2)}`);
        });
        if (context === 'view' && !land && fs === 1 && !device.name.startsWith('iPad'))
          check(`UI02 ${name} — 무대가 쓸 수 있는 높이의 65% 넘게`, () => ok(b.share >= 0.65, `무대 ${(b.share * 100).toFixed(1)}%`));
        if (report && context === 'view') rows.push(`${name.padEnd(46)} 무대 ${String(stage.w).padStart(4)}×${String(Math.round(stage.h)).padStart(4)} (${(b.share * 100).toFixed(0)}%) · ${plan.shape} · 영상 ${Math.round(plan.area)}px² (무대의 ${((plan.area / Math.max(1, plan.stageArea)) * 100).toFixed(0)}%)`);
      }

check('UI03 세로 영상 둘은 세로 폰에서도 나란히 · 가로 영상 둘은 위아래', () => {
  const p1 = planStage({ w: 390, h: 571, aspectA: PV, aspectB: PV, hasB: true, mode: 'pair', pref: 'auto' });
  ok(p1.shape === 'side', `세로 둘 ${p1.shape}`);
  const p2 = planStage({ w: 390, h: 571, aspectA: LV, aspectB: LV, hasB: true, mode: 'pair', pref: 'auto' });
  ok(p2.shape === 'stack', `가로 둘 ${p2.shape}`);
});
check('UI03 예전 배치(창 높이 31% · 공통 비율)보다 실제 영상 넓이가 크다 — 390×844 세로 둘', () => {
  /* 예전: 본문 폭 358, 칸 높이 = min(폭 / 비율, 창 높이 × 0.31), 위아래 */
  const colW = 390 - 32;
  const boxH = Math.min(colW / PV, 844 * 0.31);
  const oldArea = 2 * Math.min(colW, boxH * PV) * boxH;
  const { plan } = layoutFor({ device: PORTRAIT[2], fs: 1, context: 'view', aspects: [PV, PV], label: '세로 둘' });
  ok(plan.area > oldArea * 1.4, `새 ${Math.round(plan.area)} · 예전 ${Math.round(oldArea)}`);
  if (report) rows.push(`예전 배치 390×844 세로 둘: 영상 ${Math.round(oldArea)}px² → 새 ${Math.round(plan.area)}px² (${((plan.area / oldArea - 1) * 100).toFixed(0)}% 큼)`);
});
check('UI03 자동 배치는 조금 나아졌다고 뒤집지 않는다(HYSTERESIS) · 사람이 고른 배치는 그대로', () => {
  /* 두 후보가 비슷한 무대를 찾아, 지난 배치를 넘기면 그대로인지 */
  let found = false;
  for (let h = 200; h <= 900 && !found; h += 2) {
    const a = planStage({ w: 390, h, aspectA: 3 / 4, aspectB: 3 / 4, hasB: true, mode: 'pair', pref: 'stack' });
    const b = planStage({ w: 390, h, aspectA: 3 / 4, aspectB: 3 / 4, hasB: true, mode: 'pair', pref: 'side' });
    const r = pairScore(b) / pairScore(a);
    if (r > 1.001 && r < 1 + HYSTERESIS - 0.01) {
      found = true;
      ok(planStage({ w: 390, h, aspectA: 3 / 4, aspectB: 3 / 4, hasB: true, mode: 'pair', pref: 'auto', prev: 'stack' }).shape === 'stack', '조금 나은 정도면 지난 배치 그대로');
      ok(planStage({ w: 390, h, aspectA: 3 / 4, aspectB: 3 / 4, hasB: true, mode: 'pair', pref: 'auto' }).shape === 'side', '처음엔 나은 쪽');
    }
  }
  ok(found, '비슷한 경우를 못 찾음');
  ok(planStage({ w: 390, h: 571, aspectA: PV, aspectB: PV, hasB: true, mode: 'pair', pref: 'stack' }).shape === 'stack', '사람이 고른 위아래');
});
check('UI03 겹쳐 · A 크게 · B 크게는 칸 하나(다른 칸은 숨김 — 재생기는 그대로)', () => {
  for (const [mode, k] of [
    ['overlay', 'a'],
    ['focusA', 'a'],
    ['focusB', 'b'],
  ] as const) {
    const p: StagePlan = planStage({ w: 390, h: 571, aspectA: PV, aspectB: LV, hasB: true, mode, pref: 'auto' });
    ok(!!p.panes[k] && !p.panes[k === 'a' ? 'b' : 'a'], `${mode}`);
  }
  const f = planStage({ w: 390, h: 571, aspectA: PV, aspectB: LV, hasB: true, mode: 'focusB', pref: 'auto' });
  ok(near(f.panes.b!.w / f.panes.b!.h, LV, 0.02), 'B 크게는 B 비율');
});
check('UI02 무대 높이 = 잰 높이에서 머리 · 줄들 · 안전 영역을 한 번씩만 뺀 것', () => {
  const b = chromeBudget({ rootH: 844, insetTop: 47, insetBottom: 34, header: 44, timeline: 44, transport: 48, dock: 48, separators: 8 });
  ok(b.usable === 763 && b.stageH === 763 - 192, `${b.usable} · ${b.stageH}`);
  ok(chromeBudget({ rootH: 100, insetTop: 47, insetBottom: 34, header: 44, timeline: 44, transport: 48, dock: 48, separators: 8 }).stageH === 0, '모자라면 0(음수 아님)');
});

/* ---- UI07 · UI08 · UI09: 쪽 ---- */
check('UI07 쪽 나누기 — 넘치는 줄은 다음 쪽 · 제목 줄은 홀로 남지 않음 · 큰 줄은 혼자', () => {
  ok(JSON.stringify(packRows([40, 40, 40], 100, 8)) === '[[0,1],[2]]', JSON.stringify(packRows([40, 40, 40], 100, 8)));
  ok(JSON.stringify(packRows([40, 20, 40], 70, 8, [false, true, false])) === '[[0],[1,2]]', JSON.stringify(packRows([40, 20, 40], 70, 8, [false, true, false])));
  ok(JSON.stringify(packRows([300, 40], 100, 8)) === '[[0],[1]]', '큰 줄');
  const all = packRows(Array.from({ length: 37 }, (_, i) => 20 + (i % 5) * 13), 140, 8, Array.from({ length: 37 }, (_, i) => i % 7 === 0));
  ok(all.flat().join(',') === Array.from({ length: 37 }, (_, i) => i).join(','), '모든 줄이 한 번씩 · 차례 그대로');
});
check('UI09 perPage · pageSlice — 자리에 들어가는 만큼 · 쪽 번호는 범위 안 · 모든 것에 닿음', () => {
  ok(perPage(500, 52, 8) === 8, String(perPage(500, 52, 8)));
  ok(perPage(10, 52, 8) === 1, '적어도 하나');
  const items = Array.from({ length: 23 }, (_, i) => i);
  const seen: number[] = [];
  for (let p = 0; p < pageSlice(items, 6, 0).pages; p++) seen.push(...pageSlice(items, 6, p).items);
  ok(seen.join() === items.join(), '쪽을 다 넘기면 모두');
  ok(pageSlice(items, 6, 99).page === 3 && pageSlice(items, 6, -3).page === 0, '범위 밖 쪽은 끝으로');
  ok(pageSlice([], 6, 2).pages === 1, '빈 목록은 한 쪽');
  ok(pageOfIndex(13, 6) === 2, '고른 것이 든 쪽');
});
check('UI08 긴 메모 쪽 나누기 — 이어 붙이면 원문 그대로(한 글자도 안 빠짐) · 한 쪽은 칸 안 · 그림 문자를 가르지 않음', () => {
  const samples = [
    '',
    '짧은 메모',
    '착지 때 앞무릎이 안으로 무너짐. '.repeat(30),
    '첫 줄\n둘째 줄\n\n'.repeat(40),
    'ㅋ'.repeat(700),
    '팔 높이 🙂 '.repeat(80),
    'abc'.repeat(300) + '\n' + '가'.repeat(250),
  ];
  for (const t of samples)
    for (const cap of [20, 37, 64, 120, 500]) {
      const parts = paginateText(t, cap);
      ok(parts.map((r) => t.slice(r.start, r.end)).join('') === t, `원문이 바뀜(cap ${cap})`);
      for (const r of parts) ok(r.end - r.start <= Math.max(20, cap) + 1, `쪽이 넘침 ${r.end - r.start} > ${cap}`);
      for (const r of parts.slice(0, -1)) {
        const code = t.charCodeAt(r.end - 1);
        ok(!(code >= 0xd800 && code <= 0xdbff), '그림 문자 가름');
      }
    }
  ok(textCapacity(300, 120, 16, 22) > 60 && textCapacity(300, 120, 32, 44) < textCapacity(300, 120, 16, 22), '글자가 크면 한 쪽 글자 수가 준다');
});

/* ---- UI04: 타임라인 ---- */
check('UI04 타임라인 — 자리 ↔ 장면 · 표시 가까이 누르면 그 표시 · 겹친 표시는 묶음 · 반복 손잡이', () => {
  ok(near(timeAt(150, 300, -1, 1), 0, 1e-9) && near(fracOf(0.5, -1, 1), 0.75, 1e-9), '자리');
  const ms = [
    { key: 'k', t: -0.8 },
    { key: 'f', t: 0 },
    { key: 'r', t: 0.02 },
    { key: 'x', t: 5 },
  ];
  ok(nearestMarker(ms, 150, 300, -1, 1)?.key === 'f', '가장 가까운 표시');
  ok(nearestMarker(ms, 60, 300, -1, 1) == null, '멀면 없음');
  ok(nearestMarker(ms, 299, 300, -1, 1) == null, '범위 밖 표시는 안 잡음');
  const cl = clusterMarkers(ms, 300, -1, 1);
  ok(cl.length === 2 && cl[1].length === 2, '착지 · 릴리스가 가까우면 한 묶음');
  ok(handleAt({ min: -0.5, max: 0.5 }, 76, 300, -1, 1) === 'start' && handleAt({ min: -0.5, max: 0.5 }, 224, 300, -1, 1) === 'end', '손잡이');
  ok(handleAt({ min: -0.5, max: 0.5 }, 150, 300, -1, 1) == null, '손잡이 밖');
  ok(handleAt({ min: 0, max: 0.001 }, 152, 300, -1, 1) === 'end' && handleAt({ min: 0, max: 0.001 }, 148, 300, -1, 1) === 'start', '겹친 손잡이는 손가락 쪽');
});

/* ---- UI05 · UI07: 도구 상태 ---- */
check('UI07 도구 하나 · 작은 창 하나 · 뒤로는 창 → 도구 → 화면 밖', () => {
  let u = openContext(INITIAL_UI, 'draw');
  ok(u.context === 'draw' && u.inspector == null, '그리기');
  u = toggleInspector(u, 'color');
  u = toggleInspector(u, 'width');
  ok(u.inspector === 'width', '창은 바꿔 엶(쌓지 않음)');
  u = openContext(u, 'events');
  ok(u.context === 'events' && u.inspector == null, '도구를 바꾸면 창은 닫힘');
  u = toggleInspector(u, 'eventResults');
  u = backStep(u)!;
  ok(u.context === 'events' && u.inspector == null, '뒤로 1 — 창');
  u = backStep(u)!;
  ok(u.context === 'view', '뒤로 2 — 도구');
  ok(backStep(u) == null, '뒤로 3 — 단계 · 나가기로 넘김');
  ok(openContext(openContext(INITIAL_UI, 'notes'), 'notes').context === 'view', '같은 도구 다시 누르면 보기');
  ok(closeInspector(INITIAL_UI) === INITIAL_UI, '닫을 창 없으면 그대로');
});
check('UI04 · UI05 재생 대상 — 함께 · A · B, 맞추기는 A · B 만, 오류 난 쪽은 뺌', () => {
  ok(targetsFor({ single: false, aligning: false, aErr: false, bErr: false }).join() === 'both,a,b', '비교');
  ok(targetsFor({ single: false, aligning: true, aErr: false, bErr: false }).join() === 'a,b', '맞추기');
  ok(targetsFor({ single: true, aligning: false, aErr: false, bErr: false }).join() === 'a', '한 영상');
  ok(targetsFor({ single: false, aligning: false, aErr: false, bErr: true }).join() === 'both,a', 'B 오류');
  ok(fixTarget('b', ['both', 'a']) === 'both', '못 쓰는 대상은 첫 대상으로');
});

/* ---- UI06: 그림 손잡이 ---- */
check('UI06 손잡이 — 점 하나만 · 원은 가운데로 통째 · 가장자리로 크기 · 원본 좌표 그대로', () => {
  const line = { kind: 'line' as const, a: { u: 0.1, v: 0.1 }, b: { u: 0.5, v: 0.5 } };
  const l2 = withHandle(line, 1, { u: 0.9, v: 0.2 });
  ok(l2.kind === 'line' && l2.a.u === 0.1 && l2.b.u === 0.9, '선 끝 하나');
  const circle = { kind: 'circle' as const, c: { u: 0.5, v: 0.5 }, edge: { u: 0.6, v: 0.5 } };
  const c2 = withHandle(circle, 0, { u: 0.3, v: 0.3 });
  ok(c2.kind === 'circle' && near(c2.edge.u - c2.c.u, 0.1, 1e-9) && near(c2.edge.v - c2.c.v, 0, 1e-9), '가운데 옮기면 크기 그대로');
  const ang = { kind: 'angle' as const, a: { u: 0, v: 0 }, vtx: { u: 0.5, v: 0.5 }, b: { u: 1, v: 0 } };
  const a2 = withHandle(ang, 1, { u: 0.4, v: 0.6 });
  ok(a2.kind === 'angle' && a2.vtx.u === 0.4 && a2.a.u === 0 && a2.b.u === 1, '꼭짓점');
  ok(handlesOf(ang).length === 3 && handlesOf({ kind: 'free', pts: [] }).length === 0 && handlesOf({ kind: 'href', v: 0.3 }).length === 1, '손잡이 수');
  const t = translate(line, 0.1, -0.1);
  ok(t.kind === 'line' && near(t.a.u, 0.2, 1e-9) && near(t.b.v, 0.4, 1e-9), '통째');
});

if (report) console.log(rows.join('\n'));
console.log(`native-compare-screen: ${passed} 통과 · ${fails.length} 실패`);
for (const f of fails) console.log(`  ✗ ${f}`);
if (fails.length) process.exit(1);
