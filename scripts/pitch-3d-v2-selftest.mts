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
  engineKeyOf,
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
  ACTIVE_TTL_MS,
  DAILY_FAIL_LIMIT,
  DAILY_REQUEST_LIMIT,
  MAX_ACTIVE,
  fileFingerprint,
  finishRequest,
  guardBlock,
  recordRequest,
  serverPairBlock,
  labMetaBlock,
  labPairBlock,
  labVideoBlock,
  readLabGuard,
  recordFail,
  seoulDay,
} from '../lib/pitch-lab-guard.ts';
import { parseAppleDate, readLabFileFacts, videoEditShift } from '../lib/pitch-lab-file.ts';
import { followStep, sourceTimesAt, FOLLOW_SEEK_S } from '../lib/pitch-3d/v2/video-sync.ts';
import { readLabMeta } from '../lib/pitch-lab-meta.ts';
import {
  base,
  cameras,
  EV,
  realistic,
  truthMetrics,
  type Scenario,
} from './pitch-lab/synth.mts';
import { makeV2Track } from './pitch-lab/synth-v2.mts';
import { mannequinOddities } from './pitch-lab/jitter/measure.mts';
import { fixShoulderSwaps } from '../lib/pitch-3d/v2/clean2d.ts';
import { footJump, footSway, gapWristError, hipSnap, junkGloveError, leadGapJump } from './pitch-lab/gap-check.mts';
import { blendAi, despike, displayTrack, readAiGate, readAiJoints, readAiMiss } from '../lib/pitch-3d/v2/display.ts';
import { mannequinTrack, smoothForMannequin, type MannequinJoints, type MannequinTrack } from '../lib/pitch-3d/v2/mannequin-prep.ts';
import {
  basis,
  blendMannequin,
  canonicalFrames,
  frame as mannequinFrame,
  mannequinFrames,
  mid,
  rotate,
  slerp,
} from '../lib/pitch-3d/v2/mannequin-frames.ts';
import { labelText, labelValues, measureAngles, measureSpec, momentOf, type Arc } from '../lib/pitch-3d/v2/mannequin-measure.ts';
import {
  computeNormals,
  loftIndices,
  loftVertexCount,
  shoeAxes,
  torsoIndices,
  torsoModel,
  TORSO_PANTS_VERTS,
  TORSO_SHIRT_VERTS,
  fanIndices,
  writeFan,
  writeLoft,
  STRIPE,
  STRIPE_VERTS,
  stripeIndices,
  writeStripes,
  writeTorso,
  writeTube,
} from '../lib/pitch-3d/v2/mannequin-loft.ts';
import { LIGHT_RIG, TORSO, TORSO_KEYS, curve, moundShade, toDisplay, torsoN, valueNoise2 } from '../lib/pitch-3d/v2/mannequin-profiles.ts';
import {
  BONE_SIZES,
  anaMaterials,
  anaStep,
  arcFrame,
  arcPolyline,
  boneEnds,
  boneSpec,
  BONE_TABLE,
  fitSkeleton,
  prepareSkeleton,
  skeletonT,
  placeLabels,
  projectToScreen,
} from '../lib/pitch-3d/v2/mannequin-pause.ts';
import { KIN_LIMITS, KIN_SPEED, kinematicTrack, kneeTowardToes, twoBoneIk } from '../lib/pitch-3d/v2/kinematics.ts';
import { moundHeightAt } from '../lib/pitch-3d/v2/pose-rig.ts';
import { AI_SPINE_DEV_DEG, RULE_TWIST, TRUNK_LEVELS, readAiTrunk, trunkTrack } from '../lib/pitch-3d/v2/trunk.ts';
import { mechChecks } from '../lib/pitch-3d/v2/mech-checks.ts';
import { judgeMechanics } from '../lib/pitch-3d/v2/mech-judge.ts';
import { judgeElements, pickProblems, readReportSummary, reportSummary, summaryChip, type PitchReport } from '../lib/pitch-3d/v2/report.ts';
import type { MechChecks } from '../lib/pitch-3d/v2/mech-checks.ts';
import { drillPicksFor } from '../lib/mechanics/drills.ts';
import { FOCUS_POINTS } from '../lib/exercise-meta.ts';

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
  /* 엔진 판 = 약속 판 + 서버 지문 — 엔진을 다시 올리면 판이 바뀌어 같은 영상 다시 막기가 풀린다(2026-10-16) */
  check(
    '엔진 판 — 지문이 있으면 약속 판+지문, 없으면 약속 판, 다른 지문이면 다른 판',
    engineKeyOf(null) === PITCH3D_V2_VERSION &&
      engineKeyOf('abc123') === `${PITCH3D_V2_VERSION}+abc123` &&
      engineKeyOf('abc123') !== engineKeyOf('def456') &&
      newV2Job(null, { jobId: JOB_ID, requestedBy: 'a', consentAt: iso(T0), now: iso(T0), engine: 'k' }).engine === 'k'
  );
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
/*
 * v1 시험의 기준(빠른 판 — 무너짐을 잡는 넉넉한 문턱)과 같다. 어깨 벌림만 2.5 — 뼈 길이를 좌우 같은 값으로 굳히면 깨끗한 합성에서도 2° 쯤 움직인다(v1 1.1°).
 * 분리 최대도 2.5 — 합성 투수의 골반 ÷ 어깨 폭은 0.74(synth.mts)라 엔진 상한 0.62(fit.ts HIP_TO_SHOULDER_MAX, 두 마커 촬영의 실제 0.60 · 0.645)에
 * 걸려 골반이 좁게 맞춰지고 분리가 2.4° 쯤 작게 나온다(2026-10-22). 합성 몸을 0.645 로 바꾸면 다른 시험 둘(초점 표 · 가까이 넓게)이 흔들려 그대로 둔다.
 */
const V2_CLEAN: Partial<Record<MetricKey, number>> = {
  trunkForwardTilt: 1.5,
  trunkLateralTilt: 1.5,
  separationMax: 2.5,
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
    /* 화면 · 지표의 '착지' = 첫 닿음(2026-10-16) — 발목 기준 착지와 같거나 앞, 마커 15구에서 앞선 몫은 0.15초 안 */
    const fc = seg.events.footContact;
    check(
      '첫 닿음: 발목 기준 착지와 같거나 0.15초 안으로 앞',
      fc != null && fc <= seg.events.footPlant && seg.events.footPlant - fc < 0.15,
      `${fc} · ${seg.events.footPlant}`
    );
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
      /* 발은 LIFT(0.12초) 뒤 땅 — 디딘 높이 몸통의 3% 안(2026-10-15)이라 2D 흔들림에 두 장면쯤 더 늦을 수 있다 */
      '착지 뒤에도 내려오는 앞발 — 착지를 발이 땅에 닿은 때로(0.06 ~ 0.18초 늦게)',
      seg5.ok && seg5.events.footPlant - fp0 > 0.06 && seg5.events.footPlant - fp0 < 0.18,
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
  check(
    'fit 입력 순간: 첫 닿음은 착지와 같거나 앞일 때만',
    readV2Events({ footPlant: 2, footContact: 1.9, release: 2.5 })?.footContact === 1.9 &&
      readV2Events({ footPlant: 2, footContact: 2.1, release: 2.5 })?.footContact === undefined
  );
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

console.log('■ 마운드 · 보기용 다듬기 · 관절 각도 틀(kinematics) — 합성 결과');
{
  {
    const { result } = runV2({ ...base, ...realistic, name: 'rig' }, 5);
    if (!result.ok) check('합성 결과(마운드 · 보기 · 각도 모델)', false, result.code);
    else {
      const frames = result.joints.map((fr) =>
        fr.map(
          (p) => [p[0] / 1000, p[1] / 1000, p[2] / 1000] as [number, number, number]
        )
      );
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
          /* 평지도 같은 축발 자리 — 예전엔 무대가 '가장 먼저 닿은 발'(우투면 앞발일 수 있음)로 정해 투수판이 축발 앞에 놓였다(2026-10-20 샘플 15) */
          const fc = flat.contacts.find((c) => c.side === 'R' && c.from <= fp);
          const flatBack = fc
            ? Math.min(...[V2J.rAn, V2J.rHe, V2J.rTo].map((j) => flat.frames[fc.from][j][0]))
            : NaN;
          check(
            '보기: 평지 투수판도 축발 뒤(발 너비 안쪽 · 앞발이 아님)',
            flat.rubber != null && flat.rubber.x0 < flatBack - 0.01 && flat.rubber.x0 > flatBack - 0.15,
            flat.rubber ? `${flat.rubber.x0.toFixed(3)} vs 축발 ${flatBack.toFixed(3)}` : '투수판 없음'
          );
          check(
            '보기: 마운드 투수판 = 마운드 앞 모서리',
            tr.rubber != null && tr.mound != null && tr.rubber.x0 === tr.mound.x0 && tr.rubber.z0 === tr.mound.z0,
            tr.rubber ? `${tr.rubber.x0}` : '투수판 없음'
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

        /*
         * 4-8 공 놓은 뒤처럼 팔을 쭉 편 동안에도 안쪽으로 계속 돌고(편 12장면에 192°), 다시 굽은 첫 장면이 110° 엉뚱해도 그 뒤 아래팔이 입력을
         * 따라간다 — 비틀림을 짧은 쪽(거꾸로)으로 이어 다듬기 한계로 8장면 늦게 따라가던 것(2026-10-13 실험실 샘플 1 손목 흔들림 키의 6.7%)
         */
        {
          const sh = mid0[V2J.rSh];
          const el = mid0[V2J.rEl];
          const lf = norm(sub(mid0[V2J.rWr], el));
          const u = normalize(sub(el, sh));
          const p1 = normalize(cross(u, [0, 0, 1]));
          const p2 = cross(u, p1);
          const n = 40;
          const th: number[] = [];
          for (let k = 0, a = 0; k < n; k++) th.push((a += k >= 11 && k <= 22 ? -16 : -8));
          const foreOf = (k: number) => {
            const flex = (k >= 10 && k <= 21 ? 3 : 45) * (Math.PI / 180);
            const t = (th[k] + (k === 22 ? 110 : 0)) * (Math.PI / 180);
            const pd = add(scale(p1, Math.cos(t)), scale(p2, Math.sin(t)));
            return add(scale(u, Math.cos(flex)), scale(pd, Math.sin(flex)));
          };
          const seq = seqOf(n, (fr, k) => {
            fr[V2J.rWr] = add(el, scale(foreOf(k), lf));
          });
          const F = kinematicTrack(seq, fullConf(n), []).frames;
          let worst = 0;
          for (let k = 25; k < n; k++)
            worst = Math.max(worst, deg(Math.acos(Math.min(1, dot(normalize(sub(F[k][V2J.rWr], F[k][V2J.rEl])), foreOf(k))))));
          check('각도 모델: 편 팔 동안 돈 비틀림을 같은 쪽으로 이어 다시 굽은 아래팔이 늦지 않는다(25° 안)', worst <= 25, `${worst.toFixed(1)}°`);
        }

        /*
         * 4-9 굽힌 팔(115°)에서 엔진이 지어낸 팔꿈치(확신 0)가 첫 장면들에 어깨 → 손목 축 둘레로 240° 미끄러져도 손목이 가만하면 화면 손목도
         * 제자리(2cm 안) — 각을 따로 다듬어 손이 8장면 동안 휘둘리던 것(2026-10-13 실험실 샘플 10 첫머리, 화면 손 키의 5%)
         */
        {
          const S = mid0[V2J.rSh];
          const Lu = norm(sub(mid0[V2J.rEl], S));
          const Lf = norm(sub(mid0[V2J.rWr], mid0[V2J.rEl]));
          const c = normalize(sub(mid0[V2J.rWr], S));
          const d = Math.sqrt(Lu * Lu + Lf * Lf - 2 * Lu * Lf * Math.cos((65 * Math.PI) / 180));
          const Wfix = add(S, scale(c, d));
          const along = (Lu * Lu - Lf * Lf + d * d) / (2 * d);
          const h = Math.sqrt(Lu * Lu - along * along);
          const b1 = normalize(cross(c, [0, 1, 0]));
          const b2 = cross(c, b1);
          const n = 30;
          const seq = seqOf(n, (fr, k) => {
            const phi = (Math.min(k, 3) / 3) * ((240 * Math.PI) / 180); // 장면마다 80°(샘플 10 은 장면마다 65~107°)
            fr[V2J.rEl] = add(add(S, scale(c, along)), add(scale(b1, h * Math.cos(phi)), scale(b2, h * Math.sin(phi))));
            fr[V2J.rWr] = Wfix;
            const fd = normalize(sub(Wfix, fr[V2J.rEl]));
            for (const j of [V2J.rHandIdx, V2J.rHandMid, V2J.rHandPinky]) fr[j] = add(Wfix, scale(fd, 0.05));
          });
          const conf = fullConf(n).map((row, k) => {
            if (k < 12) row[V2J.rEl] = 0;
            return row;
          });
          const F = kinematicTrack(seq, conf, []).frames;
          let worst = 0;
          for (let k = 0; k < n; k++) worst = Math.max(worst, norm(sub(F[k][V2J.rWr], Wfix)));
          check('각도 모델: 지어낸 팔꿈치가 미끄러져도 가만한 손목은 제자리(2cm 안)', worst <= 0.02, `${(worst * 100).toFixed(1)}cm`);
        }

        /*
         * 4-10 무릎은 발끝 쪽으로 — 25° 굽은 무릎이 발끝 반대쪽(150°)이면 발끝 ±60° 안으로, 뼈 길이 그대로. 무릎이 뒤(180°)를 지나 반대편으로 가도
         * 한 장면에 튀지 않는다(한계로 자르기만 하면 +60 ↔ −60°). 많이 굽힌 무릎(다리 들기 100°)은 그대로(2026-10-13 기아 샘플 · 샘플 10)
         */
        {
          const hip: Vec3 = [0, 0.9, 0];
          const ankle: Vec3 = [0, 0.05, 0];
          const toe: Vec3 = [1, 0, 0];
          const kneeAt = (thDeg: number, bendDeg: number): Vec3 => {
            const h = 0.45 * Math.sin((bendDeg * Math.PI) / 360);
            const t = (thDeg * Math.PI) / 180;
            return [h * Math.cos(t), 0.475, h * Math.sin(t)];
          };
          const sideOf = (k: Vec3) => (Math.atan2(k[2], k[0]) * 180) / Math.PI;
          const k1 = kneeTowardToes(hip, kneeAt(150, 25), ankle, toe);
          const lenOk = Math.abs(norm(sub(k1, hip)) - norm(sub(kneeAt(150, 25), hip))) < 1e-9;
          let jump = 0;
          let prev: Vec3 | null = null;
          for (let th = 120; th <= 240; th += 2) {
            const k = kneeTowardToes(hip, kneeAt(th, 25), ankle, toe);
            if (prev) jump = Math.max(jump, norm(sub(k, prev)));
            prev = k;
          }
          const lifted = kneeTowardToes(hip, kneeAt(180, 100), ankle, toe);
          check(
            '각도 모델: 무릎은 발끝 ±60° 안 · 뒤를 지나도 안 튐 · 다리 들기는 그대로',
            Math.abs(sideOf(k1)) <= 60.01 && lenOk && jump < 0.01 && norm(sub(lifted, kneeAt(180, 100))) < 1e-9,
            `${sideOf(k1).toFixed(0)}° · 한 장면 최대 ${(jump * 100).toFixed(2)}cm`
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
          /*
           * 넙다리 방향은 cap 을 정확히 지키고, 그 뒤 땅에 묶인 발목에 맞춰 무릎을 다시 접는 단계가 무릎 굽힘에 따라 1.5~1.7° 를 더한다 — 자세는 합성
           * 투수를 엔진에 맞춘 가운데 장면이라 엔진 다듬기가 바뀌면 같이 움직인다(2026-10-13 다듬기 세기 바꿈: 14.8 → 15.0°). 그래서 여유 2°.
           */
          check(`각도 모델: 디딘 다리 무릎이 4장면 옆으로 튀어도 넙다리는 한 장면 ${cap}° 남짓까지`, worst <= cap + 2, `${worst.toFixed(1)}°`);
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

console.log('■ 데생 인형 관절(mannequin-prep) — 좌우 · 거울 · 떨림 고르기');
{
  for (const hand of ['R', 'L'] as const) {
    const { result } = runV2({ ...base, ...realistic, hand, name: `인형 ${hand}` }, 3);
    if (!result.ok) {
      check(`인형 ${hand} — 맞추기 성공`, false);
      continue;
    }
    const tr = displayTrack(result, { ground: 'flat', heightM: 1.8 });
    const m = mannequinTrack(tr, result, 1.8);
    const S = smoothForMannequin(tr.frames, result, 1.8);
    const k = result.events.footPlant;
    /* 앞발(글러브 쪽) 엉덩이 = 우투 해부학 왼쪽 · 좌투 오른쪽, 셋째 축은 뒤집어 y = 왼쪽 */
    const lead = S[k][V2J[hand === 'R' ? 'lHip' : 'rHip']];
    const lh = m.frames[k].lh;
    check(
      `인형 ${hand}: 앞발 쪽 엉덩이 · 축 바꿈(x 앞 · y 왼쪽 · z 위)이 맞다`,
      m.frames.length === tr.frames.length &&
        Math.hypot(lh[0] - lead[0], lh[1] + lead[2], lh[2] - lead[1]) < 1e-9
    );
    /* 글러브 손목 가속(장면 사이) p95 — 다듬기 전보다 작다 */
    const acc = (F: Vec3[][], j: number) => {
      const a: number[] = [];
      for (let i = 1; i < F.length - 1; i++)
        a.push(Math.hypot(...([0, 1, 2].map((c) => F[i - 1][j][c] - 2 * F[i][j][c] + F[i + 1][j][c]) as Vec3)));
      a.sort((x, y) => x - y);
      return a[Math.floor(a.length * 0.95)];
    };
    const gw = V2J[hand === 'R' ? 'lWr' : 'rWr'];
    const raw = acc(tr.frames.map((f) => f.map((p) => [p[0] * 1.8, p[1] * 1.8, p[2] * 1.8] as Vec3)), gw);
    const smo = acc(S, gw);
    check(`인형 ${hand}: 글러브 손목 떨림(가속 p95)이 줄어든다`, smo < raw * 0.7, `${(raw * 1000).toFixed(1)} → ${(smo * 1000).toFixed(1)}mm`);
  }
}

console.log('■ 데생 인형 틀(mannequin-frames) · 잰 선(mannequin-measure) — 우투 꼴 · 거울 · 머리 · 발 · 손 · 숫자 출처');
{
  const near = (a: Vec3, b: Vec3, eps = 1e-9) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < eps;
  const near4 = (a: number[], b: number[], eps = 1e-9) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < eps);
  /* 쿼터니언 — 틀의 세 축이 그대로 돌아 나온다 · 보간은 단위 길이 */
  {
    const x = normalize([0.3, -0.9, 0.1] as Vec3);
    const yRaw: Vec3 = [0, 0.2, 1];
    const y = normalize(sub(yRaw, scale(x, dot(yRaw, x))));
    const z = cross(x, y);
    const q = basis(x, y, z);
    check('쿼터니언: 틀 축 셋이 그대로 돌아 나온다', near(rotate(q, [1, 0, 0]), x) && near(rotate(q, [0, 1, 0]), y) && near(rotate(q, [0, 0, 1]), z));
    const q2 = basis([0, 1, 0], [-1, 0, 0], [0, 0, 1]);
    const h = slerp(q, q2, 0.5);
    check('쿼터니언: 반쯤 보간해도 단위 길이 · 끝점은 그대로', Math.abs(Math.hypot(...h) - 1) < 1e-9 && near4(slerp(q, q2, 0), q, 1e-12) && near4(slerp(q, q2, 1), q2, 1e-12));
  }
  /* 우투 꼴에서 x = 던지는 쪽 − 글러브 쪽(몸 오른쪽 = −y)이면 앞이 +x(홈 쪽) */
  {
    const f = mannequinFrame([0, -0.3, 0], [0, 0, 1]);
    check('틀: 우투 꼴 골반 틀의 앞이 홈 쪽(+x)', near(f.fw, [1, 0, 0]) && near(f.ya, [0, 0, 1]));
  }
  const { result } = runV2({ ...base, ...realistic, name: '인형 틀' }, 3);
  if (!result.ok) check('인형 틀 — 맞추기 성공', false);
  else {
    const H = 1.8;
    const tr = displayTrack(result, { ground: 'flat', heightM: H });
    const mR = mannequinTrack(tr, result, H);
    const fr = canonicalFrames(mR);
    const F = mannequinFrames(fr, H);
    const k = H / 1.8;
    check('틀: 우투는 우투 꼴 그대로', fr === mR.frames && F.length === mR.frames.length);
    /*
     * 실제 자료에서 본 두 잘못을 합성에 넣어 인형이 걸러 내는지 — ① 엔진 앞발이 착지 뒤까지 옆을 보다 늦게 돈다(실험실 샘플 다섯) ② 착지 ~ 릴리스 뒤
     * 던지는 팔에 2D 잡음(마커 25구 꺾임 138곳). 고치기 전(앞발 돌림 0 · 팔 곡선 맞춤 0)이면 둘 다 실패한다.
     */
    {
      const ev = result.events;
      const fc = Math.round(ev.footContact ?? ev.footPlant);
      let seed = 7;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) - 0.5;
      const bad = {
        ...result,
        joints: result.joints.map((fr, k) => {
          const out = fr.map((p) => [...p] as [number, number, number]);
          /* ② 던지는 팔(오른팔) 손목 · 손 · 팔꿈치에 장면마다 잡음 ±30mm */
          if (k >= ev.footPlant - 5 && k <= ev.release + 25) {
            const w = [rnd() * 60, rnd() * 60, rnd() * 60];
            for (const j of [V2J.rWr, V2J.rHandMid, V2J.rHandIdx, V2J.rHandPinky]) out[j] = [out[j][0] + w[0], out[j][1] + w[1], out[j][2] + w[2]];
            out[V2J.rEl] = [out[V2J.rEl][0] + rnd() * 30, out[V2J.rEl][1] + rnd() * 30, out[V2J.rEl][2] + rnd() * 30];
          }
          return out;
        }),
      };
      const odd = mannequinOddities(bad);
      check(`팔 잡음을 넣어도 인형 던지는 팔이 꺾이지 않는다(꺾임 ${odd.kink} · 1 이하 — 곡선 맞춤을 끄면 3)`, odd.kink <= 1);
      /* ① 착지 맞춤 앞(화면 트랙)에서 앞발이 착지 직전까지 110° 옆을 보다 착지부터 디딘 방향(위 축 = y) — 그 사이 돌림은 착지 맞춤이 그린다 */
      const late = tr.frames.map((fr, k) => {
        const out = fr.map((p) => [...p] as Vec3);
        const th = k < fc ? (110 * Math.PI) / 180 : 0;
        const an = out[V2J.lAn];
        for (const j of [V2J.lHe, V2J.lTo]) {
          const dx = out[j][0] - an[0];
          const dz = out[j][2] - an[2];
          out[j] = [an[0] + dx * Math.cos(th) - dz * Math.sin(th), out[j][1], an[2] + dx * Math.sin(th) + dz * Math.cos(th)];
        }
        return out;
      });
      const S1 = smoothForMannequin(late, result, H);
      const dirL = (f: Vec3[]) => normalize(sub(f[V2J.lTo], f[V2J.lHe]));
      let turn = 0;
      for (let q = Math.max(1, fc - 40); q <= Math.min(S1.length - 1, fc); q++)
        turn = Math.max(turn, (Math.acos(Math.max(-1, Math.min(1, dot(dirL(S1[q - 1]), dirL(S1[q]))))) * 180) / Math.PI / mR.dt);
      check(`앞발이 늦게 돌아도 인형 앞발이 휙 돌지 않는다(착지 앞 가장 빠른 돌림 ${turn.toFixed(0)}°/초 · 1500 안)`, turn < 1500);
    }
    /* 착지 맞춤이 앞발목을 옮겨도 앞 넙다리 길이는 그대로(무릎을 두 마디로 다시 접는다 — 예전엔 무릎을 발목만큼 옮겨 넙다리가 늘었다) */
    {
      const S0 = smoothForMannequin(tr.frames, result, H);
      const len = (f: Vec3[]) => norm(sub(f[V2J.lKn], f[V2J.lHip]));
      const fc = Math.round(result.events.footContact ?? result.events.footPlant);
      const ref = len(S0[Math.max(0, fc - 40)]);
      let worst = 0;
      for (let q = Math.max(0, fc - 30); q < Math.min(S0.length, fc + 40); q++) worst = Math.max(worst, Math.abs(len(S0[q]) - ref));
      check(`착지 맞춤: 앞 넙다리 길이 그대로(착지 앞뒤 가장 큰 변화 ${(worst * 100).toFixed(1)}cm · 0.5cm 안 — 고치기 전 합성 1.5 · 실제 가운데 11cm)`, worst < 0.005);
    }
    /* 장면 사이 그리기 — 끝(u 0 · 1)은 그 장면 그대로, 가운데는 두 장면 사이 · 회전은 길이 1 */
    {
      const kk = Math.floor(fr.length / 2);
      const b0 = blendMannequin(fr, F, kk, 0);
      const b1 = blendMannequin(fr, F, kk, 1);
      const bm = blendMannequin(fr, F, kk, 0.5);
      const between = (x: Vec3, a: Vec3, c: Vec3) => norm(sub(x, scale(add(a, c), 0.5))) <= norm(sub(a, c)) * 0.6 + 1e-9;
      check(
        '장면 사이: u 0 · 1 은 그 장면, 0.5 는 두 장면 사이(손목 · 발목) · 틀 회전 길이 1',
        b0.J === fr[kk] && b1.J === fr[kk + 1] && between(bm.J.wr, fr[kk].wr, fr[kk + 1].wr) && between(bm.J.la, fr[kk].la, fr[kk + 1].la) &&
          Math.abs(Math.hypot(...bm.F.chest.q) - 1) < 1e-6 && Math.abs(norm(bm.F.throwing.hd) - 1) < 1e-6
      );
      /* 손 · 발이 팔다리 끝에 붙는다 — 릴리스 근처 장면 사이마다 손 가운데 = 손목 + 손 방향 4.5%(handFrame), 발목 = 정강이 끝 */
      let worstHand = 0;
      let worstAnkle = 0;
      for (let q = Math.max(1, mR.events.release - 15); q < Math.min(fr.length - 2, mR.events.release + 15); q++)
        for (const uu of [0.25, 0.5, 0.75]) {
          const b = blendMannequin(fr, F, q, uu);
          worstHand = Math.max(worstHand, norm(sub(b.F.throwing.hc, add(b.J.wr, scale(b.F.throwing.hd, 0.045 * k)))));
          worstAnkle = Math.max(worstAnkle, norm(sub(b.F.lead.ankle, b.J.la)) - norm(sub(F[q].lead.ankle, fr[q].la)) - norm(sub(F[q + 1].lead.ankle, fr[q + 1].la)));
        }
      check(`장면 사이: 손 가운데가 손목에 붙어 있다(릴리스 앞뒤, 가장 큰 차 ${(worstHand * 1000).toFixed(2)}mm · 1mm 안)`, worstHand < 1e-3);
      check(`장면 사이: 앞발목이 정강이 끝에서 장면보다 더 떨어지지 않는다(${(worstAnkle * 1000).toFixed(2)}mm)`, worstAnkle < 1e-3);
    }
    /* 같은 몸을 y 로 뒤집고 좌투라고 하면 — 우투 꼴로 돌아와 모든 틀이 같다(거울 규칙의 핵심) */
    const mL: MannequinTrack = {
      ...mR,
      hand: 'L',
      frames: mR.frames.map(
        (J) => Object.fromEntries(Object.entries(J).map(([key, p]) => [key, [p[0], -p[1], p[2]]])) as typeof J
      ),
    };
    const FL = mannequinFrames(canonicalFrames(mL), H);
    let same = true;
    for (let i = 0; i < F.length && same; i++) {
      const a = F[i];
      const b = FL[i];
      same =
        near(a.pelvis.fw, b.pelvis.fw) && near4(a.chest.q, b.chest.q) && near(a.head.hc, b.head.hc) &&
        near(a.lead.heel, b.lead.heel) && near(a.throwing.side, b.throwing.side) && near(a.glove.nrm, b.glove.nrm);
    }
    check('틀: 거울로 뜬 좌투 = 우투 틀과 똑같다(앞 방향 · 엄지 쪽 · 손바닥 쪽까지)', same);
    /* 틀은 정규직교 · 오른손 좌표계, 릴리스에선 가슴이 홈 쪽을 본다 */
    const ortho = (f: ReturnType<typeof mannequinFrame>) =>
      Math.abs(dot(f.xa, f.ya)) < 1e-9 && near(cross(f.xa, f.ya), scale(f.fw, -1)) && Math.abs(Math.hypot(...f.fw) - 1) < 1e-9;
    check('틀: 골반 · 가슴 틀이 모두 정규직교', F.every((f) => ortho(f.pelvis) && ortho(f.chest)));
    const rel = F[result.events.release];
    check('틀: 릴리스에서 가슴 앞이 홈 쪽', rel.chest.fw[0] > 0.3, rel.chest.fw.map((v) => v.toFixed(2)).join(','));
    /* 머리 — 목에서 35° 안, 목 끝 위 */
    const headOk = F.every((f) => {
      const a = Math.acos(Math.max(-1, Math.min(1, dot(f.head.up, f.chest.ya))));
      return a <= 0.6 + 1e-6 && f.head.hc[2] > f.head.nk[2] - 0.02 && Math.abs(dot(f.head.up, f.head.fw)) < 1e-6;
    });
    check('머리: 목에서 35° 안 · 위와 앞이 직각', headOk);
    /* 발 — 올림은 0~5cm, 신발 등은 발 축에 직각, 발 길이 25% 키 배율 */
    const feetOk = F.every((f) =>
      [f.rear, f.lead].every((p) => {
        const d = sub(p.toe, p.heel);
        return p.lift >= 0 && p.lift <= 0.05 + 1e-9 && Math.abs(dot(normalize(d), p.n)) < 1e-6 && Math.abs(Math.hypot(...d) - 0.25 * k) < 1e-6;
      })
    );
    check('발: 올림 0~5cm · 신발 등이 발 축에 직각 · 발 길이가 키 배율', feetOk);
    /* 손 — 엄지 쪽 · 손바닥 쪽 · 손 방향이 서로 직각 */
    const handOk = F.every((f) =>
      [f.throwing, f.glove].every((h) => Math.abs(dot(h.hd, h.side)) < 1e-6 && Math.abs(dot(h.hd, h.nrm)) < 1e-6 && Math.abs(dot(h.side, h.nrm)) < 1e-6)
    );
    check('손: 손 방향 · 엄지 쪽 · 손바닥 쪽이 서로 직각', handOk);
    /* 잰 값 — 범위 안, 순간에는 표의 값이 붙는다 */
    const fp = result.events.footPlant;
    const live = measureAngles(fr[fp]);
    check(
      '잰 값: 착지 장면 다섯 값이 몸으로 나올 범위',
      Math.abs(live.separation) <= 180 && live.trunk <= 90 && live.knee >= -5 && live.knee <= 160 && live.arm <= 180 && live.elbow >= -5 && live.elbow <= 180,
      JSON.stringify(Object.fromEntries(Object.entries(live).map(([a, b]) => [a, Math.round(b)])))
    );
    const atPlant = labelValues(live, momentOf(fp, result.events), result.metrics);
    const tableKnee = result.metrics.find((m) => m.key === 'leadKneeAtPlant');
    check(
      '잰 값: 착지 이름표는 늘 그림 값 · 앞무릎엔 표 값이 곁에 · 8° 넘으면 off',
      tableKnee != null &&
        atPlant.knee.value === live.knee &&
        atPlant.knee.table === Math.abs(tableKnee.value) &&
        atPlant.knee.off === Math.abs(live.knee - Math.abs(tableKnee.value)) > 8 &&
        atPlant.elbow.table === undefined &&
        !atPlant.elbow.off
    );
    if (tableKnee) {
      const diff = Math.abs(live.knee - Math.abs(tableKnee.value));
      console.log(`      참고 — 착지 앞무릎: 보기용 ${live.knee.toFixed(1)}° vs 표 ${tableKnee.value.toFixed(1)}° (차이 ${diff.toFixed(1)}°${diff > 8 ? ' ← 8° 넘음' : ''})`);
    }
    const midF = Math.floor((fp + result.events.release) / 2);
    const between = labelValues(measureAngles(fr[midF]), momentOf(midF, result.events), result.metrics);
    check('잰 값: 순간이 아닌 장면은 표 값 없음 · 흐림 없음', Object.values(between).every((v) => v.table === undefined && !v.off));
    /* 상하체 분리 부호 — 위에서 본 엉덩이선 · 어깨선 방향(우투 꼴: 닫힌 자세 180°, 열수록 커짐) */
    const sepAt = (hipDeg: number, shDeg: number) => {
      const d = (deg: number, r: number): Vec3 => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180), 0];
      const hc: Vec3 = [0, 0, 1];
      const sc: Vec3 = [0, 0, 1.5];
      return measureAngles({ ...fr[fp], rh: add(hc, d(hipDeg, 0.1)), lh: sub(hc, d(hipDeg, 0.1)), sh: add(sc, d(shDeg, 0.2)), gs: sub(sc, d(shDeg, 0.2)) })
        .separation;
    };
    check(
      "잰 값: 골반이 더 열리면 분리 +(이름표 숫자) · 어깨가 골반을 앞지르면 −(이름표 '풀림' — 던진 뒤 꼬임이 커진 것처럼 안 읽히게)",
      Math.abs(sepAt(225, 180) - 45) < 1e-9 && Math.abs(sepAt(225, 270) + 45) < 1e-9 &&
        labelText('separation', sepAt(225, 180)) === '45°' && labelText('separation', sepAt(225, 270)) === '풀림' &&
        labelText('separation', -0.4) === '0°' && labelText('trunk', -12) === '-12°'
    );
    /* 선 명세 — 호의 점은 반지름 위, 가운데 점은 반각, 이름표는 상하체 분리 하나 */
    const spec = measureSpec(fr[fp], F[fp].pelvis, F[fp].chest, k, atPlant);
    const arcOk = spec.arcs.every((a) => {
      const r = Math.hypot(...sub(a.points[0], a.c));
      return a.points.every((p) => Math.abs(Math.hypot(...sub(p, a.c)) - r) < 1e-9) && Math.abs(Math.hypot(...sub(a.mid, a.c)) - r) < 1e-9;
    });
    check(
      '선 명세: 이름표는 상하체 분리 하나 · 호 둘(분리 · 몸통) · 선 여섯 · 점 넷(팔꿈치 · 어깨 · 무릎 선 없음) · 호의 점이 반지름 위',
      spec.arcs.length === 2 && spec.labels.length === 1 && spec.labels[0].key === 'separation' && arcOk && spec.segments.length === 6 &&
        spec.dots.length === 4 && spec.arcs.every((a) => a.key === 'separation' || a.key === 'trunk')
    );
  }
}

console.log('■ 글러브 팔 — 착지 ~ 릴리스 뒤 영상이 지어낸 점(확신 0.4, 장면마다 튐)을 믿지 않는다');
{
  /* 고치기 전(흐린 뒤 영상 점과 교차) 씨앗 33 · 44: 4.5 · 8.2%, 고친 뒤 4.0 · 5.2% */
  for (const seed of [33, 44]) {
    const e = junkGloveError(seed);
    check(
      `글러브 손목 오차 가운데값이 키의 6% 밑(씨앗 ${seed})`,
      e != null && e < 0.06,
      e == null ? '맞추기 실패' : `${(e * 100).toFixed(1)}%`
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

console.log('■ 데생 인형 겉면(mannequin-loft) — 색인 · 정점 · 법선 · 신발 틀 · 몸통');
{
  const nearV = (a: Vec3, b: Vec3, eps = 1e-9) => norm(sub(a, b)) < eps;
  const edgeCounts = (idx: number[]) => {
    const m = new Map<string, number>();
    for (let i = 0; i < idx.length; i += 3)
      for (let e = 0; e < 3; e++) {
        const a = idx[i + e];
        const b = idx[i + ((e + 1) % 3)];
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        m.set(key, (m.get(key) ?? 0) + 1);
      }
    return [...m.values()];
  };
  const RN = 6;
  const K = 8;
  const idx = loftIndices(RN, K, true);
  const nV = loftVertexCount(RN, K, true);
  check('겉면 색인: 삼각형 수 = 옆 2·RN·K + 뚜껑 2·K', idx.length === 3 * (2 * RN * K + 2 * K));
  check('겉면 색인: 닫힌 면 — 모든 모서리가 삼각형 둘에 쓰인다', edgeCounts(idx).every((c) => c === 2));
  const used = new Set(idx);
  check('겉면 색인: 정점을 빠짐없이 쓰고 넘지 않는다', used.size === nV && Math.max(...used) === nV - 1);
  check(
    '겉면 색인: 열린 띠는 양 끝 고리(2·K 모서리)만 한 번 쓰인다',
    edgeCounts(loftIndices(RN, K, false)).filter((c) => c === 1).length === 2 * K
  );

  /* 곧은 관: (X, U, 진행) 오른손 꼴 → 옆 법선은 바깥쪽 */
  const pos = new Float32Array(nV * 3);
  const nor = new Float32Array(nV * 3);
  writeLoft(pos, (t) => [t, 0, 0], [0, 1, 0], [0, 0, 1], () => 0.1, () => 0.1, () => 0.1, { RN, K, n: 2 });
  let rErr = 0;
  for (let r = 0; r <= RN; r++)
    for (let i = 0; i < K; i++) {
      const o = (r * K + i) * 3;
      rErr = Math.max(rErr, Math.abs(Math.hypot(pos[o + 1], pos[o + 2]) - 0.1), Math.abs(pos[o] - r / RN));
    }
  check('겉면 정점: 원 단면(n = 2)은 반지름 · 길이 자리 그대로', rErr < 1e-6, `오차 ${rErr}`);
  check(
    '겉면 정점: 뚜껑 점 둘은 양 끝 가운데',
    pos[(nV - 2) * 3] === 0 && pos[(nV - 1) * 3] === 1 && pos[(nV - 1) * 3 + 1] === 0 && pos[(nV - 1) * 3 + 2] === 0
  );
  computeNormals(pos, idx, nor);
  let nErr = 0;
  let inward = 0;
  for (let r = 1; r < RN; r++)
    for (let i = 0; i < K; i++) {
      const o = (r * K + i) * 3;
      nErr = Math.max(nErr, Math.abs(Math.hypot(nor[o], nor[o + 1], nor[o + 2]) - 1));
      if (nor[o + 1] * pos[o + 1] + nor[o + 2] * pos[o + 2] <= 0) inward++;
    }
  check('겉면 법선: 단위 길이 · 옆면은 모두 바깥쪽', nErr < 1e-6 && inward === 0, `길이 오차 ${nErr} · 안쪽 ${inward}`);

  /* 신발 틀: 축이 정규직교 · 오른손 꼴, 위아래 두께가 달라도 법선은 바깥 */
  const S = shoeAxes([0, 0, 0], [0.2, 0, 0.02], [0, 0, 1], 1);
  const ortho = Math.abs(dot(S.fx, S.U)) < 1e-9 && Math.abs(dot(S.fx, S.X)) < 1e-9 && Math.abs(dot(S.X, S.U)) < 1e-9;
  check('신발 틀: fx · U · X 서로 수직, 길이 ≥ 25% 키', ortho && S.l >= 0.25 - 1e-9, `길이 ${S.l}`);
  check('신발 틀: (X, U, fx) 오른손 꼴', nearV(cross(S.X, S.U), S.fx));
  const RS = 10;
  const KS = 12;
  const sp = new Float32Array(loftVertexCount(RS, KS, true) * 3);
  const sn = new Float32Array(sp.length);
  const si = loftIndices(RS, KS, true);
  writeLoft(sp, S.P, S.X, S.U, () => 0.04, () => 0.06, () => 0.004, { RN: RS, K: KS, n: 2.6 });
  computeNormals(sp, si, sn);
  let shoeIn = 0;
  for (let r = 1; r < RS; r++) {
    const c = S.P(r / RS);
    for (let i = 0; i < KS; i++) {
      const o = (r * KS + i) * 3;
      if ((sp[o] - c[0]) * sn[o] + (sp[o + 1] - c[1]) * sn[o + 1] + (sp[o + 2] - c[2]) * sn[o + 2] <= 0) shoeIn++;
    }
  }
  check('신발 겉면: 법선이 모두 바깥쪽', shoeIn === 0, `안쪽 ${shoeIn}`);

  /* 몸통: 곧게 선 우투 꼴 — 정점 수 · 이음 · 끝 자리 · 법선, 숙여도 접히지 않음 */
  const z = (h: number, y = 0, x = 0): Vec3 => [x, y, h];
  const J: MannequinJoints = {
    rh: z(0.95, -0.15), lh: z(0.95, 0.15), rk: z(0.5, -0.15), lk: z(0.5, 0.15), ra: z(0.08, -0.15), la: z(0.08, 0.15),
    rhe: z(0.02, -0.15, -0.05), rto: z(0.02, -0.15, 0.2), lhe: z(0.02, 0.15, -0.05), lto: z(0.02, 0.15, 0.2),
    sh: z(1.45, -0.2), gs: z(1.45, 0.2), el: z(1.15, -0.25), ge: z(1.15, 0.25), wr: z(0.9, -0.25), gw: z(0.9, 0.25),
    ha: z(0.85, -0.25), gh: z(0.85, 0.25), td: z(1.2), nose: z(1.68, 0, 0.1), ear: z(1.68),
  };
  /* 흉추 C — 허벅지는 서 있고 어깨만 앞(+x)으로: 골반 위 < 엉덩이 → 어깨 축 < 가슴 위(앞으로 더 숙임) */
  {
    const fwd = (v: Vec3) => Math.atan2(v[0], v[2]);
    const mv = (p: Vec3): Vec3 => [p[0] + 0.25, p[1], p[2]];
    const J2: MannequinJoints = { ...J, sh: mv(J.sh), gs: mv(J.gs), el: mv(J.el), ge: mv(J.ge), wr: mv(J.wr), gw: mv(J.gw), ha: mv(J.ha), gh: mv(J.gh), nose: mv(J.nose), ear: mv(J.ear), td: [0.1375, 0, 1.2] };
    const F2 = mannequinFrames([J2], 1.8)[0];
    const ax = fwd(sub(mid(J2.sh, J2.gs), mid(J2.rh, J2.lh)));
    check(
      '가슴 위 방향: 몸통이 골반보다 앞으로 숙으면 가슴은 축보다 더 숙임(흉추 C)',
      fwd(F2.pelvis.ya) < ax - 0.05 && fwd(F2.chest.ya) > ax + 0.05,
      `골반 ${fwd(F2.pelvis.ya).toFixed(3)} · 축 ${ax.toFixed(3)} · 가슴 ${fwd(F2.chest.ya).toFixed(3)}`
    );
  }
  const pf = mannequinFrame(sub(J.rh, J.lh), [0, 0, 1]);
  const cf = mannequinFrame(sub(J.sh, J.gs), [0, 0, 1]);
  const T = torsoModel(J, pf, cf, 1);
  const pants = new Float32Array(TORSO_PANTS_VERTS * 3);
  const shirt = new Float32Array(TORSO_SHIRT_VERTS * 3);
  writeTorso(T, pants, shirt);
  /* 꼬임 줄 — 앞줄 가운데는 겉면(앞 두께)에서 lift 만큼 바깥, 옆줄은 폭 + lift. 가슴 틀만 30° 돌리면 줄 위 끝이 그만큼 돌고 아래 끝은 그대로 */
  {
    const st = new Float32Array(STRIPE_VERTS * 3);
    writeStripes(T, st, 1);
    const P = (s2: number, r: number): Vec3 => {
      const o = (s2 * (STRIPE.N + 1) + r) * 2 * 3;
      return [(st[o] + st[o + 3]) / 2, (st[o + 1] + st[o + 4]) / 2, (st[o + 2] + st[o + 5]) / 2];
    };
    const r = STRIPE.N >> 1;
    const t = STRIPE.from + ((STRIPE.to - STRIPE.from) * r) / STRIPE.N;
    const R = T.ring(t);
    const fErr = Math.abs(dot(sub(P(0, r), R.c), R.Fw) - (T.front(t) + STRIPE.lift));
    const sErr = Math.abs(dot(sub(P(1, r), R.c), R.X) - (T.width(t) + STRIPE.lift));
    const tw = 0.5;
    const cf2 = mannequinFrame([Math.sin(tw), -Math.cos(tw), 0], [0, 0, 1]);
    const T2 = torsoModel(J, pf, cf2, 1);
    const st2 = new Float32Array(STRIPE_VERTS * 3);
    writeStripes(T2, st2, 1);
    const yaw = (b: Float32Array, rr: number) => {
      const o = rr * 2 * 3;
      const q = (b === st ? T : T2).ring(STRIPE.from + ((STRIPE.to - STRIPE.from) * rr) / STRIPE.N).c;
      return Math.atan2((b[o + 1] + b[o + 4]) / 2 - q[1], (b[o] + b[o + 3]) / 2 - q[0]);
    };
    const dTop = Math.abs(Math.abs(yaw(st2, STRIPE.N) - yaw(st, STRIPE.N)) - tw);
    const dBot = Math.abs(yaw(st2, 0) - yaw(st, 0));
    check(
      '꼬임 줄: 앞 · 옆 줄이 겉면 바깥 lift 에, 가슴만 돌리면 위 끝이 그만큼(아래는 그대로) · 색인 4×N×6',
      st.every(Number.isFinite) && fErr < 1e-6 && sErr < 1e-6 && dTop < 0.12 && dBot < 0.02 && stripeIndices().length === 4 * STRIPE.N * 6,
      `앞 ${fErr.toExponential(1)} · 옆 ${sErr.toExponential(1)} · 위 ${dTop.toFixed(3)} · 아래 ${dBot.toFixed(3)}`
    );
  }
  check(
    '몸통 정점: 모두 유한, 바지 (split+1)·K · 상의 (RN−split+1)·K',
    pants.every(Number.isFinite) && shirt.every(Number.isFinite) &&
      pants.length === (TORSO.split + 1) * TORSO.K * 3 && shirt.length === (TORSO.RN - TORSO.split + 1) * TORSO.K * 3
  );
  let seam = 0;
  for (let i = 0; i < TORSO.K * 3; i++) seam = Math.max(seam, Math.abs(pants[TORSO.split * TORSO.K * 3 + i] - shirt[i]));
  check('몸통 정점: 바지 끝 고리 = 상의 첫 고리(이음새 없음)', seam === 0, `차 ${seam}`);
  const ringMean = (buf: Float32Array, r: number): Vec3 => {
    const m: Vec3 = [0, 0, 0];
    for (let i = 0; i < TORSO.K; i++) for (let d = 0; d < 3; d++) m[d] += buf[(r * TORSO.K + i) * 3 + d] / TORSO.K;
    return m;
  };
  const rows = TORSO.RN - TORSO.split;
  const c0 = ringMean(pants, 0);
  const c1 = ringMean(shirt, rows);
  check(
    '몸통 정점: 첫 고리 가운데 ≈ 사타구니 · 끝 고리 ≈ 목(앞뒤 두께 차 만큼만)',
    norm(sub(c0, T.crotch)) < 0.02 && norm(sub(c1, T.neck)) < 0.02,
    `${norm(sub(c0, T.crotch)).toFixed(4)} · ${norm(sub(c1, T.neck)).toFixed(4)}`
  );
  const { shirt: shirtIdx } = torsoIndices();
  const sNor = new Float32Array(shirt.length);
  const inwardCount = (buf: Float32Array) => {
    computeNormals(buf, shirtIdx, sNor);
    let bad = 0;
    for (let r = 1; r < rows; r++) {
      const c = ringMean(buf, r);
      for (let i = 0; i < TORSO.K; i++) {
        const o = (r * TORSO.K + i) * 3;
        if ((buf[o] - c[0]) * sNor[o] + (buf[o + 1] - c[1]) * sNor[o + 1] + (buf[o + 2] - c[2]) * sNor[o + 2] <= 0) bad++;
      }
    }
    return bad;
  };
  check('몸통 법선: 상의 옆면이 모두 바깥쪽', inwardCount(shirt) === 0, `안쪽 ${inwardCount(shirt)}`);
  const bent: MannequinJoints = { ...J, sh: [0.4, -0.2, 1.3], gs: [0.4, 0.2, 1.3], td: [0.15, 0, 1.15] };
  const cfb = mannequinFrame(sub(bent.sh, bent.gs), normalize([0.6, 0, 1]));
  const Tb = torsoModel(bent, pf, cfb, 1);
  const pb = new Float32Array(TORSO_PANTS_VERTS * 3);
  const sb = new Float32Array(TORSO_SHIRT_VERTS * 3);
  writeTorso(Tb, pb, sb);
  let step = Infinity;
  for (let r = 1; r <= rows; r++)
    step = Math.min(step, dot(sub(ringMean(sb, r), ringMean(sb, r - 1)), Tb.ring((r + TORSO.split) / TORSO.RN).Y));
  check(
    '몸통: 허리를 60° 숙여도 고리가 앞으로 나아가고 법선은 바깥쪽(접히지 않음)',
    step > 0 && inwardCount(sb) === 0,
    `최소 간격 ${step.toFixed(4)} · 안쪽 ${inwardCount(sb)}`
  );
}

console.log('■ 데생 인형 멈춤(mannequin-pause) — 뼈 · 호 관 · 부채꼴 · 옅어짐 · 이름표 자리');
{
  const H = 1.8;
  const k = 1;
  const { result } = runV2({ ...base, ...realistic, name: '인형 멈춤' }, 3);
  if (!result.ok) check('인형 멈춤 — 맞추기 성공', false);
  else {
    const tr = displayTrack(result, { ground: 'flat', heightM: H });
    const fr = canonicalFrames(mannequinTrack(tr, result, H));
    const F = mannequinFrames(fr, H);
    const i = result.events.release;
    const J = fr[i];
    const T = torsoModel(J, F[i].pelvis, F[i].chest, k);
    const bs = boneSpec(J, F[i], T, k);
    const flatSpec = (s: typeof bs) => [
      ...s.joints.flat(),
      ...s.bones.flatMap((b) => [...b.a, ...b.b, b.r, b.jr]),
      ...s.beads.flatMap((b) => [...b.p, ...b.q]),
      ...s.skull.p,
      ...s.skull.q,
    ];
    const nums = flatSpec(bs);
    check(
      '뼈 명세: 관절 12 · 뼈 12 · 목뼈 구슬 3 · 머리, 모두 유한',
      bs.joints.length === 12 && bs.bones.length === BONE_TABLE.length && BONE_TABLE.length === 12 && bs.beads.length === 3 && nums.every(Number.isFinite)
    );
    /* 몸통 · 골반 실제 뼈대 — 높이 → 고리 t 이음점, 인형보다 큰 뼈도 인형 단면 안에, 오른쪽 뼈는 오른 엉덩이 쪽 */
    {
      const pts: number[] = [];
      for (let y = 0.8; y <= 1.46; y += 0.02)
        for (let a = 0; a < 16; a++) pts.push(0.3 * Math.cos((a / 16) * Math.PI * 2), y, 0.02 + 0.2 * Math.sin((a / 16) * Math.PI * 2));
      const pos = Float32Array.from(pts);
      const prep = prepareSkeleton(pos, new Float32Array(pos.length));
      const out = new Float32Array(pos.length);
      fitSkeleton(prep, T, k, norm(sub(J.rh, J.lh)) / 2, norm(sub(J.sh, J.gs)) / 2, out, new Float32Array(pos.length));
      let worst = 0;
      let rightOk = true;
      for (let v = 0; v < pos.length / 3; v++) {
        const t = prep.t[v];
        if (prep.dy[v] !== 0) continue;
        const R = T.ring(t);
        const q = sub([out[v * 3], out[v * 3 + 1], out[v * 3 + 2]], R.c);
        const x = dot(q, R.X);
        const yv = dot(q, R.Fw);
        const n = torsoN(t);
        worst = Math.max(worst, ((Math.abs(x) / T.width(t)) ** n + (Math.abs(yv) / (yv > 0 ? T.front(t) : T.back(t))) ** n) ** (1 / n));
        if (pos[v * 3] < -0.2 && dot(q, sub(J.rh, J.lh)) <= 0) rightOk = false;
      }
      const keys = skeletonT(0.9).t === TORSO_KEYS[1] && skeletonT(1.37).t === TORSO_KEYS[5] && skeletonT(0.7).t === 0 && skeletonT(0.7).dy < 0 && skeletonT(1.6).dy > 0;
      check(
        '실제 뼈대: 엉덩이 · 어깨 높이가 고리 이음점에 · 인형보다 큰 뼈도 단면 안(같은 높이 고리 기준) · 오른쪽 뼈는 오른 엉덩이 쪽',
        keys && worst <= 1.02 && rightOk && [...out].every(Number.isFinite),
        `가장 바깥 ${worst.toFixed(3)}`
      );
    }
    let neckErr = 0;
    for (let b = 0; b < 3; b++) {
      const p = bs.beads[b].p;
      const a0 = T.neck;
      const ab = sub(F[i].head.nk, a0);
      const t = Math.min(1, Math.max(0, dot(sub(p, a0), ab) / dot(ab, ab)));
      neckErr = Math.max(neckErr, Math.abs(norm(sub(p, add(a0, scale(ab, t)))) - 0.01 * k));
    }
    check('척추 구슬: 목 셋은 목 → 목 끝 선에서 1% 뒤', neckErr < 1e-6, `오차 ${neckErr}`);
    const br = BONE_SIZES.br * k;
    const jr = BONE_SIZES.jr * k;
    const rOk =
      Math.abs(bs.bones[0].r - br) < 1e-12 &&
      Math.abs(bs.bones[1].r - 0.9 * br) < 1e-12 &&
      Math.abs(bs.bones[10].r - 0.55 * br) < 1e-12 &&
      Math.abs(bs.bones[10].jr - 0.6 * jr) < 1e-12 &&
      Math.abs(bs.bones[4].jr - 0.5 * jr) < 1e-12;
    const e = boneEnds([0, 0, 0], [0, 0, 1], 0.1);
    check(
      '뼈 굵기 표(허벅지 br · 정강이 0.9 · 손 0.55/jr 0.6 · 발 jr 0.5) · 양 끝 들이기 jr·0.55',
      rOk && Math.abs(e.len - 0.89) < 1e-12 && Math.abs(e.a2[2] - 0.055) < 1e-12 && Math.abs(e.b2[2] - 0.945) < 1e-12
    );
    const L = runV2({ ...base, ...realistic, hand: 'L', name: '인형 멈춤 L' }, 3).result;
    if (!L.ok) check('인형 멈춤 좌투 — 맞추기 성공', false);
    else {
      const frL = canonicalFrames(mannequinTrack(displayTrack(L, { ground: 'flat', heightM: H }), L, H));
      const FL = mannequinFrames(frL, H);
      const j = L.events.release;
      const TL = torsoModel(frL[j], FL[j].pelvis, FL[j].chest, k);
      const b1 = boneSpec(frL[j], FL[j], TL, k);
      const b2 = boneSpec(frL[j], FL[j], TL, k);
      check(
        '좌투 뼈 명세: 우투 꼴(던지는 쪽이 −y) · 개수 같음 · 같은 입력엔 같은 답',
        b1.bones.length === BONE_TABLE.length &&
          b1.joints.length === 12 &&
          b1.beads.length === 3 &&
          flatSpec(b1).every(Number.isFinite) &&
          frL[j].rh[1] < frL[j].lh[1] && frL[j].sh[1] < frL[j].gs[1] && JSON.stringify(b1) === JSON.stringify(b2)
      );
    }
    const fp = result.events.footPlant;
    const rl = result.events.release;
    const mid2 = Math.floor((fp + rl) / 2);
    const has = (key: string) => result.metrics.some((m) => m.key === key);
    const vP = labelValues(measureAngles(fr[fp]), momentOf(fp, result.events), result.metrics);
    const vR = labelValues(measureAngles(fr[rl]), momentOf(rl, result.events), result.metrics);
    const vN = labelValues(measureAngles(fr[mid2]), momentOf(mid2, result.events), result.metrics);
    const t = (v: { table?: number }) => v.table !== undefined;
    const plantOk =
      t(vP.separation) === has('separationAtPlant') && t(vP.knee) === has('leadKneeAtPlant') && !t(vP.elbow) && !t(vP.arm) && !t(vP.trunk);
    const relOk =
      t(vR.knee) === has('leadKneeAtRelease') &&
      t(vR.arm) === has('shoulderAbduction') &&
      t(vR.trunk) === has('trunkForwardTilt') &&
      !t(vR.elbow) &&
      !t(vR.separation);
    check(
      '이름표 값: 착지 · 릴리스는 표에 있는 지표만 표 값을 곁에, 팔꿈치 · 그 밖의 장면은 없음',
      plantOk && relOk && Object.values(vN).every((v) => !t(v)),
      `표: ${result.metrics.map((m) => m.key).join(' ')}`
    );
  }

  /* 호 관 — 사분원 점 9개를 상한 16 고리 · 8각으로 */
  const cap = 16;
  const K = 8;
  const pts: Vec3[] = [];
  for (let s = 0; s <= 8; s++) {
    const a = (Math.PI / 2) * (s / 8);
    pts.push([0.5 * Math.cos(a), 0.5 * Math.sin(a), 0.2]);
  }
  const tv = loftVertexCount(cap - 1, K, true);
  const tp = new Float32Array(tv * 3);
  const tn = new Float32Array(tv * 3);
  const ti = loftIndices(cap - 1, K, true);
  writeTube(tp, pts, [0, 0, 1], 0.02, cap, K);
  computeNormals(tp, ti, tn);
  let rErr = 0;
  let inward = 0;
  let tail = 0;
  for (let r = 0; r < cap; r++) {
    const c = pts[Math.min(r, pts.length - 1)];
    for (let q = 0; q < K; q++) {
      const o = (r * K + q) * 3;
      const d: Vec3 = [tp[o] - c[0], tp[o + 1] - c[1], tp[o + 2] - c[2]];
      rErr = Math.max(rErr, Math.abs(norm(d) - 0.02));
      if (r <= pts.length - 1 && dot(d, [tn[o], tn[o + 1], tn[o + 2]]) <= 0) inward++;
      if (r >= pts.length) {
        const o0 = ((pts.length - 1) * K + q) * 3;
        tail = Math.max(tail, Math.abs(tp[o] - tp[o0]) + Math.abs(tp[o + 1] - tp[o0 + 1]) + Math.abs(tp[o + 2] - tp[o0 + 2]));
      }
    }
  }
  const c0i = cap * K * 3;
  const c1i = (cap * K + 1) * 3;
  const capOk =
    Math.hypot(tp[c0i] - pts[0][0], tp[c0i + 1] - pts[0][1], tp[c0i + 2] - pts[0][2]) < 1e-6 &&
    Math.hypot(tp[c1i] - pts[8][0], tp[c1i + 1] - pts[8][1], tp[c1i + 2] - pts[8][2]) < 1e-6;
  check(
    '호 관: 고리가 반지름 위 · 법선 바깥쪽(끝 고리 포함) · 남는 고리는 마지막 점에 겹침 · 두 뚜껑',
    rErr < 1e-6 && inward === 0 && tail === 0 && capOk,
    `반지름 ${rErr} · 안쪽 ${inward} · 꼬리 ${tail}`
  );
  const sp = new Float32Array(tv * 3);
  writeTube(sp, [[1, 2, 3]], [0, 0, 1], 0.02, cap, K);
  let sErr = 0;
  for (let v = 0; v < tv; v++) sErr = Math.max(sErr, Math.hypot(sp[v * 3] - 1, sp[v * 3 + 1] - 2, sp[v * 3 + 2] - 3));
  check('호 관: 점 하나면 모든 정점이 그 점의 반지름 안(NaN 없음)', sp.every(Number.isFinite) && sErr <= 0.02 + 1e-6, `최대 ${sErr}`);

  /* 부채꼴 — 사분원 33점, 상한 64 */
  const qc: Vec3 = [0, 0, 0];
  const qp: Vec3[] = [];
  for (let s = 0; s <= 32; s++) {
    const a = (Math.PI / 2) * (s / 32);
    qp.push([Math.cos(a), Math.sin(a), 0]);
  }
  const fcap = 64;
  const fpos = new Float32Array((fcap + 1) * 3);
  const fidx = fanIndices(fcap);
  writeFan(fpos, qc, qp, fcap);
  const area = (P: Float32Array, I: number[]) => {
    let s = 0;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3;
      const b = I[t + 1] * 3;
      const c = I[t + 2] * 3;
      const ab: Vec3 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
      const ac: Vec3 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
      s += norm(cross(ab, ac)) / 2;
    }
    return s;
  };
  const A = area(fpos, fidx);
  const fone = new Float32Array((fcap + 1) * 3);
  writeFan(fone, qc, [[1, 0, 0]], fcap);
  check(
    '부채꼴: 삼각형 cap−1 · 사분원 넓이 π/4 의 0.5% 안 · 점 하나면 넓이 0',
    fidx.length === (fcap - 1) * 3 && Math.abs(A - Math.PI / 4) / (Math.PI / 4) < 0.005 && area(fone, fidx) === 0,
    `넓이 ${A}`
  );
  const arc: Arc = { c: qc, points: qp, mid: [Math.SQRT1_2, Math.SQRT1_2, 0], key: 'knee' };
  const af = arcFrame(arc);
  const perp = af ? qp.every((p) => Math.abs(dot(sub(p, qc), af.normal)) < 1e-9) : false;
  check(
    '호 틀: 반지름 = |첫 점 − 가운데| · 법선이 호에 수직 · 점 하나면 null',
    af !== null && Math.abs(af.r - 1) < 1e-12 && perp && arcFrame({ c: qc, points: [[1, 0, 0]], mid: [1, 0, 0], key: 'knee' }) === null
  );

  /* 옅어짐 */
  let a1 = 0;
  let n1 = 0;
  let mono1 = true;
  let prev = 0;
  while (a1 < 1 && n1 < 120) {
    a1 = anaStep(a1, 1, 1 / 60, false);
    if (a1 < prev) mono1 = false;
    prev = a1;
    n1++;
  }
  let a0 = 1;
  let n0 = 0;
  let mono0 = true;
  prev = 1;
  while (a0 > 0 && n0 < 120) {
    a0 = anaStep(a0, 0, 1 / 60, false);
    if (a0 > prev) mono0 = false;
    prev = a0;
    n0++;
  }
  check(
    '옅어짐 시계: 단조 · 1초 안에 정확히 끝(60Hz) · 움직임 줄이기면 한 번에',
    a1 === 1 && a0 === 0 && mono1 && mono0 && n1 <= 60 && n0 <= 60 && anaStep(0, 1, 1 / 60, true) === 1 && anaStep(0.5, 1, 1 / 60, false) < 1,
    `0→1 ${n1}장면 · 1→0 ${n0}장면`
  );
  const m0 = anaMaterials(0);
  const m1 = anaMaterials(1);
  const mh = anaMaterials(0.5);
  const nr = (x: number, y: number) => Math.abs(x - y) < 1e-9;
  check(
    '재질 값: 0 → 인형 불투명 · 뼈 투명 0 / 1 → 인형 0.22 · 뼈 불투명 1 · 부채꼴 0.2 / 0.5 → 인형 0.61',
    !m0.figTransparent &&
      m0.figDepthWrite &&
      m0.boneTransparent &&
      nr(m0.boneOpacity, 0) &&
      m1.figTransparent &&
      !m1.figDepthWrite &&
      nr(m1.figOpacity, 0.22) &&
      !m1.boneTransparent &&
      nr(m1.boneOpacity, 1) &&
      nr(m1.fanOpacity, 0.2) &&
      nr(mh.figOpacity, 0.61) &&
      nr(mh.lineOpacity, 0.5)
  );

  /* 이름표 자리 */
  const same3 = () => [
    { x: 100, y: 100, w: 40, h: 20 },
    { x: 100, y: 100, w: 40, h: 20 },
    { x: 100, y: 100, w: 40, h: 20 },
  ];
  const three = placeLabels(same3(), 400, 300);
  const again = placeLabels(same3(), 400, 300);
  const apart = (p: { x: number; y: number }, q2: { x: number; y: number }) => Math.abs(p.x - q2.x) >= 40 || Math.abs(p.y - q2.y) >= 20;
  const lone = placeLabels(
    [
      { x: 100, y: 100, w: 40, h: 20 },
      { x: 300, y: 200, w: 40, h: 20 },
    ],
    400,
    300
  );
  const edge = placeLabels([{ x: 0, y: 0, w: 40, h: 20 }], 400, 300);
  check(
    '이름표 자리: 겹친 셋이 떨어짐 · 결정적 · 안 겹치면 그대로 · 모서리는 안으로',
    apart(three[0], three[1]) &&
      apart(three[0], three[2]) &&
      apart(three[1], three[2]) &&
      JSON.stringify(three) === JSON.stringify(again) &&
      lone[1].x === 300 &&
      lone[1].y === 200 &&
      edge[0].x === 20 &&
      edge[0].y === 10
  );
  const c0 = projectToScreen([0, 0, 0], 400, 300);
  const tl = projectToScreen([-1, 1, 0.5], 400, 300);
  const behind = projectToScreen([0, 0, 1.5], 400, 300);
  check('화면 투영: 가운데 · 왼쪽 위 · 카메라 뒤는 숨김', c0.x === 200 && c0.y === 150 && c0.visible && tl.x === 0 && tl.y === 0 && !behind.visible);
}

console.log('■ 데생 인형 보기(mannequin stage) — 빛 자리 · 마운드 결 · 호 다듬기');
{
  const near3 = (a: Vec3, b: Vec3) => Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12 && Math.abs(a[2] - b[2]) < 1e-12;
  const d1 = toDisplay([1.6, -2.4, 4.6], [0, 0, 0], 2);
  const d2 = toDisplay([1.6, -2.4, 4.6], [1, 0, 3], 2);
  const off = (H: number) => {
    const a = toDisplay([0, 0, 0], [0, 0, 0], H);
    const b = toDisplay([3, 4, 0], [0, 0, 0], H);
    return norm(sub(b, a));
  };
  check(
    '빛 자리: 예시 좌표(z 위 · 미터) → 보기 좌표(y 위 · 1/키), 기준점 더하기, 거리는 1/키',
    near3(d1, [0.8, 2.3, 1.2]) && near3(d2, [1.8, 2.3, 4.2]) && Math.abs(off(2) - 2.5) < 1e-12 && Math.abs(off(1) - 5) < 1e-12
  );
  const R0 = LIGHT_RIG;
  check(
    '빛 틀: 주 빛은 위 · 앞오른쪽(3루 쪽), 세기 양수, 그림자 카메라 ±2m 넘게 · near < far, 셋 다 target 있음',
    R0.key.position[2] > 0 &&
      R0.key.position[1] < 0 &&
      R0.hemi.intensity > 0 &&
      R0.key.intensity > 0 &&
      R0.fill.intensity > 0 &&
      R0.back.intensity > 0 &&
      R0.key.shadow.half >= 2 &&
      R0.key.shadow.near < R0.key.shadow.far &&
      [R0.key, R0.fill, R0.back].every((l) => l.target.length === 3)
  );
  let nMin = 1;
  let nMax = 0;
  let sum = 0;
  let sum2 = 0;
  let jump = 0;
  for (let i = 0; i < 20; i++)
    for (let j = 0; j < 20; j++) {
      const v = valueNoise2(i * 0.137, j * 0.219);
      nMin = Math.min(nMin, v);
      nMax = Math.max(nMax, v);
      sum += v;
      sum2 += v * v;
      jump = Math.max(jump, Math.abs(valueNoise2(i * 0.137 + 1e-3, j * 0.219) - v));
    }
  const variance = sum2 / 400 - (sum / 400) ** 2;
  check(
    '마운드 잡음: 같은 입력엔 같은 값 · 0~1 · 이어짐 · 한 값이 아님',
    valueNoise2(0.3, 0.7) === valueNoise2(0.3, 0.7) && nMin >= 0 && nMax <= 1 && jump < 0.05 && variance > 1e-3,
    `범위 ${nMin.toFixed(3)}~${nMax.toFixed(3)} · 분산 ${variance.toFixed(4)} · 최대 튐 ${jump.toFixed(4)}`
  );
  const atLanding = moundShade(0, 5, 1, 2.743, 0.5);
  const atRim = moundShade(5, 5, 2.743, 2.743, 0.5);
  const far = moundShade(5, 5, 1, 2.743, 0.5);
  const sumW = (w: number[]) => w[0] + w[1] + w[2];
  check(
    '마운드 색: 착지 자리 흙 0.85 · 둘레 0.8 · 밝기 0.9~1.1 · 무게 합 1 · 먼 곳은 모래',
    Math.abs(atLanding[1] - 0.85) < 1e-9 &&
      Math.abs(atRim[2] - 0.8) < 1e-9 &&
      moundShade(5, 5, 1, 2.743, 0)[3] >= 0.9 &&
      moundShade(5, 5, 1, 2.743, 1)[3] <= 1.1 + 1e-12 &&
      Math.abs(sumW(atLanding) - 1) < 1e-12 &&
      Math.abs(sumW(atRim) - 1) < 1e-12 &&
      Math.abs(far[0] - 1) < 1e-9
  );
  const quarter: Vec3[] = [];
  for (let s = 0; s <= 32; s++) {
    const a = (Math.PI / 2) * (s / 32);
    quarter.push([Math.cos(a), Math.sin(a), 0]);
  }
  const poly = arcPolyline(quarter, 64);
  let rDev = 0;
  let mono = true;
  let prevA = -1;
  for (const p of poly) {
    rDev = Math.max(rDev, Math.abs(Math.hypot(p[0], p[1]) - 1));
    const a = Math.atan2(p[1], p[0]);
    if (a < prevA - 1e-12) mono = false;
    prevA = a;
  }
  const two = arcPolyline([[1, 0, 0], [0, 1, 0]], 64);
  const one = arcPolyline([[1, 0, 0]], 64);
  check(
    '호 다듬기: 사분원 33점 → 64점, 양 끝 그대로 · 반지름 ±0.2% · 각도 단조, 점 둘 · 하나는 그대로',
    poly.length === 64 && near3(poly[0], quarter[0]) && near3(poly[63], quarter[32]) && rDev < 2e-3 && mono && two.length === 2 && one.length === 1,
    `반지름 벗어남 ${rDev.toExponential(2)}`
  );
}

console.log('■ 몸통 마디(trunk) — 규칙 · AI 상대 값 · 못 믿는 AI · 인형 몸통이 마디를 따름');
{
  /* 보기 좌표 [앞, 위, 오른쪽] — 엉덩이 높이 1, 어깨 1.5, 엉덩이선 = 오른쪽(+z), 어깨선은 위 축 둘레로 tw° */
  const rotY = (v: Vec3, deg: number): Vec3 => {
    const a = (deg * Math.PI) / 180;
    return [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)];
  };
  const body = (tw: number): Vec3[] => {
    const f: Vec3[] = Array.from({ length: 25 }, () => [0, 1.2, 0] as Vec3);
    f[V2J.lHip] = [0, 1, -0.1];
    f[V2J.rHip] = [0, 1, 0.1];
    f[V2J.lKn] = [0, 0.5, -0.1];
    f[V2J.rKn] = [0, 0.5, 0.1];
    f[V2J.lSh] = add([0, 1.5, 0], rotY([0, 0, -0.2], tw));
    f[V2J.rSh] = add([0, 1.5, 0], rotY([0, 0, 0.2], tw));
    return f;
  };
  /* 엉덩이선(+z)에서 위 축 둘레로 잰 좌우 축의 각(어깨선과 같은 돌림 방향이 +) */
  const ang = (x: Vec3) => (Math.atan2(x[0], x[2]) * 180) / Math.PI;
  const n = 30;
  const ours = Array.from({ length: n }, () => body(40));
  const shAng = ang(sub(ours[0][V2J.rSh], ours[0][V2J.lSh]));
  const rule = trunkTrack(ours, null, null);
  const rAng = rule.levels[10].map((l) => ang(l.x));
  check(
    '규칙: 꼬임 40° 를 허리 · 가슴 밑 · 가슴에 RULE_TWIST 몫대로(±0.5°) · 가운데는 곧은 축 위(허벅지가 곧으면)',
    Math.abs(shAng - 40) < 1e-6 &&
      rAng.every((a, i) => Math.abs(a - 40 * RULE_TWIST[i]) < 0.5) &&
      rule.levels[10].every((l, i) => Math.abs(l.c[1] - (1 + 0.5 * TRUNK_LEVELS[i])) < 1e-6 && Math.hypot(l.c[0], l.c[2]) < 1e-6) &&
      rule.ai.every((v) => v === 0),
    rAng.map((a) => a.toFixed(1)).join(' · ')
  );
  /* AI — 다른 자리 · 크기 · 방향(몸 전체가 30° 돌아간 채)이지만 자기 엉덩이 · 어깨에 대한 마디는 꼬임 몫 fr, 가슴 밑이 앞으로 휨 */
  const aiFrame = (tw: number, fr: number[], bend: number, spoil: number): { j: Vec3[]; t: Vec3[] } => {
    const tf = (p: Vec3): Vec3 => add(scale(rotY(p, 30), 0.8), [2, 0.3, -1]);
    const j = body(tw).map(tf);
    const t: Vec3[] = [];
    TRUNK_LEVELS.forEach((f, i) => {
      const c: Vec3 = [i === 1 ? bend : 0, 1 + 0.5 * f, 0];
      const x = rotY([0, 0, 1], tw * fr[i]);
      const cc = tf(c);
      t.push(cc, spoil === i ? cc : add(cc, scale(rotY(x, 30), 0.08)));
    });
    return { j, t };
  };
  /* 앞 2/3 장면은 규칙과 같은 마디(클립 고정 치우침 0), 끝 1/3 장면만 fr · bend — 화면은 '규칙보다 더 · 덜' 움직인 만큼을 따른다 */
  const mk = (tw: number, fr: number[], bend = 0.02, spoil = -1) => {
    const fs = Array.from({ length: n }, (_, k) =>
      k < (2 * n) / 3 ? aiFrame(tw, [...RULE_TWIST], 0, -1) : aiFrame(tw, fr, bend, spoil)
    );
    return { j: fs.map((f) => f.j), t: fs.map((f) => f.t) };
  };
  const late = n - 3;
  const A = mk(40, [0.3, 0.6, 0.9]);
  const tA = trunkTrack(ours, A.j, A.t);
  const aAng = tA.levels[late].map((l) => ang(l.x));
  const bendF = tA.levels[late][1].c[0];
  check(
    'AI: 자기 엉덩이 · 어깨에 대한 꼬임 몫(0.3 · 0.6 · 0.9)과 휨(앞 2cm)을 우리 끝에 붙인다 — 몸 전체 방향 · 크기 · 자리는 안 따름',
    tA.ai[late] > 0.99 && aAng.every((a, i) => Math.abs(a - 40 * [0.3, 0.6, 0.9][i]) < 0.5) && Math.abs(bendF - 0.02) < 0.002,
    `${aAng.map((a) => a.toFixed(1)).join(' · ')} · 앞 ${(bendF * 100).toFixed(1)}cm · 비율 ${tA.ai[late].toFixed(2)}`
  );
  /* 클립 내내 같은 쪽으로 치우친 AI 마디(겉면 단면의 고정 치우침)는 빼고 본다 — 규칙 그대로 */
  const fixedBias = (() => {
    const fs = Array.from({ length: n }, () => aiFrame(40, [0.4, 0.7, 1.1], 0.03, -1));
    return trunkTrack(ours, fs.map((f) => f.j), fs.map((f) => f.t));
  })();
  const fAng = fixedBias.levels[15].map((l) => ang(l.x));
  check(
    'AI: 클립 내내 같은 고정 치우침(꼬임 몫 +0.25 · 앞 3cm)은 빼고 규칙대로',
    fAng.every((a, i) => Math.abs(a - 40 * RULE_TWIST[i]) < 0.5) && Math.abs(fixedBias.levels[15][1].c[0]) < 0.002,
    fAng.map((a) => a.toFixed(1)).join(' · ')
  );
  /* AI 끝 꼬임이 우리와 60° 다르면 안 믿는다(규칙) */
  const B = mk(-20, [0.3, 0.6, 0.9]);
  const tB = trunkTrack(ours, B.j, B.t);
  const bAng = tB.levels[late].map((l) => ang(l.x));
  check('AI: 끝 꼬임이 우리와 60° 다르면 규칙만', tB.ai[late] === 0 && bAng.every((a, i) => Math.abs(a - 40 * RULE_TWIST[i]) < 0.5), bAng.map((a) => a.toFixed(1)).join(' · '));
  /* 사람 척추로 못 내는 나눔(허리가 이미 어깨보다 2배 꼬임 — 규칙에서 80° 벗어남) — 안 믿는다 */
  const C = mk(40, [2.2, 0.6, 0.9]);
  const tC = trunkTrack(ours, C.j, C.t);
  const cAng = tC.levels[late].map((l) => ang(l.x));
  check(
    `AI: 규칙에서 ${AI_SPINE_DEV_DEG[1]}° 넘게 벗어난 높이가 있으면 안 믿는다(규칙)`,
    tC.ai[late] < 0.05 && cAng.every((a, i) => Math.abs(a - 40 * RULE_TWIST[i]) < 1.5),
    cAng.map((a) => a.toFixed(1)).join(' · ')
  );
  /* 못 잰 높이(두 점이 같음) · miss 장면은 규칙 */
  const D2 = mk(40, [0.3, 0.6, 0.9], 0.02, 1);
  const tD = trunkTrack(ours, D2.j, D2.t);
  const tM = trunkTrack(ours, A.j, A.t, new Set(Array.from({ length: n }, (_, k) => k)));
  check('AI: 못 잰 높이가 있는 장면 · miss 장면은 규칙', tD.ai[late] === 0 && tM.ai.every((v) => v === 0));
  /* 결과 읽기 — 모양이 틀리면 null */
  const okR = {
    joints: Array.from({ length: 2 }, () => Array.from({ length: 25 }, () => [0, 0, 0])),
    experimental: { sam3d: { model: 'x', joints: [], trunk: Array.from({ length: 2 }, () => Array.from({ length: 6 }, () => [1, 2, 3])) } },
  };
  const badR = { ...okR, experimental: { sam3d: { model: 'x', joints: [], trunk: [[[1, 2, 3]], [[1, 2, 3]]] } } };
  check('읽기: 장면 수 · 6 점 · 유한일 때만', readAiTrunk(okR as unknown as Pitch3dV2Ok)?.length === 2 && readAiTrunk(badR as unknown as Pitch3dV2Ok) === null);

  /* 인형 몸통 — 마디가 있으면 그 높이의 고리 좌우 축이 마디를 따른다(꼬임 · 휨), 좌투 거울 뒤에도 던지는 쪽 */
  const z = (h: number, y = 0, x = 0): Vec3 => [x, y, h];
  const Jm: MannequinJoints = {
    rh: z(0.95, -0.15), lh: z(0.95, 0.15), rk: z(0.5, -0.15), lk: z(0.5, 0.15), ra: z(0.08, -0.15), la: z(0.08, 0.15),
    rhe: z(0.02, -0.15, -0.05), rto: z(0.02, -0.15, 0.2), lhe: z(0.02, 0.15, -0.05), lto: z(0.02, 0.15, 0.2),
    sh: z(1.45, -0.2), gs: z(1.45, 0.2), el: z(1.15, -0.25), ge: z(1.15, 0.25), wr: z(0.9, -0.25), gw: z(0.9, 0.25),
    ha: z(0.85, -0.25), gh: z(0.85, 0.25), td: z(1.225), nose: z(1.68, 0, 0.1), ear: z(1.68),
  };
  const rotZ = (v: Vec3, deg: number): Vec3 => {
    const a = (deg * Math.PI) / 180;
    return [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]];
  };
  const lvAng = [10, 25, 45];
  const Jt: MannequinJoints = { ...Jm };
  const keys = [
    ['t1', 't1s'],
    ['t2', 't2s'],
    ['t3', 't3s'],
  ] as const;
  TRUNK_LEVELS.forEach((f, i) => {
    const c: Vec3 = [i === 1 ? 0.03 : 0, 0, 0.95 + 0.5 * f];
    Jt[keys[i][0]] = c;
    Jt[keys[i][1]] = add(c, scale(rotZ([0, -1, 0], lvAng[i]), 0.1));
  });
  const pfm = mannequinFrame(sub(Jt.rh, Jt.lh), [0, 0, 1]);
  const cfm = mannequinFrame(sub(Jt.sh, Jt.gs), [0, 0, 1]);
  const Tt = torsoModel(Jt, pfm, cfm, 1);
  const T0 = torsoModel(Jm, pfm, cfm, 1);
  const ringAng = (T: ReturnType<typeof torsoModel>, t: number) => {
    const X = T.ring(t).X;
    return (Math.atan2(X[0], -X[1]) * 180) / Math.PI;
  };
  const tAt = [0.36, 0.55, 0.76];
  const got = tAt.map((t) => ringAng(Tt, t));
  check(
    '인형 몸통: 마디 높이의 고리 좌우 축이 마디 각(10 · 25 · 45°)을 따르고(±1°) 가운데 선이 가슴 밑 휨(앞 3cm)을 지난다',
    got.every((a, i) => Math.abs(a - lvAng[i]) < 1) && Math.abs(Tt.ring(0.55).c[0] - 0.03) < 0.002,
    `${got.map((a) => a.toFixed(1)).join(' · ')} · 앞 ${(Tt.ring(0.55).c[0] * 100).toFixed(1)}cm`
  );
  check('인형 몸통: 마디가 없으면 예전 그대로(곧은 축 · 골반 → 가슴 고르게)', Math.abs(T0.ring(0.55).c[0]) < 1e-9 && Math.abs(ringAng(T0, 0.55)) < 1e-6);
  const mirrored = canonicalFrames({ frames: [Jt], heightM: 1.8, dt: 1 / 60, events: { kneeUp: null, footPlant: 0, release: 0 }, hand: 'L' })[0];
  const pfL = mannequinFrame(sub(mirrored.rh, mirrored.lh), [0, 0, 1]);
  const cfL = mannequinFrame(sub(mirrored.sh, mirrored.gs), [0, 0, 1]);
  const TL = torsoModel(mirrored, pfL, cfL, 1);
  check(
    '인형 몸통: 좌투 거울 뒤에도 마디 좌우 축이 던지는 쪽(골반 · 가슴 틀과 같은 쪽) · 마디 점도 거울',
    tAt.every((t) => dot(TL.ring(t).X, pfL.xa) > 0) && mirrored.t2s !== undefined && Math.abs(mirrored.t2s[1] + Jt.t2s![1]) < 1e-12
  );
}

console.log('■ 메커니즘 점검 넷(mech-checks) — 합성 투수: 드리프트 · 골반 수평 · 분리 시점(니업 쪽 가짜 봉우리 무시) · 블록 · 좌투 거울');
{
  const N = 200;
  const dt = 1 / 120;
  const ku = 40;
  const fp = 120;
  const rl = 150;
  const t = Array.from({ length: N }, (_, k) => 1 + k * dt);
  // 골반 앞 빠르기(키/초): 20 장면부터 착지까지 늘고, 착지 → 릴리스에 최고의 10% 로 줄고, 그 뒤 그대로
  const vmax = 2;
  const v = (k: number) => (k < 20 ? 0 : k <= fp ? (vmax * (k - 20)) / (fp - 20) : k <= rl ? vmax * (1 - (0.9 * (k - fp)) / (rl - fp)) : 0.1 * vmax);
  const hx: number[] = [];
  for (let k = 0, x = 0; k < N; k++) hx.push((x += v(k) * dt * 1000));
  // 분리(°): 착지 3장면 뒤 30° + 니업 때 더 큰 36° 가짜 봉우리(좁힌 구간 밖)
  const theta = (k: number) => 30 * Math.exp(-(((k - (fp + 3)) / 6) ** 2)) + 36 * Math.exp(-(((k - ku) / 5) ** 2));
  // 앞무릎 굽힘(°): 착지까지 40 → 착지 10장면 뒤 50(주저앉음) → 릴리스 35
  const flex = (k: number) => (k <= fp ? 40 : k <= fp + 10 ? 40 + (k - fp) : k <= rl ? 50 - (15 * (k - fp - 10)) / (rl - fp - 10) : 35);
  const tilt = 240 * Math.tan((5 * Math.PI) / 180);
  const build = (mirror: boolean, th: (k: number) => number = theta) =>
    Array.from({ length: N }, (_, k) => {
      const hip: Vec3 = [hx[k], 500, 0];
      const pts: Partial<Record<keyof typeof V2J, Vec3>> = {};
      pts.lHip = [hip[0], hip[1] + (k === fp ? tilt : 0), -120];
      pts.rHip = [hip[0], hip[1], 120];
      const phi = ((-90 + th(k)) * Math.PI) / 180;
      pts.lSh = [hip[0] + 180 * Math.cos(phi), 800, 180 * Math.sin(phi)];
      pts.rSh = [hip[0] - 180 * Math.cos(phi), 800, -180 * Math.sin(phi)];
      pts.lKn = add(pts.lHip, [0, -250, 0]);
      const f = (flex(k) * Math.PI) / 180;
      pts.lAn = add(pts.lKn, [250 * Math.sin(f), -250 * Math.cos(f), 0]);
      pts.rAn = [0, 80, 100];
      pts.rKn = [0, 330, 110];
      const row = Array.from({ length: N_V2_JOINTS }, () => [hip[0], hip[1], hip[2]]);
      for (const [nm, p] of Object.entries(pts)) {
        // 좌투 = 옆 좌표 거울 + 좌우 이름 바꿈
        const name = mirror ? (nm[0] === 'l' ? 'r' : 'l') + nm.slice(1) : nm;
        row[V2J[name as keyof typeof V2J]] = mirror ? [p![0], p![1], -p![2]] : [p![0], p![1], p![2]];
      }
      return row;
    });
  const R = mechChecks({ joints: build(false), t, events: { kneeUp: ku, footPlant: fp, release: rl }, hand: 'R' }, 175);
  const L = mechChecks({ joints: build(true), t, events: { kneeUp: ku, footPlant: fp, release: rl }, hand: 'L' }, 175);
  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
  check(
    '점검: 드리프트 — 니업 때 골반이 축발보다 앞(키 비율 · cm) · 앞으로 간 거리 · 빠르기',
    R.drift !== null && near(R.drift.aheadAtKneeUp, hx[ku] / 1000, 1e-9) && near(R.drift.aheadAtKneeUpCm!, (hx[ku] / 1000) * 175, 1e-6) &&
      near(R.drift.travel, (hx[ku] - hx[0]) / 1000, 1e-9) && near(R.drift.speed, v(ku), 0.02) && near(R.drift.speedMs!, v(ku) * 1.75, 0.04),
    `${R.drift?.aheadAtKneeUpCm?.toFixed(1)}cm · ${R.drift?.speedMs?.toFixed(2)}m/s`
  );
  check('점검: 착지 골반 수평 — 글러브 쪽 엉덩이가 5° 높음', near(R.pelvisLevel.tiltDeg, 5, 0.01), `${R.pelvisLevel.tiltDeg.toFixed(2)}°`);
  check(
    '점검: 분리 시점 — 착지 150ms 전 ~ 릴리스에서 찾아 니업 쪽 36° 봉우리는 안 잡고 착지 뒤 25ms · 30°',
    near(R.separation.peakMs, 25, 0.01) && near(R.separation.peakDeg, 30, 0.01),
    `${R.separation.peakMs.toFixed(1)}ms · ${R.separation.peakDeg.toFixed(1)}°`
  );
  check(
    '점검: 블록 — 골반 감속 90% · 앞무릎 착지 40° → 주저앉음 10° → 릴리스 35°(펴짐 5°)',
    near(R.block.pelvisDecelPct, 90, 1) && near(R.block.kneeAtPlantDeg, 40, 1e-6) && near(R.block.kneeCollapseDeg, 10, 1e-6) &&
      near(R.block.kneeAtReleaseDeg, 35, 1e-6) && near(R.block.kneeExtensionDeg, 5, 1e-6),
    `${R.block.pelvisDecelPct.toFixed(1)}% · ${R.block.kneeAtPlantDeg.toFixed(1)} · +${R.block.kneeCollapseDeg.toFixed(1)} · ${R.block.kneeAtReleaseDeg.toFixed(1)}`
  );
  check(
    '점검: 좌투 거울 — 넷 다 우투와 같은 값',
    L.drift !== null && near(L.drift.aheadAtKneeUp, R.drift!.aheadAtKneeUp, 1e-9) && near(L.pelvisLevel.tiltDeg, R.pelvisLevel.tiltDeg, 1e-9) &&
      near(L.separation.peakMs, R.separation.peakMs, 1e-9) && near(L.separation.peakDeg, R.separation.peakDeg, 1e-9) &&
      near(L.block.pelvisDecelPct, R.block.pelvisDecelPct, 1e-9) && near(L.block.kneeCollapseDeg, R.block.kneeCollapseDeg, 1e-9)
  );
  // 다리 들기 ~ 착지 분리가 0 밑(−8°)이고 릴리스 무렵 어깨가 골반을 지나가 반대로 크게(−50°) 갈리는 투구 — 부호를 가운데값으로 정하면 뒤집혀 그쪽을 잡는다
  const flipTh = (k: number) => theta(k) - 8 - 50 * Math.exp(-(((k - rl) / 6) ** 2));
  const Fr = mechChecks({ joints: build(false, flipTh), t, events: { kneeUp: ku, footPlant: fp, release: rl }, hand: 'R' });
  const Fl = mechChecks({ joints: build(true, flipTh), t, events: { kneeUp: ku, footPlant: fp, release: rl }, hand: 'L' });
  check(
    '점검: 분리 부호는 던지는 손으로 — 착지 전 분리가 0 밑이어도 릴리스 무렵 반대 분리를 안 잡음(우투 · 좌투)',
    near(Fr.separation.peakMs, 25, 0.01) && near(Fr.separation.peakDeg, 22, 0.01) && near(Fl.separation.peakMs, 25, 0.01) && near(Fl.separation.peakDeg, 22, 0.01),
    `${Fr.separation.peakMs.toFixed(1)}ms · ${Fr.separation.peakDeg.toFixed(1)}°`
  );
  const ramp = (k: number) => Math.min(1, Math.max(0, (k - (fp - 2)) / 20)) * 120;
  const Tr = mechChecks({ joints: build(false, ramp), t, events: { kneeUp: ku, footPlant: fp, release: rl }, hand: 'R' });
  const Tl = mechChecks({ joints: build(true, ramp), t, events: { kneeUp: ku, footPlant: fp, release: rl }, hand: 'L' });
  check(
    '점검: 몸통이 도는 때 — 어깨선이 돈 양의 절반 = 착지 8장면 뒤(착지 → 공 놓기 30장면의 26.7%) · 그 장면 · 좌투 거울 같음 · 안 돌면 못 잼',
    near(Tr.separation.trunkHalfPct!, (8 / (rl - fp)) * 100, 0.6) && Tr.separation.trunkHalfFrame === fp + 8 &&
      near(Tl.separation.trunkHalfPct!, Tr.separation.trunkHalfPct!, 1e-9) &&
      mechChecks({ joints: build(false, () => 0), t, events: { kneeUp: ku, footPlant: fp, release: rl }, hand: 'R' }).separation.trunkHalfPct === null,
    `${Tr.separation.trunkHalfPct?.toFixed(1)}% · 장면 ${Tr.separation.trunkHalfFrame}`
  );
  const noKu = mechChecks({ joints: build(false), t, events: { kneeUp: null, footPlant: fp, release: rl }, hand: 'R' });
  check(
    '점검: 니업 없으면 드리프트 없음 · 키를 모르면 cm 없음 · 확신이 없으면 null',
    noKu.drift === null && R.drift!.conf === null && noKu.separation.peakMs === R.separation.peakMs && mechChecks({ joints: build(false), t, events: { kneeUp: ku, footPlant: fp, release: rl }, hand: 'R' }).drift!.aheadAtKneeUpCm === null
  );
}

console.log('■ 메커니즘 점검 판정(mech-judge) — 문턱 · 여러 구 평균 · 확신 낮으면 판정 안 함 · 글 규칙');
{
  type M = ReturnType<typeof mechChecks>;
  const mk = (o: { ahead?: number | null; dConf?: number | null; ms?: number; sep?: number; sConf?: number | null; decel?: number; ext?: number; bConf?: number | null; hand?: 'R' | 'L'; half?: number | null; open?: number; tConf?: number | null }): M => ({
    hand: o.hand ?? 'R',
    drift: o.ahead === null ? null : { aheadAtKneeUp: o.ahead ?? 0.1, aheadAtKneeUpCm: null, travel: 0.05, travelCm: null, speed: 0.2, speedMs: null, conf: o.dConf ?? 50 },
    pelvisLevel: { tiltDeg: 2, conf: 50 },
    separation: { frame: 0, peakMs: o.ms ?? 0, peakDeg: o.sep ?? 56, atPlantDeg: 20, trunkOpenAtPlantDeg: o.open ?? -20, pelvisOpenAtPlantDeg: 25, trunkHalfPct: o.half === undefined ? 54 : o.half, trunkHalfFrame: 0, trunkConf: o.tConf ?? 50, conf: o.sConf ?? 50 },
    block: { pelvisDecelPct: o.decel ?? 95, kneeAtPlantDeg: 30, kneeAtReleaseDeg: 30 - (o.ext ?? 0), kneeExtensionDeg: o.ext ?? 0, kneeCollapseDeg: 5, conf: o.bConf ?? 50 },
    drop: null,
    trunkTilt: { forwardDeg: 30, lateralDeg: 20, conf: 50 },
    arm: { abductionAtPlantDeg: 88, conf: 50 },
  });
  const st = (j: ReturnType<typeof judgeMechanics>, k: string) => j.items.find((i) => i.key === k)!.status;
  check(
    '판정: 드리프트 — 키의 10% 좋아요 · 7% 보통 · 5% 고칠 점 · 확신 20 이나 니업 없음은 판정 안 함',
    st(judgeMechanics([mk({ ahead: 0.1 })]), 'drift') === 'good' && st(judgeMechanics([mk({ ahead: 0.07 })]), 'drift') === 'fair' &&
      st(judgeMechanics([mk({ ahead: 0.05 })]), 'drift') === 'improve' && st(judgeMechanics([mk({ ahead: 0.05, dConf: 20 })]), 'drift') === 'unsure' &&
      st(judgeMechanics([mk({ ahead: null })]), 'drift') === 'unsure'
  );
  check(
    '판정: 분리 시점 — 착지 20ms 전 좋아요 · 80ms 전 보통 · 130ms 전 고칠 점(몸통 일찍 열림) · 130ms 뒤는 보통까지',
    st(judgeMechanics([mk({ ms: -20 })]), 'separation') === 'good' && st(judgeMechanics([mk({ ms: -80 })]), 'separation') === 'fair' &&
      st(judgeMechanics([mk({ ms: -130 })]), 'separation') === 'improve' && st(judgeMechanics([mk({ ms: 130 })]), 'separation') === 'fair'
  );
  check(
    '판정: 분리 크기(우투, 우리 자) — 자료 아래 25%(53.3°) 이상 좋아요 · 그 밑 보통 · 39° 밑 고칠 점(억지로 비틀기보다) · 일찍 열림이 크기보다 먼저',
    st(judgeMechanics([mk({ sep: 54 })]), 'separation') === 'good' && st(judgeMechanics([mk({ sep: 45 })]), 'separation') === 'fair' &&
      st(judgeMechanics([mk({ sep: 38 })]), 'separation') === 'improve' &&
      judgeMechanics([mk({ sep: 38 })]).items.find((i) => i.key === 'separation')!.line.includes('억지로') &&
      judgeMechanics([mk({ sep: 38, ms: -130 })]).items.find((i) => i.key === 'separation')!.line.includes('일찍')
  );
  check(
    '판정: 분리 크기 좌투는 따로(좌투가 4~5° 낮다) — 50° 는 좌투 좋아요 · 우투 보통, 36° 는 좌투 보통 · 우투 고칠 점, 자세히에 좌투 자료',
    st(judgeMechanics([mk({ sep: 50, hand: 'L' })]), 'separation') === 'good' && st(judgeMechanics([mk({ sep: 50 })]), 'separation') === 'fair' &&
      st(judgeMechanics([mk({ sep: 36, hand: 'L' })]), 'separation') === 'fair' && st(judgeMechanics([mk({ sep: 36 })]), 'separation') === 'improve' &&
      judgeMechanics([mk({ sep: 50, hand: 'L' })]).items.find((i) => i.key === 'separation')!.detail.includes('좌투 22명')
  );
  check(
    '판정: 몸통이 도는 때(우투) — 54% 좋아요 · 47% 보통(조금 일찍) · 40% 고칠 점(일찍) · 72% 보통(늦게) · 못 잼 · 어깨 확신 낮음은 판정 안 함 · 화면에 냄',
    st(judgeMechanics([mk({ half: 54 })]), 'trunkTiming') === 'good' && st(judgeMechanics([mk({ half: 47 })]), 'trunkTiming') === 'fair' &&
      st(judgeMechanics([mk({ half: 40 })]), 'trunkTiming') === 'improve' && st(judgeMechanics([mk({ half: 72 })]), 'trunkTiming') === 'fair' &&
      st(judgeMechanics([mk({ half: null })]), 'trunkTiming') === 'unsure' && st(judgeMechanics([mk({ half: 40, tConf: 10 })]), 'trunkTiming') === 'unsure' &&
      judgeMechanics([mk({})]).items.find((i) => i.key === 'trunkTiming')!.shown &&
      judgeMechanics([mk({ half: 47, hand: 'L' })]).items.find((i) => i.key === 'trunkTiming')!.status === 'good'
  );
  check(
    '판정: 착지 때 상체 — 20° 닫힘 좋아요 · 10° 닫힘 보통 · 0° 고칠 점(이미 열림) · 옛 분리 크기 · 시점은 화면에 안 냄',
    st(judgeMechanics([mk({ open: -20 })]), 'trunkAtPlant') === 'good' && st(judgeMechanics([mk({ open: -10 })]), 'trunkAtPlant') === 'fair' &&
      st(judgeMechanics([mk({ open: 0 })]), 'trunkAtPlant') === 'improve' &&
      judgeMechanics([mk({ open: 3 })]).items.find((i) => i.key === 'trunkAtPlant')!.detail.includes('3° 열림') &&
      !judgeMechanics([mk({})]).items.find((i) => i.key === 'separation')!.shown
  );
  check(
    '판정: 블록 — 골반 덜 멈춤(60%) 그리고 무릎 20° 더 굽음일 때만 고칠 점, 하나만이면 보통',
    st(judgeMechanics([mk({ decel: 60, ext: -20 })]), 'block') === 'improve' && st(judgeMechanics([mk({ decel: 60, ext: 0 })]), 'block') === 'fair' &&
      st(judgeMechanics([mk({ decel: 95, ext: -20 })]), 'block') === 'fair' && st(judgeMechanics([mk({})]), 'block') === 'good'
  );
  check(
    '판정: 블록 — 무릎 40° 넘게 더 굽음 · 골반 감속 115% 넘음은 엔진 오류로 보고 뺌(그 공뿐이면 판정 안 함, 다른 공이 있으면 그것으로)',
    st(judgeMechanics([mk({ ext: -64 })]), 'block') === 'unsure' && st(judgeMechanics([mk({ decel: 129 })]), 'block') === 'unsure' &&
      st(judgeMechanics([mk({ ext: -64 }), mk({})]), 'block') === 'good'
  );
  const two = judgeMechanics([mk({ ahead: 0.05 }), mk({ ahead: 0.13 })], 180);
  const three = judgeMechanics([mk({}), mk({}), mk({ ahead: 0.05, dConf: 10 })], 180);
  check(
    '판정: 여러 구는 평균(5% + 13% → 좋아요) · 세 구 밑은 참고용 · 확신 낮은 구는 평균에서 뺌 · 키를 알면 cm',
    st(two, 'drift') === 'good' && two.tentative && !three.tentative && st(three, 'drift') === 'good' &&
      two.items.find((i) => i.key === 'drift')!.detail.includes('16cm')
  );
  const all = [two, three, judgeMechanics([mk({ ahead: 0.05, ms: -130, decel: 60, ext: -20 })])].flatMap((j) => j.items);
  check(
    '판정: 골반 수평은 화면에 안 냄 · 글에 줄표 · 기관 이름 없음 · 드릴 꼬리표는 요소 목록 안',
    all.filter((i) => i.key === 'pelvisLevel').every((i) => !i.shown) && all.every((i) => !/[—–]|드라이브라인|트레드|Driveline|Tread/.test(i.line + i.detail)) &&
      all.every((i) => (FOCUS_POINTS as readonly string[]).includes(i.focus))
  );
}

console.log('■ 점검 카드 드릴 고르기(drillPicksFor) — 쉬운 단계부터 · 같은 단계면 주 요소 먼저 · 수는 보조 요소까지');
{
  const d = (title: string, focusPoints: string[], stage: string | null) => ({ title, focusPoints, stage, variants: [] });
  const drills = [
    d('통합 주', ['드리프트'], '통합'),
    d('기초 보조', ['브레이크', '드리프트'], '기초'),
    d('기초 주', ['드리프트'], '기초'),
    d('연결 주', ['드리프트', '드롭'], '연결'),
    d('단계 없음', ['드리프트'], null),
    d('다른 요소', ['브레이크'], '기초'),
  ];
  const p = drillPicksFor(drills, '드리프트');
  check(
    '점검 카드: 드리프트 드릴 다섯 중 기초 주 → 기초 보조 → 연결 주 셋',
    p.count === 5 && p.items.map((x) => x.title).join(',') === '기초 주,기초 보조,연결 주',
    p.items.map((x) => x.title).join(' · ')
  );
  check('점검 카드: 드릴이 없는 요소는 빈 목록', drillPicksFor(drills, '스로잉').count === 0 && drillPicksFor(drills, '스로잉').items.length === 0);
}

{
  console.log('■ GPU 비용 지키기(pitch-lab-guard) — 올리기 전 검사 · 같은 영상 · 하루 실패 상한');
  const ok = { name: 'IMG_0412.MOV', fps: 240, shortSide: 1080, durationSec: 6, focal35: 24 };
  check('원본 240fps 1080p 1배 6초 → 통과', labVideoBlock(ok) === null);
  check('화면 녹화(ScreenRecording_…) → 막음', labVideoBlock({ ...ok, name: 'ScreenRecording_10-08-2026 10-17-43_1.mov' }) !== null);
  check('30fps → 막음 · 60fps → 통과', labVideoBlock({ ...ok, fps: 29.97 }) !== null && labVideoBlock({ ...ok, fps: 60 }) === null);
  check('606p(샘플 1 옆 화면 녹화 크기) → 막음', labVideoBlock({ ...ok, shortSide: 606 }) !== null);
  check(
    '2배(48mm) · 0.5배(13mm) → 막음, 옛 1배 26mm → 통과',
    labVideoBlock({ ...ok, focal35: 48 }) !== null && labVideoBlock({ ...ok, focal35: 13 }) !== null && labVideoBlock({ ...ok, focal35: 26 }) === null
  );
  check('1.5초 → 막음', labVideoBlock({ ...ok, durationSec: 1.5 }) !== null);
  check('못 읽은 칸은 막지 않음', labVideoBlock({ name: 'a.mov', fps: null, shortSide: null, durationSec: null, focal35: null }) === null);

  const t0 = Date.parse('2026-10-14T14:00:00Z'); // 한국 23시
  check('한국 날짜(UTC 14시 = 23시 · 15시 = 다음 날)', seoulDay(t0) === '2026-10-14' && seoulDay(t0 + 3600_000) === '2026-10-15');
  let g = readLabGuard(null);
  const fp = 'a'.repeat(64);
  for (let i = 0; i < DAILY_FAIL_LIMIT - 1; i++) g = recordFail(g, { nowMs: t0, code: 'internal', fps: [], engine: '2.0.0' });
  check('9번 실패 → 아직 걸 수 있음', guardBlock(g, { nowMs: t0, fps: [], engine: '2.0.0' }) === null);
  g = recordFail(g, { nowMs: t0, code: 'gpu', fps: [], engine: '2.0.0' });
  check('GPU 를 못 부른 실패(gpu)는 안 셈', g.fails === DAILY_FAIL_LIMIT - 1);
  g = recordFail(g, { nowMs: t0, code: 'events', fps: [fp], engine: '2.0.0' });
  check('10번 → 오늘은 막음', g.fails === DAILY_FAIL_LIMIT && guardBlock(g, { nowMs: t0, fps: [], engine: '2.0.0' }) !== null);
  check('다음 날(한국)이면 다시 걸 수 있음(같은 영상 빼고)', guardBlock(g, { nowMs: t0 + 3600_000, fps: [], engine: '2.0.0' }) === null);
  check('영상 탓 실패의 파일은 다음 날에도 같은 엔진이면 막음', guardBlock(g, { nowMs: t0 + 86400_000, fps: [fp], engine: '2.0.0' }) !== null);
  check('엔진 판이 바뀌면 같은 파일도 다시', guardBlock(g, { nowMs: t0 + 86400_000, fps: [fp], engine: '2.0.1' }) === null);
  const g2 = recordFail(readLabGuard(null), { nowMs: t0, code: 'timeout', fps: [fp], engine: '2.0.0' });
  check('영상 탓이 아닌 실패(timeout)는 파일을 막지 않음', guardBlock(g2, { nowMs: t0, fps: [fp], engine: '2.0.0' }) === null);
  check('저장된 기록 다시 읽기(모양이 틀린 칸은 버림)', readLabGuard({ ...g, failed: [...g.failed, { fp: 1 }] }).failed.length === 1);
  const big = new Uint8Array(3 << 20).map((_, i) => i % 251);
  const f1 = await fileFingerprint(new Blob([big]));
  const big2 = big.slice();
  big2[big2.length - 1] ^= 1;
  check(
    '지문: 같은 파일 같음 · 끝 1바이트가 다르면 다름 · 64자',
    f1 === (await fileFingerprint(new Blob([big]))) && f1 !== (await fileFingerprint(new Blob([big2]))) && f1.length === 64
  );

  /* 2026-10-22 검토 — 걸 때 세는 하루 요청 · 동시 작업 상한, 서버가 읽은 값으로 짝 검사 */
  const E = '2.0.0';
  let r = readLabGuard(null);
  for (let i = 0; i < MAX_ACTIVE; i++) r = recordRequest(r, { nowMs: t0, id: `s${i}`, jobId: `j${i}`, fps: [] });
  check('동시 작업 상한 — 돌고 있는 게 꽉 차면 막음 · 관리자는 안 막음', guardBlock(r, { nowMs: t0, fps: [], engine: E }) !== null && guardBlock(r, { nowMs: t0, fps: [], engine: E, staff: true }) === null);
  check('끝난 작업은 빼서 다시 걸 수 있음', guardBlock(finishRequest(r, { nowMs: t0, jobId: 'j0', fail: null, engine: E, fallbackFps: [] }), { nowMs: t0, fps: [], engine: E }) === null);
  check('소식 없는 작업은 ACTIVE_TTL_MS 뒤 끝난 것으로', guardBlock(r, { nowMs: t0 + ACTIVE_TTL_MS + 1, fps: [], engine: E }) === null);
  let q = readLabGuard(null);
  for (let i = 0; i < DAILY_REQUEST_LIMIT; i++)
    q = finishRequest(recordRequest(q, { nowMs: t0, id: 's', jobId: `j${i}`, fps: [] }), { nowMs: t0, jobId: `j${i}`, fail: null, engine: E, fallbackFps: [] });
  check('하루 요청 상한 — 성공한 분석도 센다 · 다음 날 다시', q.reqs === DAILY_REQUEST_LIMIT && guardBlock(q, { nowMs: t0, fps: [], engine: E }) !== null && guardBlock(q, { nowMs: t0 + 3600_000, fps: [], engine: E }) === null);
  const w = finishRequest(recordRequest(readLabGuard(null), { nowMs: t0, id: 's', jobId: 'jx', fps: [fp] }), { nowMs: t0, jobId: 'jx', fail: 'events', engine: E, fallbackFps: [] });
  check('실패는 걸 때 적은 지문으로 센다', w.fails === 1 && guardBlock(w, { nowMs: t0 + 86400_000, fps: [fp], engine: E }) !== null && w.active.length === 0);
  check('옛 기록(reqs · active 없음)도 읽는다', readLabGuard({ day: '2026-10-14', fails: 2, failed: [] }).reqs === 0 && readLabGuard({ day: '2026-10-14', fails: 2, failed: [] }).active.length === 0);
  const at = (ms: number) => ({ startMs: ms, timeSource: 'apple' as const, durationSec: 6, hasLens: true, make: null, model: null });
  check(
    '서버 짝 검사 — 같은 파일 · 따로 찍음은 막고, 같이 찍은 짝 · 못 읽은 값은 통과',
    serverPairBlock({ side: { fp, facts: at(t0) }, back: { fp, facts: at(t0) } }) !== null &&
      serverPairBlock({ side: { fp, facts: at(t0) }, back: { fp: 'b'.repeat(64), facts: at(t0 + 120_000) } }) !== null &&
      serverPairBlock({ side: { fp, facts: at(t0) }, back: { fp: 'b'.repeat(64), facts: at(t0 + 1_000) } }) === null &&
      serverPairBlock({ side: { fp, facts: null }, back: { fp: 'b'.repeat(64), facts: null } }) === null
  );
}

{
  console.log('■ 화면 녹화 · 따로 찍은 짝 막기(2026-10-15) — labVideoBlock · labPairBlock · labMetaBlock · 파일 머리 읽기');
  const cam = { name: 'IMG_0412.MOV', fps: 240, shortSide: 1080, durationSec: 6, focal35: 24, aspect: 16 / 9, hasLens: true };
  const screen = { name: 'IMG_0413.MP4', fps: 59.8, shortSide: 886, durationSec: 9, focal35: null, aspect: 1920 / 886, hasLens: false };
  check('이름을 바꾼 아이폰 화면 녹화(렌즈 없음 · 2.17 · 60fps) → 막음', labVideoBlock(screen) !== null);
  check('렌즈 정보가 있는 카메라 영상 → 통과', labVideoBlock(cam) === null && labVideoBlock({ ...screen, hasLens: true }) === null);
  check('안드로이드 카메라(렌즈 정보 없음 · 16:9 · 60fps) → 통과', labVideoBlock({ ...screen, aspect: 16 / 9, shortSide: 1080 }) === null);
  check('화면 모양이어도 슬로모(240fps)면 통과', labVideoBlock({ ...screen, fps: 240, shortSide: 1080 }) === null);
  check('파일 머리를 못 읽었으면(hasLens 모름) 통과', labVideoBlock({ ...screen, hasLens: null }) === null);
  check('아이패드 화면 녹화(1.44) → 막음', labVideoBlock({ ...screen, aspect: 2360 / 1640, shortSide: 1640 }) !== null);

  const t = Date.parse('2026-10-15T05:00:00Z');
  const A = (startMs: number | null, durationSec = 6, timeSource: 'apple' | 'mvhd' | null = 'apple', fp?: string) => ({
    startMs,
    durationSec,
    timeSource,
    fp,
  });
  check('같은 파일을 두 칸에 → 막음', labPairBlock(A(t, 6, 'apple', 'f'.repeat(64)), A(t, 6, 'apple', 'f'.repeat(64))) !== null);
  check('두 폰 녹화 시작이 2초 차 → 통과', labPairBlock(A(t), A(t + 2000)) === null);
  const split = labPairBlock(A(t), A(t + 40_000));
  check('40초 뒤에 따로 찍음 → 막음(40초)', split !== null && split.includes('40초'), split ?? '');
  check('한쪽은 끝 시각(mvhd = 시작 + 6초) → 통과', labPairBlock(A(t, 6, 'apple'), A(t + 7000, 6, 'mvhd')) === null);
  check('시간대를 잘못 적은 기기(9시간 · 출처 다름) → 통과', labPairBlock(A(t, 6, 'apple'), A(t + 9 * 3600_000 + 1500, 6, 'mvhd')) === null);
  check('출처가 같은데 9시간 차 → 막음', labPairBlock(A(t), A(t + 9 * 3600_000)) !== null);
  check('시각을 못 읽으면 막지 않음', labPairBlock(A(null), A(t + 40_000)) === null);
  const days = labPairBlock(A(t), A(t + 3 * 86400_000));
  check('며칠 차는 일로', days !== null && days.includes('3일'), days ?? '');

  const at = (ms: number) => new Date(ms).toISOString();
  const okRaw = {
    synced: true,
    screenRecorded: false,
    files: {
      side: { name: 'IMG_1.MOV', size: 1, at: at(t), src: 'apple', dur: 6 },
      back: { name: 'IMG_2.MOV', size: 1, at: at(t + 1500), src: 'apple', dur: 6 },
    },
  };
  const metaOf = (raw: unknown) => readLabMeta(raw, at(t));
  check('서버: 동시 촬영 · 원본 · 2초 차 → 저장', labMetaBlock(okRaw, metaOf(okRaw)) === null);
  check('서버: 한 대로 나눠(synced false) → 막음', labMetaBlock({ ...okRaw, synced: false }, metaOf({ ...okRaw, synced: false })) !== null);
  const oldClient = { ...okRaw, screenRecorded: undefined };
  check('서버: 화면 녹화 고르기가 없거나 true(옛 화면) → 막음', labMetaBlock(oldClient, metaOf(oldClient)) !== null && labMetaBlock({ ...okRaw, screenRecorded: true }, metaOf(okRaw)) !== null);
  const named = { ...okRaw, files: { ...okRaw.files, back: { ...okRaw.files.back, name: 'ScreenRecording_1.MP4' } } };
  check('서버: 화면 녹화 이름 → 막음', labMetaBlock(named, metaOf(named)) !== null);
  const far = { ...okRaw, files: { ...okRaw.files, back: { ...okRaw.files.back, at: at(t + 60_000) } } };
  check('서버: 찍은 시각 1분 차 → 막음', labMetaBlock(far, metaOf(far)) !== null);
  check('정보에 찍은 시각 · 출처 · 길이가 남음', metaOf(okRaw).files.back?.src === 'apple' && metaOf(okRaw).files.back?.dur === 6 && metaOf(okRaw).files.back?.at === at(t + 1500));

  check('아이폰 시각 글(+0900 · 쌍점 없음)', parseAppleDate('2026-10-15T14:00:00+0900') === t && parseAppleDate('xx') === null);

  /* 가짜 mov — ftyp · mdat(앞) · moov(뒤: mvhd + meta(hdlr · keys · ilst)) */
  const enc = new TextEncoder();
  const be = (n: number, len = 4) => Array.from({ length: len }, (_, i) => (n / 2 ** (8 * (len - 1 - i))) & 255);
  const box = (type: string, ...parts: (number[] | Uint8Array)[]) => {
    const body = parts.flatMap((p) => Array.from(p));
    return [...be(8 + body.length), ...enc.encode(type), ...body];
  };
  const MAC = 2082844800;
  const mvhd = (createdSec: number) =>
    box('mvhd', [0, 0, 0, 0], be(createdSec + MAC), be(createdSec + MAC), be(600), be(600 * 6), new Array(80).fill(0));
  const keys = ['com.apple.quicktime.creationdate', 'com.apple.quicktime.camera.lens_model', 'com.apple.quicktime.camera.focal_length.35mm_equivalent'];
  const meta = box(
    'meta',
    box('hdlr', new Array(8).fill(0), enc.encode('mdta'), new Array(13).fill(0)),
    box('keys', [0, 0, 0, 0], be(keys.length), ...keys.map((k) => box('mdta', enc.encode(k)))),
    box(
      'ilst',
      [1, 2, 3].flatMap((i) => {
        const value =
          i === 1
            ? box('data', be(1), be(0), enc.encode('2026-10-15T14:00:00+0900'))
            : i === 2
              ? box('data', be(1), be(0), enc.encode('iPhone 15 Pro Max back camera 6.765mm f/1.78'))
              : box('data', be(21), be(0), be(24, 2));
        return [...be(8 + value.length), ...be(i), ...value];
      })
    )
  );
  const movie = (withMeta: boolean) =>
    new Blob([
      new Uint8Array(box('ftyp', enc.encode('qt  '), be(0))),
      new Uint8Array(box('mdat', new Uint8Array(5000))),
      new Uint8Array(box('moov', mvhd(Math.floor((t + 9000) / 1000)), ...(withMeta ? [meta] : []))),
    ]);
  const f1 = await readLabFileFacts(movie(true));
  check(
    '파일 머리: 아이폰 녹화 시작 · 길이 6초 · 렌즈 있음',
    f1 != null && f1.startMs === t && f1.timeSource === 'apple' && f1.durationSec === 6 && f1.hasLens,
    JSON.stringify(f1)
  );
  const f2 = await readLabFileFacts(movie(false));
  check(
    '파일 머리: 아이폰 정보가 없으면 mvhd 시각 · 렌즈 없음',
    f2 != null && f2.startMs === t + 9000 && f2.timeSource === 'mvhd' && !f2.hasLens,
    JSON.stringify(f2)
  );
  check('파일 머리: moov 가 없으면 null', (await readLabFileFacts(new Blob([new Uint8Array(box('mdat', new Uint8Array(10)))]))) === null);
}

/* 어깨 이름 뒤바뀜 — 떨어진 두 어깨의 이름이 미리 바뀌면 엇갈릴 때까지 그 영상 팔 이름을 바로잡음, 실제 엇갈림 · 가까운 어깨 · 갈라진 손목은 그대로 */
{
  const body = (lx: number, rx: number, extra: Record<number, [number, number]> = {}) => {
    const p = Array.from({ length: 25 }, () => [500, 500, 0.9] as [number, number, number]);
    p[V2J.nose] = [450, 100, 0.9];
    p[V2J.lAn] = [430, 800, 0.9];
    p[V2J.rAn] = [470, 800, 0.9];
    p[V2J.lSh] = [lx, 300, 0.9];
    p[V2J.rSh] = [rx, 300, 0.9];
    for (const [j, xy] of Object.entries(extra)) p[Number(j)] = [xy[0], xy[1], 0.9];
    return p;
  };
  /* 두 손목은 공 위에 겹침(샘플 1) — merged 가 false 면 갈라진 손목(엔진 좌우 고침이 맡는 꼴) */
  const tr = (xs: [number, number][], merged = true) => ({
    W: 1000,
    H: 1000,
    fps: 60,
    frames: xs.map(([l, r], k) => ({ t: k / 60, p: body(l, r, merged ? { [V2J.lWr]: [380, 200], [V2J.rWr]: [384, 202] } : { [V2J.lWr]: [600, 300], [V2J.rWr]: [300, 300] }) })),
  });
  /* 사람 키 700px — 두 어깨 130px(19%) 떨어진 채 왼 이름이 오른 어깨 자리로 뛰고, 4장면 뒤 실제로 엇갈림(두 점 20px) */
  const swapped = fixShoulderSwaps(tr([[520, 390], [520, 390], [395, 515], [400, 512], [410, 500], [440, 460], [450, 470], [455, 480]]));
  const rx = swapped.track.frames.map((f) => f.p[V2J.rSh][0]);
  const lWrHid = swapped.track.frames.map((f) => f.p[V2J.lWr][2] < 0.3);
  const rWrSeen = swapped.track.frames.every((f) => f.p[V2J.rWr][2] >= 0.3);
  check(
    '어깨 이름 뒤바뀜: 미리 바뀐 장면부터 엇갈림 전까지 이름을 바로잡고 겹친 가짜 손목만 안 보임',
    swapped.dropped === 3 &&
      rx.join() === [390, 390, 395, 400, 410, 460, 470, 480].join() &&
      lWrHid.join() === [false, false, true, true, true, false, false, false].join() &&
      rWrSeen,
    `${swapped.dropped} · 오른 어깨 x ${rx.join()} · 왼 손목 숨김 ${lWrHid.join()}`
  );
  /* 실제 엇갈림 — 두 어깨가 60px(9%)로 가까울 때 이름이 자리를 바꿈 */
  const real = fixShoulderSwaps(tr([[490, 430], [490, 430], [432, 488], [430, 492]]));
  check('어깨 이름 뒤바뀜: 가까운 두 어깨의 실제 엇갈림은 그대로', real.dropped === 0, String(real.dropped));
  /* 한 장면만 겹쳤다 돌아옴 — 그 장면만 */
  const blip = fixShoulderSwaps(tr([[520, 390], [520, 390], [392, 392], [518, 391], [519, 390]]));
  check('어깨 이름 뒤바뀜: 한 장면 겹침은 그 장면만', blip.dropped === 1, String(blip.dropped));
  const split = fixShoulderSwaps(tr([[520, 390], [520, 390], [395, 515], [400, 512]], false));
  check('어깨 이름 뒤바뀜: 손목이 갈라져 있으면 엔진 좌우 고침에 맡김', split.dropped === 0, String(split.dropped));
}

{
  /* 옆 · 뒤가 같은 공이 아니면 측정 불가(contract.ts pairMismatch, 2026-10-15) — 잰 진짜 짝 가장 큰 값은 통과, 다른 공 짝 예는 걸림 */
  const { pairMismatch, readPitch3dV2Result, v2Fail, V2_VIDEO_FAULT } = await import('@/lib/pitch-3d/v2/contract');
  check('같은 공 판정: 진짜 짝 가장 큰 값(2.0% · 0.009 · 2.0%)은 통과', !pairMismatch({ reprojPct: 2.0, syncCost: 0.009 }, { reprojPct: 2.0 }));
  check('같은 공 판정: 다른 공 짝(5.1% · 0.02 · 2.7%)은 측정 불가', pairMismatch({ reprojPct: 5.1, syncCost: 0.02 }, { reprojPct: 2.7 }));
  const failed = readPitch3dV2Result(JSON.parse(JSON.stringify(v2Fail('00000000-0000-4000-8000-000000000000', 'pair', 'fit'))));
  check(
    "같은 공 판정: 'pair' 실패를 읽고 영상 탓으로 본다",
    failed?.ok === false && failed.code === 'pair' && V2_VIDEO_FAULT.has('pair')
  );
}

{
  /* 기종별 초점 표(lib/pitch-3d/focal-table.ts, 2026-10-17) — 표 찾기 · 1배 · 줌 · 카메라마다 사전 */
  const { fpsMode, devicePrior, cameraFocalPriors } = await import('@/lib/pitch-3d/focal-table');
  const { FOCAL_PRIOR_1X } = await import('@/lib/pitch-3d/camera');
  check('초점 표: fps 모드(240 · 59.94 → 60, 장면을 빠뜨린 평균 151 은 모름)', fpsMode(240) === 240 && fpsMode(59.94) === 60 && fpsMode(151) === null && fpsMode(null) === null);
  const pm = devicePrior({ model: ' iphone 15  pro max ', fps: 119.88 });
  check('초점 표: 기종 · fps 로 찾는다(대소문자 · 빈칸 무시)', pm?.k === 0.7967 && pm.sigma === 0.03, JSON.stringify(pm));
  check('초점 표: 같은 기종도 표에 없는 fps(240)면 없음', devicePrior({ model: 'iPhone 15 Pro Max', fps: 240 }) === null);
  check('초점 표: 표에 없는 기종 · 기종 없음(화면 녹화)은 없음', devicePrior({ model: 'iPhone 13', fps: 240 }) === null && devicePrior({ model: null, fps: 60 }) === null);
  check(
    '초점 표: 줌이면 사전 없음 · 표에 하나도 없으면 예전 1배 사전 하나',
    cameraFocalPriors(false, { side: { model: 'iPad (10th generation)', fps: 120 } }) === undefined &&
      cameraFocalPriors(true, { side: { model: null, fps: 60 }, back: null }) === FOCAL_PRIOR_1X
  );
  const mix = cameraFocalPriors(true, { side: { model: 'iPad (10th generation)', fps: 120 }, back: { model: null, fps: 60 } });
  check('초점 표: 한 대만 표에 있으면 그 카메라만 표 값 · 다른 카메라는 1배', !!mix && !('k' in mix) && mix.side?.k === 0.8558 && mix.back === FOCAL_PRIOR_1X);
  /* 엔진 — 카메라마다 준 사전은 그 카메라 초점만 끈다(합성 투수: 옆만 진짜보다 15% 크게 좁은 사전) */
  const sc = { ...base, name: '초점 표' };
  const { side: camS, back: camB } = cameras(sc);
  const s = makeV2Track(sc, camS, sc.side, 'side', 71);
  const b = makeV2Track(sc, camB, sc.back, 'back', 72);
  const events = { kneeUp: s.toMedia(EV.kneeUp), footPlant: s.toMedia(EV.footPlant), release: s.toMedia(EV.release) };
  const ks = (focalPrior?: { side?: { k: number; sigma: number }; back?: { k: number; sigma: number } }) => {
    const { result } = fitPitch3dV2({ side: s.track, back: b.track, hand: sc.hand, heightCm: 183, jobId: JOB_ID, poseModel: 'synth', screenRecorded: true, slowmoFps: 240, events, focalPrior });
    return result.ok && result.cameras
      ? { s: result.cameras.side.f / Math.max(s.track.W, s.track.H), b: result.cameras.back.f / Math.max(b.track.W, b.track.H) }
      : null;
  };
  const free = ks();
  const pulled = ks({ side: { k: sc.side.k * 1.15, sigma: 0.01 } });
  check(
    '초점 표: 옆 사전은 옆 초점만 끈다(뒤는 그대로)',
    !!free && !!pulled && Math.abs(pulled.s / (sc.side.k * 1.15) - 1) < 0.03 && Math.abs(pulled.b / free.b - 1) < 0.05,
    free && pulled ? `옆 ${free.s.toFixed(3)} → ${pulled.s.toFixed(3)}(사전 ${(sc.side.k * 1.15).toFixed(3)}) · 뒤 ${free.b.toFixed(3)} → ${pulled.b.toFixed(3)}` : '실패'
  );
}

/* ─── 원본 영상 따라가기(2026-10-20 — 편집 목록 앞머리 · 재생 중 빠르기) ─── */
{
  const box = (type: string, ...parts: Uint8Array[]) => {
    const len = 8 + parts.reduce((a, p) => a + p.length, 0);
    const out = new Uint8Array(len);
    new DataView(out.buffer).setUint32(0, len);
    out.set(new TextEncoder().encode(type), 4);
    let at = 8;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  };
  const u32s = (...xs: number[]) => {
    const b = new Uint8Array(xs.length * 4);
    xs.forEach((x, i) => new DataView(b.buffer).setUint32(i * 4, x >>> 0));
    return b;
  };
  /* mvhd v0: 판·깃발 · 만든 · 고친 · 시간 단위 · 길이 */
  const mvhd = box('mvhd', u32s(0, 0, 0, 600, 2400));
  const mdhd = box('mdhd', u32s(0, 0, 0, 2400, 9600));
  const hdlr = box('hdlr', u32s(0, 0), new TextEncoder().encode('vide'), u32s(0, 0, 0));
  const elst = (entries: [number, number, number][]) =>
    box('elst', u32s(0, entries.length), ...entries.map(([seg, media, rate]) => u32s(seg, media, rate)));
  const moov = (e: Uint8Array) => box('moov', mvhd, box('trak', box('edts', e), box('mdia', hdlr, mdhd)));
  check('앞머리: 시간만 자른 영상은 −(미디어 시작)', Math.abs(videoEditShift(moov(elst([[2400, 1183, 0x10000]]))) + 1183 / 2400) < 1e-9);
  check('앞머리: 빈 조각은 늦춤으로 더함', Math.abs(videoEditShift(moov(elst([[300, 0xffffffff, 0x10000], [2400, 0, 0x10000]]))) - 0.5) < 1e-9);
  check('앞머리: 조각이 둘이면(슬로모 내보낸 영상) 0', videoEditShift(moov(elst([[600, 0, 0x10000], [600, 2400, 0x10000]]))) === 0);
  check('앞머리: 배율 1 아니면 0', videoEditShift(moov(elst([[2400, 100, 0x4000]]))) === 0);
  check('앞머리: 편집 목록 없으면 0', videoEditShift(box('moov', mvhd, box('trak', box('mdia', hdlr, mdhd)))) === 0);

  const tt = [0, 0.1, 0.2];
  const tb = [1, 1.1, 1.3];
  check('두 영상 시각: 장면 사이는 선으로', Math.abs(sourceTimesAt(tt, tb, 0.15).back - 1.2) < 1e-9);
  check('따라가기: 많이 벌어지면 옮김', followStep(1, 1 + FOLLOW_SEEK_S + 0.01, 0.5).seek);
  check('따라가기: 앞서면 느리게 · 뒤처지면 빠르게', followStep(1.05, 1, 0.5).rate < 0.5 && followStep(0.95, 1, 0.5).rate > 0.5);
  check('따라가기: ¼× 에서도 바닥 위', followStep(1.1, 1, 0.25).rate >= 0.0625);
}


console.log('■ 투구 진단 리포트(무료 1구) — 상태 네 칸 · 등급 · 평지 · 주 문제');
{
  /* 기준 자리의 투수(모두 좋아요) — 하나씩 바꿔 본다 */
  const base = (): MechChecks => ({
    hand: 'R',
    drift: { aheadAtKneeUp: 0.1, aheadAtKneeUpCm: 18, travel: 0.1, travelCm: 18, speed: 1, speedMs: 1.8, conf: 50 },
    pelvisLevel: { tiltDeg: 0, conf: 50 },
    separation: {
      frame: 10, peakMs: 0, peakDeg: 55, atPlantDeg: 50, trunkOpenAtPlantDeg: -20, pelvisOpenAtPlantDeg: 30,
      trunkHalfPct: 55, trunkHalfFrame: 12, trunkConf: 50, conf: 50,
    },
    drop: { pelvisDrop: 0.36, rise: 0, conf: 50 },
    trunkTilt: { forwardDeg: 30, lateralDeg: 25, conf: 50 },
    arm: { abductionAtPlantDeg: 88, conf: 50 },
    block: { pelvisDecelPct: 95, kneeAtPlantDeg: 50, kneeAtReleaseDeg: 40, kneeExtensionDeg: 10, kneeCollapseDeg: 3, conf: 50 },
  });
  const fr = { kneeUp: 5, plant: 10, release: 20 };
  const mound: { heightCm: number; ground: 'mound' | 'flat'; youth: boolean } = { heightCm: 180, ground: 'mound', youth: false };
  const st = (m: MechChecks, ctx = mound) => Object.fromEntries(judgeElements(m, ctx, fr).map((i) => [i.element, i.status]));

  const good = st(base());
  check('기준 투수: 다섯 요소 좋아요 · 스로잉은 참고(B)', ['드리프트', '드롭', '상하체 분리', '브레이크', '몸통 회전'].every((e) => good[e] === 'good') && good['스로잉'] === 'note', JSON.stringify(good));

  const m1 = base();
  m1.drift!.aheadAtKneeUp = 0.04;
  check('드리프트(A) 0.06 밑은 고칠 점', st(m1)['드리프트'] === 'improve');
  m1.drift!.aheadAtKneeUp = 0.065;
  check('드리프트 0.06~0.07 은 경계', st(m1)['드리프트'] === 'edge');

  const m2 = base();
  m2.block.kneeCollapseDeg = 25;
  m2.block.kneeExtensionDeg = -20;
  check('브레이크(A 후보) 무너짐은 경계까지', st(m2)['브레이크'] === 'edge');
  const it2 = judgeElements(m2, mound, fr).find((i) => i.element === '브레이크')!;
  check('브레이크 경계 · 문제 = 무너짐 · 띠 밑에 까닭', it2.fault === 'block.collapse' && /확인하는 중/.test(it2.foot ?? ''));
  m2.block.kneeCollapseDeg = 45;
  check('브레이크 더 굽음 40° 넘으면 엔진 오류로 판정 안 함', st(m2)['브레이크'] === 'unsure');

  const m3 = base();
  m3.drop!.pelvisDrop = 0.27;
  check('드롭 0.26~0.31 은 보통', st(m3)['드롭'] === 'fair');
  m3.drop!.pelvisDrop = 0.02;
  check('드롭 거의 안 가라앉음 → 마운드 경계(A 후보)', st(m3)['드롭'] === 'edge');
  const flatDrop = judgeElements(m3, { ...mound, ground: 'flat' }, fr).find((i) => i.element === '드롭')!;
  check('드롭 거의 안 가라앉음은 평지에서도 문제(뜸)', flatDrop.status === 'edge' && flatDrop.fault === 'drop.float');
  m3.drop!.pelvisDrop = 0.24;
  check('평지 드롭 크기는 참고(평지)', judgeElements(m3, { ...mound, ground: 'flat' }, fr).find((i) => i.element === '드롭')!.why === 'flat');

  const m4 = base();
  m4.trunkTilt.forwardDeg = 15;
  check('몸통 앞 기울기 13~17.6 은 경계', st(m4)['몸통 회전'] === 'edge');
  check('평지 몸통 앞 기울기는 참고', st(m4, { ...mound, ground: 'flat' })['몸통 회전'] === 'note');
  check('성장기 몸통 앞 기울기는 참고', st(m4, { ...mound, youth: true })['몸통 회전'] === 'note');

  const m5 = base();
  m5.separation.trunkOpenAtPlantDeg = 0;
  check('착지 때 상체 위 10% 넘게 열림 → 경계(A 후보)', st(m5)['상하체 분리'] === 'edge');
  m5.separation.trunkConf = 20;
  check('확신 30 밑은 판정 안 함', st(m5)['상하체 분리'] === 'unsure');

  const m6 = base();
  m6.arm.abductionAtPlantDeg = 50;
  check('스로잉(B)은 낮아도 참고', st(m6)['스로잉'] === 'note');

  /* 주 문제 — 고칠 점 먼저, 없으면 흐름 앞쪽 경계 */
  const m7 = base();
  m7.trunkTilt.forwardDeg = 15;
  m7.block.kneeCollapseDeg = 13;
  m7.drift!.aheadAtKneeUp = 0.04;
  const items7 = judgeElements(m7, mound, fr);
  const p7 = pickProblems(items7);
  check('주 문제 = 고칠 점(드리프트), 다음 = 흐름 차례 경계(브레이크), 그 뒤 다음 차례', p7.primary?.element === '드리프트' && p7.next?.element === '브레이크' && p7.later.map((i) => i.element).join() === '몸통 회전');
  const m8 = base();
  m8.trunkTilt.forwardDeg = 15;
  m8.block.kneeCollapseDeg = 13;
  check('고칠 점이 없으면 흐름 앞쪽 경계가 주 문제', pickProblems(judgeElements(m8, mound, fr)).primary?.element === '브레이크');

  /* 요약 · 목록 꼬리표 */
  const fake = { criteria: 'x', items: items7, primary: '드리프트' } as unknown as PitchReport;
  const sum = reportSummary(fake);
  check('요약: 주 문제 · 고칠 점', sum.primary?.element === '드리프트' && sum.primary.level === 'improve' && sum.judged);
  check('요약 읽기: 모양이 맞으면 그대로 · 틀리면 null', JSON.stringify(readReportSummary(JSON.parse(JSON.stringify(sum)))) === JSON.stringify(sum) && readReportSummary({ v: 1, criteria: 'x', judged: true, primary: { element: '없는 요소', level: 'improve' } }) === null);
  check('목록 꼬리표', summaryChip(sum)?.text === '드리프트' && summaryChip({ v: 1, criteria: 'x', judged: false, primary: null, bad: [] })?.text === '판정 못 함');
  check('요약: 경계 이상 요소 모두(흐름 차례) · 옛 요약은 주 문제 하나로', sum.bad.map((b) => b.element).join() === '드리프트,브레이크,몸통 회전' && readReportSummary({ v: 1, criteria: 'x', judged: true, primary: { element: '드롭', level: 'edge' } })?.bad.length === 1);

}

console.log(`\n통과 ${passed} · 실패 ${failed}`);
if (failed > 0) process.exit(1);
