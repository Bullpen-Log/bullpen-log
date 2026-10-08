import { detectPitchEvents } from '@/lib/pose/detect';
import type { PoseTrack } from '@/lib/pose/types';
import {
  calibrate,
  pointOnRayAtDistance,
  project,
  ray,
  rootsOnRay,
  triangulate,
  type Calibration,
  type CalibFrame,
  type Obs,
} from '@/lib/pitch-3d/camera';
import { cross, dot, median, norm, robustCv, row, sub, type Vec3 } from '@/lib/pitch-3d/linalg';
import { bodyHeight, computeMetrics, worldAxes, type Frame3, type Metric, type PmFactors } from '@/lib/pitch-3d/metrics';
import {
  ARM_PAIRS,
  BONE_WEIGHT,
  BONES,
  backAt,
  J,
  LEG_PAIRS,
  medianStep,
  N_JOINTS,
  PARENT,
  mirrorView,
  prepareView,
  savgol5,
  syncViews,
  type View,
} from '@/lib/pitch-3d/motion';

/**
 * 3D 투구 분석 엔진의 차례(설계 docs/designs/pitch-3d-analysis.md 3절, 검토 D1 ~ D10).
 * 순수 함수 — DOM · 서버 없음. 브라우저(실험실 '분석하기')와 노드 시험(scripts/pitch-3d-selftest.mts)이 같은 코드를 돈다.
 *
 *   옆 · 뒤 관절(PoseTrack) → 정리(혼자 튄 좌우 · 같은 장면) → 시간 맞추기(속도비 · 시작 차이를 에피폴라 잔차로, 뒤 영상 거울 판정)
 *   → 덮임 검사 → 보정 1차(몸통 · 다리) → 장면마다 시간 다시 맞추기(다시 비춤, 강건 직선) → 좌우 다시 고침(다시 비춤, R3)
 *   → 보정 2차 → 3D(가려진 관절은 믿을 만한 시선 위, R4) → 던지는 손 확인 → 다듬기 → 기준 축(R5) → 지표 · ± · 믿음 · 확인 필요
 *
 * 실패는 던지지 않고 { ok: false, code, reason }(해요체 한 줄)로 돌려준다.
 */

/**
 * 엔진 판 번호 — 바꿀 때마다 올리고 아래 표에 한 줄(구속 엔진 lib/velocity-engine/version.ts 와 같은 규칙).
 *
 * | 판    | 날짜       | 바뀐 것 |
 * |-------|------------|---------|
 * | 0.1.0 | 2026-10-08 | 첫 판 — 에피폴라 시간 맞추기, 사람 몸 보정(초점 프로파일 · 8점(Hartley) · Nelder–Mead, 강건 다시 비춤 + 몸통 · 다리 뼈 길이), 2패스 좌우, 가려진 관절, 두 카메라 가로축 수직. 합성 씨앗 5개 평균 오차: 몸통 기울기 2.7~5.1° · 꼬임 1.3~4.6° · 무릎 1.7~4.0° · 보폭 0.5~1.2%p |
 */
export const PITCH3D_VERSION = '0.1.0';

export type Pitch3dInput = {
  side: PoseTrack;
  back: PoseTrack;
  hand: 'R' | 'L';
  /** 슬로모 촬영 fps(촬영 정보) — 화면 녹화의 시간 지표에만 */
  slowmoFps?: number | null;
  screenRecorded?: boolean;
  /** 시험용 — 옆 영상 시각(초)으로 준 순간. 없으면 옆 영상 규칙(detectPitchEvents) */
  events?: { kneeUp?: number | null; footPlant: number; release: number };
};

export type FailCode = 'short' | 'events' | 'sync' | 'range' | 'calibration';
export type WarningCode = 'density' | 'narrow' | 'focal' | 'vertical' | 'backCamera' | 'screen' | 'consistency';

export type Pitch3dQuality = {
  /** 다시 비춤 오차(사람 높이 대비 %) */
  reprojPct: number;
  /** 부위별 뼈 길이 흔들림(%) — 검토 D8 기준 몸통 · 다리 7 · 위팔 10 · 아래팔 15 */
  boneCv: { trunk: number; legs: number; upperArm: number; forearm: number };
  axisAngleDeg: number;
  /** 초점(긴 변의 배수) · 격자에서 거의 같은 비용인 폭(ln) */
  focal: { side: number; back: number; spread: number };
  density: { side: number; back: number };
  coverage: number;
  syncCost: number;
  calibration: 'high' | 'medium' | 'low';
  flips: { side: number; back: number; repaired: number; handSwapped: boolean; backMirrored: boolean };
  travelVsBackDeg: number | null;
  /** 다시 비춤으로 다듬은 시간 어긋남(뒤 영상 장면 수) */
  offsetFrames: number;
};

export type Pitch3dOk = {
  ok: true;
  version: string;
  hand: 'R' | 'L';
  /** 옆 영상 시각(초) — 장면마다 */
  t: number[];
  /** 장면 × 관절 17개(motion.ts JOINTS 순) × [앞, 위, 오른쪽] — 키 = 1, 원점은 착지 때 뒷발목 · 땅 높이 */
  joints: (number[] | null)[][];
  events: { kneeUp: number | null; footPlant: number; release: number };
  metrics: Metric[];
  quality: Pitch3dQuality;
  warnings: WarningCode[];
};

export type Pitch3dFail = {
  ok: false;
  version: string;
  code: FailCode;
  reason: string;
  quality?: Partial<Pitch3dQuality>;
};

export type Pitch3dResult = Pitch3dOk | Pitch3dFail;

export const FAIL_TEXT: Record<FailCode, string> = {
  short: '영상에서 사람을 충분히 찾지 못했어요. 투수가 크게 나오게 찍어 주세요.',
  events: '옆 영상에서 착지와 릴리스를 찾지 못했어요. 옆(3루 쪽)에서 찍은 영상이 맞나요?',
  sync: '두 영상의 시간을 맞추지 못했어요. 같은 공을 찍은 두 영상인지 봐 주세요.',
  range: '두 영상이 찍은 구간이 달라요. 두 영상 모두 준비 자세부터 팔로스루까지 찍어 주세요.',
  calibration: '두 카메라의 위치를 찾지 못했어요. 두 폰 사이 각도를 60~120°로 해서 다시 찍어 주세요.',
};

export const WARNING_TEXT: Record<WarningCode, string> = {
  density: '장면이 적어 순간이 조금 어긋날 수 있어요.',
  narrow: '두 카메라 사이 각도가 좁아 깊이가 덜 정확해요.',
  focal: '카메라 확대 정도를 정확히 몰라 오차 범위를 넓혔어요.',
  vertical: '폰이 기울어 찍혀 몸통 기울기가 덜 정확해요.',
  backCamera: '뒤 카메라가 홈 방향에서 비켜 있어요.',
  screen: '화면 녹화라 시간 지표는 뺐어요. 슬로모 fps 를 적으면 나와요.',
  consistency: '두 영상의 관절이 잘 맞지 않아 값이 덜 정확해요. 참고만 해 주세요.',
};

/** 1차 보정에 쓰는 관절 — 좌우가 덜 뒤바뀌는 몸통 · 다리(R3) */
const PASS1_JOINTS = [J.nose, J.lSh, J.rSh, J.lHip, J.rHip, J.lKn, J.rKn, J.lAn, J.rAn];
/** 2차 보정 관절 — 손목 · 뒤꿈치 · 발끝(흐림 · 작음)은 뺀다 */
const CALIB_JOINTS = [J.nose, J.lSh, J.rSh, J.lEl, J.rEl, J.lHip, J.rHip, J.lKn, J.rKn, J.lAn, J.rAn];
const ALL_JOINTS = Array.from({ length: N_JOINTS }, (_, j) => j);
/** 결과에 남기는 장면 상한(검토 R9 — analysis.json 300KB 밑) */
const MAX_FRAMES = 400;
/** 장면 밀도(초당) 경고 문턱(검토 R1) */
const DENSITY_MIN = 20;

type Synced = { i: number; t: number; side: Obs[]; back: Obs[] };

const fail = (code: FailCode, quality?: Partial<Pitch3dQuality>): Pitch3dFail => ({
  ok: false,
  version: PITCH3D_VERSION,
  code,
  reason: FAIL_TEXT[code],
  ...(quality ? { quality } : {}),
});

function calibInput(synced: Synced[], side: View, back: View, use: number[], bones: typeof BONES) {
  const frames: CalibFrame[] = synced.map((s) => ({ side: s.side, back: s.back }));
  return {
    frames,
    sideSize: { W: side.W, H: side.H },
    backSize: { W: back.W, H: back.H },
    use,
    bones: bones.map((b) => [b.a, b.b, BONE_WEIGHT[b.group]] as [number, number, number]),
    personSide: side.person,
    personBack: back.person,
  };
}

const swapIn = (p: Obs[], pairs: [number, number][]) => {
  const o = [...p];
  for (const [a, b] of pairs) [o[a], o[b]] = [o[b], o[a]];
  return o;
};

export function analyzePitch3d(input: Pitch3dInput): Pitch3dResult {
  const { hand } = input;
  const sideEv = detectPitchEvents(input.side);
  const ev = input.events ?? {
    kneeUp: sideEv.kneeUp?.t ?? null,
    footPlant: sideEv.footPlant?.t ?? NaN,
    release: sideEv.release?.t ?? NaN,
  };
  if (!Number.isFinite(ev.footPlant) || !Number.isFinite(ev.release) || ev.release <= ev.footPlant) return fail('events');

  const side = prepareView(input.side);
  let back = prepareView(input.back);
  if (side.frames.length < 20 || back.frames.length < 20) return fail('short');

  /* 시간 맞추기 + 덮임 검사 — 니업(없으면 착지 전 '착지~릴리스'의 3배)부터 릴리스 뒤 조금까지가 모두 붙어야 한다 */
  const span = ev.release - ev.footPlant;
  const needFrom = Math.min(ev.kneeUp ?? Infinity, ev.footPlant - span * 3);
  const needTo = ev.release + span * 0.3;
  const sync = syncViews(side, back, [needFrom, needTo]);
  if (sync.backMirrored) back = mirrorView(back);
  const needed = side.frames.map((f, i) => ({ f, i })).filter(({ f }) => f.t >= needFrom && f.t <= needTo);
  const covered = needed.filter(({ i }) => sync.backTime[i] != null).length / Math.max(1, needed.length);
  const q0: Partial<Pitch3dQuality> = {
    density: { side: side.density, back: back.density },
    coverage: covered,
    syncCost: sync.cost,
  };
  /* 에피폴라 잔차가 사람 크기의 3% 를 넘으면 같은 순간을 못 찾은 것 */
  if (!Number.isFinite(sync.cost) || sync.cost > 0.03) return fail('sync', q0);
  if (covered < 0.9) return fail('range', q0);

  const backDt = medianStep(back);
  const sideDt = medianStep(side);
  let backTime = sync.backTime;
  const buildSynced = (): Synced[] => {
    const out: Synced[] = [];
    side.frames.forEach((f, i) => {
      const bt = backTime[i];
      if (bt == null) return;
      const b = backAt(back, bt, backDt);
      if (b) out.push({ i, t: f.t, side: f.p, back: b });
    });
    return out;
  };
  const trunkLegs = BONES.filter((b) => b.group === 'trunk' || b.group === 'legs');

  /* 보정 1차(몸통 · 다리) */
  let cal: Calibration | null = calibrate(calibInput(buildSynced(), side, back, PASS1_JOINTS, trunkLegs));
  if (!cal) return fail('calibration', q0);

  /*
   * 시간 다시 맞추기 — 카메라를 안 뒤에는 '같은 순간이면 두 시선이 한 점에서 만난다'가 DTW 보다 훨씬 날카로운 단서다.
   * 장면마다 뒤 시각을 ±3장면 안에서 다시 비춤 오차가 가장 작은 곳으로 옮기고(빠른 팔 · 다리가 시간을 붙잡는다), 매끈 · 단조로 다듬는다.
   */
  const dtwTime = backTime;
  backTime = refineSync(side, back, backTime, cal, backDt, PASS1_JOINTS);

  /* 좌우 다시 고침(R3) — 장면 · 묶음마다 그대로 / 뒤집음 중 다시 비춤이 30% 넘게 작은 쪽(뒤 영상 먼저, 그다음 옆) */
  const repaired =
    repairLabels(back, side, invertTimes(side, backTime), sideDt, cal, 'back') +
    repairLabels(side, back, (t) => timeAt(side, backTime, t), backDt, cal, 'side');
  backTime = refineSync(side, back, backTime, cal, backDt, ALL_JOINTS);

  /* 보정 2차(모든 관절) → 시간 한 번 더 */
  cal = calibrate(calibInput(buildSynced(), side, back, CALIB_JOINTS, trunkLegs)) ?? cal;
  backTime = refineSync(side, back, backTime, cal, backDt, ALL_JOINTS);
  const synced = buildSynced();
  const shifts = side.frames.flatMap((_, i) =>
    backTime[i] != null && dtwTime[i] != null ? [backTime[i]! - dtwTime[i]!] : []
  );
  const offsetFrames = Math.round((median(shifts.map(Math.abs)) / backDt) * 10) / 10;

  /* 3D — 두 영상 다 보이면 교차, 한쪽만 믿을 만하면 그 시선 위 · 부모로부터 뼈 길이만큼(R4) */
  const raw: Frame3[] = synced.map((s) =>
    s.side.map((a, j) => {
      const b = s.back[j];
      return a.v >= 0.3 && b.v >= 0.3 ? triangulate(cal!.side, a, cal!.back, b) : null;
    })
  );
  const boneLen = new Map<number, number>();
  for (const [childS, parentS] of Object.entries(PARENT)) {
    const c = Number(childS);
    const p = parentS;
    const ls: number[] = [];
    synced.forEach((s, k) => {
      const ok = (j: number) => s.side[j].v >= 0.7 && s.back[j].v >= 0.7;
      if (ok(c) && ok(p) && raw[k][c] && raw[k][p]) ls.push(norm(sub(raw[k][c]!, raw[k][p]!)));
    });
    if (ls.length >= 5) boneLen.set(c, median(ls));
  }
  /*
   * 뿌리가 둘이면(시선이 부모 둘레 구와 두 번 만남): ① 부모가 좌우 짝이면 가려진 영상의 카메라에서 더 먼 쪽(그 짝 뒤에 있다) — 깊이가 크게
   * 다를 때(뼈 길이의 15%) ② 아니면 교차로 얻은 점에 가까운 쪽(두 뿌리가 가까우면 가운데 쪽으로 당김). 교차점에 가까운 쪽만 고르면
   * 지어낸 2D 쪽으로 끌려 닫힌 자세에서 어깨선이 거울로 뒤집혔다(합성 꼬임 170°).
   */
  const prevFixed: (Vec3 | null)[] = new Array(N_JOINTS).fill(null);
  const fixed: Frame3[] = raw.map((pts, k) => {
    const s = synced[k];
    const out = pts.map((X, j) => {
      const p = PARENT[j];
      const L = boneLen.get(j);
      if (p == null || L == null) return X;
      const a = s.side[j];
      const b = s.back[j];
      const parentOk = s.side[p].v >= 0.7 && s.back[p].v >= 0.7 && pts[p];
      if (!parentOk) return X;
      const sideOnly = a.v >= 0.7 && b.v < 0.5;
      const backOnly = b.v >= 0.7 && a.v < 0.5;
      if (!sideOnly && !backOnly) return X;
      const r = sideOnly ? ray(cal!.side, a.x, a.y) : ray(cal!.back, b.x, b.y);
      const roots = rootsOnRay(r, pts[p]!, L);
      if (roots.length === 0) return pointOnRayAtDistance(r, pts[p]!, L, X ?? pts[p]!);
      if (roots.length === 1) return roots[0];
      /* 부모가 좌우 짝(어깨 · 골반)일 때만: 가려졌다 = 그 짝 뒤에 있다 → 가린 카메라에서 더 먼 뿌리 */
      if (PARENT[p] === j) {
        const hidden = sideOnly ? cal!.back : cal!.side;
        const depth = (P: Vec3) => dot(row(hidden.R, 2), P) + hidden.t[2];
        const d0 = depth(roots[0]);
        const d1 = depth(roots[1]);
        if (Math.abs(d0 - d1) > 0.15 * L) return d0 > d1 ? roots[0] : roots[1];
      }
      /*
       * 그 밖에는 교차로 얻은 점에 가까운 뿌리 — 다만 두 뿌리가 가까울수록(시선이 구를 스치듯 지남) 고르기가 불확실해 가운데 쪽으로
       * 당긴다(간격이 뼈 길이의 15% 밑이면 가운데, 50% 넘으면 그 뿌리). 늘 가운데로 하면 어깨가 11cm 틀려 몸통 기울기가 6° 틀렸고
       * (간격 0.5L), 늘 가까운 뿌리로 하면 거의 접할 때 반대쪽으로 튀었다(합성).
       */
      const ref = X ?? prevFixed[j] ?? pts[p]!;
      const near = norm(sub(roots[0], ref)) <= norm(sub(roots[1], ref)) ? roots[0] : roots[1];
      const midP: Vec3 = [(roots[0][0] + roots[1][0]) / 2, (roots[0][1] + roots[1][1]) / 2, (roots[0][2] + roots[1][2]) / 2];
      const wgt = Math.max(0, Math.min(1, (norm(sub(roots[0], roots[1])) / L - 0.15) / 0.35));
      return [midP[0] + (near[0] - midP[0]) * wgt, midP[1] + (near[1] - midP[1]) * wgt, midP[2] + (near[2] - midP[2]) * wgt] as Vec3;
    });
    out.forEach((P, j) => {
      if (P) prevFixed[j] = P;
    });
    return out;
  });

  /*
   * 던지는 손 확인 — 착지 ~ 릴리스 뒤 사이 3D 손목이 지나간 길이가 던지는 손(촬영 정보) 쪽이 아니면, 두 영상이 함께 좌우를 거울로 붙인 것
   * (기하로는 맞아 보정이 못 가른다) — 3D 이름을 통째로 바꾼다.
   */
  let handSwapped = false;
  {
    const fpK = synced.findIndex((x) => x.t >= ev.footPlant);
    const relK = synced.findIndex((x) => x.t >= ev.release);
    const k0 = Math.max(1, (fpK < 0 ? 0 : fpK) - 2);
    const k1 = Math.min(fixed.length - 1, (relK < 0 ? fixed.length - 1 : relK) + 4);
    /*
     * 다듬은(5장면 중앙값) 손목이 그 구간에 지나간 길이 — 순간 최대 속도는 흐린 손목의 튐 하나에 뒤집혀, 맞는 이름을 통째로 바꾼
     * 일이 있었다(합성 씨앗 4: 보폭 135% 틀림). 바꾸는 쪽이 훨씬 위험해 1.4배 넘게 차이 날 때만 바꾼다.
     */
    const pathLen = (j: number) => {
      const pts: Vec3[] = [];
      for (let k = k0; k <= k1; k++) {
        const win: Vec3[] = [];
        for (let q = k - 2; q <= k + 2; q++) if (q >= 0 && q < fixed.length && fixed[q][j]) win.push(fixed[q][j]!);
        if (win.length < 3) continue;
        pts.push([0, 1, 2].map((d) => median(win.map((w) => w[d]))) as Vec3);
      }
      let len = 0;
      for (let k = 1; k < pts.length; k++) len += norm(sub(pts[k], pts[k - 1]));
      return len;
    };
    const thr = hand === 'L' ? J.lWr : J.rWr;
    const glv = hand === 'L' ? J.rWr : J.lWr;
    if (pathLen(glv) > pathLen(thr) * 1.4) {
      handSwapped = true;
      for (const fr of fixed) for (const [x, y] of [...ARM_PAIRS, ...LEG_PAIRS]) [fr[x], fr[y]] = [fr[y], fr[x]];
    }
  }

  /* 다듬기 — 관절 · 좌표마다 Savitzky–Golay(창 5) */
  const smooth: Frame3[] = fixed.map((p) => p.map(() => null));
  for (let j = 0; j < N_JOINTS; j++) {
    for (let d = 0; d < 3; d++) {
      const s = savgol5(fixed.map((p) => (p[j] ? p[j]![d] : null)));
      s.forEach((v, k) => {
        if (v == null) return;
        smooth[k][j] ??= [0, 0, 0];
        smooth[k][j]![d] = v;
      });
    }
  }

  /* 순간 — 옆 영상 시각에 가장 가까운 장면 */
  const nearest = (t: number) => {
    let best = 0;
    synced.forEach((s, k) => {
      if (Math.abs(s.t - t) < Math.abs(synced[best].t - t)) best = k;
    });
    return best;
  };
  const evIdx = {
    kneeUp: ev.kneeUp != null && ev.kneeUp >= synced[0].t ? nearest(ev.kneeUp) : null,
    footPlant: nearest(ev.footPlant),
    release: nearest(ev.release),
  };

  /* 품질 */
  const boneCv = { trunk: 0, legs: 0, upperArm: 0, forearm: 0 };
  for (const g of ['trunk', 'legs', 'upperArm', 'forearm'] as const) {
    const cvs = BONES.filter((b) => b.group === g)
      .map((b) => robustCv(smooth.flatMap((p) => (p[b.a] && p[b.b] ? [norm(sub(p[b.a]!, p[b.b]!))] : []))))
      .filter(Number.isFinite);
    boneCv[g] = cvs.length ? Math.round((cvs.reduce((a, c) => a + c, 0) / cvs.length) * 1000) / 10 : NaN;
  }
  const spread = cal.focalSpread;
  const quality: Pitch3dQuality = {
    reprojPct: Math.round(cal.reproj * 1000) / 10,
    boneCv,
    axisAngleDeg: Math.round(cal.axisAngleDeg),
    focal: {
      side: Math.round((cal.side.f / Math.max(side.W, side.H)) * 100) / 100,
      back: Math.round((cal.back.f / Math.max(back.W, back.H)) * 100) / 100,
      spread: Math.round(spread * 100) / 100,
    },
    density: { side: Math.round(side.density * 10) / 10, back: Math.round(back.density * 10) / 10 },
    coverage: Math.round(covered * 100) / 100,
    syncCost: Math.round(sync.cost * 1000) / 1000,
    calibration: spread <= 0.2 ? 'high' : spread <= 0.45 ? 'medium' : 'low',
    flips: { side: side.flips, back: back.flips, repaired, handSwapped, backMirrored: sync.backMirrored },
    travelVsBackDeg: null,
    offsetFrames,
  };
  if (cal.reproj > 0.06 || !(boneCv.trunk < 20)) return fail('calibration', quality);

  const axes = worldAxes(cal.side, cal.back, smooth, hand, {
    start: evIdx.kneeUp ?? 0,
    footPlant: evIdx.footPlant,
  });
  quality.travelVsBackDeg = axes.travelVsBackDeg == null ? null : Math.round(axes.travelVsBackDeg);
  const H = bodyHeight(smooth, axes.U, evIdx.kneeUp ?? Math.min(5, smooth.length - 1));
  if (!H || !(H > 0)) return fail('calibration', quality);

  const warnings = new Set<WarningCode>();
  if (Math.min(side.density, back.density) < DENSITY_MIN) warnings.add('density');
  if (cal.axisAngleDeg < 45 || cal.axisAngleDeg > 135) warnings.add('narrow');
  if (spread > 0.45) warnings.add('focal');
  for (const w of axes.warnings) warnings.add(w as WarningCode);

  /* 착지 → 릴리스 시간: 원본이면 영상 시간 그대로(장면이 촘촘할 때), 화면 녹화면 슬로모 fps 를 알 때만(재생 30fps 가정) */
  let plantMs: number | null = null;
  const dtMedia = synced[evIdx.release].t - synced[evIdx.footPlant].t;
  if (input.screenRecorded !== false) {
    if (input.slowmoFps) plantMs = dtMedia * (30 / input.slowmoFps) * 1000;
    else warnings.add('screen');
  } else if (side.density >= 50) plantMs = dtMedia * 1000;

  /* 1단계 기준(검토 D8): 다시 비춤 2% · 몸통 · 다리 뼈 흔들림 7% — 넘으면 두 영상이 덜 맞은 것 */
  const inconsistent = quality.reprojPct > 2 || boneCv.trunk > 7 || boneCv.legs > 7;
  if (inconsistent) warnings.add('consistency');
  const axisAngle = cal.axisAngleDeg;
  const factors: PmFactors = {
    calibration: quality.calibration === 'high' ? 1 : quality.calibration === 'medium' ? 1.25 : 1.5,
    narrow: axisAngle < 45 || axisAngle > 135 ? 1.5 : axisAngle < 60 || axisAngle > 120 ? 1.2 : 1,
    density: Math.min(side.density, back.density) < DENSITY_MIN ? 1.3 : 1,
    vertical: warnings.has('vertical') ? 1.5 : 1,
    consistency: inconsistent ? 1.6 : 1,
  };
  const metrics = computeMetrics(smooth, { ...axes, hand, height: H }, evIdx, factors, plantMs);

  /* 결과 좌표 — [앞, 위, 오른쪽] · 키 = 1 · 원점 = 착지 때 뒷발목, 높이 0 = 가장 낮은 발목 */
  const R3: Vec3 = cross(axes.F, axes.U);
  const backAn = hand === 'L' ? J.lAn : J.rAn;
  const origin = smooth[evIdx.footPlant][backAn] ?? smooth[evIdx.footPlant][J.lHip] ?? [0, 0, 0];
  let ground = Infinity;
  for (const p of smooth) for (const j of [J.lAn, J.rAn]) if (p[j]) ground = Math.min(ground, dot(sub(p[j]!, origin), axes.U));
  if (!Number.isFinite(ground)) ground = 0;
  const keep = decimate(smooth.length, MAX_FRAMES, [evIdx.footPlant, evIdx.release, evIdx.kneeUp]);
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const joints = keep.map((k) =>
    smooth[k].map((P) => {
      if (!P) return null;
      const d = sub(P, origin);
      return [r3(dot(d, axes.F) / H), r3((dot(d, axes.U) - ground) / H), r3(dot(d, R3) / H)];
    })
  );
  const remap = (k: number | null) => (k == null ? null : keep.indexOf(k));
  return {
    ok: true,
    version: PITCH3D_VERSION,
    hand,
    t: keep.map((k) => Math.round(synced[k].t * 1000) / 1000),
    joints,
    events: { kneeUp: remap(evIdx.kneeUp), footPlant: remap(evIdx.footPlant)!, release: remap(evIdx.release)! },
    metrics,
    quality,
    warnings: [...warnings],
  };
}


/** 옆 장면 시각 t 에 해당하는 뒤 시각(옆 장면 사이 보간) */
function timeAt(side: View, backTime: (number | null)[], t: number): number | null {
  const fr = side.frames;
  let lo = -1;
  for (let i = 0; i < fr.length; i++) {
    if (fr[i].t <= t && backTime[i] != null) lo = i;
    if (fr[i].t > t) break;
  }
  if (lo < 0 || backTime[lo] == null) return null;
  let hi = lo + 1;
  while (hi < fr.length && backTime[hi] == null) hi++;
  if (hi >= fr.length) return fr[lo].t === t ? backTime[lo] : null;
  const u = (t - fr[lo].t) / (fr[hi].t - fr[lo].t || 1);
  return backTime[lo]! + (backTime[hi]! - backTime[lo]!) * u;
}

/** 뒤 시각 → 옆 시각(단조 대응을 뒤집어 보간) */
function invertTimes(side: View, backTime: (number | null)[]) {
  const pairs = side.frames.flatMap((f, i) => (backTime[i] != null ? [[backTime[i]!, f.t] as [number, number]] : []));
  return (bt: number): number | null => {
    if (pairs.length < 2 || bt < pairs[0][0] || bt > pairs.at(-1)![0]) return null;
    let k = 1;
    while (k < pairs.length - 1 && pairs[k][0] < bt) k++;
    const [b0, s0] = pairs[k - 1];
    const [b1, s1] = pairs[k];
    return b1 > b0 ? s0 + ((bt - b0) / (b1 - b0)) * (s1 - s0) : s0;
  };
}

/** 장면 한 쌍의 다시 비춤 오차(관절 평균, 사람 비율) — 관절이 4개 밑이면 null */
function pairReproj(cal: Calibration, a: Obs[], b: Obs[], joints: number[], ps: number, pb: number): number | null {
  let s = 0;
  let n = 0;
  for (const j of joints) {
    if (a[j].v < 0.5 || b[j].v < 0.5) continue;
    const X = triangulate(cal.side, a[j], cal.back, b[j]);
    const pa = X && project(cal.side, X);
    const pbb = X && project(cal.back, X);
    if (!pa || !pbb) {
      s += 1;
      n++;
      continue;
    }
    s += Math.min(1, Math.hypot(pa[0] - a[j].x, pa[1] - a[j].y) / ps + Math.hypot(pbb[0] - b[j].x, pbb[1] - b[j].y) / pb);
    n++;
  }
  return n >= 4 ? s / n : null;
}

/**
 * 장면마다 뒤 시각을 ±3장면(반 장면 간격) 안에서 다시 비춤이 가장 작은 곳으로 — 포물선으로 칸 사이까지. 비용이 평평한 장면(움직임이
 * 거의 없음)은 덜 믿고, 이웃 9장면 가중 중앙값 → 5장면 평균 → 단조로 다듬는다.
 */
/* 시험 · 진단용으로도 내보낸다 */
export function refineSync(side: View, back: View, backTime: (number | null)[], cal: Calibration, backDt: number, joints: number[]) {
  const steps = Array.from({ length: 25 }, (_, k) => ((k - 12) * backDt) / 4);
  const shift: (number | null)[] = [];
  const weight: number[] = [];
  side.frames.forEach((f, i) => {
    const bt = backTime[i];
    if (bt == null) {
      shift.push(null);
      weight.push(0);
      return;
    }
    const e = steps.map((d) => {
      const b = backAt(back, bt + d, backDt);
      return b ? pairReproj(cal, f.p, b, joints, side.person, back.person) : null;
    });
    let k = -1;
    e.forEach((v, q) => {
      if (v != null && (k < 0 || v < e[k]!)) k = q;
    });
    if (k < 0) {
      shift.push(null);
      weight.push(0);
      return;
    }
    let d = steps[k];
    const l = e[k - 1];
    const r = e[k + 1];
    if (l != null && r != null) {
      const den = l - 2 * e[k]! + r;
      if (den > 1e-12) d += (((l - r) / (2 * den)) * backDt) / 4;
    }
    const vals = e.filter((v): v is number => v != null);
    const mean = vals.reduce((a, v) => a + v, 0) / vals.length;
    shift.push(d);
    weight.push(Math.max(0, (mean - e[k]!) / (mean || 1)));
  });
  /*
   * 강건 국소 직선(±30장면, tricube × 날카로움 × Huber 두 번) — 시간 대응은 원래 매끈하다(속도비 + 느린 휨). 장면마다 따로 다듬으면
   * 릴리스 근처(손목 흐림 · 뒤바뀜)의 치우친 추정이 그대로 남아 9~18ms 어긋났다(합성). 넓게 맞추면 그 구간도 앞뒤 장면이 붙잡는다.
   */
  const t = side.frames.map((f) => f.t);
  const HALF = 30;
  const fitAt = (i: number, rw: number[]) => {
    let sw = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    const lo = Math.max(0, i - HALF);
    const hi = Math.min(shift.length - 1, i + HALF);
    for (let k = lo; k <= hi; k++) {
      const y = shift[k];
      if (y == null || !(weight[k] > 0)) continue;
      const u = Math.abs(k - i) / (HALF + 1);
      const w = weight[k] * (1 - u * u * u) ** 3 * rw[k];
      const x = t[k] - t[i];
      sw += w;
      sx += w * x;
      sy += w * y;
      sxx += w * x * x;
      sxy += w * x * y;
    }
    if (!(sw > 0)) return null;
    const den = sw * sxx - sx * sx;
    if (Math.abs(den) < 1e-18) return sy / sw;
    const slope = (sw * sxy - sx * sy) / den;
    return (sy - slope * sx) / sw;
  };
  /*
   * 먼저 전체를 강건 직선 하나로(시간 대응 = 속도비 + 시작 차이, 화면 녹화 슬로모는 대개 한 직선) — 릴리스 근처는 손목 흐림으로 장면
   * 추정이 약해 국소 회귀만 쓰면 13~22ms 밀렸다(합성 '폰 숙임'). 국소 회귀가 직선에서 크게 벗어나면(슬로모 램프 같은 휨) 그것으로.
   */
  const huberFit = (fit: (i: number, rw: number[]) => number | null) => {
    let rw = shift.map(() => 1);
    let est: number[] = shift.map(() => 0);
    for (let pass = 0; pass < 3; pass++) {
      est = shift.map((_, i) => fit(i, rw) ?? 0);
      const c = backDt / 2;
      rw = shift.map((y, i) => {
        if (y == null) return 0;
        const r = Math.abs(y - est[i]);
        return r <= c ? 1 : c / r;
      });
    }
    return { est, rw };
  };
  const globalFit = (_: number, rw: number[]) => {
    let sw = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    shift.forEach((y, k) => {
      if (y == null || !(weight[k] > 0)) return;
      const w = weight[k] * rw[k];
      sw += w;
      sx += w * t[k];
      sy += w * y;
      sxx += w * t[k] * t[k];
      sxy += w * t[k] * y;
    });
    if (!(sw > 0)) return null;
    const den = sw * sxx - sx * sx;
    const slope = Math.abs(den) < 1e-18 ? 0 : (sw * sxy - sx * sy) / den;
    const icpt = (sy - slope * sx) / sw;
    return { slope, icpt };
  };
  let line: { slope: number; icpt: number } | null = null;
  const g = huberFit((i, rw) => {
    line = globalFit(i, rw);
    return line ? line.icpt + line.slope * t[i] : null;
  });
  /* 국소 회귀가 직선에서 반 장면 넘게 벗어나는 장면이 ¼ 넘으면 실제 휨 — 그때만 국소 회귀 */
  const loc = huberFit(fitAt).est;
  const bent = shift.filter((y, k) => y != null && Math.abs(loc[k] - g.est[k]) > backDt / 2).length;
  const sm = bent > shift.filter((y) => y != null).length / 4 ? loc : g.est;
  const out = backTime.map((bt, i) => (bt == null ? null : bt + sm[i]));
  /* 단조 — 앞 장면보다 늦게 */
  let last = -Infinity;
  return out.map((v) => {
    if (v == null) return null;
    last = Math.max(last + 1e-6, v);
    return last;
  });
}

/**
 * 좌우 다시 고침(R3) — target 영상의 장면마다 다른 영상(other)을 대응 시각으로 보간해, 팔 · 다리 묶음을 뒤집는 쪽이 다시 비춤이 30% 넘게
 * 작으면 그 장면의 이름을 바꾼다. 돌려주는 값 = 고친 횟수.
 */
function repairLabels(
  target: View,
  other: View,
  otherTimeOf: (t: number) => number | null,
  otherDt: number,
  cal: Calibration,
  which: 'side' | 'back'
): number {
  let n = 0;
  for (const f of target.frames) {
    const ot = otherTimeOf(f.t);
    if (ot == null) continue;
    const o = backAt(other, ot, otherDt);
    if (!o) continue;
    for (const pairs of [ARM_PAIRS, LEG_PAIRS]) {
      const joints = pairs.flat();
      const err = (p: Obs[]) =>
        which === 'back'
          ? pairReproj(cal, o, p, joints, other.person, target.person)
          : pairReproj(cal, p, o, joints, target.person, other.person);
      const keep = err(f.p);
      const sw = swapIn(f.p, pairs);
      const flip = err(sw);
      if (keep != null && flip != null && flip < keep * 0.7) {
        f.p = sw;
        n++;
      }
    }
  }
  return n;
}

/** n 장면 중 max 개를 고르게 — 꼭 남길 장면(순간)은 넣는다 */
function decimate(n: number, max: number, must: (number | null)[]): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const set = new Set<number>();
  for (let k = 0; k < max; k++) set.add(Math.round((k * (n - 1)) / (max - 1)));
  for (const m of must) if (m != null) set.add(m);
  return [...set].sort((a, b) => a - b);
}

/* ───────────────────────────── 저장 · 읽기 ───────────────────────────── */

/** analysis.json 상한(검토 R9 — 서버 동작 본문 1MB 밑) */
export const MAX_STORED_BYTES = 900_000;

const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/**
 * 저장된(또는 브라우저가 보낸) 결과를 읽는다 — 판 번호 · 모양 · 숫자가 맞지 않으면 null(신뢰 경계, 서버 동작이 쓴다).
 */
export function readPitch3dResult(raw: unknown): Pitch3dResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(r.version)) return null;
  if (r.ok === false) {
    if (typeof r.code !== 'string' || !(r.code in FAIL_TEXT)) return null;
    return { ok: false, version: r.version, code: r.code as FailCode, reason: FAIL_TEXT[r.code as FailCode] };
  }
  if (r.ok !== true || (r.hand !== 'R' && r.hand !== 'L')) return null;
  const t = r.t;
  const joints = r.joints;
  if (!Array.isArray(t) || !Array.isArray(joints) || t.length !== joints.length || t.length === 0 || t.length > MAX_FRAMES + 3)
    return null;
  if (!t.every(isNum)) return null;
  for (const fr of joints) {
    if (!Array.isArray(fr) || fr.length !== N_JOINTS) return null;
    for (const p of fr) if (p !== null && !(Array.isArray(p) && p.length === 3 && p.every(isNum))) return null;
  }
  const e = r.events as Record<string, unknown> | undefined;
  const okIdx = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < t.length;
  if (!e || !okIdx(e.footPlant) || !okIdx(e.release) || !(e.kneeUp === null || okIdx(e.kneeUp))) return null;
  if (!Array.isArray(r.metrics)) return null;
  for (const m of r.metrics as Record<string, unknown>[]) {
    if (!m || typeof m.key !== 'string' || !isNum(m.value) || !isNum(m.pm)) return null;
  }
  if (!r.quality || typeof r.quality !== 'object') return null;
  if (!Array.isArray(r.warnings) || !r.warnings.every((w) => typeof w === 'string' && w in WARNING_TEXT)) return null;
  return raw as Pitch3dOk;
}
