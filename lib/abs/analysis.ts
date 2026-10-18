/**
 * ABS 저장 모양(`VelocityPitch.analysis.abs`)과 판정 흐름 — 측정 직후(judgePitch)와 저장된 자료로 다시 판정(absFromAnalysis)이 같은 길을 쓴다.
 *
 * 엔진은 맞춘 궤적을 `distance.fit`(FitSnapshot: 매개변수 7 · te · 공기저항 배율 · 숙임 · 분석 카메라 · 공분산)으로 남기고, ABS 는 그것만으로 궤적을
 * 다시 돌린다(trajectoryState) — 영상 없이 신장 · 규칙을 바꿔 재판정할 수 있다('다음 타자' 뒤 고치기).
 */
import { trajectoryState, type FitOptions, type TrajectoryFit } from '../velocity-engine/trajectory-fit.ts';
import { calibFromPlate, type Calib, type CalibInput } from './calib.ts';
import { findCrossing } from './cross.ts';
import { ballSizeCue, fuseDepth, inputCue, mittCue, type DepthCue } from './depth.ts';
import { classifyPitch, type Obs, type PitchEvent } from './events.ts';
import { judge, type Verdict } from './judge.ts';
import { type Bands, DEFAULT_BANDS, RULES, type RuleSetId } from './rules.ts';
import { judgePlaneZ, zoneWorld } from './zone.ts';

/** 엔진이 결과에 남기는 맞춘 궤적 — lib/velocity-engine/analyze-distance.ts 가 채운다 */
export type FitSnapshot = {
  /** [X(te), Y(te), vx, vy, vz, ax, ay] 정규 단위 */
  p: number[];
  te: number;
  dragScaleM: number;
  tiltRad: number;
  /** 분석 px 핀홀 카메라 */
  cam: { f: number; cx: number; cy: number };
  /** 7×7 공분산 — 없으면 null */
  cov: number[][] | null;
};

export type AbsCalibJson = CalibInput & { plateDepthM: number; cameraHeightM: number; lateralOffsetM: number };

export type AbsAnalysis = {
  v: 1;
  rule: RuleSetId;
  heightCm: number;
  /** 세션 안 타자 번호(1부터) — '다음 타자' 마다 +1 */
  batter: number;
  calib: AbsCalibJson;
  depth: { D: number; sigma: number; cues: DepthCue[] };
  cross: {
    t: number;
    x: number;
    y: number;
    z: number;
    sigmaX: number;
    sigmaY: number;
    frameGap: number;
    extrapolated: boolean;
  } | null;
  event: PitchEvent;
  verdict: Verdict | null;
  bands: Bands;
  drift: { movedPx: number; recalibrated: boolean };
  /** 못 판정한 까닭(통과 못 함 · 깊이 없음) */
  reason: string | null;
};

export type JudgeInput = {
  fit: FitSnapshot;
  /** 엔진 끝 판정 · 공 크기 거리 · 사용자가 넣은 거리(있으면) */
  impact: 'rebound' | 'end';
  sizeDistM: number | null;
  inputDistM?: number | null;
  /** 맞춤에 쓴 관측(분석 px) */
  obs: Obs[];
  calib: CalibInput;
  heightCm: number;
  rule: RuleSetId;
  batter: number;
  bands?: Bands;
  drift?: { movedPx: number; recalibrated: boolean };
  /** 공 지름(원본 px) — 믿음용 */
  ballDiamPx?: number | null;
};

/** 스냅샷 → 엔진과 같은 TrajectoryFit 꼴(positionAt · velocityAt · project) */
export function fitFromSnapshot(s: FitSnapshot): { fit: TrajectoryFit; opts: FitOptions } {
  const opts: FitOptions = { dragScaleM: s.dragScaleM, tilt: s.tiltRad };
  const state = (t: number) => trajectoryState(s.p, s.te, t, opts);
  const fit: TrajectoryFit = {
    p: s.p,
    te: s.te,
    cost: 0,
    rms: 0,
    resid: [],
    project: (t) => {
      const st = state(t);
      return [s.cam.cx + (s.cam.f * st[0]) / st[2], s.cam.cy + (s.cam.f * st[1]) / st[2], st[2]];
    },
    velocityAt: (t) => {
      const st = state(t);
      return [st[3], st[4], st[5]];
    },
    positionAt: (t) => {
      const st = state(t);
      return [st[0], st[1], st[2]];
    },
    covariance: s.cov,
  };
  return { fit, opts };
}

function calibJson(input: CalibInput, c: Calib): AbsCalibJson {
  return { ...input, plateDepthM: c.plateDepthM, cameraHeightM: c.cameraHeightM, lateralOffsetM: c.lateralOffsetM };
}

/** 측정 직후 판정 — 결과의 abs 칸을 만든다 */
export function judgePitch(input: JudgeInput): AbsAnalysis {
  const rule = RULES[input.rule];
  const bands = input.bands ?? DEFAULT_BANDS;
  const calib = calibFromPlate(input.calib);
  const base: Omit<AbsAnalysis, 'depth' | 'cross' | 'event' | 'verdict' | 'reason'> = {
    v: 1,
    rule: input.rule,
    heightCm: input.heightCm,
    batter: input.batter,
    calib: calibJson(input.calib, calib),
    bands,
    drift: input.drift ?? { movedPx: 0, recalibrated: false },
  };
  const cues: DepthCue[] = [mittCue(calib, input.impact)];
  const b = ballSizeCue(input.sizeDistM);
  if (b) cues.push(b);
  const u = inputCue(input.inputDistM);
  if (u) cues.push(u);
  const depth = fuseDepth(cues);
  if (!Number.isFinite(depth.D)) {
    return { ...base, depth, cross: null, event: 'unknown', verdict: null, reason: '깊이 단서가 없어요' };
  }
  const { fit, opts } = fitFromSnapshot(input.fit);
  const box = zoneWorld(input.heightCm, rule);
  const zPlane = judgePlaneZ(box, rule);
  const times = input.obs.map((o) => o.t);
  const c = findCrossing(fit, opts, depth.D, depth.sigma, calib.pose, zPlane, times.length ? times : [fit.te - 0.3, fit.te]);
  if (c.t == null) {
    return {
      ...base,
      depth,
      cross: null,
      event: 'unknown',
      verdict: null,
      reason: c.reason === 'not-reached' ? '공이 플레이트까지 안 갔어요' : '공이 이미 플레이트를 지난 뒤였어요',
    };
  }
  const frameSec = medianStep(times) || 1 / 60;
  const event = input.obs.length
    ? classifyPitch(input.obs, (t) => {
        const [pu, pv] = fit.project(t);
        return [pu, pv];
      }, c.t, frameSec)
    : 'unknown';
  const crossJson = {
    t: c.t,
    x: c.point[0],
    y: c.point[1],
    z: c.point[2],
    sigmaX: c.sigmaX,
    sigmaY: c.sigmaY,
    frameGap: c.frameGap,
    extrapolated: c.extrapolated,
  };
  if (event === 'contact') return { ...base, depth, cross: crossJson, event, verdict: null, reason: null };
  const verdict = judge(c, box, rule, bands, {
    calibResidualPx: null,
    depthCuesAgreeing: depth.cues.filter((x) => x.used).length,
    ballDiamPx: input.ballDiamPx ?? null,
  });
  return { ...base, depth, cross: crossJson, event, verdict, reason: null };
}

/** 저장된 분석으로 다시 판정 — 신장 · 규칙을 바꿔도 영상 없이 */
export function absFromAnalysis(
  analysis: { distance?: { fit?: FitSnapshot | null; impact?: 'rebound' | 'end'; sizeDistM?: number | null; inputDistM?: number | null } | null; track?: number[][] | null; abs?: AbsAnalysis | null },
  heightCm: number,
  rule: RuleSetId,
  bands?: Bands
): AbsAnalysis | null {
  const prev = analysis.abs;
  const fit = analysis.distance?.fit;
  if (!prev || !fit) return null;
  const obs: Obs[] = (analysis.track ?? []).filter((r) => Array.isArray(r) && r.length >= 3).map((r) => ({ t: r[0], u: r[1], v: r[2] }));
  return judgePitch({
    fit,
    impact: analysis.distance?.impact ?? 'end',
    sizeDistM: analysis.distance?.sizeDistM ?? null,
    inputDistM: analysis.distance?.inputDistM ?? null,
    obs,
    calib: prev.calib,
    heightCm,
    rule,
    batter: prev.batter,
    bands: bands ?? prev.bands,
    drift: prev.drift,
  });
}

/** 서버 저장 전 숫자만 걸러 담는다(lib/velocity-sync.ts sanitizeAnalysis 가 부른다) */
export function sanitizeAbs(raw: unknown): AbsAnalysis | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const rule = a.rule === 'mlb-2026' ? 'mlb-2026' : 'kbo-2025';
  const heightCm = n(a.heightCm);
  const calib = a.calib as Record<string, unknown> | undefined;
  const px = (v: unknown): [number, number] | null =>
    Array.isArray(v) && v.length === 2 && n(v[0]) != null && n(v[1]) != null ? [r3(v[0] as number), r3(v[1] as number)] : null;
  if (heightCm == null || !calib) return null;
  const fl = px(calib.frontLeft);
  const fr = px(calib.frontRight);
  const f = n(calib.focalPx);
  const w = n(calib.width);
  const h = n(calib.height);
  const tilt = n(calib.tiltDown);
  if (!fl || !fr || f == null || w == null || h == null || tilt == null) return null;
  const depth = a.depth as Record<string, unknown> | undefined;
  const cuesRaw = Array.isArray(depth?.cues) ? depth!.cues : [];
  const cues: DepthCue[] = cuesRaw
    .map((c) => {
      const o = c as Record<string, unknown>;
      const D = n(o.D);
      const sigma = n(o.sigma);
      const kind = o.kind;
      if (D == null || sigma == null || typeof kind !== 'string') return null;
      return { kind: kind as DepthCue['kind'], D: r3(D), sigma: r3(sigma), used: o.used === true };
    })
    .filter((c): c is DepthCue => !!c)
    .slice(0, 6);
  const cr = a.cross as Record<string, unknown> | null | undefined;
  const cross =
    cr && n(cr.t) != null && n(cr.x) != null && n(cr.y) != null
      ? {
          t: Math.round((cr.t as number) * 10000) / 10000,
          x: r3(cr.x as number),
          y: r3(cr.y as number),
          z: r3(n(cr.z) ?? 0),
          sigmaX: r3(n(cr.sigmaX) ?? 0),
          sigmaY: r3(n(cr.sigmaY) ?? 0),
          frameGap: r3(n(cr.frameGap) ?? 0),
          extrapolated: cr.extrapolated === true,
        }
      : null;
  const vd = a.verdict as Record<string, unknown> | null | undefined;
  const verdict: Verdict | null =
    vd && (vd.call === 'strike' || vd.call === 'ball')
      ? {
          call: vd.call,
          cell: n(vd.cell) != null && (vd.cell as number) >= 1 && (vd.cell as number) <= 9 ? Math.round(vd.cell as number) : null,
          dxCm: r3(n(vd.dxCm) ?? 0),
          dyCm: r3(n(vd.dyCm) ?? 0),
          edgeCm: r3(n(vd.edgeCm) ?? 0),
          borderline: vd.borderline === true,
          confidence: vd.confidence === 'high' || vd.confidence === 'low' ? vd.confidence : 'medium',
          reasons: Array.isArray(vd.reasons) ? vd.reasons.filter((x): x is string => typeof x === 'string').slice(0, 4).map((x) => x.slice(0, 60)) : [],
        }
      : null;
  const bands = a.bands as Record<string, unknown> | undefined;
  const drift = a.drift as Record<string, unknown> | undefined;
  return {
    v: 1,
    rule,
    heightCm: Math.round(heightCm),
    batter: Math.max(1, Math.round(n(a.batter) ?? 1)),
    calib: {
      frontLeft: fl,
      frontRight: fr,
      focalPx: r3(f),
      width: Math.round(w),
      height: Math.round(h),
      tiltDown: Math.round(tilt * 100000) / 100000,
      roll: n(calib.roll) != null ? Math.round((calib.roll as number) * 100000) / 100000 : 0,
      plateDepthM: r3(n(calib.plateDepthM) ?? 0),
      cameraHeightM: r3(n(calib.cameraHeightM) ?? 0),
      lateralOffsetM: r3(n(calib.lateralOffsetM) ?? 0),
    },
    depth: { D: r3(n(depth?.D) ?? NaN), sigma: r3(n(depth?.sigma) ?? NaN), cues },
    cross,
    event: a.event === 'contact' || a.event === 'unknown' ? a.event : 'pitch',
    verdict,
    bands: { lateralCm: n(bands?.lateralCm) ?? DEFAULT_BANDS.lateralCm, verticalCm: n(bands?.verticalCm) ?? DEFAULT_BANDS.verticalCm },
    drift: { movedPx: r3(n(drift?.movedPx) ?? 0), recalibrated: drift?.recalibrated === true },
    reason: typeof a.reason === 'string' ? a.reason.slice(0, 60) : null,
  };
}

/** 엔진 스냅샷도 숫자만(sanitizeDistance 가 부른다) */
export function sanitizeFitSnapshot(raw: unknown): FitSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  if (!Array.isArray(s.p) || s.p.length !== 7 || !s.p.every((x) => n(x) != null)) return null;
  const te = n(s.te);
  const drag = n(s.dragScaleM);
  const cam = s.cam as Record<string, unknown> | undefined;
  const f = n(cam?.f);
  const cx = n(cam?.cx);
  const cy = n(cam?.cy);
  if (te == null || drag == null || f == null || cx == null || cy == null) return null;
  const cov =
    Array.isArray(s.cov) && s.cov.length === 7 && s.cov.every((row) => Array.isArray(row) && row.length === 7 && row.every((x) => n(x) != null))
      ? (s.cov as number[][]).map((row) => row.map((x) => Number(x.toPrecision(6))))
      : null;
  return {
    p: (s.p as number[]).map((x) => Number(x.toPrecision(9))),
    te: Math.round(te * 100000) / 100000,
    dragScaleM: Math.round(drag * 1000) / 1000,
    tiltRad: Math.round((n(s.tiltRad) ?? 0) * 100000) / 100000,
    cam: { f: Math.round(f * 100) / 100, cx: Math.round(cx * 100) / 100, cy: Math.round(cy * 100) / 100 },
    cov,
  };
}

function medianStep(times: number[]): number {
  if (times.length < 2) return 0;
  const s = times.slice().sort((a, b) => a - b);
  const d = s.slice(1).map((t, i) => t - s[i]).sort((a, b) => a - b);
  return d[d.length >> 1];
}
