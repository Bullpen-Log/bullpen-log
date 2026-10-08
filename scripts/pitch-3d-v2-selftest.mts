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

console.log(`\n통과 ${passed} · 실패 ${failed}`);
if (failed > 0) process.exit(1);
