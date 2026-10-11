import { add, cross, dot, norm, normalize, reject, scale, sub, type Vec3 } from '@/lib/pitch-3d/linalg';
import { V2J, type Pitch3dV2Ok } from '@/lib/pitch-3d/v2/contract';
import { readAiJoints, readAiMiss } from '@/lib/pitch-3d/v2/display';

/**
 * 몸통 마디(허리 · 등) — 엉덩이선과 어깨선 사이를 세 높이로 나눠 그 높이의 '단면 가운데'와 '좌우 축'을 장면마다 정한다. 순수 — 화면(인형 몸통)과
 * 시험이 같은 코드.
 *
 * 2026-10-12 김민: "몸통이 꽈배기처럼 꼬이고 숙여지는 게 전혀 구현이 안 된다 · 골반도" → 하이브리드(김민이 고름):
 *   - 위 · 아래 끝은 우리 엔진 값 — 엉덩이선 · 어깨선(두 영상에서 잰 것)이 기준이고 그대로 둔다.
 *   - 사이(허리 · 등)는 AI(SAM 3D Body)가 맞춘 몸 겉면을 잘라 잰 값(experimental.sam3d.trunk) — 그 투수의 꼬임 나눔 · 휨.
 *     AI 의 모양은 AI 자신의 엉덩이 · 어깨에 대한 '상대' 값으로만 쓰고 우리 끝에 다시 붙인다(AI 의 몸 전체 방향은 안 믿는다).
 *   - AI 가 못 봤거나 우리 끝과 많이 다르면 규칙으로 채운다 — 공개 연구의 평균(척추 축 돌림은 대부분 등뼈(흉추)에서, 허리뼈는
 *     5~10° 남짓 · 숙임은 골반 기울기에서 이어지는 매끈한 곡선). 드라이브라인 자료는 쓰지 않는다(사용권).
 *
 * 높이 비율 TRUNK_LEVELS 는 GPU(services/pitch3d-gpu/pitch3d_gpu/sam3d.py TRUNK_LEVELS)와 인형 몸통 가운데 선(mannequin-loft torsoModel)과 같다.
 * 좌표: 입력 장면과 같은 축(보기 좌표 [앞, 위, 오른쪽] — 단위는 무엇이든, 비율만 쓴다).
 */

export const TRUNK_LEVELS = [0.41, 0.6, 0.83] as const;

/**
 * 규칙 — 엉덩이선 → 어깨선 꼬임 중 그 높이까지 돌아 있는 몫. 척추 축 돌림 범위는 허리뼈 다 합쳐 ~10°, 등뼈 ~35°(White & Panjabi 정리) —
 * 몸통 꼬임의 대부분이 가슴 쪽에서 일어난다. 허리 높이(0.41)는 아직 조금, 가슴 밑(0.6) 절반 가까이, 가슴(0.83)은 거의 다.
 */
export const RULE_TWIST = [0.15, 0.45, 0.8] as const;

/** 규칙 — 숙임 곡선: 골반 위 방향으로 이만큼(몸통 길이 비율) 나간 뒤 어깨로 휜다(2차 베지에의 가운데 점) */
export const RULE_BEND = 0.45;

/** AI 를 믿는 정도 — AI 의 엉덩이 → 어깨 꼬임이 우리 것과 이 각(도) 안이면 다 믿고, 이 각 넘으면 안 믿는다 */
export const AI_AGREE_DEG = [25, 50] as const;
/**
 * 사람 척추가 낼 수 있는 폭 — 높이마다 AI 꼬임이 규칙 값에서 이만큼(도) 넘게 벗어나면 그만큼 덜 믿고(두 번째 값에서 0), 첫 값으로 묶는다.
 * 허리뼈 축 돌림은 다 합쳐 ~10°, 등뼈 ~35° — 규칙이 이미 그 나눔이라 큰 차이는 잘못 잰 단면(팔 · 비스듬한 자름)으로 본다.
 * 25 · 45 로 두었더니 실제 샘플(2026-10-12 넷)에서 허리 +13° · 가슴 −14° 처럼 위아래가 반대로 꼬인 S 자가 나왔다 — 12 · 25 로 좁힘.
 */
export const AI_SPINE_DEV_DEG = [12, 25] as const;
/** AI 마디 값(꼬임 · 휨)을 장면 사이로 고르는 폭(장면, 가우스 σ) — AI 는 그림마다 따로 봐서 떤다(샘플 넷: 장면 사이 p95 10~29°) */
export const AI_SMOOTH = 3;
/**
 * AI 믿음 비율을 장면 사이로 고르기 — 먼저 앞뒤 WEIGHT_ERODE 장면 중 가장 낮은 값으로 깎고(못 믿는 장면 둘레로 믿음이 새어 들지 않게)
 * 가우스 σ WEIGHT_SMOOTH 로 고른다(장면마다 껐다 켜지면 몸통이 덜컥인다)
 */
export const WEIGHT_ERODE = 4;
export const WEIGHT_SMOOTH = 2;
/** AI 휨(직선에서 벗어난 거리)의 상한 — 몸통 길이 비율. 이보다 크면 잘못 잰 것으로 보고 줄인다 */
export const MAX_BEND = 0.18;
/**
 * AI 휨(치우침 뺀 것 — 규칙 곡선에서 벗어난 거리, 몸통 길이 비율)을 믿는 폭 — 첫 값까지 다 믿고 두 번째 값에서 0. 휨은 꼬임과 따로 믿는다:
 * 실제 샘플(2026-10-12 넷)에서 AI 높이별 꼬임은 장면마다 크게 흔들려 6~20% 만 믿었지만, 단면 가운데(휨)는 겉면 점이 많아 덜 흔들린다.
 */
export const AI_BEND_DEV = [0.06, 0.12] as const;

export type TrunkLevel = { c: Vec3; x: Vec3 };

export type TrunkTrack = {
  /** 장면 × 높이 3 — 단면 가운데 · 좌우 축(단위, 몸 오른쪽) */
  levels: TrunkLevel[][];
  /** 장면마다 AI 꼬임을 쓴 비율(0 = 규칙만) */
  ai: number[];
  /** 장면마다 AI 휨을 쓴 비율(0 = 규칙만) */
  aiBend: number[];
};

/** 결과에 실린 AI 몸통 마디(장면 × 6 점, 키 = 1) — 모양이 틀리면 null */
export function readAiTrunk(r: Pitch3dV2Ok): Vec3[][] | null {
  const t = r.experimental?.sam3d?.trunk;
  if (!Array.isArray(t) || t.length !== r.joints.length) return null;
  for (const fr of t)
    if (
      !Array.isArray(fr) ||
      fr.length !== TRUNK_LEVELS.length * 2 ||
      !fr.every((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite))
    )
      return null;
  return t.map((fr) => fr.map((p) => [p[0] / 1000, p[1] / 1000, p[2] / 1000] as Vec3));
}

/** 결과에서 몸통 마디 계산에 쓸 AI 값 셋 — 없으면 null 들(규칙만) */
export function aiTrunkInputs(r: Partial<Pick<Pitch3dV2Ok, 'joints' | 'experimental'>>) {
  if (!r.joints || !r.experimental?.sam3d) return { joints: null, trunk: null, miss: new Set<number>() };
  const full = r as Pitch3dV2Ok;
  return { joints: readAiJoints(full), trunk: readAiTrunk(full), miss: readAiMiss(full) };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** 축 n 둘레로 v 를 각 a 만큼(로드리게스) */
function rotAbout(v: Vec3, n: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return add(add(scale(v, c), scale(cross(n, v), s)), scale(n, dot(n, v) * (1 - c)));
}

/** 축 n 에 수직인 면에서 a → b 의 부호 있는 각 */
function signedAngle(a: Vec3, b: Vec3, n: Vec3): number {
  const pa = reject(a, n);
  const pb = reject(b, n);
  return Math.atan2(dot(cross(pa, pb), n), dot(pa, pb));
}

/** 한 장면의 몸통 끝 — 엉덩이 가운데 · 어깨 가운데 · 축(단위) · 길이 · 엉덩이선 · 어깨선(축에 수직, 단위) · 골반 위 방향 */
type Ends = { H: Vec3; S: Vec3; a: Vec3; L: number; p: Vec3; q: Vec3; f: Vec3; up: Vec3 };

function endsOf(fr: Vec3[]): Ends | null {
  const H = scale(add(fr[V2J.lHip], fr[V2J.rHip]), 0.5);
  const S = scale(add(fr[V2J.lSh], fr[V2J.rSh]), 0.5);
  const ax = sub(S, H);
  const L = norm(ax);
  if (!(L > 1e-6)) return null;
  const a = scale(ax, 1 / L);
  const p0 = reject(sub(fr[V2J.rHip], fr[V2J.lHip]), a);
  const q0 = reject(sub(fr[V2J.rSh], fr[V2J.lSh]), a);
  if (norm(p0) < 1e-9 || norm(q0) < 1e-9) return null;
  const p = normalize(p0);
  /* 골반 위 방향 — 몸통 축과 '허벅지 반대쪽'을 6:4(인형 골반 틀과 같은 규칙) */
  const th = add(normalize(sub(fr[V2J.rHip], fr[V2J.rKn])), normalize(sub(fr[V2J.lHip], fr[V2J.lKn])));
  const up = norm(th) > 1e-9 ? normalize(add(scale(a, 0.6), scale(normalize(th), 0.4))) : a;
  return { H, S, a, L, p, q: normalize(q0), f: normalize(cross(p, a)), up };
}

/**
 * 규칙 높이 — 가운데는 축 위 f 높이에서 '골반 위 방향 → 어깨로 휘는 2차 곡선'만큼 옆으로 비킨 자리(높이는 AI 마디 · 인형 몸통 점과 같은 f),
 * 좌우 축은 엉덩이선을 RULE_TWIST 만큼 어깨선 쪽으로.
 */
function ruleLevel(e: Ends, i: number): { c: Vec3; phi: number } {
  const f = TRUNK_LEVELS[i];
  const P1 = add(e.H, scale(e.up, e.L * RULE_BEND));
  const B = add(add(scale(e.H, (1 - f) * (1 - f)), scale(P1, 2 * f * (1 - f))), scale(e.S, f * f));
  const c = add(add(e.H, scale(e.a, e.L * f)), reject(sub(B, e.H), e.a));
  return { c, phi: signedAngle(e.p, e.q, e.a) * RULE_TWIST[i] };
}

/** 가우스로 장면 사이 고르기(빈 값은 건너뜀) */
function smoothSeries(xs: (number | null)[], sigma: number): (number | null)[] {
  const R = Math.ceil(3 * sigma);
  return xs.map((x, i) => {
    if (x === null) return null;
    let s = 0;
    let w = 0;
    for (let d = -R; d <= R; d++) {
      const v = xs[i + d];
      if (v === null || v === undefined) continue;
      const k = Math.exp(-(d * d) / (2 * sigma * sigma));
      s += v * k;
      w += k;
    }
    return s / w;
  });
}

/**
 * 장면마다 몸통 세 높이 — 우리 장면(frames, 보기 좌표 25 관절)에 AI 몸통 마디를 상대 값으로 붙이고, 못 믿는 만큼 규칙과 섞는다.
 * aiJoints · aiTrunk 는 같은 장면 차례의 AI 관절(25) · 마디(6 점). 없으면 규칙만. miss 장면은 규칙만.
 */
export function trunkTrack(
  frames: Vec3[][],
  aiJoints: Vec3[][] | null,
  aiTrunk: Vec3[][] | null,
  miss: Set<number> = new Set()
): TrunkTrack {
  const n = frames.length;
  const ends = frames.map(endsOf);
  const nl = TRUNK_LEVELS.length;
  /* AI 상대 값 — 높이마다 (꼬임 각 φ: 엉덩이선에서, 앞 · 옆 휨: 몸통 길이 비율), 그리고 AI 끝 꼬임 */
  const aiPhi: (number | null)[][] = Array.from({ length: nl }, () => Array<number | null>(n).fill(null));
  const aiOffF: (number | null)[][] = Array.from({ length: nl }, () => Array<number | null>(n).fill(null));
  const aiOffS: (number | null)[][] = Array.from({ length: nl }, () => Array<number | null>(n).fill(null));
  const agree: (number | null)[] = Array<number | null>(n).fill(null);
  const agreeBend: (number | null)[] = Array<number | null>(n).fill(null);
  /* 1차 — 장면마다 AI 높이 꼬임(자기 엉덩이선에서)과 끝 꼬임 · 휨. 높이마다 클립 전체에 붙은 고정 치우침은 2차에서 뺀다 */
  const raw: ({ phis: number[]; offs: [number, number][]; total: number; totalAi: number } | null)[] = Array(n).fill(null);
  if (aiJoints && aiTrunk && aiJoints.length === n && aiTrunk.length === n) {
    /* 잰 높이 — 좌우 점이 가운데에서 떨어져 있어야(GPU 가 못 잰 높이는 두 점이 같다). 기준 = 장면들의 가운데 값의 30% */
    const sideLens = aiTrunk.flatMap((fr) => TRUNK_LEVELS.map((_, i) => norm(sub(fr[2 * i + 1], fr[2 * i]))));
    const sorted = sideLens.filter((v) => v > 0).sort((x, y) => x - y);
    const minSide = sorted.length ? 0.3 * sorted[sorted.length >> 1] : Infinity;
    for (let k = 0; k < n; k++) {
      const e = ends[k];
      const ea = endsOf(aiJoints[k]);
      if (!e || !ea || miss.has(k)) continue;
      const fr = aiTrunk[k];
      let ok = true;
      const phis: number[] = [];
      const offs: [number, number][] = [];
      for (let i = 0; i < nl; i++) {
        const c = fr[2 * i];
        const sv = sub(fr[2 * i + 1], c);
        if (!(norm(sv) >= minSide)) {
          ok = false;
          break;
        }
        let ph = signedAngle(ea.p, sv, ea.a);
        /* 좌우 부호 — 엉덩이선 → 어깨선을 높이대로 섞은 방향과 같은 쪽(GPU 와 같은 규칙, 거울처럼 뒤집힌 축 막기) */
        const ref = add(scale(ea.p, 1 - TRUNK_LEVELS[i]), scale(ea.q, TRUNK_LEVELS[i]));
        if (dot(reject(sv, ea.a), ref) < 0) ph = wrap(ph + Math.PI);
        phis.push(ph);
        const d = sub(c, add(ea.H, scale(ea.a, ea.L * TRUNK_LEVELS[i])));
        const bf = clamp(dot(d, ea.f) / ea.L, -MAX_BEND, MAX_BEND);
        const bs = clamp(dot(d, ea.p) / ea.L, -MAX_BEND, MAX_BEND);
        offs.push([bf, bs]);
      }
      if (!ok) continue;
      raw[k] = { phis, offs, total: signedAngle(e.p, e.q, e.a), totalAi: signedAngle(ea.p, ea.q, ea.a) };
    }
  }
  /*
   * 2차 — 높이마다 고정 치우침 빼기. 몸 겉면 단면의 주축은 몸이 곧게 서 있어도 엉덩이 관절선에서 몇 도 비켜 있고(겉면이 좌우로 완전히 같지 않다),
   * 그 치우침이 클립 내내 같은 쪽이라 꼬임 몫이 1.3~1.6 처럼 보였다(2026-10-12 샘플 넷). AI 값에서 규칙 값을 뺀 차의 클립 가운데 값을
   * 높이마다 빼면 AI 가 장면마다 '규칙보다 더 · 덜' 꼬인 움직임만 남는다. 휨도 같은 방법(겉면 단면 가운데는 앞뒤 두께 탓에 늘 조금 앞뒤로).
   */
  const medOf = (xs: number[]) => {
    const s2 = [...xs].sort((x, y) => x - y);
    return s2.length ? s2[s2.length >> 1] : 0;
  };
  const bias = Array.from({ length: nl }, (_, i) => {
    const ds: number[] = [];
    const fs: number[] = [];
    const ss: number[] = [];
    for (const r of raw) {
      if (!r) continue;
      ds.push(wrap(r.phis[i] - r.totalAi * RULE_TWIST[i]));
      fs.push(r.offs[i][0]);
      ss.push(r.offs[i][1]);
    }
    return { phi: medOf(ds), f: medOf(fs), s: medOf(ss) };
  });
  const dev0 = (AI_SPINE_DEV_DEG[0] * Math.PI) / 180;
  for (let k = 0; k < n; k++) {
    const r = raw[k];
    if (!r) continue;
    const { total, totalAi } = r;
    const diff = Math.abs(wrap(total - totalAi)) * (180 / Math.PI);
    const endTrust = 1 - clamp((diff - AI_AGREE_DEG[0]) / (AI_AGREE_DEG[1] - AI_AGREE_DEG[0]), 0, 1);
    let trust = endTrust;
    let bendTrust = endTrust;
    for (let i = 0; i < nl; i++) {
      /* AI 의 꼬임 나눔(치우침 뺀 것)은 그대로, 끝이 우리 끝과 다른 만큼은 규칙 몫대로 나눠 맞춘다 */
      const rule = total * RULE_TWIST[i];
      const dev = wrap(r.phis[i] - bias[i].phi - totalAi * RULE_TWIST[i]);
      const devDeg = Math.abs(dev) * (180 / Math.PI);
      trust *= 1 - clamp((devDeg - AI_SPINE_DEV_DEG[0]) / (AI_SPINE_DEV_DEG[1] - AI_SPINE_DEV_DEG[0]), 0, 1);
      aiPhi[i][k] = rule + clamp(dev, -dev0, dev0);
      const bf = r.offs[i][0] - bias[i].f;
      const bs = r.offs[i][1] - bias[i].s;
      const bd = Math.hypot(bf, bs);
      bendTrust *= 1 - clamp((bd - AI_BEND_DEV[0]) / (AI_BEND_DEV[1] - AI_BEND_DEV[0]), 0, 1);
      aiOffF[i][k] = bf;
      aiOffS[i][k] = bs;
    }
    agree[k] = trust;
    agreeBend[k] = bendTrust;
  }
  const sPhi = aiPhi.map((xs) => smoothSeries(xs, AI_SMOOTH));
  const sF = aiOffF.map((xs) => smoothSeries(xs, AI_SMOOTH));
  const sS = aiOffS.map((xs) => smoothSeries(xs, AI_SMOOTH));
  /* 믿음 비율 — 못 본 장면 0, 둘레 최소로 깎은 뒤 고른다(켜고 꺼지는 곳이 부드럽게, 못 믿는 장면으로 새지 않게) */
  const settle = (ag: (number | null)[]) => {
    const a0 = ag.map((v) => v ?? 0);
    const er = a0.map((_, i) => {
      let m = 1;
      for (let d = -WEIGHT_ERODE; d <= WEIGHT_ERODE; d++) if (i + d >= 0 && i + d < n) m = Math.min(m, a0[i + d]);
      return m;
    });
    const R = Math.ceil(3 * WEIGHT_SMOOTH);
    return er.map((_, i) => {
      if (ag[i] === null) return 0;
      let s2 = 0;
      let t = 0;
      for (let d = -R; d <= R; d++) {
        if (i + d < 0 || i + d >= n) continue;
        const g = Math.exp(-(d * d) / (2 * WEIGHT_SMOOTH * WEIGHT_SMOOTH));
        s2 += er[i + d] * g;
        t += g;
      }
      return s2 / t;
    });
  };
  const w = settle(agree);
  const wb = settle(agreeBend);
  const levels: TrunkLevel[][] = [];
  let prev: TrunkLevel[] | null = null;
  for (let k = 0; k < n; k++) {
    const e = ends[k];
    if (!e) {
      /* 몸통을 못 정한 장면 — 앞 장면 그대로(없으면 빈 높이 — 화면이 예전 몸통으로) */
      levels.push(prev ?? []);
      continue;
    }
    const row: TrunkLevel[] = [];
    for (let i = 0; i < nl; i++) {
      const r = ruleLevel(e, i);
      let c = r.c;
      let phi = r.phi;
      const wk = w[k];
      const ph = sPhi[i][k];
      const of = sF[i][k];
      const os = sS[i][k];
      if (wk > 0 && ph !== null) phi = lerp(phi, ph, wk);
      const wbk = wb[k];
      if (wbk > 0 && of !== null && os !== null) {
        /* AI 휨은 규칙 곡선에서 벗어난 만큼(치우침 뺀 것)으로 */
        const cAi = add(r.c, add(scale(e.f, clamp(of, -MAX_BEND, MAX_BEND) * e.L), scale(e.p, clamp(os, -MAX_BEND, MAX_BEND) * e.L)));
        c = add(scale(c, 1 - wbk), scale(cAi, wbk));
      }
      row.push({ c, x: normalize(rotAbout(e.p, e.a, phi)) });
    }
    levels.push(row);
    prev = row;
  }
  return { levels, ai: w, aiBend: wb };
}
