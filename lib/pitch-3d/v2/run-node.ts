import { readFileSync, writeFileSync } from 'node:fs';
import { detectPitchEvents } from '@/lib/pose/detect';
import { medianStep, prepareView, syncViews } from '@/lib/pitch-3d/motion';
import { cross, dot, norm, normalize, sub, type Vec3 } from '@/lib/pitch-3d/linalg';
import {
  MAX_V2_FRAMES,
  storedV2ResultJson,
  V2J,
  v2Fail,
  type Pitch3dV2Ok,
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

/**
 * 던지는 팔 진단(Modal 로그 한 줄, 2026-10-08 '릴리스 때 팔이 튄다' 조사) — 숫자만, 개인 정보 없음.
 * 굽힘 축(위팔 × 아래팔)이 앞 장면과 반대면 3D 화면의 팔 조각이 180° 돈다(pose-rig bendAxis). 손바닥(새끼 − 검지)도 같다.
 * rows: [릴리스에서 몇 장면, 팔꿈치 굽힘°(0 = 폄), 굽힘 축 뒤집힘, 손바닥 뒤집힘, 손목 이동 mm(키 1000), 어깨 · 팔꿈치 · 손목 확신]
 * jumps: 모든 관절 중 가장 큰 장면 사이 이동 셋, empty: 던지는 어깨 · 팔꿈치 · 손목이 빈(확신 0) 장면 수.
 */
export function armDiag(r: Pitch3dV2Ok) {
  const L = r.hand === 'L';
  const [S, E, W, I, P] = L
    ? [V2J.lSh, V2J.lEl, V2J.lWr, V2J.lHandIdx, V2J.lHandPinky]
    : [V2J.rSh, V2J.rEl, V2J.rWr, V2J.rHandIdx, V2J.rHandPinky];
  const { footPlant: fp, release: rel } = r.events;
  let prevBend: Vec3 | null = null;
  let prevPalm: Vec3 | null = null;
  let flips = 0;
  let palmFlips = 0;
  let maxStep = 0;
  const rows: number[][] = [];
  r.joints.forEach((j, k) => {
    const up = sub(j[E] as Vec3, j[S] as Vec3);
    const fo = sub(j[W] as Vec3, j[E] as Vec3);
    const c = cross(up, fo);
    const sin = norm(c) / Math.max(1e-9, norm(up) * norm(fo));
    const flex =
      (Math.acos(Math.max(-1, Math.min(1, dot(normalize(up), normalize(fo))))) * 180) /
      Math.PI;
    const bend = sin >= 0.15 ? normalize(c) : null;
    const flip = bend && prevBend && dot(bend, prevBend) < 0 ? 1 : 0;
    if (bend) prevBend = bend;
    const palm = normalize(sub(j[P] as Vec3, j[I] as Vec3));
    const pFlip = prevPalm && dot(palm, prevPalm) < 0 ? 1 : 0;
    prevPalm = palm;
    const step = k > 0 ? norm(sub(j[W] as Vec3, r.joints[k - 1][W] as Vec3)) : 0;
    flips += flip;
    palmFlips += pFlip;
    maxStep = Math.max(maxStep, step);
    if (k >= fp - 8 && k <= rel + 8)
      rows.push([
        k - rel,
        Math.round(flex),
        flip,
        pFlip,
        Math.round(step),
        r.conf[k][S],
        r.conf[k][E],
        r.conf[k][W],
      ]);
  });
  /* 모든 관절 중 가장 큰 순간이동 셋 [릴리스에서 몇 장면, 관절 번호, mm, 그 장면 확신] · 던지는 팔 빈 장면(확신 0) 수 */
  const jumps: number[][] = [];
  for (let k = 1; k < r.joints.length; k++)
    r.joints[k].forEach((p, jj) =>
      jumps.push([
        k - rel,
        jj,
        Math.round(norm(sub(p as Vec3, r.joints[k - 1][jj] as Vec3))),
        r.conf[k][jj],
      ])
    );
  jumps.sort((a, b) => b[2] - a[2]);
  const empty = [S, E, W].map((jj) => r.conf.filter((c) => c[jj] === 0).length);
  const dt = r.t.length > 1 ? (r.t[r.t.length - 1] - r.t[0]) / (r.t.length - 1) : 0;
  return {
    n: r.joints.length,
    fps: dt > 0 ? Math.round(1 / dt) : 0,
    fp: fp - rel,
    flips,
    palmFlips,
    maxStep: Math.round(maxStep),
    jumps: jumps.slice(0, 3),
    empty,
    rows,
  };
}

/** segment 가 찾은 순간(원본 영상 초) — 모양이 틀리면 undefined(맞추기가 구간 안에서 다시 찾는다) */
export function readV2Events(raw: unknown): V2Input['events'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const footPlant = num(r.footPlant);
  const release = num(r.release);
  if (footPlant == null || release == null || !(release > footPlant)) return undefined;
  return { kneeUp: num(r.kneeUp), footPlant, release };
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
    /* 거친 전체 영상에서 찾은 순간을 넘겨받는다 — 잘라 낸 구간에서 다시 찾으면 실패했다(2026-10-08 샘플 1 · 3, fit 단계 events) */
    events: readV2Events(r.events),
  };
  let result;
  try {
    result = fitPitch3dV2(input).result;
    if (result.ok) console.error('[pitch3d diag] ' + JSON.stringify(armDiag(result)));
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
