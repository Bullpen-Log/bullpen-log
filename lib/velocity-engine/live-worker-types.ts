/**
 * 실시간 측정 워커 둘(live-meter.worker.ts · live-analyze.worker.ts)과 화면 스레드(live-capture.ts)가 주고받는 말. 타입만.
 */
import type { Approach } from './analyze-frames.ts';
import type {
  CaptureJob,
  LiveAnalyzeResult,
  LiveCamera,
  MeterStatus,
  PackedJob,
} from './live-meter.ts';

/** 화면 스레드가 정하는 측정 설정 — 장면 크기는 워커가 장면에서 안다 */
export type LiveSettings = {
  fovDeg: number;
  /** 렌즈 보정(긴 변 픽셀당 초점거리). 없으면 화각 */
  focalPerLongSide: number | null;
  approach: Approach;
  releaseDistanceM: number | null;
  /** 카메라가 알려 준 줌(모르면 null) */
  zoom: number | null;
  /** 수동 모드 — 공 하나를 담으면 멈춘다 */
  manual: boolean;
  /** 엔진 2.0 의 거리 자(m, live-meter.ts LiveCamera.distanceM) — 있으면 거리로 재고 담기도 길게(DISTANCE_METER_CONFIG) */
  distanceM: number | null;
  /** 카메라가 아래로 숙인 각(라디안) — 폰 기울기 센서 */
  tiltRad: number | null;
};

/** 한 번에 계산 워커에 쌓아 둘 공 — 넘으면 새로 담은 공을 버린다(공 하나가 50~86MB 라 느린 폰에서 쌓이면 메모리가 모자란다) */
export const MAX_JOBS_IN_FLIGHT = 2;

export type MeterWorkerIn =
  | { type: 'init'; settings: LiveSettings; port: MessagePort }
  | { type: 'settings'; settings: Partial<LiveSettings> }
  | { type: 'stream'; readable: ReadableStream<VideoFrame> }
  | { type: 'track'; track: MediaStreamTrack }
  | {
      type: 'frame';
      t: number;
      buf: ArrayBuffer;
      width: number;
      height: number;
      sourceWidth: number;
      sourceHeight: number;
    }
  | { type: 'arm' }
  | { type: 'disarm' }
  /** 카메라 장면 직접 받기를 그만둔다(화면 스레드 길로 바꿀 때) — 워커가 자기 트랙을 끈다 */
  | { type: 'stop-stream' }
  /** 다음 장면 하나를 돌리기 전(원래 방향) 밝기로 보내 달라 — 화면과 방향이 다를 때 몇 도 돌릴지 화면 스레드가 고른다 */
  | { type: 'probe' }
  /** 장면을 이만큼(도) 더 돌린다 — 장면이 돌림 정보 없이 올 때(화면과 방향이 다름) */
  | { type: 'rotate'; deg: number }
  | { type: 'stop' };

export type MeterWorkerOut =
  | { type: 'hello' }
  | { type: 'status'; status: MeterStatus }
  | { type: 'fps'; fps: number }
  | { type: 'captured'; id: number; triggerT: number; frames: number }
  /** 담았지만 계산이 밀려(MAX_JOBS_IN_FLIGHT) 버렸다 */
  | { type: 'dropped'; id: number; triggerT: number }
  /** 'probe' 의 답 — 돌리기 전 밝기(분석 크기) */
  | { type: 'probe'; luma: Uint8Array; width: number; height: number; rotation: number }
  | {
      type: 'dims';
      sourceWidth: number;
      sourceHeight: number;
      width: number;
      height: number;
    }
  | {
      type: 'frameinfo';
      format: string;
      coded: [number, number];
      visible: [number, number, number, number];
      rotation: number;
      colorSpace: {
        primaries: string | null;
        transfer: string | null;
        matrix: string | null;
        fullRange: boolean | null;
      } | null;
    }
  | { type: 'stream-failed'; reason: string }
  | {
      type: 'stats';
      frames: number;
      procAvgMs: number | null;
      procMaxMs: number;
      mode: 'stream' | 'frames';
    };

/** 계산 워커 → 측정 워커(MessagePort): 공 하나 계산이 끝났다(대기열 세기) */
export type AnalyzeWorkerDone = { type: 'done'; id: number };

export type AnalyzeWorkerIn =
  | {
      type: 'job';
      job: CaptureJob;
      camera: LiveCamera;
      postedAt: number;
    }
  /** 장면을 버퍼 하나에 모아 넘긴 일감(live-meter.ts packJob) — 버퍼는 transfer 로 와서 복사가 없다 */
  | {
      type: 'packed';
      job: PackedJob;
      camera: LiveCamera;
      postedAt: number;
    };

export type AnalyzeWorkerOut =
  | { type: 'hello' }
  | {
      type: 'result';
      id: number;
      triggerT: number;
      result: LiveAnalyzeResult;
      analyzeMs: number;
      waitMs: number;
    }
  | { type: 'error'; id: number; triggerT: number; message: string };
