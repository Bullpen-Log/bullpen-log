import type { AnalyzeResult, Approach } from '@/lib/velocity-engine/analyze-frames';

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
  v: 2;
  /** 거리 자 — 'limb'(윤곽, 1.6.0) · 'area'(면적, 1.5.0 까지와 시험용) */
  ruler: 'limb' | 'area' | null;
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
};

export function analysisOf(result: AnalyzeResult, approach: Approach): AnalysisJson {
  const m = result.measure;
  const d = result.diameter;
  return {
    v: 2,
    ruler: d ? d.ruler : null,
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
  };
}
