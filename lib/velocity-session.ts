/**
 * 구속 측정 세션의 공 다루기 — 잰 결과를 세션에 담을지(측정 불가 판정) · 세션 거리 보정 · 저장할 세션 거리. 웹 측정 화면
 * (app/(session)/velocity/velocity-screen.tsx)과 아이폰 앱(native/src/velocity)이 같이 쓴다 — 2026-10-17 웹 화면 안에 있던 것을 그대로
 * 옮겼다(값 · 규칙 그대로). 저장소(localStorage)는 안 만진다(scripts/shared-lib-selftest.mts).
 */
import type { AnalyzeResult } from '@/lib/velocity-engine/analyze-frames';
import {
  SPEED_DISTANCE_EXPONENT,
  rejudgeSize,
  type DistanceReport,
} from '@/lib/velocity-engine/analyze-distance';
import {
  sessionCorrection,
  sessionDistOf,
  type DistMemory,
  type SizeSample,
} from '@/lib/velocity-session-distance';
import { OUT_OF_RANGE_FIX, STANDARD_TARGET_DIST_M, TAPE_MISMATCH_FIX } from '@/lib/velocity-setup';
import type { AnalysisJson } from '@/lib/velocity-analysis';

type Result = AnalyzeResult & { distance?: DistanceReport };

/** 세션에 담긴 공 가운데 이 파일이 읽고 고치는 칸 — 화면마다 제 칸을 더 붙인다 */
export type SessionPitchCore = {
  source: 'camera' | 'file';
  rawKmh: number;
  errorKmh: number;
  releaseKmh: number | null;
  analysis?: AnalysisJson | null;
  /** 구속을 낸 거리 — 결과 화면에 '거리 22.4m(공 크기)'로 보인다. from 은 세션 거리(아래 withSessionDistance)로 옮겼으면 어디서 */
  dist?: { m: number; auto: boolean; from?: 'session' | 'memory' | null } | null;
  /**
   * 공 크기로 어림한 거리로 잰 처음 값 — 세션 거리로 옮길 때 여기서 다시 낸다. clean 은 끝이 깨끗했나(맞고 튄 공으로 끝을 정하고 이어
   * 찾은 것이 없다) — 세션 거리는 이런 공에만 쓴다
   */
  auto?: {
    distM: number;
    kmh: number;
    releaseKmh: number | null;
    errorKmh: number;
    clean: boolean;
  } | null;
  /**
   * 기준 20m(또는 줄자 거리)로 잰 공의 처음 값 — 세션 거리 보정(withSessionDistance · sessionCorrection, 엔진 2.4 1단계)으로 옮길 때
   * 여기서 다시 낸다. size 는 깨끗한 공인지 가리는 재료(공 크기 거리 · 기울기 · 이어 찾기 · 끝 · 믿음 · 공 길 장면 수)
   */
  std?: {
    kmh: number;
    releaseKmh: number | null;
    errorKmh: number;
    size: SizeSample;
  } | null;
};

/**
 * 세션 거리(규칙 · 숫자는 lib/velocity-session-distance.ts) — 끝이 깨끗한 공(맞고 튄 공으로 끝, 이어 찾기 없음)에만 쓴다. 실내(흰 천 ·
 * 포수)는 공마다 끝 판정이 흔들리고 그 공의 거리가 그것을 메워, 세션 거리로 옮기면 오히려 5.5 → 8.2 로 나빴다. 세션 거리와 8% 넘게
 * 다른 공도 다른 일(폰을 옮김 등)이라 제 거리를 둔다. 영상 파일은 파일끼리 따로 세고 지난 세션 거리도 안 쓴다 — 찍은 자리를 모른다.
 * 공을 더하거나 지울 때마다 다시 센다.
 */
const SESSION_DIST_TOL = 0.08;
/** 기준 20m 로 잰 공들의 세션 보정(공 크기 가운데 값) — 그 출처의 깨끗한 공이 하나도 없으면 null(2026-10-19 부터 1개부터) */
export function stdCorrection(list: SessionPitchCore[], source: SessionPitchCore['source']) {
  return sessionCorrection(
    list.filter((p) => p.std && p.source === source).map((p) => p.std!.size),
    STANDARD_TARGET_DIST_M,
    SPEED_DISTANCE_EXPONENT
  );
}
/**
 * 세션 거리 보정이 걸렸으면(위 stdCorrection apply) 공 크기 판정을 그 거리로 다시 한다(엔진 2.5.3 rejudgeSize). 기준 20m 와 견주면 실제 22.5m
 * 자리의 빠른 공이 '15% 넘게 다름'으로 '낮음'이 돼 빠졌다(10-03 밖 121 · 124 · 132 — 세션 거리로 옮긴 값은 스피드건과 2.5km/h 안).
 * 값은 이 거리로 옮겨 보이므로(withSessionDistance) 판정 거리 = 값을 낸 거리다. 줄자 세션은 넣은 거리가 곧 기준이라 그대로.
 */
export function judgeBySession<T extends Result>(
  result: T,
  list: SessionPitchCore[],
  source: SessionPitchCore['source'],
  tape: boolean
): T {
  /* 줄자 거리는 믿을 만한 기준 — 엔진이 넣은 거리로 한 판정에 튕긴 공의 10% 문턱을 더한다(2.7.6) */
  if (tape) {
    const d = (result as { distance?: { inputDistM?: number } }).distance;
    return d?.inputDistM ? rejudgeSize(result, d.inputDistM) : result;
  }
  const c = stdCorrection(list, source);
  return c?.apply ? rejudgeSize(result, c.m) : result;
}
/** 저장할 세션의 거리 · 출처 — 줄자가 이기고, 기준 20m 세션은 보정이 걸렸으면 그 가운데 값(엔진 2.4 1단계) */
export function sessionDistanceOf(
  list: SessionPitchCore[],
  s: { cameraPos: string; distAuto: boolean; distTape: boolean; targetDistM: number }
): { distanceM: number | null; distanceSource: string | null } {
  if (s.cameraPos !== 'behind-pitcher')
    return { distanceM: null, distanceSource: null };
  if (s.distAuto) return { distanceM: null, distanceSource: 'auto' };
  if (s.distTape) return { distanceM: s.targetDistM, distanceSource: 'tape' };
  const c = stdCorrection(list, 'camera') ?? stdCorrection(list, 'file');
  return c?.apply
    ? { distanceM: c.m, distanceSource: 'session-size' }
    : { distanceM: STANDARD_TARGET_DIST_M, distanceSource: 'default' };
}
export function withSessionDistance<T extends SessionPitchCore>(
  list: T[],
  memory: DistMemory | null,
  /** 줄자로 잰 세션 — 기준 20m 공의 세션 보정을 하지 않는다(줄자가 이긴다) */
  tape = false
): T[] {
  const cleanOf = (source: SessionPitchCore['source']) =>
    list.filter((p) => p.auto?.clean && p.source === source).map((p) => p.auto!.distM);
  const sess = {
    camera: sessionDistOf(cleanOf('camera'), memory),
    file: sessionDistOf(cleanOf('file'), null),
  };
  const corr = {
    camera: tape ? null : stdCorrection(list, 'camera'),
    file: tape ? null : stdCorrection(list, 'file'),
  };
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return list.map((p) => {
    /*
     * 기준 20m 로 잰 공 — 깨끗한 공 하나부터(2.7.2) 공 크기 가운데 값이 기준과 3% 넘게(15% 안) 다르면 그 거리로 옮긴다(2.4.0). 안 걸리면
     * 처음 값 그대로(다시 낸다 — 공을 지워 보정이 풀려도 돌아오게)
     */
    if (p.std) {
      const c = corr[p.source];
      const on = c != null && c.apply;
      const use = on ? c.m : STANDARD_TARGET_DIST_M;
      const k = on ? c.k : 1;
      const distance = p.analysis?.distance;
      return {
        ...p,
        rawKmh: r1(p.std.kmh * k),
        errorKmh: r1(p.std.errorKmh * k),
        releaseKmh: p.std.releaseKmh != null ? r1(p.std.releaseKmh * k) : null,
        dist: { m: r1(use), auto: false, from: on ? ('session' as const) : null },
        analysis:
          p.analysis && distance
            ? { ...p.analysis, distance: { ...distance, distanceM: r1(use) } }
            : p.analysis,
      };
    }
    if (!p.auto) return p;
    const s = sess[p.source];
    const on =
      s != null && p.auto.clean && Math.abs(p.auto.distM / s.m - 1) <= SESSION_DIST_TOL;
    const use = on ? s.m : p.auto.distM;
    const k = (use / p.auto.distM) ** SPEED_DISTANCE_EXPONENT;
    const distance = p.analysis?.distance;
    return {
      ...p,
      rawKmh: r1(p.auto.kmh * k),
      errorKmh: r1(p.auto.errorKmh * k),
      releaseKmh: p.auto.releaseKmh != null ? r1(p.auto.releaseKmh * k) : null,
      dist: { m: r1(use), auto: true, from: on ? s.from : null },
      analysis:
        p.analysis && distance
          ? { ...p.analysis, distance: { ...distance, distanceM: r1(use) } }
          : p.analysis,
    };
  });
}

/** 흔들림을 배경으로 재서 바로잡아 '보통'이 된 공 — 손에 든 폰(엔진 2.5.1) */
export function steadied(r: Result): boolean {
  const d = r.distance;
  return r.measure.ok && r.measure.confidence === 'medium' && !!d?.shaky && !!d.stabilized;
}

/** 믿음이 모자란 까닭에 맞춘 다음 할 일 — 엔진이 남긴 거리 판단(analyze-distance.ts report)에서 읽는다 */
export function lowConfidenceFix(
  r: Result,
  source: 'camera' | 'file',
  approaching: boolean,
  /** 줄자로 잰 세션인가 — 거리가 많이 다를 때 할 말이 다르다 */
  tape = false
): string {
  const d = r.distance;
  if (approaching)
    return '포수 뒤에서는 정확하게 잴 수 없어요. 투수 뒤에 폰을 두고 재 주세요.';
  /* 공 크기 거리가 넣은 거리와 15% 넘게 다르다(엔진 size-mismatch) — '18~22m' 를 골랐으면 그 밖이니 줄자로(2026-10-19 김민 결정) */
  if (d?.why === 'size-mismatch') return tape ? TAPE_MISMATCH_FIX : OUT_OF_RANGE_FIX;
  if (d?.shaky) return '폰이 흔들렸어요. 삼각대에 단단히 고정하고 다시 던져 주세요.';
  /* 흰 과녁 천 · 밝은 벽 앞에서는 공이 끝에서 배경에 묻혀 엔진이 끝을 짐작으로 잇는다(10-09 실내 14구 중 12구) — 흰 배경 앞은 재지 않는다 */
  if ((d?.extended ?? 0) > 0)
    return '흰 배경 앞에서는 공이 끝에서 배경에 묻혀 잴 수 없어요. 공 뒤에 어두운 천을 두거나 어두운 쪽을 향해 던져 주세요.';
  /*
   * 잡힌 끝(impact 'end')만으로는 까닭이 아니다 — 포수가 받으면 늘 'end' 다. 끝을 못 봤고 거리 판독도 어긋날 때(end-unseen)만 이 말(2.7.4,
   * 10-21: 잔차로 '보통'이 된 캐치볼 공 셋이 엉뚱하게 '닿는 곳이 안 보였어요'를 들었다)
   */
  /* 튕김은 봤는데 공 크기 거리가 10~15% 다르다(엔진 size-off, 2.7.6) — 끝을 잘못 잡았거나 넣은 거리가 조금 틀렸다 */
  if (d?.why === 'size-off')
    return tape
      ? TAPE_MISMATCH_FIX
      : '공 크기로 본 거리가 맞지 않아 미트 · 그물에 닿은 때를 잘못 잡은 것 같아요. 폰과 미트 자리는 그대로 두고 다시 던져 주세요.';
  /* 엔진 2.7.7 — 끝 장면의 공이 아직 컸다(받는 곳 앞에서 놓침) · 공이 화면에서 거의 안 움직여 속력이 흔들렸다 */
  if (d?.why === 'end-early')
    return '공이 받는 곳에 닿기 전에 놓쳤어요. 받는 곳 뒤가 어두운 쪽이 되게 하고, 받는 곳까지 화면에 들어오게 해 주세요.';
  if (d?.why === 'speed-unsure')
    return '공이 화면에서 거의 안 움직여 속도를 정하지 못했어요. 폰을 던지는 사람 1.5~2m 뒤, 옆으로 조금 비켜 두세요.';
  /* 2.7.8 — 손을 떠난 앞부분이 몸 · 팔에 가려 공이 늦게 잡혔다 */
  if (d?.why === 'late-start')
    return '던지는 사람 몸에 가려 공이 늦게 보였어요. 폰을 던지는 사람 1.5~2m 뒤에 두고, 손이 떠나는 자리가 가리지 않게 해 주세요.';
  if (d?.why === 'end-unseen')
    return '공이 닿는 순간이 화면에서 안 보였어요. 미트 · 그물까지 화면에 들어오게 해 주세요.';
  if (d?.why === 'short-flight')
    return '공이 날아가는 모습이 너무 짧게 잡혔어요. 폰을 던지는 사람 바로 뒤에 두고, 공이 화면 가운데로 길게 지나가게 해 주세요.';
  if (d?.why === 'fit-rms' || d?.why === 'fit-quality')
    return '공 길이 고르게 잡히지 않았어요(흐림 · 그림자 · 배경). 초점을 다시 맞추고 공 뒤 배경이 단순한 쪽으로 던져 주세요.';
  if (source === 'file')
    return '공이 잡힌 구간이 짧거나 흐려요. 60fps 이상, 공이 닿는 곳까지 찍힌 영상으로 다시 재 주세요.';
  return '공이 잡힌 구간이 짧거나 흐렸어요. 초점과 밝기를 확인하고 다시 던져 주세요.';
}

/** 세션 안 공 크기 거리의 허용 흩어짐(가운데 값 대비) — sizeOutlier */
export const SESSION_SIZE_SPREAD = 0.09;
export const SIZE_OUTLIER_FIX =
  '이 공은 앞 공들과 거리 판독이 달라 잴 수 없었어요. 폰과 미트 자리는 그대로 두고 다시 던져 주세요.';

/**
 * 같은 세션의 공 크기 거리 — 앞서 기록한 공 셋 이상의 가운데 값에서 SESSION_SIZE_SPREAD 넘게 튀면 이 공의 끝(그물 · 미트에 닿은 때)을
 * 잘못 잡은 것이다. 10-12 밖 22구: 정상 공은 가운데 값 ±8.1% 안, 스피드건과 13% 갈린 공이 −10.4%(10-03 밖 13개는 ±6.6% 안).
 */
export function sizeOutlier(
  result: Result,
  list: SessionPitchCore[],
  source: SessionPitchCore['source']
): boolean {
  const sizeNow = result.distance?.sizeDistM;
  const sizes = list
    .filter((p) => p.source === source)
    .map(
      (p) =>
        (p.analysis as { distance?: { sizeDistM?: unknown } } | null | undefined)
          ?.distance?.sizeDistM
    )
    .filter((v): v is number => typeof v === 'number' && v > 0)
    .sort((a, b) => a - b);
  if (sizeNow == null || sizes.length < 3) return false;
  const n = sizes.length;
  const mid = n % 2 ? sizes[(n - 1) / 2] : (sizes[n / 2 - 1] + sizes[n / 2]) / 2;
  return Math.abs(sizeNow / mid - 1) > SESSION_SIZE_SPREAD;
}

/**
 * 잰 공(measure.ok)에서 세션 공의 숫자 칸 — 저장 칸(rawKmh … fps)과 세션 거리 재료(dist · auto · std). 화면은 여기에 제 칸(클립 · 존 ·
 * 알림 …)을 붙인다.
 */
export function measuredFields(result: Result, distAuto: boolean) {
  const m = result.measure;
  if (!m.ok) throw new Error('measuredFields: 못 잰 공');
  const r = result.release;
  const dist = result.distance ?? null;
  return {
    rawKmh: m.kmh,
    errorKmh: m.errorKmh,
    confidence: m.confidence,
    releaseKmh: r?.releaseKmh ?? null,
    releaseDxCm: r?.dxCm ?? null,
    releaseDyCm: r?.dyCm ?? null,
    releaseDistM: r?.distanceM ?? m.detail.releaseDistanceM,
    travelM: m.detail.travelM,
    durationSec: m.detail.durationSec,
    frames: m.detail.frames,
    fps: result.fps,
    dist: dist ? { m: dist.distanceM, auto: dist.distanceSource === 'ball' } : null,
    auto:
      dist?.distanceSource === 'ball'
        ? {
            distM: dist.distanceM,
            kmh: m.kmh,
            releaseKmh: r?.releaseKmh ?? null,
            errorKmh: m.errorKmh,
            clean: dist.impact === 'rebound' && dist.extended === 0,
          }
        : null,
    /* 기준 20m(또는 줄자)로 잰 공 — 세션 거리 보정의 재료(2.4.0). 줄자 세션은 7% 경고에만 쓴다 */
    std:
      dist && dist.distanceSource === 'input' && !distAuto
        ? {
            kmh: m.kmh,
            releaseKmh: r?.releaseKmh ?? null,
            errorKmh: m.errorKmh,
            size: {
              sizeDistM: dist.sizeDistM,
              sizeSlope: dist.sizeSlope,
              extended: dist.extended,
              impact: dist.impact,
              confidence: m.confidence,
              frames: m.detail.frames,
            },
          }
        : null,
  } satisfies Partial<SessionPitchCore> & Record<string, unknown>;
}
