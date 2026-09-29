import { BALL_DIAMETER_M } from './geometry.ts';
import { MAX_RELEASE_DISTANCE_M } from './validate.ts';

/**
 * 영상 파일에서 공을 던진 때를 찾는다 — 거친 훑기(장면 사이 0.05~0.07초, analyze-video.ts)로 꺼낸 작은
 * 장면들에서 '가운데 근처에 나타나 빠르게 작아지며 멀어지는 밝은 덩어리'(날아가는 공)를 찾는다.
 *
 * 예전에는 앞 장과의 화면 전체 밝기 차이가 가장 큰 때를 던진 때로 보고 그 0.35초 앞부터 1초를 훑었다.
 * 카메라 바로 앞의 몸이 가장 크게 움직이는 때는 던진 때가 아닐 때가 많았다(첫 보정 자료 18개):
 *   - 던진 뒤 몸이 따라 나오는 때(릴리스 0.29~0.36초 뒤, 18개 중 8개) — 구간이 릴리스에 겨우 걸치거나
 *     (6487091a · 74f6586f · af31e8d0 · b6b60d9a) 공이 가장 큰 첫 두 장을 잘랐다(f43a7958 — 공 32~ · 구간 34~).
 *   - 던지기 전 글러브 낀 팔을 휘두른 때 — 1초 구간이 던지기 직전에 끝나 공을 못 봤다(89288ada, 릴리스
 *     0.96초 · 구간 0~1초 → '공을 충분히 잡지 못했다').
 *   - 영상 첫머리의 준비 동작(7f8f2d15 · e9ae8712 · eb05ae07) — 영상이 짧아 구간이 운 좋게 공을 담았다.
 * 공 자체를 찾으면 그 첫 장면이 곧 릴리스 직후다 — 공을 잴 수 있는 16개 모두 릴리스 +0.02~0.10초(거친
 * 장면 한두 간격 안). 가로 320 을 넓이 평균으로 줄여도, 미리 흐리지 않고 쌍선형으로 줄이고 잡음 σ3 을 더해도
 * 같았다. 나머지 둘은 공이 흰 표적 천 앞으로 날아가 원래 잴 수 없는 영상이다 — '못 찾음'(그러면 예전처럼
 * 움직임이 가장 큰 때를 쓴다)이거나 2~3 이음짜리 헛궤적이 나오는데, 어느 구간에서도 분석이 거부한다.
 *
 * 공인지 가리는 기준은 3차원 물리다(지름 → 거리 z = f·D/d, 화면 위치 → 옆 · 위아래 X = (x − cx)·D/d):
 *   - 깊이 속도 MIN_DEPTH_MPS ~ MAX_DEPTH_MPS — 서 있는 몸 · 흔들리는 천은 느리다
 *   - 옆 · 위아래 속도 MAX_LATERAL_MPS 이하 — 손 · 천에서 멀리 떨어진 점으로 뛰는 이음을 막는다
 *   - 커지지 않는다(멀어지는 공) · 다가오는 공이면 반대
 *   - 씨앗은 가운데 근처에 새로 나타난 것(앞 · 뒤 장면의 같은 자리에 같은 크기로 있으면 머무는 것)
 * 이 조건으로 이어진 궤적 가운데 이음이 STRONG_LINKS(3) 이상인 것 중 가장 먼저 시작한 것(없으면 2 이음 중 가장 먼저)의
 * 첫 장면 시각을 돌려준다 — 이음 수를 끝까지 세지 않는 까닭은 STRONG_LINKS 설명.
 *
 * 계산은 가운데 정사각형(짧은 변 × 짧은 변)만 — 릴리스는 가운데(validate.ts)이고 공은 소실점 쪽으로 모인다.
 * 가로 320 · 48장에서 80~160ms(노드 기준, 다른 계산과 CPU 를 나눠 쓰며 잰 값).
 */

/** 공의 깊이 속도 범위(m/s) — 약 29~234km/h(detect.ts 의 MIN_TRACK_SPEED_MPS · MAX_SPEED_MPS 와 같다) */
const MIN_DEPTH_MPS = 8;
const MAX_DEPTH_MPS = 65;
/**
 * 옆 · 위아래 속도 상한(m/s). 투수 뒤에서 찍으면 공은 거의 카메라 축을 따라 날아간다 — 실제 18개의 공은
 * 2~5m/s 였다. 축에서 20° 벗어나도 130km/h 면 12m/s. 손 · 천(가까이 크게 잡힌 것)에서 화면 반대편 점으로
 * 뛰는 이음은 20m/s 안팎으로 나와 여기서 걸린다.
 */
const MAX_LATERAL_MPS = 12;
/** 이 비율 안쪽(짧은 변 절반 기준)에서 나타난 덩어리만 씨앗 — validate.ts 의 MAX_RELEASE_OFFSET_RATIO 와 같다 */
const SEED_CENTER_RATIO = 0.45;
/** 씨앗이 될 수 있는 가장 가까운 거리(m) — detect.ts 의 trackBall 과 같다(손 · 팔을 거른다) */
const MIN_SEED_DISTANCE_M = 0.8;
/** 이음을 건너뛸 수 있는 장면 수 */
const MAX_GAP = 1;
/**
 * 앞 · 뒤 장면의 같은 자리(지름의 STATIC_POS_RATIO 안)에 같은 크기(STATIC_SIZE_RATIO 안)로 있는 덩어리는
 * 씨앗이 아니다 — 가만히 걸린 흰 표적 천처럼 머무는 것. 막 던진 공은 다음 장면에서 크게 작아진다.
 */
const STATIC_POS_RATIO = 0.25;
const STATIC_SIZE_RATIO = 0.15;
/** 궤적으로 볼 최소 이음 수 — 두 번(세 장) 물리대로 멀어져야 한다 */
const MIN_LINKS = 2;
/**
 * 이만큼 이음이 있으면 '확실한 궤적'. 궤적을 고를 때 이음 수는 여기까지만 세고, 넘으면 먼저 시작한 것을 고른다.
 *
 * 왜: 던진 공은 영상에서 카메라에서 멀어지는 첫 물체다. 그 뒤에 생기는 궤적(표적에 맞고 튄 공 · 흔들리는 천 · 그물)은
 * 더 길게 이어지기도 해서, 이음이 가장 많은 것을 고르면 진짜 공(3~4 이음)이 늦은 헛궤적(4~5 이음)에 졌다 — 거친 장면
 * 간격을 0.07초로 늘린 시험에서 7f8f2d15 가 릴리스 0.8초 뒤 헛궤적으로 갔다. 3 에서 자르면 그 경우가 바로잡히고, 보정
 * 영상 16개의 공은 그대로 찾는다(lab/video 스트레스 시험 16 변형: 맞는 공 구간 232 → 233, 헛궤적 받아들임 6 → 2).
 */
export const STRONG_LINKS = 3;
/**
 * 배경 = 픽셀마다 거친 장면들(최대 BACKGROUND_SAMPLES 장)의 중앙값. 분석(analyze-frames)은 1초 구간
 * 안에서 공이 가운데에 오래 머물러 두 번째로 어두운 값을 쓰지만, 거친 장면은 영상 전체에 흩어져 있어
 * 공은 한 자리에 한두 장만 있다. 두 번째로 어두운 값을 쓰면 공에 맞아 흔들린 흰 천의 그늘진 장면이
 * 골라져, 가만히 걸린 천 전체가 '밝아진 덩어리'가 되고 그 가장자리를 지나는 공을 삼켰다(eb05ae07).
 */
const BACKGROUND_SAMPLES = 15;
/** 배경보다 이만큼 밝아지면 움직인 것(detect.ts 의 DIFF_THRESHOLD 와 같다) */
const DIFF_THRESHOLD = 28;
/** 덩어리 모양 — detect.ts 와 같다. 크기 하한만 작은 장면에 맞춰 낮춘다(지름 3px 쯤) */
const MIN_BLOB_PIXELS = 6;
const MIN_ASPECT = 0.55;
const MAX_ASPECT = 1.8;
const MIN_FILL_RATIO = 0.45;
const MAX_CANDIDATES = 40;

export type ThrowSample = { t: number; luma: ArrayLike<number> };

export type ThrowTrackPoint = { t: number; x: number; y: number; d: number };

export type FoundThrow = {
  /** 공이 처음 보인 거친 장면의 시각(초) — 릴리스는 이 앞 한 간격 안이다 */
  t: number;
  /** 그 앞 거친 장면의 시각(초) — 공이 아직 손에 있던 때. 첫 장면이면 t − (다음 간격) */
  prevT: number;
  /** 거친 장면에서 이은 공(장면 픽셀) */
  track: ThrowTrackPoint[];
  /** 이음 수(= 장면 수 − 1) */
  links: number;
  /** 씨앗(첫 공)까지의 거리(m) — 가정한 초점거리로 z = f·D/d */
  seedZ: number;
};

export type FindThrowOptions = {
  approach?: 'receding' | 'approaching';
  /**
   * 멀어지는 공의 씨앗이 될 수 있는 가장 먼 거리(m). 투수 뒤에서 찍으면 공은 릴리스(카메라에서 1~4m) 직후 첫 거친
   * 장면에 보이므로, 첫 공까지는 '릴리스 거리 + 한 간격 동안 난 거리'(4m + 40m/s × 0.07초 ≈ 6.8m) 안이다. 그보다
   * 멀리서 시작한 궤적은 공이 아니라 표적 천 · 먼 배경의 작은 점을 이은 헛궤적이다(흰 천 영상에서 5.3~8.7m).
   * 비우면 제한하지 않는다.
   */
  seedMaxM?: number | null;
  /** 시험용 — 궤적 점수에서 이음 수를 이만큼까지만 센다(넘으면 먼저 시작한 것). 기본 STRONG_LINKS */
  linkCap?: number | null;
};

type CoarseBlob = { cx: number; cy: number; d: number; pixels: number };

/**
 * @param samples 시간순 거친 장면(밝기, width × height)
 * @param focalPx 초점거리(이 장면 픽셀 기준)
 */
export function findThrow(
  samples: ThrowSample[],
  width: number,
  height: number,
  focalPx: number,
  options: FindThrowOptions | 'receding' | 'approaching' = {}
): FoundThrow | null {
  const opts: FindThrowOptions = typeof options === 'string' ? { approach: options } : options;
  const approach = opts.approach ?? 'receding';
  if (samples.length < MIN_LINKS + 1) return null;
  /* 가운데 정사각형 */
  const side = Math.min(width, height);
  const x0 = Math.floor((width - side) / 2);
  const y0 = Math.floor((height - side) / 2);
  const n = side * side;

  /* 배경 — 고르게 뽑은 장면들의 중앙값 */
  const pick: ArrayLike<number>[] = [];
  const m = Math.min(BACKGROUND_SAMPLES, samples.length);
  for (let i = 0; i < m; i++) {
    pick.push(samples[Math.round((i * (samples.length - 1)) / Math.max(1, m - 1))].luma);
  }
  const background = new Float32Array(n);
  const bucket = new Float32Array(m);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const src = (y + y0) * width + x + x0;
      /* 삽입 정렬 — 15개뿐이라 typed array 의 sort 를 부르는 것보다 몇 배 빠르다 */
      for (let k = 0; k < m; k++) {
        const v = pick[k][src];
        let j = k - 1;
        while (j >= 0 && bucket[j] > v) {
          bucket[j + 1] = bucket[j];
          j--;
        }
        bucket[j + 1] = v;
      }
      background[y * side + x] = bucket[m >> 1];
    }
  }

  const mask = new Uint8Array(n);
  const hist = new Int32Array(511);
  const stack = new Int32Array(n);
  const findBlobs = (luma: ArrayLike<number>): CoarseBlob[] => {
    /* 자동 노출 — 성기게 짚은 (밝기 − 배경)의 중앙값을 뺀다 */
    hist.fill(0);
    let count = 0;
    for (let i = 0; i < n; i += 13) {
      const y = Math.floor(i / side);
      const d = Math.round(luma[(y + y0) * width + (i - y * side) + x0] - background[i]);
      hist[Math.max(-255, Math.min(255, d)) + 255]++;
      count++;
    }
    /* 히스토그램으로 중앙값 — 장면마다 수천 개를 정렬하지 않는다 */
    let acc = 0;
    let median = 0;
    for (let k = 0; k < hist.length; k++) {
      acc += hist[k];
      if (acc * 2 >= count) {
        median = k - 255;
        break;
      }
    }
    const threshold = DIFF_THRESHOLD + median;
    for (let y = 0; y < side; y++) {
      const row = (y + y0) * width + x0;
      for (let x = 0; x < side; x++) {
        const i = y * side + x;
        mask[i] = luma[row + x] - background[i] > threshold ? 1 : 0;
      }
    }
    const out: CoarseBlob[] = [];
    for (let start = 0; start < n; start++) {
      if (mask[start] !== 1) continue;
      let top = 0;
      stack[top++] = start;
      mask[start] = 2;
      let count = 0;
      let sx = 0;
      let sy = 0;
      let minX = side;
      let maxX = 0;
      let minY = side;
      let maxY = 0;
      while (top > 0) {
        const i = stack[--top];
        const x = i % side;
        const y = (i - x) / side;
        count++;
        sx += x;
        sy += y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x > 0 && mask[i - 1] === 1) {
          mask[i - 1] = 2;
          stack[top++] = i - 1;
        }
        if (x < side - 1 && mask[i + 1] === 1) {
          mask[i + 1] = 2;
          stack[top++] = i + 1;
        }
        if (y > 0 && mask[i - side] === 1) {
          mask[i - side] = 2;
          stack[top++] = i - side;
        }
        if (y < side - 1 && mask[i + side] === 1) {
          mask[i + side] = 2;
          stack[top++] = i + side;
        }
      }
      if (count < MIN_BLOB_PIXELS) continue;
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      if (w / h < MIN_ASPECT || w / h > MAX_ASPECT) continue;
      if (count / (w * h) < MIN_FILL_RATIO) continue;
      out.push({ cx: sx / count + x0, cy: sy / count + y0, d: (w + h) / 2, pixels: count });
    }
    if (out.length > MAX_CANDIDATES) {
      out.sort((a, b) => b.pixels - a.pixels);
      out.length = MAX_CANDIDATES;
    }
    return out;
  };
  const blobs = samples.map((s) => findBlobs(s.luma));

  const k = focalPx * BALL_DIAMETER_M;
  const cx = width / 2;
  const cy = height / 2;
  const half = side / 2;
  const maxSeed = k / MIN_SEED_DISTANCE_M;
  const minSeed = approach === 'receding' && opts.seedMaxM ? k / opts.seedMaxM : 0;

  const linkOk = (a: ThrowTrackPoint, b: ThrowTrackPoint) => {
    const dt = b.t - a.t;
    if (!(dt > 0)) return false;
    if (approach === 'receding' ? b.d > a.d : b.d < a.d) return false;
    const vz = ((approach === 'receding' ? 1 : -1) * (k / b.d - k / a.d)) / dt;
    if (vz < MIN_DEPTH_MPS || vz > MAX_DEPTH_MPS) return false;
    /* 옆 · 위아래 위치(m) = 화면 중심에서 떨어진 픽셀 × D / d */
    const lx = ((b.x - cx) / b.d - (a.x - cx) / a.d) * BALL_DIAMETER_M;
    const ly = ((b.y - cy) / b.d - (a.y - cy) / a.d) * BALL_DIAMETER_M;
    return Math.hypot(lx, ly) / dt <= MAX_LATERAL_MPS;
  };
  const isStatic = (s: number, b: CoarseBlob) => {
    for (const j of [s - 1, s + 1]) {
      if (j < 0 || j >= blobs.length) continue;
      for (const o of blobs[j]) {
        if (
          Math.hypot(o.cx - b.cx, o.cy - b.cy) <= Math.max(1, STATIC_POS_RATIO * b.d) &&
          Math.abs(o.d - b.d) <= STATIC_SIZE_RATIO * b.d
        )
          return true;
      }
    }
    return false;
  };

  let best: ThrowTrackPoint[] | null = null;
  let bestSeed = -1;
  let bestScore = -1;
  for (let s = 0; s < samples.length; s++) {
    for (const seed of blobs[s]) {
      if (seed.d > maxSeed || seed.d < minSeed) continue;
      if (Math.hypot(seed.cx - cx, seed.cy - cy) / half > SEED_CENTER_RATIO) continue;
      if (isStatic(s, seed)) continue;
      const track: ThrowTrackPoint[] = [{ t: samples[s].t, x: seed.cx, y: seed.cy, d: seed.d }];
      let missed = 0;
      for (let f = s + 1; f < samples.length && missed <= MAX_GAP; f++) {
        const last = track[track.length - 1];
        let next: ThrowTrackPoint | null = null;
        let cost = Infinity;
        for (const b of blobs[f]) {
          const p = { t: samples[f].t, x: b.cx, y: b.cy, d: b.d };
          if (!linkOk(last, p)) continue;
          /* 여럿이면 화면에서 가까운 것(공 지름 단위) */
          const c = Math.hypot(p.x - last.x, p.y - last.y) / Math.max(1, last.d);
          if (c < cost) {
            cost = c;
            next = p;
          }
        }
        if (next) {
          track.push(next);
          missed = 0;
        } else missed++;
      }
      const links = track.length - 1;
      if (links < MIN_LINKS) continue;
      /* 확실한 궤적(STRONG_LINKS 이상)끼리는 먼저 시작한 것(릴리스), 그 밑은 이음이 많은 것 */
      const score = Math.min(links, opts.linkCap ?? STRONG_LINKS) * 10_000 - s;
      if (score > bestScore) {
        bestScore = score;
        best = track;
        bestSeed = s;
      }
    }
  }
  if (!best) return null;
  const prevT =
    bestSeed > 0
      ? samples[bestSeed - 1].t
      : best[0].t - (samples.length > 1 ? samples[1].t - samples[0].t : 0.05);
  return { t: best[0].t, prevT, track: best, links: best.length - 1, seedZ: k / best[0].d };
}

/* ───────────────────────── 거친 훑기 계획 ───────────────────────── */

/** 거친 훑기 기본 장수 — 영상 전체에서 고르게(예전과 같은 격자라 예전 '가장 크게 움직인 때'가 그대로 나온다) */
export const COARSE_SAMPLES = 48;
/** 거친 장면 사이의 가장 긴 간격(초) — 이보다 길면 빠른 공이 두세 장에만 찍혀 공을 못 찾거나 헛궤적이 이긴다 */
export const COARSE_STEP_MAX = 0.07;

/** 예전 격자: 간격 = max(길이/48, 1/20), 시각 = 간격/2 + j·간격 */
export function coarseGrid(duration: number): { times: number[]; step: number } {
  const step = Math.max(duration / COARSE_SAMPLES, 1 / 20);
  const times: number[] = [];
  for (let t = step / 2; t < duration; t += step) times.push(t);
  return { times, step };
}

/**
 * 가장 크게 움직인 때(예전 방식) — 고른 격자의 앞 장과 밝기 차이 합이 가장 큰 사이의 한가운데. 공을 못 찾았을 때
 * 구간을 정하고, 공으로 찾은 궤적이 믿을 만한지 견줄 때 쓴다.
 */
export function motionPeak(samples: { t: number; luma: ArrayLike<number> }[], step: number): number | null {
  let best = -1;
  let peak: number | null = null;
  for (let s = 1; s < samples.length; s++) {
    const a = samples[s - 1].luma;
    const b = samples[s].luma;
    let diff = 0;
    for (let i = 0; i < b.length; i++) diff += Math.abs(b[i] - a[i]);
    if (diff > best) {
      best = diff;
      peak = samples[s].t - step / 2;
    }
  }
  return peak;
}

/**
 * 긴 영상은 고른 격자의 간격이 COARSE_STEP_MAX 를 넘는다(길이 3.4초 넘게). 그때는 가장 크게 움직인 때 앞뒤
 * [peak − BAND_BEFORE_SEC, peak + BAND_AFTER_SEC] 만 격자 사이를 나눠 더 촘촘히 꺼낸다 — 영상 전체를 촘촘히 훑으면
 * 되감기 수가 길이에 비례해 폰에서 수십 초가 걸린다. 가장 크게 움직인 때와 공이 처음 보인 때의 차이는 보정 영상
 * 16개에서 −0.35 ~ +0.79초였다(던진 뒤 몸이 따라 나올 때가 가장 크면 공이 먼저, 던지기 전 팔을 휘두를 때가 가장 크면
 * 공이 나중). 몸의 움직임은 던지기 1초 전 ~ 0.4초 뒤에 몰리므로 앞 0.6초 · 뒤 1.3초를 본다.
 */
export const BAND_BEFORE_SEC = 0.6;
export const BAND_AFTER_SEC = 1.3;

/** 촘촘히 더 꺼낼 시각들(고른 격자에 없는 것만, 오름차순). 짧은 영상 · 정점을 모르면 빈 배열 */
export function denseBandTimes(duration: number, step: number, peak: number | null): number[] {
  if (peak == null || step <= COARSE_STEP_MAX) return [];
  const parts = Math.ceil(step / COARSE_STEP_MAX);
  const lo = peak - BAND_BEFORE_SEC;
  const hi = peak + BAND_AFTER_SEC;
  const out: number[] = [];
  for (let t = step / 2; t < duration; t += step) {
    for (let p = 1; p < parts; p++) {
      const u = t + (p * step) / parts;
      if (u >= lo && u <= hi && u < duration) out.push(u);
    }
  }
  return out;
}

/* ───────────────────────── 분석 구간 정하기 ───────────────────────── */

/** 분석 구간 길이(초) — 공이 손을 떠나 네트 · 표적에 닿기까지 0.5초 남짓이라 넉넉히 1초 */
export const WINDOW_SEC = 1;
/**
 * 공으로 찾았을 때 구간을 '공이 아직 손에 있던 거친 장면'(prevT)보다 이만큼 앞서 시작한다(초). 릴리스는 prevT 와 첫 공
 * 장면 사이에 있다 — 그 앞 0.1초를 더 담아, 공이 손에 붙은 채 크게 잡혀 첫 공 장면에서 놓쳤어도 릴리스가 구간 안에
 * 들게 한다.
 */
export const THROW_PRE_SEC = 0.1;
/** 공을 못 찾았을 때 예전 방식 — 가장 크게 움직인 때에서 이만큼 앞부터(멀어지면 던진 뒤 몸이 가장 크게 움직인다) */
export const PEAK_BEFORE_SEC = { receding: 0.35, approaching: 0.7 } as const;
/**
 * 멀어지는 공 씨앗의 가장 먼 거리(m) — FindThrowOptions.seedMaxM 설명. 검사가 받는 가장 먼 릴리스(validate.ts
 * MAX_RELEASE_DISTANCE_M 4m) + 거친 장면 한 간격(최대 COARSE_STEP_MAX) 동안 빠른 공(40m/s ≈ 144km/h)이 난 거리 = 6.8m.
 * 보정 영상 16개의 진짜 공 씨앗은 1.9~3.1m, 흰 천 · 먼 배경의 헛궤적 씨앗은 3.1~7.7m 였다 — 이 값으로 헛궤적을 다 막지는
 * 못한다(막는 것은 분석이 그 구간을 거부하면 예전 구간으로 다시 재는 대비책, analyze-video.ts). 여기서는 물리적으로
 * 불가능한 씨앗만 뺀다.
 */
export const SEED_MAX_M = MAX_RELEASE_DISTANCE_M + 40 * COARSE_STEP_MAX;
/**
 * 찾은 궤적을 믿는 조건: 이음이 STRONG_LINKS(3) 이상이거나, 2 이음이면 첫 공이 릴리스가 있을 수 있는 거리
 * (WEAK_SEED_MAX_M = 검사가 받는 가장 먼 릴리스 4m) 안일 때. 2 이음(세 장)짜리는 우연히 이어진 점일 수 있다 — 보정
 * 영상의 흰 천 · 먼 배경 헛궤적은 대개 2 이음이고 첫 점이 4.3~6.3m 였다(진짜 공의 2 이음은 2.1~3.6m). 예전의 '가장
 * 크게 움직인 때 근처면 믿기'는 뺐다 — 스트레스 시험에서 거리 조건과 결과가 같고, 몸이 가장 크게 움직인 때는 던진 때와
 * −0.35~+0.8초로 흩어져 있어 판단 근거가 약하다.
 */
export const WEAK_SEED_MAX_M = MAX_RELEASE_DISTANCE_M;

export type WindowKind = 'ball' | 'peak' | 'whole' | 'range';
export type AnalysisWindow = { kind: WindowKind; from: number; to: number };

export type ThrowPlan = {
  /** 분석할 구간 — 이 차례로 재 보고 처음 잰 것을 쓴다(analyze-video.ts) */
  windows: AnalysisWindow[];
  /** 거친 장면에서 찾은 공(없으면 null)과 그것을 믿었나 */
  ball: (FoundThrow & { accepted: boolean }) | null;
  /** 가장 크게 움직인 때(초) */
  peak: number | null;
};

/**
 * 공 시각에 묶은 배경 장면의 시각(초) — 영상 처음 · 가운데 · 끝 + 공 구간(prevT − THROW_PRE_SEC 부터 1초)을 일곱으로
 * 고르게 나눈 7장. analyze-video 가 이것을 배경으로 넘기고 구간 안에서 따로 뽑지 않게(inWindowBackground 0) 한다.
 *
 * 왜: analyze-frames 는 배경을 '준 장면 + 구간 안에서 고르게 뽑은 7장'의 픽셀마다 두 번째로 어두운 값으로 만든다.
 * 그러면 구간이 어디서 시작하느냐에 따라 배경이 바뀌어, 같은 공 장면인데 지름 · 추적이 달라졌다(1차 검증: 구간 시작만
 * 0 / 0.1 / 0.25초로 바꿔도 영상마다 1~2.7km/h, 6487091a 는 추적이 헛점으로 뛰어 12km/h). 배경을 공이 나타난 때에 묶으면
 * 구간을 어떻게 잡든(공 구간 · 대비책인 정점 구간 · 앞 여유) 배경이 같다. 자리는 기본 구간의 7장과 같아(여유 0.1초일 때)
 * 새로 되감을 장면이 거의 없다. 던지기 전 장면만 쓰는 배경은 투수 몸이 공 길을 가려 추적이 흔들려(819baba0 UNSTABLE) 쓰지 않는다.
 */
export const ANCHORED_BACKGROUND_COUNT = 7;

export function anchoredBackgroundTimes(prevT: number, duration: number): number[] {
  const out = [0, duration * 0.5, Math.max(0, duration - 0.05)];
  for (let j = 0; j < ANCHORED_BACKGROUND_COUNT; j++) {
    const t = prevT - THROW_PRE_SEC + (j * WINDOW_SEC) / (ANCHORED_BACKGROUND_COUNT - 1);
    out.push(Math.max(0, Math.min(duration - 1e-3, t)));
  }
  return out;
}

/** 시작 시각 → 영상 안에 드는 1초 구간 */
export function clampWindow(start: number, duration: number): { from: number; to: number } {
  const from = Math.max(0, Math.min(start, duration - WINDOW_SEC));
  return { from, to: Math.min(duration, from + WINDOW_SEC) };
}

/**
 * 거친 장면들로 분석 구간을 정한다(브라우저 없이 도는 순수 함수 — 시험대 · 자가 시험이 같은 코드를 쓴다).
 *
 * 차례: ① 공으로 찾은 구간(멀어지는 공 · 찾은 궤적을 믿을 때) ② 가장 크게 움직인 때로 정한 예전 구간. analyze-video 가
 * ①에서 분석이 거부되면 ②로 한 번 더 잰다 — 거친 장면의 잡음 · 긴 영상에서 헛궤적이 이기거나, 공을 찾았어도 그 구간의
 * 첫 장면 · 배경 때문에 거부될 때 예전보다 나빠지지 않게. 다가오는 공(포수 뒤)은 실제 영상으로 확인하지 못해 ②만 쓴다.
 * 두 구간이 같으면 하나만.
 *
 * @param samples 시간순 거친 장면(고른 격자 + 긴 영상의 띠), 가로 width
 * @param focalPx 이 장면 픽셀 기준 초점거리
 */
export function planThrowWindows(input: {
  duration: number;
  approach: 'receding' | 'approaching';
  samples: ThrowSample[];
  width: number;
  height: number;
  focalPx: number;
  peak: number | null;
}): ThrowPlan {
  const { duration, approach, samples, width, height, focalPx, peak } = input;
  const peakWindow: AnalysisWindow =
    peak != null
      ? { kind: 'peak', ...clampWindow(peak - PEAK_BEFORE_SEC[approach], duration) }
      : { kind: 'whole', from: 0, to: duration };
  let ball: ThrowPlan['ball'] = null;
  if (approach === 'receding') {
    const found = findThrow(samples, width, height, focalPx, { approach, seedMaxM: SEED_MAX_M });
    if (found) {
      ball = { ...found, accepted: found.links >= STRONG_LINKS || found.seedZ <= WEAK_SEED_MAX_M };
    }
  }
  const windows: AnalysisWindow[] = [];
  if (ball?.accepted) windows.push({ kind: 'ball', ...clampWindow(ball.prevT - THROW_PRE_SEC, duration) });
  if (!windows.some((w) => Math.abs(w.from - peakWindow.from) < 1e-6 && Math.abs(w.to - peakWindow.to) < 1e-6)) {
    windows.push(peakWindow);
  }
  return { windows, ball, peak };
}
