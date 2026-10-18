'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { judgePitch, type AbsAnalysis, type FitSnapshot } from '@/lib/abs/analysis';
import { calibFromPlate, zonePolygonPx, type Calib, type CalibInput, type Pixel } from '@/lib/abs/calib';
import { findPlateFront, type PlateFind } from '@/lib/abs/plate-detect';
import { RULES, type RuleSetId } from '@/lib/abs/rules';
import { heightCmOf, loadAbsSetup, saveAbsSetup, type AbsSetup } from '@/lib/abs/setup';
import { bandsFor, driftInit, driftUpdate, type DriftState } from '@/lib/abs/stability';
import { zoneWorld } from '@/lib/abs/zone';
import { DEFAULT_BANDS } from '@/lib/abs/rules';
import type { ZoneRect } from '@/lib/velocity-setup';

export type AbsSnapshot = { luma: Uint8Array; width: number; height: number; sourceWidth: number; sourceHeight: number };
export type PlateEnds = { left: Pixel; right: Pixel };

/** 판정에 넘기는 엔진 결과의 최소 모양(ScreenResult 가운데 쓰는 칸만) */
export type AbsJudgeSource = {
  distance?: { fit?: FitSnapshot | null; impact?: 'rebound' | 'end'; sizeDistM?: number | null; inputDistM?: number | null } | null;
  track: { t: number; x: number; y: number; diameterPx?: number }[];
  analyzeSize: { width: number; height: number };
  sourceSize: { width: number; height: number };
};

export type AbsSessionParams = {
  /** 관리자 + 설정 켜짐일 때만 돈다 */
  enabled: boolean;
  camera: { width: number; height: number } | null;
  focalPx: number | null;
  /** 숙임(라디안, 아래 +) · 좌우 기울기(라디안, 오른콽 내려가면 +) */
  tiltRad: number | null;
  rollRad: number | null;
  /** 구속 측정의 스트라이크 존(장면 비율) — 플레이트를 찾을 창의 기준 */
  zoneRect: ZoneRect | null;
  /** 플레이트 찾기 단계(0.6초마다) · 측정 중(5초마다 삼각대 감시) */
  detecting: boolean;
  live: boolean;
  snapshot: () => AbsSnapshot | null;
};

const DETECT_MS = 600;
const DRIFT_MS = 5000;

/**
 * ABS 세션 상태 — 설정(규칙 · 신장) · 타자 번호 · 플레이트 앞변(자동 · 직접) · 보정 · 삼각대 감시 · 판정 함수.
 * 측정 화면(velocity-screen.tsx)이 쥐고, 결과가 올 때 judge() 로 analysis.abs 를 만든다. 순수 계산은 lib/abs.
 */
export function useAbsSession(p: AbsSessionParams) {
  const [setup, setSetup] = useState<AbsSetup>(() => ({ on: false, rule: 'kbo-2025', height: 'average', savedAt: '' }));
  useEffect(() => {
    /* 저장된 설정은 붙은 뒤 읽는다(서버 그림과 어긋나지 않게) — 한 박자 뒤 */
    const t = setTimeout(() => setSetup(loadAbsSetup()), 0);
    return () => clearTimeout(t);
  }, []);
  const persist = useCallback((next: Omit<AbsSetup, 'savedAt'>) => setSetup(saveAbsSetup(next)), []);
  const setOn = useCallback((on: boolean) => persist({ ...setup, on }), [persist, setup]);
  const setRule = useCallback((rule: RuleSetId) => persist({ ...setup, rule }), [persist, setup]);
  const setHeight = useCallback((height: number | 'average') => persist({ ...setup, height }), [persist, setup]);

  const [batter, setBatter] = useState(1);
  const nextBatter = useCallback(
    (height: number | 'average') => {
      setBatter((b) => b + 1);
      persist({ ...setup, height });
    },
    [persist, setup]
  );
  const heightCm = heightCmOf(setup.height);

  const [find, setFind] = useState<PlateFind | null>(null);
  const [ends, setEndsState] = useState<PlateEnds | null>(null);
  const [manual, setManual] = useState(false);
  const [drift, setDrift] = useState<DriftState | null>(null);
  const active = p.enabled && setup.on;

  /* 찾을 창(분석 px) — 존 밑(플레이트는 무릎 높이 존 아래 65px 남짓 지면) */
  const windowOf = useCallback(
    (W: number, H: number) => {
      const z = p.zoneRect;
      if (!z) return { x: W * 0.3, y: H * 0.45, w: W * 0.4, h: H * 0.3 };
      return {
        x: Math.max(0, (z.x - 0.6 * z.w) * W),
        y: Math.max(0, (z.y + 0.4 * z.h) * H),
        w: Math.min(W, 2.2 * z.w * W),
        h: Math.min(H, 2.0 * z.h * H),
      };
    },
    [p.zoneRect]
  );

  /* snapshot 은 부르는 쪽이 매번 새 함수로 넘겨도 되게 ref 에 쥔다(렌더 뒤 갱신) */
  const snapshotRef = useRef(p.snapshot);
  useEffect(() => {
    snapshotRef.current = p.snapshot;
  });
  const detectOnce = useCallback((): PlateFind | null => {
    const s = snapshotRef.current();
    if (!s) return null;
    const r = findPlateFront({ data: s.luma, width: s.width, height: s.height }, windowOf(s.width, s.height));
    if (!r.ok) return r;
    /* 분석 px → 원본 px */
    const k = s.sourceWidth / s.width;
    return { ...r, left: [r.left[0] * k, r.left[1] * k], right: [r.right[0] * k, r.right[1] * k], thickness: r.thickness * k };
  }, [windowOf]);

  /* 찾기 단계 — 0.6초마다, 직접 맞추기 중이 아니면 찾은 것으로 끝을 바꾼다 */
  const detectNow = useCallback(() => {
    const r = detectOnce();
    if (!r) return;
    setFind(r);
    if (r.ok && !manual) setEndsState({ left: r.left, right: r.right });
  }, [detectOnce, manual]);
  useEffect(() => {
    if (!active || !p.detecting) return;
    const first = setTimeout(detectNow, 0);
    const id = setInterval(detectNow, DETECT_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active, p.detecting, detectNow]);

  /* 측정 중 삼각대 감시 — 5초마다 다시 찾아 처음 자리와 견준다(못 찾으면 그냥 넘김) */
  const refRef = useRef<PlateEnds | null>(null);
  useEffect(() => {
    if (!active || !p.live || !ends) return;
    if (!refRef.current) {
      refRef.current = ends;
      const init = driftInit({ ok: true, left: ends.left, right: ends.right, thickness: 0, score: 1, reason: null }, Date.now());
      setTimeout(() => setDrift(init), 0);
    }
    const id = setInterval(() => {
      const r = detectOnce();
      if (!r) return;
      setDrift((d) => (d ? driftUpdate(d, r, Date.now()) : d));
    }, DRIFT_MS);
    return () => clearInterval(id);
  }, [active, p.live, ends, detectOnce]);

  const setEnds = useCallback((e: PlateEnds | null) => {
    setEndsState(e);
    refRef.current = null;
    setDrift(null);
  }, []);

  const calibInput: CalibInput | null = useMemo(() => {
    if (!ends || !p.camera || !p.focalPx || p.tiltRad == null) return null;
    return {
      frontLeft: ends.left,
      frontRight: ends.right,
      focalPx: p.focalPx,
      width: p.camera.width,
      height: p.camera.height,
      tiltDown: p.tiltRad,
      roll: p.rollRad ?? 0,
    };
  }, [ends, p.camera, p.focalPx, p.tiltRad, p.rollRad]);
  const calib: Calib | null = useMemo(() => (calibInput ? calibFromPlate(calibInput) : null), [calibInput]);
  const zonePoly = useMemo(
    () => (calib && calib.ok ? zonePolygonPx(zoneWorld(heightCm, RULES[setup.rule]), calib) : null),
    [calib, heightCm, setup.rule]
  );

  /** 엔진 결과 → ABS 판정(저장 모양). 보정이 없거나 궤적 스냅샷이 없으면 null */
  const judge = useCallback(
    (result: AbsJudgeSource): AbsAnalysis | null => {
      if (!active || !calibInput || !result.distance?.fit) return null;
      const k = result.sourceSize.width / result.analyzeSize.width;
      const diams = result.track.map((o) => o.diameterPx ?? 0).filter((d) => d > 0).sort((a, b) => a - b);
      return judgePitch({
        fit: result.distance.fit,
        impact: result.distance.impact ?? 'end',
        sizeDistM: result.distance.sizeDistM ?? null,
        inputDistM: null,
        obs: result.track.map((o) => ({ t: o.t, u: o.x, v: o.y })),
        calib: calibInput,
        heightCm,
        rule: setup.rule,
        batter,
        bands: drift ? bandsFor(drift, DEFAULT_BANDS) : DEFAULT_BANDS,
        drift: drift ? { movedPx: drift.movedPx, recalibrated: drift.recalibrate } : undefined,
        ballDiamPx: diams.length ? diams[diams.length >> 1] * k : null,
      });
    },
    [active, calibInput, heightCm, setup.rule, batter, drift]
  );

  return {
    on: active,
    setup,
    setOn,
    setRule,
    setHeight,
    heightCm,
    batter,
    nextBatter,
    find,
    ends,
    setEnds,
    manual,
    setManual,
    detectNow,
    calibInput,
    calib,
    zonePoly,
    drift,
    judge,
  };
}

export type AbsSession = ReturnType<typeof useAbsSession>;
