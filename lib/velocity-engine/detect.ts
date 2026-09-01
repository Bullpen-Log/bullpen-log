import type { BallObservation } from './geometry.ts';

/**
 * 영상 프레임에서 공을 찾아낸다.
 *
 * ── 어떻게 찾는가 ──
 *
 * 카메라가 삼각대에 고정돼 있으면 배경은 프레임마다 똑같다. 그래서 배경만 담긴
 * 기준 그림을 만들어 두고, 각 프레임에서 그것을 빼면 배경은 0으로 사라지고
 * 움직인 것만 남는다. 그중에서 "작고 동그랗고 밝은 덩어리"를 공으로 본다.
 *
 * ── 왜 바로 앞 프레임과 비교하지 않는가 ──
 *
 * 처음에는 앞 프레임과 뺐는데, 공을 첫 프레임에서만 찾고 그 뒤로는 하나도 못
 * 찾았다. 이 촬영에서 공은 화면 위를 가로지르지 않고 제자리에서 작아지기
 * 때문이다. 그래서 뒤 프레임의 공이 앞 프레임의 공 안에 통째로 들어가 버리고,
 * 두 프레임의 그 자리는 똑같이 밝아 차이가 0이 된다.
 *
 * 배경 기준선과 비교하면 공이 어디에 있든 매번 드러난다.
 *
 * 학습된 모델을 쓰지 않는다. 투수 뒤에서 찍는 조건이 강제돼 있어 공이 화면
 * 가운데에 또렷하게 찍히고, 배경이 고정이라 빼기만으로 충분하기 때문이다.
 * 모델을 쓰면 브라우저에서 무겁고, 무엇을 보고 판단했는지 설명할 수 없다.
 *
 * ── 왜 밝기 차이만 보는가 ──
 *
 * 색으로 찾으면 흰 공과 흰 유니폼·구름·조명을 구분하지 못한다. 움직임은
 * 공만의 성질이라 훨씬 안정적이다.
 */

/** 밝기 차이가 이 값을 넘으면 "움직였다"고 본다 (0~255). */
const DIFF_THRESHOLD = 28;

/**
 * 덩어리 하나로 볼 수 있는 최소·최대 픽셀 수.
 *
 * 아래 한계는 지름 4픽셀쯤에 해당한다. 이보다 작게 찍힌 공은 지름을 제대로 잴
 * 수 없어 어차피 계산에서 빠지므로(measure.ts의 MIN_USABLE_BALL_PX), 여기서
 * 미리 걸러 먼지·노이즈를 후보에 들이지 않는다.
 */
const MIN_BLOB_PIXELS = 12;
const MAX_BLOB_PIXELS = 12_000;

/**
 * 공은 둥글다. 덩어리를 감싸는 사각형의 가로세로 비가 이 범위를 벗어나면
 * 팔·몸통처럼 길쭉한 것이므로 뺀다.
 */
const MIN_ASPECT = 0.55;
const MAX_ASPECT = 1.8;

/**
 * 사각형을 채운 비율. 공은 사각형의 대부분을 채우지만(원은 약 0.785),
 * 팔처럼 비스듬한 것은 듬성듬성하다.
 */
const MIN_FILL_RATIO = 0.45;

/** 한 프레임에서 후보를 이만큼까지만 본다. 더 많으면 화면 전체가 움직인 것이다. */
const MAX_CANDIDATES_PER_FRAME = 40;

export type Blob = {
  cx: number;
  cy: number;
  width: number;
  height: number;
  pixels: number;
};

/** 픽셀 배열에서 밝기만 뽑는다. 색은 조명에 따라 흔들려 밝기가 더 안정적이다. */
export function toLuma(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): Float32Array {
  const luma = new Float32Array(width * height);
  for (let i = 0; i < luma.length; i++) {
    luma[i] =
      pixels[i * 4] * 0.299 + pixels[i * 4 + 1] * 0.587 + pixels[i * 4 + 2] * 0.114;
  }
  return luma;
}

/**
 * 여러 프레임에서 "배경만 담긴 기준 그림"을 만든다.
 *
 * 픽셀마다 여러 시점의 밝기를 모아 그중 어두운 축을 고른다. 공은 배경보다
 * 밝게 찍히므로, 어두운 쪽을 고르면 공이 지나간 자리에도 배경이 남는다.
 *
 * ── 왜 중앙값이 아니라 어두운 축인가 ──
 *
 * 처음에는 중앙값을 썼는데, 이 촬영에서는 공이 화면 한가운데에 계속 머물기
 * 때문에(카메라에서 멀어지는 방향으로 날아가므로) 가운데 픽셀은 거의 모든
 * 프레임에서 공이었다. 그래서 중앙값에도 공이 섞여, 정작 공을 못 찾았다.
 *
 * 가장 어두운 값 하나만 쓰면 잡티 하나에 휘둘리므로 두 번째로 어두운 값을 쓴다.
 */
export function buildBackground(samples: Float32Array[]): Float32Array {
  if (samples.length === 0) throw new Error('배경을 만들 프레임이 없습니다.');
  const size = samples[0].length;
  const background = new Float32Array(size);
  const bucket: number[] = new Array(samples.length);
  const rank = samples.length >= 4 ? 1 : 0;

  for (let i = 0; i < size; i++) {
    for (let s = 0; s < samples.length; s++) bucket[s] = samples[s][i];
    bucket.sort((a, b) => a - b);
    background[i] = bucket[rank];
  }
  return background;
}

/**
 * 배경보다 밝아진 덩어리들을 찾는다.
 *
 * 흐름 채우기(flood fill)를 쓰되 재귀 대신 배열을 쓴다. 큰 덩어리에서
 * 재귀로 하면 브라우저가 멈춘다.
 */
export function findMovedBlobs(
  background: Float32Array,
  currLuma: Float32Array,
  width: number,
  height: number
): Blob[] {
  const moved = new Uint8Array(width * height);
  for (let i = 0; i < moved.length; i++) {
    // 공은 배경보다 밝게 찍히는 쪽이라 밝아진 곳만 본다. 그림자를 걸러준다.
    if (currLuma[i] - background[i] > DIFF_THRESHOLD) moved[i] = 1;
  }

  const blobs: Blob[] = [];
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];

  for (let start = 0; start < moved.length; start++) {
    if (!moved[start] || visited[start]) continue;

    stack.length = 0;
    stack.push(start);
    visited[start] = 1;

    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    while (stack.length > 0) {
      const idx = stack.pop()!;
      const x = idx % width;
      const y = (idx - x) / width;

      count++;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      // 상하좌우 이웃만 본다. 대각선까지 이으면 서로 다른 것이 붙는다.
      if (x > 0 && moved[idx - 1] && !visited[idx - 1]) {
        visited[idx - 1] = 1;
        stack.push(idx - 1);
      }
      if (x < width - 1 && moved[idx + 1] && !visited[idx + 1]) {
        visited[idx + 1] = 1;
        stack.push(idx + 1);
      }
      if (y > 0 && moved[idx - width] && !visited[idx - width]) {
        visited[idx - width] = 1;
        stack.push(idx - width);
      }
      if (y < height - 1 && moved[idx + width] && !visited[idx + width]) {
        visited[idx + width] = 1;
        stack.push(idx + width);
      }
    }

    if (count < MIN_BLOB_PIXELS || count > MAX_BLOB_PIXELS) continue;

    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const aspect = w / h;
    if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) continue;
    if (count / (w * h) < MIN_FILL_RATIO) continue;

    blobs.push({
      cx: sumX / count,
      cy: sumY / count,
      width: w,
      height: h,
      pixels: count,
    });
    if (blobs.length > MAX_CANDIDATES_PER_FRAME) break;
  }

  return blobs;
}

/** 덩어리 하나를 공으로 봤을 때의 지름(픽셀) */
export function blobDiameter(blob: Blob): number {
  // 가로세로 평균을 쓴다. 한쪽만 쓰면 살짝 잘린 덩어리에서 크게 틀린다.
  return (blob.width + blob.height) / 2;
}

export type FrameBlobs = {
  /** 영상 시작 기준 시각(초) */
  t: number;
  blobs: Blob[];
};

/**
 * 프레임별 후보 덩어리들 → 공 하나의 궤적.
 *
 * 프레임마다 여러 개가 잡히므로(투수 몸, 흔들린 나뭇잎 등) 그중 실제 공의
 * 궤적을 골라내야 한다. 조건이 강제돼 있어 공은 다음 성질을 가진다.
 *
 *  - 화면 가운데에서 시작한다 (릴리스가 중앙이므로)
 *  - 프레임마다 점점 작아진다 (멀어지므로)
 *  - 화면 위에서는 조금씩만 움직인다 (카메라에서 멀어지는 방향이므로)
 *
 * 그래서 "가운데에서 시작하는 큰 덩어리"를 씨앗으로 잡고, 다음 프레임에서
 * 가장 가깝고 크기가 비슷한 것을 이어붙인다.
 */
export type TrackOptions = {
  frameWidth: number;
  frameHeight: number;
  /** 이 비율 안쪽에서 시작한 것만 씨앗으로 삼는다 (짧은 변의 절반 기준) */
  seedCenterRatio?: number;
  /** 다음 프레임에서 공이 화면상 움직여도 되는 최대 픽셀 */
  maxStepPx?: number;
  /** 중간에 놓쳐도 되는 프레임 수 */
  maxGapFrames?: number;
};

/**
 * 공으로 인정할 최소 축소율 — 마지막 지름이 첫 지름의 이 값 이하여야 한다.
 *
 * 카메라에서 멀어지는 공은 반드시 작아진다. 이 조건이 없으면 벽의 밝은 점처럼
 * 가만히 있는 것이 공으로 뽑힌다. 실제로 실내 연습장 영상에서 크기가 그대로인
 * 점 하나를 119프레임 내내 공으로 따라간 적이 있다.
 */
const MAX_END_SIZE_RATIO = 0.85;

/**
 * 하나의 궤적으로 볼 수 있는 최대 시간(초).
 *
 * 던진 공이 실내 네트나 포수에 닿기까지는 아무리 느려도 1초를 넘지 않는다.
 * 그보다 긴 것은 공이 아니라 배경의 무언가다.
 */
const MAX_TRACK_SECONDS = 1.0;

export function trackBall(
  frames: FrameBlobs[],
  options: TrackOptions
): BallObservation[] {
  const {
    frameWidth,
    frameHeight,
    seedCenterRatio = 0.45,
    maxStepPx = Math.max(frameWidth, frameHeight) * 0.12,
    maxGapFrames = 2,
  } = options;

  const cx = frameWidth / 2;
  const cy = frameHeight / 2;
  const half = Math.min(frameWidth, frameHeight) / 2;

  let best: BallObservation[] = [];
  let bestScore = 0;

  // 앞쪽 프레임들을 차례로 씨앗 삼아 가장 긴 궤적을 찾는다.
  for (let s = 0; s < Math.min(frames.length, 12); s++) {
    for (const seed of frames[s].blobs) {
      const offset = Math.hypot(seed.cx - cx, seed.cy - cy) / half;
      if (offset > seedCenterRatio) continue;

      const track: BallObservation[] = [
        { t: frames[s].t, x: seed.cx, y: seed.cy, diameterPx: blobDiameter(seed) },
      ];

      let last = track[0];
      let missed = 0;

      for (let f = s + 1; f < frames.length; f++) {
        let picked: Blob | null = null;
        let pickedScore = Infinity;

        for (const blob of frames[f].blobs) {
          const d = blobDiameter(blob);
          // 멀어지는 공은 커지지 않는다. 조금 커지는 것은 재기 흔들림으로 본다.
          if (d > last.diameterPx * 1.25) continue;
          const step = Math.hypot(blob.cx - last.x, blob.cy - last.y);
          if (step > maxStepPx * (missed + 1)) continue;

          /*
           * 가까울수록, 크기가 비슷할수록 좋은 후보다.
           * 크기 차이를 함께 보는 이유는, 공 근처를 지나는 다른 움직임(장갑 등)에
           * 궤적을 빼앗기지 않기 위해서다.
           */
          const sizeChange =
            Math.abs(d - last.diameterPx) / Math.max(1, last.diameterPx);
          const score = step / maxStepPx + sizeChange;
          if (score < pickedScore) {
            pickedScore = score;
            picked = blob;
          }
        }

        if (!picked) {
          missed++;
          if (missed > maxGapFrames) break;
          continue;
        }

        missed = 0;
        last = {
          t: frames[f].t,
          x: picked.cx,
          y: picked.cy,
          diameterPx: blobDiameter(picked),
        };
        track.push(last);
      }

      /*
       * 궤적을 고를 때 "가장 긴 것"을 쓰면 안 된다.
       *
       * 가만히 있는 밝은 점은 영상 내내 이어져 아주 긴 궤적이 되는 반면,
       * 진짜 공은 0.2~0.4초 만에 지나간다. 길이만 보면 가짜가 항상 이긴다.
       * 그래서 "얼마나 작아졌는가"를 함께 본다 — 멀어지는 공만 가진 성질이다.
       */
      const trimmed = track.filter((o) => o.t - track[0].t <= MAX_TRACK_SECONDS);
      if (trimmed.length < 3) continue;

      const sizeRatio = trimmed[trimmed.length - 1].diameterPx / trimmed[0].diameterPx;
      if (sizeRatio > MAX_END_SIZE_RATIO) continue; // 작아지지 않았다 = 공이 아니다

      const score = trimmed.length * (1 - sizeRatio);
      if (score > bestScore) {
        bestScore = score;
        best = trimmed;
      }
    }
  }

  return best;
}
