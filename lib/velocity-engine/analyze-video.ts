'use client';

import { toLuma } from './detect.ts';
import {
  analyzeScale,
  analyzeFrames,
  cornerShift,
  DEFAULT_FOV_DEG,
  isSameFrame,
  type AnalyzeResult,
  type Approach,
  type CapturedFrame,
} from './analyze-frames.ts';

export { DEFAULT_FOV_DEG, type AnalyzeResult } from './analyze-frames.ts';

/**
 * 브라우저에서 영상 파일을 읽어 구속을 잰다.
 *
 * 서버로 영상을 보내지 않는다. 브라우저가 이미 그 파일을 열 수 있고, 영상은
 * 용량이 커서 올리고 내리는 데 시간이 오래 걸리기 때문이다. 폰에서 열어도
 * 같은 코드가 그대로 돈다.
 *
 * 프레임을 한 장씩 꺼내 앞 장과 비교하는 방식이라, 영상 길이에 비례해 시간이
 * 걸린다. 그래서 투구 구간만 잘라 보도록 시작·끝 시각을 받는다.
 *
 * 여기는 프레임을 꺼내는 일만 한다. 계산은 analyze-frames.ts — 카메라로 바로 잴 때와
 * 같은 코드다.
 *
 * 분석 크기(짧은 변 ANALYZE_SHORT_SIDE = 720)를 그렇게 둔 까닭: 원본 그대로 훑으면 브라우저가
 * 버벅인다. 너무 줄이면 멀어진 공이 몇 픽셀로 뭉개져 감지 한계에 걸리므로, 둘 사이에서
 * 720 을 쓴다. 지름을 원본 기준으로 되돌릴 때 이 배율을 함께 곱하므로 결과가 달라지지는
 * 않는다.
 */

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
  /** 공이 멀어지나(투수 뒤, 기본) 다가오나(포수 뒤) */
  approach?: Approach;
  /** 공으로 보정한 초점거리(긴 변 픽셀당) — 있으면 화각 대신 쓴다 */
  focalPerLongSide?: number | null;
  /** 포수 뒤: 카메라에서 릴리스 지점까지(m) — 릴리스 구속을 되돌릴 때 */
  releaseDistanceM?: number | null;
};

function waitForEvent(
  el: HTMLVideoElement,
  event: string,
  ms: number
): Promise<boolean> {
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

export async function analyzeVideo(options: AnalyzeOptions): Promise<AnalyzeResult> {
  const {
    file,
    startSec = 0,
    endSec,
    fovDeg = DEFAULT_FOV_DEG,
    onProgress,
    approach = 'receding',
    focalPerLongSide = null,
    releaseDistanceM = null,
  } = options;

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

    const scale = analyzeScale(sourceW, sourceH);
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
     * 브라우저는 영상의 실제 fps를 알려주지 않는다. 그래서 흔한 촬영 프레임(240fps)
     * 까지 담을 수 있게 촘촘히 훑고, 같은 장면이 두 번 나오면 걸러낸다(analyzeFrames).
     */
    const from = Math.max(0, startSec);
    const to = Math.min(endSec ?? video.duration, video.duration);
    const span = Math.max(0, to - from);
    if (span <= 0) throw new Error('분석할 구간이 없습니다.');

    const step = Math.max(span / MAX_FRAMES, 1 / 240);

    /*
     * 1) 프레임을 한 장씩 꺼내 밝기만 남겨 둔다.
     *    원본 픽셀을 다 들고 있으면 메모리를 많이 쓰므로 밝기로 줄여 보관한다.
     *    흔들림은 여기서 잰다 — 같은 장면을 걸러내기 전의 모든 장면이 기준이다.
     */
    const frames: CapturedFrame[] = [];
    let shakePx = 0;

    for (let t = from; t <= to; t += step) {
      video.currentTime = t;
      const seeked = await waitForEvent(video, 'seeked', 10_000);
      if (!seeked) break;

      ctx.drawImage(video, 0, 0, width, height);
      const luma = toLuma(ctx.getImageData(0, 0, width, height).data, width, height);

      const prev = frames[frames.length - 1];
      if (prev) {
        shakePx = Math.max(shakePx, cornerShift(prev.luma, luma, width, height));
        if (isSameFrame(prev.luma, luma)) continue;
      }

      frames.push({ t, luma });
      // 프레임 꺼내기가 전체 작업의 대부분이라 여기까지를 8할로 본다.
      onProgress?.(Math.min(0.8, ((t - from) / span) * 0.8));
    }

    /*
     * 2) 배경 장면을 구간 밖에서도 몇 장 더 가져온다. 던지기 전 장면에는 공이 아예
     *    없어 가장 깨끗한 배경이 된다.
     */
    const backgroundSamples: Float32Array[] = [];
    for (const t of [0, video.duration * 0.5, Math.max(0, video.duration - 0.05)]) {
      if (t >= from && t <= to) continue; // 구간 안은 이미 있다
      video.currentTime = t;
      if (!(await waitForEvent(video, 'seeked', 10_000))) continue;
      ctx.drawImage(video, 0, 0, width, height);
      backgroundSamples.push(
        toLuma(ctx.getImageData(0, 0, width, height).data, width, height)
      );
    }
    onProgress?.(0.85);

    const result = analyzeFrames({
      frames,
      backgroundSamples,
      width,
      height,
      sourceWidth: sourceW,
      sourceHeight: sourceH,
      fovDeg,
      focalPx: focalPerLongSide
        ? focalPerLongSide * Math.max(sourceW, sourceH)
        : undefined,
      shakePx,
      approach,
      releaseDistanceM,
    });
    onProgress?.(1);
    return result;
  } finally {
    video.src = '';
    URL.revokeObjectURL(url);
  }
}
