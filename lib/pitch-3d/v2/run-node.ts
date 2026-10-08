import { readFileSync, writeFileSync } from 'node:fs';
import { detectPitchEvents } from '@/lib/pose/detect';
import { medianStep, prepareView, syncViews } from '@/lib/pitch-3d/motion';
import {
  MAX_V2_FRAMES,
  storedV2ResultJson,
  v2Fail,
  type V2FailCode,
  type V2Input,
} from '@/lib/pitch-3d/v2/contract';
import { fitPitch3dV2 } from '@/lib/pitch-3d/v2/fit';
import { readV2Track, toPoseTrack } from '@/lib/pitch-3d/v2/track';

/**
 * GPU 함수 안에서 Python 이 부르는 node 실행기(설계 E-P7 — TS 엔진을 옮겨 쓰지 않고 그대로 돈다).
 *
 *   node run-node.ts segment <in.json> <out.json>   거친 2D(두 영상 60fps 전체) → 투구 구간(옆 · 뒤 영상 시각) · 순간
 *   node run-node.ts fit     <in.json> <out.json>   구간의 2D(120fps, 25관절) → analysis-v2 결과(모양 검사 · 900KB 검사까지)
 *
 * 입력은 신뢰 경계 — readV2Track 이 모양을 검사한다. 출력은 늘 JSON 하나(실패도 { ok: false, code })라 Python 이 분기만 한다.
 * 묶기(scripts/pitch3d-bundle.mjs)가 이 파일과 lib/pitch-3d · lib/pose 를 services/pitch3d-gpu/engine/ 으로 복사하고 '@/' 를 상대 경로로 바꾼다.
 */

type SegmentOut =
  | {
      ok: true;
      side: { fromSec: number; toSec: number };
      back: { fromSec: number; toSec: number };
      events: { kneeUp: number | null; footPlant: number; release: number };
      /** 구간을 120fps 로 풀면 몇 장인지(상한 600 안으로 잘랐다) */
      frames: number;
    }
  | { ok: false; code: V2FailCode; detail?: Record<string, unknown> };

/** 구간 = 니업 0.5초 전 ~ 릴리스 0.5초 뒤(화면 결정 12), 120fps 600장(E-CAP) 안으로 — 넘치면 앞을 자른다(착지~릴리스는 꼭 남긴다) */
export function pickSegment(input: { side: unknown; back: unknown }): SegmentOut {
  const sideT = readV2Track(input.side);
  const backT = readV2Track(input.back);
  if (!sideT || !backT) return { ok: false, code: 'video' };
  const sidePose = toPoseTrack(sideT);
  const ev = detectPitchEvents(sidePose);
  const fp = ev.footPlant?.t;
  const rel = ev.release?.t;
  if (fp == null || rel == null || !(rel > fp))
    return {
      ok: false,
      code: 'events',
      detail: {
        sideViewOk: ev.sideViewOk,
        direction: ev.direction,
        kneeUp: ev.kneeUp?.t ?? null,
        footPlant: fp ?? null,
        release: rel ?? null,
        frames: sideT.frames.length,
        quality: Math.round(sidePose.quality * 100) / 100,
        coverage: Math.round(sidePose.coverage * 100) / 100,
      },
    };
  const span = rel - fp;
  const kneeUp = ev.kneeUp?.t ?? null;
  let from = Math.min(kneeUp ?? Infinity, fp - span * 3) - 0.5;
  let to = rel + 0.5;
  const first = sideT.frames[0]?.t ?? 0;
  const last = sideT.frames[sideT.frames.length - 1]?.t ?? to;
  from = Math.max(first, from);
  to = Math.min(last, to);
  const cap = MAX_V2_FRAMES / 120;
  if (to - from > cap) from = Math.max(first, Math.min(to - cap, fp - span * 3 - 0.1));
  if (to - from > cap) to = from + cap;

  /* 뒤 영상 구간 — 시간 맞추기(에피폴라)로 옆 시각 → 뒤 시각 */
  const side = prepareView(sidePose);
  const back = prepareView(toPoseTrack(backT));
  if (side.frames.length < 20 || back.frames.length < 20)
    return { ok: false, code: 'short' };
  const sync = syncViews(side, back, [from, to]);
  if (!Number.isFinite(sync.cost) || sync.cost > 0.03)
    return { ok: false, code: 'sync' };
  const bts = side.frames.flatMap((f, i) =>
    f.t >= from && f.t <= to && sync.backTime[i] != null ? [sync.backTime[i]!] : []
  );
  if (bts.length < 10) return { ok: false, code: 'range' };
  const margin = Math.max(0.25, medianStep(back) * 6);
  const bFirst = backT.frames[0]?.t ?? 0;
  const bLast = backT.frames[backT.frames.length - 1]?.t ?? 0;
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return {
    ok: true,
    side: { fromSec: r3(from), toSec: r3(to) },
    back: {
      fromSec: r3(Math.max(bFirst, Math.min(...bts) - margin)),
      toSec: r3(Math.min(bLast, Math.max(...bts) + margin)),
    },
    events: { kneeUp, footPlant: fp, release: rel },
    frames: Math.round((to - from) * 120),
  };
}

/** fit 입력 모양 검사 → 맞추기 → 저장할 JSON 문자열(실패도 결과 모양이다) */
export function runFit(raw: unknown): string {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const jobId =
    typeof r.jobId === 'string' ? r.jobId : '00000000-0000-4000-8000-000000000000';
  const side = readV2Track(r.side);
  const back = readV2Track(r.back);
  if (!side || !back) return JSON.stringify(v2Fail(jobId, 'video', 'fit'));
  const input: V2Input = {
    side,
    back,
    hand: r.hand === 'L' ? 'L' : 'R',
    heightCm: typeof r.heightCm === 'number' ? r.heightCm : null,
    jobId,
    poseModel: typeof r.poseModel === 'string' ? r.poseModel : 'unknown',
    screenRecorded: r.screenRecorded === true,
    slowmoFps: typeof r.slowmoFps === 'number' ? r.slowmoFps : null,
  };
  let result;
  try {
    result = fitPitch3dV2(input).result;
  } catch (err) {
    console.error('[pitch3d v2 fit]', err instanceof Error ? err.stack : err);
    return JSON.stringify(v2Fail(jobId, 'internal', 'fit'));
  }
  const stored = storedV2ResultJson(result);
  if ('error' in stored) {
    console.error('[pitch3d v2 fit]', stored.error);
    return JSON.stringify(v2Fail(jobId, 'internal', 'fit'));
  }
  return stored.json;
}

/* 명령줄 */
const [, , mode, inPath, outPath] = process.argv;
if (mode === 'segment' || mode === 'fit') {
  if (!inPath || !outPath) {
    console.error('쓰는 법: node run-node.ts <segment|fit> <in.json> <out.json>');
    process.exit(2);
  }
  const raw = JSON.parse(readFileSync(inPath, 'utf8'));
  const out = mode === 'segment' ? JSON.stringify(pickSegment(raw)) : runFit(raw);
  writeFileSync(outPath, out);
}
