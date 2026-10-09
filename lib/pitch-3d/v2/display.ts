import {
  add,
  cross,
  dot,
  norm,
  normalize,
  scale,
  sub,
  type Vec3,
} from '@/lib/pitch-3d/linalg';
import { V2J, type Pitch3dV2Ok, type V2Contact } from '@/lib/pitch-3d/v2/contract';
import { moundHeightAt } from '@/lib/pitch-3d/v2/pose-rig';

/**
 * 3D 보기용 다듬기(2026-10-09 김민 4/10 — "사람이 못 하는 각도 · 손목 꺾임 · 떨림 · 발이 땅에 박히거나 몸이 붕 뜸") — 엔진 결과(지표의 바탕)는
 * 그대로 두고 화면에 그릴 관절만 사람 몸의 한계 안으로 넣는다.
 *
 *   1 몸통 꼬임 — 골반선과 어깨선의 차이가 TWIST_MAX 를 넘으면 윗몸(어깨 · 팔 · 머리)을 몸통 축으로 돌려 되돌린다
 *     (샘플 4 마무리 87°, 좌투 샘플 니업 전 62~97° — 사람은 60° 안팎이 끝)
 *   2 손목 — 손이 아래팔에서 꺾인 각도를 굽힘 · 폄 WRIST_FLEX, 옆 WRIST_DEV 안으로. 손 점 확신이 낮으면 아래팔을 곧게 잇는다
 *     (손 점은 릴리스 흐림에 확신 0 으로 7cm 씩 튀었다). 손바닥이 한 장면에 뒤집히면 되돌린다
 *   3 떨림 — 빠르기에 맞춘 앞뒤 가우스(느린 곳은 넓게, 빠른 팔은 좁게) — 시간을 밀지 않는다(재생이 늦게 따라오지 않게)
 *   4 바닥 하나 — 엔진이 찾은 발 닿은 구간(fit.contacts)으로 몸 전체를 한 번만 올린다. 마운드면 앞발 착지 자리가 경사면에 오고, 축발 자리와의
 *     높이 차에 맞춰 마운드 높이를 늘이거나 줄인다(0.5~1.5배). 예전엔 장면마다 디딤발로 바닥을 다시 잡아 착지 앞뒤로 몸이 오르내렸다
 *   5 바닥 밑 — 발(뒤꿈치 · 발끝)이 바닥 밑이면 그만큼 올리고 무릎은 두 마디 길이 그대로 다시 접는다(몸은 안 움직임)
 *   6 목 · 머리(2차, 김민 "목이랑 머리 움직임이 부자연스럽다") — 두 귀가 어깨와 반대로 붙었으면 바꾸고, 머리를 몸통에 대해 돌림 NECK_TURN ·
 *     기울임 NECK_TILT 안으로, 머리 점은 더 넓게 다듬는다(머리는 몸에서 가장 느리게 움직인다)
 *   7 어깨(2차, "팔이 말도 안 되는 각도로 뒤로 빠짐") — 위팔이 어깨선 뒤로 SHOULDER_BACK 넘게 가면 팔 전체를 몸통 축으로 앞으로 돌린다
 *   8 던지는 손바닥(2차, "어깨 · 팔꿈치 회전에 따른 손의 위치") — 손 점이 흐린 장면에서는 손바닥이 손목이 움직이는 쪽(공을 미는 쪽)을 보게
 *   9 확신이 낮은 관절은 더 넓게 다듬는다(글러브 팔 — 옆 영상에서 몸에 가려 흔들렸다)
 *
 * 순수 함수 — 시험: scripts/pitch-3d-v2-selftest.mts.
 */

export const TWIST_MAX_DEG = 60;
export const WRIST_FLEX_DEG = 75;
export const WRIST_DEV_DEG = 30;
/** 목 — 몸통에 대한 머리 돌림 · 기울임(굽힘 · 옆) 한계(°) */
export const NECK_TURN_DEG = 70;
export const NECK_TILT_DEG = 45;
/** 위팔이 어깨선(옆) 뒤로 갈 수 있는 각도(°, 위에서 본 수평면) — 투수의 '스캡 로드'도 30° 안팎 */
export const SHOULDER_BACK_DEG = 45;
/** 투수판 앞 모서리 = 축발 발목에서 이만큼 뒤(m, 발 너비의 절반) — 발이 투수판 앞에 붙어 선다 */
const FOOT_HALF_WIDTH_M = 0.05;
/** 손 점 확신(0~100) — 이 밑이면 아래팔을 곧게, 위면 그대로, 사이는 섞음 */
const HAND_CONF_LOW = 20;
const HAND_CONF_HIGH = 60;
/** 다듬기 폭(장면) — 가만있을 때 · 아주 빠를 때 */
const SMOOTH_MAX = 2;
const SMOOTH_MIN = 0.5;
/** 마운드 높이 배율 범위 — 자료의 두 발 높이 차가 규격과 다를 때 */
const MOUND_SCALE: [number, number] = [0.5, 1.5];

export type DisplayTrack = {
  /** 장면 × 관절 25 × [앞, 위, 오른쪽](키 = 1) — 바닥에 맞춰 올린 자리 */
  frames: Vec3[][];
  /** 발밑 높이(평지면 늘 0) */
  groundAt: (x: number, z: number) => number;
  /** 마운드 — 투수판 앞 모서리(축발 뒤 가장자리) · 높이 배율. 평지면 null */
  mound: { x0: number; z0: number; scale: number } | null;
  contacts: V2Contact[];
};

const UPPER = [
  V2J.lSh,
  V2J.rSh,
  V2J.lEl,
  V2J.rEl,
  V2J.lWr,
  V2J.rWr,
  V2J.lHandIdx,
  V2J.rHandIdx,
  V2J.lHandMid,
  V2J.rHandMid,
  V2J.lHandPinky,
  V2J.rHandPinky,
  V2J.nose,
  V2J.lEar,
  V2J.rEar,
];
const FOOT = {
  L: { an: V2J.lAn, he: V2J.lHe, to: V2J.lTo, kn: V2J.lKn, hip: V2J.lHip },
  R: { an: V2J.rAn, he: V2J.rHe, to: V2J.rTo, kn: V2J.rKn, hip: V2J.rHip },
} as const;
const rad = (d: number) => (d * Math.PI) / 180;
const mid = (a: Vec3, b: Vec3): Vec3 => scale(add(a, b), 0.5);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const perp = (v: Vec3, axis: Vec3): Vec3 => sub(v, scale(axis, dot(v, axis)));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
};

/** 단위 축 k 둘레로 각 th 만큼(점 C 를 지나는 축) */
function rotateAbout(P: Vec3, C: Vec3, k: Vec3, th: number): Vec3 {
  const v = sub(P, C);
  const c = Math.cos(th);
  return add(
    C,
    add(
      add(scale(v, c), scale(cross(k, v), Math.sin(th))),
      scale(k, dot(k, v) * (1 - c))
    )
  );
}

/** a → b 로 가장 짧게 도는 회전을 점 C 둘레로 P 에 */
function rotateFromTo(P: Vec3, C: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ax = cross(a, b);
  const s = norm(ax);
  if (s < 1e-12) return P;
  return rotateAbout(P, C, scale(ax, 1 / s), Math.atan2(s, dot(a, b)));
}

/** 엔진이 실은 발 닿은 구간 — 모양이 틀리거나 없으면(옛 결과) 순간으로 어림: 축발 처음 ~ 니업, 앞발 착지 ~ 릴리스 뒤 */
export function readContacts(r: Pitch3dV2Ok): V2Contact[] {
  const n = r.joints.length;
  const raw = (r.fit as { contacts?: unknown }).contacts;
  if (Array.isArray(raw)) {
    const ok = raw.every(
      (c) =>
        c &&
        typeof c === 'object' &&
        (c.side === 'L' || c.side === 'R') &&
        Number.isInteger(c.from) &&
        Number.isInteger(c.to) &&
        c.from >= 0 &&
        c.from <= c.to &&
        c.to < n
    );
    if (ok) return raw as V2Contact[];
  }
  const { kneeUp, footPlant: fp, release: rel } = r.events;
  const pivot: 'L' | 'R' = r.hand;
  const lead: 'L' | 'R' = r.hand === 'L' ? 'R' : 'L';
  return [
    {
      side: pivot,
      from: 0,
      to: Math.max(0, Math.min(fp - 1, kneeUp ?? Math.floor(fp / 2))),
    },
    { side: lead, from: fp, to: Math.min(n - 1, rel + Math.round((rel - fp) / 2)) },
  ];
}

/** 1 몸통 꼬임 — 윗몸을 몸통 축으로 돌려 골반선과의 차이를 TWIST_MAX 안으로 */
export function limitTwist(frames: Vec3[][], maxDeg = TWIST_MAX_DEG): number {
  let fixed = 0;
  for (const fr of frames) {
    const hipMid = mid(fr[V2J.lHip], fr[V2J.rHip]);
    const shMid = mid(fr[V2J.lSh], fr[V2J.rSh]);
    const T = sub(shMid, hipMid);
    if (norm(T) < 1e-9) continue;
    const t = normalize(T);
    const lh = perp(sub(fr[V2J.lHip], fr[V2J.rHip]), t);
    const ls = perp(sub(fr[V2J.lSh], fr[V2J.rSh]), t);
    if (norm(lh) < 1e-9 || norm(ls) < 1e-9) continue;
    const phi = Math.atan2(dot(cross(lh, ls), t), dot(lh, ls));
    const lim = rad(maxDeg);
    if (Math.abs(phi) <= lim) continue;
    const d = Math.sign(phi) * lim - phi;
    for (const j of UPPER) fr[j] = rotateAbout(fr[j], shMid, t, d);
    fixed++;
  }
  return fixed;
}

/** 몸통 틀 — 위 t(골반 → 어깨), 왼쪽 l(오른 어깨 → 왼 어깨, t 에 수직), 앞 f = l × t */
function trunkFrame(fr: Vec3[]): { t: Vec3; l: Vec3; f: Vec3; neck: Vec3 } | null {
  const neck = mid(fr[V2J.lSh], fr[V2J.rSh]);
  const T = sub(neck, mid(fr[V2J.lHip], fr[V2J.rHip]));
  if (norm(T) < 1e-9) return null;
  const t = normalize(T);
  const L = perp(sub(fr[V2J.lSh], fr[V2J.rSh]), t);
  if (norm(L) < 1e-9) return null;
  const l = normalize(L);
  return { t, l, f: cross(l, t), neck };
}

/** 6 목 · 머리 — 귀 좌우 바로잡기, 몸통에 대한 돌림 · 기울임 한계 */
export function limitHead(frames: Vec3[][]): number {
  let fixed = 0;
  const HEAD = [V2J.nose, V2J.lEar, V2J.rEar];
  for (const fr of frames) {
    const tf = trunkFrame(fr);
    if (!tf) continue;
    const { t, l, neck } = tf;
    let changed = false;
    /* 두 귀가 어깨와 반대로 붙음(머리가 몸통에 대해 90° 넘게 돈 것처럼 보임) → 이름 바꿈 */
    if (dot(perp(sub(fr[V2J.lEar], fr[V2J.rEar]), t), l) < 0) {
      [fr[V2J.lEar], fr[V2J.rEar]] = [fr[V2J.rEar], fr[V2J.lEar]];
      changed = true;
    }
    /* 돌림 — 귀선이 어깨선에서 몸통 축 둘레로 NECK_TURN 넘게 */
    const e = perp(sub(fr[V2J.lEar], fr[V2J.rEar]), t);
    if (norm(e) > 1e-9) {
      const phi = Math.atan2(dot(cross(l, e), t), dot(l, e));
      const lim = rad(NECK_TURN_DEG);
      if (Math.abs(phi) > lim) {
        const d = Math.sign(phi) * lim - phi;
        for (const j of HEAD) fr[j] = rotateAbout(fr[j], neck, t, d);
        changed = true;
      }
    }
    /* 기울임 — 목(어깨 가운데 → 두 귀 가운데)이 몸통 축에서 NECK_TILT 넘게 */
    const a = sub(mid(fr[V2J.lEar], fr[V2J.rEar]), neck);
    const ax = cross(t, a);
    if (norm(a) > 1e-9 && norm(ax) > 1e-9) {
      const th = Math.atan2(norm(ax), dot(t, a));
      const lim = rad(NECK_TILT_DEG);
      if (th > lim) {
        const k = normalize(ax);
        for (const j of HEAD) fr[j] = rotateAbout(fr[j], neck, k, lim - th);
        changed = true;
      }
    }
    if (changed) fixed++;
  }
  return fixed;
}

/** 7 어깨 — 위팔이 어깨선 뒤로 SHOULDER_BACK 넘게 가면 팔(팔꿈치 · 손목 · 손)을 몸통 축 둘레로 앞으로 */
export function limitShoulders(frames: Vec3[][]): number {
  let fixed = 0;
  const ARM = {
    L: [V2J.lSh, V2J.lEl, V2J.lWr, V2J.lHandIdx, V2J.lHandMid, V2J.lHandPinky],
    R: [V2J.rSh, V2J.rEl, V2J.rWr, V2J.rHandIdx, V2J.rHandMid, V2J.rHandPinky],
  } as const;
  for (const fr of frames) {
    const tf = trunkFrame(fr);
    if (!tf) continue;
    const { t, f } = tf;
    for (const side of ['L', 'R'] as const) {
      const [Sh, ...chain] = ARM[side];
      const out = side === 'L' ? tf.l : scale(tf.l, -1);
      const back = (u: Vec3) => Math.atan2(-dot(u, f), dot(u, out));
      const u = sub(fr[chain[0]], fr[Sh]);
      /* 팔이 거의 위나 아래를 가리키면(수평 성분이 작으면) 앞뒤를 말할 수 없다 */
      if (Math.hypot(dot(u, f), dot(u, out)) < 0.35 * norm(u)) continue;
      const lim = rad(SHOULDER_BACK_DEG);
      const b = back(u);
      if (b <= lim) continue;
      /* 몸통 축 둘레 어느 쪽으로 돌려야 앞으로 오는지는 팔(좌우)에 따라 다르다 — 줄어드는 쪽 */
      const d = b - lim;
      const try1 = rotateAbout(fr[chain[0]], fr[Sh], t, d);
      const sgn = back(sub(try1, fr[Sh])) < b ? 1 : -1;
      for (const j of chain) fr[j] = rotateAbout(fr[j], fr[Sh], t, sgn * d);
      fixed++;
    }
  }
  return fixed;
}

/**
 * 2 손목 — 굽힘 · 옆 한계, 확신이 낮으면 아래팔을 곧게, 손바닥 뒤집힘 되돌림.
 * throwing 을 주면 그 손은 손 점이 흐린 만큼 손바닥이 손목이 움직이는 쪽(공을 미는 쪽)을 보게 돌린다(8).
 */
export function limitWrists(
  frames: Vec3[][],
  conf: number[][] | null,
  throwing?: 'L' | 'R'
): number {
  let fixed = 0;
  /* 손목 빠르기(던지는 손) — 손바닥 방향의 단서 */
  const wrSpeed = (Wr: number, k: number) =>
    sub(frames[Math.min(frames.length - 1, k + 1)][Wr], frames[Math.max(0, k - 1)][Wr]);
  for (const side of ['L', 'R'] as const) {
    const [El, Wr, Idx, Mid, Pk] =
      side === 'L'
        ? [V2J.lEl, V2J.lWr, V2J.lHandIdx, V2J.lHandMid, V2J.lHandPinky]
        : [V2J.rEl, V2J.rWr, V2J.rHandIdx, V2J.rHandMid, V2J.rHandPinky];
    let prevW: Vec3 | null = null;
    /* 손바닥 단서는 그 손목이 꽤 빠를 때만(가장 빠른 때의 25% 넘게) */
    const speeds = frames.map((_, k) => norm(wrSpeed(Wr, k)));
    const vMax = Math.max(1e-9, ...speeds);
    frames.forEach((fr, k) => {
      const wr = fr[Wr];
      const fore = sub(wr, fr[El]);
      const a0 = sub(fr[Mid], wr);
      if (norm(fore) < 1e-9 || norm(a0) < 1e-9) return;
      const df = normalize(fore);
      const a = normalize(a0);
      const wRaw = perp(sub(fr[Pk], fr[Idx]), df);
      const w = norm(wRaw) > 1e-9 ? normalize(wRaw) : null;
      const c = conf ? Math.min(conf[k][Idx], conf[k][Mid], conf[k][Pk]) : 100;
      const keep = clamp((c - HAND_CONF_LOW) / (HAND_CONF_HIGH - HAND_CONF_LOW), 0, 1);
      /* 꺾인 각도를 손바닥 기준(옆 = 손바닥 폭, 굽힘 = 그 수직)으로 나눠 한계 안으로 */
      const th = Math.atan2(norm(cross(df, a)), dot(df, a));
      const bend = perp(a, df);
      let a2 = df;
      if (th > 1e-6 && norm(bend) > 1e-9) {
        const b = normalize(bend);
        const wAx = w ?? normalize(cross(df, b));
        const nAx = normalize(cross(df, wAx));
        const flex =
          clamp(th * dot(b, nAx), -rad(WRIST_FLEX_DEG), rad(WRIST_FLEX_DEG)) * keep;
        const dev =
          clamp(th * dot(b, wAx), -rad(WRIST_DEV_DEG), rad(WRIST_DEV_DEG)) * keep;
        const th2 = Math.hypot(flex, dev);
        if (th2 > 1e-9) {
          const b2 = normalize(add(scale(nAx, flex), scale(wAx, dev)));
          a2 = add(scale(df, Math.cos(th2)), scale(b2, Math.sin(th2)));
        }
      }
      let pts = [Idx, Mid, Pk].map((j) => rotateFromTo(fr[j], wr, a, a2));
      /*
       * 8 던지는 손바닥 — 손바닥 쪽(오른손 = 손 축 × 손바닥 폭, 왼손은 반대)이 손목이 움직이는 쪽을 보게, 손 점이 흐린 만큼 · 빠른 만큼.
       * 가속 구간엔 손바닥이 공을 홈 쪽으로 민다. 흐린 손 점을 그대로 믿으면 릴리스에 손바닥이 옆이나 뒤를 봤다.
       */
      if (side === throwing && keep < 1) {
        const v = perp(wrSpeed(Wr, k), a2);
        const wNow = perp(sub(pts[2], pts[0]), a2);
        const pull = (1 - keep) * clamp((speeds[k] / vMax - 0.25) / 0.25, 0, 1);
        if (pull > 0 && norm(v) > 1e-9 && norm(wNow) > 1e-9) {
          const palm = side === 'R' ? cross(a2, wNow) : cross(wNow, a2);
          const ang = Math.atan2(dot(cross(palm, v), a2), dot(palm, v));
          pts = pts.map((P) => rotateAbout(P, wr, a2, ang * pull));
        }
      }
      /* 손바닥이 한 장면에 뒤집혔으면(폭 방향이 반대) 손 축 둘레로 반 바퀴 되돌린다 */
      const w2 = perp(sub(pts[2], pts[0]), a2);
      if (prevW && norm(w2) > 1e-9 && dot(w2, prevW) < 0)
        pts = pts.map((P) => rotateAbout(P, wr, a2, Math.PI));
      const w3 = perp(sub(pts[2], pts[0]), a2);
      if (norm(w3) > 1e-9) prevW = normalize(w3);
      if (th > 1e-6 && Math.abs(Math.acos(clamp(dot(a, a2), -1, 1))) > 1e-6) fixed++;
      [Idx, Mid, Pk].forEach((j, i) => (fr[j] = pts[i]));
    });
  }
  return fixed;
}

/**
 * 3 떨림 — 빠르기에 맞춘 앞뒤 가우스(관절마다). still[k][j] 이면 그 장면 그 관절은 그대로(땅에 닿은 발).
 * conf(0~100)를 주면 확신이 낮은 관절일수록 폭을 넓힌다(9), 머리 점(코 · 귀)은 늘 두 배(6).
 */
export function smoothAdaptive(
  frames: Vec3[][],
  still?: boolean[][],
  conf?: number[][] | null
): void {
  const n = frames.length;
  if (n < 3) return;
  const J = frames[0].length;
  const speed = (j: number, k: number) =>
    norm(sub(frames[Math.min(n - 1, k + 1)][j], frames[Math.max(0, k - 1)][j])) / 2;
  const all: number[] = [];
  for (let j = 0; j < J; j++) for (let k = 0; k < n; k++) all.push(speed(j, k));
  all.sort((a, b) => a - b);
  const vRef = Math.max(1e-6, all[Math.floor(all.length * 0.9)]);
  const out: Vec3[][] = frames.map((fr) => fr.map((p) => [...p] as Vec3));
  for (let j = 0; j < J; j++) {
    for (let k = 0; k < n; k++) {
      if (still?.[k][j]) continue;
      const v = speed(j, k) / (0.25 * vRef);
      const head = j === V2J.nose || j === V2J.lEar || j === V2J.rEar ? 2 : 1;
      const doubt = conf ? 1 + (1 - clamp(conf[k][j] / 60, 0, 1)) : 1;
      const sigma =
        (SMOOTH_MIN + (SMOOTH_MAX - SMOOTH_MIN) / (1 + v * v)) * head * doubt;
      const r = Math.ceil(sigma * 2.5);
      let ws = 0;
      const acc: Vec3 = [0, 0, 0];
      for (let q = Math.max(0, k - r); q <= Math.min(n - 1, k + r); q++) {
        const w = Math.exp(-((q - k) ** 2) / (2 * sigma * sigma));
        ws += w;
        for (let d = 0; d < 3; d++) acc[d] += w * frames[q][j][d];
      }
      out[k][j] = scale(acc, 1 / ws);
    }
  }
  for (let k = 0; k < n; k++) frames[k] = out[k];
}

/** 두 마디 다리를 엉덩이는 두고 발목을 새 자리로 — 무릎은 예전 무릎 쪽으로 접는다(길이 그대로) */
function legIk(hip: Vec3, knee: Vec3, ankle: Vec3, newAnkle: Vec3): Vec3 {
  const l1 = norm(sub(knee, hip));
  const l2 = norm(sub(ankle, knee));
  const v = sub(newAnkle, hip);
  const d = clamp(norm(v), Math.abs(l1 - l2) + 1e-6, l1 + l2 - 1e-6);
  const e = normalize(v);
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  let pole = perp(sub(knee, hip), e);
  if (norm(pole) < 1e-9) pole = perp([1, 0, 0], e);
  return add(add(hip, scale(e, along)), scale(normalize(pole), h));
}

/**
 * 보기용 관절 — 결과 하나와 던진 곳(마운드 · 평지) · 키(m).
 */
export function displayTrack(
  result: Pitch3dV2Ok,
  opts: { ground: 'mound' | 'flat'; heightM: number }
): DisplayTrack {
  const frames: Vec3[][] = result.joints.map((fr) =>
    fr.map((p) => [p[0] / 1000, p[1] / 1000, p[2] / 1000] as Vec3)
  );
  const n = frames.length;
  const contacts = readContacts(result);
  const still: boolean[][] = frames.map((fr) => fr.map(() => false));
  for (const c of contacts)
    for (let k = c.from; k <= c.to; k++)
      for (const j of [FOOT[c.side].an, FOOT[c.side].he, FOOT[c.side].to])
        still[k][j] = true;

  limitTwist(frames);
  limitHead(frames);
  limitShoulders(frames);
  limitWrists(frames, result.conf, result.hand);
  smoothAdaptive(frames, still, result.conf);

  /* 4 바닥 하나 */
  const sole = (k: number, side: 'L' | 'R') =>
    Math.min(frames[k][FOOT[side].he][1], frames[k][FOOT[side].to][1]);
  const spot = (c: V2Contact) => {
    const ks = Array.from({ length: c.to - c.from + 1 }, (_, i) => c.from + i);
    const { an, he, to } = FOOT[c.side];
    return {
      h: median(ks.map((k) => sole(k, c.side))),
      x: median(ks.map((k) => frames[k][an][0])),
      z: median(ks.map((k) => frames[k][an][2])),
      /* 발의 뒤 가장자리(홈 반대쪽) — 축발은 투수판 앞에 붙어 선다 */
      back: median(
        ks.map((k) => Math.min(frames[k][an][0], frames[k][he][0], frames[k][to][0]))
      ),
    };
  };
  const { footPlant: fp, release: rel } = result.events;
  const pivotSide = result.hand;
  const leadSide = result.hand === 'L' ? 'R' : 'L';
  const pivotC = contacts.find((c) => c.side === pivotSide && c.from <= fp);
  const leadC = contacts.find(
    (c) => c.side === leadSide && c.to >= fp && c.from <= rel
  );
  const P = pivotC ? spot(pivotC) : null;
  const L = leadC ? spot(leadC) : null;
  let offset: number;
  let mound: DisplayTrack['mound'] = null;
  let groundAt: (x: number, z: number) => number = () => 0;
  if (opts.ground === 'mound' && P) {
    /* 투수판 앞 모서리 = 축발 뒤 가장자리에서 발 너비 절반 뒤 — 예전엔 발목 자리라 발이 투수판 위에 올라서 있었다(김민) */
    const x0 = P.back - FOOT_HALF_WIDTH_M / opts.heightM;
    const f = moundHeightAt(x0, P.z, opts.heightM);
    let sc = 1;
    if (L) {
      const spec = f(P.x, P.z) - f(L.x, L.z);
      if (spec > 0.002) sc = clamp((P.h - L.h) / spec, MOUND_SCALE[0], MOUND_SCALE[1]);
      offset = sc * f(L.x, L.z) - L.h;
    } else offset = f(P.x, P.z) - P.h;
    mound = { x0, z0: P.z, scale: sc };
    groundAt = (x, z) => sc * f(x, z);
  } else {
    const all = frames
      .flatMap((_, k) => [sole(k, 'L'), sole(k, 'R')])
      .sort((a, b) => a - b);
    const low =
      P && L
        ? Math.min(P.h, L.h)
        : L
          ? L.h
          : P
            ? P.h
            : (all[Math.floor(all.length * 0.02)] ?? 0);
    offset = -low;
  }
  for (const fr of frames) for (const p of fr) p[1] += offset;

  /* 5 바닥 밑의 발 — 올리고 무릎을 다시 접는다 */
  for (let k = 0; k < n; k++) {
    const fr = frames[k];
    for (const side of ['L', 'R'] as const) {
      const F = FOOT[side];
      const pen = Math.max(
        ...[F.he, F.to].map((j) => groundAt(fr[j][0], fr[j][2]) - fr[j][1])
      );
      if (!(pen > 1e-9)) continue;
      const up: Vec3 = [0, pen, 0];
      const an = add(fr[F.an], up);
      fr[F.kn] = legIk(fr[F.hip], fr[F.kn], fr[F.an], an);
      fr[F.an] = an;
      fr[F.he] = add(fr[F.he], up);
      fr[F.to] = add(fr[F.to], up);
    }
  }
  return { frames, groundAt, mound, contacts };
}
