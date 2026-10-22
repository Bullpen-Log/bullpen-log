import { add, norm, scale, sub, type Vec3 } from '@/lib/pitch-3d/linalg';
import { V2J, type Pitch3dV2Ok, type V2Contact } from '@/lib/pitch-3d/v2/contract';
import {
  kinematicTrack,
  kneePole,
  twoBoneIk,
  type KinematicTrack,
} from '@/lib/pitch-3d/v2/kinematics';
import { moundHeightAt } from '@/lib/pitch-3d/v2/pose-rig';

/**
 * 3D 보기용 관절(2026-10-09 김민 — "사람이 못 하는 각도 · 손목 꺾임 · 떨림 · 발이 땅에 박히거나 몸이 붕 뜸 · 투수판 위에 섬") — 엔진 결과
 * (지표의 바탕)는 그대로 두고 화면에 그릴 관절만 만든다.
 *
 *   1 관절 각도 모델(kinematics.ts) — 점 → 관절 각도 → 사람 몸 한계 · 시간 다듬기 → 고정 뼈 길이로 다시 점. 부위의 기준 방향(굽는 축 ·
 *     손바닥)도 함께(refs) — 점에서 다시 셈하면 거의 편 팔꿈치 · 무릎에서 못 정한다
 *   2 바닥 하나 — 엔진이 찾은 발 닿은 구간(fit.contacts)으로 몸 전체를 한 번만 올린다. 마운드면 앞발 착지 자리가 경사면에 오고, 축발 자리와의
 *     높이 차에 맞춰 마운드 높이를 늘이거나 줄인다(0.5~1.5배). 투수판 앞 모서리는 축발 뒤 가장자리에서 발 너비 절반 뒤
 *   3 바닥 밑 — 발(뒤꿈치 · 발끝)이 바닥 밑이면 그만큼 올리고 무릎은 두 마디 길이 그대로 다시 접는다(몸은 안 움직임)
 *
 * 순수 함수 — 시험: scripts/pitch-3d-v2-selftest.mts.
 */

/** 투수판 앞 모서리 = 축발 뒤 가장자리에서 이만큼 뒤(m, 발 너비의 절반) — 발이 투수판 앞에 붙어 선다 */
const FOOT_HALF_WIDTH_M = 0.05;
/** 마운드 높이 배율 범위 — 자료의 두 발 높이 차가 규격과 다를 때 */
const MOUND_SCALE: [number, number] = [0.5, 1.5];
/** 배율로 못 맞추는 두 발 높이 차는 몸 전체를 축발 둘레로 기울여 맞춘다 — 이만큼(라디안)까지 */
const MOUND_TILT_MAX = (8 * Math.PI) / 180;
/** 착지 → 릴리스의 실제 시간 상한(초) — 투수는 0.13~0.18초, 넉넉히 */
const PLANT_TO_RELEASE_MAX_S = 0.25;

export type DisplayTrack = {
  /** 장면 × 관절 25 × [앞, 위, 오른쪽](키 = 1) — 바닥에 맞춰 올린 자리 */
  frames: Vec3[][];
  /** 장면마다 부위 기준 방향(관절 각도 틀 kinematics 가 만든 것 — 보기용 다듬기가 그대로 잇는다) */
  refs: KinematicTrack['refs'];
  /** 발밑 높이(평지면 늘 0) */
  groundAt: (x: number, z: number) => number;
  /** 마운드 — 투수판 앞 모서리(축발 뒤 가장자리) · 높이 배율. 평지면 null */
  mound: { x0: number; z0: number; scale: number } | null;
  /**
   * 투수판 앞 모서리 — 마운드 · 평지 모두 같은 규칙(던지는 손 쪽 발 = 축발이 착지 전에 디딘 구간의 뒤 가장자리에서 발 너비 절반 뒤).
   * 예전엔 평지만 무대(stage.ts flatSpot)가 '가장 먼저 닿은 발'로 정해, 두 발이 같은 장면에 닿기 시작하면 왼발(우투의 앞발)이 뽑혀
   * 투수판이 축발 앞에 놓였다 — 인형이 투수판 뒤에서 던지기 시작했다(2026-10-20 사용자: 샘플 15).
   */
  rubber: { x0: number; z0: number } | null;
  contacts: V2Contact[];
};

const FOOT = {
  L: { an: V2J.lAn, he: V2J.lHe, to: V2J.lTo, kn: V2J.lKn, hip: V2J.lHip },
  R: { an: V2J.rAn, he: V2J.rHe, to: V2J.rTo, kn: V2J.rKn, hip: V2J.rHip },
} as const;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
};

/** AI 가 늘 이만큼은 섞인다(잘 보인 관절도 사람다운 쪽으로 조금) — 확신이 낮을수록 AI 쪽으로 */
const AI_MIN = 0.35;
/** 부모 → 자식(차례대로 — 부모가 먼저 고쳐진다) */
const AI_CHAINS: [number, number][] = [
  [V2J.lSh, V2J.lEl],
  [V2J.lEl, V2J.lWr],
  [V2J.lWr, V2J.lHandMid],
  [V2J.lWr, V2J.lHandIdx],
  [V2J.lWr, V2J.lHandPinky],
  [V2J.rSh, V2J.rEl],
  [V2J.rEl, V2J.rWr],
  [V2J.rWr, V2J.rHandMid],
  [V2J.rWr, V2J.rHandIdx],
  [V2J.rWr, V2J.rHandPinky],
  [V2J.lHip, V2J.lKn],
  [V2J.lKn, V2J.lAn],
  [V2J.lAn, V2J.lHe],
  [V2J.lAn, V2J.lTo],
  [V2J.rHip, V2J.rKn],
  [V2J.rKn, V2J.rAn],
  [V2J.rAn, V2J.rHe],
  [V2J.rAn, V2J.rTo],
];

/** 결과에 실린 AI 관절(실험) — 모양이 맞을 때만(키 = 1). 섞는 비율(w)이 실렸는데 모양이 틀리면 AI 를 안 쓴다 */
export function readAiJoints(r: Pitch3dV2Ok): Vec3[][] | null {
  const j = r.experimental?.sam3d?.joints;
  if (!Array.isArray(j) || j.length !== r.joints.length) return null;
  if (r.experimental?.sam3d?.w !== undefined && readAiGate(r) === null) return null;
  for (const fr of j)
    if (
      !Array.isArray(fr) ||
      fr.length !== r.joints[0].length ||
      !fr.every((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite))
    )
      return null;
  return j.map((fr) => fr.map((p) => [p[0] / 1000, p[1] / 1000, p[2] / 1000] as Vec3));
}

/** 장면 × 관절마다 AI 를 섞는 비율 0~1(두 영상에 더 가까운 만큼, GPU 가 잼) — 없거나 모양이 틀리면 null */
export function readAiGate(r: Pitch3dV2Ok): number[][] | null {
  const w = r.experimental?.sam3d?.w;
  if (!Array.isArray(w) || w.length !== r.joints.length) return null;
  for (const row of w)
    if (
      !Array.isArray(row) ||
      row.length !== r.joints[0].length ||
      !row.every((v) => Number.isFinite(v) && v >= 0 && v <= 100)
    )
      return null;
  return w.map((row) => row.map((v) => v / 100));
}

/** AI 가 못 본 장면(섞지 않는다) — 모양이 틀리면 빈 것 */
export function readAiMiss(r: Pitch3dV2Ok): Set<number> {
  const m = r.experimental?.sam3d?.miss;
  return new Set(Array.isArray(m) ? m.filter((k) => Number.isInteger(k)) : []);
}

/**
 * AI 스켈레톤 보정 섞기 — 팔 · 다리 · 머리 마디의 방향을 우리 것과 AI 것 사이로, 길이는 우리 것.
 * 비율: gate(GPU 가 두 영상에 비춰 AI 가 더 가까운 만큼)가 있으면 그것만 — 2026-10-09 샘플 3 · 4 에서 AI 가 영상과 우리보다 2~5배 멀어
 * '늘 AI_MIN 이상'이 오히려 영상과 멀어지게 했다. gate 가 없는 옛 결과는 예전처럼 확신이 낮을수록 AI(늘 AI_MIN 이상).
 * 땅에 닿아 묶인 발 쪽 다리는 우리 것 그대로. 섞은 관절의 확신도 그만큼 올린다(관절 각도 모델이 믿게).
 */
export function blendAi(
  ours: Vec3[][],
  ai: Vec3[][],
  conf: number[][],
  contacts: V2Contact[],
  miss: Set<number> = new Set(),
  gate: number[][] | null = null
): { frames: Vec3[][]; conf: number[][] } {
  const weight = (k: number, j: number) => (gate ? gate[k][j] : clamp(1 - conf[k][j] / 100, AI_MIN, 1));
  const unit = (v: Vec3): Vec3 => {
    const n = Math.hypot(...v);
    return n > 1e-9 ? [v[0] / n, v[1] / n, v[2] / n] : [0, 0, 0];
  };
  const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const legOf: Record<number, 'L' | 'R'> = {
    [V2J.lKn]: 'L',
    [V2J.lAn]: 'L',
    [V2J.lHe]: 'L',
    [V2J.lTo]: 'L',
    [V2J.rKn]: 'R',
    [V2J.rAn]: 'R',
    [V2J.rHe]: 'R',
    [V2J.rTo]: 'R',
  };
  const pinned = (k: number, side: 'L' | 'R') =>
    contacts.some((c) => c.side === side && k >= c.from && k <= c.to);
  const outConf = conf.map((row) => [...row]);
  const frames = ours.map((fr, k) => {
    const o = fr.map((p) => [...p] as Vec3);
    if (miss.has(k)) return o;
    const a = ai[k];
    const mix = (from: Vec3, dirO: Vec3, dirA: Vec3, len: number, w: number): Vec3 => {
      const d = unit([
        (1 - w) * dirO[0] + w * dirA[0],
        (1 - w) * dirO[1] + w * dirA[1],
        (1 - w) * dirO[2] + w * dirA[2],
      ]);
      return [from[0] + d[0] * len, from[1] + d[1] * len, from[2] + d[2] * len];
    };
    for (const [p, c] of AI_CHAINS) {
      const side = legOf[c];
      const w = side && pinned(k, side) ? 0 : weight(k, c);
      /* w = 0 이어도 다시 붙인다 — 부모(팔꿈치)만 AI 쪽으로 갔을 때 자식(손목)이 제자리에 남으면 아래팔 길이가 바뀐다 */
      const dO = sub3(fr[c], fr[p]);
      o[c] = mix(o[p], unit(dO), unit(sub3(a[c], a[p])), Math.hypot(...dO), w);
      outConf[k][c] = Math.round(conf[k][c] + (100 - conf[k][c]) * w * 0.8);
    }
    /* 머리(코 · 귀) — 어깨 가운데에서 */
    const neckO = add(fr[V2J.lSh], fr[V2J.rSh]).map((v) => v / 2) as Vec3;
    const neckA = add(a[V2J.lSh], a[V2J.rSh]).map((v) => v / 2) as Vec3;
    const neckN = add(o[V2J.lSh], o[V2J.rSh]).map((v) => v / 2) as Vec3;
    for (const j of [V2J.nose, V2J.lEar, V2J.rEar]) {
      const w = weight(k, j);
      if (w <= 0) continue;
      const dO = sub3(fr[j], neckO);
      o[j] = mix(neckN, unit(dO), unit(sub3(a[j], neckA)), Math.hypot(...dO), w);
      outConf[k][j] = Math.round(conf[k][j] + (100 - conf[k][j]) * w * 0.8);
    }
    return o;
  });
  return { frames, conf: outConf };
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

/** 던지는 팔 관절(릴리스 앞뒤 DESPIKE_KEEP 장면은 걸지 않는다 — 진짜로 빠르다) */
const THROW_ARM = {
  R: [V2J.rSh, V2J.rEl, V2J.rWr, V2J.rHandIdx, V2J.rHandMid, V2J.rHandPinky],
  L: [V2J.lSh, V2J.lEl, V2J.lWr, V2J.lHandIdx, V2J.lHandMid, V2J.lHandPinky],
} as const;
const DESPIKE_KEEP = 10;
const SKIP = new Set<number>([
  /* 다리 — 땅에 묶인 구간 경계는 관절 각도 모델이 묶인 자리에서 서서히 풀어 준다. 여기서 경계 장면을 옮기면 그것과 엇갈려 무릎 · 발목이 8~14mm 튀었다 */
  V2J.lKn,
  V2J.rKn,
  V2J.lAn,
  V2J.rAn,
  V2J.lHe,
  V2J.rHe,
  V2J.lTo,
  V2J.rTo,
  V2J.lHandIdx,
  V2J.lHandMid,
  V2J.lHandPinky,
  V2J.rHandIdx,
  V2J.rHandMid,
  V2J.rHandPinky,
]);

/**
 * 원본 걸름 — 관절마다 장면 사이 굽음(두 이웃 가운데에서 벗어난 거리)이 앞뒤 3~6장면 굽음의 아래쪽 값보다 4배 넘게, 키의 1% 넘게 튀면 두 이웃 가운데로
 * 되돌린다(세 번까지 — 지그재그도). 관절 각도 모델을 지나고도 한 장면만 튀는 관절(손 확신이 0 으로 떨어지는 장면의 글러브 손목 · 엔진이 한 장면
 * 79mm 옮긴 팔꿈치)이 남았다(2026-10-10 샘플 다섯). 꾸준히 빠른 움직임은 이웃 굽음도 커서 걸리지 않는다.
 */
export function despike(frames: Vec3[][], hand: 'R' | 'L', release: number): Vec3[][] {
  const n = frames.length;
  const out = frames.map((fr) => fr.map((p) => [...p] as Vec3));
  if (n < 5) return out;
  const keep = new Set<number>(THROW_ARM[hand]);
  const bend = (j: number, k: number) => {
    const m = [0, 1, 2].map((i) => (out[k - 1][j][i] + out[k + 1][j][i]) / 2);
    return Math.hypot(...[0, 1, 2].map((i) => out[k][j][i] - m[i]));
  };
  /*
   * 손 점은 걸지 않는다 — 점이 작아 늘 들쭉날쭉해 '튐'으로 잘못 읽힌다(손은 관절 각도 모델이 손목 틀에서 다시 만든다). 손목은 건다.
   */
  const order = Array.from({ length: 25 }, (_, j) => j).filter((j) => !SKIP.has(j));
  for (const j of order) {
    for (let pass = 0; pass < 3; pass++) {
      const b = Array.from({ length: n }, (_, k) => (k > 0 && k < n - 1 ? bend(j, k) : 0));
      /* 크게 튄 장면부터 — 튄 장면 바로 옆은 '반쯤 튄' 것으로 읽혀 먼저 고치면 튄 장면이 덜 돌아온다. 고친 장면의 이웃은 다음 차례에 다시 잰다 */
      const hits: number[] = [];
      for (let k = 1; k < n - 1; k++) {
        if (keep.has(j) && Math.abs(k - release) <= DESPIKE_KEEP) continue;
        /* 이웃 굽음 — 튐이 몇 장면 이어지면(지그재그) 가까운 이웃도 튀어 있어 앞뒤 3~6장면에서 아래쪽 값으로 */
        const near = [k - 6, k - 5, k - 4, k - 3, k + 3, k + 4, k + 5, k + 6]
          .filter((q) => q > 0 && q < n - 1)
          .map((q) => b[q])
          .sort((x, y) => x - y);
        const loc = near.length ? near[Math.floor(near.length / 3)] : 0;
        if (b[k] > 0.01 && b[k] > 4 * loc) hits.push(k);
      }
      hits.sort((x, y) => b[y] - b[x]);
      const done = new Set<number>();
      let changed = false;
      for (const k of hits) {
        if (done.has(k - 1) || done.has(k + 1)) continue;
        const to = [0, 1, 2].map((i) => (out[k - 1][j][i] + out[k + 1][j][i]) / 2) as Vec3;
        out[k][j] = to;
        done.add(k);
        changed = true;
      }
      if (!changed) break;
    }
  }
  return out;
}

/**
 * 가려진 앞발 일찍 묶기(화면만) — 엔진은 앞발이 묶을 자리 근처로 와야 땅에 묶는데, 착지 무렵 앞발이 가려지거나 번져 메워 넣은 발(확신 LEAD_HIDDEN_CONF
 * 밑)이 그 자리에서 떨어져 있으면 6~17장면 늦게 묶여, 그사이 디딘 발이 옆으로 15~35cm 미끄러지다 툭 붙었다(2026-10-15 실험실 샘플 2 · 4 · 5 · 10).
 * 그 앞발 묶음을 착지(footPlant)까지 앞으로 늘리고(발 전체가 닿는 때까지만 늘리면 뒤꿈치 ~ 발바닥 사이에 16cm 가 남았다), 늘린 장면의 앞발(발목 · 뒤꿈치 · 발끝)은 묶일 자리(원래 묶음 첫 장면)에 둔다 —
 * 무릎은 화면이 두 마디로 다시 접고 발끝 쪽으로 맞춘다(kinematicTrack). 엔진에서 하면 무릎이 엉덩이와 묶인 발 사이에 끼여 꺾였다(마커 · 샘플 10).
 * 잘 보이는 앞발(마커 투구 등)은 엔진이 구르며 자리 잡는 때를 맞게 잡으니 그대로.
 */
export function pinLeadEarly(
  raw: Vec3[][],
  conf: number[][],
  contacts: V2Contact[],
  result: Pick<Pitch3dV2Ok, 'hand' | 'events'>
): { raw: Vec3[][]; contacts: V2Contact[] } {
  const lead = result.hand === 'L' ? 'R' : 'L';
  const foot = lead === 'L' ? [V2J.lAn, V2J.lHe, V2J.lTo] : [V2J.rAn, V2J.rHe, V2J.rTo];
  const fp = result.events.footPlant;
  const i = contacts.findIndex((c) => c.side === lead && c.from > fp && c.from <= result.events.release);
  if (i < 0) return { raw, contacts };
  const c = contacts[i];
  const seen: number[] = [];
  for (let k = fp; k < c.from; k++) seen.push(Math.max(...foot.map((j) => conf[k]?.[j] ?? 0)));
  if (!seen.length || median(seen) >= LEAD_HIDDEN_CONF) return { raw, contacts };
  const out = raw.map((fr) => fr.slice());
  /*
   * 묶일 자리가 그 장면 엉덩이에서 엔진 다리(엉덩이 → 발목 거리)보다 멀면 그쪽으로 닿는 만큼만 — 그대로 두면 화면이 정강이를 늘려 발을 닿게 해
   * 무릎이 펴졌다(2026-10-15 김민 "샘플 4 왼무릎이 이상": 착지 무렵 정강이 250 → 317mm, 엔진 무릎 24~34° 가 화면 2~6°). 엉덩이가 나아가며 발이 자리에 닿는다.
   */
  const [an] = foot;
  const hip = lead === 'L' ? V2J.lHip : V2J.rHip;
  for (let k = fp; k < c.from; k++) {
    const reach = norm(sub(raw[k][an], raw[k][hip])) + REACH_SLACK;
    const to = sub(raw[c.from][an], raw[k][hip]);
    const d = norm(to);
    const shift: Vec3 = d > reach ? scale(to, reach / d - 1) : [0, 0, 0];
    for (const j of foot) out[k][j] = add(raw[c.from][j], shift);
  }
  const cs = contacts.slice();
  cs[i] = { ...c, from: fp };
  return { raw: out, contacts: cs };
}
/** 이 확신(0~100) 밑이면 메워 넣은 앞발로 본다 — 엔진이 관찰 없이 채운 관절은 30 */
const LEAD_HIDDEN_CONF = 40;
/** 다리를 엔진의 엉덩이 → 발목 거리보다 더 펴도 되는 몫(키 1 기준, 0.5%) */
const REACH_SLACK = 0.005;

/** 화면 모델의 장면 사이 실제 초 — 영상 시간 그대로, 다만 착지 → 릴리스가 PLANT_TO_RELEASE_MAX_S 를 넘으면(슬로모 · 화면 녹화) 그만큼 줄인다(떨림 검사도 이것) */
export function displayFrameDt(result: Pick<Pitch3dV2Ok, 't' | 'events'>): number {
  const n = result.t.length;
  const dtMedia = median(result.t.slice(1).map((t, k) => t - result.t[k]));
  const spanMedia = result.t[Math.min(n - 1, result.events.release)] - result.t[Math.min(n - 1, result.events.footPlant)];
  return dtMedia * (spanMedia > PLANT_TO_RELEASE_MAX_S ? PLANT_TO_RELEASE_MAX_S / spanMedia : 1);
}

/**
 * 보기용 관절 — 결과 하나와 던진 곳(마운드 · 평지) · 키(m).
 */
export function displayTrack(
  result: Pitch3dV2Ok,
  /** ai — 결과에 AI 관절이 있으면 섞는다(실험) */
  opts: { ground: 'mound' | 'flat'; heightM: number; ai?: boolean }
): DisplayTrack {
  let raw: Vec3[][] = result.joints.map((fr) =>
    fr.map((p) => [p[0] / 1000, p[1] / 1000, p[2] / 1000] as Vec3)
  );
  let conf = result.conf;
  const n = raw.length;
  let contacts = readContacts(result);
  ({ raw, contacts } = pinLeadEarly(raw, conf, contacts, result));
  const ai = opts.ai ? readAiJoints(result) : null;
  if (ai) ({ frames: raw, conf } = blendAi(raw, ai, conf, contacts, readAiMiss(result), readAiGate(result)));
  /*
   * 장면 간격(실제 초) — 화면 녹화 슬로모는 영상 1초가 실제로 몇 분의 1 이라, 착지 → 릴리스가 실제로 PLANT_TO_RELEASE_MAX_S 를 넘지 않는다고 보고
   * 그만큼 줄인다(원본 속도 영상은 그대로). 사람 최대 빠르기(KIN_SPEED)를 영상 시간으로 재면 슬로모에서 4~6배 넉넉해져, 착지 직후 골반 · 어깨가
   * 6장면에 60° 넘게 '휙' 도는 엔진 결과가 그대로 보였다(좌투 샘플).
   */
  const dt = displayFrameDt(result);
  /*
   * 걸름은 관절 각도 모델 앞(엔진 원본)에 — 뒤에 두면 팔꿈치만 옮겨 위팔 · 아래팔 길이가 한 장면에 5~10% 바뀌었다(2026-10-10 샘플 1 글러브 팔).
   * 앞에 두면 엔진이 한 장면 옮긴 관절(팔꿈치 79mm)을 먼저 걷고, 뼈 길이는 각도 모델이 고정한다.
   */
  const kin = kinematicTrack(despike(raw, result.hand, result.events.release), conf, contacts, {
    dt,
    hand: result.hand,
    events: result.events,
  });
  const frames = kin.frames;
  let refs = kin.refs;

  /* 2 바닥 하나 */
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
  /* 축발이 닿은 구간을 못 찾았으면(투구 구간이 어긋난 영상) 첫 장면들의 축발 자리로 마운드를 놓는다 — 없으면 마운드가 안 보였다(좌투 샘플) */
  const pivotC = contacts.find((c) => c.side === pivotSide && c.from <= fp) ?? {
    side: pivotSide,
    from: 0,
    to: Math.min(n - 1, 3),
  };
  const leadC = contacts.find(
    (c) => c.side === leadSide && c.to >= fp && c.from <= rel
  );
  let P = pivotC ? spot(pivotC) : null;
  let L = leadC ? spot(leadC) : null;
  /*
   * 두 발 높이 차가 마운드 배율(0.5~1.5배)로 못 맞추는 만큼은 몸 전체를 축발 자리 둘레로 기울인다(±8°) — 엔진의 위 축이 홈 쪽으로 몇 도 기울면
   * (화면 녹화 · 휴대용 경사판) 높이 차가 규격의 2.4배가 되어, 앞발을 경사면에 두면 축발이 투수판 앞에서 12cm 떠 있었다(2026-10-09 좌투 샘플 시작).
   */
  /*
   * 평지도 같다 — 두 발이 같은 높이여야 하는데 낮은 발만 바닥에 맞춰, 위 축이 조금 기운 만큼 다른 발이 떴다(2026-10-10 샘플 5 앞발 21mm).
   */
  if (P && L) {
    const mound = opts.ground === 'mound';
    const f0 = moundHeightAt(P.back - FOOT_HALF_WIDTH_M / opts.heightM, P.z, opts.heightM);
    const spec0 = mound ? f0(P.x, P.z) - f0(L.x, L.z) : 0;
    const drop = P.h - L.h;
    const hor = Math.hypot(L.x - P.x, L.z - P.z);
    if ((!mound || spec0 > 0.002) && hor > 0.05) {
      const want = mound ? clamp(drop, spec0 * MOUND_SCALE[0], spec0 * MOUND_SCALE[1]) : 0;
      if (Math.abs(drop - want) > 1e-4) {
        const th = clamp(Math.atan2(drop - want, hor), -MOUND_TILT_MAX, MOUND_TILT_MAX);
        /* 축 = 수평에서 축발 → 앞발에 수직, 앞발 쪽이 (drop − want) 만큼 오르는 쪽으로 */
        const d: Vec3 = [(L.x - P.x) / hor, 0, (L.z - P.z) / hor];
        const ax: Vec3 = [-d[2], 0, d[0]];
        const C: Vec3 = [P.x, P.h, P.z];
        const turn = (v: Vec3, a: number): Vec3 => {
          const c = Math.cos(a);
          const s2 = Math.sin(a);
          const k = ax;
          const kv = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
          const kx: Vec3 = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
          return [0, 1, 2].map((i) => v[i] * c + kx[i] * s2 + k[i] * kv * (1 - c)) as Vec3;
        };
        /* 앞발 쪽이 오르는 방향을 고른다 */
        const lift = turn([L.x - P.x, L.h - P.h, L.z - P.z], th)[1] - (L.h - P.h);
        const a = lift * (drop - want) >= 0 ? th : -th;
        for (const fr of frames)
          for (let j = 0; j < fr.length; j++) {
            const v = turn([fr[j][0] - C[0], fr[j][1] - C[1], fr[j][2] - C[2]], a);
            fr[j] = [v[0] + C[0], v[1] + C[1], v[2] + C[2]];
          }
        refs = refs.map((r) =>
          Object.fromEntries(Object.entries(r).map(([key, v]) => [key, turn(v as Vec3, a)]))
        ) as typeof refs;
        P = pivotC ? spot(pivotC) : null;
        L = leadC ? spot(leadC) : null;
      }
    }
  }
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

  /* 3 바닥 밑의 발 — 올리고 무릎을 다시 접는다 */
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
      fr[F.kn] = twoBoneIk(
        fr[F.hip],
        fr[F.kn],
        fr[F.an],
        an,
        kneePole(fr[F.hip], fr[F.kn], refs[k][side === 'L' ? 'thighL' : 'thighR'])
      );
      fr[F.an] = an;
      fr[F.he] = add(fr[F.he], up);
      fr[F.to] = add(fr[F.to], up);
    }
  }
  /* 투수판 — 마운드는 그 자리 그대로, 평지도 같은 축발 자리로(위의 offset 은 높이만 바꿔 앞 · 옆 자리는 그대로다) */
  const rubber: DisplayTrack['rubber'] = mound
    ? { x0: mound.x0, z0: mound.z0 }
    : P
      ? { x0: P.back - FOOT_HALF_WIDTH_M / opts.heightM, z0: P.z }
      : null;
  return { frames, refs, groundAt, mound, rubber, contacts };
}
