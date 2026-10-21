/**
 * 투구 진단 리포트(무료 1구) — 3D 결과 하나로 여섯 요소의 상태 · 주 문제 · 처방 한 장을 셈한다(순수, 웹 · 앱 · 서버가 같이 쓴다).
 *
 * 설계 docs/designs/pitch-3d-report.md — 기준 3-5절(상태 네 칸 · 평지), 진단 고르기 4절, 화면 5-4절, 처방 6-1 · 6-2절.
 * 값은 mechChecks(lib/pitch-3d/v2/mech-checks.ts), 기준은 드라이브라인 공개 자료를 우리 식으로 다시 센 것(scripts/pitch-lab/obp/elements.py,
 * 마운드 · 100명 402구), 엔진 오차는 마커 15구(scripts/pitch-lab/markers/selfcal/element_score.py, 10-15 엔진). 문턱 여유는 2 × σ(1구).
 *
 * 등급(3-1절): 드리프트 A · 드롭 · 브레이크 · 몸통 회전 · 착지 때 상체 'A 후보'(P0 마커 촬영 전) · 스로잉 B. A 만 고칠 점, A 후보는 경계까지
 * (2026-10-21 — 실험실 실제 샘플 8개 중 4개가 브레이크 '고칠 점'으로 나왔는데 엔진 앞다리 정확도를 아직 한 사람 · 한 번만 쟀다), B 는 '참고'까지.
 * P0 에서 등급이 바뀌면 ELEMENT_GRADE 한 줄만 고친다.
 * 글은 해요체 · 줄표 없이 · 코칭 기관 이름 없이(2026-10-09 규칙). 결론에는 숫자를 안 쓴다.
 */
import { DRILL_STAGE_NAMES, type FOCUS_POINTS } from '@/lib/exercise-meta';
import { withJosa } from '@/lib/korean';
import type { MechanicsDrillView } from '@/lib/mechanics/drills';
import { mechanicsElement } from '@/lib/mechanics/elements';
import { doseOf, doseText } from '@/lib/mechanics/program';
import { plantFrame, type Pitch3dV2Ok } from '@/lib/pitch-3d/v2/contract';
import { mechChecks, DROP_RISE_MAX, type MechChecks } from '@/lib/pitch-3d/v2/mech-checks';
import { DRIFT_GOOD, DRIFT_LOW, MECH_CONF_MIN, TRUNK_PLANT_NORM } from '@/lib/pitch-3d/v2/mech-judge';

type ElementName = (typeof FOCUS_POINTS)[number];
type DrillStage = (typeof DRILL_STAGE_NAMES)[number];

/** 기준 판 — 문턱 · 기준표 · 글을 바꾸면 올린다(리포트 요약이 옛 판이면 다시 셈) */
export const REPORT_CRITERIA = '2026-10-21';
/**
 * 이 확신(0~100, 그 지표가 쓴 관절 · 장면 평균) 밑이면 판정하지 않는다 — 지금 점검 카드와 같은 30(mech-judge MECH_CONF_MIN).
 * 설계 3-2절은 한 구라 45 로 올리자 했지만, 실험실 실제 샘플 8개의 확신이 25~57 이라 45 면 8개 중 6개가 '판정 못 함'이 됐다(2026-10-21).
 * 한 구의 큰 오류는 확신 대신 엔진 오류값 거르기(브레이크 더 굽음 40° · 골반 감속 115%)로 막는다. 확신이 없는 옛 결과는 그대로 판정.
 */
export const REPORT_CONF_MIN = MECH_CONF_MIN;
/** 성장기(만 16세 미만, 트레이닝과 같은 선) — 크기 지표는 참고로만(4절 4번) */
export const REPORT_YOUTH_AGE = 16;

export type ReportStatus = 'improve' | 'edge' | 'fair' | 'good' | 'note' | 'unsure';
export type FaultKey =
  | 'drift.stuck'
  | 'drop.float'
  | 'drop.shallow'
  | 'sep.openAtPlant'
  | 'block.collapse'
  | 'block.soft'
  | 'trunk.upright'
  | 'arm.late';
type Grade = 'A' | 'A?' | 'B';

/** 등급(3-1절) — 'A?' = A 후보(P0 전, 경계까지). B 는 경계 · 고칠 점을 안 낸다 */
export const ELEMENT_GRADE: Record<ElementName, Grade> = {
  드리프트: 'A',
  드롭: 'A?',
  '상하체 분리': 'A?',
  브레이크: 'A?',
  '몸통 회전': 'A?',
  스로잉: 'B',
};

/** 흐름 차례(4절 2번) — 앞쪽 문제가 뒤쪽을 만든다 */
export const CHAIN: ElementName[] = ['드리프트', '드롭', '상하체 분리', '브레이크', '몸통 회전', '스로잉'];

/**
 * 띠 — 클수록 좋으면 up. 고칠 점 < cut ≤ 경계 < edgeEnd ≤ 보통 < fairEnd ≤ 좋아요(up 이 아니면 거꾸로).
 * cut = 자료 아래 10%(나쁜 쪽 10%) − 2σ, edgeEnd = 아래 10%, fairEnd = 아래 25%(3-5절 '상태 네 칸').
 */
type Band = { up: boolean; cut: number; edgeEnd: number; fairEnd: number; lo: number; hi: number };

/** 드리프트(키 비율) — 지금 판정(mech-judge DRIFT_LOW · DRIFT_GOOD) 그대로, 그 위 2σ(엔진 0.7cm ≈ 0.007, 두 배 올림)를 경계 */
const DRIFT_BAND: Band = { up: true, cut: DRIFT_LOW, edgeEnd: 0.07, fairEnd: DRIFT_GOOD, lo: 0, hi: 0.16 };
/** 드롭(다리 길이 비율) — 자료 10 / 25 / 50% 0.26 / 0.31 / 0.36, 같은 선수 흔들림 0.01 · 엔진 0.01 → 2σ ≈ 0.03 */
const DROP_BAND: Band = { up: true, cut: 0.23, edgeEnd: 0.26, fairEnd: 0.31, lo: 0, hi: 0.5 };
/** 이만큼(다리 길이 비율) 밑으로만 내려가면 '거의 안 가라앉음' — 평지에서도 고칠 점(김민 정의: 유지되거나 뜨면 나쁨) */
export const DROP_FLOAT_MAX = 0.05;
/** 브레이크 · 착지 뒤 더 굽음(°, 작을수록 좋음) — 자료 위 25 / 10% 7.8 / 11.9°, 2σ ≈ 4° */
const SINK_BAND: Band = { up: false, cut: 16, edgeEnd: 11.9, fairEnd: 7.8, lo: 0, hi: 30 };
/** 브레이크 · 착지 → 릴리스 무릎 펴짐(°) — 자료 10 / 25% −4.1 / 2.1°, 엔진 3.8 · 같은 선수 3.4 → 2σ ≈ 10° */
const EXT_BAND: Band = { up: true, cut: -14, edgeEnd: -4.1, fairEnd: 2.1, lo: -25, hi: 30 };
/** 몸통 회전 · 릴리스 앞 기울기(°) — 자료 10 / 25% 17.6 / 22.3°, 엔진 1.8 · 같은 선수 1.2 → 2σ ≈ 4.5° */
const TRUNK_BAND: Band = { up: true, cut: 13, edgeEnd: 17.6, fairEnd: 22.3, lo: 0, hi: 45 };
/** 스로잉 · 착지 어깨 벌림(°) — 자료 10 / 25% 72 / 78.6°, 엔진 4.1 → 2σ ≈ 9°. 등급 B 라 지금은 참고 */
const ARM_BAND: Band = { up: true, cut: 63, edgeEnd: 72, fairEnd: 78.6, lo: 40, hi: 110 };
/** 착지 때 상체 열림(°, 작을수록 닫힘) — 지금 판정과 같게 위 25% 까지 좋아요 · 위 10% 넘으면 고칠 점(엔진이 13° 닫힌 쪽으로 읽어 후하다) */
const sepBand = (hand: 'R' | 'L'): Band => {
  const N = TRUNK_PLANT_NORM[hand];
  return { up: false, cut: N.p90, edgeEnd: N.p75, fairEnd: N.p75, lo: -45, hi: 20 };
};

const RANK: Record<ReportStatus, number> = { improve: 4, edge: 3, fair: 2, good: 1, note: 0, unsure: 0 };

function bandOf(v: number, b: Band): 'improve' | 'edge' | 'fair' | 'good' {
  const worse = (x: number, t: number) => (b.up ? x < t : x > t);
  if (worse(v, b.cut)) return 'improve';
  if (worse(v, b.edgeEnd)) return 'edge';
  if (worse(v, b.fairEnd)) return 'fair';
  return 'good';
}

/** 화면의 기준 띠 — 네 칸 + 내 값 점 + 문턱 표시 */
export type ReportGauge = Band & { value: number };

export type ReportItem = {
  element: ElementName;
  /** 요소별 드릴 칸 키(/training?view=mechanics&tab=elements&el=) */
  key: string;
  status: ReportStatus;
  /** 경계 · 고칠 점일 때 문제 종류(6-1절) */
  fault: FaultKey | null;
  /** 참고 · 판정 안 함의 까닭 */
  why: 'gradeB' | 'flat' | 'youth' | 'lowConf' | 'implausible' | 'notMeasured' | null;
  /** 한 줄(해요체) */
  line: string;
  /** 큰 숫자와 그 이름 — 판정 안 함이면 null */
  value: string | null;
  valueLabel: string | null;
  /** 띠 밑 한 줄 */
  foot: string | null;
  /** 좋아요가 되는 값 '22° 위' — 처방 목표 */
  goal: string | null;
  gauge: ReportGauge | null;
  /** '그 순간' 장면 */
  frame: number | null;
};

/** 처방에 쓰는 드릴 한 동작 — MechanicsDrillView 에서 필요한 것만(화면으로 보내는 몫을 줄인다) */
export type ReportDrill = {
  title: string;
  focusPoints: string[];
  stage: string | null;
  category: string;
  thumbUrl: string | null;
};

export const reportDrillsOf = (views: MechanicsDrillView[]): ReportDrill[] =>
  views.map((d) => ({
    title: d.title,
    focusPoints: d.focusPoints,
    stage: d.stage,
    category: d.variants[0]?.category ?? '',
    thumbUrl: d.variants.find((v) => v.thumbUrl)?.thumbUrl ?? null,
  }));

/** 처방 한 장(6-1절) — 요소마다 */
export type ElementRx = {
  element: ElementName;
  key: string;
  fault: FaultKey;
  /** 고칠 점 = 집중(2칸) · 경계 = 보조(1칸) */
  level: 'improve' | 'edge';
  slots: 1 | 2;
  cue: string;
  /** 주차별 드릴 — 고칠 점 1 · 2 · 3주, 경계 1주 · 2~3주 */
  weeks: { week: 1 | 2 | 3; label: string; stage: DrillStage; drills: { title: string; thumbUrl: string | null; dose: string }[] }[];
  /** 다음 재기에서 볼 숫자 */
  target: { label: string; now: string; goal: string } | null;
};

export type PitchReport = {
  v: 1;
  criteria: string;
  tier: 'free';
  ground: 'mound' | 'flat';
  hand: 'R' | 'L';
  youth: boolean;
  /** 여섯 요소, 흐름 차례 */
  items: ReportItem[];
  /** 주 문제 요소(없으면 null) — 처음 골라 둘 점 */
  primary: ElementName | null;
  headline: {
    tone: 'improve' | 'edge' | 'good' | 'unsure';
    /** 꼬리표 '브레이크 · 고칠 점'(좋아요 · 판정 못 함이면 null) */
    tag: string | null;
    /** 결론 두 줄까지(\n) */
    title: string;
    why: string | null;
    frame: number | null;
    /** 그 순간 이름 '착지 뒤 0.08초' */
    moment: string | null;
  };
  /** 경계 이상 요소마다 처방(흐름 차례 · 많아야 2장) */
  rx: ElementRx[];
  /** 경계 이상인데 이번 처방에 못 넣은 요소 — 다음 차례 */
  later: ElementName[];
};

/** 목록 · 작업 기록에 남기는 요약(job.json) — 목록이 결과 파일을 다시 읽지 않게 */
export type ReportSummary = {
  v: 1;
  criteria: string;
  primary: { element: ElementName; level: 'improve' | 'edge' } | null;
  /** 판정한 요소가 하나라도 있나 */
  judged: boolean;
};

export type ReportContext = {
  heightCm: number | null;
  ground: 'mound' | 'flat';
  youth: boolean;
  /** 처방 드릴(없으면 처방 칸 없이 요약만) */
  drills?: ReportDrill[] | null;
};

/* ───────────────────────────── 글 ───────────────────────────── */

const UNSURE_LINE = '영상에서 이 부분이 잘 안 보여 판정하지 않았어요.';
const WHY_LINE: Record<NonNullable<ReportItem['why']>, string> = {
  gradeB: '이 지표는 아직 정확도를 확인하는 중이라 참고로만 봐요.',
  flat: '평지에서 던진 영상이라 참고로만 봐요. 기준이 마운드 투구예요.',
  youth: '성장기는 크기보다 순서를 먼저 봐서 참고로만 봐요.',
  lowConf: UNSURE_LINE,
  implausible: '이 영상에서는 값이 믿기 어려워 판정하지 않았어요.',
  notMeasured: '다리를 드는 장면을 찾지 못해 판정하지 않았어요.',
};

/** 결론 첫 줄 — 문제(fault)마다 하나(5-7절) */
export const FAULT_TEXT: Record<FaultKey, string> = {
  'drift.stuck': '다리를 들 때 몸이 투구판 위에 머물러요.',
  'drop.float': '다리를 든 뒤 몸이 가라앉지 않고 떠요.',
  'drop.shallow': '다리를 든 뒤 몸이 덜 가라앉아요.',
  'sep.openAtPlant': '앞발이 닿을 때 상체가 이미 열려 있어요.',
  'block.collapse': '착지한 뒤 앞무릎이 무너져요.',
  'block.soft': '착지한 뒤 앞무릎이 펴지지 않아요.',
  'trunk.upright': '공을 놓을 때 몸통이 서 있어요.',
  'arm.late': '앞발이 닿을 때 팔이 덜 올라와요.',
};

/** 요소가 왜 중요한지 한 줄 */
const WHY_SHORT: Record<ElementName, string> = {
  드리프트: '홈 쪽으로 먼저 흘러가야 앞으로 가는 힘을 처음부터 만들지 않아요.',
  드롭: '뒷엉덩이에 앉으며 감아 둔 힘이 앞으로 가는 힘이 돼요.',
  '상하체 분리': '상체가 늦게 열려야 골반이 먼저 돌며 꼬임이 생겨요.',
  브레이크: '앞다리가 버텨야 몸이 멈추고 그 힘이 몸통으로 넘어가요.',
  '몸통 회전': '몸통이 앞으로 숙여지며 돌아야 팔에 힘이 실려요.',
  스로잉: '팔이 제때 올라와야 어깨가 도는 길을 따라가요.',
};

/** 처방 카드의 느낌 신호(lib/mechanics/elements.ts cues 에서 문제에 맞는 한 줄) */
const FAULT_CUE: Record<FaultKey, string> = {
  'drift.stuck': '다리를 가장 높이 든 자리는 투구판보다 한 뼘 앞.',
  'drop.float': '뒷엉덩이와 뒤꿈치에 앉으며 간다.',
  'drop.shallow': '투구판을 2루 쪽으로 끌어당긴다.',
  'sep.openAtPlant': '앞어깨를 닫은 채 앞발을 딛는다.',
  'block.collapse': '앞다리는 벽, 밀려나지 않는다.',
  'block.soft': '골반이 돌며 앞무릎이 펴진다.',
  'trunk.upright': '뒷어깨를 목표 쪽으로 돌려 보낸다.',
  'arm.late': '팔이 어깨 높이에 올라온 뒤에 몸통이 돈다.',
};

const LINES: Record<FaultKey | ElementName, Partial<Record<ReportStatus, string>>> = {
  드리프트: {
    good: '다리를 들 때 몸이 홈 쪽으로 잘 나가요.',
    fair: '다리를 들 때 홈 쪽으로 조금 나가요.',
  },
  'drift.stuck': {
    edge: '다리를 들 때 홈 쪽으로 덜 나가는 편이에요.',
    improve: '다리를 들 때 몸이 투구판 위에 머물러요.',
  },
  드롭: {
    good: '다리를 든 뒤 몸이 충분히 가라앉아요.',
    fair: '다리를 든 뒤 몸이 가라앉아요. 조금 더 앉으면 좋아요.',
  },
  'drop.shallow': {
    edge: '다리를 든 뒤 조금 덜 가라앉아요.',
    improve: '다리를 든 뒤 많이 덜 가라앉아요.',
  },
  'drop.float': { edge: '다리를 든 뒤 몸이 거의 가라앉지 않아요.', improve: '다리를 든 뒤 몸이 가라앉지 않고 떠요.' },
  '상하체 분리': { good: '앞발이 닿을 때 상체가 잘 닫혀 있어요.', fair: '앞발이 닿을 때 상체가 닫혀 있어요.' },
  'sep.openAtPlant': {
    edge: '앞발이 닿을 때 상체가 조금 열려 있어요.',
    improve: '앞발이 닿을 때 상체가 많이 열려 있어요.',
  },
  브레이크: {
    good: '착지 뒤 앞다리가 펴지며 몸을 잘 멈춰요.',
    fair: '착지 뒤 앞다리가 조금 덜 버텨요.',
  },
  'block.collapse': {
    edge: '착지 뒤 앞무릎이 조금 굽어 들어가요.',
    improve: '착지 뒤 앞무릎이 무너져요.',
  },
  'block.soft': {
    edge: '착지 뒤 앞무릎이 잘 안 펴져요.',
    improve: '착지 뒤 앞무릎이 펴지지 않고 더 굽어요.',
  },
  '몸통 회전': {
    good: '공을 놓을 때 몸통이 앞으로 잘 숙여져요.',
    fair: '공을 놓을 때 몸통이 조금 덜 숙여져요.',
  },
  'trunk.upright': {
    edge: '공을 놓을 때 몸통이 조금 서 있어요.',
    improve: '공을 놓을 때 몸통이 서 있어요.',
  },
  스로잉: { good: '앞발이 닿을 때 팔이 어깨 높이까지 올라와요.', fair: '앞발이 닿을 때 팔이 조금 덜 올라와요.' },
  'arm.late': { edge: '앞발이 닿을 때 팔이 조금 늦게 올라와요.', improve: '앞발이 닿을 때 팔이 덜 올라와요.' },
};

const STATUS_FOOT: Record<'improve' | 'edge' | 'fair' | 'good', string> = {
  improve: '고칠 점 · 엔진 오차를 빼도 기준 밑',
  edge: '경계 · 기준 밑이지만 엔진 오차 안',
  fair: '보통 · 잘 던지는 투수 아래 10~25% 사이',
  good: '좋아요',
};

/* ───────────────────────────── 판정 ───────────────────────────── */

const okConf = (c: number | null | undefined) => c == null || c >= REPORT_CONF_MIN;
const fmtDeg = (v: number) => `${Math.round(v)}°`;
const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

type Draft = Omit<ReportItem, 'element' | 'key'>;

function judged(
  name: ElementName,
  fault: FaultKey,
  status: 'improve' | 'edge' | 'fair' | 'good',
  value: string,
  valueLabel: string,
  gauge: ReportGauge,
  frame: number | null,
  goal?: string
): Draft {
  const bad = status === 'improve' || status === 'edge';
  return {
    status,
    fault: bad ? fault : null,
    why: null,
    line: (bad ? LINES[fault][status] : LINES[name][status]) ?? '',
    value,
    valueLabel,
    foot: status === 'good' || !goal ? STATUS_FOOT[status] : `${STATUS_FOOT[status]} · 좋아요는 ${goal}`,
    goal: goal ?? null,
    gauge,
    frame,
  };
}

const reference = (why: NonNullable<ReportItem['why']>, value: string | null, valueLabel: string | null, gauge: ReportGauge | null, frame: number | null): Draft => ({
  status: why === 'lowConf' || why === 'implausible' || why === 'notMeasured' ? 'unsure' : 'note',
  fault: null,
  why,
  line: WHY_LINE[why],
  value,
  valueLabel,
  foot: null,
  goal: null,
  gauge,
  frame,
});

/** 등급 B · 평지 · 성장기면 참고로(값 · 띠는 그대로 보이고 경계 · 고칠 점 · 처방은 없다) */
function capped(name: ElementName, d: Draft, why: ReportItem['why']): Draft {
  if (ELEMENT_GRADE[name] === 'B') return reference('gradeB', d.value, d.valueLabel, d.gauge, d.frame);
  return why ? reference(why, d.value, d.valueLabel, d.gauge, d.frame) : d;
}

/** 여섯 요소 판정(흐름 차례) — mechChecks 값으로 */
export function judgeElements(
  m: MechChecks,
  ctx: Pick<ReportContext, 'heightCm' | 'ground' | 'youth'>,
  frames: { kneeUp: number | null; plant: number; release: number }
): ReportItem[] {
  const out: Record<ElementName, Draft> = {} as Record<ElementName, Draft>;
  const flat = ctx.ground === 'flat';

  /* 드리프트 */
  if (!m.drift) out['드리프트'] = reference('notMeasured', null, null, null, null);
  else if (!okConf(m.drift.conf)) out['드리프트'] = reference('lowConf', null, null, null, frames.kneeUp);
  else {
    const v = m.drift.aheadAtKneeUp;
    const value = m.drift.aheadAtKneeUpCm != null ? `${Math.round(m.drift.aheadAtKneeUpCm)}cm` : `키의 ${Math.round(v * 100)}%`;
    const goal = ctx.heightCm ? `${Math.round(DRIFT_GOOD * ctx.heightCm)}cm 위` : `키의 ${Math.round(DRIFT_GOOD * 100)}% 위`;
    out['드리프트'] = judged('드리프트', 'drift.stuck', bandOf(v, DRIFT_BAND), value, '니업 때 골반이 축발보다 앞', { ...DRIFT_BAND, value: v }, frames.kneeUp, goal);
  }

  /* 드롭 — '거의 안 가라앉음 · 뜸'은 어디서든 고칠 점, 그 밖은 마운드만(평지 · 성장기는 참고) */
  if (!m.drop) out['드롭'] = reference('notMeasured', null, null, null, null);
  else if (!okConf(m.drop.conf)) out['드롭'] = reference('lowConf', null, null, null, frames.plant);
  else {
    const v = m.drop.pelvisDrop;
    const gauge = { ...DROP_BAND, value: v };
    const label = '니업 → 착지 골반이 내려간 몫(다리 길이)';
    if (v < DROP_FLOAT_MAX || m.drop.rise > DROP_RISE_MAX)
      out['드롭'] = judged('드롭', 'drop.float', 'improve', fmtPct(v), label, gauge, frames.plant, `${fmtPct(DROP_BAND.fairEnd)} 위`);
    else
      out['드롭'] = capped(
        '드롭',
        judged('드롭', 'drop.shallow', bandOf(v, DROP_BAND), fmtPct(v), label, gauge, frames.plant, `${fmtPct(DROP_BAND.fairEnd)} 위`),
        flat ? 'flat' : ctx.youth ? 'youth' : null
      );
  }

  /* 상하체 분리 = 착지 때 상체 열림(순서 지표라 성장기도 판정) */
  {
    const v = m.separation.trunkOpenAtPlantDeg;
    if (!okConf(m.separation.trunkConf) || !Number.isFinite(v)) out['상하체 분리'] = reference('lowConf', null, null, null, frames.plant);
    else {
      const b = sepBand(m.hand);
      const value = `${Math.round(Math.abs(v))}° ${v >= 0 ? '열림' : '닫힘'}`;
      out['상하체 분리'] = judged('상하체 분리', 'sep.openAtPlant', bandOf(v, b), value, '착지 때 상체(어깨선)', { ...b, value: v }, frames.plant, `${Math.round(Math.abs(b.edgeEnd))}° 닫힘보다 닫힘`);
    }
  }

  /* 브레이크 — 착지 뒤 더 굽음 · 무릎 펴짐 둘 중 나쁜 쪽 */
  {
    const bl = m.block;
    if (!okConf(bl.conf)) out['브레이크'] = reference('lowConf', null, null, null, frames.release);
    else if (bl.kneeCollapseDeg > 40 || (Number.isFinite(bl.pelvisDecelPct) && bl.pelvisDecelPct > 115))
      out['브레이크'] = reference('implausible', null, null, null, frames.release);
    else {
      const sink = bandOf(bl.kneeCollapseDeg, SINK_BAND);
      const ext = bandOf(bl.kneeExtensionDeg, EXT_BAND);
      const useSink = RANK[sink] > RANK[ext] || (RANK[sink] === RANK[ext] && RANK[sink] >= RANK.edge);
      const why = ctx.youth ? 'youth' : null;
      out['브레이크'] = capped(
        '브레이크',
        useSink
          ? judged('브레이크', 'block.collapse', sink, fmtDeg(bl.kneeCollapseDeg), '착지 뒤 앞무릎이 더 굽은 각', { ...SINK_BAND, value: bl.kneeCollapseDeg }, frames.release, `${Math.round(SINK_BAND.fairEnd)}° 밑`)
          : judged(
              '브레이크',
              'block.soft',
              ext,
              `${bl.kneeExtensionDeg >= 0 ? '+' : '−'}${Math.round(Math.abs(bl.kneeExtensionDeg))}°`,
              '착지 → 릴리스 앞무릎이 펴진 각',
              { ...EXT_BAND, value: bl.kneeExtensionDeg },
              frames.release,
              `${Math.round(EXT_BAND.fairEnd)}° 넘게 펴짐`
            ),
        why
      );
    }
  }

  /* 몸통 회전 = 릴리스 앞 기울기(평지 · 성장기는 참고) */
  {
    const t = m.trunkTilt;
    if (!okConf(t.conf)) out['몸통 회전'] = reference('lowConf', null, null, null, frames.release);
    else
      out['몸통 회전'] = capped(
        '몸통 회전',
        judged('몸통 회전', 'trunk.upright', bandOf(t.forwardDeg, TRUNK_BAND), fmtDeg(t.forwardDeg), '릴리스 때 몸통 앞 기울기', { ...TRUNK_BAND, value: t.forwardDeg }, frames.release, `${Math.round(TRUNK_BAND.fairEnd)}° 위`),
        flat ? 'flat' : ctx.youth ? 'youth' : null
      );
  }

  /* 스로잉 = 착지 어깨 벌림(등급 B — 4차 마커 전엔 참고) */
  {
    const a = m.arm;
    if (!okConf(a.conf)) out['스로잉'] = reference('lowConf', null, null, null, frames.plant);
    else
      out['스로잉'] = capped(
        '스로잉',
        judged('스로잉', 'arm.late', bandOf(a.abductionAtPlantDeg, ARM_BAND), fmtDeg(a.abductionAtPlantDeg), '착지 때 어깨 벌림(90° = 팔꿈치가 어깨 높이)', { ...ARM_BAND, value: a.abductionAtPlantDeg }, frames.plant, `${Math.round(ARM_BAND.fairEnd)}° 위`),
        null
      );
  }

  return CHAIN.map((name) => ({ element: name, key: mechanicsElement(name)?.key ?? '', ...candidateCap(name, out[name]) }));
}

/** A 후보는 경계까지 — 고칠 점을 경계로 내리고 그 까닭을 띠 밑에 */
function candidateCap(name: ElementName, d: Draft): Draft {
  if (ELEMENT_GRADE[name] !== 'A?' || d.status !== 'improve' || !d.fault) return d;
  return {
    ...d,
    status: 'edge',
    line: LINES[d.fault].edge ?? d.line,
    foot: `경계 · 기준 밑이에요. 정확도를 확인하는 중이라 경계까지만 내요${d.goal ? ` · 좋아요는 ${d.goal}` : ''}`,
  };
}

/* ───────────────────────────── 처방 ───────────────────────────── */

const isBad = (i: ReportItem) => i.status === 'improve' || i.status === 'edge';

/** 주 문제 · 다음 문제 · 다음 차례(4절 · 6-2절) — 고칠 점이 있으면 그중 가장 앞, 없으면 경계 중 가장 앞 */
export function pickProblems(items: ReportItem[]): { primary: ReportItem | null; next: ReportItem | null; later: ReportItem[] } {
  const bad = items.filter(isBad);
  const primary = bad.find((i) => i.status === 'improve') ?? bad[0] ?? null;
  const rest = bad.filter((i) => i !== primary);
  return { primary, next: rest[0] ?? null, later: rest.slice(1) };
}

/** 요소의 단계별 드릴(그 요소가 주 요소인 동작 먼저, 이름 차례) */
function drillsFor(drills: ReportDrill[], element: ElementName, stage: DrillStage, n: number) {
  const mine = drills.filter((d) => d.focusPoints.includes(element) && d.stage === stage);
  return [...mine]
    .sort(
      (a, b) =>
        Number(a.focusPoints[0] !== element) - Number(b.focusPoints[0] !== element) || a.title.localeCompare(b.title, 'ko')
    )
    .slice(0, n)
    .map((d) => ({ title: d.title, thumbUrl: d.thumbUrl, dose: doseText(doseOf(d.category, stage)) }));
}

function rxOf(item: ReportItem, drills: ReportDrill[], slots: 1 | 2): ElementRx | null {
  if (!item.fault || (item.status !== 'improve' && item.status !== 'edge')) return null;
  /* 고칠 점 = 1주 기초 · 2주 연결 · 3주 통합, 경계 = 1주 연결 · 2~3주 통합(기초 건너뜀) */
  const plan: { week: 1 | 2 | 3; label: string; stage: DrillStage }[] =
    item.status === 'improve'
      ? [
          { week: 1, label: '1주', stage: '기초' },
          { week: 2, label: '2주', stage: '연결' },
          { week: 3, label: '3주', stage: '통합' },
        ]
      : [
          { week: 1, label: '1주', stage: '연결' },
          { week: 2, label: '2~3주', stage: '통합' },
        ];
  const weeks = plan
    .map((w) => ({ ...w, drills: drillsFor(drills, item.element, w.stage, slots) }))
    .filter((w) => w.drills.length > 0);
  const g = item.gauge;
  return {
    element: item.element,
    key: item.key,
    fault: item.fault,
    level: item.status,
    slots,
    cue: FAULT_CUE[item.fault],
    weeks,
    target: g && item.value && item.valueLabel && item.goal ? { label: item.valueLabel, now: item.value, goal: item.goal } : null,
  };
}

/* ───────────────────────────── 리포트 ───────────────────────────── */

const momentName = (r: Pick<Pitch3dV2Ok, 't' | 'events'>, frame: number | null): string | null => {
  if (frame == null) return null;
  const fp = plantFrame(r.events);
  const at = (k: number, name: string) => {
    const d = r.t[frame] - r.t[k];
    if (Math.abs(d) < 0.005) return name;
    return `${name} ${d > 0 ? '뒤' : '전'} ${Math.abs(d).toFixed(2)}초`;
  };
  if (r.events.kneeUp != null && frame <= r.events.kneeUp) return at(r.events.kneeUp, '니업');
  if (frame < fp) return at(fp, '착지');
  if (frame <= fp + Math.round((r.events.release - fp) / 2)) return at(fp, '착지');
  return at(r.events.release, '릴리스');
};

export function buildReport(result: Pick<Pitch3dV2Ok, 'joints' | 't' | 'events' | 'hand' | 'conf'>, ctx: ReportContext): PitchReport {
  const m = mechChecks(result, ctx.heightCm);
  const fp = plantFrame(result.events);
  const items = judgeElements(m, ctx, { kneeUp: result.events.kneeUp, plant: fp, release: result.events.release });
  const { primary, next, later } = pickProblems(items);
  const drills = ctx.drills ?? [];
  const rx = drills.length
    ? [primary && rxOf(primary, drills, primary.status === 'improve' ? 2 : 1), next && rxOf(next, drills, 1)].filter(
        (x): x is ElementRx => x != null
      )
    : [];

  const anyJudged = items.some((i) => i.status !== 'unsure' && i.status !== 'note');
  let headline: PitchReport['headline'];
  if (primary?.fault) {
    const improve = primary.status === 'improve';
    headline = {
      tone: improve ? 'improve' : 'edge',
      tag: `${primary.element} · ${improve ? '고칠 점' : '경계'}`,
      title: improve
        ? `${FAULT_TEXT[primary.fault]}\n여기부터 고쳐요.`
        : `동작이 좋아요.\n${withJosa(primary.element, '을/를')} 다듬으면 더 좋아져요.`,
      why: WHY_SHORT[primary.element],
      frame: primary.frame,
      moment: momentName(result, primary.frame),
    };
  } else if (anyJudged) {
    headline = {
      tone: 'good',
      tag: null,
      title: '지금 동작을 지켜요.\n흐름에서 크게 고칠 곳이 없어요.',
      why: '같은 자리에서 가끔 다시 찍어 지금 모습을 지키는지 봐요.',
      frame: result.events.release,
      moment: momentName(result, result.events.release),
    };
  } else {
    headline = {
      tone: 'unsure',
      tag: null,
      title: '이 영상으로는 판정이 어려워요.',
      why: '몸이 잘 보이게 다시 찍으면 리포트를 드려요.',
      frame: null,
      moment: null,
    };
  }

  return {
    v: 1,
    criteria: REPORT_CRITERIA,
    tier: 'free',
    ground: ctx.ground,
    hand: result.hand,
    youth: ctx.youth,
    items,
    primary: primary?.element ?? null,
    headline,
    rx,
    later: later.map((i) => i.element),
  };
}

export function reportSummary(report: PitchReport): ReportSummary {
  const p = report.primary ? report.items.find((i) => i.element === report.primary) : null;
  return {
    v: 1,
    criteria: report.criteria,
    primary: p && (p.status === 'improve' || p.status === 'edge') ? { element: p.element, level: p.status } : null,
    judged: report.items.some((i) => i.status !== 'unsure' && i.status !== 'note'),
  };
}

/** 요약을 읽는다(job.json 의 칸 — 모양이 틀리면 null) */
export function readReportSummary(raw: unknown): ReportSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || typeof r.criteria !== 'string' || typeof r.judged !== 'boolean') return null;
  const p = r.primary as Record<string, unknown> | null;
  if (p != null) {
    if (typeof p !== 'object' || !CHAIN.includes(p.element as ElementName) || (p.level !== 'improve' && p.level !== 'edge')) return null;
  }
  return {
    v: 1,
    criteria: r.criteria,
    primary: p ? { element: p.element as ElementName, level: p.level as 'improve' | 'edge' } : null,
    judged: r.judged,
  };
}

/** 작업 기록(job.json)에 남기는 모양 — 결과 작업 번호와 함께 */
export const jobReport = (jobId: string, s: ReportSummary) => ({ ...s, jobId });

/** 작업 기록의 요약 — 보여 줄 결과의 것이고 지금 기준 판일 때만 */
export function jobReportSummary(job: { report?: unknown; shownJobId: string | null } | null): ReportSummary | null {
  if (!job?.shownJobId || !job.report || (job.report as { jobId?: unknown }).jobId !== job.shownJobId) return null;
  const s = readReportSummary(job.report);
  return s && s.criteria === REPORT_CRITERIA ? s : null;
}

/** 목록 줄의 꼬리표 — '브레이크 · 고칠 점' · '좋아요' · '판정 못 함' */
export function summaryChip(s: ReportSummary | null): { text: string; tone: 'improve' | 'edge' | 'good' | 'muted' } | null {
  if (!s) return null;
  if (s.primary) return { text: `${s.primary.element}${s.primary.level === 'improve' ? '' : ' · 경계'}`, tone: s.primary.level };
  return s.judged ? { text: '좋아요', tone: 'good' } : { text: '판정 못 함', tone: 'muted' };
}

/** 만 나이(생년월일 'YYYY-MM-DD' · Date) — 모르면 null */
export function isYouth(birthDate: Date | null | undefined, now: Date): boolean {
  if (!birthDate) return false;
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = now.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birthDate.getUTCDate())) age--;
  return age < REPORT_YOUTH_AGE;
}

/** 꼬리표 상태 이름 */
export const REPORT_STATUS_TEXT: Record<ReportStatus, string> = {
  improve: '고칠 점',
  edge: '경계',
  fair: '보통',
  good: '좋아요',
  note: '참고',
  unsure: '판정 안 함',
};
