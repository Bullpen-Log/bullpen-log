import type { Camera } from '@/lib/pitch-3d/camera';
import {
  FAIL_TEXT,
  WARNING_TEXT,
  type Pitch3dQuality,
  type WarningCode,
} from '@/lib/pitch-3d/analyze';
import type { Metric } from '@/lib/pitch-3d/metrics';
import jointMap from './joint-map.json' with { type: 'json' };

/**
 * 3D 투구 분석 v2 의 약속(설계 docs/designs/pitch-3d-quality.md — Worktree 0단계 '결과 약속').
 *
 * 세 쪽이 이 파일 하나를 본다: GPU 함수(services/pitch3d-gpu — node 로 묶은 엔진이 결과를 쓴다), 서버 동작(app/actions/pitch-lab.ts —
 * job.json · 결과를 읽고 검사한다), 화면(app/(app)/videos/lab — 결과를 그린다). 순수 — DOM · 서버 없음.
 *
 *   analysis-v2-{jobId}.json  Pitch3dV2Result — 장면마다 관절 25개 3D(빈 칸 없음) · 확신 · 순간 · 지표(v1 정의) · 품질 · 카메라
 *   job.json                  Pitch3dV2Job — 작업 상태 기계(none → queued → running → done | failed, 15분 timeout, 옛 작업 번호는 버림)
 *
 * 결정 대기(0-3절): 지표를 맞춘 뼈대의 관절각으로 다시 낼지(지금은 v1 지표 그대로) · 표준 곡선 · AI 보정(없음) · 출시 기준.
 */

/** v2 판 번호 — 결과 모양이 바뀌면 올린다(옛 결과는 readPitch3dV2Result 가 거른다) */
export const PITCH3D_V2_VERSION = '2.0.0';

/** 결과 파일 상한 — v1 과 같은 900KB(서버 동작 본문 1MB 밑, 검토 R9 · 0-3절 5번) */
export const MAX_V2_RESULT_BYTES = 900_000;
/** GPU 가 처리할 장면 수 상한(E-CAP — 투구 구간 120fps 약 5초) */
export const MAX_V2_FRAMES = 600;
/** queued · running 이 이만큼 지나면 timeout(검토 2절) */
export const V2_JOB_TIMEOUT_MS = 15 * 60_000;
/** 화면이 job.json 을 다시 읽는 간격(검토 1절 — 패널이 열린 동안만) */
export const V2_POLL_MS = 5_000;

/* ───────────────────────────── 관절 표 ───────────────────────────── */

export type V2JointName =
  | 'nose'
  | 'lSh'
  | 'rSh'
  | 'lEl'
  | 'rEl'
  | 'lWr'
  | 'rWr'
  | 'lHip'
  | 'rHip'
  | 'lKn'
  | 'rKn'
  | 'lAn'
  | 'rAn'
  | 'lHe'
  | 'rHe'
  | 'lTo'
  | 'rTo'
  | 'lEar'
  | 'rEar'
  | 'lHandMid'
  | 'rHandMid'
  | 'lHandIdx'
  | 'rHandIdx'
  | 'lHandPinky'
  | 'rHandPinky';

export type V2Joint = {
  name: V2JointName;
  /** RTMW(COCO-WholeBody 133점) 번호 */
  rtmw: number;
  /** MediaPipe 33점 번호 — v1 엔진에 넣을 때. 없으면 null */
  mp: number | null;
  parent: V2JointName | null;
  pair: V2JointName | null;
};

/** 관절 25개 — 앞 17개는 v1(lib/pitch-3d/motion.ts J)과 같은 차례 */
export const V2_JOINTS = jointMap.joints as readonly V2Joint[];
export const N_V2_JOINTS = V2_JOINTS.length;
export const V2J = Object.fromEntries(V2_JOINTS.map((j, i) => [j.name, i])) as Record<
  V2JointName,
  number
>;
/** 자식 → 부모(엔진 번호) */
export const V2_PARENT: Record<number, number> = Object.fromEntries(
  V2_JOINTS.flatMap((j, i) => (j.parent ? [[i, V2J[j.parent]]] : []))
);
/** 좌우 짝(왼쪽 번호가 앞) */
export const V2_PAIRS: [number, number][] = V2_JOINTS.flatMap((j, i) =>
  j.pair && j.name.startsWith('l') ? [[i, V2J[j.pair]] as [number, number]] : []
);
/** RTMW 133점 가운데 우리가 쓰는 번호(엔진 차례) */
export const RTMW_INDEX: number[] = V2_JOINTS.map((j) => j.rtmw);

/* ───────────────────────────── GPU → 엔진 입력 ───────────────────────────── */

/** 2D 관찰 [x(px), y(px), 확신 0~1] */
export type V2Obs = [number, number, number];

/** 한 영상의 2D 관절(엔진 입력 — GPU 의 RTMW 가 만든다) */
export type V2Track = {
  W: number;
  H: number;
  /** 원본 트랙 시각 기준 초당 장면(편집 목록 없이, 0-3절 6번) */
  fps: number;
  frames: { t: number; p: V2Obs[] }[];
};

export type V2Input = {
  side: V2Track;
  back: V2Track;
  hand: 'R' | 'L';
  heightCm: number | null;
  /** 작업 번호 — 결과에 그대로 싣는다(화면이 job.json 의 번호와 맞춘다) */
  jobId: string;
  /** 2D 모델 이름(예: rtmw-l-384) — GPU 가 적는다 */
  poseModel: string;
  /** 시험용(합성 투수) — 화면 녹화 · 슬로모 · 아는 순간. GPU 는 원본 영상이라 안 준다 */
  screenRecorded?: boolean;
  slowmoFps?: number | null;
  events?: { kneeUp?: number | null; footPlant: number; release: number };
};

/* ───────────────────────────── 결과 ───────────────────────────── */

export type V2FailCode =
  | 'video'
  | 'short'
  | 'events'
  | 'sync'
  | 'range'
  | 'calibration'
  | 'fit'
  | 'gpu'
  | 'gpu-auth'
  | 'upload'
  | 'timeout'
  | 'internal';

export type V2Stage = 'download' | 'pose' | 'segment' | 'fit' | 'upload';

/** 실패 글(해요체 한 줄) — v1 까닭(short · events · sync · range · calibration)은 v1 글 그대로(검토 2절) */
export const V2_FAIL_TEXT: Record<V2FailCode, string> = {
  video: '영상을 읽지 못했어요. 원본 파일(HEVC · 5~6초)로 다시 올려 주세요.',
  short: FAIL_TEXT.short,
  events: FAIL_TEXT.events,
  sync: FAIL_TEXT.sync,
  range: FAIL_TEXT.range,
  calibration: FAIL_TEXT.calibration,
  fit: '몸을 맞추지 못했어요. 영상을 바꿔 다시 해 주세요.',
  gpu: '분석 서버가 응답하지 않아요. 잠시 뒤 다시 해 주세요.',
  'gpu-auth': '서버 키 설정을 확인해 주세요.',
  upload: '결과를 저장하지 못했어요. 다시 분석해 주세요.',
  timeout: '분석이 너무 오래 걸려요. 다시 해 주세요.',
  internal: '분석 중 문제가 생겼어요. 다시 해 주세요.',
};

/** 영상 탓(다시 분석해도 같을 때가 많다 — 화면은 촬영 안내를 앞에 두고 '같은 영상으로 다시'는 옆에 작게, 화면 결정 5) */
export const V2_VIDEO_FAULT: ReadonlySet<V2FailCode> = new Set<V2FailCode>([
  'video',
  'short',
  'events',
  'sync',
  'range',
  'calibration',
  'fit',
]);

export type V2FitQuality = {
  /** 맞춘 뒤 뼈 길이 흔들림(%) — 고정 뼈 길이라 0 에 가깝다(핵심 합격 1% 밑) */
  boneCvPct: number;
  /** 맞춘 관절을 두 영상에 다시 비춘 거리(사람 높이 %) */
  reprojPct: number;
  /** 두 영상 어디에도 안 보여 뼈대 · 앞뒤 장면으로 채운 관절 수 */
  filled: number;
  /** 장면 사이 가속(키 단위 /장면²) p95 — v1 0.04~0.096 보다 작아야 한다 */
  accelP95: number;
  /** 뼈 길이(키 = 1) — 자식 관절 번호 → 길이 */
  boneLen: Record<string, number>;
};

export type Pitch3dV2Ok = {
  ok: true;
  version: string;
  jobId: string;
  hand: 'R' | 'L';
  engine: { v1: string; pose: string };
  /** 장면 시각(옆 영상 원본 트랙 초) */
  t: number[];
  /** 같은 장면의 뒤 영상 시각(초) — 원본 두 칸이 3D 시계를 따라가게(화면 결정 12) */
  tBack: number[];
  /** 장면 × 관절 25 × [앞, 위, 오른쪽] 정수 mm(키 = 1000mm) — 빈 칸 없음 */
  joints: number[][][];
  /** 장면 × 관절 확신 0~100(정수) */
  conf: number[][];
  /** 확신 낮은 장면 구간 [시작, 끝](끝 포함) — 재생 막대에 엷은 회색(화면 결정 13) */
  lowConf: [number, number][];
  events: { kneeUp: number | null; footPlant: number; release: number };
  /** v1 정의 그대로(0-3절 결정 ④ 대기) */
  metrics: Metric[];
  quality: Pitch3dQuality;
  fit: V2FitQuality;
  warnings: WarningCode[];
  /** 두 카메라(결과 좌표계 · 픽셀) — 겹쳐 보기 등 뒤 일에. 화면 크기도 함께 */
  cameras: {
    side: Camera & { W: number; H: number };
    back: Camera & { W: number; H: number };
  } | null;
  /** 옆 영상에서 분석한 구간(원본 트랙 초) */
  segment: { fromSec: number; toSec: number };
};

export type Pitch3dV2Fail = {
  ok: false;
  version: string;
  jobId: string;
  code: V2FailCode;
  reason: string;
  stage: V2Stage;
  quality?: Partial<Pitch3dQuality>;
};

export type Pitch3dV2Result = Pitch3dV2Ok | Pitch3dV2Fail;

export const v2Fail = (
  jobId: string,
  code: V2FailCode,
  stage: V2Stage,
  quality?: Partial<Pitch3dQuality>
): Pitch3dV2Fail => ({
  ok: false,
  version: PITCH3D_V2_VERSION,
  jobId,
  code,
  reason: V2_FAIL_TEXT[code],
  stage,
  ...(quality ? { quality } : {}),
});

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isV2JobId = (v: unknown): v is string =>
  typeof v === 'string' && UUID.test(v);
const STAGES: V2Stage[] = ['download', 'pose', 'segment', 'fit', 'upload'];

function isCamera(c: unknown): c is Camera & { W: number; H: number } {
  if (!c || typeof c !== 'object') return false;
  const o = c as Record<string, unknown>;
  return (
    isNum(o.f) &&
    isNum(o.cx) &&
    isNum(o.cy) &&
    isNum(o.W) &&
    isNum(o.H) &&
    Array.isArray(o.R) &&
    o.R.length === 9 &&
    o.R.every(isNum) &&
    Array.isArray(o.t) &&
    o.t.length === 3 &&
    o.t.every(isNum)
  );
}

/**
 * 결과를 읽는다 — 판 · 모양 · 숫자가 맞지 않으면 null(신뢰 경계 — 저장소에서 읽은 것 · GPU 가 보낸 것 둘 다 이것을 거친다).
 * 실패 결과의 까닭 글은 코드로 다시 만든다(저장된 글을 믿지 않는다).
 */
export function readPitch3dV2Result(raw: unknown): Pitch3dV2Result | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== PITCH3D_V2_VERSION || !isV2JobId(r.jobId)) return null;
  if (r.ok === false) {
    if (typeof r.code !== 'string' || !(r.code in V2_FAIL_TEXT)) return null;
    const stage = STAGES.includes(r.stage as V2Stage) ? (r.stage as V2Stage) : 'fit';
    return v2Fail(
      r.jobId,
      r.code as V2FailCode,
      stage,
      r.quality && typeof r.quality === 'object'
        ? (r.quality as Partial<Pitch3dQuality>)
        : undefined
    );
  }
  if (r.ok !== true || (r.hand !== 'R' && r.hand !== 'L')) return null;
  const t = r.t;
  const joints = r.joints;
  const conf = r.conf;
  if (!Array.isArray(t) || !Array.isArray(joints) || !Array.isArray(conf)) return null;
  if (!Array.isArray(r.tBack) || r.tBack.length !== t.length || !r.tBack.every(isNum))
    return null;
  const n = t.length;
  if (
    n === 0 ||
    n > MAX_V2_FRAMES + 3 ||
    joints.length !== n ||
    conf.length !== n ||
    !t.every(isNum)
  )
    return null;
  for (let k = 0; k < n; k++) {
    const fr = joints[k];
    const cf = conf[k];
    if (
      !Array.isArray(fr) ||
      fr.length !== N_V2_JOINTS ||
      !Array.isArray(cf) ||
      cf.length !== N_V2_JOINTS
    )
      return null;
    for (const p of fr)
      if (!Array.isArray(p) || p.length !== 3 || !p.every(isInt)) return null;
    for (const c of cf) if (!isInt(c) || c < 0 || c > 100) return null;
  }
  const okIdx = (v: unknown) => isInt(v) && v >= 0 && v < n;
  const e = r.events as Record<string, unknown> | undefined;
  if (
    !e ||
    !okIdx(e.footPlant) ||
    !okIdx(e.release) ||
    !(e.kneeUp === null || okIdx(e.kneeUp))
  )
    return null;
  if (!Array.isArray(r.lowConf)) return null;
  for (const s of r.lowConf)
    if (
      !Array.isArray(s) ||
      s.length !== 2 ||
      !okIdx(s[0]) ||
      !okIdx(s[1]) ||
      s[0] > s[1]
    )
      return null;
  if (!Array.isArray(r.metrics)) return null;
  for (const m of r.metrics as Record<string, unknown>[]) {
    if (!m || typeof m.key !== 'string' || !isNum(m.value) || !isNum(m.pm)) return null;
  }
  if (!r.quality || typeof r.quality !== 'object') return null;
  const fit = r.fit as Record<string, unknown> | undefined;
  if (
    !fit ||
    !isNum(fit.boneCvPct) ||
    !isNum(fit.reprojPct) ||
    !isInt(fit.filled) ||
    !isNum(fit.accelP95) ||
    !fit.boneLen ||
    typeof fit.boneLen !== 'object'
  )
    return null;
  if (
    !Array.isArray(r.warnings) ||
    !r.warnings.every((w) => typeof w === 'string' && w in WARNING_TEXT)
  )
    return null;
  const eng = r.engine as Record<string, unknown> | undefined;
  if (!eng || typeof eng.v1 !== 'string' || typeof eng.pose !== 'string') return null;
  const cams = r.cameras as Record<string, unknown> | null | undefined;
  if (
    cams != null &&
    (typeof cams !== 'object' || !isCamera(cams.side) || !isCamera(cams.back))
  )
    return null;
  const seg = r.segment as Record<string, unknown> | undefined;
  if (!seg || !isNum(seg.fromSec) || !isNum(seg.toSec) || seg.toSec < seg.fromSec)
    return null;
  return raw as Pitch3dV2Ok;
}

/** 저장할 문자열로 — 모양 검사를 통과하고 상한 안일 때만(서버 동작 · GPU 둘 다) */
export function storedV2ResultJson(raw: unknown): { json: string } | { error: string } {
  const r = readPitch3dV2Result(raw);
  if (!r) return { error: '분석 결과의 모양이 맞지 않아요.' };
  const json = JSON.stringify(r);
  if (json.length > MAX_V2_RESULT_BYTES) return { error: '분석 결과가 너무 커요.' };
  return { json };
}

/* ───────────────────────────── 작업(job.json) ───────────────────────────── */

export type V2JobStatus = 'queued' | 'running' | 'done' | 'failed';

export type Pitch3dV2Job = {
  status: V2JobStatus;
  /** 지금 작업 번호(우리가 만든 UUID — 결과 파일 이름 analysis-v2-{jobId}.json) */
  jobId: string;
  requestedAt: string;
  /** 요청한 관리자 id(감사 기록, 검토 3절) */
  requestedBy: string;
  /** 동의 확인 시각(핵심 5) */
  consentAt: string;
  engine: string;
  /** GPU 회사 쪽 실행 번호(상태 묻기용) — 아직 못 걸었으면 null */
  gpuCallId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** 단계별 걸린 시간(초, 검토 8절) */
  stages: Partial<Record<V2Stage, number>>;
  fail: { code: V2FailCode; reason: string } | null;
  /** 지금 보여 줄 결과의 작업 번호(done 인 마지막 것) — 다시 분석 중 · 실패 뒤에도 이전 결과를 보인다(화면 결정 6) */
  shownJobId: string | null;
};

const STATUSES: V2JobStatus[] = ['queued', 'running', 'done', 'failed'];
const isIso = (v: unknown): v is string =>
  typeof v === 'string' && Number.isFinite(Date.parse(v));

/** job.json 을 읽는다 — 모양이 틀리면 null(없는 것과 같이 다룬다) */
export function readPitch3dV2Job(raw: unknown): Pitch3dV2Job | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (
    !STATUSES.includes(r.status as V2JobStatus) ||
    !isV2JobId(r.jobId) ||
    !isIso(r.requestedAt)
  )
    return null;
  if (
    typeof r.requestedBy !== 'string' ||
    !isIso(r.consentAt) ||
    typeof r.engine !== 'string'
  )
    return null;
  const stages: Partial<Record<V2Stage, number>> = {};
  if (r.stages && typeof r.stages === 'object') {
    for (const s of STAGES) {
      const v = (r.stages as Record<string, unknown>)[s];
      if (isNum(v) && v >= 0) stages[s] = Math.round(v * 10) / 10;
    }
  }
  let fail: Pitch3dV2Job['fail'] = null;
  if (r.fail && typeof r.fail === 'object') {
    const code = (r.fail as Record<string, unknown>).code;
    if (typeof code === 'string' && code in V2_FAIL_TEXT)
      fail = { code: code as V2FailCode, reason: V2_FAIL_TEXT[code as V2FailCode] };
  }
  if (r.status === 'failed' && !fail)
    fail = { code: 'internal', reason: V2_FAIL_TEXT.internal };
  return {
    status: r.status as V2JobStatus,
    jobId: r.jobId,
    requestedAt: r.requestedAt,
    requestedBy: r.requestedBy,
    consentAt: r.consentAt,
    engine: r.engine,
    gpuCallId: typeof r.gpuCallId === 'string' ? r.gpuCallId : null,
    startedAt: isIso(r.startedAt) ? r.startedAt : null,
    finishedAt: isIso(r.finishedAt) ? r.finishedAt : null,
    stages,
    fail,
    shownJobId: isV2JobId(r.shownJobId) ? r.shownJobId : null,
  };
}

/** 아직 돌고 있다고 보나 — queued · running 이고 15분이 안 지났을 때 */
export function isV2JobActive(job: Pitch3dV2Job | null, nowMs: number): boolean {
  if (!job || (job.status !== 'queued' && job.status !== 'running')) return false;
  return nowMs - Date.parse(job.requestedAt) < V2_JOB_TIMEOUT_MS;
}

/** 새 분석을 걸 수 있나(검토 2절 Busy) */
export function canRequestV2(
  job: Pitch3dV2Job | null,
  nowMs: number
): { ok: true } | { error: string } {
  if (isV2JobActive(job, nowMs)) return { error: '분석이 이미 돌고 있어요.' };
  return { ok: true };
}

/** 새 작업(queued) — 이전 결과(shownJobId)는 이어 보인다 */
export function newV2Job(
  prev: Pitch3dV2Job | null,
  input: { jobId: string; requestedBy: string; consentAt: string; now: string }
): Pitch3dV2Job {
  return {
    status: 'queued',
    jobId: input.jobId,
    requestedAt: input.now,
    requestedBy: input.requestedBy,
    consentAt: input.consentAt,
    engine: PITCH3D_V2_VERSION,
    gpuCallId: null,
    startedAt: null,
    finishedAt: null,
    stages: {},
    fail: null,
    shownJobId: prev?.shownJobId ?? (prev?.status === 'done' ? prev.jobId : null),
  };
}

/** GPU 회사가 돌려준 상태(서버 동작이 묻는다 — gpu-client.ts 가 이 모양으로 바꾼다) */
export type GpuStatus =
  | { kind: 'pending' }
  | { kind: 'running'; stage?: V2Stage; stages?: Partial<Record<V2Stage, number>> }
  | { kind: 'done'; stages?: Partial<Record<V2Stage, number>> }
  | { kind: 'failed'; code: V2FailCode; stages?: Partial<Record<V2Stage, number>> }
  /** 묻기 실패 · 모름 — 다음 물음에 다시(검토 2절 StatusError) */
  | { kind: 'unknown' };

/**
 * 상태 묻기 결과를 job 에 적는다(순수). 지키는 것(검토 4절):
 *   - forJobId 가 지금 번호가 아니면 버린다(옛 작업의 답).
 *   - done 은 결과 파일이 실제로 있을 때만(resultSaved) — 아니면 running 으로 두고 다음 물음에 다시.
 *   - 15분이 지났으면 무엇이 오든 timeout(done 빼고).
 *   - done · failed 는 바꾸지 않는다(끝난 작업).
 */
export function applyGpuStatus(
  job: Pitch3dV2Job,
  forJobId: string,
  status: GpuStatus,
  resultSaved: boolean,
  nowMs: number
): Pitch3dV2Job {
  if (job.jobId !== forJobId || job.status === 'done' || job.status === 'failed')
    return job;
  const now = new Date(nowMs).toISOString();
  const stages =
    'stages' in status && status.stages
      ? { ...job.stages, ...status.stages }
      : job.stages;
  if (status.kind === 'done' && resultSaved) {
    return {
      ...job,
      status: 'done',
      stages,
      finishedAt: now,
      startedAt: job.startedAt ?? now,
      fail: null,
      shownJobId: job.jobId,
    };
  }
  if (status.kind === 'failed') {
    return {
      ...job,
      status: 'failed',
      stages,
      finishedAt: now,
      fail: { code: status.code, reason: V2_FAIL_TEXT[status.code] },
    };
  }
  if (nowMs - Date.parse(job.requestedAt) >= V2_JOB_TIMEOUT_MS) {
    return {
      ...job,
      status: 'failed',
      stages,
      finishedAt: now,
      fail: { code: 'timeout', reason: V2_FAIL_TEXT.timeout },
    };
  }
  if (status.kind === 'running' || (status.kind === 'done' && !resultSaved)) {
    return { ...job, status: 'running', stages, startedAt: job.startedAt ?? now };
  }
  return { ...job, stages };
}

/** 서버 동작이 스스로 실패로 돌릴 때 — GPU 를 못 부름(gpu · gpu-auth) · 결과 파일 모양이 틀림(internal, 검토 2절 BadResult) */
export function failV2Job(
  job: Pitch3dV2Job,
  code: V2FailCode,
  nowMs: number
): Pitch3dV2Job {
  return {
    ...job,
    status: 'failed',
    finishedAt: new Date(nowMs).toISOString(),
    fail: { code, reason: V2_FAIL_TEXT[code] },
  };
}

/** 기다림 글 — 시간만(화면 결정 4): 3분 안 '보통 1~2분' · 3분 넘음 '조금 더' · 10분 넘음 '15분이 지나면 멈춰요' */
export function v2WaitingText(job: Pitch3dV2Job, nowMs: number): string {
  const min = (nowMs - Date.parse(job.requestedAt)) / 60_000;
  if (min < 3)
    return job.status === 'queued'
      ? '분석 서버를 깨우는 중이에요. 보통 1~2분 걸려요.'
      : '분석 중이에요. 보통 1~2분 걸려요.';
  if (min < 10) return '조금 더 걸리고 있어요. 화면을 떠나도 분석은 계속돼요.';
  return '15분이 지나면 멈추고 다시 할 수 있어요.';
}
