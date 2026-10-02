/**
 * 카메라 장면의 밝기 판(Y)을 분석 해상도의 밝기로 — 실시간 측정 워커(live-meter.worker.ts)가 쓴다. DOM 없는 순수 계산.
 *
 * 왜: 화면 스레드에서 장면마다 캔버스에 그려 읽으면(drawImage + getImageData) 노트북 크롬에서 1080p 한 장에 39ms 가 걸려
 * 60fps(16.7ms)를 못 따라갔고, 계산(공 하나 2.7~6.2초)도 화면을 멈췄다 — 거의 모든 공이 '초당 장면 수 부족'으로 거부됐다
 * (2026-09-30 브라우저 시험대, 헤드리스 크롬 · 가짜 카메라). 워커가 카메라 장면(VideoFrame)을 직접 받아 밝기 판만 복사하고
 * 여기서 줄이면 GPU 에서 되읽지 않아 빠르다.
 *
 * 같은가: 크롬 캔버스의 drawImage 는 픽셀 한가운데를 맞춘 쌍선형으로 줄인다 — 같은 규칙으로 줄인 밝기 판이 영상 파일 길(캔버스)과
 * rms 0.32 · 최대 1 차이였다(lab/live-browser/bilin-check.mts). 영상 신호는 보통 제한 범위(16~235)라 (Y − 16) · 255/219 로 편다.
 */

/** 줄이기 표 — 원본 W×H → 분석 w×h, 픽셀 한가운데 맞춤 쌍선형 */
export type ScaleTables = {
  W: number;
  H: number;
  w: number;
  h: number;
  x0: Int32Array;
  x1: Int32Array;
  tx: Float32Array;
  y0: Int32Array;
  y1: Int32Array;
  ty: Float32Array;
};

export function makeScaleTables(
  W: number,
  H: number,
  w: number,
  h: number
): ScaleTables {
  const axis = (from: number, to: number) => {
    const i0 = new Int32Array(to);
    const i1 = new Int32Array(to);
    const tt = new Float32Array(to);
    const s = from / to;
    for (let x = 0; x < to; x++) {
      let f = (x + 0.5) * s - 0.5;
      if (f < 0) f = 0;
      const i = Math.floor(f);
      i0[x] = Math.min(from - 1, i);
      i1[x] = Math.min(from - 1, i + 1);
      tt[x] = f - i;
    }
    return { i0, i1, tt };
  };
  const ax = axis(W, w);
  const ay = axis(H, h);
  return {
    W,
    H,
    w,
    h,
    x0: ax.i0,
    x1: ax.i1,
    tx: ax.tt,
    y0: ay.i0,
    y1: ay.i1,
    ty: ay.tt,
  };
}

/**
 * 원본 밝기(한 줄에 stride 바이트, offset 부터) → 분석 크기 Uint8 밝기(반올림). limited 면 (v − 16) · 255/219 로 편다
 * (영상 신호의 제한 범위 — 캔버스가 그릴 때와 같다).
 */
export function downscaleLuma(
  src: ArrayLike<number>,
  offset: number,
  stride: number,
  t: ScaleTables,
  limited: boolean
): Uint8Array {
  const out = new Uint8Array(t.w * t.h);
  const k = limited ? 255 / 219 : 1;
  const b = limited ? 16 : 0;
  /* 크기가 같으면(카메라가 이미 분석 크기) 줄일 것 없이 범위만 편다 */
  if (t.W === t.w && t.H === t.h) {
    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++)
      lut[v] = Math.max(0, Math.min(255, Math.floor((v - b) * k + 0.5)));
    for (let y = 0; y < t.h; y++) {
      const r = offset + y * stride;
      const o = y * t.w;
      for (let x = 0; x < t.w; x++) out[o + x] = lut[src[r + x]];
    }
    return out;
  }
  /* 1080p → 720p(딱 1.5배)는 무게가 늘 (¾,¼) · (¼,¾) 라 표 없이 — 결과는 아래와 같고 1.4배 빠르다(장면 하나 9.4 → 6.7ms, 노드) */
  if (t.W * 2 === t.w * 3 && t.H * 2 === t.h * 3 && t.w % 2 === 0 && t.h % 2 === 0) {
    downscale15(src, offset, stride, t.w, t.h, limited, out);
    return out;
  }
  for (let y = 0; y < t.h; y++) {
    const r0 = offset + t.y0[y] * stride;
    const r1 = offset + t.y1[y] * stride;
    const wy = t.ty[y];
    const o = y * t.w;
    for (let x = 0; x < t.w; x++) {
      const a0 = t.x0[x];
      const a1 = t.x1[x];
      const wx = t.tx[x];
      const p00 = src[r0 + a0];
      const p10 = src[r1 + a0];
      const top = p00 + (src[r0 + a1] - p00) * wx;
      const bot = p10 + (src[r1 + a1] - p10) * wx;
      let v = (top + (bot - top) * wy - b) * k + 0.5;
      if (v < 0) v = 0;
      else if (v > 255) v = 255;
      out[o + x] = v; // Uint8Array 는 소수를 버린다 — +0.5 로 반올림
    }
  }
  return out;
}

/** 1.5배 줄이기 표(범위 펴기) — 두 방향 무게 합 16 을 곱한 밝기(0~4080)에서 바로 */
const LUT15: { limited: Uint8Array | null; full: Uint8Array | null } = {
  limited: null,
  full: null,
};

/**
 * 딱 1.5배 줄이기 — 픽셀 한가운데 맞춤 쌍선형에서 짝수 출력 픽셀은 (¾ · 원본 3m + ¼ · 3m+1), 홀수는 (¼ · 3m+1 + ¾ · 3m+2)
 * 이다(가로 · 세로 같음). 가로를 먼저 정수로 섞고(×4) 세로를 섞어(×4) 표 하나로 범위를 편다 — downscaleLuma 의 소수 계산과
 * 한 값도 다르지 않았다(실제 장면 40장, lab/live-final/tools/bench-ds.mts).
 */
function downscale15(
  src: ArrayLike<number>,
  offset: number,
  stride: number,
  w: number,
  h: number,
  limited: boolean,
  out: Uint8Array
) {
  let lut = limited ? LUT15.limited : LUT15.full;
  if (!lut) {
    lut = new Uint8Array(4096);
    const k = limited ? 255 / 219 : 1;
    const b = limited ? 16 : 0;
    for (let v = 0; v < 4096; v++)
      lut[v] = Math.max(0, Math.min(255, Math.floor((v / 16 - b) * k + 0.5)));
    if (limited) LUT15.limited = lut;
    else LUT15.full = lut;
  }
  const half = w >> 1;
  const rowA = new Uint16Array(w);
  const rowB = new Uint16Array(w);
  const hrow = (r: number, dst: Uint16Array) => {
    let p = offset + r * stride;
    for (let m = 0, q = 0; m < half; m++, p += 3, q += 2) {
      const s1 = src[p + 1];
      dst[q] = 3 * src[p] + s1;
      dst[q + 1] = s1 + 3 * src[p + 2];
    }
  };
  for (let n = 0; n < h >> 1; n++) {
    const r = 3 * n;
    hrow(r, rowA);
    hrow(r + 1, rowB);
    let o = 2 * n * w;
    for (let x = 0; x < w; x++) out[o + x] = lut[3 * rowA[x] + rowB[x]];
    hrow(r + 2, rowA);
    o += w;
    for (let x = 0; x < w; x++) out[o + x] = lut[rowB[x] + 3 * rowA[x]];
  }
}

/**
 * RGBA · BGRA 장면(아이폰 사파리 등 YUV 가 아닌 카메라 장면) → 원본 크기 밝기. 캔버스 길(live-capture.ts canvasLuma)과 같은
 * 가중치 · 반올림.
 */
export function rgbaToLuma(
  src: ArrayLike<number>,
  offset: number,
  stride: number,
  W: number,
  H: number,
  bgr: boolean
): Uint8Array {
  const out = new Uint8Array(W * H);
  const ri = bgr ? 2 : 0;
  const bi = bgr ? 0 : 2;
  for (let y = 0; y < H; y++) {
    let p = offset + y * stride;
    const o = y * W;
    for (let x = 0; x < W; x++, p += 4) {
      out[o + x] = (src[p + ri] * 77 + src[p + 1] * 150 + src[p + bi] * 29 + 128) >> 8;
    }
  }
  return out;
}

/** 작은 끝(little-endian)인가 — 32비트로 읽은 RGBA 의 낮은 바이트가 R 인가 */
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

/**
 * 캔버스 getImageData 의 RGBA → 밝기(반올림). 1.6.0 은 버림(>> 8)이라 영상 파일 길(소수)보다 평균 0.5 낮았다.
 *
 * 화면 스레드 길(워커가 카메라 장면을 직접 못 받는 브라우저 — 직접 받기가 없는 아이폰 iOS 17 등)은 장면마다 이것을 화면 스레드에서
 * 돈다. 픽셀마다 바이트 셋을 따로 읽던 것을 32비트 한 번으로 읽는다 — 값은 똑같고(무작위 · 모든 바이트 끝값 · 실제 장면)
 * 노드에서 1.4배 빠르다(720×1280 한 장 5.3 → 3.7ms, 부하 걸린 PC, 2026-10-03).
 */
export function canvasLuma(px: ArrayLike<number>, n: number): Uint8Array {
  const luma = new Uint8Array(n);
  if (
    LITTLE_ENDIAN &&
    px instanceof Uint8ClampedArray &&
    (px.byteOffset & 3) === 0 &&
    px.length >= n * 4
  ) {
    const u = new Uint32Array(px.buffer, px.byteOffset, n);
    for (let i = 0; i < n; i++) {
      const v = u[i];
      luma[i] =
        ((v & 255) * 77 + ((v >>> 8) & 255) * 150 + ((v >>> 16) & 255) * 29 + 128) >> 8;
    }
    return luma;
  }
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    luma[i] = (px[j] * 77 + px[j + 1] * 150 + px[j + 2] * 29 + 128) >> 8;
  }
  return luma;
}

/**
 * 90 · 180 · 270° 시계 방향으로 돌린다 — 카메라 장면이 센서 방향 그대로 오고 돌릴 각(VideoFrame.rotation)이 따로 올 때.
 * 줄인 뒤에 돌린다(작은 판이라 싸다).
 */
export function rotateLuma(
  l: Uint8Array,
  w: number,
  h: number,
  deg: number
): { luma: Uint8Array; w: number; h: number } {
  const d = ((deg % 360) + 360) % 360;
  if (d === 0) return { luma: l, w, h };
  const o = new Uint8Array(l.length);
  if (d === 180) {
    for (let i = 0; i < l.length; i++) o[l.length - 1 - i] = l[i];
    return { luma: o, w, h };
  }
  /* 90 = 시계 방향: 새 (x', y') = (h − 1 − y, x), 새 크기 h × w */
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = l[y * w + x];
      if (d === 90) o[x * h + (h - 1 - y)] = v;
      else o[(w - 1 - x) * h + y] = v;
    }
  }
  return { luma: o, w: h, h: w };
}
