import type { AbsAnalysis } from '@/lib/abs/analysis';
import type { AnalyzeResult } from '@/lib/velocity-engine/analyze-frames';
import type { DistanceReport } from '@/lib/velocity-engine/analyze-distance';
import { focalPxFromFov } from '@/lib/velocity-engine/geometry';
import { analysisOf, distanceMismatch } from '@/lib/velocity-analysis';
import { applyCalibration, type CalFit } from '@/lib/velocity-calibration';
import { summarize } from '@/lib/velocity-meta';
import {
  SIZE_OUTLIER_FIX,
  judgeBySession,
  lowConfidenceFix,
  measuredFields,
  sessionDistanceOf,
  sizeOutlier,
  steadied,
  withSessionDistance,
  type SessionPitchCore,
} from '@/lib/velocity-session';
import { OUT_OF_RANGE_FIX, STANDARD_TARGET_DIST_M, TAPE_MISMATCH_FIX, zoneOfPoint, type CameraPos, type ZoneRect } from '@/lib/velocity-setup';
import { DualCamera, type Clip, type StartInfo } from '../../modules/dual-camera';
import { rpc } from '~/lib/rpc';
import type { Verdict } from './capture';
import { frameLossNote } from './clip-health';
import type { EngineResult } from './engine';
import type { AbsJudgeSource } from './abs/use-abs';

/**
 * 앱 구속 측정 세션 — 잰 공을 받을지 · 세션 거리 보정 · 저장. 규칙은 웹 측정 화면과 같은 lib/velocity-session.ts(웹 velocity-screen.tsx
 * addResult · save 를 옮김). 앱이 웹과 다른 것: 늘 앱 카메라 · 기준 20m 또는 줄자(공마다 공 크기 거리 없음) · 관리자 '정확도 보정용 저장' 없음.
 */

type Result = AnalyzeResult & { distance?: DistanceReport };

export type NativePitch = SessionPitchCore &
  ReturnType<typeof measuredFields> & {
    id: number;
    /** 재기 작업 번호(AppCapture) — 시도 기록과 잇는다 */
    jobId: number;
    clip: Clip;
    /** 짐작한 코스(1~9) — 마지막 공 자리를 존에 대어 */
    zone: number | null;
    /** 구종(lib/velocity-meta.ts PITCH_TYPES 의 key) — 세션 저장 창에서 고른다, 안 고르면 null */
    pitchType?: string | null;
    notes: string[];
  };

/** 세션 맥락 — 카메라 켜는 설정 · 켠 카메라 */
export type SessionCtx = {
  cameraPos: CameraPos;
  zone: ZoneRect;
  info: StartInfo | null;
  /** 줄자로 잰 거리인가 — 그러면 세션 거리 보정을 안 한다(줄자가 이긴다, 웹과 같다) */
  tape: boolean;
  /** 폰에서 미트까지(m) — 기준 20m 또는 줄자 값 */
  distM: number;
};

/** 앱 카메라가 기준 조건에서 벗어난 까닭 — lib/velocity-engine/dual-capture.ts dualOffStandard 와 같다(그 파일은 웹 카메라 길이 섞여 앱이 못 부른다) */
export function offStandardOf(info: StartInfo | null): string[] {
  const s = info?.standard as
    | { resolution?: boolean; fps?: boolean; zoom?: boolean; stabilization?: boolean }
    | undefined;
  if (!info || !s) return [];
  const out: string[] = [];
  if (!s.resolution) out.push(`${Math.min(info.mainWidth, info.mainHeight)}p`);
  if (!s.fps) out.push(`${info.mainFps}fps`);
  if (!s.zoom) out.push('2배가 디지털 줌');
  if (!s.stabilization) out.push('손떨림 보정 없음');
  return out;
}

/** 다음 공 번호 — 목록의 가장 큰 번호 + 1(지운 공 번호를 다시 쓰지 않게) */
const nextId = (list: NativePitch[]) => list.reduce((m, p) => Math.max(m, p.id), 0) + 1;

/**
 * 잰 결과를 세션에 담을지 — 웹 addResult 와 같은 규칙: 못 잰 공은 흔들림만 알리고 나머지는 조용히, 믿음 '높음'이 아니면(흔들림을
 * 바로잡은 '보통'은 받음) 측정 불가, 앞 공들과 공 크기 거리가 튀면 측정 불가. 받으면 새 목록(세션 거리 보정까지 다시 낸 것).
 */
export function decide(
  raw: EngineResult,
  list: NativePitch[],
  ctx: SessionCtx,
  meta: { id: number; clip: Clip; late?: boolean },
  /** ABS 모드면 판정 함수(use-abs judge) — 보정이 있고 궤적 스냅샷이 있으면 analysis.abs 에 싣고 코스는 판정 칸으로(웹과 같다) */
  judgeAbs?: (r: AbsJudgeSource) => AbsAnalysis | null
): { verdict: Verdict; list?: NativePitch[]; notice?: string } {
  const result = judgeBySession(raw as unknown as Result, list, 'camera', ctx.tape);
  const m = result.measure;
  if (!m.ok) {
    if (m.code === 'CAMERA_SHAKE')
      return { verdict: { kept: false }, notice: '폰이 흔들렸어요. 삼각대에 단단히 고정하고 다시 던져 주세요.' };
    return { verdict: { kept: false } };
  }
  if (m.confidence !== 'high' && !steadied(result))
    return {
      verdict: { kept: false, why: 'low-confidence' },
      notice: `측정 불가 · ${lowConfidenceFix(result, 'camera', ctx.cameraPos !== 'behind-pitcher', ctx.tape)}`,
    };
  if (sizeOutlier(result, list, 'camera'))
    return { verdict: { kept: false, why: 'session-size' }, notice: `측정 불가 · ${SIZE_OUTLIER_FIX}` };

  const tail = result.track[result.track.length - 1];
  const zone =
    tail && result.analyzeSize.width && result.analyzeSize.height
      ? zoneOfPoint(tail.x / result.analyzeSize.width, tail.y / result.analyzeSize.height, ctx.zone, ctx.cameraPos)
      : null;
  /* 세션 조건 + 이 클립의 장면 빠짐(캡처가 늦은 장면을 버린 것 — 2026-10-20, clip-health.ts) */
  const lossNote = frameLossNote(meta.clip);
  const offStandard = [...offStandardOf(ctx.info), ...(lossNote ? [lossNote] : [])];
  const dist = result.distance;
  const absJudged =
    judgeAbs && dist
      ? judgeAbs({ distance: dist as DistanceReport, track: result.track, analyzeSize: result.analyzeSize, sourceSize: result.sourceSize })
      : null;
  const mismatch = dist ? distanceMismatch({ distance: dist }) : null;
  const pitch: NativePitch = {
    id: nextId(list),
    jobId: meta.id,
    source: 'camera',
    clip: meta.clip,
    ...measuredFields(result, false),
    analysis: {
      ...analysisOf(result, ctx.cameraPos === 'behind-pitcher' ? 'receding' : 'approaching'),
      abs: absJudged,
      zoneRect: ctx.zone,
      offStandard,
      trail: trailOf(result),
    },
    /* 판정이 났으면 판정 칸 그대로(존 밖 공은 칸이 null — 짐작 칸으로 덮지 않는다, 웹 velocity-screen 과 같다) */
    zone: absJudged?.verdict ? absJudged.verdict.cell : zone,
    notes: [
      ...(offStandard.length ? [`기준 조건 밖: ${offStandard.join(' · ')}`] : []),
      ...(mismatch
        ? [`${ctx.tape ? TAPE_MISMATCH_FIX : OUT_OF_RANGE_FIX} (공 크기로 본 거리 ${mismatch.size}m) 최고 · 평균에서 뺐어요.`]
        : []),
      ...(steadied(result) ? ['폰이 흔들려 바로잡아 잰 값이에요.'] : []),
      ...(releaseOff(result) ? [RELEASE_OFF_NOTE] : []),
      /* 조용할 때 훑기(capture.ts sweep)가 찾은 공 — 웹 velocity-screen 과 같은 글 */
      ...(meta.late ? ['뒤늦게 찾은 공이에요. 알림이 없어 지난 영상을 훑어 쟀어요.'] : []),
    ],
  };
  return { verdict: { kept: true }, list: withSessionDistance([...list, pitch], null, ctx.tape) };
}

/**
 * 잰 공이 처음 보인 자리가 화면 가운데(릴리스 표적)에서 이만큼(짧은 변 절반 기준) 넘게 벗어나면 알린다 — 표적 원 반지름이 약 0.29,
 * 엔진은 0.45 를 넘으면 아예 못 잰다(RELEASE_NOT_CENTERED). 그 사이에서 재진 공에 '다음엔 맞추라'고 미리 알린다(2026-10-20).
 */
const RELEASE_OFF_RATIO = 0.3;
export const RELEASE_OFF_NOTE = '공을 놓은 자리가 릴리스 표적에서 벗어났어요. 폰 방향을 맞추면 더 잘 재져요.';
function releaseOff(result: Result): boolean {
  const { width, height } = result.analyzeSize;
  const first = result.track[0];
  if (!first || !width || !height) return false;
  return Math.hypot(first.x - width / 2, first.y - height / 2) / (Math.min(width, height) / 2) > RELEASE_OFF_RATIO;
}

/**
 * 저장할 공 길 — [클립 시각, x, y, 지름](장면 비율, 160점까지). 웹 velocity-screen 의 trailOf · withTrail 과 같다. 앱 클립은 궤적 시각이 곧
 * 클립 시각이라(웹 앱 카메라 길도 hitT = eventSec) 옮길 것이 없다. 없으면 그날 화면이 잡힌 공(track)으로 그렸다(2026-10-20).
 */
function trailOf(result: Result): number[][] | null {
  const { width, height } = result.analyzeSize;
  if (!width || !height) return null;
  const path = (result.distance as { path?: number[][] } | undefined)?.path;
  const rows = path && path.length >= 2 ? path : result.track.map((o) => [o.t, o.x, o.y, o.diameterPx]);
  if (rows.length < 2) return null;
  const every = Math.max(1, Math.ceil(rows.length / 160));
  const r = (v: number, k: number) => Math.round(v * k) / k;
  return rows
    .filter((_, i) => i % every === 0 || i === rows.length - 1)
    .map(([t, x, y, d]) => [r(t, 1e4), r(x / width, 1e5), r(y / height, 1e5), r(d / width, 1e5)]);
}

/** 보여 줄 구속 — 그 사람의 스피드건 짝 보정식(웹과 같이 늘 켬) */
export const shownKmh = (p: { rawKmh: number }, fit: CalFit) =>
  fit.n > 0 ? applyCalibration(p.rawKmh, fit) : p.rawKmh;

/** 세션 요약(최고 · 평균 · 공 수) — 공 크기 거리가 어긋난 공은 최고 · 평균에서 뺀다(웹과 같다) */
export function statsOf(list: NativePitch[], fit: CalFit) {
  return summarize(
    list.map((p) => ({
      kmh: shownKmh(p, fit),
      result: null,
      releaseDxCm: p.releaseDxCm,
      releaseDyCm: p.releaseDyCm,
      excluded: distanceMismatch(p.analysis) != null,
    }))
  );
}

type SaveResult = { ok: true; clipFailed: number } | { ok: false; error: string };

/**
 * 세션 저장 — 서버(saveVelocitySession) → 공마다 클립. 회원 클립은 폰의 앱 안(keep → attachClip localId — 웹과 같은 규칙, 2026-10-10
 * 사용자: 회원 클립은 폰 · 숫자만 서버), 관리자 클립은 서버 저장소(createClipUpload → PUT → attachClip — 엔진 확인 자료라 잃으면 안 됨).
 * 클립을 못 붙여도 측정값은 이미 저장됐다.
 */
export async function saveSession(input: {
  date: string;
  sessionType: string;
  effortPct: number;
  ctx: SessionCtx;
  pitches: NativePitch[];
  isAdmin: boolean;
  attemptIds: Map<number, Promise<string | null>>;
}): Promise<SaveResult> {
  const { ctx, pitches } = input;
  const info = ctx.info;
  const fovDeg = pitches[0]?.clip.fovDeg || info?.mainFovDeg || 38.3;
  const longSide = info ? Math.max(info.mainWidth, info.mainHeight) : null;
  const ids = new Map<number, string | null>();
  for (const [job, id] of input.attemptIds) ids.set(job, await id);
  const res = await rpc<{ ok: true; pitchIds?: string[] } | { ok: false; error: string }>(
    'velocity.saveVelocitySession',
    {
      date: input.date,
      sessionType: input.sessionType,
      effortPct: input.effortPct,
      fovDeg,
      source: 'camera',
      device: info ? `아이폰 앱 ${info.mainWidth}×${info.mainHeight}` : null,
      cameraPos: ctx.cameraPos,
      net: false,
      forCalibration: false,
      autoMode: true,
      useCal: true,
      focalPx: longSide ? focalPxFromFov(longSide, fovDeg) : null,
      lensCal: null,
      releaseDistM: null,
      ...sessionDistanceOf(pitches, {
        cameraPos: ctx.cameraPos,
        distAuto: false,
        distTape: ctx.tape,
        targetDistM: ctx.tape ? ctx.distM : STANDARD_TARGET_DIST_M,
      }),
      frameW: info?.mainWidth ?? null,
      frameH: info?.mainHeight ?? null,
      pitches: pitches.map((p) => ({
        rawKmh: p.rawKmh,
        errorKmh: p.errorKmh,
        confidence: p.confidence,
        releaseKmh: p.releaseKmh,
        releaseDxCm: p.releaseDxCm,
        releaseDyCm: p.releaseDyCm,
        releaseDistM: p.releaseDistM,
        travelM: p.travelM,
        durationSec: p.durationSec,
        frames: p.frames,
        fps: p.fps,
        pitchType: p.pitchType ?? null,
        zone: p.zone,
        result: p.analysis?.abs?.verdict?.call ?? null,
        gunKmh: null,
        memo: null,
        analysis: p.analysis ?? null,
        autoDetected: true,
        attemptId: ids.get(p.jobId) ?? null,
      })),
      attemptIds: [...ids.values()].filter((v): v is string => v != null),
    }
  );
  if (!res.ok) return res;
  let clipFailed = 0;
  for (const [i, p] of pitches.entries()) {
    const pitchId = res.pitchIds?.[i];
    if (!pitchId) continue;
    const clipInfo = { bytes: p.clip.bytes, sec: p.clip.durationSec, mime: 'video/mp4', eventSec: p.clip.eventSec };
    try {
      let attached: { ok: boolean };
      if (input.isAdmin) {
        const target = await rpc<{ ok: true; signedUrl: string; path: string } | { ok: false; error: string }>(
          'velocity.createClipUpload',
          pitchId,
          clipInfo.mime,
          clipInfo.bytes
        );
        if (!target.ok) throw new Error(target.error);
        const put = await DualCamera.upload({ path: p.clip.path, url: target.signedUrl, contentType: clipInfo.mime });
        if (put.status < 200 || put.status >= 300) throw new Error(`올리기 ${put.status}`);
        attached = await rpc('velocity.attachClip', pitchId, { path: target.path, ...clipInfo });
        void DualCamera.discard({ paths: [p.clip.path] });
      } else {
        const { id } = await DualCamera.keep({ path: p.clip.path });
        attached = await rpc('velocity.attachClip', pitchId, { path: '', localId: id, ...clipInfo });
      }
      if (!attached.ok) clipFailed++;
    } catch {
      clipFailed++;
    }
  }
  return { ok: true, clipFailed };
}
