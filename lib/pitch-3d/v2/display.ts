import { add, type Vec3 } from '@/lib/pitch-3d/linalg';
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
  /** 장면마다 부위 기준 방향(pose-rig rigPose 의 refs) */
  refs: KinematicTrack['refs'];
  /** 발밑 높이(평지면 늘 0) */
  groundAt: (x: number, z: number) => number;
  /** 마운드 — 투수판 앞 모서리(축발 뒤 가장자리) · 높이 배율. 평지면 null */
  mound: { x0: number; z0: number; scale: number } | null;
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
  const contacts = readContacts(result);
  const ai = opts.ai ? readAiJoints(result) : null;
  if (ai) ({ frames: raw, conf } = blendAi(raw, ai, conf, contacts, readAiMiss(result), readAiGate(result)));
  /*
   * 장면 간격(실제 초) — 화면 녹화 슬로모는 영상 1초가 실제로 몇 분의 1 이라, 착지 → 릴리스가 실제로 PLANT_TO_RELEASE_MAX_S 를 넘지 않는다고 보고
   * 그만큼 줄인다(원본 속도 영상은 그대로). 사람 최대 빠르기(KIN_SPEED)를 영상 시간으로 재면 슬로모에서 4~6배 넉넉해져, 착지 직후 골반 · 어깨가
   * 6장면에 60° 넘게 '휙' 도는 엔진 결과가 그대로 보였다(좌투 샘플).
   */
  const dtMedia = median(result.t.slice(1).map((t, k) => t - result.t[k]));
  const spanMedia =
    result.t[Math.min(n - 1, result.events.release)] - result.t[Math.min(n - 1, result.events.footPlant)];
  const dt = dtMedia * (spanMedia > PLANT_TO_RELEASE_MAX_S ? PLANT_TO_RELEASE_MAX_S / spanMedia : 1);
  const kin = kinematicTrack(raw, conf, contacts, { dt, hand: result.hand });
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
  if (opts.ground === 'mound' && P && L) {
    const f0 = moundHeightAt(P.back - FOOT_HALF_WIDTH_M / opts.heightM, P.z, opts.heightM);
    const spec0 = f0(P.x, P.z) - f0(L.x, L.z);
    const drop = P.h - L.h;
    const hor = Math.hypot(L.x - P.x, L.z - P.z);
    if (spec0 > 0.002 && hor > 0.05) {
      const want = clamp(drop, spec0 * MOUND_SCALE[0], spec0 * MOUND_SCALE[1]);
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
  return { frames, refs, groundAt, mound, contacts };
}
