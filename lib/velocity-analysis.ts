import type { AnalyzeResult, Approach } from '@/lib/velocity-engine/analyze-frames';
import type { DistanceReport } from '@/lib/velocity-engine/analyze-distance';
import type { FrameTiming, LiveReport } from '@/lib/velocity-engine/live-meter';
import type { ZoneRect } from '@/lib/velocity-setup';

/**
 * 엔진이 본 자료를 DB(VelocityPitch.analysis)에 남길 모양으로 — 영상 없이도 다시 맞춰 볼 수 있게.
 *
 * 궤적은 [t, x, y, 지름] 배열(분석 해상도 픽셀, 지름은 다시 잰 값)로 줄여 담는다. 원본 해상도로
 * 되돌리려면 sourceSize.width / analyzeSize.width 를 곱한다. focalPx 는 원본 긴 변 기준.
 * 서버는 lib/velocity-sync.ts 의 sanitizeAnalysis 로 숫자만 걸러 저장한다.
 *
 * v2(모델 1.6.0): 궤적의 지름이 윤곽 자(빛 받은 쪽 테두리의 원)로 바뀌었다 — 1.5.0 까지의 면적 지름과 배율이 달라
 * 섞어 다시 맞추면 안 된다. 그래서 어느 자로 쟀나(ruler) · 가장자리 폭 · 흐림 보정 · 잭나이프 SE 를 같이 싣는다.
 */
export type AnalysisJson = {
  /** 2 = 모델 1.6~1.8(공 지름 자), 3 = 모델 2.0(거리 자 — distance 가 있다) */
  v: 2 | 3;
  /** 거리 자 — 'limb'(윤곽, 1.6.0) · 'area'(면적, 1.5.0 까지와 시험용) */
  ruler: 'limb' | 'area' | null;
  /**
   * 밝은 배경(하늘 · 해 받은 벽) 앞에서 공이 배경보다 어두워 두 번째 길(극성)로 잰 공만 — 'dark' · 'mixed'(지평선에 걸침) ·
   * 'bright'(넓힌 감지로 궤적만 이어짐). 다시 담은 덮임 자로 재 예전 윤곽 자와 다를 수 있어(확인 못 함) 보정 짝에 섞지 않는다.
   * 예전 길이면 null.
   */
  polarity?: 'bright' | 'dark' | 'mixed' | null;
  /** 궤적의 가장자리 폭(분석 px) · 흐림 보정으로 지름에서 뺀 값(분석 px) — 흐린 영상 되짚기 */
  edgeWidthPx: number | null;
  blurCorrectionPx: number | null;
  /** 첫 관측 시점 속도의 잭나이프 SE(km/h) */
  startSeKmh: number | null;
  track: number[][];
  analyzeSize: { width: number; height: number };
  sourceSize: { width: number; height: number };
  fps: number | null;
  shakePx: number;
  focalPx: number;
  fitQuality: number | null;
  startKmh: number | null;
  endKmh: number | null;
  frameCount: number;
  approach: Approach;
  /**
   * 카메라 실시간의 촬영 조건(모델 1.7.0) — 알림 코드(LOW_FPS · TIMING · APPROACH · CROPPED · FOV_GUESS · ZOOM · HDR · LOW_RES · BLUR · DARK_BALL) ·
   * ± 에 더한 σ · 초점거리를 렌즈 보정으로 쟀나 · 장면 시각의 질 · 장면을 받은 길(워커 직접 · 캔버스 · 화면 스레드)과 워커가 본
   * 장면(형식 · 돌림 · 크기). 영상 파일로 잰 공은 null. 실제 폰(아이폰 웹뷰)에서 어떻게 도는지 되짚으려고.
   */
  live: {
    notes: string[];
    sigmaRel: number;
    focalFromLens: boolean;
    timing: FrameTiming | null;
    pipeline: string | null;
    frame: LiveReport['frame'] | null;
  } | null;
  /**
   * 잰 순간의 스트라이크 존 — 카메라 장면 비율(0~1, lib/velocity-setup.ts ZoneRect). 영상 클립도 같은 장면이라 볼 때 그대로
   * 겹쳐 그린다(설정 '영상에 스트라이크 존 표시'). 카메라로 잰 공만 — 영상 파일 · 옛 공은 없음.
   */
  zoneRect?: ZoneRect | null;
  /**
   * 모델 2.0(거리 자, lib/velocity-engine/analyze-distance.ts) — 넣은 거리 · 숙임 · 비행 끝을 무엇으로 정했나 · 3차원/수평 속력 ·
   * 위로 던진 각. 관리자가 다시 잴 때 거리를 여기서 꺼낸다. 1.x 로 잰 공은 없음.
   */
  distance?: Omit<DistanceReport, 'seeds' | 'seedFrame' | 'timingMs' | 'shaky'> | null;
};

export function analysisOf(
  result: AnalyzeResult & { live?: LiveReport; distance?: DistanceReport },
  approach: Approach
): AnalysisJson {
  const m = result.measure;
  const d = result.diameter;
  const dist = result.distance;
  return {
    v: dist ? 3 : 2,
    distance: dist
      ? {
          method: dist.method,
          distanceM: dist.distanceM,
          tiltRad: Math.round(dist.tiltRad * 10000) / 10000,
          impact: dist.impact,
          te: dist.te != null ? Math.round(dist.te * 10000) / 10000 : null,
          flightFrames: dist.flightFrames,
          extended: dist.extended,
          rmsPx: dist.rmsPx,
          kmh3d: dist.kmh3d,
          kmhHorizontal: dist.kmhHorizontal,
          firstDepthM: dist.firstDepthM,
          launchDeg: dist.launchDeg,
          /* 원인 찾기용 — 되돌린 릴리스 자리 · 끝 크기 비 · 지름–깊이 기울기 · 흔들림 */
          releasePx: dist.releasePx,
          endSizeRatio: dist.endSizeRatio,
          sizeSlope: dist.sizeSlope,
          shakePx: dist.shakePx,
        }
      : null,
    ruler: d ? d.ruler : null,
    polarity: d?.polarity ?? null,
    edgeWidthPx: d ? d.edgeWidthPx : null,
    blurCorrectionPx: d ? d.blurCorrectionPx : null,
    startSeKmh: m.ok && Number.isFinite(m.detail.startSeKmh) ? m.detail.startSeKmh : null,
    track: result.track.map((o) => [
      Math.round(o.t * 10000) / 10000,
      Math.round(o.x * 100) / 100,
      Math.round(o.y * 100) / 100,
      Math.round(o.diameterPx * 1000) / 1000,
    ]),
    analyzeSize: result.analyzeSize,
    sourceSize: result.sourceSize,
    fps: result.fps,
    shakePx: result.shakePx,
    focalPx: result.focalPx,
    fitQuality: m.ok ? m.detail.fitQuality : null,
    startKmh: m.ok ? m.detail.startKmh : null,
    endKmh: m.ok ? m.detail.endKmh : null,
    frameCount: result.frameCount,
    approach,
    live: result.live
      ? {
          notes: result.live.notes.map((n) => n.code),
          sigmaRel: result.live.sigmaRel,
          focalFromLens: result.live.focalFrom === 'lens',
          timing: result.live.timing,
          pipeline: result.live.pipeline ?? null,
          frame: result.live.frame ?? null,
        }
      : null,
  };
}
