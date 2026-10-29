import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { judgePitch, type AbsAnalysis, type FitSnapshot } from '@/lib/abs/analysis';
import { calibFromPlate, zonePolygonPx, type Calib, type CalibInput, type Pixel } from '@/lib/abs/calib';
import { findPlateFront, type PlateFind } from '@/lib/abs/plate-detect';
import { DEFAULT_BANDS, DEFAULT_RULE, RULES, type RuleSetId } from '@/lib/abs/rules';
import { DEFAULT_ABS_SETUP, heightCmOf, type AbsSetup } from '@/lib/abs/setup';
import { bandsFor, driftInit, driftUpdate, type DriftState } from '@/lib/abs/stability';
import { zoneWorld } from '@/lib/abs/zone';
import type { ZoneRect } from '@/lib/velocity-setup';
import { DualCamera } from '../../../modules/dual-camera';
import { loadJson, saveJson } from '~/lib/store';
import { batterAt, type BatterSpan } from './present';

/**
 * ABS 세션 상태(앱) — 웹 components/abs/use-abs-session.ts 를 옮겼다. 설정(규칙 · 신장) · 타자 번호 · 플레이트 앞변(자동 · 직접) ·
 * 보정 · 삼각대 감시 · 판정 함수. 순수 계산은 웹과 같은 lib/abs 그대로라 숫자가 같다.
 * 다른 것: 밝기 스냅샷이 앱 카메라(DualCamera.snapshot — 세로 장면의 밝기, 짧은 변 720)에서 비동기로 오고, 설정은 앱 저장소(AsyncStorage)에.
 * 'on' 스위치는 없다 — 카메라 화면의 모드가 ABS 면 켜진 것(docs/designs/camera-modes.md).
 */
export type PlateEnds = { left: Pixel; right: Pixel };

export type AbsJudgeSource = {
  distance?: { fit?: FitSnapshot | null; impact?: 'rebound' | 'end'; sizeDistM?: number | null; inputDistM?: number | null } | null;
  track: { t: number; x: number; y: number; diameterPx?: number }[];
  analyzeSize: { width: number; height: number };
  sourceSize: { width: number; height: number };
};

export type AbsParams = {
  /** ABS 모드이고 관리자일 때만 돈다 */
  enabled: boolean;
  /** 카메라 장면(원본 px, 세로) */
  camera: { width: number; height: number } | null;
  focalPx: number | null;
  /** 숙임(라디안, 아래 +) · 좌우 기울기(라디안, 오른쪽 내려가면 +) */
  tiltRad: number | null;
  rollRad: number | null;
  /** 구속 측정의 스트라이크 존(장면 비율) — 플레이트를 찾을 창의 기준 */
  zoneRect: ZoneRect | null;
  /** 플레이트 찾기 단계(0.6초마다) · 측정 중(5초마다 삼각대 감시) */
  detecting: boolean;
  live: boolean;
};

const DETECT_MS = 600;
const DRIFT_MS = 5000;
/** 스냅샷 짧은 변(px) — 웹이 캔버스로 읽는 크기와 비슷하게(1080 원본을 720 으로 줄임) */
const SNAPSHOT_SHORT = 720;
const SETUP_KEY = 'bullpen-abs-setup';

/* base64 → 바이트. Hermes 에 atob 가 있으면 그것(빠름), 없으면 직접 푼다 */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function bytesOfBase64(s: string): Uint8Array {
  const g = globalThis as { atob?: (s: string) => string };
  if (typeof g.atob === 'function') {
    const bin = g.atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array((clean.length * 3) >> 2);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]), b = B64.indexOf(clean[i + 1]), c = B64.indexOf(clean[i + 2]), d = B64.indexOf(clean[i + 3]);
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

function parseSetup(raw: unknown): AbsSetup {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<AbsSetup>;
  return {
    on: true,
    rule: p.rule === 'mlb-2026' ? 'mlb-2026' : DEFAULT_RULE,
    height: p.height === 'average' ? 'average' : typeof p.height === 'number' && Number.isFinite(p.height) ? heightCmOf(p.height) : 'average',
    savedAt: typeof p.savedAt === 'string' ? p.savedAt : '',
  };
}

export function useAbs(p: AbsParams) {
  const [setup, setSetup] = useState<AbsSetup>({ ...DEFAULT_ABS_SETUP, on: true, savedAt: '' });
  useEffect(() => {
    let alive = true;
    void loadJson(SETUP_KEY).then((raw) => alive && setSetup(parseSetup(raw)));
    return () => {
      alive = false;
    };
  }, []);
  const persist = useCallback((next: Omit<AbsSetup, 'savedAt'>) => {
    const out: AbsSetup = { ...next, savedAt: new Date().toISOString() };
    setSetup(out);
    void saveJson(SETUP_KEY, out);
  }, []);
  const setRule = useCallback((rule: RuleSetId) => persist({ ...setup, rule }), [persist, setup]);
  /*
   * 타자 기록 — 판정은 공을 알아챈 때의 타자 · 신장으로(present.ts batterAt). '다음 타자'를 누를 때 쌓는다(첫 타자 줄은 그때 앞에 붙임).
   * 기록이 비었으면(아직 안 바꿈) 지금 타자 · 신장 그대로.
   */
  const history = useRef<BatterSpan[]>([]);
  const setHeight = useCallback(
    (height: number | 'average') => {
      const h = history.current;
      if (h.length) history.current = [...h.slice(0, -1), { ...h[h.length - 1], heightCm: heightCmOf(height) }];
      persist({ ...setup, height });
    },
    [persist, setup]
  );

  const [batter, setBatter] = useState(1);
  const heightCm = heightCmOf(setup.height);
  const nextBatter = useCallback(
    (height: number | 'average') => {
      const h = history.current.length ? history.current : [{ since: 0, batter, heightCm }];
      history.current = [...h.slice(-20), { since: Date.now(), batter: batter + 1, heightCm: heightCmOf(height) }];
      setBatter(batter + 1);
      persist({ ...setup, height });
    },
    [persist, setup, batter, heightCm]
  );

  const [find, setFind] = useState<PlateFind | null>(null);
  const [ends, setEndsState] = useState<PlateEnds | null>(null);
  const [manual, setManual] = useState(false);
  const [drift, setDrift] = useState<DriftState | null>(null);
  const active = p.enabled;

  /* 찾을 창(스냅샷 px) — 존 밑(플레이트는 무릎 높이 존 아래 지면). 웹과 같은 비율 */
  const zoneRef = useRef(p.zoneRect);
  useEffect(() => {
    zoneRef.current = p.zoneRect;
  }, [p.zoneRect]);
  const windowOf = (W: number, H: number) => {
    const z = zoneRef.current;
    if (!z) return { x: W * 0.3, y: H * 0.45, w: W * 0.4, h: H * 0.3 };
    return {
      x: Math.max(0, (z.x - 0.6 * z.w) * W),
      y: Math.max(0, (z.y + 0.4 * z.h) * H),
      w: Math.min(W, 2.2 * z.w * W),
      h: Math.min(H, 2.0 * z.h * H),
    };
  };

  /* 한 번 찾기 — 앱 카메라 스냅샷(비동기) → 플레이트 앞변(원본 px) */
  const cameraRef = useRef(p.camera);
  useEffect(() => {
    cameraRef.current = p.camera;
  }, [p.camera]);
  const busy = useRef(false);
  const detectOnce = useCallback(async (): Promise<PlateFind | null> => {
    const cam = cameraRef.current;
    if (!cam || busy.current) return null;
    busy.current = true;
    try {
      const s = await DualCamera.snapshot({ short: SNAPSHOT_SHORT });
      const luma = bytesOfBase64(s.luma);
      if (luma.length < s.width * s.height) return null;
      const r = findPlateFront({ data: luma, width: s.width, height: s.height }, windowOf(s.width, s.height));
      if (!r.ok) return r;
      /* 스냅샷 px → 원본 px */
      const k = cam.width / s.width;
      return { ...r, left: [r.left[0] * k, r.left[1] * k], right: [r.right[0] * k, r.right[1] * k], thickness: r.thickness * k };
    } catch {
      return null;
    } finally {
      busy.current = false;
    }
  }, []);

  /* 찾기 단계 — 0.6초마다, 직접 맞추기 중이 아니면 찾은 것으로 끝을 바꾼다 */
  const manualRef = useRef(manual);
  useEffect(() => {
    manualRef.current = manual;
  }, [manual]);
  const detectNow = useCallback(() => {
    void detectOnce().then((r) => {
      if (!r) return;
      setFind(r);
      if (r.ok && !manualRef.current) setEndsState({ left: r.left, right: r.right });
    });
  }, [detectOnce]);
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
      const t = setTimeout(() => setDrift(init), 0);
      const id = setInterval(() => {
        void detectOnce().then((r) => r && setDrift((d) => (d ? driftUpdate(d, r, Date.now()) : d)));
      }, DRIFT_MS);
      return () => {
        clearTimeout(t);
        clearInterval(id);
      };
    }
    const id = setInterval(() => {
      void detectOnce().then((r) => r && setDrift((d) => (d ? driftUpdate(d, r, Date.now()) : d)));
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

  /**
   * 엔진 결과 → ABS 판정(저장 모양). 보정이 없거나 궤적 스냅샷이 없으면 null.
   * atMs — 공을 알아챈 때(Date.now, capture.ts queuedAt). 그때의 타자 · 신장으로 판정한다(계산 중에 '다음 타자'를 눌러도 앞 공은 앞 타자).
   */
  const judge = useCallback(
    (result: AbsJudgeSource, atMs?: number): AbsAnalysis | null => {
      if (!active || !calibInput || !result.distance?.fit) return null;
      const who = batterAt(history.current, atMs) ?? { batter, heightCm };
      const k = result.sourceSize.width / result.analyzeSize.width;
      const diams = result.track.map((o) => o.diameterPx ?? 0).filter((d) => d > 0).sort((a, b) => a - b);
      return judgePitch({
        fit: result.distance.fit,
        impact: result.distance.impact ?? 'end',
        sizeDistM: result.distance.sizeDistM ?? null,
        inputDistM: null,
        obs: result.track.map((o) => ({ t: o.t, u: o.x, v: o.y })),
        calib: calibInput,
        heightCm: who.heightCm,
        rule: setup.rule,
        batter: who.batter,
        bands: drift ? bandsFor(drift, DEFAULT_BANDS) : DEFAULT_BANDS,
        drift: drift ? { movedPx: drift.movedPx, recalibrated: drift.recalibrate } : undefined,
        ballDiamPx: diams.length ? diams[diams.length >> 1] * k : null,
      });
    },
    [active, calibInput, heightCm, setup.rule, batter, drift]
  );

  /**
   * 측정 중 '앞변 다시 맞추기' — 삼각대 감시가 밀렸다고 본 뒤(drift.recalibrate) 지금 장면에서 앞변을 다시 찾아 기준으로 삼는다.
   * 못 찾으면(포수 · 타자가 가림) 지금 끝 · 감시를 그대로 두고 까닭을 돌려준다 — 끝을 지우면 판정이 말없이 멈춘다.
   */
  const recalibrate = useCallback(async (): Promise<string | null> => {
    const r = await detectOnce();
    if (!r) return '지금은 장면을 못 읽었어요. 잠시 뒤 다시 눌러 주세요.';
    setFind(r);
    if (!r.ok) return r.reason ?? '앞변을 못 찾았어요. 플레이트가 가려지지 않게 해 주세요.';
    setManual(false);
    setEnds({ left: r.left, right: r.right });
    return null;
  }, [detectOnce, setEnds]);

  return { on: active, recalibrate, setup, setRule, setHeight, heightCm, batter, nextBatter, find, ends, setEnds, manual, setManual, detectNow, calibInput, calib, zonePoly, drift, judge };
}

export type AbsSession = ReturnType<typeof useAbs>;
