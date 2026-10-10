/**
 * 3D 투구 분석 v2 시험 — 약속(관절 표 · 결과 읽기 · 작업 상태 기계) + (뒤 단계에서) 맞추기 엔진 합성 시험.
 *
 *   npm run pitch3d:v2-test
 *
 * v1 시험(npm run pitch3d:test, 63개)은 그대로 둔다 — v2 가 v1 을 깨지 않았는지는 그쪽이 본다(E-REG).
 */
import {
  applyGpuStatus,
  canRequestV2,
  isV2JobActive,
  MAX_V2_FRAMES,
  MAX_V2_RESULT_BYTES,
  N_V2_JOINTS,
  newV2Job,
  PITCH3D_V2_VERSION,
  readPitch3dV2Job,
  readPitch3dV2Result,
  RTMW_INDEX,
  storedV2ResultJson,
  V2_FAIL_TEXT,
  V2_JOB_TIMEOUT_MS,
  V2_PAIRS,
  V2_PARENT,
  V2_JOINTS,
  V2J,
  v2Fail,
  v2WaitingText,
  type Pitch3dV2Ok,
} from '../lib/pitch-3d/v2/contract.ts';
import { J, JOINTS, N_JOINTS } from '../lib/pitch-3d/motion.ts';
import { analyzePitch3d, type Pitch3dOk as V1Ok } from '../lib/pitch-3d/analyze.ts';
import { project } from '../lib/pitch-3d/camera.ts';
import type { MetricKey } from '../lib/pitch-3d/metrics.ts';
import { fitPitch3dV2, fixHingeFlips } from '../lib/pitch-3d/v2/fit.ts';
import { add, cross, dot, norm, normalize, scale, sub, type Vec3 } from '../lib/pitch-3d/linalg.ts';
import { pickSegment, readV2Events, runFit, segmentWindow } from '../lib/pitch-3d/v2/run-node.ts';
import { toPoseTrack } from '../lib/pitch-3d/v2/track.ts';
import {
  base,
  cameras,
  EV,
  realistic,
  truthMetrics,
  type Scenario,
} from './pitch-lab/synth.mts';
import { makeV2Track } from './pitch-lab/synth-v2.mts';
import { footJump, footSway, gapWristError, hipSnap, leadGapJump } from './pitch-lab/gap-check.mts';
import { readFileSync } from 'node:fs';
import { blendAi, despike, displayTrack, readAiGate, readAiJoints, readAiMiss } from '../lib/pitch-3d/v2/display.ts';
import { KIN_LIMITS, KIN_SPEED, kinematicTrack, twoBoneIk } from '../lib/pitch-3d/v2/kinematics.ts';
import {
  moundHeightAt,
  PART_NAMES,
  placePoint,
  readSkeletonParts,
  rigPose,
  type RigPose,
} from '../lib/pitch-3d/v2/pose-rig.ts';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? 'OK  ' : '실패'} ${name}${detail ? ' — ' + detail : ''}`);
}

const JOB_ID = '2b0c7c1e-8f7a-4d1e-9a51-0c9d2f3e4a5b';
const JOB_ID2 = '3c1d8d2f-9a8b-4e2f-8b62-1dae3a4f5b6c';

/* ───────────────────────────── 관절 표 ───────────────────────────── */
console.log('■ 관절 표(RTMW 133 → 25)');
{
  check('관절 25개', N_V2_JOINTS === 25);
  check(
    '앞 17개는 v1 차례와 같다',
    (Object.keys(J) as (keyof typeof J)[]).every((k) => V2J[k] === J[k]) &&
      N_JOINTS === 17
  );
  check(
    '앞 17개의 MediaPipe 번호 = v1 JOINTS',
    JOINTS.every((mp, i) => V2_JOINTS[i].mp === mp)
  );
  const rt = new Set(RTMW_INDEX);
  check(
    'RTMW 번호가 겹치지 않고 0~132 안',
    rt.size === N_V2_JOINTS && RTMW_INDEX.every((i) => i >= 0 && i < 133)
  );
  check(
    '좌우 짝 12 — 코만 짝 없음',
    V2_PAIRS.length === 12 && V2_JOINTS.filter((j) => !j.pair).length === 1
  );
  check(
    '짝은 서로를 가리킨다(거울이 왕복)',
    V2_PAIRS.every(
      ([l, r]) =>
        V2_JOINTS[l].pair === V2_JOINTS[r].name &&
        V2_JOINTS[r].pair === V2_JOINTS[l].name
    )
  );
  check(
    '좌 · 우 짝의 RTMW 번호 — 몸은 왼쪽이 홀수(COCO), 손은 왼손 91~111 · 오른손 112~132 로 같은 손가락',
    V2_PAIRS.every(([l, r]) => {
      const a = V2_JOINTS[l].rtmw;
      const b = V2_JOINTS[r].rtmw;
      if (a >= 91) return b === a + 21;
      if (a >= 17) return b === a + 3;
      return a % 2 === 1 && b === a + 1;
    })
  );
  check(
    '부모는 몸통 쪽으로(어깨 → 팔꿈치 → 손목 → 손, 골반 → 무릎 → 발목 → 발)',
    V2_PARENT[V2J.lHandMid] === V2J.lWr &&
      V2_PARENT[V2J.rHandPinky] === V2J.rWr &&
      V2_PARENT[V2J.lTo] === V2J.lAn &&
      V2_PARENT[V2J.rEar] === V2J.nose &&
      V2_PARENT[V2J.lSh] === undefined
  );
}

/* ───────────────────────────── 결과 읽기 ───────────────────────────── */
console.log('■ 결과 읽기');
const good = (): Pitch3dV2Ok => {
  const n = 40;
  return {
    ok: true,
    version: PITCH3D_V2_VERSION,
    jobId: JOB_ID,
    hand: 'R',
    engine: { v1: '0.1.0', pose: 'rtmw-l' },
    t: Array.from({ length: n }, (_, i) => i / 120),
    tBack: Array.from({ length: n }, (_, i) => 0.3 + i / 120),
    joints: Array.from({ length: n }, () =>
      Array.from({ length: N_V2_JOINTS }, (_, j) => [
        j * 10,
        1000 - j * 30,
        j % 2 ? 100 : -100,
      ])
    ),
    conf: Array.from({ length: n }, () =>
      Array.from({ length: N_V2_JOINTS }, () => 90)
    ),
    lowConf: [[30, 33]],
    events: { kneeUp: 2, footPlant: 20, release: 30 },
    metrics: [
      { key: 'trunkForwardTilt', value: 30.1, unit: 'deg', pm: 3, trust: 'high' },
    ],
    quality: {
      reprojPct: 1.1,
      boneCv: { trunk: 2, legs: 2, upperArm: 3, forearm: 4 },
      axisAngleDeg: 88,
      focal: { side: 1.1, back: 1.0, spread: 0.1 },
      density: { side: 120, back: 120 },
      coverage: 1,
      syncCost: 0.004,
      calibration: 'high',
      flips: { side: 0, back: 0, repaired: 0, handSwapped: false, backMirrored: false },
      travelVsBackDeg: 3,
      offsetFrames: 0.2,
    },
    fit: {
      boneCvPct: 0.3,
      reprojPct: 1.4,
      filled: 12,
      accelP95: 0.02,
      boneLen: { '3': 0.186 },
    },
    warnings: ['narrow'],
    cameras: {
      side: {
        f: 1200,
        cx: 540,
        cy: 960,
        R: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        t: [0, 0, 3],
        W: 1080,
        H: 1920,
      },
      back: {
        f: 1200,
        cx: 540,
        cy: 960,
        R: [0, 0, 1, 0, 1, 0, -1, 0, 0],
        t: [0, 0, 3],
        W: 1080,
        H: 1920,
      },
    },
    segment: { fromSec: 1.2, toSec: 2.4 },
  };
};
{
  const g = good();
  check('좋은 결과 통과', readPitch3dV2Result(g) === g);
  check(
    '실패 결과 — 까닭 글은 코드로 다시(저장된 글을 믿지 않음)',
    (() => {
      const f = readPitch3dV2Result({
        ...v2Fail(JOB_ID, 'fit', 'fit'),
        reason: '<script>',
      });
      return (
        !!f &&
        !f.ok &&
        f.code === 'fit' &&
        f.reason === V2_FAIL_TEXT.fit &&
        f.stage === 'fit'
      );
    })()
  );
  check(
    '모르는 실패 코드 거절',
    readPitch3dV2Result({ ...v2Fail(JOB_ID, 'fit', 'fit'), code: 'nope' }) === null
  );
  check(
    '판 번호 다르면 거절',
    readPitch3dV2Result({ ...g, version: '1.9.0' }) === null
  );
  check(
    '작업 번호가 UUID 가 아니면 거절',
    readPitch3dV2Result({ ...g, jobId: '../x' }) === null
  );
  check(
    '관절 수 틀리면 거절',
    readPitch3dV2Result({ ...g, joints: g.joints.map((f) => f.slice(0, 17)) }) === null
  );
  check(
    '좌표가 정수(mm)가 아니면 거절',
    readPitch3dV2Result({
      ...g,
      joints: g.joints.map((f) => f.map(() => [0.5, 1, 2])),
    }) === null
  );
  check(
    '빈 칸(null) 거절 — v2 는 빈 관절이 없다',
    readPitch3dV2Result({
      ...g,
      joints: g.joints.map((f) => f.map((p, j) => (j === 5 ? null : p))),
    }) === null
  );
  check(
    '확신 0~100 밖 거절',
    readPitch3dV2Result({ ...g, conf: g.conf.map((c) => c.map(() => 101)) }) === null
  );
  check(
    '순간 번호가 장면 밖이면 거절',
    readPitch3dV2Result({ ...g, events: { ...g.events, release: 40 } }) === null
  );
  check(
    '엷은 구간 [시작 > 끝] 거절',
    readPitch3dV2Result({ ...g, lowConf: [[5, 2]] }) === null
  );
  check(
    '장면 상한(600 + 3) 넘으면 거절',
    (() => {
      const n = MAX_V2_FRAMES + 4;
      const big = {
        ...g,
        t: Array.from({ length: n }, (_, i) => i),
        joints: Array.from({ length: n }, () => g.joints[0]),
        conf: Array.from({ length: n }, () => g.conf[0]),
      };
      return readPitch3dV2Result(big) === null;
    })()
  );
  check(
    '카메라 없음(null)은 됨 · 모양 틀리면 거절',
    readPitch3dV2Result({ ...g, cameras: null }) !== null &&
      readPitch3dV2Result({ ...g, cameras: { side: g.cameras!.side } }) === null
  );
  check('모르는 경고 거절', readPitch3dV2Result({ ...g, warnings: ['x'] }) === null);
  check(
    '구간 끝 < 시작 거절',
    readPitch3dV2Result({ ...g, segment: { fromSec: 2, toSec: 1 } }) === null
  );
  const s = storedV2ResultJson(g);
  check('저장 문자열 — 통과', 'json' in s && JSON.parse(s.json).jobId === JOB_ID);
  /* 600장 × 25관절 — 상한 900KB 안인지(0-3절 5번: 정수 mm · 확신 정수) */
  const n = MAX_V2_FRAMES;
  const full = {
    ...g,
    tBack: Array.from({ length: n }, (_, i) => 0.3 + i / 120),
    t: Array.from({ length: n }, (_, i) => Math.round((i / 120) * 1000) / 1000),
    joints: Array.from({ length: n }, (_, i) =>
      Array.from({ length: N_V2_JOINTS }, (_, j) => [
        ((i * 7 + j * 13) % 2000) - 1000,
        (i * 3 + j * 29) % 2000,
        ((i * 11 + j * 5) % 2000) - 1000,
      ])
    ),
    conf: Array.from({ length: n }, (_, i) =>
      Array.from({ length: N_V2_JOINTS }, (_, j) => (i * j) % 101)
    ),
    lowConf: [
      [10, 20],
      [300, 320],
    ] as [number, number][],
  };
  const fs = storedV2ResultJson(full);
  check(
    `600장 × 25관절 결과가 상한 안(${MAX_V2_RESULT_BYTES / 1000}KB)`,
    'json' in fs,
    'json' in fs
      ? `${Math.round(fs.json.length / 1000)}KB`
      : (fs as { error: string }).error
  );
}

/* ───────────────────────────── 작업 상태 기계 ───────────────────────────── */
console.log('■ 작업 상태(job.json)');
{
  const T0 = Date.parse('2026-10-08T05:00:00.000Z');
  const iso = (ms: number) => new Date(ms).toISOString();
  check('없음 → 걸 수 있음', 'ok' in canRequestV2(null, T0));
  const q = newV2Job(null, {
    jobId: JOB_ID,
    requestedBy: 'admin1',
    consentAt: iso(T0 - 1000),
    now: iso(T0),
  });
  check(
    '새 작업 = queued · 이전 결과 없음',
    q.status === 'queued' && q.shownJobId === null && q.engine === PITCH3D_V2_VERSION
  );
  check('queued 중 다시 걸기 거절(Busy)', 'error' in canRequestV2(q, T0 + 60_000));
  check(
    '15분 지난 queued 는 다시 걸 수 있음',
    'ok' in canRequestV2(q, T0 + V2_JOB_TIMEOUT_MS) &&
      !isV2JobActive(q, T0 + V2_JOB_TIMEOUT_MS)
  );

  const r1 = applyGpuStatus(
    q,
    JOB_ID,
    { kind: 'running', stages: { download: 4.2 } },
    false,
    T0 + 10_000
  );
  check(
    'running 으로 · 시작 시각 · 단계 시간',
    r1.status === 'running' &&
      r1.startedAt === iso(T0 + 10_000) &&
      r1.stages.download === 4.2
  );
  const stale = applyGpuStatus(r1, JOB_ID2, { kind: 'done' }, true, T0 + 20_000);
  check('번호가 다른(옛) 답은 버림', stale === r1);
  const half = applyGpuStatus(r1, JOB_ID, { kind: 'done' }, false, T0 + 30_000);
  check(
    'GPU 가 done 이라도 결과 파일이 없으면 running 그대로',
    half.status === 'running'
  );
  const d = applyGpuStatus(
    r1,
    JOB_ID,
    { kind: 'done', stages: { fit: 31 } },
    true,
    T0 + 40_000
  );
  check(
    'done — 보여 줄 번호 = 이 작업, 단계 합침',
    d.status === 'done' &&
      d.shownJobId === JOB_ID &&
      d.stages.download === 4.2 &&
      d.stages.fit === 31 &&
      d.finishedAt === iso(T0 + 40_000)
  );
  check(
    'done 뒤에는 무엇이 와도 그대로',
    applyGpuStatus(d, JOB_ID, { kind: 'failed', code: 'gpu' }, true, T0 + 50_000) === d
  );
  check('done 에서 다시 걸 수 있음', 'ok' in canRequestV2(d, T0 + 50_000));

  const q2 = newV2Job(d, {
    jobId: JOB_ID2,
    requestedBy: 'admin1',
    consentAt: iso(T0),
    now: iso(T0 + 60_000),
  });
  check(
    '다시 분석 — 이전 done 결과를 이어 보인다(shownJobId)',
    q2.status === 'queued' && q2.shownJobId === JOB_ID && q2.jobId === JOB_ID2
  );
  const f2 = applyGpuStatus(
    q2,
    JOB_ID2,
    { kind: 'failed', code: 'video' },
    false,
    T0 + 90_000
  );
  check(
    '실패 — 까닭 글은 코드로, 이전 결과 번호는 그대로',
    f2.status === 'failed' &&
      f2.fail?.code === 'video' &&
      f2.fail.reason === V2_FAIL_TEXT.video &&
      f2.shownJobId === JOB_ID
  );
  const to = applyGpuStatus(
    q2,
    JOB_ID2,
    { kind: 'running' },
    false,
    T0 + 60_000 + V2_JOB_TIMEOUT_MS
  );
  check('15분 넘으면 timeout', to.status === 'failed' && to.fail?.code === 'timeout');
  const unk = applyGpuStatus(q2, JOB_ID2, { kind: 'unknown' }, false, T0 + 70_000);
  check('묻기 실패(unknown)는 상태 그대로(다음 물음에 다시)', unk.status === 'queued');

  /* 읽기 */
  const read = readPitch3dV2Job(JSON.parse(JSON.stringify(f2)));
  check(
    'job.json 왕복',
    !!read &&
      read.status === 'failed' &&
      read.fail?.code === 'video' &&
      read.shownJobId === JOB_ID &&
      read.requestedBy === 'admin1'
  );
  check(
    '모양 틀린 job.json 은 null',
    readPitch3dV2Job({ status: 'queued' }) === null &&
      readPitch3dV2Job({ ...q, status: 'flying' }) === null
  );
  check(
    'failed 인데 까닭이 없으면 internal 로',
    readPitch3dV2Job({ ...f2, fail: null })?.fail?.code === 'internal'
  );
  check(
    '기다림 글 — 시간만',
    v2WaitingText(q, T0 + 60_000).includes('1~2분') &&
      v2WaitingText(q, T0 + 5 * 60_000).includes('조금 더') &&
      v2WaitingText(q, T0 + 11 * 60_000).includes('15분')
  );
}

/* ───────────────────────────── 맞추기 엔진(합성 투수) ───────────────────────────── */
console.log('■ 맞추기 엔진 — 합성 투수(25관절)');
const p95 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] : 0;
};
/** v1 결과(키 = 1)의 장면 사이 가속 p95 — 빈 관절은 건너뜀 */
const accelV1 = (r: V1Ok) => {
  const acc: number[] = [];
  for (let k = 1; k < r.joints.length - 1; k++)
    for (let j = 0; j < N_JOINTS; j++) {
      const a = r.joints[k - 1][j];
      const b = r.joints[k][j];
      const c = r.joints[k + 1][j];
      if (a && b && c)
        acc.push(
          Math.hypot(
            c[0] - 2 * b[0] + a[0],
            c[1] - 2 * b[1] + a[1],
            c[2] - 2 * b[2] + a[2]
          )
        );
    }
  return p95(acc);
};
function runV2(sc: Scenario, seed: number) {
  const { side: camS, back: camB } = cameras(sc);
  const s = makeV2Track(sc, camS, sc.side, 'side', seed * 10 + 1);
  const b = makeV2Track(sc, camB, sc.back, 'back', seed * 10 + 2);
  const events = {
    kneeUp: s.toMedia(EV.kneeUp),
    footPlant: s.toMedia(EV.footPlant),
    release: s.toMedia(EV.release),
  };
  const t0 = Date.now();
  const { result, debug } = fitPitch3dV2({
    side: s.track,
    back: b.track,
    hand: sc.hand,
    heightCm: 183,
    jobId: JOB_ID,
    poseModel: 'synth',
    screenRecorded: true,
    slowmoFps: 240,
    events,
  });
  const ms = Date.now() - t0;
  const v1 = analyzePitch3d({
    side: toPoseTrack(s.track),
    back: toPoseTrack(b.track),
    hand: sc.hand,
    screenRecorded: true,
    slowmoFps: 240,
    events,
  });
  /* 지표 오차(진짜 3D 에서 같은 지표 함수로, synth.run 과 같은 길) */
  const errors: Partial<Record<MetricKey, number>> = {};
  if (result.ok) {
    const keys = [...s.contentReal.keys()];
    const realOf = (tm: number) => {
      let best = keys[0];
      for (const k of keys) if (Math.abs(k - tm) < Math.abs(best - tm)) best = k;
      return s.contentReal.get(best)!;
    };
    const truth = truthMetrics(sc, result.t.map(realOf), {
      kneeUp: result.events.kneeUp ?? 0,
      footPlant: result.events.footPlant,
      release: result.events.release,
    });
    for (const m of result.metrics) {
      const tr = truth.find((x) => x.key === m.key);
      if (tr) errors[m.key] = m.value - tr.value;
    }
  }
  return { result, debug, v1, ms, errors, side2d: s.track };
}
/* v1 시험의 기준(빠른 판 — 무너짐을 잡는 넉넉한 문턱)과 같다. 어깨 벌림만 2.5 — 뼈 길이를 좌우 같은 값으로 굳히면 깨끗한 합성에서도 2° 쯤 움직인다(v1 1.1°) */
const V2_CLEAN: Partial<Record<MetricKey, number>> = {
  trunkForwardTilt: 1.5,
  trunkLateralTilt: 1.5,
  separationMax: 1.5,
  leadKneeAtPlant: 1.5,
  strideLength: 1,
  shoulderAbduction: 2.5,
};
const V2_MAX: Partial<Record<MetricKey, number>> = {
  trunkForwardTilt: 10,
  trunkLateralTilt: 5,
  separationMax: 13,
  leadKneeAtPlant: 8,
  strideLength: 4,
  shoulderAbduction: 14,
};
const V2_SCENARIOS: { sc: Scenario; budget: Partial<Record<MetricKey, number>> }[] = [
  { sc: { ...base, name: '깨끗함' }, budget: V2_CLEAN },
  {
    sc: { ...base, ...realistic, name: '실제처럼(잡음 · 가려짐 · 뒤바뀜 · 슬로모 차)' },
    budget: V2_MAX,
  },
  {
    sc: {
      ...base,
      ...realistic,
      hand: 'L',
      backMirror: true,
      name: '좌투 · 뒤 영상 거울',
    },
    budget: V2_MAX,
  },
  {
    sc: {
      ...base,
      ...realistic,
      name: '가까이 넓게(원근 강함)',
      side: { ...base.side, D: 3.2, k: 0.9 },
      back: { ...base.back, D: 3.4, k: 0.95 },
    },
    budget: V2_MAX,
  },
];
for (const { sc, budget } of V2_SCENARIOS) {
  const { result, debug, v1, ms, errors } = runV2(sc, 1);
  if (!result.ok || !debug) {
    check(
      `${sc.name} — 맞추기 성공`,
      false,
      result.ok ? '' : `${result.code} ${result.stage}`
    );
    continue;
  }
  const n = result.t.length;
  console.log(
    `  · ${sc.name}: ${ms}ms · 장면 ${n} · 뼈 흔들림 ${result.fit.boneCvPct}% · 다시 비춤 ${result.fit.reprojPct}% · 채운 관절 ${result.fit.filled} · 가속 p95 ${result.fit.accelP95}(v1 ${v1.ok ? accelV1(v1).toFixed(4) : '-'}) · 엷은 구간 ${JSON.stringify(result.lowConf)} · 경고 ${result.warnings.join(',') || '없음'}`
  );
  check(
    `${sc.name} · 모든 장면 · 관절이 있고 숫자(빈 칸 0)`,
    result.joints.every(
      (fr) => fr.length === N_V2_JOINTS && fr.every((p) => p.every(Number.isInteger))
    ) && result.conf.every((c) => c.length === N_V2_JOINTS)
  );
  check(
    `${sc.name} · 뼈 길이 흔들림 1% 밑(핵심 합격)`,
    result.fit.boneCvPct < 1,
    `${result.fit.boneCvPct}%`
  );
  if (v1.ok)
    check(
      `${sc.name} · 장면 사이 가속 p95 가 v1 보다 작다(핵심 합격)`,
      result.fit.accelP95 < accelV1(v1),
      `v2 ${result.fit.accelP95} · v1 ${accelV1(v1).toFixed(4)}`
    );
  check(
    `${sc.name} · 순간 번호가 장면 안 · 착지 < 릴리스`,
    result.events.footPlant < result.events.release && result.events.release < n
  );
  check(`${sc.name} · 결과 읽기 통과 · 상한 안`, 'json' in storedV2ResultJson(result));
  for (const [key, lim] of Object.entries(budget)) {
    const e = errors[key as MetricKey];
    check(
      `${sc.name} · ${key} 오차 ±${lim} 안`,
      e != null && Math.abs(e) <= lim,
      e == null ? '값 없음' : `${e.toFixed(2)}`
    );
  }
  /* 손 · 귀가 제자리에: 손 MCP 는 같은 쪽 손목에서 뼈 길이(0.09)만큼, 귀는 코에서 0.09 — 좌우가 엇갈리면 1.5~2배로 튄다 */
  const dist = (a: number[], b: number[]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 1000;
  const handOk = result.joints.every(
    (fr) =>
      Math.abs(dist(fr[V2J.lHandMid], fr[V2J.lWr]) - 0.09) < 0.02 &&
      Math.abs(dist(fr[V2J.rHandMid], fr[V2J.rWr]) - 0.09) < 0.02
  );
  const earOk = result.joints.every(
    (fr) =>
      Math.abs(dist(fr[V2J.lEar], fr[V2J.nose]) - 0.09) < 0.02 &&
      dist(fr[V2J.lEar], fr[V2J.rEar]) > 0.1
  );
  check(`${sc.name} · 손 MCP 가 같은 쪽 손목에 붙어 있다`, handOk);
  check(`${sc.name} · 귀가 코 옆에 붙어 있다`, earOk);
  /* 왼손 MCP 는 왼손목 쪽: 왼손목과의 거리 < 오른손목과의 거리(팔이 모일 때 빼고 대부분) */
  const sideOk = result.joints
    .filter((fr) => dist(fr[V2J.lWr], fr[V2J.rWr]) > 0.3)
    .every(
      (fr) => dist(fr[V2J.lHandMid], fr[V2J.lWr]) < dist(fr[V2J.lHandMid], fr[V2J.rWr])
    );
  check(`${sc.name} · 왼손 점이 왼손목 쪽(좌우 안 엇갈림)`, sideOk);
  /* 카메라를 결과 좌표계로 옮긴 것이 맞나 — 착지 장면의 어깨를 결과 카메라로 비추면 2D 관찰과 맞아야 한다 */
  if (result.cameras) {
    const k = result.events.footPlant;
    const core = debug.core;
    const obs = core.synced[k].side[J.lSh];
    const P = result.joints[k][V2J.lSh].map((v) => v / 1000) as [
      number,
      number,
      number,
    ];
    const pr = project(
      { ...result.cameras.side, R: result.cameras.side.R, t: result.cameras.side.t },
      P
    );
    const err = pr
      ? Math.hypot(pr[0] - obs.x, pr[1] - obs.y) / core.side.person
      : Infinity;
    check(
      `${sc.name} · 결과 카메라로 다시 비춘 어깨가 2D 관찰과 맞다(사람 높이 3% 안)`,
      err < 0.03,
      `${(err * 100).toFixed(1)}%`
    );
  }
  /* v1 과 같은 17관절 — 결과 좌표에서 평균 거리(키 단위) */
  if (v1.ok) {
    let s = 0;
    let c = 0;
    const m = Math.min(v1.joints.length, result.joints.length);
    for (let k = 0; k < m; k++)
      for (let j = 0; j < N_JOINTS; j++) {
        const a = v1.joints[k][j];
        if (!a) continue;
        s += dist(
          result.joints[k][j],
          a.map((v) => v * 1000)
        );
        c++;
      }
    const mean = c ? s / c : NaN;
    check(
      `${sc.name} · v1 관절과 평균 거리 키의 5% 안(같은 길 위에 뼈 길이만 고정)`,
      mean < 0.05,
      `${(mean * 100).toFixed(1)}%`
    );
  }
}
{
  const { result } = runV2({ ...base, ...realistic, name: '엷은 구간' }, 2);
  check(
    '실제처럼 — 릴리스 근처(손목 · 팔꿈치 흐림)가 엷은 구간에 든다',
    result.ok &&
      result.lowConf.some(
        ([a, b]) => a <= result.events.release && result.events.release <= b
      ),
    result.ok ? JSON.stringify(result.lowConf) : result.code
  );
  const clean = runV2({ ...base, name: '깨끗함' }, 3).result;
  check(
    '깨끗함 — 채운 관절 0(엷은 구간은 릴리스 흐림으로 있을 수 있다)',
    clean.ok && clean.fit.filled === 0,
    clean.ok
      ? `채움 ${clean.fit.filled} · ${JSON.stringify(clean.lowConf)}`
      : clean.code
  );
}

console.log('■ node 실행기(segment · fit)');
{
  /* 원본 영상처럼 — 슬로모 배수 1(실제 시간), 60fps 로 거칠게 */
  const sc: Scenario = {
    ...base,
    ...realistic,
    name: 'segment',
    slowSide: 1,
    slowBack: 1,
    offBack: 0.3,
    sampleSide: 1 / 60,
    sampleBack: 1 / 60,
    sideEnd: 2.4,
    backEnd: 2.6,
  };
  const { side: camS, back: camB } = cameras(sc);
  const s = makeV2Track(sc, camS, sc.side, 'side', 41);
  const b = makeV2Track(sc, camB, sc.back, 'back', 42);
  const seg = pickSegment({ side: s.track, back: b.track });
  check('구간을 고른다', seg.ok, seg.ok ? '' : seg.code);
  if (seg.ok) {
    const fp = s.toMedia(EV.footPlant);
    const rel = s.toMedia(EV.release);
    check(
      '옆 구간이 착지 · 릴리스를 품고 600장 안',
      seg.side.fromSec < fp && seg.side.toSec > rel && seg.frames <= MAX_V2_FRAMES,
      JSON.stringify(seg)
    );
    const bFp = b.toMedia(EV.footPlant);
    check(
      '뒤 구간이 같은 순간(시작 어긋남 0.3초)을 품는다',
      seg.back.fromSec < bFp && seg.back.toSec > b.toMedia(EV.release),
      JSON.stringify(seg.back)
    );
    check('순간을 찾았다(착지 < 릴리스)', seg.events.footPlant < seg.events.release);
  }
  check('segment: 입력 모양이 틀리면 video', !pickSegment({ side: null, back: {} }).ok);
  {
    /* 2026-10-10 샘플 5 — 240 슬로모션을 30fps 로 구운 영상(니업 6.0 · 착지 10.9 · 릴리스 13.5초, 길이 19.4초) */
    const w30 = segmentWindow({ kneeUp: 6, footPlant: 10.9, release: 13.53, first: 0, last: 19.37, fineFps: 30 });
    check(
      'segment 구간: 30fps 슬로모션은 착지 · 릴리스까지 담는다(예전 2.9~7.9초)',
      w30.from <= 6 && w30.to >= 13.53 && (w30.to - w30.from) * 30 <= 600,
      `${w30.from.toFixed(2)}~${w30.to.toFixed(2)}`
    );
    const w120 = segmentWindow({ kneeUp: 6, footPlant: 10.9, release: 13.53, first: 0, last: 19.37, fineFps: 120 });
    check(
      'segment 구간: 길어 600장을 넘으면 앞을 자르고 릴리스 뒤는 남긴다',
      w120.to >= 13.53 && (w120.to - w120.from) * 120 <= 600 + 1e-6,
      `${w120.from.toFixed(2)}~${w120.to.toFixed(2)}`
    );
  }
  /*
   * 투구 뒤 보통 속도로 홈 반대쪽으로 빨리 물러선 영상 — 골반이 가장 빨리 움직인 쪽을 홈으로 보면 반대가 되어, 팔이 가장 뒤로 간 순간
   * (다리를 든 때)을 릴리스로 잡았다(2026-10-09 좌투 샘플: '릴리스' 장면에 앞다리가 키의 90% 높이에 들려 있었다).
   */
  {
    const s2 = makeV2Track(sc, camS, sc.side, 'side', 41);
    const b2 = makeV2Track(sc, camB, sc.back, 'back', 42);
    const fr = s2.track.frames;
    const hipX = (f: (typeof fr)[number]) => (f.p[V2J.lHip][0] + f.p[V2J.rHip][0]) / 2;
    const iFp = fr.findIndex((f) => f.t >= s2.toMedia(EV.footPlant));
    const homeSign = Math.sign(hipX(fr[iFp]) - hipX(fr[0])) || 1;
    const trunkPx = Math.abs(fr[0].p[V2J.lSh][1] - fr[0].p[V2J.lHip][1]) || 100;
    const last = fr[fr.length - 1];
    const dt = fr[1].t - fr[0].t;
    for (let q = 1; q <= 12; q++)
      fr.push({
        t: last.t + q * dt,
        p: last.p.map((o) => [o[0] - homeSign * trunkPx * 0.6 * q, o[1], o[2]] as [number, number, number]),
      });
    const seg2 = pickSegment({ side: s2.track, back: b2.track });
    /* 고치기 전: 순간을 못 찾음(events) */
    check(
      '투구 뒤 반대쪽으로 빨리 물러서도 같은 릴리스를 찾는다(물러서지 않은 영상과 0.05초 안)',
      seg.ok && seg2.ok && Math.abs(seg2.events.release - seg.events.release) < 0.05,
      seg2.ok && seg.ok ? `${seg2.events.release.toFixed(2)} · ${seg.events.release.toFixed(2)}` : seg2.ok ? '' : seg2.code
    );
  }
  /*
   * 슬로모 끝의 보통 속도 구간 — 릴리스 0.1초 뒤부터 영상 시간이 6배 빨리 흐른다(팔로스루가 영상 시간으로 6배 빠름). 손목 빠르기만 보면 그쪽을
   * 채찍으로 잡아 릴리스를 팔로스루에서 찾았다(2026-10-09 좌투 샘플 — 릴리스가 영상 끝 0.23초 전).
   */
  {
    const s3 = makeV2Track(sc, camS, sc.side, 'side', 41);
    const b3 = makeV2Track(sc, camB, sc.back, 'back', 42);
    const tc = (seg.ok ? seg.events.release : s3.toMedia(EV.release)) + 0.1;
    for (const tr of [s3.track, b3.track])
      for (const f of tr.frames) if (f.t > tc) f.t = tc + (f.t - tc) / 6;
    const seg3 = pickSegment({ side: s3.track, back: b3.track });
    check(
      '슬로모 끝 보통 속도 구간이 있어도 같은 릴리스를 찾는다(0.05초 안)',
      seg.ok && seg3.ok && Math.abs(seg3.events.release - seg.events.release) < 0.05,
      seg3.ok && seg.ok ? `${seg3.events.release.toFixed(2)} · ${seg.events.release.toFixed(2)}` : seg3.ok ? '' : seg3.code
    );
  }
  /*
   * 던진 뒤 걸어 나가며 팔을 빨리 흔드는 장면(보통 속도 구간)에 던지는 손 쪽 발이 앞발을 지나 앞에 있다 — 손목이 가장 빠른 때를 채찍으로 보면
   * 그쪽을 릴리스로 잡았다(2026-10-09 좌투 샘플: 구간 전체가 투구 뒤로 밀림). 앞발이 던지는 손 반대쪽인 채찍을 쓴다.
   */
  if (seg.ok) {
    const s4 = makeV2Track(sc, camS, sc.side, 'side', 41);
    const b4 = makeV2Track(sc, camB, sc.back, 'back', 42);
    const fr = s4.track.frames;
    const hipX = (f: (typeof fr)[number]) => (f.p[V2J.lHip][0] + f.p[V2J.rHip][0]) / 2;
    const iFp = fr.findIndex((f) => f.t >= s4.toMedia(EV.footPlant));
    const homeSign = Math.sign(hipX(fr[iFp]) - hipX(fr[0])) || 1;
    const trunkPx = Math.abs(fr[0].p[V2J.lSh][1] - fr[0].p[V2J.lHip][1]) || 100;
    const last = fr[fr.length - 1];
    const dt = fr[1].t - fr[0].t;
    for (let q = 1; q <= 24; q++) {
      const p = last.p.map((o) => [...o] as [number, number, number]);
      /* 던지는 손(R) 손목이 어깨 둘레로 빠르게 앞뒤로 흔들림(걸을 때처럼) · 던지는 손 쪽 발(R)이 앞발보다 앞 */
      const shX = (last.p[V2J.lSh][0] + last.p[V2J.rSh][0]) / 2;
      p[V2J.rWr][0] = shX + homeSign * trunkPx * 1.0 * Math.sin((q * Math.PI) / 4);
      for (const j of [V2J.rAn, V2J.rHe, V2J.rTo]) p[j][0] = last.p[V2J.lAn][0] + homeSign * trunkPx * 0.9;
      fr.push({ t: last.t + q * dt, p });
    }
    const seg4 = pickSegment({ side: s4.track, back: b4.track });
    check(
      '던진 뒤 빠른 팔 흔들기(던지는 쪽 발이 앞)가 있어도 같은 릴리스를 찾는다(0.05초 안)',
      seg4.ok && Math.abs(seg4.events.release - seg.events.release) < 0.05,
      seg4.ok ? `${seg4.events.release.toFixed(2)} · ${seg.events.release.toFixed(2)}` : seg4.code
    );
  }
  /*
   * 앞발이 앞으로 가기를 멈춘 뒤에도 공중에서 내려오는 투수 — 예전엔 멈춘 순간을 착지로 잡아, 엔진이 공중의 발을 디딘 자리에 묶어 골반이
   * 한 장면에 12cm 튀었다(2026-10-09 좌투 샘플: 착지 뒤 0.45초 동안 발목이 몸통 길이의 0.35 내려옴). 발 높이로 착지를 다듬는다.
   */
  if (seg.ok) {
    const s5 = makeV2Track(sc, camS, sc.side, 'side', 41);
    const b5 = makeV2Track(sc, camB, sc.back, 'back', 42);
    const fr = s5.track.frames;
    const trunkPx = Math.abs(fr[0].p[V2J.lSh][1] - fr[0].p[V2J.lHip][1]) || 100;
    const fp0 = seg.events.footPlant;
    const LIFT = 0.12;
    /* 착지 0.1초 전부터 앞발(L)을 그대로 두되 몸통 길이 0.5 만큼 들었다가, 착지 뒤 LIFT 초 동안 내린다 */
    for (const f of fr) {
      const a = (f.t - (fp0 - 0.1)) / 0.1;
      const b = (f.t - fp0) / LIFT;
      const up = f.t < fp0 - 0.1 ? 0 : f.t < fp0 ? a : b < 1 ? 1 - b : 0;
      if (up > 0) for (const j of [V2J.lAn, V2J.lHe, V2J.lTo]) f.p[j][1] -= up * 0.5 * trunkPx;
    }
    const seg5 = pickSegment({ side: s5.track, back: b5.track });
    check(
      '착지 뒤에도 내려오는 앞발 — 착지를 발이 땅 가까이 온 때로(0.06 ~ 0.14초 늦게)',
      seg5.ok && seg5.events.footPlant - fp0 > 0.06 && seg5.events.footPlant - fp0 < 0.14,
      seg5.ok ? `${(seg5.events.footPlant - fp0).toFixed(3)}초` : seg5.code
    );
  }
  /*
   * 다리를 들며 앞발을 홈 쪽으로 내뻗는 투수 — 그 움직임이 내딛기보다 빠르면 예전엔 거기서 착지를 찾아, 아직 앞으로 가는 발을 땅에 묶었다
   * (2026-10-10 샘플 8: 착지 2.6초, 실제 4.5초). 니업 0.12초 전부터 0.04초 동안 발을 몸통 길이 1.2 만큼 내뻗고 0.08초 동안 되돌린다.
   */
  if (seg.ok) {
    const s6 = makeV2Track(sc, camS, sc.side, 'side', 41);
    const b6 = makeV2Track(sc, camB, sc.back, 'back', 42);
    const fr = s6.track.frames;
    const hipX = (f: (typeof fr)[number]) => (f.p[V2J.lHip][0] + f.p[V2J.rHip][0]) / 2;
    const iFp = fr.findIndex((f) => f.t >= s6.toMedia(EV.footPlant));
    const homeSign = Math.sign(hipX(fr[iFp]) - hipX(fr[0])) || 1;
    const trunkPx = Math.abs(fr[0].p[V2J.lSh][1] - fr[0].p[V2J.lHip][1]) || 100;
    const t0 = s6.toMedia(EV.kneeUp) - 0.12;
    for (const f of fr) {
      const u = (f.t - t0) / 0.04;
      const w = u < 0 ? 0 : u < 1 ? u : u < 3 ? 1 - (u - 1) / 2 : 0;
      if (w > 0) for (const j of [V2J.lAn, V2J.lHe, V2J.lTo]) f.p[j][0] += homeSign * w * 1.2 * trunkPx;
    }
    const seg6 = pickSegment({ side: s6.track, back: b6.track });
    check(
      '다리 들며 앞발을 빠르게 내뻗어도 같은 착지를 찾는다(0.05초 안)',
      seg6.ok && Math.abs(seg6.events.footPlant - seg.events.footPlant) < 0.05,
      seg6.ok ? `${seg6.events.footPlant.toFixed(3)} · ${seg.events.footPlant.toFixed(3)}` : seg6.code
    );
  }
  /* segment 가 찾은 순간을 fit 이 넘겨받는다 — 잘라 낸 구간에서 다시 찾다 실패한 2026-10-08 샘플 1 · 3 */
  check('fit 입력 순간: 착지 < 릴리스면 그대로', readV2Events({ kneeUp: 1, footPlant: 2, release: 2.5 })?.release === 2.5);
  check('fit 입력 순간: 뒤바뀌거나 없으면 버림(다시 찾기)', !readV2Events({ footPlant: 2, release: 1 }) && !readV2Events(null));
  if (seg.ok) {
    const withEv = JSON.parse(
      runFit({ side: s.track, back: b.track, hand: 'R', jobId: JOB_ID, poseModel: 'synth', screenRecorded: true, slowmoFps: 240, events: seg.events })
    );
    check('fit: segment 순간을 넘기면 끝까지 간다', withEv.ok === true, withEv.ok ? '' : String(withEv.code));
    /* 골반 가운데가 한 장면에 움직인 가장 큰 값(키 1000 단위) — from ~ to 영상 초 안 */
  }
  const json = runFit({
    side: s.track,
    back: b.track,
    hand: 'R',
    jobId: JOB_ID,
    poseModel: 'synth',
    screenRecorded: true,
    slowmoFps: 240,
  });
  const parsed = JSON.parse(json);
  check(
    'fit: JSON 하나로 돌려주고 읽기 검사를 지난다',
    readPitch3dV2Result(parsed) !== null && parsed.jobId === JOB_ID,
    parsed.ok ? '' : `${parsed.code}`
  );
  const bad = JSON.parse(runFit({ side: 1, back: 2, jobId: JOB_ID }));
  check(
    'fit: 입력이 틀리면 실패 결과(video)',
    bad.ok === false && bad.code === 'video'
  );
}

console.log('■ 뼈대 자세(pose-rig) — public/models/skeleton-parts.json + 합성 결과');
{
  const parts = readSkeletonParts(
    JSON.parse(readFileSync('public/models/skeleton-parts.json', 'utf8'))
  );
  check(
    '조각 표를 읽는다(부위 15 · 기준 방향 · 정점 수)',
    parts !== null && parts!.parts.length === 15 && parts!.vertexCount === 21526
  );
  check(
    '조각 표 모양이 틀리면 null',
    readSkeletonParts({ height: 1.7, parts: ['pelvis'] }) === null
  );
  if (parts) {
    const { result } = runV2({ ...base, ...realistic, name: 'rig' }, 5);
    if (!result.ok) check('rig — 결과', false, result.code);
    else {
      const frames = result.joints.map((fr) =>
        fr.map(
          (p) => [p[0] / 1000, p[1] / 1000, p[2] / 1000] as [number, number, number]
        )
      );
      let prev: RigPose | null = null;
      let nan = 0;
      let kneeErr = 0;
      let wristErr = 0;
      let flips = 0;
      const A = parts.anchors;
      for (let k = 0; k < frames.length; k++) {
        const pose = rigPose(frames[k], result.hand, parts, prev);
        for (const name of PART_NAMES) {
          const p = pose[name];
          if ([...p.position, ...p.R].some((v) => !Number.isFinite(v))) nan++;
          /* 회전이 회전인가(직교 · det 1) */
          const R = p.R;
          const det =
            R[0] * (R[4] * R[8] - R[5] * R[7]) -
            R[1] * (R[3] * R[8] - R[5] * R[6]) +
            R[2] * (R[3] * R[7] - R[4] * R[6]);
          if (Math.abs(det - 1) > 1e-6) flips++;
        }
        /* 모델 무릎(넙다리 끝) · 손목(아래팔 끝)이 맞춘 관절에 — 마디를 축 방향으로 늘여 닿게 한다 */
        const kneeW = placePoint(pose.thighL, A.thighL.distal, A.thighL.proximal);
        const wristW = placePoint(
          pose.forearmR,
          A.forearmR.distal,
          A.forearmR.proximal
        );
        const d = (a: number[], b: number[]) =>
          Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        kneeErr = Math.max(kneeErr, d(kneeW, frames[k][V2J.lKn]));
        wristErr = Math.max(wristErr, d(wristW, frames[k][V2J.rWr]));
        prev = pose;
      }
      check('모든 장면 · 부위의 자세가 숫자', nan === 0, `NaN ${nan}`);
      check('회전 행렬 det = 1(거울 아님)', flips === 0, `${flips}`);
      /* 고치기 전(모델 뼈 길이 그대로): 무릎 최대 키의 5~8% · 손목 8~12% 어긋나 땅에 묶인 발도 화면에선 미끄러졌다 */
      check(
        '모델 무릎이 맞춘 무릎에 닿는다(키의 0.5% 안)',
        kneeErr < 0.005,
        `최대 ${(kneeErr * 100).toFixed(2)}%`
      );
      check(
        '모델 손목이 맞춘 손목에 닿는다(키의 0.5% 안)',
        wristErr < 0.005,
        `최대 ${(wristErr * 100).toFixed(2)}%`
      );
      /*
       * 거의 편 팔꿈치(굽힘 12~20°)가 장면마다 반대쪽으로 꺾여도 팔 조각이 180° 돌지 않는다 — 2026-10-08 실제 샘플 1 에서
       * 굽힘 축(위팔 × 아래팔)이 4번 뒤집혀 던지는 팔이 홱 돌았다(run-node.ts armDiag).
       */
      {
        const f0 = frames[Math.floor(frames.length / 2)];
        const sh = f0[V2J.rSh];
        const wr = f0[V2J.rWr];
        const axis = [wr[0] - sh[0], wr[1] - sh[1], wr[2] - sh[2]];
        const perp = [-axis[1], axis[0], 0];
        const pn = Math.hypot(...perp) || 1;
        let prevRig: RigPose | null = null;
        let prevRef: number[] | null = null;
        let spins = 0;
        for (let k = 0; k < 12; k++) {
          const off = (k % 2 === 0 ? 1 : -1) * (0.03 + 0.01 * (k % 3));
          const fr = f0.map((p) => [...p] as [number, number, number]);
          fr[V2J.rEl] = [0, 1, 2].map(
            (d) => (sh[d] + wr[d]) / 2 + (perp[d] / pn) * off
          ) as [number, number, number];
          const pose = rigPose(fr, 'R', parts, prevRig);
          const R = pose.upperArmR.R;
          const r = A.upperArmR.ref;
          const ref = [0, 1, 2].map((i) => R[i * 3] * r[0] + R[i * 3 + 1] * r[1] + R[i * 3 + 2] * r[2]);
          if (prevRef && ref[0] * prevRef[0] + ref[1] * prevRef[1] + ref[2] * prevRef[2] < 0) spins++;
          prevRef = ref;
          prevRig = pose;
        }
        check('거의 편 팔꿈치가 반대로 꺾여도 위팔 조각이 홱 돌지 않는다', spins === 0, `${spins}번 돎`);
      }
      /* 마운드(규격 · 키 1.8m) — 투수판 위 25.4cm · 앞 15cm 뒤로 1/12 내리막 · 둘레 밖 0, 발이 경사면 위에 선다 */
      {
        const Hm = 1.8;
        const g = moundHeightAt(0, 0, Hm);
        const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
        check(
          '마운드: 투수판 위 25.4cm · 앞 1m 는 25.4 − (1 − 0.152)/12 m',
          near(g(0, 0), 0.254 / Hm) && near(g(1 / Hm, 0), (0.254 - (1 - 0.152) / 12) / Hm)
        );
        check(
          '마운드: 앞 내리막이 둘레(투수판 앞 3.2m)에서 0 · 둘레 밖 0',
          g(3.19 / Hm, 0) < 0.01 / Hm && g(3.3 / Hm, 0) === 0 && g(0.457 / Hm, 3 / Hm) === 0
        );
        /* 옆 경사 — 예전엔 옆으로 원 끝까지 꼭대기 높이(폭 5.5m 의 평평한 언덕)라 '너무 크다'고 보였다 */
        check(
          '마운드: 옆으로 꼭대기 폭 5피트(±0.76m) 안은 꼭대기, 밖은 둘레까지 내려간다',
          near(g(0, 0.7 / Hm), 0.254 / Hm) &&
            g(0, 1.5 / Hm) < 0.18 / Hm &&
            g(0.457 / Hm, 2.7 / Hm) < 0.02 / Hm
        );
      }
      /*
       * 보기용 다듬기(display.ts) — 2026-10-09 김민 4/10: 착지 때 앞발이 땅에 박히고 몸 전체가 붕 뜸(장면마다 디딤발로 바닥을 다시 잡았다),
       * 마무리에 몸통이 기괴하게 돎(어깨선이 골반선보다 87°), 릴리스에 손목이 꺾임(흐린 손 점 그대로), 떨림.
       */
      {
        const tr = displayTrack(result, { ground: 'mound', heightM: 1.8 });
        const fp = result.events.footPlant;
        const leadC = tr.contacts.find((c) => c.side === 'L' && c.to >= fp && c.from <= result.events.release);
        const gap = (fr: Vec3[], j: number) => fr[j][1] - tr.groundAt(fr[j][0], fr[j][2]);
        const soleGap = (fr: Vec3[], side: 'L' | 'R') =>
          side === 'L'
            ? Math.min(gap(fr, V2J.lHe), gap(fr, V2J.lTo))
            : Math.min(gap(fr, V2J.rHe), gap(fr, V2J.rTo));
        let leadErr = Infinity;
        if (leadC) {
          const gs = tr.frames.slice(leadC.from, leadC.to + 1).map((fr) => soleGap(fr, 'L'));
          gs.sort((x, y) => x - y);
          leadErr = Math.abs(gs[gs.length >> 1]);
        }
        check('보기: 착지한 앞발 발바닥이 마운드 경사면 위(키의 0.2% 안)', leadErr < 0.002, `${leadErr.toFixed(4)}`);
        let below = 0;
        for (const fr of tr.frames) below = Math.min(below, soleGap(fr, 'L'), soleGap(fr, 'R'));
        check('보기: 어느 장면에서도 발이 바닥 밑에 없다', below > -1e-9, `${below}`);
        /*
         * 바닥은 클립 전체에 한 번 — 골반 높이 차(보기 − 결과)가 장면마다 거의 같다(다듬기 몫만). 마운드에 두 발을 맞추느라 몸 전체를 한 번 기울이면
         * (display.ts MOUND_TILT_MAX) 높이 차가 앞뒤 · 옆 자리에 1차로 따라 변하니 그 몫(최소제곱 평면)은 빼고 본다.
         */
        const hipAt = (fr: Vec3[]) => scale(add(fr[V2J.lHip], fr[V2J.rHip]), 0.5);
        const rows = tr.frames.map((fr, k) => {
          const r0 = hipAt(frames[k]);
          return { x: r0[0], z: r0[2], y: hipAt(fr)[1] - r0[1] };
        });
        /* y ≈ a + b·x + c·z */
        const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        const B = [0, 0, 0];
        for (const q of rows) {
          const v = [1, q.x, q.z];
          for (let i = 0; i < 3; i++) {
            B[i] += v[i] * q.y;
            for (let j = 0; j < 3; j++) S[i][j] += v[i] * v[j];
          }
        }
        const det3 = (m: number[][]) =>
          m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
        const D3 = det3(S);
        const coef = [0, 1, 2].map((c) => det3(S.map((row, i) => row.map((v, j) => (j === c ? B[i] : v)))) / D3);
        const lift = rows.map((q) => q.y - (coef[0] + coef[1] * q.x + coef[2] * q.z));
        const spread = Math.max(...lift) - Math.min(...lift);
        check('보기: 몸을 장면마다 따로 올리지 않는다(골반 높이 차 흔들림 키의 1% 밑)', spread < 0.01, `${(spread * 100).toFixed(2)}%`);
        const flat = displayTrack(result, { ground: 'flat', heightM: 1.8 });
        let flatBelow = 0;
        for (const fr of flat.frames)
          for (const j of [V2J.lHe, V2J.lTo, V2J.rHe, V2J.rTo]) flatBelow = Math.min(flatBelow, fr[j][1]);
        check('보기: 평지도 발이 바닥(0) 밑에 없다 · 마운드 없음', flatBelow > -1e-9 && flat.mound === null, `${flatBelow}`);

        /* 투수판 — 축발이 투수판 위가 아니라 앞에 선다(2026-10-09 김민: "투구판 위에 올라가서 밟고 던진다") */
        {
          const pc = tr.contacts.find((c) => c.side === 'R' && c.from <= fp);
          const footBack = pc
            ? Math.min(...[V2J.rAn, V2J.rHe, V2J.rTo].map((j) => tr.frames[pc.from][j][0]))
            : NaN;
          check(
            '보기: 투수판 앞 모서리가 축발 뒤 가장자리보다 뒤(발이 투수판 앞)',
            tr.mound != null && tr.mound.x0 < footBack - 0.01,
            tr.mound ? `${tr.mound.x0.toFixed(3)} < ${footBack.toFixed(3)}` : '마운드 없음'
          );
        }

      }
      /*
       * 관절 각도 모델(kinematics.ts, 2026-10-09 김민 "관절 각도 모델로 가자") — 점 → 각도 → 한계 · 다듬기 → 점.
       * 고치기 전(점 규칙): 몸통 꼬임 87° · 위팔 비틀림이 거의 편 팔꿈치에서 장면마다 뒤집힘 · 흐린 손목 120° 꺾임 · 무릎이 뒤를 봄.
       */
      {
        const contacts = [
          { side: 'R' as const, from: 0, to: Math.max(0, (result.events.kneeUp ?? 10) - 1) },
          { side: 'L' as const, from: result.events.footPlant, to: frames.length - 1 },
        ];
        const kin = kinematicTrack(frames, result.conf, contacts);
        /* 1 그대로의 투구는 거의 그대로 — 팔꿈치 · 손목 · 무릎 · 발목 */
        const errs: number[] = [];
        kin.frames.forEach((fr, k) => {
          for (const j of [V2J.rEl, V2J.rWr, V2J.lEl, V2J.lWr, V2J.lKn, V2J.rKn, V2J.lAn, V2J.rAn])
            errs.push(norm(sub(fr[j], frames[k][j])));
        });
        errs.sort((x, y) => x - y);
        const med = errs[errs.length >> 1];
        const p95 = errs[Math.floor(errs.length * 0.95)];
        check('각도 모델: 그대로의 투구는 거의 그대로(관절 가운데 키의 1.5% · 95% 가 5% 안)', med < 0.015 && p95 < 0.05, `${(med * 100).toFixed(2)}% · ${(p95 * 100).toFixed(2)}%`);
        /* 2 뼈 길이 고정 */
        const bl = kin.frames.map((fr) => norm(sub(fr[V2J.rWr], fr[V2J.rEl])));
        check('각도 모델: 뼈 길이 고정(아래팔 흔들림 0)', Math.max(...bl) - Math.min(...bl) < 1e-9, `${Math.max(...bl) - Math.min(...bl)}`);
        /* 3 땅에 닿은 발은 그 자리 */
        const c = contacts[1];
        let pin = 0;
        for (let k = c.from; k <= c.to; k++) pin = Math.max(pin, norm(sub(kin.frames[k][V2J.lAn], frames[k][V2J.lAn])));
        check('각도 모델: 땅에 닿은 앞발 발목은 엔진이 묶은 자리 그대로', pin < 1e-9, `${pin}`);

        /* 같은 장면을 줄줄이 — 한계 · 이어 붙이기 시험용 */
        const mid0 = frames[Math.floor(frames.length / 2)];
        const seqOf = (len: number, edit: (fr: Vec3[], k: number) => void) =>
          Array.from({ length: len }, (_, k) => {
            const fr = mid0.map((p) => [...p] as Vec3);
            edit(fr, k);
            return fr;
          });
        const fullConf = (len: number) => Array.from({ length: len }, () => new Array(25).fill(100));
        const trunkOf = (fr: Vec3[]) => {
          const neck = scale(add(fr[V2J.lSh], fr[V2J.rSh]), 0.5);
          const t = normalize(sub(neck, scale(add(fr[V2J.lHip], fr[V2J.rHip]), 0.5)));
          const lv = sub(fr[V2J.lSh], fr[V2J.rSh]);
          const l = normalize(sub(lv, scale(t, dot(lv, t))));
          return { neck, t, l, f: cross(l, t) };
        };
        const rotAbout = (P: Vec3, C: Vec3, k: Vec3, th: number): Vec3 => {
          const v = sub(P, C);
          return add(C, add(add(scale(v, Math.cos(th)), scale(cross(k, v), Math.sin(th))), scale(k, dot(k, v) * (1 - Math.cos(th)))));
        };
        const deg = (r: number) => (r * 180) / Math.PI;

        /* 4 몸통 꼬임 — 윗몸을 골반보다 90° 더 돌린 장면이 이어짐 → 60° 안 */
        {
          const UP = [V2J.lSh, V2J.rSh, V2J.lEl, V2J.rEl, V2J.lWr, V2J.rWr, V2J.lHandIdx, V2J.rHandIdx, V2J.lHandMid, V2J.rHandMid, V2J.lHandPinky, V2J.rHandPinky, V2J.nose, V2J.lEar, V2J.rEar];
          const seq = seqOf(9, (fr) => {
            const { neck, t } = trunkOf(fr);
            const hv = sub(fr[V2J.lHip], fr[V2J.rHip]);
            const lh = normalize(sub(hv, scale(t, dot(hv, t))));
            const { l } = trunkOf(fr);
            const now = Math.atan2(dot(cross(lh, l), t), dot(lh, l));
            for (const j of UP) fr[j] = rotAbout(fr[j], neck, t, Math.PI / 2 - now);
          });
          const out = kinematicTrack(seq, fullConf(9), []).frames[4];
          const { t, l } = trunkOf(out);
          const hv = sub(out[V2J.lHip], out[V2J.rHip]);
          const lh = normalize(sub(hv, scale(t, dot(hv, t))));
          const tw = Math.abs(deg(Math.atan2(dot(cross(lh, l), t), dot(lh, l))));
          check(`각도 모델: 몸통 꼬임 90° → ${KIN_LIMITS.spineTwist}° 안`, tw <= KIN_LIMITS.spineTwist + 0.5, `${tw.toFixed(1)}°`);
        }

        /* 4-2 다리 드는 동안(니업 전) 꼬임 50° → liftTwist 안 · 어깨선은 그대로(골반이 몸통을 따른다) — 2026-10-10 샘플 5 */
        {
          const UP = [V2J.lSh, V2J.rSh, V2J.lEl, V2J.rEl, V2J.lWr, V2J.rWr, V2J.lHandIdx, V2J.rHandIdx, V2J.lHandMid, V2J.rHandMid, V2J.lHandPinky, V2J.rHandPinky, V2J.nose, V2J.lEar, V2J.rEar];
          const twistOf = (fr: Vec3[]) => {
            const { t, l } = trunkOf(fr);
            const hv = sub(fr[V2J.lHip], fr[V2J.rHip]);
            const lh = normalize(sub(hv, scale(t, dot(hv, t))));
            return { tw: Math.atan2(dot(cross(lh, l), t), dot(lh, l)), l };
          };
          const seq = seqOf(9, (fr) => {
            const { neck, t } = trunkOf(fr);
            const now = twistOf(fr).tw;
            for (const j of UP) fr[j] = rotAbout(fr[j], neck, t, (50 * Math.PI) / 180 - now);
          });
          const out = kinematicTrack(seq, fullConf(9), [], { events: { kneeUp: 8, footPlant: 8, release: 8 } }).frames[4];
          const tw = Math.abs(deg(twistOf(out).tw));
          const shoulderMove = deg(Math.acos(Math.min(1, dot(twistOf(out).l, twistOf(seq[4]).l))));
          check(
            `각도 모델: 다리 드는 동안 꼬임 50° → ${KIN_LIMITS.liftTwist}° 안, 어깨선은 그대로`,
            tw <= KIN_LIMITS.liftTwist + 3 && shoulderMove < 5,
            `꼬임 ${tw.toFixed(1)}° · 어깨선 ${shoulderMove.toFixed(1)}°`
          );
        }

        /* 4-3 목 — 서 있을 때부터 귀가 앞으로 25° 치우친 사람은 그것을 바로 선 목으로, 릴리스 전 앞 숙임은 neckForwardPre 안 — 2026-10-10 샘플 5 */
        {
          const neckFwd = (fr: Vec3[]) => {
            const { neck, t, f } = trunkOf(fr);
            const v = sub(scale(add(fr[V2J.lEar], fr[V2J.rEar]), 0.5), neck);
            return deg(Math.atan2(dot(v, f), dot(v, t)));
          };
          const tilt = (fr: Vec3[], th: number) => {
            const { neck, l } = trunkOf(fr);
            for (const j of [V2J.nose, V2J.lEar, V2J.rEar]) fr[j] = rotAbout(fr[j], neck, l, th);
          };
          const base = neckFwd(mid0);
          const sign = (() => {
            const fr = mid0.map((p) => [...p] as Vec3);
            tilt(fr, 0.3);
            return neckFwd(fr) > base ? 1 : -1;
          })();
          const rad25 = (sign * 25 * Math.PI) / 180;
          /* 늘 25° 앞 → 바로 선 목(0 근처) */
          const same = seqOf(12, (fr) => tilt(fr, rad25 - (sign * base * Math.PI) / 180));
          const o1 = kinematicTrack(same, fullConf(12), [], { events: { kneeUp: 6, footPlant: 9, release: 11 } }).frames[8];
          /* 서 있을 땐 바로, 내딛는 동안 50° 앞 → 릴리스 전이라 15° 안 */
          const late = seqOf(12, (fr, k) => tilt(fr, (k >= 6 ? sign * 50 * Math.PI / 180 : 0) - (sign * base * Math.PI) / 180));
          const o2 = kinematicTrack(late, fullConf(12), [], { events: { kneeUp: 5, footPlant: 9, release: 11 } }).frames[9];
          check(
            '각도 모델: 서 있을 때의 목 치우침은 덜어 내고, 릴리스 전 앞 숙임은 15° 안',
            Math.abs(neckFwd(o1)) < 5 && neckFwd(o2) <= KIN_LIMITS.neckForwardPre + 1,
            `늘 25° → ${neckFwd(o1).toFixed(1)}° · 내딛을 때 50° → ${neckFwd(o2).toFixed(1)}°`
          );
        }

        /* 4-4 거의 편 다리가 장면마다 반대로 살짝 굽어도 발 방향이 돌지 않는다 — 2026-10-10 샘플 5 왼발 한 장면 100° */
        {
          const hip = mid0[V2J.lHip];
          const an = mid0[V2J.lAn];
          const side = normalize(cross(sub(an, hip), [0, 0, 1]));
          const seq = seqOf(12, (fr, k) => {
            fr[V2J.lKn] = add(scale(add(hip, an), 0.5), scale(side, (k % 2 ? -1 : 1) * 0.01));
          });
          const F = kinematicTrack(seq, fullConf(12), []).frames;
          const yaw = (fr: Vec3[]) => deg(Math.atan2(fr[V2J.lTo][2] - fr[V2J.lHe][2], fr[V2J.lTo][0] - fr[V2J.lHe][0]));
          let worst = 0;
          for (let k = 1; k < 12; k++) worst = Math.max(worst, Math.abs(((yaw(F[k]) - yaw(F[k - 1]) + 540) % 360) - 180));
          check('각도 모델: 거의 편 다리가 흔들려도 발 방향이 한 장면에 10° 넘게 돌지 않는다', worst < 10, `${worst.toFixed(1)}°`);
        }

        /* 4-5 오래 편 팔(굽힘 3°)에서 비틀림 잡음이 장면마다 튀어도 위팔 굽는 축이 한 장면에 6° 넘게 돌지 않는다 — 2026-10-10 샘플 셋 14~21° */
        {
          const sh = mid0[V2J.lSh];
          const wr = mid0[V2J.lWr];
          const axis = normalize(sub(wr, sh));
          const p1 = normalize(cross(axis, [0, 1, 0]));
          const p2 = cross(axis, p1);
          const seq = seqOf(30, (fr, k) => {
            const th = (k * 2.399) % (2 * Math.PI); // 장면마다 엉뚱한 쪽으로
            const off = add(scale(p1, Math.cos(th) * 0.004), scale(p2, Math.sin(th) * 0.004));
            fr[V2J.lEl] = add(scale(add(sh, wr), 0.5), off);
          });
          const kk = kinematicTrack(seq, fullConf(30), []);
          let worst = 0;
          for (let k = 1; k < 30; k++) {
            const a = kk.refs[k].upperArmL!;
            const b = kk.refs[k - 1].upperArmL!;
            worst = Math.max(worst, deg(Math.acos(Math.min(1, Math.abs(dot(a, b))))));
          }
          check('각도 모델: 오래 편 팔의 굽는 축이 한 장면에 6° 넘게 돌지 않는다', worst <= 6, `${worst.toFixed(1)}°`);
        }

        /* 4-6 땅에 묶인 발이 풀리는 장면에 엔진이 발을 3cm 옮겨도 화면 발목은 한 장면에 키의 1.2% 넘게 움직이지 않는다 — 2026-10-10 샘플 5 뒷발 23mm */
        {
          const seq = seqOf(30, (fr, k) => {
            if (k > 14) for (const j of [V2J.rAn, V2J.rHe, V2J.rTo, V2J.rKn]) fr[j] = add(fr[j], [0.03 + (k - 15) * 0.004, 0.01, 0]);
          });
          const F = kinematicTrack(seq, fullConf(30), [{ side: 'R', from: 0, to: 14 }]).frames;
          let worst = 0;
          for (let k = 1; k < 30; k++) worst = Math.max(worst, norm(sub(F[k][V2J.rAn], F[k - 1][V2J.rAn])));
          check('각도 모델: 묶인 발이 풀릴 때 발목이 한 장면에 키의 1.2% 안', worst <= 0.012, `${(worst * 100).toFixed(2)}%`);
        }

        /* 4-7 원본 걸름 — 한 장면만 5cm 튄 글러브 팔꿈치 · 손목은 이웃 가운데로, 손 점 · 발목(다리) · 릴리스 앞뒤 던지는 팔꿈치는 그대로 */
        {
          const fr0 = mid0.map((p) => [...p] as Vec3);
          const seq = Array.from({ length: 20 }, (_, k) => fr0.map((p) => [p[0] + k * 0.002, p[1], p[2]] as Vec3));
          for (const j of [V2J.lEl, V2J.lWr, V2J.lHandMid, V2J.lAn]) seq[8][j] = add(seq[8][j], [0, 0.05, 0]);
          seq[10][V2J.rEl] = add(seq[10][V2J.rEl], [0, 0.05, 0]);
          const out = despike(seq, 'R', 10);
          const glove = Math.max(norm(sub(out[8][V2J.lEl], seq[7][V2J.lEl])), norm(sub(out[8][V2J.lWr], seq[7][V2J.lWr])));
          const kept = Math.max(norm(sub(out[8][V2J.lHandMid], seq[8][V2J.lHandMid])), norm(sub(out[8][V2J.lAn], seq[8][V2J.lAn])));
          const thr = norm(sub(out[10][V2J.rEl], seq[10][V2J.rEl]));
          check(
            '원본 걸름: 한 장면 튄 글러브 팔꿈치 · 손목은 되돌리고, 손 점 · 다리 · 릴리스의 던지는 팔꿈치는 그대로',
            glove < 0.005 && kept < 1e-9 && thr < 1e-9,
            `글러브 ${(glove * 1000).toFixed(1)}mm · 그대로 둘 것 ${(kept * 1000).toFixed(2)} · 던지는 ${(thr * 1000).toFixed(1)}`
          );
        }

        /* 5 거의 편 팔꿈치가 장면마다 반대로 꺾여도 굽는 축(위팔 비틀림)이 뒤집히지 않는다 · 과신전 5° 안 */
        {
          const sh = mid0[V2J.rSh];
          const wr = mid0[V2J.rWr];
          const perpAx = normalize(cross(sub(wr, sh), [0, 1, 0]));
          const seq = seqOf(12, (fr, k) => {
            fr[V2J.rEl] = add(scale(add(sh, wr), 0.5), scale(perpAx, (k % 2 ? -1 : 1) * 0.03));
          });
          const kk = kinematicTrack(seq, fullConf(12), []);
          let flips = 0;
          for (let k = 1; k < 12; k++) {
            const a = kk.refs[k].upperArmR!;
            const b = kk.refs[k - 1].upperArmR!;
            if (dot(a, b) < 0) flips++;
          }
          check('각도 모델: 거의 편 팔꿈치가 번갈아 꺾여도 굽는 축이 안 뒤집힌다', flips === 0, `${flips}번`);
        }

        /* 6 손목 — 손을 아래팔에서 120° 꺾음: 확신 100 이면 75° 안, 확신 0 이면 곧게 */
        {
          const bent = (cf: number) => {
            const seq = seqOf(9, (fr) => {
              const wr = fr[V2J.rWr];
              const df = normalize(sub(wr, fr[V2J.rEl]));
              const side = normalize(cross(df, [0, 1, 0]));
              const nAx = normalize(cross(df, side));
              const th = (120 * Math.PI) / 180;
              const a = add(scale(df, Math.cos(th)), scale(nAx, Math.sin(th)));
              fr[V2J.rHandMid] = add(wr, scale(a, 0.09));
              fr[V2J.rHandIdx] = add(fr[V2J.rHandMid], scale(side, -0.02));
              fr[V2J.rHandPinky] = add(fr[V2J.rHandMid], scale(side, 0.03));
            });
            const conf = Array.from({ length: 9 }, () => new Array(25).fill(100));
            for (const row of conf) for (const j of [V2J.rHandIdx, V2J.rHandMid, V2J.rHandPinky]) row[j] = cf;
            const fr = kinematicTrack(seq, conf, []).frames[4];
            const df = normalize(sub(fr[V2J.rWr], fr[V2J.rEl]));
            const a2 = normalize(sub(fr[V2J.rHandMid], fr[V2J.rWr]));
            return deg(Math.acos(Math.max(-1, Math.min(1, dot(df, a2)))));
          };
          const sure = bent(100);
          const blur = bent(0);
          check('각도 모델: 120° 꺾인 손목 → 75° 안(확신 높음) · 거의 곧게(확신 0)', sure <= KIN_LIMITS.wristFlex + 1 && blur < 10, `${sure.toFixed(1)}° · ${blur.toFixed(1)}°`);
        }

        /* 7 위팔이 어깨선 뒤로 80° → 45° 안 · 아래팔 길이 그대로 */
        {
          const seq = seqOf(9, (fr) => {
            const { f, l } = trunkOf(fr);
            const out = scale(l, -1);
            const th = (80 * Math.PI) / 180;
            const dir = add(scale(out, Math.cos(th)), scale(f, -Math.sin(th)));
            const L1 = norm(sub(fr[V2J.rEl], fr[V2J.rSh]));
            const fore = sub(fr[V2J.rWr], fr[V2J.rEl]);
            fr[V2J.rEl] = add(fr[V2J.rSh], scale(dir, L1));
            fr[V2J.rWr] = add(fr[V2J.rEl], fore);
          });
          const fr = kinematicTrack(seq, fullConf(9), []).frames[4];
          const { f, l } = trunkOf(fr);
          const u = sub(fr[V2J.rEl], fr[V2J.rSh]);
          const back = deg(Math.atan2(-dot(u, f), dot(u, scale(l, -1))));
          check(`각도 모델: 위팔이 어깨선 뒤로 ${KIN_LIMITS.shoulderBack}° 안(80° 에서)`, back <= KIN_LIMITS.shoulderBack + 1, `${back.toFixed(1)}°`);
        }

        /* 8 머리 — 몇 장면만 머리를 몸통에서 120° 돌림 → 다른 장면 기준 70° 안 */
        {
          const seq = seqOf(15, (fr, k) => {
            if (k < 6 || k > 8) return;
            const { neck, t } = trunkOf(fr);
            for (const j of [V2J.nose, V2J.lEar, V2J.rEar]) fr[j] = rotAbout(fr[j], neck, t, (120 * Math.PI) / 180);
          });
          const base0 = kinematicTrack(seq, fullConf(15), []).frames;
          const earDir = (fr: Vec3[]) => {
            const { t } = trunkOf(fr);
            const e = sub(fr[V2J.lEar], fr[V2J.rEar]);
            return normalize(sub(e, scale(t, dot(e, t))));
          };
          const { t } = trunkOf(base0[7]);
          const turn = Math.abs(deg(Math.atan2(dot(cross(earDir(base0[0]), earDir(base0[7])), t), dot(earDir(base0[0]), earDir(base0[7])))));
          check(`각도 모델: 머리 돌림이 몸통에 대해 ${KIN_LIMITS.neckTwist}° 안(120° 에서)`, turn <= KIN_LIMITS.neckTwist + 2, `${turn.toFixed(1)}°`);
        }

        /*
         * 12 영상에 맞게(2026-10-09 샘플 3 · 4 를 두 영상에 비춰 보니 각도 모델이 측정보다 2배 멀었다) — 고치기 전 값은 각 시험의 주석에.
         * ① 던지는 어깨를 15° 올림(팔도 따라) → 어깨 자리 그대로(고치기 전 키의 3% 넘게 — 어깨선을 늘 몸통 축에 수직으로 다시 만듦)
         */
        {
          const seq = seqOf(15, (fr) => {
            const { neck, f } = trunkOf(fr);
            const before = fr[V2J.rSh];
            for (const j of [V2J.lSh, V2J.rSh]) fr[j] = rotAbout(fr[j], neck, f, (15 * Math.PI) / 180);
            const mv = sub(fr[V2J.rSh], before);
            for (const j of [V2J.rEl, V2J.rWr, V2J.rHandIdx, V2J.rHandMid, V2J.rHandPinky]) fr[j] = add(fr[j], mv);
            const mvL = sub(fr[V2J.lSh], rotAbout(fr[V2J.lSh], neck, f, (-15 * Math.PI) / 180));
            for (const j of [V2J.lEl, V2J.lWr, V2J.lHandIdx, V2J.lHandMid, V2J.lHandPinky]) fr[j] = add(fr[j], mvL);
          });
          const out = kinematicTrack(seq, fullConf(15), []).frames[7];
          const e = Math.max(norm(sub(out[V2J.rSh], seq[7][V2J.rSh])), norm(sub(out[V2J.lSh], seq[7][V2J.lSh])), norm(sub(out[V2J.rWr], seq[7][V2J.rWr])));
          check('각도 모델: 한쪽 어깨를 15° 올려도 어깨 · 손목이 그 자리(키의 0.5% 안)', e < 0.005, `${(e * 100).toFixed(2)}%`);
        }
        /* ② 고개를 목 위에서 좌우로 ±40° 돌림 → 머리 자리 그대로(고치기 전 키의 2~3% — 머리를 어깨 가운데를 축으로 돌림) */
        {
          const seq = seqOf(31, (fr, k) => {
            const { t } = trunkOf(fr);
            const c = scale(add(fr[V2J.lEar], fr[V2J.rEar]), 0.5);
            const yaw = ((40 * Math.PI) / 180) * Math.sin(k / 5);
            for (const j of [V2J.nose, V2J.lEar, V2J.rEar]) fr[j] = rotAbout(fr[j], c, t, yaw);
          });
          const out = kinematicTrack(seq, fullConf(31), []).frames;
          let e = 0;
          for (let k = 3; k < 28; k++) for (const j of [V2J.nose, V2J.lEar, V2J.rEar]) e = Math.max(e, norm(sub(out[k][j], seq[k][j])));
          check('각도 모델: 고개를 목 위에서 ±40° 돌려도 머리가 그 자리(키의 1% 안)', e < 0.01, `${(e * 100).toFixed(2)}%`);
        }
        /*
         * ③ 몸통 확신이 거의 0 인데 몸통이 돈다 → 어깨 · 손목이 그 장면 자리를 따라간다(키의 2% 안). 고치기 전엔 주변 무게가 모자라면 다듬기 폭을
         * 23배까지 넓혀(50장면) 윗몸이 크게 늦고 무뎌졌다 — 좌투 샘플(몸통 확신 가운데 27)에서 던지는 팔이 영상에서 더 멀고 손목이 더 떨었다
         */
        {
          const len = 90;
          const UPPER = [V2J.lSh, V2J.rSh, V2J.lEl, V2J.rEl, V2J.lWr, V2J.rWr, V2J.lHandIdx, V2J.rHandIdx, V2J.lHandMid, V2J.rHandMid, V2J.lHandPinky, V2J.rHandPinky, V2J.nose, V2J.lEar, V2J.rEar];
          const seq = seqOf(len, (fr, k) => {
            const { neck, t } = trunkOf(fr);
            for (const j of UPPER) fr[j] = rotAbout(fr[j], neck, t, 0.8 * Math.sin(k / 9));
          });
          const conf = Array.from({ length: len }, () => new Array(25).fill(100));
          for (const row of conf) for (const j of [V2J.rSh, V2J.lSh, V2J.lHip, V2J.rHip]) row[j] = 0;
          const out = kinematicTrack(seq, conf, []).frames;
          let e = 0;
          for (let k = 10; k < len - 10; k++) for (const j of [V2J.rSh, V2J.rWr]) e = Math.max(e, norm(sub(out[k][j], seq[k][j])));
          check('각도 모델: 몸통 확신이 0 이어도 도는 윗몸을 따라간다(어깨 · 손목 키의 2% 안)', e < 0.02, `${(e * 100).toFixed(2)}%`);
        }

        /*
         * ④ 확신이 5장면마다 0 · 100 으로 바뀌어도 부드럽게 흔드는 팔이 원본보다 튀지 않는다(고치기 전: 흐린 장면 무게를 0 가까이 두고 다시 다듬어
         * 경계에서 튐 — 샘플 4 던지는 팔 흔들림 p90 원본 0.77 → 화면 1.26)
         */
        {
          const len = 60;
          const seq = seqOf(len, (fr, k) => {
            const { f } = trunkOf(fr);
            const S = fr[V2J.rSh];
            for (const j of [V2J.rEl, V2J.rWr, V2J.rHandIdx, V2J.rHandMid, V2J.rHandPinky]) fr[j] = rotAbout(fr[j], S, f, 0.7 * Math.sin(k / 6));
          });
          const conf = Array.from({ length: len }, (_, k) => new Array(25).fill(Math.floor(k / 5) % 2 ? 100 : 0));
          const p90 = (fs: Vec3[][]) => {
            const v: number[] = [];
            for (let k = 1; k + 1 < fs.length; k++) v.push(norm(add(sub(fs[k + 1][V2J.rWr], scale(fs[k][V2J.rWr], 2)), fs[k - 1][V2J.rWr])));
            return v.sort((a, b) => a - b)[Math.floor(v.length * 0.9)];
          };
          const r0 = p90(seq);
          const r1 = p90(kinematicTrack(seq, conf, []).frames);
          check('각도 모델: 확신이 들쭉날쭉해도 팔이 원본보다 튀지 않는다(p90 1.2배 안)', r1 <= r0 * 1.2, `${(r1 / r0).toFixed(2)}배`);
        }
        /* ⑤ 편 팔꿈치(굽는 면을 못 봄)가 반대쪽 면으로 굽기 시작해도 굽는 면이 한 장면에 20° 넘게 안 돈다(고치기 전 한 장면에 80~90° 휙) */
        {
          const sh = mid0[V2J.rSh];
          const down: Vec3 = [0, -1, 0];
          const L1 = norm(sub(mid0[V2J.rEl], mid0[V2J.rSh]));
          const L2 = norm(sub(mid0[V2J.rWr], mid0[V2J.rEl]));
          const seq = seqOf(30, (fr, k) => {
            const el = add(sh, scale(down, L1));
            fr[V2J.rEl] = el;
            /* 0~9 장면: 앞으로 조금 굽음(면 = 옆 축) · 10~14 편 팔 · 15~ 옆으로 굽음(면이 90° 돈 축) */
            const bendDir: Vec3 = k < 10 ? [0, 0, 1] : [1, 0, 0];
            const th = k < 10 ? 0.9 : k < 15 ? 0 : Math.min(1.2, (k - 14) * 0.3);
            const dir = normalize(add(scale(down, Math.cos(th)), scale(bendDir, Math.sin(th))));
            fr[V2J.rWr] = add(el, scale(dir, L2));
            for (const j of [V2J.rHandIdx, V2J.rHandMid, V2J.rHandPinky]) fr[j] = add(fr[V2J.rWr], scale(dir, 0.05));
          });
          const kk = kinematicTrack(seq, fullConf(30), []);
          let worst = 0;
          for (let k = 1; k < 30; k++) worst = Math.max(worst, deg(Math.acos(Math.max(-1, Math.min(1, dot(kk.refs[k].forearmR!, kk.refs[k - 1].forearmR!))))));
          check(`각도 모델: 굽기 시작한 팔의 굽는 면이 한 장면에 ${KIN_LIMITS.twistRatePerFrame}° 남짓까지만 돈다`, worst <= KIN_LIMITS.twistRatePerFrame + 3, `${worst.toFixed(1)}°`);
        }

        /* 9 무릎이 뒤를 보는 장면(넙다리 반 바퀴) → 클립 가운데에서 60° 안 */
        {
          const seq = seqOf(15, (fr, k) => {
            if (k < 6 || k > 8) return;
            const hip = fr[V2J.lHip];
            const an = fr[V2J.lAn];
            const ax = normalize(sub(an, hip));
            for (const j of [V2J.lKn]) fr[j] = rotAbout(fr[j], hip, ax, Math.PI);
          });
          const kk = kinematicTrack(seq, fullConf(15), []);
          const a = kk.refs[0].thighL!;
          const b = kk.refs[7].thighL!;
          const ang = deg(Math.acos(Math.max(-1, Math.min(1, dot(a, b)))));
          /* 비틀림 한계(60°) + 그 사이 넙다리 방향이 바뀐 몫 — 뒤(180°)를 보지 않으면 된다 */
          check(`각도 모델: 무릎이 뒤를 봐도(180°) 넙다리가 ${KIN_LIMITS.hipRotation}° 남짓만 돈다`, ang < 80, `${ang.toFixed(1)}°`);
        }

        /* 12 손 점이 손등 쪽으로 넘어가며(−150° → +150°, 손이 아래팔 뒤로 접힘) 잡혀도 손이 한 장면에 뒤집히지 않는다(2026-10-09 샘플 4 글러브 손 78°) */
        {
          const seq = seqOf(20, (fr, k) => {
            const wr = fr[V2J.rWr];
            const df = normalize(sub(wr, fr[V2J.rEl]));
            const side = normalize(cross(df, [0, 1, 0]));
            const nAx = normalize(cross(df, side));
            const th = ((-150 + (300 * k) / 19) * Math.PI) / 180;
            const a = add(scale(df, Math.cos(th)), scale(nAx, Math.sin(th)));
            fr[V2J.rHandMid] = add(wr, scale(a, 0.09));
            fr[V2J.rHandIdx] = add(fr[V2J.rHandMid], scale(side, -0.02));
            fr[V2J.rHandPinky] = add(fr[V2J.rHandMid], scale(side, 0.03));
          });
          const out = kinematicTrack(seq, fullConf(20), []).frames;
          let worst = 0;
          for (let k = 1; k < 20; k++) {
            const a = normalize(sub(out[k][V2J.rHandMid], out[k][V2J.rWr]));
            const b = normalize(sub(out[k - 1][V2J.rHandMid], out[k - 1][V2J.rWr]));
            worst = Math.max(worst, deg(Math.acos(Math.max(-1, Math.min(1, dot(a, b))))));
          }
          check(`각도 모델: 손이 아래팔 뒤로 넘어가며 잡혀도 한 장면에 ${KIN_LIMITS.wristRatePerFrame}° 남짓까지만 돈다`, worst <= KIN_LIMITS.wristRatePerFrame + 3, `${worst.toFixed(1)}°`);
        }

        /* 13 거의 편 다리를 땅에 맞춰 조금 접어도 무릎이 장면마다 앞 · 옆으로 뒤집히지 않는다(2026-10-09 좌투 샘플 착지 41 ~ 55°) */
        {
          const hip = mid0[V2J.lHip];
          const an = mid0[V2J.lAn];
          const ax = normalize(sub(an, hip));
          const side = normalize(cross(ax, [0, 0, 1]));
          const fwd = normalize(cross(side, ax));
          const L = norm(sub(an, hip)) / 2;
          let worst = 0;
          let prev: Vec3 | null = null;
          for (let k = 0; k < 20; k++) {
            /* 무릎은 선 위에서 옆으로 ±0.5mm 흔들림(잡음) — 굽은 쪽을 정할 수 없다 */
            const knee = add(add(hip, scale(ax, L)), scale(side, (k % 2 ? -1 : 1) * 0.0005));
            const target = add(hip, scale(ax, 1.9 * L));
            const kn = twoBoneIk(hip, knee, add(hip, scale(ax, 2 * L)), target, fwd);
            const dir = normalize(sub(kn, add(hip, scale(ax, dot(sub(kn, hip), ax)))));
            if (prev) worst = Math.max(worst, deg(Math.acos(Math.max(-1, Math.min(1, dot(dir, prev))))));
            prev = dir;
          }
          check('각도 모델: 편 다리를 접을 때 무릎이 굽는 쪽(hint)으로 — 장면마다 안 뒤집힌다', worst < 5, `${worst.toFixed(1)}°`);
        }

        /* 14 땅을 디딘 다리의 무릎이 4장면 옆으로 튀어도(엔진 실수 — 좌투 샘플 착지 뒤 넙다리 35~38°) 넙다리는 사람 빠르기까지만 돈다 */
        {
          const hip = mid0[V2J.lHip];
          const an = mid0[V2J.lAn];
          const ax = normalize(sub(an, hip));
          const { f } = trunkOf(mid0);
          const L1 = norm(sub(mid0[V2J.lKn], hip));
          const L2 = norm(sub(an, mid0[V2J.lKn]));
          /* 무릎을 앞으로 굽힌 자리(발목은 그대로) */
          const bentKnee = twoBoneIk(hip, add(hip, scale(ax, L1)), add(hip, scale(ax, L1 + L2)), add(hip, scale(ax, 0.9 * (L1 + L2))), f);
          const seq = seqOf(15, (fr, k) => {
            fr[V2J.lAn] = add(hip, scale(ax, 0.9 * (L1 + L2)));
            fr[V2J.lKn] = k >= 7 && k <= 10 ? rotAbout(bentKnee, hip, ax, Math.PI / 2) : bentKnee;
          });
          const kk = kinematicTrack(seq, fullConf(15), [{ side: 'L', from: 0, to: 14 }], { dt: 1 / 60, hand: 'R' });
          let worst = 0;
          for (let k = 1; k < 15; k++) {
            const a = normalize(sub(kk.frames[k][V2J.lKn], kk.frames[k][V2J.lHip]));
            const b = normalize(sub(kk.frames[k - 1][V2J.lKn], kk.frames[k - 1][V2J.lHip]));
            worst = Math.max(worst, deg(Math.acos(Math.max(-1, Math.min(1, dot(a, b))))));
          }
          const cap = KIN_SPEED.plantedThigh / 60;
          check(`각도 모델: 디딘 다리 무릎이 4장면 옆으로 튀어도 넙다리는 한 장면 ${cap}° 남짓까지`, worst <= cap + 1.5, `${worst.toFixed(1)}°`);
        }

        /*
         * 15 엉덩이 돌림 — 무릎이 골반 앞에서 110° 까지 돌아간 다리(좌투 샘플 착지 직전 103~159°: 엉덩이가 가려져 엔진 골반이 늦게 열림).
         * 엉덩이가 안 보이면(확신 20) 영상과 맞는 다리를 그대로 두고, 잘 보이면 사람 범위(70°)로 무릎을 돌려 놓는다.
         */
        {
          const hip = mid0[V2J.lHip];
          const { t, l, f } = trunkOf(mid0);
          const thigh = norm(sub(mid0[V2J.lKn], hip));
          const shank = norm(sub(mid0[V2J.lAn], mid0[V2J.lKn]));
          const rotK = (v: Vec3, k: Vec3, th: number) =>
            add(add(scale(v, Math.cos(th)), scale(cross(k, v), Math.sin(th))), scale(k, dot(k, v) * (1 - Math.cos(th))));
          const seq = seqOf(21, (fr, k) => {
            const flex = (30 * Math.PI) / 180;
            const u = normalize(add(scale(t, -Math.cos(flex)), scale(f, Math.sin(flex))));
            fr[V2J.lKn] = add(hip, scale(u, thigh));
            const axis0 = normalize(sub(l, scale(u, dot(l, u))));
            const axis = rotK(axis0, u, ((110 * k) / 20) * (Math.PI / 180));
            const s2 = rotK(u, axis, (50 * Math.PI) / 180);
            fr[V2J.lAn] = add(fr[V2J.lKn], scale(normalize(s2), shank));
            fr[V2J.lHe] = add(fr[V2J.lAn], scale(f, -0.03));
            fr[V2J.lTo] = add(fr[V2J.lAn], scale(f, 0.12));
          });
          const errOf = (hipConf: number) => {
            const conf = fullConf(21).map((row) => {
              row[V2J.lHip] = hipConf;
              row[V2J.rHip] = hipConf;
              return row;
            });
            const out = kinematicTrack(seq, conf, []).frames;
            return norm(sub(out[20][V2J.lAn], seq[20][V2J.lAn]));
          };
          const unseen = errOf(20);
          const seen = errOf(100);
          check(
            '각도 모델: 엉덩이가 가려지면 110° 돈 다리도 그 자리(키의 2% 안) · 보이면 사람 범위로 돌려 놓는다(5% 넘게 옮김)',
            unseen < 0.02 && seen > 0.05,
            `${(unseen * 100).toFixed(2)}% · ${(seen * 100).toFixed(2)}%`
          );
        }

        /*
         * 16 손 점 검지 · 새끼가 세 장면 반 바퀴 돌았다 돌아와도(100° → −20 · −160 · −125° → 75°) 그 뒤 손이 한 바퀴 밀려 뒤집힌 채 남지 않는다
         * (2026-10-10 샘플 4 글러브 손: 앞 장면에만 맞춰 각을 이으면 뒤 전체가 −360° 밀려 화면 손이 150° 돌아 있었다)
         */
        {
          const pr = [...new Array(15).fill(100), -20, -160, -125, ...Array.from({ length: 22 }, (_, i) => 75 + i)];
          const seq = seqOf(pr.length, (fr, k) => {
            const el = fr[V2J.rEl];
            const u = normalize(sub(el, fr[V2J.rSh]));
            const bend = normalize(cross(u, [0, 0, 1]));
            const L = norm(sub(fr[V2J.rWr], el));
            fr[V2J.rWr] = rotAbout(add(el, scale(u, L)), el, bend, (70 * Math.PI) / 180);
            const e1 = normalize(sub(fr[V2J.rWr], el));
            const e2 = normalize(cross(u, e1));
            const e3 = cross(e1, e2);
            const p = (pr[k] * Math.PI) / 180;
            const w = add(scale(e2, Math.cos(p)), scale(e3, Math.sin(p)));
            fr[V2J.rHandMid] = add(fr[V2J.rWr], scale(e1, 0.08));
            fr[V2J.rHandIdx] = add(fr[V2J.rHandMid], scale(w, -0.02));
            fr[V2J.rHandPinky] = add(fr[V2J.rHandMid], scale(w, 0.02));
          });
          const out = kinematicTrack(seq, fullConf(pr.length), []).frames;
          const last = pr.length - 1;
          const a = normalize(sub(out[last][V2J.rHandPinky], out[last][V2J.rHandIdx]));
          const b = normalize(sub(seq[last][V2J.rHandPinky], seq[last][V2J.rHandIdx]));
          const off = deg(Math.acos(Math.max(-1, Math.min(1, dot(a, b)))));
          check('각도 모델: 손 점이 세 장면 반 바퀴 튀었다 돌아와도 뒤 손 방향은 그대로(25° 안)', off < 25, `${off.toFixed(1)}°`);
        }

        /* 11 AI 보정 섞기 — 같으면 그대로, 흐린 팔은 AI 방향, 묶인 발 쪽 다리는 우리 것, 뼈 길이는 우리 것 */
        {
          const len = 6;
          const ours = Array.from({ length: len }, () => mid0.map((p) => [...p] as Vec3));
          const same = blendAi(ours, ours, ours.map(() => new Array(25).fill(100)), []).frames;
          const d0 = Math.max(...same.flatMap((fr, k) => fr.map((p, j) => norm(sub(p, ours[k][j])))));
          const ai = ours.map((fr) => {
            const a = fr.map((p) => [...p] as Vec3);
            /* AI 는 오른 아래팔을 위로 */
            a[V2J.rWr] = add(a[V2J.rEl], [0, norm(sub(fr[V2J.rWr], fr[V2J.rEl])), 0]);
            /* 왼 정강이도 다르게 */
            a[V2J.lAn] = add(a[V2J.lKn], [0.2, -0.1, 0]);
            return a;
          });
          const conf = ours.map(() => {
            const row = new Array(25).fill(100);
            row[V2J.rWr] = 0;
            row[V2J.lAn] = 0;
            return row;
          });
          const b = blendAi(ours, ai, conf, [{ side: 'L', from: 0, to: len - 1 }]);
          const fore = normalize(sub(b.frames[2][V2J.rWr], b.frames[2][V2J.rEl]));
          const lenOk = Math.abs(norm(sub(b.frames[2][V2J.rWr], b.frames[2][V2J.rEl])) - norm(sub(ours[2][V2J.rWr], ours[2][V2J.rEl]))) < 1e-9;
          const legSame = norm(sub(b.frames[2][V2J.lAn], ours[2][V2J.lAn])) < 1e-9;
          check(
            'AI 보정: 같으면 그대로 · 흐린 손목은 AI 쪽(위) · 길이는 우리 것 · 묶인 발 다리는 그대로',
            d0 < 1e-9 && fore[1] > 0.99 && lenOk && legSame,
            `${d0.toExponential(1)} · 위 ${fore[1].toFixed(3)} · 길이 ${lenOk} · 다리 ${legSame}`
          );
          const fake = { ...result, experimental: { sam3d: { model: 'x', joints: result.joints.slice(1) } } };
          check('AI 보정: 장면 수가 다른 AI 관절은 읽지 않는다', readAiJoints(fake) === null && readAiJoints(result) === null);
          const bm = blendAi(ours, ai, conf, [], new Set([2]));
          const missSame = norm(sub(bm.frames[2][V2J.rWr], ours[2][V2J.rWr])) < 1e-9 && bm.conf[2][V2J.rWr] === 0;
          const otherMoved = norm(sub(bm.frames[3][V2J.rWr], ours[3][V2J.rWr])) > 1e-3;
          const missRead = readAiMiss({ ...result, experimental: { sam3d: { model: 'x', joints: result.joints, miss: [2, 1.5, 'x' as unknown as number] } } });
          check(
            'AI 보정: AI 가 못 본 장면(miss)은 섞지 않는다(관절 · 확신 그대로) · 옆 장면은 섞는다 · 이상한 값은 버린다',
            missSame && otherMoved && missRead.size === 1 && missRead.has(2)
          );
          /* 영상과 맞추기(gate) — 0 이면 우리 것 그대로(확신이 낮아도), 팔꿈치만 1 이면 손목은 다시 붙어 아래팔 길이 · 방향이 우리 것 */
          const zero = ours.map(() => new Array(25).fill(0));
          const g0 = blendAi(ours, ai, conf, [], new Set(), zero);
          const g0Same =
            Math.max(...g0.frames.flatMap((fr, k) => fr.map((p, j) => norm(sub(p, ours[k][j]))))) < 1e-9 &&
            g0.conf.every((row, k) => row.every((v, j) => v === conf[k][j]));
          const aiEl = ours.map((fr) => {
            const a = fr.map((p) => [...p] as Vec3);
            a[V2J.rEl] = add(a[V2J.rSh], [0, -norm(sub(fr[V2J.rEl], fr[V2J.rSh])), 0]);
            return a;
          });
          const elOnly = ours.map(() => {
            const row = new Array(25).fill(0);
            row[V2J.rEl] = 100;
            return row;
          });
          const ge = blendAi(ours, aiEl, conf, [], new Set(), elOnly);
          const elMoved = norm(sub(ge.frames[2][V2J.rEl], ours[2][V2J.rEl])) > 1e-3;
          const foreO = sub(ours[2][V2J.rWr], ours[2][V2J.rEl]);
          const foreB = sub(ge.frames[2][V2J.rWr], ge.frames[2][V2J.rEl]);
          const foreSame = norm(sub(foreO, foreB)) < 1e-9;
          check(
            'AI 보정(gate): 0 이면 우리 것 그대로 · 팔꿈치만 AI 면 손목이 따라 붙어 아래팔 길이 · 방향 그대로',
            g0Same && elMoved && foreSame,
            `그대로 ${g0Same} · 팔꿈치 ${elMoved} · 아래팔 ${foreSame}`
          );
          const withW = (w: unknown) =>
            ({ ...result, experimental: { sam3d: { model: 'x', joints: result.joints, w } } }) as typeof result;
          const goodW = result.joints.map((fr) => fr.map(() => 50));
          const badW = result.joints.map((fr) => fr.map(() => 150));
          check(
            'AI 보정(gate): 비율 50 → 0.5 로 읽음 · 모양이 틀린 비율(150 · 장면 수 다름)이면 AI 를 안 쓴다',
            readAiGate(withW(goodW))?.[0][0] === 0.5 &&
              readAiJoints(withW(goodW)) !== null &&
              readAiJoints(withW(badW)) === null &&
              readAiJoints(withW(goodW.slice(1))) === null
          );
        }

        /* 10 떨림 — 가만있는 손목의 잡음은 줄인다 */
        {
          let seedR = 7;
          const rnd = () => ((seedR = (seedR * 16807) % 2147483647) / 2147483647 - 0.5) * 0.03;
          const seq = seqOf(60, (fr) => {
            fr[V2J.lWr] = add(fr[V2J.lWr], [rnd(), rnd(), rnd()]);
          });
          const sdOf = (fs: Vec3[][]) => {
            const xs = fs.map((f) => f[V2J.lWr][1]);
            const m = xs.reduce((a, v) => a + v, 0) / xs.length;
            return Math.sqrt(xs.reduce((a, v) => a + (v - m) ** 2, 0) / xs.length);
          };
          const sd0 = sdOf(seq);
          const sd1 = sdOf(kinematicTrack(seq, fullConf(60), []).frames);
          check('각도 모델: 가만있는 손목 떨림 절반 밑', sd1 < sd0 * 0.5, `${(sd1 / sd0).toFixed(2)}배`);
        }
      }
    }
  }
}

console.log('■ 빈 구간(릴리스 근처 손목 10장면 지움) — 회전으로 잇고 그쪽으로 당긴다');
{
  /* 고치기 전(앞 장면 방향 복사 + 다듬기가 빈 구간을 직선으로) 씨앗 44 · 55 에서 키의 22.5% · 23.8% 였다 */
  for (const seed of [44, 55]) {
    const r = gapWristError(seed);
    check(
      `빈 구간 손목 최대 오차가 키의 17% 밑(씨앗 ${seed})`,
      r != null && r.gap < 0.17,
      r
        ? `${(r.gap * 100).toFixed(1)}% · 보이는 주변 ${(r.seen * 100).toFixed(1)}%`
        : '맞추기 실패'
    );
  }
}

console.log('■ 던지는 손 — 촬영 정보가 틀려도(좌투를 오른손으로) 손을 바꿔 맞춘다');
{
  /* 2026-10-09 좌투 샘플이 '오른손'으로 올라와 팔 · 다리 이름이 통째로 뒤집혔다(몸이 뒤를 봄 · 발목이 골반 높이) */
  const sc: Scenario = { ...base, ...realistic, hand: 'L', name: '좌투를 오른손으로' };
  const { side: camS, back: camB } = cameras(sc);
  const s = makeV2Track(sc, camS, sc.side, 'side', 61);
  const b = makeV2Track(sc, camB, sc.back, 'back', 62);
  const run = (hand: 'R' | 'L') =>
    fitPitch3dV2({
      side: s.track,
      back: b.track,
      hand,
      heightCm: null,
      jobId: JOB_ID,
      poseModel: 'synth',
      screenRecorded: true,
      slowmoFps: sc.slowSide > 1 ? 30 * sc.slowSide : null,
    }).result;
  const wrong = run('R');
  const right = run('L');
  check(
    '촬영 정보 오른손 → 결과는 왼손 · 이름 안 뒤집힘',
    wrong.ok && wrong.hand === 'L' && !wrong.quality.flips.handSwapped,
    wrong.ok ? `hand ${wrong.hand} · handSwapped ${wrong.quality.flips.handSwapped}` : wrong.code
  );
  check(
    '손을 바로 준 결과와 같다',
    wrong.ok && right.ok && JSON.stringify(wrong.joints) === JSON.stringify(right.joints)
  );
}

console.log('■ 발 고정 — 축발(처음 ~ 벗어나기 전) · 앞발(착지 ~ 릴리스 뒤)이 땅에 붙어 있다');
{
  /* 고치기 전 씨앗 11 · 22: 축발 10.4 · 10.2, 앞발 23.6 · 10.0(표준편차, 키 1000) */
  for (const seed of [11, 22]) {
    const f = footSway(seed);
    check(
      `붙어 있어야 할 발이 흔들리지 않는다(표준편차 키의 0.2% 밑, 씨앗 ${seed})`,
      f != null && f.pivot < 2 && f.lead < 2,
      f ? `축발 ${f.pivot.toFixed(1)} · 앞발 ${f.lead.toFixed(1)}` : '맞추기 실패'
    );
  }
}

console.log('■ 발 순간이동 — 닿기 · 떨어지기를 섞어 잇고, 다리 이름이 바뀌어도 들린 발을 묶지 않는다');
{
  /* 고치기 전(축발을 처음 ~ 니업 늘 묶음 · 앞발을 착지 장면에 한 번에 붙임) 씨앗 11 · 22: 그대로 3.9 · 2.8%, 다리 이름 바뀜 20.8 · 21.1% */
  for (const seed of [11, 22]) {
    const ok = footJump(seed);
    const sw = footJump(seed, true);
    check(
      `발 한 장면 최대 이동 — 그대로 · 다리 이름 바뀜 모두 키의 4% 밑, 바뀜을 알아챔(씨앗 ${seed})`,
      ok != null && sw != null && ok.jump < 0.04 && sw.jump < 0.04 && sw.legsSwapped && !ok.legsSwapped,
      ok && sw ? `${(ok.jump * 100).toFixed(1)}% · ${(sw.jump * 100).toFixed(1)}% · 바꿈 ${ok.legsSwapped}/${sw.legsSwapped}` : '맞추기 실패'
    );
  }
}

console.log('■ 몸통 흔들림 — 골반선이 한 장면에 크게 돌지 않는다(엉덩이 점 튐 포함)');
{
  /* 고치기 전 씨앗 11 · 22: 튐 없음 13.8 · 7.8°, 착지 엉덩이 튐 11.8 · 13.5° */
  for (const seed of [11, 22]) {
    const calm = hipSnap(seed, false);
    const spiked = hipSnap(seed);
    check(
      `골반선 한 장면 최대 회전 — 튐 없음 8° · 튐 11° 밑(씨앗 ${seed})`,
      calm != null && spiked != null && calm < 8 && spiked < 11,
      `${calm?.toFixed(1)}° · ${spiked?.toFixed(1)}°`
    );
  }
}

console.log('■ 흔들림 · 꺾임 — 첫 장면 빈 관절 · 경첩 관절(팔꿈치 · 무릎) 반대로 꺾임');
{
  /* 고치기 전(기본 방향으로 채움) 씨앗 22 · 44 에서 키의 3.7% · 3.9% 였다 */
  for (const seed of [22, 44]) {
    const j = leadGapJump(seed);
    check(
      `첫 장면들이 빈 손목이 처음 보일 때 튀지 않는다(한 장면 키의 2% 밑, 씨앗 ${seed})`,
      j != null && j < 0.02,
      j == null ? '맞추기 실패' : `${(j * 100).toFixed(1)}%`
    );
  }
  const { result } = runV2({ ...base, ...realistic, name: 'hinge' }, 5);
  if (!result.ok) check('경첩 — 결과', false, result.code);
  else {
    const f0 = result.joints[Math.floor(result.joints.length / 2)].map(
      (p) => [p[0] / 1000, p[1] / 1000, p[2] / 1000] as Vec3
    );
    const U: Vec3 = [0, 1, 0];
    const sh = f0[V2J.rSh];
    const wr = f0[V2J.rWr];
    const ax = sub(wr, sh);
    const perp = normalize(cross(ax, U));
    /* 거의 편 팔꿈치(굽힘 약 15°)가 장면마다 반대쪽으로 */
    const seq = Array.from({ length: 10 }, (_, k) => {
      const fr = f0.map((p) => [...p] as Vec3);
      fr[V2J.rEl] = add(scale(add(sh, wr), 0.5), scale(perp, (k % 2 ? -1 : 1) * 0.035));
      return fr;
    });
    const lenBefore = seq.map((fr) => [norm(sub(fr[V2J.rEl], sh)), norm(sub(wr, fr[V2J.rEl]))]);
    const nFix = fixHingeFlips(seq, U);
    let flipsAfter = 0;
    let prevAx: Vec3 | null = null;
    let lenErr = 0;
    seq.forEach((fr, k) => {
      const c = cross(sub(fr[V2J.rEl], sh), sub(wr, fr[V2J.rEl]));
      if (prevAx && dot(c, prevAx) < 0) flipsAfter++;
      prevAx = c;
      lenErr = Math.max(
        lenErr,
        Math.abs(norm(sub(fr[V2J.rEl], sh)) - lenBefore[k][0]),
        Math.abs(norm(sub(wr, fr[V2J.rEl])) - lenBefore[k][1])
      );
    });
    check(
      '거의 편 팔꿈치가 장면마다 반대로 꺾이면 앞 장면 쪽으로 되돌린다(뼈 길이 그대로)',
      nFix === 5 && flipsAfter === 0 && lenErr < 1e-9,
      `되돌림 ${nFix} · 남은 뒤집힘 ${flipsAfter} · 길이 ${lenErr}`
    );
    /* 무릎이 골반 뒤쪽으로 꺾임(굽힘 약 20°) → 앞쪽으로 */
    const fr = f0.map((p) => [...p] as Vec3);
    const hip = fr[V2J.rHip];
    const an = fr[V2J.rAn];
    const fwd = normalize(cross(sub(fr[V2J.lHip], fr[V2J.rHip]), U));
    fr[V2J.rKn] = add(scale(add(hip, an), 0.5), scale(fwd, -0.08));
    const n1 = fixHingeFlips([fr], U);
    const off = sub(fr[V2J.rKn], scale(add(hip, an), 0.5));
    check('뒤로 꺾인 무릎을 앞으로 되돌린다', n1 === 1 && dot(off, fwd) > 0, `되돌림 ${n1}`);
  }
}

console.log(`\n통과 ${passed} · 실패 ${failed}`);
if (failed > 0) process.exit(1);
