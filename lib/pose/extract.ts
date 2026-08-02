'use client';

import {
  CORE_LANDMARKS,
  type PoseFrame,
  type PoseTrack,
} from '@/lib/pose/types';

/**
 * 브라우저에서 영상을 프레임 단위로 훑으며 관절 좌표를 뽑는다.
 *
 * 영상은 어디로도 전송되지 않는다 — 모델(약 9MB)과 실행 파일만
 * 처음 한 번 내려받아 기기 안에서 돌린다. 서버 비용도 0원이다.
 */

/** 라이브러리 버전을 고정해 갑작스러운 동작 변화를 막는다. */
const TASKS_VISION_VERSION = '1.0.1';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

/** 재생 1초당 몇 프레임을 분석할지. 30이면 일반 영상의 모든 프레임. */
const SAMPLES_PER_SECOND = 30;

/** 너무 긴 영상은 여기까지만 분석한다(초). */
const MAX_ANALYZE_SECONDS = 40;

/**
 * 전체 분석 프레임 수 상한. 슬로모 영상은 재생 시간이 길어서
 * 초당 프레임을 조금 줄여도 실제 동작 기준으로는 충분히 촘촘하다.
 */
const MAX_TOTAL_SAMPLES = 600;

type Landmarker = {
  detectForVideo: (
    video: HTMLVideoElement,
    timestampMs: number
  ) => { landmarks: { x: number; y: number; z: number; visibility: number }[][] };
  close: () => void;
};

let landmarkerPromise: Promise<{
  landmarker: Landmarker;
  connections: { start: number; end: number }[];
}> | null = null;

/** 모델을 한 번만 내려받아 재사용한다. GPU가 안 되면 CPU로 물러선다. */
function loadLandmarker() {
  landmarkerPromise ??= (async () => {
    const vision = await import('@mediapipe/tasks-vision');
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);

    const create = (delegate: 'GPU' | 'CPU') =>
      vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
      });

    let landmarker: Landmarker;
    try {
      landmarker = await create('GPU');
    } catch {
      landmarker = await create('CPU');
    }

    return {
      landmarker,
      connections: vision.PoseLandmarker.POSE_CONNECTIONS.map((c) => ({
        start: c.start,
        end: c.end,
      })),
    };
  })();
  return landmarkerPromise;
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('영상 탐색에 실패했습니다.'));
    };
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.currentTime = t;
  });
}

/**
 * 영상 전체를 훑어 관절 좌표 시계열을 만든다.
 * onProgress는 0~1 진행률을 받는다.
 */
export async function extractPoseTrack(
  src: string,
  onProgress: (ratio: number) => void,
  signal?: AbortSignal
): Promise<PoseTrack> {
  const { landmarker, connections } = await loadLandmarker();

  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = src;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('영상을 열 수 없습니다.'));
    });

    const duration = Math.min(
      Number.isFinite(video.duration) ? video.duration : 0,
      MAX_ANALYZE_SECONDS
    );
    if (duration <= 0) throw new Error('영상 길이를 읽을 수 없습니다.');

    const perSecond = Math.min(
      SAMPLES_PER_SECOND,
      Math.max(10, Math.floor(MAX_TOTAL_SAMPLES / duration))
    );
    const step = 1 / perSecond;
    const frames: PoseFrame[] = [];
    let qualitySum = 0;
    let qualityCount = 0;

    // detectForVideo의 timestamp는 단조 증가해야 해서 소수점 오차를 피해 정수 ms를 쓴다.
    for (let i = 0; i * step <= duration; i++) {
      if (signal?.aborted) throw new Error('분석이 취소되었습니다.');

      const t = i * step;
      await seekTo(video, t);
      const result = landmarker.detectForVideo(video, Math.round(t * 1000) + 1);
      const landmarks = result.landmarks[0];

      if (landmarks && landmarks.length >= 33) {
        frames.push({
          t,
          landmarks: landmarks.map((p) => ({
            x: p.x,
            y: p.y,
            z: p.z,
            visibility: p.visibility,
          })),
        });
        for (const idx of CORE_LANDMARKS) {
          qualitySum += landmarks[idx]?.visibility ?? 0;
          qualityCount++;
        }
      }

      onProgress(Math.min(1, t / duration));
    }

    if (frames.length === 0) {
      throw new Error(
        '영상에서 사람을 인식하지 못했습니다. 전신이 나오게, 밝은 곳에서 찍힌 영상인지 확인해주세요.'
      );
    }

    return {
      frames,
      connections,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      sampleStep: step,
      quality: qualityCount ? qualitySum / qualityCount : 0,
    };
  } finally {
    video.src = '';
  }
}

/** 특정 시각에 가장 가까운 프레임을 찾는다 (재생 오버레이용). */
export function frameAt(track: PoseTrack, t: number): PoseFrame | null {
  const { frames } = track;
  if (frames.length === 0) return null;

  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  // lo는 t 이상인 첫 프레임 — 바로 앞 프레임과 더 가까운 쪽을 고른다.
  if (lo > 0 && t - frames[lo - 1].t < frames[lo].t - t) return frames[lo - 1];
  return frames[lo];
}
