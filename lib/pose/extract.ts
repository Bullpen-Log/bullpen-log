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

type Vision = typeof import('@mediapipe/tasks-vision');

let filesetPromise: Promise<{
  vision: Vision;
  fileset: Awaited<ReturnType<Vision['FilesetResolver']['forVisionTasks']>>;
}> | null = null;

/** 실행 파일(wasm)은 한 번만 내려받아 재사용한다. */
function loadFileset() {
  filesetPromise ??= (async () => {
    const vision = await import('@mediapipe/tasks-vision');
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
    return { vision, fileset };
  })();
  return filesetPromise;
}

/**
 * 엔진은 영상마다 새로 만들고 끝나면 버린다.
 *
 * 재사용하면 (1) timestamp가 이전 영상보다 작아져 그래프가 죽고,
 * (2) 이전 영상의 추적 상태가 새어 들어와 같은 영상인데 분석 순서에 따라
 * 결과가 미세하게 달라진다. 모델 파일은 브라우저가 캐시하므로 새로 만드는
 * 비용은 1초 남짓이고, 대신 같은 영상이면 언제나 같은 결과가 나온다.
 */
async function createLandmarker(delegate: 'GPU' | 'CPU') {
  const { vision, fileset } = await loadFileset();
  const landmarker: Landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
  return {
    landmarker,
    connections: vision.PoseLandmarker.POSE_CONNECTIONS.map((c) => ({
      start: c.start,
      end: c.end,
    })),
  };
}

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
};

/**
 * 원하는 시각으로 이동하고 **그 프레임이 실제로 그려질 때까지** 기다린다.
 *
 * seeked 이벤트는 브라우저(특히 Safari)에서 새 프레임이 화면에 준비되기
 * 전에 먼저 올 수 있다. 그 상태에서 관절을 읽으면 매번 이전(첫) 장면을
 * 분석해 스켈레톤이 처음 자세에 고정되는 사고가 난다. 프레임 표시를
 * 보장하는 requestVideoFrameCallback을 기다려 이를 막는다.
 */
function seekTo(video: VideoWithFrameCallback, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onSeeked = () => {
      if (typeof video.requestVideoFrameCallback === 'function') {
        video.requestVideoFrameCallback(finish);
        // 같은 프레임으로의 이동 등 콜백이 안 오는 예외 상황 대비
        setTimeout(finish, 300);
      } else {
        finish();
      }
    };
    const onError = () => {
      if (settled) return;
      settled = true;
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
 * 사람을 놓친 프레임이 이 비율보다 많으면 GPU가 조용히 오작동하는
 * 기기로 보고 CPU로 한 번 더 시도한다. (일부 GPU·브라우저 조합에서
 * 오류 없이 빈 결과만 계속 나오는 사례가 있다)
 */
const RETRY_COVERAGE = 0.7;

/** 엔진 하나로 영상을 처음부터 끝까지 훑는다. */
async function scanVideo(
  landmarker: Landmarker,
  video: HTMLVideoElement,
  duration: number,
  step: number,
  onProgress: (ratio: number) => void,
  signal?: AbortSignal
) {
  const frames: PoseFrame[] = [];
  let qualitySum = 0;
  let qualityCount = 0;
  let sampled = 0;

  // timestamp는 단조 증가해야 해서 소수점 오차를 피해 정수 ms를 쓴다.
  // (엔진을 영상마다 새로 만들므로 0부터 시작해도 안전하다)
  for (let i = 0; i * step <= duration; i++) {
    if (signal?.aborted) throw new Error('분석이 취소되었습니다.');

    const t = i * step;
    await seekTo(video, t);
    const result = landmarker.detectForVideo(video, Math.round(t * 1000) + 1);
    const landmarks = result.landmarks[0];
    sampled++;

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

  return {
    frames,
    quality: qualityCount ? qualitySum / qualityCount : 0,
    coverage: sampled > 0 ? frames.length / sampled : 0,
  };
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

    // 1차: GPU (기기가 지원하지 않으면 생성 단계에서 CPU로)
    let usedGpu = true;
    let engine: Awaited<ReturnType<typeof createLandmarker>>;
    try {
      engine = await createLandmarker('GPU');
    } catch {
      engine = await createLandmarker('CPU');
      usedGpu = false;
    }

    let scan: Awaited<ReturnType<typeof scanVideo>>;
    try {
      scan = await scanVideo(engine.landmarker, video, duration, step, onProgress, signal);
    } finally {
      engine.landmarker.close();
    }

    // GPU가 오류 없이 빈 결과만 내는 기기가 있다 — 커버리지가 낮으면 CPU로 재시도.
    if (usedGpu && scan.coverage < RETRY_COVERAGE) {
      const cpu = await createLandmarker('CPU');
      try {
        const retry = await scanVideo(cpu.landmarker, video, duration, step, onProgress, signal);
        if (retry.frames.length > scan.frames.length) scan = retry;
      } finally {
        cpu.landmarker.close();
      }
    }

    if (scan.frames.length === 0) {
      throw new Error(
        '영상에서 사람을 인식하지 못했습니다. 전신이 나오게, 밝은 곳에서 찍힌 영상인지 확인해주세요.'
      );
    }

    return {
      frames: scan.frames,
      connections: engine.connections,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      sampleStep: step,
      quality: scan.quality,
      coverage: scan.coverage,
    };
  } catch (err) {
    // 우리가 만든 한국어 안내문은 그대로 올려보낸다.
    if (err instanceof Error && /[가-힣]/.test(err.message)) throw err;
    // 그 외(MediaPipe 내부 오류 등)는 사람이 읽을 안내로 바꾼다.
    throw new Error('분석 도구에 문제가 생겨 중단됐습니다. 한 번 더 눌러 다시 시도해주세요.');
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
