import type { PoseTrack } from '@/lib/pose/types';
import type { Obs } from '@/lib/pitch-3d/camera';
import { eigenSym, median } from '@/lib/pitch-3d/linalg';

/**
 * 한 영상의 관절 다듬기 · 두 영상 시간 맞추기 · 시간 축 다듬기(설계 3절 1 · 2 · 5, 검토 R1 · R3).
 * 관절은 MediaPipe 33개 중 17개만 쓴다(JOINTS 의 순번이 이 엔진의 관절 번호).
 */

/** MediaPipe 번호 — 코 · 어깨 · 팔꿈치 · 손목 · 골반 · 무릎 · 발목 · 뒤꿈치 · 발끝 */
export const JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32] as const;
export const J = {
  nose: 0,
  lSh: 1,
  rSh: 2,
  lEl: 3,
  rEl: 4,
  lWr: 5,
  rWr: 6,
  lHip: 7,
  rHip: 8,
  lKn: 9,
  rKn: 10,
  lAn: 11,
  rAn: 12,
  lHe: 13,
  rHe: 14,
  lTo: 15,
  rTo: 16,
} as const;
export const N_JOINTS = JOINTS.length;

/** 좌우 짝(엔진 번호) — 팔 묶음 · 다리 묶음 */
export const ARM_PAIRS: [number, number][] = [
  [J.lSh, J.rSh],
  [J.lEl, J.rEl],
  [J.lWr, J.rWr],
];
export const LEG_PAIRS: [number, number][] = [
  [J.lHip, J.rHip],
  [J.lKn, J.rKn],
  [J.lAn, J.rAn],
  [J.lHe, J.rHe],
  [J.lTo, J.rTo],
];
/** 몸 전체 좌우 짝(MediaPipe 33개 기준 — 얼굴 · 손가락까지 함께 바꾼다) */
const MP_SWAP: [number, number][] = [
  [1, 4],
  [2, 5],
  [3, 6],
  [7, 8],
  [9, 10],
  [11, 12],
  [13, 14],
  [15, 16],
  [17, 18],
  [19, 20],
  [21, 22],
  [23, 24],
  [25, 26],
  [27, 28],
  [29, 30],
  [31, 32],
];

/**
 * 뼈 [a, b, 무리] — 무리: trunk(몸통) · legs · upperArm · forearm. 강체성 가중과 부위별 흔들림 기준(검토 D8)에 쓴다.
 * 몸통 옆(어깨 → 같은 쪽 골반)은 넣지 않는다 — 골반-어깨가 꼬이면 실제로 길이가 변한다(강체가 아니다).
 */
export const BONES: { a: number; b: number; group: 'trunk' | 'legs' | 'upperArm' | 'forearm' }[] = [
  { a: J.lSh, b: J.rSh, group: 'trunk' },
  { a: J.lHip, b: J.rHip, group: 'trunk' },
  { a: J.lHip, b: J.lKn, group: 'legs' },
  { a: J.rHip, b: J.rKn, group: 'legs' },
  { a: J.lKn, b: J.lAn, group: 'legs' },
  { a: J.rKn, b: J.rAn, group: 'legs' },
  { a: J.lSh, b: J.lEl, group: 'upperArm' },
  { a: J.rSh, b: J.rEl, group: 'upperArm' },
  { a: J.lEl, b: J.lWr, group: 'forearm' },
  { a: J.rEl, b: J.rWr, group: 'forearm' },
];
export const BONE_WEIGHT = { trunk: 1, legs: 0.8, upperArm: 0.5, forearm: 0.25 } as const;

/** 부모 관절(검토 R4 — 한 영상에서만 보이는 관절을 부모로부터 뼈 길이만큼에 둘 때). 어깨 · 골반은 반대쪽 짝이 부모 */
export const PARENT: Record<number, number> = {
  [J.lSh]: J.rSh,
  [J.rSh]: J.lSh,
  [J.lHip]: J.rHip,
  [J.rHip]: J.lHip,
  [J.lEl]: J.lSh,
  [J.rEl]: J.rSh,
  [J.lWr]: J.lEl,
  [J.rWr]: J.rEl,
  [J.lKn]: J.lHip,
  [J.rKn]: J.rHip,
  [J.lAn]: J.lKn,
  [J.rAn]: J.rKn,
  [J.lHe]: J.lAn,
  [J.rHe]: J.rAn,
  [J.lTo]: J.lAn,
  [J.rTo]: J.rAn,
};

export type ViewFrame = { t: number; p: Obs[] };

export type View = {
  frames: ViewFrame[];
  W: number;
  H: number;
  /** 사람 높이(px, 코~발목 세로의 75% 값) */
  person: number;
  /** 초당 장면 수 = 1 / 장면 간격 중앙값(검토 R1 — 20 밑이면 경고) */
  density: number;
  /** 같은 장면이라 뺀 비율 */
  dupRatio: number;
  /** 던지는 손 기준으로 몸 전체 좌우를 바꿨나 */
  swapped: boolean;
  /** 장면 · 묶음별로 좌우를 고친 횟수 */
  flips: number;
};

const swapPairs = (p: Obs[], pairs: [number, number][]) => {
  const o = [...p];
  for (const [a, b] of pairs) [o[a], o[b]] = [o[b], o[a]];
  return o;
};

const dist = (a: Obs, b: Obs) => Math.hypot(a.x - b.x, a.y - b.y);

/** 묶음의 관절이 앞 장면에서 얼마나 움직였나(신뢰도 가중) */
function groupMove(cur: Obs[], prev: Obs[], pairs: [number, number][]) {
  let s = 0;
  for (const [a, b] of pairs) {
    for (const j of [a, b]) s += dist(cur[j], prev[j]) * Math.min(cur[j].v, prev[j].v);
  }
  return s;
}

/**
 * PoseTrack(0~1 좌표) → 화면 픽셀 장면들. 팔 · 다리 묶음마다 앞 장면과 덜 튀는 쪽을 고르고(R3 의 시간 단서), 같은 장면(화면 녹화
 * 중복)을 뺀다. 몸 전체 좌우(뒤에서 찍으면 거울로 붙기도 한다)는 여기서 정하지 않는다 — 두 영상이 기하로 맞는 쪽(syncViews)과
 * 3D 에서 가장 빠른 손목 = 던지는 손(analyze.ts)으로 정한다. 옆 영상의 '많이 움직인 손목' 판정은 합성 좌투에서 틀렸다.
 */
export function prepareView(track: PoseTrack, mirror = false): View {
  const W = track.videoWidth || 1;
  const H = track.videoHeight || 1;
  const swapped = mirror;
  const raw: ViewFrame[] = [];
  for (const f of track.frames) {
    if (!f.landmarks || f.landmarks.length < 33) continue;
    let lm = f.landmarks.map((l) => ({ x: l.x * W, y: l.y * H, v: l.visibility ?? 0 }));
    if (swapped) lm = swapPairs(lm, MP_SWAP);
    raw.push({ t: f.t, p: JOINTS.map((k) => lm[k]) });
  }
  raw.sort((a, b) => a.t - b.t);

  /*
   * 묶음별 좌우 — 혼자 튄 장면만 고친다: 앞 · 뒤 '원래' 장면 둘과 견줘, 그대로면 둘 모두에서 크게 멀고(관절당 평균 사람 높이의 4%
   * 넘게) 이름을 바꾸면 그 거리가 ⅓ 밑으로 줄 때. 고친 장면을 다음 장면의 기준으로 쓰지 않아 한 번의 실수가 이어지지 않는다 —
   * 앞 장면(고친 것)과만 견주면 놓친 뒤바뀜 하나 뒤로 수백 장면이 줄줄이 바뀌었고, 움직임 최소(Viterbi)는 몸이 돌 때 실제로
   * 엇갈려 지나가는 좌우를 뒤바뀜으로 봤다(합성). 이어진 뒤바뀜 · 남은 것은 두 영상 기하(analyze.ts repairLabels)가 고친다.
   */
  const roughPerson = median(raw.map((f) => Math.max(f.p[J.lAn].y, f.p[J.rAn].y) - f.p[J.nose].y).filter((h) => h > 0)) || H * 0.5;
  let flips = 0;
  const fixed: ViewFrame[] = raw.map((fr, i) => {
    let p = fr.p;
    const prev = raw[i - 1]?.p;
    const next = raw[i + 1]?.p;
    if (prev && next) {
      for (const pairs of [ARM_PAIRS, LEG_PAIRS]) {
        const jump = roughPerson * 0.04 * pairs.length * 2;
        const alt = swapPairs(p, pairs);
        const keep = Math.min(groupMove(p, prev, pairs), groupMove(p, next, pairs));
        const swap = Math.max(groupMove(alt, prev, pairs), groupMove(alt, next, pairs));
        if (keep > jump && swap < keep / 3) {
          p = alt;
          flips++;
        }
      }
    }
    return { t: fr.t, p };
  });

  /* 사람 높이 — 코~발목 세로(장면마다)의 75% 값 */
  const heights = fixed
    .map((f) => Math.max(f.p[J.lAn].y, f.p[J.rAn].y) - f.p[J.nose].y)
    .filter((h) => h > 0)
    .sort((a, b) => a - b);
  const person = heights.length ? heights[Math.floor(heights.length * 0.75)] : H * 0.5;

  /* 같은 장면 빼기 — 몸통 · 다리 관절이 사람 높이의 0.2% 넘게 안 움직였으면 앞 장면과 같다 */
  const CORE = [J.lSh, J.rSh, J.lHip, J.rHip, J.lKn, J.rKn, J.lAn, J.rAn, J.lWr, J.rWr];
  const frames: ViewFrame[] = [];
  for (const f of fixed) {
    const prev = frames.at(-1);
    if (prev) {
      let m = 0;
      for (const j of CORE) m = Math.max(m, dist(f.p[j], prev.p[j]));
      if (m < person * 0.002) continue;
    }
    frames.push(f);
  }
  const gaps = frames.slice(1).map((f, i) => f.t - frames[i].t);
  const gap = median(gaps);
  return {
    frames,
    W,
    H,
    person,
    density: gap > 0 ? 1 / gap : 0,
    dupRatio: fixed.length ? 1 - frames.length / fixed.length : 0,
    swapped,
    flips,
  };
}

/* ───────────────────────────── 시간 맞추기 ───────────────────────────── */

export type SyncResult = {
  /** 옆 장면마다 뒤 영상의 시각(맞지 않은 구간은 null) */
  backTime: (number | null)[];
  /** 맞춘 경로의 평균 차이(몸통 길이 단위) */
  cost: number;
  /** 옆 장면 중 뒤 시각이 붙은 비율 */
  coverage: number;
  /** 뒤 영상 좌우를 거울로 바꿔야 맞았나 */
  backMirrored: boolean;
};

/**
 * 기본 행렬(8점, 픽셀 · Hartley 정규화)로 짝들의 에피폴라 잔차 — Sampson 거리(px)를 사람 크기로 나눠 낮은 80% 평균.
 * 카메라를 몰라도(초점 · 위치) 같은 순간의 짝이면 작고, 시간이 어긋나 몸이 다른 자세면 커진다.
 */
function epipolarScore(pairs: { a: Obs; b: Obs }[], personA: number, personB: number): number {
  if (pairs.length < 16) return Infinity;
  const nrm = (pick: (q: { a: Obs; b: Obs }) => Obs) => {
    let mx = 0;
    let my = 0;
    for (const q of pairs) {
      mx += pick(q).x;
      my += pick(q).y;
    }
    mx /= pairs.length;
    my /= pairs.length;
    let d = 0;
    for (const q of pairs) d += Math.hypot(pick(q).x - mx, pick(q).y - my);
    const k = Math.SQRT2 / (d / pairs.length || 1);
    return { mx, my, k };
  };
  const na = nrm((q) => q.a);
  const nb = nrm((q) => q.b);
  const M = Array.from({ length: 9 }, () => new Array<number>(9).fill(0));
  for (const q of pairs) {
    const x1 = (q.a.x - na.mx) * na.k;
    const y1 = (q.a.y - na.my) * na.k;
    const x2 = (q.b.x - nb.mx) * nb.k;
    const y2 = (q.b.y - nb.my) * nb.k;
    const r = [x2 * x1, x2 * y1, x2, y2 * x1, y2 * y1, y2, x1, y1, 1];
    for (let i = 0; i < 9; i++) for (let j = i; j < 9; j++) M[i][j] += r[i] * r[j];
  }
  for (let i = 0; i < 9; i++) for (let j = 0; j < i; j++) M[i][j] = M[j][i];
  const F = eigenSym(M).vectors[0];
  /* 정규화된 좌표에서 Sampson 거리 → 픽셀(1/k) → 사람 비율 */
  const d: number[] = pairs.map((q) => {
    const x1 = (q.a.x - na.mx) * na.k;
    const y1 = (q.a.y - na.my) * na.k;
    const x2 = (q.b.x - nb.mx) * nb.k;
    const y2 = (q.b.y - nb.my) * nb.k;
    const l0 = F[0] * x1 + F[1] * y1 + F[2];
    const l1 = F[3] * x1 + F[4] * y1 + F[5];
    const l2 = F[6] * x1 + F[7] * y1 + F[8];
    const m0 = F[0] * x2 + F[3] * y2 + F[6];
    const m1 = F[1] * x2 + F[4] * y2 + F[7];
    const num = x2 * l0 + y2 * l1 + l2;
    const den = l0 * l0 + l1 * l1 + m0 * m0 + m1 * m1;
    return den > 0 ? Math.abs(num) / Math.sqrt(den) : 0;
  });
  d.sort((x, y) => x - y);
  const keep = d.slice(0, Math.max(8, Math.floor(d.length * 0.8)));
  /* 정규화 척도의 평균으로 픽셀에 되돌리고 두 사람 크기의 평균으로 나눈다 */
  const pxPerUnit = 2 / (na.k + nb.k);
  return ((keep.reduce((x, y) => x + y, 0) / keep.length) * pxPerUnit) / ((personA + personB) / 2);
}

/** 시간 맞추기에 쓰는 관절 — 몸통 · 다리 · 팔꿈치(손목은 흐림 · 뒤바뀜이 잦아 뺀다) */
const SYNC_JOINTS = [J.nose, J.lSh, J.rSh, J.lEl, J.rEl, J.lHip, J.rHip, J.lKn, J.rKn, J.lAn, J.rAn];

/**
 * 두 영상의 시간 맞추기 — 뒤 시각 = r · 옆 시각 + o 를 넓게 찾는다(속도비 r: 슬로모 배수가 다르면 1 이 아니다).
 * 기준은 '두 카메라의 기하가 맞는가'(에피폴라 잔차) — 위아래 좌표 모양(DTW)은 카메라 높이 · 원근에 따라 영상마다 다르게 찌그러져
 * 폰을 숙이거나 가까이 찍은 합성에서 ±300ms 틀렸다(2026-10-08 진단). 옆 영상의 투구 구간(window)이 모두 덮이는 후보만 본다.
 * 휨(슬로모 램프)은 보정 뒤 장면마다 다시 맞추기(analyze.ts refineSync)가 잡는다.
 */
export function syncViews(side: View, backIn: View, win: [number, number]): SyncResult {
  /* 뒤 영상 좌우 두 경우(그대로 · 거울) 중 에피폴라 잔차가 작은 쪽 */
  const a = syncOnce(side, backIn, win);
  const b = syncOnce(side, mirrorView(backIn), win);
  return b.cost < a.cost * 0.85 ? { ...b, backMirrored: true } : { ...a, backMirrored: false };
}

/** 몸 전체 좌우 이름을 바꾼 영상(새 장면 배열) */
export function mirrorView(v: View): View {
  const all = [...ARM_PAIRS, ...LEG_PAIRS];
  return { ...v, frames: v.frames.map((f) => ({ t: f.t, p: swapPairs(f.p, all) })), swapped: !v.swapped };
}

function syncOnce(side: View, back: View, win: [number, number]): Omit<SyncResult, 'backMirrored'> {
  const n = side.frames.length;
  const m = back.frames.length;
  const none = () => ({ backTime: side.frames.map(() => null), cost: Infinity, coverage: 0 });
  if (n < 10 || m < 10) return none();
  const ts = side.frames.map((f) => f.t);
  const tb0 = back.frames[0].t;
  const tb1 = back.frames[m - 1].t;
  const dtb = medianStep(back);
  /* 점수에 쓸 옆 장면 — 투구 구간에서 고르게 24장 */
  const inWin = side.frames.map((_, i) => i).filter((i) => ts[i] >= win[0] && ts[i] <= win[1]);
  if (inWin.length < 8) return none();
  const pick = (count: number) => {
    const out: number[] = [];
    for (let k = 0; k < count; k++) out.push(inWin[Math.round((k * (inWin.length - 1)) / Math.max(1, count - 1))]);
    return [...new Set(out)];
  };
  const coarseIdx = pick(24);
  const fineIdx = pick(64);
  /* 고른 장면들에서 관절 자리가 퍼진 정도(관절마다 표준편차, 사람 비율의 평균) — 멈춘 구간이면 잡음만큼만 퍼진다 */
  const spread = (frames: Obs[][], person: number) => {
    let sum = 0;
    for (const j of SYNC_JOINTS) {
      let mx = 0;
      let my = 0;
      for (const f of frames) {
        mx += f[j].x;
        my += f[j].y;
      }
      mx /= frames.length;
      my /= frames.length;
      let v = 0;
      for (const f of frames) v += (f[j].x - mx) ** 2 + (f[j].y - my) ** 2;
      sum += Math.sqrt(v / frames.length);
    }
    return sum / SYNC_JOINTS.length / person;
  };
  const score = (r: number, o: number, idx: number[]) => {
    const pairs: { a: Obs; b: Obs }[] = [];
    const backs: Obs[][] = [];
    const used: number[] = [];
    for (const i of idx) {
      const bo = backAt(back, r * ts[i] + o, dtb);
      if (!bo) continue;
      backs.push(bo);
      used.push(i);
      for (const j of SYNC_JOINTS) {
        const a = side.frames[i].p[j];
        if (a.v >= 0.5 && bo[j].v >= 0.5) pairs.push({ a, b: bo[j] });
      }
    }
    /*
     * 뒤 영상이 거의 멈춘 구간(준비 자세)에 짝지으면 뒤 점이 다 같아 어떤 기하로도 잔차가 작다(가짜 해 — 합성에서 실제로 골랐다).
     * 퍼진 정도가 사람의 3.5% 밑이거나 옆의 15% 밑이면 버린다. 뒤 카메라는 투수가 다가가는 방향이라 진짜 짝도 옆의 ⅓쯤만 퍼진다.
     */
    if (used.length < idx.length * 0.6) return Infinity;
    /* 덮임이 적을수록 증거가 적다 — 덜 덮는 후보는 벌점(60% 덮으면 ×1.6). 잡음 속에서 일부만 덮는 틀린 후보가 이겼다(합성 '폰 숙임') */
    const coverPenalty = 1 + 1.5 * (1 - used.length / idx.length);
    const sa = spread(used.map((i) => side.frames[i].p), side.person);
    const sb = spread(backs, back.person);
    if (sb < 0.035 || sb < sa * 0.15 || sa < sb * 0.15) return Infinity;
    return epipolarScore(pairs, side.person, back.person) * coverPenalty;
  };
  let best = { r: 1, o: 0, s: Infinity };
  /*
   * 속도비 0.2 ~ 5(슬로모 30 · 60 · 120 · 240fps 끼리, 원본과 슬로모). 투구 구간이 60% 넘게 뒤 영상 안에 드는 시작 차이 — 덮인 장면만으로
   * 점수를 낸다. 다 덮는 후보만 보면 뒤 영상이 짧을 때 틀린 속도비가 '다 덮는 답'으로 뽑혔다(합성). 덮임이 모자라면 analyze 가 '구간 다름'.
   */
  for (let q = 0; q <= 48; q++) {
    const r = 0.2 * Math.exp((q / 48) * Math.log(5 / 0.2));
    const span = win[1] - win[0];
    const oMin = tb0 - r * (win[0] + span * 0.4);
    const oMax = tb1 - r * (win[1] - span * 0.4);
    for (let o = oMin; o <= oMax; o += dtb * 1.5) {
      const sc = score(r, o, coarseIdx);
      if (sc < best.s) best = { r, o, s: sc };
    }
  }
  if (!Number.isFinite(best.s)) return none();
  /*
   * 다듬기 — 속도비 ±6%(¼% 간격) · 시작 ±2장면(¼장면). 속도비를 바꿀 때 시작 차이는 투구 구간 가운데를 축으로 같이 옮긴다 — 안 그러면
   * 속도비 3% 차이가 구간 가운데에서 4장면 어긋남이 돼 맞는 속도비를 아예 못 시험했다(합성 '폰 숙임': 0.483 을 골랐다, 진짜 0.5).
   */
  const tMid = (win[0] + win[1]) / 2;
  let fine = { ...best, s: score(best.r, best.o, fineIdx) };
  for (let q = -24; q <= 24; q++) {
    const r = best.r * (1 + q * 0.0025);
    const oc = best.o + (best.r - r) * tMid;
    for (let o = oc - 2 * dtb; o <= oc + 2 * dtb; o += dtb / 4) {
      const sc = score(r, o, fineIdx);
      if (sc < fine.s) fine = { r, o, s: sc };
    }
  }
  const backTime = ts.map((t) => {
    const bt = fine.r * t + fine.o;
    return bt >= tb0 && bt <= tb1 ? bt : null;
  });
  return { backTime, cost: fine.s, coverage: backTime.filter((x) => x != null).length / n };
}

/** 뒤 영상을 시각 t 로 보간(앞뒤 장면이 중앙 간격의 3배 넘게 떨어져 있으면 null) */
export function backAt(back: View, t: number, medianDt: number): Obs[] | null {
  const fr = back.frames;
  if (fr.length < 2 || t < fr[0].t || t > fr.at(-1)!.t) return null;
  let lo = 0;
  let hi = fr.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (fr[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = fr[lo];
  const b = fr[hi];
  const gap = b.t - a.t;
  if (gap > medianDt * 3) return null;
  const u = gap > 0 ? (t - a.t) / gap : 0;
  return a.p.map((pa, j) => {
    const pb = b.p[j];
    return { x: pa.x + (pb.x - pa.x) * u, y: pa.y + (pb.y - pa.y) * u, v: Math.min(pa.v, pb.v) };
  });
}

export const medianStep = (v: View) => median(v.frames.slice(1).map((f, i) => f.t - v.frames[i].t)) || 1 / 30;

/* ───────────────────────────── 시간 축 다듬기 ───────────────────────────── */

/** Savitzky–Golay(창 5, 2차) — 끊긴 곳(null) 양옆은 그대로. 값 배열(장면 순) */
export function savgol5(xs: (number | null)[]): (number | null)[] {
  const c = [-3, 12, 17, 12, -3];
  return xs.map((x, i) => {
    if (x == null) return null;
    let s = 0;
    for (let k = -2; k <= 2; k++) {
      const v = xs[i + k];
      if (v == null) return x;
      s += c[k + 2] * v;
    }
    return s / 35;
  });
}
