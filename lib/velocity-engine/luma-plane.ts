/**
 * 풀어낸 장면(VideoFrame · mediabunny VideoSample)의 밝기 면 → 분석 크기 밝기. 화면 스레드(analyze-video.ts)와 밝기 일꾼(luma.worker.ts)이
 * 같이 쓴다 — DOM 없음.
 */

/** 밝기 만들기가 읽는 장면의 모양 — VideoFrame 에 돌림(rotation, 시계 방향 도)을 붙인 것 */
export type LumaSource = {
  format: string | null;
  rotation: number;
  codedWidth: number;
  visibleRect: { left: number; top: number; width: number; height: number };
  colorSpace: { fullRange?: boolean | null };
  allocationSize: () => number;
  copyTo: (dest: Uint8Array) => Promise<{ offset: number; stride: number }[]>;
};

/** 영상 범위(16~235) → 0~255, 반올림 · 자름 — 맥 도구 native-decode(decode-range.swift src)와 같은 셈 */
const VIDEO_RANGE = Uint8Array.from({ length: 256 }, (_, v) => Math.max(0, Math.min(255, Math.round(((v - 16) * 255) / 219))));
const FULL_RANGE = Uint8Array.from({ length: 256 }, (_, v) => v);
let yBuffer = new Uint8Array(0);

/**
 * 풀어낸 장면의 밝기 면(Y, NV12 · I420)을 분석 크기 밝기로 — 범위를 펴고(VIDEO_RANGE), 돌림(rotation)을 반영해, 이중선형으로 줄여
 * 반올림한다. 맥 도구(~/bullpen-velocity-lab/native-decode, 실험대 app-rerun · session-audit 가 쓰는 장면)와 한 셈이라, 맥에서
 * 재 본 값이 앱 값과 같다. 예전 캔버스 길(drawImage → RGB → 0.299R+0.587G+0.114B)은 브라우저마다 줄이는 필터 · 색 변환이
 * 달라(크롬 · 웹킷 픽셀 차 최대 1~10) 같은 영상도 값이 조금씩 갈렸다. 다른 형식이면 null — 캔버스로 그린다.
 */
export async function lumaOfSample(
  sample: LumaSource,
  W: number,
  H: number
): Promise<Float32Array | null> {
  if (sample.format !== 'NV12' && sample.format !== 'I420') return null;
  const need = sample.allocationSize();
  if (yBuffer.length < need) yBuffer = new Uint8Array(need);
  const layout = await sample.copyTo(yBuffer);
  const { offset, stride } = layout[0];
  const { left, top, width: w, height: h } = sample.visibleRect;
  const lut = sample.colorSpace.fullRange ? FULL_RANGE : VIDEO_RANGE;
  const rot = ((sample.rotation % 360) + 360) % 360;
  const PW = rot === 90 || rot === 270 ? h : w;
  const PH = rot === 90 || rot === 270 ? w : h;
  /* 세로 자리 (x, y) → 원본 자리의 첫 칸: col[x] + row[y] */
  const col = (x: number) =>
    rot === 0 ? x : rot === 90 ? (h - 1 - x) * stride : rot === 180 ? w - 1 - x : x * stride;
  const row = (y: number) =>
    rot === 0 ? y * stride : rot === 90 ? y : rot === 180 ? (h - 1 - y) * stride : w - 1 - y;
  const base = offset + top * stride + left;
  const kx = PW / W;
  const ky = PH / H;
  const cx0 = new Int32Array(W);
  const cx1 = new Int32Array(W);
  const fxs = new Float64Array(W);
  for (let x = 0; x < W; x++) {
    const sx = (x + 0.5) * kx - 0.5;
    const x0 = Math.max(0, Math.floor(sx));
    cx0[x] = col(x0);
    cx1[x] = col(Math.min(PW - 1, x0 + 1));
    fxs[x] = sx - x0;
  }
  const out = new Float32Array(W * H);
  const y = yBuffer;
  for (let oy = 0; oy < H; oy++) {
    const sy = (oy + 0.5) * ky - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const r0 = base + row(y0);
    const r1 = base + row(Math.min(PH - 1, y0 + 1));
    const fy = sy - y0;
    const o = oy * W;
    for (let x = 0; x < W; x++) {
      const fx = fxs[x];
      const a = lut[y[r0 + cx0[x]]] * (1 - fx) + lut[y[r0 + cx1[x]]] * fx;
      const b = lut[y[r1 + cx0[x]]] * (1 - fx) + lut[y[r1 + cx1[x]]] * fx;
      out[o + x] = Math.max(0, Math.min(255, Math.round(a * (1 - fy) + b * fy)));
    }
  }
  return out;
}

/**
 * 거친 훑기용 — 밝기 면을 범위를 펴 돌림을 반영해 W × H 로 칸 평균(넓이 평균)한다. 크게 줄이므로(1080 → 320) 이중선형이면 작은 공이
 * 칸 사이로 빠진다 — 예전 캔버스 길이 'high' 로 흐려 줄이던 것과 같은 뜻. 다른 형식이면 null.
 */
export async function boxLumaOfSample(sample: LumaSource, W: number, H: number): Promise<Float32Array | null> {
  if (sample.format !== 'NV12' && sample.format !== 'I420') return null;
  const need = sample.allocationSize();
  if (yBuffer.length < need) yBuffer = new Uint8Array(need);
  const layout = await sample.copyTo(yBuffer);
  const { offset, stride } = layout[0];
  const { left, top, width: w, height: h } = sample.visibleRect;
  const lut = sample.colorSpace.fullRange ? FULL_RANGE : VIDEO_RANGE;
  const rot = ((sample.rotation % 360) + 360) % 360;
  const PW = rot === 90 || rot === 270 ? h : w;
  const PH = rot === 90 || rot === 270 ? w : h;
  const col = (x: number) =>
    rot === 0 ? x : rot === 90 ? (h - 1 - x) * stride : rot === 180 ? w - 1 - x : x * stride;
  const row = (y: number) =>
    rot === 0 ? y * stride : rot === 90 ? y : rot === 180 ? (h - 1 - y) * stride : w - 1 - y;
  const base = offset + top * stride + left;
  const xs = Int32Array.from({ length: W + 1 }, (_, x) => Math.min(PW, Math.floor((x * PW) / W)));
  const ys = Int32Array.from({ length: H + 1 }, (_, y) => Math.min(PH, Math.floor((y * PH) / H)));
  const cols = Int32Array.from({ length: PW }, (_, x) => col(x));
  const out = new Float32Array(W * H);
  const acc = new Float64Array(W);
  const y = yBuffer;
  for (let oy = 0; oy < H; oy++) {
    acc.fill(0);
    for (let sy = ys[oy]; sy < ys[oy + 1]; sy++) {
      const r = base + row(sy);
      for (let ox = 0; ox < W; ox++) {
        let sum = 0;
        for (let sx = xs[ox]; sx < xs[ox + 1]; sx++) sum += lut[y[r + cols[sx]]];
        acc[ox] += sum;
      }
    }
    const rows = ys[oy + 1] - ys[oy];
    for (let ox = 0; ox < W; ox++) out[oy * W + ox] = acc[ox] / Math.max(1, rows * (xs[ox + 1] - xs[ox]));
  }
  return out;
}
