/**
 * 싱커 홈의 입체 야구공 — 순수 기하(RN · DOM 없음, 자체 시험이 node 에서 부른다).
 *
 * 2026-10-27 승인 시안 1 '볼 컨트롤'의 공(three.js 구 · TubeGeometry 실밥 · 인스턴스 바늘땀 · 1024×512 캔버스 무늬에 그린 S 로고)을 앱에서는
 * 새 3D 엔진 없이 그린다: 공 위의 점(실밥 길 · V자 바늘땀 · 로고 꼭짓점 · 가죽 결)을 한 번 3차원으로 만들어 두고, 장면마다 돌려(three 의 Euler XYZ 와
 * 같은 행렬) 앞쪽(z > 0)만 비춘다. 그래서 돌릴 때 로고 · 실밥이 구면에 붙어 원근대로 줄고 가장자리에서 사라진다 — 평면 그림을 돌리는 것이 아니다.
 * 빛(위 왼쪽 주광 · 오른쪽 파란 테두리 빛 · 가장자리 그늘)은 세상에 고정이라 공 그림 위에 겹친 그러데이션으로 그린다(ball.tsx).
 *
 * 숫자는 시안 그대로: 실밥 x = ±(0.51 + 0.13·cos2t), 한 줄에 바늘땀 48개(옆 0.038 · 뒤 0.025 · 앞 0.018), 처음 돌림 rx 0.25 · ry −0.4 · rz 0.15.
 * 로고는 공 앞(0, 0, 1)에 위가 +y 로 — 시안의 무늬 자리(u 0.25 · v 0.49)와 같은 곳.
 * 장면마다 부르는 ballFrame 은 'worklet' — Reanimated 가 UI 스레드에서 돌린다(손가락을 따라 돌 때 JS 다시 그리기 없음).
 */

/** 실밥 길 하나의 점 수(닫힌 고리) · 바늘땀 수 — 시안 TubeGeometry 192 · 48 */
const SEAM_STEPS = 96;
const STITCHES = 48;
/** 로고 너비 · 높이(구면 위 라디안) — 시안 캔버스 72px / 1024px × 2π 를 화면에 맞춰 대 본 값 */
export const LOGO_ARC = 0.5;
/** 가죽 결 점 수 — 장면마다 같이 돌린다(고정이면 공은 도는데 결만 멈춰 보인다) */
const GRAIN = 260;
/** 처음 돌림(시안 v.ball rx · ry, group.rotation z 0.15) */
export const START_ROTATION = { rx: 0.25, ry: -0.4 } as const;
export const TILT_Z = 0.15;
/** 위아래로 기울일 수 있는 한계(시안 ±1.3) */
export const TILT_LIMIT = 1.3;

type V3 = [number, number, number];
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const seamPoint = (sign: number, t: number): V3 => {
  const x = sign * (0.51 + 0.13 * Math.cos(2 * t));
  const r = Math.sqrt(1 - x * x);
  return [x, r * Math.sin(t), r * Math.cos(t)];
};

/** 실밥 길 — [x,y,z, …] 두 줄을 이어 붙임(줄마다 SEAM_STEPS + 1 점, 마지막 = 처음) */
export const SEAM: number[] = [];
/** 바늘땀 — 하나에 세 점(왼 · 가운데 · 오른), [x,y,z × 3, …] */
export const STITCH: number[] = [];
for (const sign of [-1, 1]) {
  for (let i = 0; i <= SEAM_STEPS; i++) {
    const p = seamPoint(sign, (i / SEAM_STEPS) * Math.PI * 2);
    SEAM.push(p[0] * 1.004, p[1] * 1.004, p[2] * 1.004);
  }
  for (let i = 0; i < STITCHES; i++) {
    const t = ((i + 0.5) / STITCHES) * Math.PI * 2;
    const p = seamPoint(sign, t);
    const a = seamPoint(sign, t + 0.005);
    const b = seamPoint(sign, t - 0.005);
    const tan = norm([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
    const side = norm([tan[1] * p[2] - tan[2] * p[1], tan[2] * p[0] - tan[0] * p[2], tan[0] * p[1] - tan[1] * p[0]]);
    const at = (s: number, f: number, r: number) =>
      norm([p[0] + side[0] * s + tan[0] * f, p[1] + side[1] * s + tan[1] * f, p[2] + side[2] * s + tan[2] * f]).map((v) => v * r);
    STITCH.push(...at(-0.038, -0.025, 1.013), ...at(0, 0.018, 1.016), ...at(0.038, -0.025, 1.013));
  }
}

/** 가죽 결 — 공 위에 고르게 흩은 점(씨앗 고정, 시안 캔버스 무늬와 같은 LCG) */
export const GRAIN_POINTS: number[] = [];
{
  let seed = 27;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < GRAIN; i++) {
    const y = rand() * 2 - 1;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    GRAIN_POINTS.push(r * Math.cos(a), y, r * Math.sin(a));
  }
}

/**
 * 싱커 로고(native/src/shell/mark-path.ts MARK_PATH — 'M' · 상대 'l' · 'Z' 만 쓴다)를 꼭짓점 고리로 풀어 공 앞에 붙인다.
 * 그림 칸(0~1006 × 0~1001)의 가운데가 공 앞(0, 0, 1). 가로는 경도, 세로는 위도(그림의 아래 = 공의 아래)로 — 시안 무늬(정거원통)와 같은 붙임.
 */
export function logoRings(path: string, arc = LOGO_ARC): { points: number[]; rings: number[] } {
  const points: number[] = [];
  const rings: number[] = [];
  const tokens = path.match(/[MlZ]|-?\d+(?:\.\d+)?/g) ?? [];
  let x = 0;
  let y = 0;
  let count = 0;
  let cmd = '';
  const put = () => {
    const lon = ((x - 503) / 1006) * arc;
    const lat = -((y - 500.5) / 1006) * arc;
    points.push(Math.sin(lon) * Math.cos(lat) * 1.002, Math.sin(lat) * 1.002, Math.cos(lon) * Math.cos(lat) * 1.002);
    count++;
  };
  for (let i = 0; i < tokens.length; ) {
    const t = tokens[i];
    if (t === 'M' || t === 'l') {
      cmd = t;
      i++;
      continue;
    }
    if (t === 'Z') {
      if (count) rings.push(count);
      count = 0;
      i++;
      continue;
    }
    const a = Number(t);
    const b = Number(tokens[i + 1]);
    i += 2;
    if (cmd === 'M') {
      if (count) rings.push(count);
      count = 0;
      x = a;
      y = b;
      /* M 뒤에 이어 오는 짝은 l 처럼(SVG 규칙) — 이 로고는 없지만 안전하게 */
      cmd = 'l';
    } else {
      x += a;
      y += b;
    }
    put();
  }
  if (count) rings.push(count);
  return { points, rings };
}

/** three.js Euler 'XYZ' 행렬(행 우선 9칸) — 점 v 에 Rz → Ry → Rx 차례로 */
export function rotation(rx: number, ry: number, rz: number): number[] {
  'worklet';
  const a = Math.cos(rx);
  const b = Math.sin(rx);
  const c = Math.cos(ry);
  const d = Math.sin(ry);
  const e = Math.cos(rz);
  const f = Math.sin(rz);
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;
  return [c * e, -c * f, d, af + be * d, ae - bf * d, -b * c, bf - ae * d, be + af * d, a * c];
}

const r1 = (v: number) => {
  'worklet';
  return Math.round(v * 10) / 10;
};

export type BallFrame = {
  /** 실밥 홈(가는 짙은 선) */
  seam: string;
  /** 바늘땀 — 앞(z > 0.45) · 가운데 · 가장자리(z ≤ 0.18) 셋으로 나눠 가장자리일수록 옅게 */
  near: string;
  mid: string;
  far: string;
  grain: string;
  logo: string;
  /** 로고 진하기 — 가장자리로 갈수록 0 */
  logoOpacity: number;
};

/**
 * 한 장면 — 돌림(rx · ry · rz)과 화면의 공(가운데 cx · cy, 반지름 R)으로 SVG 길 글자를 만든다. 뒤쪽(z ≤ 0)은 그리지 않는다.
 * 'worklet' 이라 UI 스레드에서도 돈다 — 표(SEAM · STITCH · GRAIN_POINTS · logo)는 부르는 쪽이 넘긴다(작업 함수가 큰 표를 매번 옮기지 않게).
 */
export function ballFrame(
  rx: number,
  ry: number,
  rz: number,
  cx: number,
  cy: number,
  R: number,
  seamPts: number[],
  stitchPts: number[],
  grainPts: number[],
  logoPts: number[],
  logoRingLens: number[]
): BallFrame {
  'worklet';
  const m = rotation(rx, ry, rz);
  const X = (i: number, p: number[]) => m[0] * p[i] + m[1] * p[i + 1] + m[2] * p[i + 2];
  const Y = (i: number, p: number[]) => m[3] * p[i] + m[4] * p[i + 1] + m[5] * p[i + 2];
  const Z = (i: number, p: number[]) => m[6] * p[i] + m[7] * p[i + 1] + m[8] * p[i + 2];

  /* 실밥 홈 — 앞에 있는 이웃 두 점마다 한 토막(가장자리를 살짝 넘어 −0.02 까지 그려 실루엣에 닿게) */
  let seam = '';
  const per = seamPts.length / 6;
  for (let s = 0; s < 2; s++) {
    let open = false;
    for (let k = 0; k < per; k++) {
      const i = (s * per + k) * 3;
      if (Z(i, seamPts) > -0.02) {
        const x = r1(cx + R * X(i, seamPts));
        const y = r1(cy - R * Y(i, seamPts));
        seam += open ? `L${x} ${y}` : `M${x} ${y}`;
        open = true;
      } else open = false;
    }
  }

  let near = '';
  let mid = '';
  let far = '';
  for (let i = 0; i < stitchPts.length; i += 9) {
    const z = Z(i + 3, stitchPts);
    if (z <= 0.02) continue;
    const d =
      `M${r1(cx + R * X(i, stitchPts))} ${r1(cy - R * Y(i, stitchPts))}` +
      `L${r1(cx + R * X(i + 3, stitchPts))} ${r1(cy - R * Y(i + 3, stitchPts))}` +
      `L${r1(cx + R * X(i + 6, stitchPts))} ${r1(cy - R * Y(i + 6, stitchPts))}`;
    if (z > 0.45) near += d;
    else if (z > 0.18) mid += d;
    else far += d;
  }

  let grain = '';
  for (let i = 0; i < grainPts.length; i += 3) {
    if (Z(i, grainPts) <= 0.08) continue;
    const x = r1(cx + R * X(i, grainPts));
    const y = r1(cy - R * Y(i, grainPts));
    grain += `M${x} ${y}h0.6`;
  }

  /* 로고 — 가운데(공 앞 0,0,1)가 얼마나 앞을 보는지로 진하기를 정한다 */
  const zc = m[8];
  const logoOpacity = Math.max(0, Math.min(1, (zc - 0.06) / 0.3));
  let logo = '';
  if (logoOpacity > 0) {
    let at = 0;
    for (let r = 0; r < logoRingLens.length; r++) {
      for (let k = 0; k < logoRingLens[r]; k++) {
        const i = (at + k) * 3;
        const x = r1(cx + R * X(i, logoPts));
        const y = r1(cy - R * Y(i, logoPts));
        logo += k === 0 ? `M${x} ${y}` : `L${x} ${y}`;
      }
      logo += 'Z';
      at += logoRingLens[r];
    }
  }
  return { seam, near, mid, far, grain, logo, logoOpacity };
}

/** 실밥 색 — 시안 레드(three 0xc53c32) */
export const THREAD_COLOR = '#c53c32';
