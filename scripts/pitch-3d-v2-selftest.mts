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
import { fitPitch3dV2 } from '../lib/pitch-3d/v2/fit.ts';
import { pickSegment, readV2Events, runFit } from '../lib/pitch-3d/v2/run-node.ts';
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
import { readFileSync } from 'node:fs';
import {
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
  /* segment 가 찾은 순간을 fit 이 넘겨받는다 — 잘라 낸 구간에서 다시 찾다 실패한 2026-10-08 샘플 1 · 3 */
  check('fit 입력 순간: 착지 < 릴리스면 그대로', readV2Events({ kneeUp: 1, footPlant: 2, release: 2.5 })?.release === 2.5);
  check('fit 입력 순간: 뒤바뀌거나 없으면 버림(다시 찾기)', !readV2Events({ footPlant: 2, release: 1 }) && !readV2Events(null));
  if (seg.ok) {
    const withEv = JSON.parse(
      runFit({ side: s.track, back: b.track, hand: 'R', jobId: JOB_ID, poseModel: 'synth', screenRecorded: true, slowmoFps: 240, events: seg.events })
    );
    check('fit: segment 순간을 넘기면 끝까지 간다', withEv.ok === true, withEv.ok ? '' : String(withEv.code));
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
      let lowMin = Infinity;
      let lowMax = -Infinity;
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
        /* 모델 무릎(넙다리 끝)이 맞춘 무릎 근처에(비율이 달라 몇 cm 어긋난다) · 손목도 */
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
        /* 두 발 중 낮은 점 = 바닥 */
        let low = Infinity;
        for (const f of ['footL', 'footR'] as const)
          for (const q of [A[f].proximal, A[f].distal, A[f].heel])
            low = Math.min(low, placePoint(pose[f], q, A[f].proximal)[1]);
        lowMin = Math.min(lowMin, low);
        lowMax = Math.max(lowMax, low);
        prev = pose;
      }
      check('모든 장면 · 부위의 자세가 숫자', nan === 0, `NaN ${nan}`);
      check('회전 행렬 det = 1(거울 아님)', flips === 0, `${flips}`);
      check(
        '모델 무릎이 맞춘 무릎에서 키의 8% 안(뼈 길이는 모델 그대로라 조금 어긋난다)',
        kneeErr < 0.08,
        `최대 ${(kneeErr * 100).toFixed(1)}%`
      );
      check(
        '모델 손목이 맞춘 손목에서 키의 12% 안(어깨 → 위팔 → 아래팔 세 마디 누적)',
        wristErr < 0.12,
        `최대 ${(wristErr * 100).toFixed(1)}%`
      );
      check(
        '두 발 중 낮은 점이 늘 바닥(0)',
        Math.abs(lowMin) < 1e-6 && Math.abs(lowMax) < 1e-6,
        `${lowMin.toFixed(4)} ~ ${lowMax.toFixed(4)}`
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
    }
  }
}

console.log(`\n통과 ${passed} · 실패 ${failed}`);
if (failed > 0) process.exit(1);
