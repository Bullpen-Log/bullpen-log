import { add, type Vec3 } from '@/lib/pitch-3d/linalg';
import { V2J, type Pitch3dV2Ok, type V2Contact } from '@/lib/pitch-3d/v2/contract';
import {
  kinematicTrack,
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
  opts: { ground: 'mound' | 'flat'; heightM: number }
): DisplayTrack {
  const raw: Vec3[][] = result.joints.map((fr) =>
    fr.map((p) => [p[0] / 1000, p[1] / 1000, p[2] / 1000] as Vec3)
  );
  const n = raw.length;
  const contacts = readContacts(result);
  const { frames, refs } = kinematicTrack(raw, result.conf, contacts);

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
      fr[F.kn] = twoBoneIk(fr[F.hip], fr[F.kn], fr[F.an], an);
      fr[F.an] = an;
      fr[F.he] = add(fr[F.he], up);
      fr[F.to] = add(fr[F.to], up);
    }
  }
  return { frames, refs, groundAt, mound, contacts };
}
