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

type RawLandmark = { x: number; y: number; z: number; visibility: number };

type Landmarker = {
  detectForVideo: (
    video: HTMLVideoElement,
    timestampMs: number
  ) => { landmarks: RawLandmark[][]; worldLandmarks?: RawLandmark[][] };
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

/** 화면에 실제로 표시된 프레임을 알려주는 브라우저 기능 */
type FrameMetadata = { mediaTime: number };
type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, metadata: FrameMetadata) => void) => number;
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

/**
 * 연속 프레임이 이 비율 이상 완전히 똑같으면 seek가 화면을 갱신하지
 * 못하는 브라우저(주로 Safari)로 보고 재생 캡처 방식으로 다시 분석한다.
 * 실제 영상에서는 몸이 조금이라도 움직이므로 좌표가 완전히 같을 수 없다.
 */
const STALE_FRAME_RATIO = 0.4;

type ScanResult = {
  frames: PoseFrame[];
  quality: number;
  coverage: number;
  /** 바로 앞 프레임과 좌표가 완전히 같은 프레임 수 (멈춘 화면 감지) */
  identical: number;
};

function collectFrame(
  out: ScanResult,
  t: number,
  landmarks: RawLandmark[],
  world?: RawLandmark[]
) {
  const copy = (p: RawLandmark) => ({
    x: p.x,
    y: p.y,
    z: p.z,
    visibility: p.visibility,
  });
  const frame: PoseFrame = {
    t,
    landmarks: landmarks.map(copy),
    ...(world && world.length >= 33 ? { world: world.map(copy) } : {}),
  };
  const prev = out.frames.at(-1);
  if (prev) {
    const a = prev.landmarks[LM_WRIST_R];
    const b = frame.landmarks[LM_WRIST_R];
    const c = prev.landmarks[LM_ANKLE_L];
    const d = frame.landmarks[LM_ANKLE_L];
    if (a && b && c && d && a.x === b.x && a.y === b.y && c.x === d.x && c.y === d.y) {
      out.identical++;
    }
  }
  out.frames.push(frame);
}

const LM_WRIST_R = 16;
const LM_ANKLE_L = 27;

/** 엔진 하나로 영상을 프레임 이동(seek)하며 훑는다. */
async function scanBySeek(
  landmarker: Landmarker,
  video: HTMLVideoElement,
  duration: number,
  step: number,
  onProgress: (ratio: number) => void,
  signal?: AbortSignal
): Promise<ScanResult> {
  const out: ScanResult = { frames: [], quality: 0, coverage: 0, identical: 0 };
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
      collectFrame(out, t, landmarks, result.worldLandmarks?.[0]);
      for (const idx of CORE_LANDMARKS) {
        qualitySum += landmarks[idx]?.visibility ?? 0;
        qualityCount++;
      }
    }

    onProgress(Math.min(1, t / duration));
  }

  out.quality = qualityCount ? qualitySum / qualityCount : 0;
  out.coverage = sampled > 0 ? out.frames.length / sampled : 0;
  return out;
}

/**
 * 재생이 시작되지도, 프레임이 들어오지도 않을 때 무한정 기다리지 않는다.
 * (자동재생 차단·디코딩 실패 등)
 */
const PLAYBACK_STALL_MS = 6000;

/**
 * 영상을 실제로 재생하면서 화면에 표시되는 프레임마다 관절을 읽는다.
 *
 * Safari는 seek로 프레임을 옮겨도 화면(디코딩된 프레임)이 갱신되지 않는
 * 경우가 있어 같은 장면만 반복해 읽힌다. 재생 중에는 어떤 브라우저든
 * 프레임이 반드시 갱신되므로 이 방식이 근본 해법이다.
 */
function scanByPlayback(
  landmarker: Landmarker,
  video: VideoWithFrameCallback,
  duration: number,
  onProgress: (ratio: number) => void,
  signal?: AbortSignal
): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    if (typeof video.requestVideoFrameCallback !== 'function') {
      resolve({ frames: [], quality: 0, coverage: 0, identical: 0 });
      return;
    }

    const out: ScanResult = { frames: [], quality: 0, coverage: 0, identical: 0 };
    let qualitySum = 0;
    let qualityCount = 0;
    let sampled = 0;
    let lastTs = 0;
    let finished = false;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (err?: Error) => {
      if (finished) return;
      finished = true;
      if (stallTimer) clearTimeout(stallTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      video.pause();
      video.onended = null;
      if (err) {
        reject(err);
        return;
      }
      out.quality = qualityCount ? qualitySum / qualityCount : 0;
      out.coverage = sampled > 0 ? out.frames.length / sampled : 0;
      resolve(out);
    };

    // 프레임이 한동안 안 들어오면 지금까지 모은 것으로 끝낸다
    // (실패로 처리하지 않아야 상위에서 seek 결과와 비교할 수 있다)
    const armStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      // 화면이 가려져 있으면 프레임이 안 오는 게 정상이라 시간을 재지 않는다
      if (document.hidden) return;
      stallTimer = setTimeout(() => finish(), PLAYBACK_STALL_MS);
    };

    /*
     * 다른 탭으로 넘어가면 브라우저가 프레임 표시를 늦추거나 멈춘다.
     * 그대로 두면 분석이 기어가거나 중간에 끊기므로, 가려지면 재생을
     * 멈췄다가 돌아오면 이어서 재생한다. 분석은 그 자리에서 계속된다.
     */
    const onVisibility = () => {
      if (finished) return;
      if (document.hidden) {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = null;
        video.pause();
      } else {
        armStallTimer();
        video.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const stepCb = (_now: number, metadata?: FrameMetadata) => {
      if (finished) return;
      if (signal?.aborted) return finish(new Error('분석이 취소되었습니다.'));
      armStallTimer();
      // mediaTime은 "지금 화면에 표시된 그 프레임"의 정확한 시각이다.
      // currentTime은 표시된 프레임보다 앞서 있을 수 있어 좌표-시각이 어긋난다.
      const t = metadata?.mediaTime ?? video.currentTime;
      const ts = Math.round(t * 1000) + 1;
      if (t <= duration && ts > lastTs) {
        lastTs = ts;
        sampled++;
        try {
          const result = landmarker.detectForVideo(video, ts);
          const landmarks = result.landmarks[0];
          if (landmarks && landmarks.length >= 33) {
            collectFrame(out, t, landmarks, result.worldLandmarks?.[0]);
            for (const idx of CORE_LANDMARKS) {
              qualitySum += landmarks[idx]?.visibility ?? 0;
              qualityCount++;
            }
          }
        } catch (e) {
          return finish(e instanceof Error ? e : new Error(String(e)));
        }
        onProgress(Math.min(1, t / duration));
      }
      if (video.ended || t >= duration) return finish();
      video.requestVideoFrameCallback!(stepCb);
    };

    video.onended = () => finish();
    video.currentTime = 0;
    armStallTimer();
    video.requestVideoFrameCallback(stepCb);
    // 재생이 막히면(자동재생 정책 등) 실패가 아니라 빈 결과로 끝낸다 → seek 방식으로 넘어간다
    video.play().catch(() => finish());
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

    /** 좌표가 실제로 움직인 프레임 수 — 여러 시도 중 더 나은 쪽을 고르는 기준 */
    const distinct = (s: ScanResult) => s.frames.length - s.identical;

    /*
     * 재생 캡처를 기본으로 쓴다.
     *
     * seek(프레임 이동)는 브라우저마다 동작이 달라 믿을 수 없다 —
     * Safari는 화면을 아예 갱신하지 않거나(iOS), 요청한 것보다 늦은
     * 프레임을 주기도 한다(macOS). 후자는 "멈춘 화면" 검사로도 못 걸러
     * 좌표가 실제 시각과 어긋난 채 저장된다.
     *
     * 재생 중에는 어떤 브라우저든 프레임이 반드시 갱신되고,
     * requestVideoFrameCallback이 "지금 표시된 프레임의 정확한 시각"을
     * 알려주므로 좌표와 시각이 절대 어긋나지 않는다.
     */
    const canPlaybackScan =
      typeof (video as VideoWithFrameCallback).requestVideoFrameCallback === 'function';

    let scan: ScanResult;
    try {
      scan = canPlaybackScan
        ? await scanByPlayback(
            engine.landmarker,
            video as VideoWithFrameCallback,
            duration,
            onProgress,
            signal
          )
        : await scanBySeek(engine.landmarker, video, duration, step, onProgress, signal);
    } finally {
      engine.landmarker.close();
    }

    // 재생이 막혔거나(자동재생 차단) 결과가 부실하면 seek로 한 번 더 시도한다.
    if (canPlaybackScan && (scan.frames.length === 0 || scan.coverage < RETRY_COVERAGE)) {
      const retryEngine = await createLandmarker(usedGpu ? 'GPU' : 'CPU');
      try {
        const retry = await scanBySeek(
          retryEngine.landmarker,
          video,
          duration,
          step,
          onProgress,
          signal
        );
        const stale =
          retry.frames.length > 0 && retry.identical / retry.frames.length > STALE_FRAME_RATIO;
        if (!stale && distinct(retry) > distinct(scan)) scan = retry;
      } finally {
        retryEngine.landmarker.close();
      }
    }

    // 그래도 사람을 많이 놓쳤고 GPU였다면 CPU로 마지막 한 번
    // (일부 GPU·브라우저 조합에서 오류 없이 빈 결과만 나오는 사례 대비)
    if (usedGpu && scan.coverage < RETRY_COVERAGE) {
      const cpu = await createLandmarker('CPU');
      try {
        const retry = canPlaybackScan
          ? await scanByPlayback(
              cpu.landmarker,
              video as VideoWithFrameCallback,
              duration,
              onProgress,
              signal
            )
          : await scanBySeek(cpu.landmarker, video, duration, step, onProgress, signal);
        if (distinct(retry) > distinct(scan)) scan = retry;
      } finally {
        cpu.landmarker.close();
      }
    }

    if (scan.frames.length === 0) {
      throw new Error(
        '영상에서 사람을 인식하지 못했습니다. 전신이 나오게, 밝은 곳에서 찍힌 영상인지 확인해주세요.'
      );
    }

    // 재생 캡처는 프레임 간격이 일정하지 않아 실측 중앙값을 쓴다.
    let sampleStep = step;
    if (scan.frames.length >= 2) {
      const diffs: number[] = [];
      for (let i = 1; i < scan.frames.length; i++) {
        diffs.push(scan.frames[i].t - scan.frames[i - 1].t);
      }
      diffs.sort((a, b) => a - b);
      const mid = diffs[Math.floor(diffs.length / 2)];
      if (mid > 0) sampleStep = mid;
    }

    return {
      frames: scan.frames,
      connections: engine.connections,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      sampleStep,
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
