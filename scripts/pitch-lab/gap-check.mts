/**
 * 릴리스 근처 던지는 손목 · 손을 두 영상에서 10장면 지운 합성 — 맞춘 손목이 빈 구간에서 정답과 얼마나 어긋나는지(키 대비).
 * 결과 좌표는 정답과 축 · 크기가 달라, 보이는 관절로 닮음 변환(Umeyama)을 맞춘 뒤 잰다. 쓰는 곳: scripts/pitch-3d-v2-selftest.mts.
 *   단독: node --import ./scripts/alias-register.mjs scripts/pitch-lab/gap-check.mts
 */
import {
  add,
  det3,
  mul3,
  mulV,
  norm,
  scale,
  sub,
  svd3,
  transpose,
  type Mat3,
  type Vec3,
} from '../../lib/pitch-3d/linalg.ts';
import { V2J } from '../../lib/pitch-3d/v2/contract.ts';
import { fitPitch3dV2 } from '../../lib/pitch-3d/v2/fit.ts';
import { makeV2Track, pitcher25 } from './synth-v2.mts';
import { base, cameras, EV, H, realistic, type Scenario } from './synth.mts';

/** Umeyama 닮음 변환(src → dst) */
function align(src: Vec3[], dst: Vec3[]) {
  const n = src.length;
  const ms = scale(
    src.reduce((a, b) => add(a, b), [0, 0, 0] as Vec3),
    1 / n
  );
  const md = scale(
    dst.reduce((a, b) => add(a, b), [0, 0, 0] as Vec3),
    1 / n
  );
  const C = new Array<number>(9).fill(0);
  let vs = 0;
  for (let i = 0; i < n; i++) {
    const a = sub(src[i], ms);
    const b = sub(dst[i], md);
    vs += a[0] ** 2 + a[1] ** 2 + a[2] ** 2;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r * 3 + c] += b[r] * a[c];
  }
  const { U, s, V } = svd3(C as Mat3);
  const d = det3(mul3(U, transpose(V))) < 0 ? -1 : 1;
  const R = mul3(mul3(U, [1, 0, 0, 0, 1, 0, 0, 0, d]), transpose(V));
  const k = (s[0] + s[1] + d * s[2]) / vs;
  const t = sub(md, scale(mulV(R, ms), k));
  return (x: Vec3) => add(scale(mulV(R, x), k), t);
}

const HAND = [V2J.rWr, V2J.rHandMid, V2J.rHandIdx, V2J.rHandPinky];

/** 빈 구간 손목 최대 오차(키 비율) · 보이는 주변 중앙 오차 — 맞추기 실패면 null */
export function gapWristError(seed: number): { gap: number; seen: number } | null {
  const sc: Scenario = {
    ...base,
    ...realistic,
    name: 'gap',
    slowSide: 4,
    slowBack: 4,
    offBack: 0,
    sampleSide: 1 / 30,
    sampleBack: 1 / 30,
  };
  const { side: cs, back: cb } = cameras(sc);
  const s = makeV2Track(sc, cs, sc.side, 'side', seed);
  const b = makeV2Track(sc, cb, sc.back, 'back', seed + 1);
  const [g0, g1] = [s.toMedia(EV.release - 0.06), s.toMedia(EV.release + 0.02)];
  for (const tr of [s.track, b.track])
    for (const f of tr.frames)
      if (f.t >= g0 && f.t <= g1)
        for (const j of HAND) f.p[j] = [f.p[j][0], f.p[j][1], 0];
  const { result } = fitPitch3dV2({
    side: s.track,
    back: b.track,
    hand: 'R',
    heightCm: null,
    jobId: '00000000-0000-4000-8000-000000000000',
    poseModel: 'synth',
    screenRecorded: true,
    slowmoFps: 120,
    events: {
      kneeUp: s.toMedia(EV.kneeUp),
      footPlant: s.toMedia(EV.footPlant),
      release: s.toMedia(EV.release),
    },
  });
  if (!result.ok) return null;
  /* 옆 영상 시각 → 실제 시각(makeV2Track: 재생 30fps 같은 장면 · 슬로모 · 시작 -0.05초) */
  const truthAt = (k: number) =>
    pitcher25(
      Math.max(
        0,
        Math.min(1.5, Math.floor(result.t[k] * 30 + 1e-6) / 30 / sc.slowSide - 0.05)
      ),
      'R'
    );
  const inGap = (k: number) => result.t[k] >= g0 && result.t[k] <= g1;
  const src: Vec3[] = [];
  const dst: Vec3[] = [];
  result.joints.forEach((fr, k) => {
    const T = truthAt(k);
    for (let j = 0; j < 17; j++)
      if (result.conf[k][j] > 0 && !(HAND.includes(j) && inGap(k))) {
        src.push(fr[j] as Vec3);
        dst.push(T[j]);
      }
  });
  const f = align(src, dst);
  const err = (k: number) =>
    norm(sub(f(result.joints[k][V2J.rWr] as Vec3), truthAt(k)[V2J.rWr])) / H;
  let gap = 0;
  const seen: number[] = [];
  result.joints.forEach((_, k) => {
    if (inGap(k)) gap = Math.max(gap, err(k));
    else if (Math.abs(result.t[k] - (g0 + g1) / 2) < 0.3) seen.push(err(k));
  });
  seen.sort((a, z) => a - z);
  return { gap, seen: seen[seen.length >> 1] ?? 0 };
}

if (process.argv[1]?.endsWith('gap-check.mts'))
  for (const seed of [11, 22, 44, 55]) {
    const r = gapWristError(seed);
    console.log(
      `seed ${seed}: ` +
        (r
          ? `빈 구간 손목 최대 오차 ${(r.gap * 100).toFixed(1)}% · 보이는 주변 중앙 ${(r.seen * 100).toFixed(1)}%`
          : '맞추기 실패')
    );
  }

/**
 * 영상 첫 장면들에서 글러브 쪽 손목 · 손을 두 영상 다 지운 합성 — 처음 보이는 장면 근처에서 손목이 한 장면에 움직인 최대 거리(키 대비).
 * 고치기 전엔 빈 장면을 기본 방향(아래)으로 채웠다가 처음 보일 때 튀었다(2026-10-08 샘플 1 첫 장면 503mm).
 */
export function leadGapJump(seed: number): number | null {
  const sc: Scenario = {
    ...base,
    ...realistic,
    name: 'lead',
    slowSide: 4,
    slowBack: 4,
    offBack: 0,
    sampleSide: 1 / 30,
    sampleBack: 1 / 30,
  };
  const { side: cs, back: cb } = cameras(sc);
  const s = makeV2Track(sc, cs, sc.side, 'side', seed);
  const b = makeV2Track(sc, cb, sc.back, 'back', seed + 1);
  const GLOVE = [V2J.lWr, V2J.lHandMid, V2J.lHandIdx, V2J.lHandPinky];
  const cut = s.toMedia(0.25);
  for (const tr of [s.track, b.track])
    for (const f of tr.frames)
      if (f.t <= cut) for (const j of GLOVE) f.p[j] = [f.p[j][0], f.p[j][1], 0];
  const { result } = fitPitch3dV2({
    side: s.track,
    back: b.track,
    hand: 'R',
    heightCm: null,
    jobId: '00000000-0000-4000-8000-000000000000',
    poseModel: 'synth',
    screenRecorded: true,
    slowmoFps: 120,
    events: {
      kneeUp: s.toMedia(EV.kneeUp),
      footPlant: s.toMedia(EV.footPlant),
      release: s.toMedia(EV.release),
    },
  });
  if (!result.ok) return null;
  let jump = 0;
  for (let k = 1; k < result.joints.length && result.t[k] <= cut + 0.2; k++)
    jump = Math.max(
      jump,
      norm(
        sub(result.joints[k][V2J.lWr] as Vec3, result.joints[k - 1][V2J.lWr] as Vec3)
      ) / 1000
    );
  return jump;
}

if (process.argv[1]?.endsWith('gap-check.mts'))
  for (const seed of [11, 22, 44]) {
    const j = leadGapJump(seed);
    console.log(
      `seed ${seed}: 첫 장면 빈 손목 — 처음 보일 때까지 한 장면 최대 이동 ${j == null ? '실패' : (j * 100).toFixed(1) + '% 키'}`
    );
  }

/**
 * 발 고정 — 땅에 붙어 있어야 할 구간(축발: 처음 ~ 니업, 앞발: 착지 ~ 릴리스)에서 발목 · 뒤꿈치 · 발끝이 움직인 폭(키 대비 mm 의 표준편차).
 * 2026-10-09 김민: "발이 땅에 잘 붙어 있는지 · 착지는 언제인지 구분이 안 되고 바닥에서 떨어지거나 흔들린다".
 */
export function footSway(seed: number): { pivot: number; lead: number } | null {
  const sc: Scenario = {
    ...base,
    ...realistic,
    name: 'foot',
    slowSide: 4,
    slowBack: 4,
    offBack: 0,
    sampleSide: 1 / 30,
    sampleBack: 1 / 30,
  };
  const { side: cs, back: cb } = cameras(sc);
  const s = makeV2Track(sc, cs, sc.side, 'side', seed);
  const b = makeV2Track(sc, cb, sc.back, 'back', seed + 1);
  const { result } = fitPitch3dV2({
    side: s.track,
    back: b.track,
    hand: 'R',
    heightCm: null,
    jobId: '00000000-0000-4000-8000-000000000000',
    poseModel: 'synth',
    screenRecorded: true,
    slowmoFps: 120,
    events: {
      kneeUp: s.toMedia(EV.kneeUp),
      footPlant: s.toMedia(EV.footPlant),
      release: s.toMedia(EV.release),
    },
  });
  if (!result.ok) return null;
  const { footPlant: fp, release: rel } = result.events;
  const sway = (joints: number[], from: number, to: number) => {
    let worst = 0;
    for (const j of joints) {
      const pts = result.joints.slice(from, to + 1).map((f) => f[j]);
      const mean = [0, 1, 2].map((d) => pts.reduce((a, p) => a + p[d], 0) / pts.length);
      const sd = Math.sqrt(
        pts.reduce(
          (a, p) =>
            a + (p[0] - mean[0]) ** 2 + (p[1] - mean[1]) ** 2 + (p[2] - mean[2]) ** 2,
          0
        ) / pts.length
      );
      worst = Math.max(worst, sd);
    }
    return worst;
  };
  return {
    /* 축발은 니업까지(합성 정답 축발은 보폭 끝에 끌린다) */
    pivot: sway(
      [V2J.rAn, V2J.rHe, V2J.rTo],
      0,
      result.events.kneeUp ?? Math.floor(fp / 2)
    ),
    lead: sway([V2J.lAn, V2J.lHe, V2J.lTo], fp + 2, rel),
  };
}

if (process.argv[1]?.endsWith('gap-check.mts'))
  for (const seed of [11, 22]) {
    const f = footSway(seed);
    console.log(
      `seed ${seed}: 발 흔들림(표준편차, 키 1000) 축발 ${f?.pivot.toFixed(1)} · 앞발 ${f?.lead.toFixed(1)}`
    );
  }

/**
 * 착지 순간 엉덩이 점이 두 장면 튀는 합성 — 골반선(위에서 본 방향)이 한 장면에 가장 많이 돈 각도(°).
 * 2026-10-09 실제 샘플 둘에서 착지 장면에 골반선이 한 장면에 35~38° 돌았다(사람이 낼 수 없는 속도) — 관절 모델의 엉덩이 점이 튐.
 */
export function hipSnap(seed: number, spike = true): number | null {
  const sc: Scenario = {
    ...base,
    ...realistic,
    name: 'hip',
    slowSide: 4,
    slowBack: 4,
    offBack: 0,
    sampleSide: 1 / 30,
    sampleBack: 1 / 30,
  };
  const { side: cs, back: cb } = cameras(sc);
  const s = makeV2Track(sc, cs, sc.side, 'side', seed);
  const b = makeV2Track(sc, cb, sc.back, 'back', seed + 1);
  /* 착지 장면 둘에서 오른 엉덩이 점을 사람 크기의 12% 옆으로 */
  const tp = s.toMedia(EV.footPlant);
  for (const tr of [s.track, b.track]) {
    const near = spike
      ? tr.frames.filter((f) => Math.abs(f.t - tp) < 0.04).slice(0, 2)
      : [];
    for (const f of near) {
      const ys = f.p.map((q) => q[1]);
      const px = (Math.max(...ys) - Math.min(...ys)) * 0.12;
      f.p[V2J.rHip] = [f.p[V2J.rHip][0] + px, f.p[V2J.rHip][1], f.p[V2J.rHip][2]];
    }
  }
  const { result } = fitPitch3dV2({
    side: s.track,
    back: b.track,
    hand: 'R',
    heightCm: null,
    jobId: '00000000-0000-4000-8000-000000000000',
    poseModel: 'synth',
    screenRecorded: true,
    slowmoFps: 120,
    events: {
      kneeUp: s.toMedia(EV.kneeUp),
      footPlant: tp,
      release: s.toMedia(EV.release),
    },
  });
  if (!result.ok) return null;
  const yaw = (f: number[][]) =>
    (Math.atan2(f[V2J.lHip][2] - f[V2J.rHip][2], f[V2J.lHip][0] - f[V2J.rHip][0]) *
      180) /
    Math.PI;
  let worst = 0;
  for (let k = 1; k < result.joints.length; k++) {
    const d = Math.abs(
      ((yaw(result.joints[k]) - yaw(result.joints[k - 1]) + 540) % 360) - 180
    );
    worst = Math.max(worst, d);
  }
  return worst;
}

if (process.argv[1]?.endsWith('gap-check.mts'))
  for (const seed of [11, 22])
    console.log(
      `seed ${seed}: 착지 엉덩이 튐 — 골반선 한 장면 최대 회전 ${hipSnap(seed)?.toFixed(1)}°`
    );

/**
 * 발 순간이동 — 발목 · 뒤꿈치 · 발끝이 한 장면에 움직인 최대 거리(키 대비). swapLegs 면 두 영상의 무릎 아래 이름을 통째로 바꾼다
 * (관절 모델이 다리 이름만 바꿔 붙인 경우 — 2026-10-09 좌투 샘플: 들린 발을 축발로 묶었다가 풀려 한 장면에 57cm 튀었다).
 * 2026-10-09 실제 샘플 2 · 4 는 착지 장면에 앞발이 나중 자리로 한 번에 붙어 13 · 9.5cm 튀었다.
 */
export function footJump(
  seed: number,
  swapLegs = false
): { jump: number; legsSwapped: boolean } | null {
  const sc: Scenario = {
    ...base,
    ...realistic,
    name: 'jump',
    slowSide: 4,
    slowBack: 4,
    offBack: 0,
    sampleSide: 1 / 30,
    sampleBack: 1 / 30,
  };
  const { side: cs, back: cb } = cameras(sc);
  const s = makeV2Track(sc, cs, sc.side, 'side', seed);
  const b = makeV2Track(sc, cb, sc.back, 'back', seed + 1);
  const LEGS: [number, number][] = [
    [V2J.lKn, V2J.rKn],
    [V2J.lAn, V2J.rAn],
    [V2J.lHe, V2J.rHe],
    [V2J.lTo, V2J.rTo],
  ];
  if (swapLegs)
    for (const tr of [s.track, b.track])
      for (const f of tr.frames) for (const [l, r] of LEGS) [f.p[l], f.p[r]] = [f.p[r], f.p[l]];
  const { result } = fitPitch3dV2({
    side: s.track,
    back: b.track,
    hand: 'R',
    heightCm: null,
    jobId: '00000000-0000-4000-8000-000000000000',
    poseModel: 'synth',
    screenRecorded: true,
    slowmoFps: 120,
    events: {
      kneeUp: s.toMedia(EV.kneeUp),
      footPlant: s.toMedia(EV.footPlant),
      release: s.toMedia(EV.release),
    },
  });
  if (!result.ok) return null;
  const FEET = [V2J.lAn, V2J.lHe, V2J.lTo, V2J.rAn, V2J.rHe, V2J.rTo];
  let jump = 0;
  for (let k = 1; k < result.joints.length; k++)
    for (const j of FEET)
      jump = Math.max(
        jump,
        norm(sub(result.joints[k][j] as Vec3, result.joints[k - 1][j] as Vec3)) / 1000
      );
  return { jump, legsSwapped: result.fit.legsSwapped === true };
}

if (process.argv[1]?.endsWith('gap-check.mts'))
  for (const seed of [11, 22])
    for (const swap of [false, true]) {
      const r = footJump(seed, swap);
      console.log(
        `seed ${seed}${swap ? ' 다리 이름 바뀜' : ''}: 발 한 장면 최대 이동 ${r ? (r.jump * 100).toFixed(1) + '% 키 · 바꿈 ' + r.legsSwapped : '실패'}`
      );
    }

const GLOVE_ARM = [V2J.lEl, V2J.lWr, V2J.lHandMid, V2J.lHandIdx, V2J.lHandPinky];

/**
 * 착지 ~ 릴리스에 뒤 영상의 글러브 팔(팔꿈치 · 손목 · 손)을 '가려져 2D 모델이 지어낸 점'으로 바꾼 합성 — 확신 0.4, 자리는 몸 높이 기준으로
 * 떠돌고 가끔 크게 튄다(실제 샘플 8개 중 7개: 확신 0.35~0.45 로 한 장면에 몸 높이의 30~50%). 그 구간 글러브 손목 오차 가운데값(키 대비).
 * 고치기 전엔 그 점을 옆 영상과 교차해 팔 깊이가 따라 출렁였다.
 */
export function junkGloveError(seed: number): number | null {
  const sc: Scenario = {
    ...base,
    ...realistic,
    name: 'junk',
    slowSide: 4,
    slowBack: 4,
    offBack: 0,
    sampleSide: 1 / 30,
    sampleBack: 1 / 30,
  };
  const { side: cs, back: cb } = cameras(sc);
  const s = makeV2Track(sc, cs, sc.side, 'side', seed);
  const b = makeV2Track(sc, cb, sc.back, 'back', seed + 1);
  const [g0, g1] = [s.toMedia(EV.footPlant), s.toMedia(EV.release)];
  /* 같은 씨앗이면 같은 떠돎 — 몸 높이(픽셀)의 25% 안 어딘가에 머물다 장면마다 40% 확률로 새 자리로 튐(실제: 한 장면에 30~50%) */
  let st = seed * 7919 + 13;
  const rnd = () => ((st = (st * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
  const body = (p: [number, number, number][]) => {
    const ys = p.slice(0, 17).map((q) => q[1]);
    return Math.max(...ys) - Math.min(...ys);
  };
  let drift: [number, number] | null = null;
  const [b0, b1] = [b.toMedia(EV.footPlant), b.toMedia(EV.release)];
  for (const f of b.track.frames) {
    if (f.t < b0 || f.t > b1) continue;
    const hp = body(f.p as [number, number, number][]);
    if (!drift || rnd() > 0.2) drift = [0.25 * hp * rnd(), 0.25 * hp * rnd()];
    for (const j of GLOVE_ARM) f.p[j] = [f.p[j][0] + drift[0], f.p[j][1] + drift[1], 0.4];
  }
  const { result } = fitPitch3dV2({
    side: s.track,
    back: b.track,
    hand: 'R',
    heightCm: null,
    jobId: '00000000-0000-4000-8000-000000000000',
    poseModel: 'synth',
    screenRecorded: true,
    slowmoFps: 120,
    events: {
      kneeUp: s.toMedia(EV.kneeUp),
      footPlant: s.toMedia(EV.footPlant),
      release: s.toMedia(EV.release),
    },
  });
  if (!result.ok) return null;
  const truthAt = (k: number) =>
    pitcher25(
      Math.max(
        0,
        Math.min(1.5, Math.floor(result.t[k] * 30 + 1e-6) / 30 / sc.slowSide - 0.05)
      ),
      'R'
    );
  const inGap = (k: number) => result.t[k] >= g0 && result.t[k] <= g1;
  const src: Vec3[] = [];
  const dst: Vec3[] = [];
  result.joints.forEach((fr, k) => {
    const T = truthAt(k);
    for (let j = 0; j < 17; j++)
      if (result.conf[k][j] > 0 && !(GLOVE_ARM.includes(j) && inGap(k))) {
        src.push(fr[j] as Vec3);
        dst.push(T[j]);
      }
  });
  const f = align(src, dst);
  const errs = result.joints.flatMap((fr, k) =>
    inGap(k) ? [norm(sub(f(fr[V2J.lWr] as Vec3), truthAt(k)[V2J.lWr])) / H] : []
  );
  errs.sort((a, z) => a - z);
  return errs[errs.length >> 1] ?? null;
}
