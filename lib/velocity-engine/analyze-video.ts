'use client';

import {
  buildBackground,
  findMovedBlobs,
  toLuma,
  trackBall,
  type FrameBlobs,
} from './detect.ts';
import { focalPxFromFov, type BallObservation, type CameraLens } from './geometry.ts';
import { measureVelocity, type MeasureResult } from './measure.ts';

/**
 * 브라우저에서 영상 파일을 읽어 구속을 잰다.
 *
 * 서버로 영상을 보내지 않는다. 브라우저가 이미 그 파일을 열 수 있고, 영상은
 * 용량이 커서 올리고 내리는 데 시간이 오래 걸리기 때문이다. 폰에서 열어도
 * 같은 코드가 그대로 돈다.
 *
 * 프레임을 한 장씩 꺼내 앞 장과 비교하는 방식이라, 영상 길이에 비례해 시간이
 * 걸린다. 그래서 투구 구간만 잘라 보도록 시작·끝 시각을 받는다.
 */

/**
 * 분석할 때 줄이는 가로 크기(픽셀).
 *
 * 원본 그대로 훑으면 브라우저가 버벅인다. 너무 줄이면 멀어진 공이 몇 픽셀로
 * 뭉개져 감지 한계에 걸리므로, 둘 사이에서 720을 쓴다. 지름을 원본 기준으로
 * 되돌릴 때 이 배율을 함께 곱하므로 결과가 달라지지는 않는다.
 */
const ANALYZE_WIDTH = 720;

/**
 * 한 번에 훑는 최대 프레임 수.
 *
 * 처음에 400장으로 뒀더니 1.2초짜리 영상 하나에 34초가 걸렸다. 프레임을 한 장
 * 꺼낼 때마다 영상을 그 시각으로 되감아야 해서, 장수가 곧 시간이다.
 *
 * 구속을 내는 데는 그만큼 필요하지 않다. 공이 쓸 만한 크기로 찍히는 구간은
 * 릴리스 직후 0.2~0.3초뿐이고, 그 안에서 스무 장 남짓만 있으면 충분하다.
 * 240fps로 찍어도 이 상한 안에서 고르게 뽑아 쓴다.
 */
const MAX_FRAMES = 120;

/** 아이폰 후면 메인 카메라의 대략적인 가로 화각(도) */
export const DEFAULT_FOV_DEG = 69;

export type AnalyzeOptions = {
  file: File;
  /** 분석 시작 시각(초). 비우면 처음부터 */
  startSec?: number;
  /** 분석 끝 시각(초). 비우면 끝까지 */
  endSec?: number;
  /** 카메라 화각(도). 보정을 하지 않았으면 기본값을 쓴다 */
  fovDeg?: number;
  /** 진행 상황 알림 (0~1) */
  onProgress?: (ratio: number) => void;
};

export type AnalyzeResult = {
  measure: MeasureResult;
  /** 화면에 궤적을 그릴 때 쓸 관측 (분석 해상도 기준) */
  track: BallObservation[];
  /** 분석에 쓴 해상도 */
  analyzeSize: { width: number; height: number };
  /** 원본 해상도 */
  sourceSize: { width: number; height: number };
  frameCount: number;
  /** 카메라가 얼마나 흔들렸는지 (픽셀, 원본 기준) */
  shakePx: number;
};

function waitForEvent(el: HTMLVideoElement, event: string, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      el.removeEventListener(event, ok_);
      el.removeEventListener('error', fail);
      clearTimeout(timer);
      resolve(ok);
    };
    const ok_ = () => finish(true);
    const fail = () => finish(false);
    const timer = setTimeout(() => finish(false), ms);
    el.addEventListener(event, ok_);
    el.addEventListener('error', fail);
  });
}

/**
 * 배경이 프레임 사이에 얼마나 밀렸는지 잰다.
 *
 * 화면 네 귀퉁이는 공이 지나가지 않는 자리라 배경만 있다. 그 부분의 밝기가
 * 프레임마다 얼마나 달라지는지 보면 카메라가 움직였는지 알 수 있다.
 * 정확한 이동량 대신 "고정인가 아닌가"를 가리는 데 쓴다.
 */
function cornerShift(
  prev: Float32Array,
  curr: Float32Array,
  width: number,
  height: number
): number {
  const bw = Math.floor(width * 0.15);
  const bh = Math.floor(height * 0.15);
  let diffSum = 0;
  let n = 0;

  const corners: [number, number][] = [
    [0, 0],
    [width - bw, 0],
    [0, height - bh],
    [width - bw, height - bh],
  ];

  for (const [ox, oy] of corners) {
    for (let y = oy; y < oy + bh; y += 2) {
      for (let x = ox; x < ox + bw; x += 2) {
        const i = y * width + x;
        diffSum += Math.abs(curr[i] - prev[i]);
        n++;
      }
    }
  }

  if (n === 0) return 0;
  const meanDiff = diffSum / n;
  /*
   * 밝기 차이를 픽셀 이동량으로 바꾸는 정확한 방법은 없다. 다만 고정된
   * 카메라에서는 이 값이 1~2에 머물고, 손으로 들면 10을 훌쩍 넘는다.
   * 검사 기준(MAX_CAMERA_SHAKE_PX)과 눈금을 맞추려고 그대로 픽셀로 본다.
   */
  return meanDiff;
}

/**
 * 두 프레임이 사실상 같은 장면인가.
 *
 * 영상은 압축돼 있어 완전히 똑같지는 않으므로, 몇 픽셀만 띄엄띄엄 보고
 * 차이가 거의 없으면 같은 장면으로 본다.
 */
function isSameFrame(prev: Float32Array, curr: Float32Array): boolean {
  let diff = 0;
  let n = 0;
  for (let i = 0; i < prev.length; i += 97) {
    diff += Math.abs(curr[i] - prev[i]);
    n++;
  }
  return n > 0 && diff / n < 0.6;
}

export async function analyzeVideo(options: AnalyzeOptions): Promise<AnalyzeResult> {
  const { file, startSec = 0, endSec, fovDeg = DEFAULT_FOV_DEG, onProgress } = options;

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  try {
    const loaded = await waitForEvent(video, 'loadeddata', 30_000);
    if (!loaded) throw new Error('영상을 열지 못했습니다.');

    const sourceW = video.videoWidth;
    const sourceH = video.videoHeight;
    if (!sourceW || !sourceH) throw new Error('영상 크기를 읽지 못했습니다.');

    const scale = Math.min(1, ANALYZE_WIDTH / sourceW);
    const width = Math.round(sourceW * scale);
    const height = Math.round(sourceH * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('화면을 준비하지 못했습니다.');

    /*
     * 프레임 간격을 정한다.
     *
     * 브라우저는 영상의 실제 fps를 알려주지 않는다. 그래서 재생 중 프레임이
     * 바뀌는 간격을 재는 방법을 쓰는데, 여기서는 한 장씩 시각을 지정해 꺼내야
     * 하므로 그 방법을 쓸 수 없다. 대신 흔한 촬영 프레임(240fps)까지 담을 수
     * 있게 촘촘히 훑고, 같은 장면이 두 번 나오면 그건 자연히 걸러진다.
     */
    const from = Math.max(0, startSec);
    const to = Math.min(endSec ?? video.duration, video.duration);
    const span = Math.max(0, to - from);
    if (span <= 0) throw new Error('분석할 구간이 없습니다.');

    const step = Math.max(span / MAX_FRAMES, 1 / 240);

    /*
     * 1) 프레임을 한 장씩 꺼내 밝기만 남겨 둔다.
     *    원본 픽셀을 다 들고 있으면 메모리를 많이 쓰므로 밝기로 줄여 보관한다.
     */
    const times: number[] = [];
    const lumas: Float32Array[] = [];
    let shakePx = 0;

    for (let t = from; t <= to; t += step) {
      video.currentTime = t;
      const seeked = await waitForEvent(video, 'seeked', 10_000);
      if (!seeked) break;

      ctx.drawImage(video, 0, 0, width, height);
      const luma = toLuma(ctx.getImageData(0, 0, width, height).data, width, height);

      const prev = lumas[lumas.length - 1];
      if (prev) {
        shakePx = Math.max(shakePx, cornerShift(prev, luma, width, height));

        /*
         * 같은 장면이 두 번 나오면 건너뛴다.
         *
         * 영상의 실제 프레임 수를 알 수 없어 촘촘히 훑는데, 30fps 영상을 77번
         * 꺼내면 같은 장면이 두세 번씩 나온다. 그대로 두면 공이 멈춰 있는 것처럼
         * 보여 속도가 낮게 나오고, 계산할 것도 두 배로 늘어난다.
         */
        if (isSameFrame(prev, luma)) continue;
      }

      times.push(t);
      lumas.push(luma);
      // 프레임 꺼내기가 전체 작업의 대부분이라 여기까지를 8할로 본다.
      onProgress?.(Math.min(0.8, ((t - from) / span) * 0.8));
    }

    if (lumas.length < 3) throw new Error('영상에서 프레임을 충분히 읽지 못했습니다.');

    /*
     * 2) 배경 기준선을 만든다.
     *
     * 분석 구간 안의 프레임만으로 만들면, 공이 오래 머무는 자리는 배경으로
     * 뽑을 만한 장면이 부족하다. 그래서 영상 전체(투구 전후 포함)에서도 몇 장을
     * 더 가져온다. 던지기 전 장면에는 공이 아예 없어 가장 깨끗한 배경이 된다.
     */
    const samples: Float32Array[] = [];
    const inWindow = Math.min(7, lumas.length);
    for (let i = 0; i < inWindow; i++) {
      samples.push(lumas[Math.floor((i * (lumas.length - 1)) / Math.max(1, inWindow - 1))]);
    }

    for (const t of [0, video.duration * 0.5, Math.max(0, video.duration - 0.05)]) {
      if (t >= from && t <= to) continue; // 구간 안은 이미 넣었다
      video.currentTime = t;
      if (!(await waitForEvent(video, 'seeked', 10_000))) continue;
      ctx.drawImage(video, 0, 0, width, height);
      samples.push(toLuma(ctx.getImageData(0, 0, width, height).data, width, height));
    }

    const background = buildBackground(samples);
    onProgress?.(0.85);

    // 3) 프레임마다 배경과 견줘 움직인 덩어리를 찾는다.
    const frames: FrameBlobs[] = [];
    for (let i = 0; i < lumas.length; i++) {
      frames.push({
        t: times[i],
        blobs: findMovedBlobs(background, lumas[i], width, height),
      });
      onProgress?.(0.85 + (i / lumas.length) * 0.15);
    }

    const track = trackBall(frames, { frameWidth: width, frameHeight: height });
    onProgress?.(1);

    // 지름·좌표를 원본 해상도 기준으로 되돌린다. 렌즈 정보가 원본 기준이기 때문이다.
    const scaled: BallObservation[] = track.map((o) => ({
      t: o.t,
      x: o.x / scale,
      y: o.y / scale,
      diameterPx: o.diameterPx / scale,
    }));

    const lens: CameraLens = {
      focalPx: focalPxFromFov(sourceW, fovDeg),
      frameWidth: sourceW,
      frameHeight: sourceH,
    };

    const measure = measureVelocity({
      observations: scaled,
      lens,
      stability: { maxBackgroundShiftPx: shakePx },
    });

    return {
      measure,
      track,
      analyzeSize: { width, height },
      sourceSize: { width: sourceW, height: sourceH },
      frameCount: frames.length,
      shakePx: Math.round(shakePx * 10) / 10,
    };
  } finally {
    video.src = '';
    URL.revokeObjectURL(url);
  }
}
