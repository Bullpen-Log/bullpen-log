import type { Vec3 } from '@/lib/pitch-3d/linalg';
import { V2_JOINTS, plantFrame, type Pitch3dV2Ok } from '@/lib/pitch-3d/v2/contract';
import type { DisplayTrack } from '@/lib/pitch-3d/v2/display';
import { aiTrunkInputs, trunkTrack } from '@/lib/pitch-3d/v2/trunk';

/**
 * 데생 인형 보기용 관절(설계 docs/designs/pitch-3d-mannequin.md) — displayTrack 의 관절을 인형이 쓰는 꼴로 바꾸고, 보기만을 위해 두 가지를 다듬는다.
 * 순수 — 화면(mannequin.ts)과 시험이 같은 코드.
 *
 * 좌표: 미터, x 홈 쪽 · y 투수 왼쪽(1루) · z 위. displayTrack 은 [앞, 위, 오른쪽](키 = 1)이라 셋째 축을 뒤집는다 — 그대로 옮기면 거울상이 되어
 * 몸 앞판이 등에 붙고 발끝이 몸과 반대를 봤다(2026-10-11 김민 맥북 예시).
 * 이름은 투구 기준: r* = 던지는 쪽(축발 쪽), l* = 글러브 쪽(앞발 쪽). 좌투는 해부학 좌우를 바꿔 넣는다.
 *
 *  1 앞발 착지 잇기 — 처음 땅에 닿은 장면부터 엔진이 발을 고정한 장면까지 앞발을 매끈하게 잇는다(샘플 4는 그 사이 옆으로 29cm 튀었다).
 *  2 관절마다 가우스로 고르게 — 글러브 손은 세게(떨림이 던지는 손의 1.2~1.5배), 던지는 팔은 빠른 움직임이 무뎌지지 않게 약하게.
 *    글러브 손목 장면 사이 가속 p95 17.8 → 4.5mm, 앞발목 최대 77 → 2.9mm(샘플 4).
 */

export type MannequinJoints = {
  rh: Vec3; lh: Vec3; rk: Vec3; lk: Vec3; ra: Vec3; la: Vec3;
  rhe: Vec3; rto: Vec3; lhe: Vec3; lto: Vec3;
  sh: Vec3; gs: Vec3; el: Vec3; ge: Vec3; wr: Vec3; gw: Vec3; ha: Vec3; gh: Vec3;
  /** 몸통 축 위 두 점(엉덩이 가운데 → 어깨 가운데의 55% · 105%) */
  td: Vec3;
  nose: Vec3; ear: Vec3;
  /**
   * 몸통 마디(trunk.ts) — 엉덩이 → 어깨의 0.41 · 0.60 · 0.83 높이의 단면 가운데(t1 · t2 · t3)와 가운데 + 좌우 축 10cm(t1s · t2s · t3s).
   * 점으로 두어 좌투 거울 뜨기(canonicalFrames)가 다른 관절과 똑같이 뒤집는다. 없으면 몸통이 예전처럼 곧은 한 덩어리.
   */
  t1?: Vec3; t1s?: Vec3; t2?: Vec3; t2s?: Vec3; t3?: Vec3; t3s?: Vec3;
  /** 손 검지 · 새끼 밑(던지는 손 hi · hp, 글러브 손 gi · gp) — 손 옆 방향(손바닥 폭)을 이것으로. 없으면 손 방향 × 위팔 */
  hi?: Vec3; hp?: Vec3; gi?: Vec3; gp?: Vec3;
};

export type MannequinTrack = {
  frames: MannequinJoints[];
  heightM: number;
  /** 장면 사이 실제 초(착지 → 릴리스를 0.15초로 본다 — 슬로모 배수를 몰라도 실제 빠르기로 재생) */
  dt: number;
  events: { kneeUp: number | null; footPlant: number; release: number };
  hand: 'R' | 'L';
};

const NAMES: string[] = V2_JOINTS.map((j) => j.name);
const IX = (nm: string) => NAMES.indexOf(nm);
const HAND_PARTS = ['Wr', 'HandMid', 'HandIdx', 'HandPinky'];
/** 앞발이 착지로 내려오는 장면 수(엔진 발이 그보다 늦게 내려올 때 — 120fps 로 약 50ms) */
const LAND_EASE = 6;

/** 관절별 가우스 폭(장면) */
function sigmaOf(nm: string, glove: string, throwing: string, lead: string): number {
  if (nm === `${glove}El`) return 2.5;
  if (HAND_PARTS.some((x) => nm === `${glove}${x}`)) return 3.5;
  if (nm === `${throwing}El` || HAND_PARTS.some((x) => nm === `${throwing}${x}`)) return 0.7;
  if (['Kn', 'An', 'He', 'To'].some((x) => nm === `${lead}${x}`) || ['nose', 'lEar', 'rEar'].includes(nm)) return 1.5;
  return 1;
}

/** displayTrack 장면(키 = 1, [앞, 위, 오른쪽]) → 다듬은 장면(미터, 같은 축) */
export function smoothForMannequin(frames: Vec3[][], result: Pick<Pitch3dV2Ok, 'hand' | 'events'>, heightM: number): Vec3[][] {
  const F: Vec3[][] = frames.map((f) => f.map((p) => [p[0] * heightM, p[1] * heightM, p[2] * heightM] as Vec3));
  const n = F.length;
  const lead = result.hand === 'L' ? 'r' : 'l';
  const throwing = lead === 'l' ? 'r' : 'l';
  /* 1 앞발 착지 잇기 */
  const an = IX(`${lead}An`);
  const fp = result.events.footPlant;
  const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  let lockAt = -1;
  /* 멈춘 장면 — 20장면 동안 1mm 안. 그런 장면이 없으면(디딘 발이 화면 모델에서 뒤꿈치 → 발바닥으로 구르며 1~3cm 움직임, 10-21 마커 8구 중 7구)
   * 착지 ~ 릴리스에서 가장 덜 움직인 장면 — 예전엔 못 찾으면 잇기를 건너뛰어 '착지' 단추에 인형 발이 9cm 떠 있었다 */
  let calm = -1;
  let calmMove = Infinity;
  for (let i = Math.max(0, fp); i < n - 5 && lockAt < 0; i++) {
    let move = 0;
    for (let j = i; j < Math.min(n, i + 20); j++) move = Math.max(move, dist(F[i][an], F[j][an]));
    if (move < 0.001) lockAt = i;
    else if (i <= result.events.release && move < calmMove) {
      calmMove = move;
      calm = i;
    }
  }
  if (lockAt < 0) lockAt = calm;
  if (lockAt > 0) {
    /*
     * 발이 땅에 닿는 장면 = 착지(첫 닿음 footContact — 화면의 '착지' 단추 · 옆 영상 2D 로 잰 순간). 엔진 앞발은 닿은 뒤에도 50~90ms 더 떠 있다가
     * 묶여(뒤 영상에서 축다리에 가려 높이를 늦게 받음), 예전처럼 발이 멈춘 장면(lockAt)까지 이으면 '착지' 단추에 인형 발이 8cm 떠 있었다
     * (2026-10-22 마커 4차: 세 · 네 대 교차 정답은 단추 ±20ms 에 땅). 그래서 착지까지 내려 그 자리에 두고, 무릎은 발목과 같이 옮긴다.
     */
    const arrive = Math.max(0, Math.min(lockAt, plantFrame(result.events)));
    const zLock = F[lockAt][an][1];
    let from = Math.max(0, fp - 15);
    while (from < lockAt && F[from][an][1] > zLock + 0.05) from++;
    from = Math.min(from, Math.max(0, arrive - LAND_EASE));
    const ease = (u: number) => u * u * (3 - 2 * u);
    const B = (j: number) => F[lockAt][j];
    for (let i = from + 1; i < lockAt; i++) {
      const u = i >= arrive ? 1 : ease((i - from) / Math.max(1, arrive - from));
      const ja = IX(`${lead}An`);
      const d: Vec3 = [(B(ja)[0] - F[i][ja][0]) * u, (B(ja)[1] - F[i][ja][1]) * u, (B(ja)[2] - F[i][ja][2]) * u];
      for (const nm of ['An', 'He', 'To']) {
        const j = IX(`${lead}${nm}`);
        const a = F[from][j];
        F[i][j] = i >= arrive ? [...B(j)] as Vec3 : [a[0] + (B(j)[0] - a[0]) * u, a[1] + (B(j)[1] - a[1]) * u, a[2] + (B(j)[2] - a[2]) * u];
      }
      const kn = IX(`${lead}Kn`);
      F[i][kn] = [F[i][kn][0] + d[0], F[i][kn][1] + d[1], F[i][kn][2] + d[2]];
    }
  }
  /* 2 관절마다 가우스 */
  const S: Vec3[][] = F.map((fr) => fr.map((p) => [...p] as Vec3));
  NAMES.forEach((nm, j) => {
    const s = sigmaOf(nm, lead, throwing, lead);
    const R = Math.ceil(3 * s);
    for (let i = 0; i < n; i++) {
      const acc = [0, 0, 0];
      let ws = 0;
      for (let d = -R; d <= R; d++) {
        const k = i + d;
        if (k < 0 || k >= n) continue;
        const w = Math.exp(-(d * d) / (2 * s * s));
        ws += w;
        for (let c = 0; c < 3; c++) acc[c] += F[k][j][c] * w;
      }
      S[i][j] = [acc[0] / ws, acc[1] / ws, acc[2] / ws];
    }
  });
  return S;
}

/** 다듬은 장면 → 인형 관절(x 앞 · y 왼쪽 · z 위) */
export function mannequinTrack(
  track: DisplayTrack,
  result: Pick<Pitch3dV2Ok, 'hand' | 'events'> & Partial<Pick<Pitch3dV2Ok, 'joints' | 'experimental'>>,
  heightM: number
): MannequinTrack {
  const S = smoothForMannequin(track.frames, result, heightM);
  /* 몸통 마디 — 다듬은 장면(보기 축 · 미터)에 AI 허리 · 등 마디를 상대 값으로 붙이고 못 믿는 만큼 규칙으로(trunk.ts) */
  const ai = aiTrunkInputs(result);
  const TR = trunkTrack(S, ai.joints, ai.trunk, ai.miss).levels;
  const R = result.hand !== 'L';
  const pick = (a: string, b: string) => IX(R ? a : b);
  const at = (f: Vec3[], j: number): Vec3 => [f[j][0], -f[j][2], f[j][1]];
  const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const ev = result.events;
  const frames = S.map((f, k) => {
    const g = (a: string, b: string) => at(f, pick(a, b));
    const hip = mid(at(f, IX('lHip')), at(f, IX('rHip')));
    const shm = mid(at(f, IX('lSh')), at(f, IX('rSh')));
    return {
      rh: g('rHip', 'lHip'), lh: g('lHip', 'rHip'), rk: g('rKn', 'lKn'), lk: g('lKn', 'rKn'), ra: g('rAn', 'lAn'), la: g('lAn', 'rAn'),
      rhe: g('rHe', 'lHe'), rto: g('rTo', 'lTo'), lhe: g('lHe', 'rHe'), lto: g('lTo', 'rTo'),
      sh: g('rSh', 'lSh'), gs: g('lSh', 'rSh'), el: g('rEl', 'lEl'), ge: g('lEl', 'rEl'), wr: g('rWr', 'lWr'), gw: g('lWr', 'rWr'),
      ha: g('rHandMid', 'lHandMid'), gh: g('lHandMid', 'rHandMid'),
      hi: g('rHandIdx', 'lHandIdx'), hp: g('rHandPinky', 'lHandPinky'), gi: g('lHandIdx', 'rHandIdx'), gp: g('lHandPinky', 'rHandPinky'),
      td: lerp(hip, shm, 0.55),
      nose: at(f, IX('nose')), ear: mid(at(f, IX('lEar')), at(f, IX('rEar'))),
      ...trunkFields(TR[k]),
    };
  });
  return { frames, heightM, dt: 0.15 / Math.max(1, ev.release - ev.footPlant), events: ev, hand: result.hand };
}

/** 몸통 마디(보기 축) → 인형 관절의 점 여섯(인형 축: x 앞 · y 왼쪽 · z 위) */
function trunkFields(levels: { c: Vec3; x: Vec3 }[] | undefined): Partial<MannequinJoints> {
  if (!levels || levels.length !== 3) return {};
  const P = (p: Vec3): Vec3 => [p[0], -p[2], p[1]];
  const side = (l: { c: Vec3; x: Vec3 }) => P([l.c[0] + l.x[0] * 0.1, l.c[1] + l.x[1] * 0.1, l.c[2] + l.x[2] * 0.1]);
  const [a, b, c] = levels;
  return { t1: P(a.c), t1s: side(a), t2: P(b.c), t2s: side(b), t3: P(c.c), t3s: side(c) };
}
