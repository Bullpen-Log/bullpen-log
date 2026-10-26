/**
 * 투구 진단 리포트(무료 1구) — 3D 결과 하나로 여섯 요소의 상태 · 주 문제 · 처방 한 장을 셈한다(순수, 웹 · 앱 · 서버가 같이 쓴다).
 *
 * 설계 docs/designs/pitch-3d-report.md — 기준 3-5절(상태 네 칸 · 평지), 진단 고르기 4절, 화면 5-4절, 처방 6-1 · 6-2절.
 * 값은 mechChecks(lib/pitch-3d/v2/mech-checks.ts), 기준은 드라이브라인 공개 자료를 우리 식으로 다시 센 것(scripts/pitch-lab/obp/elements.py,
 * 마운드 · 100명 402구), 엔진 오차는 마커 15구(scripts/pitch-lab/markers/selfcal/element_score.py, 10-15 엔진). 문턱 여유는 2 × σ(1구).
 *
 * 등급(3-1절): 지금은 스로잉만 B(참고), 나머지 다섯은 A(평가 · 개선 드릴 — 아래 2026-10-26 줄). A 후보(A?)는 평가 · 처방을 안 하는 칸으로 남겨 둔다.
 * (2026-10-21 에는 드리프트만 A 였다 — 실험실 샘플 브레이크 '고칠 점' 넷이 옛 엔진 앞다리 탓으로 보였는데, 10-16 고침 뒤 겹쳐 보기로 실제 동작으로 확인.)
 * 2026-10-26: 검증 수준·영상 신뢰도·기준상 수치 위치를 분리하고 A?와 B는 자동 처방에서 제외한다.
 * 결론은 확인한 지표의 범위만 설명하고 평가·참고·미판정 개수를 함께 표시한다.
 * 2026-10-26(표시만, 판정 · 처방 · 기준 판 그대로): 참고 지표는 수치를 읽은 관찰을 주 설명으로, 검증 · 적용 조건 제한은 띠 밑 한 줄로.
 * 확인하지 못한 칸은 안 보인 부위 · 구간이나 계산 못 한 까닭을 말한다. 요약은 '수치 확인 m/6 · 평가 가능 n/6'(두 축, 합이 아니다).
 * 2026-10-26(김민 — "큰 오차만 아니면 평가 · 처방까지"): 드롭 · 상하체 분리 · 브레이크 · 몸통 회전을 A 로. 넷 다 '엔진 오차 × 2 < 정상 폭'(3-1절 조건 3)을
 * 넉넉히 넘고, 고칠 점 문턱이 이미 아래 10% − 2σ 라 오차로 잘못 짚는 몫은 지표마다 약 2%. 다른 투수 마커(조건 1 · 2)는 아직 — 드리프트도 같다.
 * 처방은 3주 프로그램이 아니라 한 번 보는 '개선 드릴'(요소마다 기초 → 연결 → 통합 하나씩) — 새로 3주 처방을 시작하지 않는다(lib/mechanics/focus-load.ts).
 */
import { REPORT_CRITERIA, RX_START_STAGE } from '@/lib/pitch-3d/v2/report-policy';
import { DRILL_STAGE_NAMES, type FOCUS_POINTS } from '@/lib/exercise-meta';
import type { MechanicsDrillView } from '@/lib/mechanics/drills';
import { mechanicsElement } from '@/lib/mechanics/elements';
import { doseOf, doseText } from '@/lib/mechanics/program';
import { prescribedTitles } from '@/lib/mechanics/prescriptions';
import { plantFrame, type Pitch3dV2Ok } from '@/lib/pitch-3d/v2/contract';
import { mechChecks, DROP_RISE_MAX, type MechChecks } from '@/lib/pitch-3d/v2/mech-checks';
import { BLOCK_IMPLAUSIBLE_SINK_DEG, DRIFT_GOOD, DRIFT_LOW, MECH_CONF_MIN, TRUNK_PLANT_NORM } from '@/lib/pitch-3d/v2/mech-judge';

type ElementName = (typeof FOCUS_POINTS)[number];
type DrillStage = (typeof DRILL_STAGE_NAMES)[number];

/** 기준 판 — 문턱 · 기준표 · 글을 바꾸면 올린다(리포트 요약이 옛 판이면 다시 셈) */
export { REPORT_CRITERIA };
/**
 * 이 확신(0~100, 그 지표가 쓴 관절 · 장면 평균) 밑이면 판정하지 않는다 — 지금 점검 카드와 같은 30(mech-judge MECH_CONF_MIN).
 * 설계 3-2절은 한 구라 45 로 올리자 했지만, 실험실 실제 샘플 8개의 확신이 25~57 이라 45 면 8개 중 6개가 '판정 못 함'이 됐다(2026-10-21).
 * 한 구의 큰 오류는 확신 대신 엔진 오류값 거르기로 막는다(브레이크는 값을 정하는 두 장면의 확신 · 사람 무릎이 못 내는 크기 — mech-judge
 * BLOCK_IMPLAUSIBLE_SINK_DEG). 확신이 없는 옛 결과는 수치만 참고하고 자동 판정하지 않는다.
 */
export const REPORT_CONF_MIN = MECH_CONF_MIN;
/** 성장기(만 16세 미만, 트레이닝과 같은 선) — 크기 지표는 참고로만(4절 4번) */
export const REPORT_YOUTH_AGE = 16;

export type ReportStatus = 'improve' | 'edge' | 'fair' | 'good' | 'note' | 'unsure';
export type FaultKey =
  'drift.stuck' | 'drop.float' | 'drop.shallow' | 'sep.openAtPlant' | 'block.collapse' | 'block.soft' | 'trunk.upright' | 'arm.late';
type Grade = 'A' | 'A?' | 'B';
type Assessment = 'improve' | 'edge' | 'fair' | 'good';
export type ReportMeasurement = {
  confidence: number | null;
  quality: 'sufficient' | 'low' | 'missing' | 'invalid' | 'unavailable';
  validation: 'supported' | 'provisional' | 'reference';
  applicability: 'supported' | 'flat' | 'youth';
};
export type ReportCoverage = { evaluated: number; reference: number; unavailable: number; total: number };

/** 등급(3-1절) — 'A?' = A 후보(평가 · 처방 안 함, 지금은 없음). B 는 참고만(스로잉 — 정답 자료가 같은 2D 라 검증이 안 된다) */
export const ELEMENT_GRADE: Record<ElementName, Grade> = {
  드리프트: 'A',
  드롭: 'A',
  '상하체 분리': 'A',
  브레이크: 'A',
  '몸통 회전': 'A',
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
  /** 수치의 기준상 위치. 측정 신뢰도와 처방 단계로 사용하지 않는다. */
  assessment: Assessment | null;
  measurement: ReportMeasurement;
  prescriptionEligible: boolean;
  metricNote: string | null;
  /** 경계 · 고칠 점일 때 문제 종류(6-1절) */
  fault: FaultKey | null;
  /** 참고 · 판정 안 함의 까닭 */
  why: 'validation' | 'confidenceMissing' | 'gradeB' | 'flat' | 'youth' | 'lowConf' | 'implausible' | 'notMeasured' | null;
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

/** 개선 드릴 한 장 — 요소마다 기초 → 연결 → 통합 하나씩(한 번 보는 목록, 옛 3주 처방과 같은 모양이라 진행 중인 처방도 그대로 읽힌다) */
export type ElementRx = {
  element: ElementName;
  key: string;
  fault: FaultKey;
  level: 'improve' | 'edge';
  /** 단계마다 드릴 수 — 지금은 늘 1(옛 3주 처방은 고칠 점 2) */
  slots: 1 | 2;
  cue: string;
  /** 단계별 드릴 — 쉬운 것부터(week 는 옛 3주 처방과 같은 칸 이름) */
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
  coverage: ReportCoverage;
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
  /** 경계 이상 요소마다 개선 드릴(흐름 차례 · 많아야 2장) */
  rx: ElementRx[];
  /** 경계 이상인데 이번 처방에 못 넣은 요소 — 다음 차례 */
  later: ElementName[];
};

/** 목록 · 작업 기록에 남기는 요약(job.json) — 목록이 결과 파일을 다시 읽지 않게 */
export type ReportSummary = {
  v: 1;
  criteria: string;
  primary: { element: ElementName; level: 'improve' | 'edge' } | null;
  /** 경계 이상인 요소 모두(흐름 차례) — 메카닉 요소 탭의 점(처방 없이 리포트만 받은 사람도) */
  bad: { element: ElementName; level: 'improve' | 'edge' }[];
  /** 판정한 요소가 하나라도 있나 */
  judged: boolean;
  coverage?: ReportCoverage;
};

export type ReportContext = {
  heightCm: number | null;
  ground: 'mound' | 'flat';
  youth: boolean;
  /** 처방 드릴(없으면 처방 칸 없이 요약만) */
  drills?: ReportDrill[] | null;
};

/* ───────────────────────────── 글 ───────────────────────────── */

/**
 * 참고 지표의 제한 — 띠 밑 한 줄(foot)로 내려 보인다. 동작이나 촬영의 문제가 아니라 기준 · 검증 범위 밖이라는 뜻.
 * 주 설명(line)은 그 수치를 그대로 읽은 관찰 문장(OBS)이다(2026-10-26 — 참고 다섯 칸이 같은 검증 안내만 보여 얻는 게 없었다).
 */
const VALIDATING = '측정 정확도를 검증하는 지표라 평가와 자동 처방에는 쓰지 않아요. 동작이나 촬영에 문제가 있다는 뜻은 아니에요.';
const NOTE_LIMIT: Record<'validation' | 'gradeB' | 'flat' | 'youth', string> = {
  validation: VALIDATING,
  gradeB: VALIDATING,
  flat: '기준이 마운드 투구라 평지 영상은 평가하지 않고 수치만 보여 줘요.',
  youth: '성장기는 크기보다 순서를 먼저 봐서 이 수치로 교정 필요를 정하지 않아요.',
};
/** 확인하지 못한 까닭 — 그 지표가 쓴 관절 · 장면(mech-checks confOf)이 잘 안 보였다 */
const HARD_TO_SEE: Record<ElementName, string> = {
  드리프트: '첫 장면과 니업 때 골반 · 축발이',
  드롭: '니업과 착지 때 골반 · 다리가',
  '상하체 분리': '착지에서 릴리스까지 두 어깨가',
  브레이크: '착지에서 릴리스까지 앞다리가',
  '몸통 회전': '릴리스 때 어깨 · 골반이',
  스로잉: '착지 때 던지는 팔이',
};
function unsureLine(why: NonNullable<ReportItem['why']>, name: ElementName, kneeUpFound: boolean): string {
  if (why === 'implausible') return '계산값이 정상 범위를 벗어나 수치를 보여 주지 않아요. 분석 확인이 필요해요.';
  if (why === 'confidenceMissing') return '이 결과에는 측정 신뢰도 정보가 없어 평가하지 않았어요. 다시 분석하면 확인할 수 있어요.';
  if (why === 'notMeasured')
    /* 드롭은 니업이 있어도 두 발 사이 기준선을 못 잡으면 못 잰다(mech-checks drop) — 니업을 못 찾았다고 단정하지 않는다 */
    return kneeUpFound
      ? '니업과 착지 장면으로 높이 기준선을 잡지 못해 계산하지 못했어요.'
      : '다리를 가장 높이 든 장면(니업)을 찾지 못해 이 지표는 계산하지 못했어요. 다리를 드는 동작부터 영상에 담기면 확인할 수 있어요.';
  return `${HARD_TO_SEE[name]} 영상에서 잘 보이지 않아 판정하지 않았어요. 그 구간이 두 영상에 잘 보이게 다시 찍으면 확인할 수 있어요.`;
}

/** 관찰 문장 — 숫자 · 부호 그대로(평가 말 '잘 · 충분히 · 덜 · 늦음 · 무너짐'은 쓰지 않는다). 값 칸과 같은 반올림 */
const r0 = (v: number) => Math.round(v);
const OBS = {
  drift: (ratio: number, cm: number | null) => {
    const n = cm != null ? r0(cm) : r0(ratio * 100);
    const amount = cm != null ? `${Math.abs(n)}cm` : `키의 ${Math.abs(n)}%`;
    if (n === 0) return '다리를 가장 높이 들었을 때 골반이 축발 바로 위에 있어요.';
    return n > 0
      ? `다리를 가장 높이 들었을 때 골반이 축발보다 홈 쪽으로 ${amount} 앞에 있어요.`
      : `다리를 가장 높이 들었을 때 골반이 축발보다 2루 쪽으로 ${amount} 뒤에 있어요.`;
  },
  drop: (drop: number, rise: number) => {
    const n = r0(drop * 100);
    const main =
      n > 0
        ? `니업에서 착지까지 골반 높이가 다리 길이의 ${n}%만큼 내려가요.`
        : n < 0
          ? `착지 때 골반이 니업 때보다 다리 길이의 ${-n}%만큼 높아요.`
          : '니업에서 착지까지 골반 높이가 거의 그대로예요.';
    return rise > DROP_RISE_MAX ? `${main} 그 사이 한때 니업보다 다리 길이의 ${r0(rise * 100)}%만큼 올라갔어요.` : main;
  },
  sep: (openDeg: number) => {
    const n = r0(Math.abs(openDeg));
    return n === 0
      ? '앞발이 닿을 때 어깨선이 디딤 방향과 나란해요.'
      : `앞발이 닿을 때 어깨선은 디딤 방향을 기준으로 ${n}° ${openDeg > 0 ? '열려' : '닫혀'} 있어요.`;
  },
  collapse: (deg: number) =>
    r0(deg) > 0 ? `착지 뒤 앞무릎이 착지 때보다 최대 ${r0(deg)}° 더 굽어져요.` : '착지 뒤 앞무릎이 착지 때보다 더 굽지 않아요.',
  extension: (deg: number) => {
    const n = r0(Math.abs(deg));
    return n === 0
      ? '착지에서 공을 놓을 때까지 앞무릎 각도가 거의 그대로예요.'
      : deg > 0
        ? `착지에서 공을 놓을 때까지 앞무릎이 ${n}° 펴져요.`
        : `착지에서 공을 놓을 때까지 앞무릎이 ${n}° 더 굽어져요.`;
  },
  trunk: (deg: number) => {
    const n = r0(deg);
    return n > 0
      ? `공을 놓을 때 몸통이 앞으로 ${n}° 기울어져 있어요.`
      : n < 0
        ? `공을 놓을 때 몸통이 뒤로 ${-n}° 젖혀져 있어요.`
        : '공을 놓을 때 몸통이 앞뒤로 거의 기울지 않았어요.';
  },
  arm: (deg: number) => `앞발이 닿을 때 던지는 팔의 어깨 벌림은 ${r0(deg)}°예요.`,
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

const okConf = (c: number | null | undefined) => c == null || (Number.isFinite(c) && c >= REPORT_CONF_MIN && c <= 100);
const fmtDeg = (v: number) => `${Math.round(v)}°`;
const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

type Draft = Omit<ReportItem, 'element' | 'key' | 'assessment' | 'measurement' | 'prescriptionEligible' | 'metricNote'> & {
  /** 관찰 문장 — 참고 지표의 주 설명 */
  obs: string | null;
};

function judged(
  name: ElementName,
  fault: FaultKey,
  status: 'improve' | 'edge' | 'fair' | 'good',
  obs: string,
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
    obs,
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
  line: '',
  obs: null,
  value,
  valueLabel,
  foot: null,
  goal: null,
  gauge,
  frame,
});

/** 등급 B · 평지 · 성장기면 참고로(값 · 띠는 그대로 보이고 경계 · 고칠 점 · 처방은 없다) */
function capped(name: ElementName, d: Draft, why: ReportItem['why']): Draft {
  return { ...d, why: why ?? (ELEMENT_GRADE[name] === 'B' ? 'gradeB' : null) };
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
    out['드리프트'] = judged(
      '드리프트',
      'drift.stuck',
      bandOf(v, DRIFT_BAND),
      OBS.drift(v, m.drift.aheadAtKneeUpCm),
      value,
      '니업 때 골반이 축발보다 앞',
      { ...DRIFT_BAND, value: v },
      frames.kneeUp,
      goal
    );
  }

  /* 드롭 — '거의 안 가라앉음 · 뜸'은 어디서든 고칠 점, 그 밖은 마운드만(평지 · 성장기는 참고) */
  if (!m.drop) out['드롭'] = reference('notMeasured', null, null, null, null);
  else if (!okConf(m.drop.conf)) out['드롭'] = reference('lowConf', null, null, null, frames.plant);
  else {
    const v = m.drop.pelvisDrop;
    const gauge = { ...DROP_BAND, value: v };
    const label = '니업 → 착지 골반이 내려간 몫(다리 길이)';
    if (v < DROP_FLOAT_MAX || m.drop.rise > DROP_RISE_MAX)
      out['드롭'] = judged('드롭', 'drop.float', 'improve', OBS.drop(v, m.drop.rise), fmtPct(v), label, gauge, frames.plant, `${fmtPct(DROP_BAND.fairEnd)} 위`);
    else
      out['드롭'] = capped(
        '드롭',
        judged('드롭', 'drop.shallow', bandOf(v, DROP_BAND), OBS.drop(v, m.drop.rise), fmtPct(v), label, gauge, frames.plant, `${fmtPct(DROP_BAND.fairEnd)} 위`),
        flat ? 'flat' : ctx.youth ? 'youth' : null
      );
  }

  /* 상하체 분리 = 착지 때 상체 열림(순서 지표라 성장기도 판정) */
  {
    const v = m.separation.trunkOpenAtPlantDeg;
    if (!okConf(m.separation.trunkConf)) out['상하체 분리'] = reference('lowConf', null, null, null, frames.plant);
    else if (!Number.isFinite(v)) out['상하체 분리'] = reference('implausible', null, null, null, frames.plant);
    else {
      const b = sepBand(m.hand);
      const value = `${Math.round(Math.abs(v))}° ${v >= 0 ? '열림' : '닫힘'}`;
      out['상하체 분리'] = judged(
        '상하체 분리',
        'sep.openAtPlant',
        bandOf(v, b),
        OBS.sep(v),
        value,
        '착지 때 상체(어깨선)',
        { ...b, value: v },
        frames.plant,
        `${Math.round(Math.abs(b.edgeEnd))}° 닫힘보다 닫힘`
      );
    }
  }

  /* 브레이크 — 착지 뒤 더 굽음 · 무릎 펴짐 둘 중 나쁜 쪽 */
  {
    const bl = m.block;
    if (!okConf(bl.conf) || !okConf(bl.keyConf)) out['브레이크'] = reference('lowConf', null, null, null, frames.release);
    else if (
      ![bl.kneeCollapseDeg, bl.kneeExtensionDeg].every(Number.isFinite) ||
      bl.kneeCollapseDeg > BLOCK_IMPLAUSIBLE_SINK_DEG ||
      -bl.kneeExtensionDeg > BLOCK_IMPLAUSIBLE_SINK_DEG
    )
      out['브레이크'] = reference('implausible', null, null, null, frames.release);
    else {
      const sink = bandOf(bl.kneeCollapseDeg, SINK_BAND);
      const ext = bandOf(bl.kneeExtensionDeg, EXT_BAND);
      const useSink = RANK[sink] > RANK[ext] || (RANK[sink] === RANK[ext] && RANK[sink] >= RANK.edge);
      const why = ctx.youth ? 'youth' : null;
      out['브레이크'] = capped(
        '브레이크',
        useSink
          ? judged(
              '브레이크',
              'block.collapse',
              sink,
              OBS.collapse(bl.kneeCollapseDeg),
              fmtDeg(bl.kneeCollapseDeg),
              '착지 뒤 앞무릎이 더 굽은 각',
              { ...SINK_BAND, value: bl.kneeCollapseDeg },
              frames.release,
              `${Math.round(SINK_BAND.fairEnd)}° 밑`
            )
          : judged(
              '브레이크',
              'block.soft',
              ext,
              OBS.extension(bl.kneeExtensionDeg),
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
        judged(
          '몸통 회전',
          'trunk.upright',
          bandOf(t.forwardDeg, TRUNK_BAND),
          OBS.trunk(t.forwardDeg),
          fmtDeg(t.forwardDeg),
          '릴리스 때 몸통 앞 기울기',
          { ...TRUNK_BAND, value: t.forwardDeg },
          frames.release,
          `${Math.round(TRUNK_BAND.fairEnd)}° 위`
        ),
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
        judged(
          '스로잉',
          'arm.late',
          bandOf(a.abductionAtPlantDeg, ARM_BAND),
          OBS.arm(a.abductionAtPlantDeg),
          fmtDeg(a.abductionAtPlantDeg),
          '착지 때 어깨 벌림(90° = 팔꿈치가 어깨 높이)',
          { ...ARM_BAND, value: a.abductionAtPlantDeg },
          frames.plant,
          `${Math.round(ARM_BAND.fairEnd)}° 위`
        ),
        null
      );
  }

  const confidence: Record<ElementName, number | null | undefined> = {
    드리프트: m.drift?.conf,
    드롭: m.drop?.conf,
    '상하체 분리': m.separation.trunkConf,
    /* 두 핵심 장면 중 안 보인 곳이 있으면 그 확신으로 — 판정 안 함의 까닭('잘 안 보임')과 같은 숫자 */
    브레이크: m.block.conf != null && m.block.keyConf != null ? Math.min(m.block.conf, m.block.keyConf) : m.block.conf,
    '몸통 회전': m.trunkTilt.conf,
    스로잉: m.arm.conf,
  };
  return CHAIN.map((name) => {
    const { obs, ...d } = out[name];
    const conf = confidence[name];
    const validation: ReportMeasurement['validation'] =
      ELEMENT_GRADE[name] === 'A' ? 'supported' : ELEMENT_GRADE[name] === 'A?' ? 'provisional' : 'reference';
    const invalid =
      d.why === 'implausible' ||
      (d.gauge != null && !Number.isFinite(d.gauge.value)) ||
      (conf != null && (!Number.isFinite(conf) || conf < 0 || conf > 100));
    const quality: ReportMeasurement['quality'] = invalid
      ? 'invalid'
      : d.why === 'notMeasured'
        ? 'unavailable'
        : conf == null
          ? 'missing'
          : !okConf(conf)
            ? 'low'
            : 'sufficient';
    const applicability: ReportMeasurement['applicability'] =
      flat && (name === '드롭' || name === '몸통 회전')
        ? 'flat'
        : ctx.youth && ['드롭', '브레이크', '몸통 회전'].includes(name)
          ? 'youth'
          : 'supported';
    const assessment = quality === 'sufficient' && d.status !== 'note' && d.status !== 'unsure' ? d.status : null;
    const why: ReportItem['why'] =
      quality === 'invalid'
        ? 'implausible'
        : quality === 'unavailable'
          ? 'notMeasured'
          : quality === 'missing'
            ? 'confidenceMissing'
            : quality === 'low'
              ? 'lowConf'
              : applicability !== 'supported'
                ? applicability
                : validation === 'provisional'
                  ? 'validation'
                  : validation === 'reference'
                    ? 'gradeB'
                    : null;
    const status: ReportStatus = quality !== 'sufficient' ? 'unsure' : why ? 'note' : d.status;
    const prescriptionEligible =
      quality === 'sufficient' &&
      validation === 'supported' &&
      applicability === 'supported' &&
      (assessment === 'improve' || assessment === 'edge') &&
      d.fault != null;
    return {
      ...d,
      element: name,
      key: mechanicsElement(name)?.key ?? '',
      status,
      assessment,
      measurement: { confidence: conf != null && Number.isFinite(conf) ? conf : null, quality, validation, applicability },
      prescriptionEligible,
      fault: prescriptionEligible ? d.fault : null,
      why,
      /* 참고 = 수치를 읽은 관찰 + 띠 밑 제한, 확인 못 함 = 그 까닭, 평가 = 평가 말 */
      line:
        status === 'unsure' ? unsureLine(why!, name, frames.kneeUp != null) : status === 'note' ? (obs ?? d.line) : d.line,
      value: invalid ? null : d.value,
      gauge: invalid ? null : d.gauge,
      foot: status === 'note' ? NOTE_LIMIT[why as keyof typeof NOTE_LIMIT] : why ? null : d.foot,
      goal: prescriptionEligible ? d.goal : null,
      /* 지표 정의는 수치를 보인 칸에만 — 확인하지 못한 칸에 '각도를 확인해요'가 붙으면 잰 것처럼 읽힌다 */
      metricNote: status === 'unsure' ? null : (METRIC_NOTES[name] ?? null),
    };
  });
}

const METRIC_NOTES: Partial<Record<ElementName, string>> = {
  '상하체 분리': '착지 때 어깨선이 열린 각도를 확인해요. 상하체 분리 전체를 평가한 값은 아니에요.',
  '몸통 회전': '릴리스 때 몸통의 앞 기울기를 확인해요. 몸통 회전량이나 회전 속도를 평가한 값은 아니에요.',
  스로잉: '착지 때 어깨가 벌어진 각도를 확인해요. 팔의 전체 타이밍을 평가한 값은 아니에요.',
};

const HARD_TEXT: Record<Exclude<ReportMeasurement['quality'], 'sufficient'>, string> = {
  low: '확인 어려움 · 영상 신뢰도 부족',
  missing: '확인 어려움 · 신뢰도 정보 없음',
  invalid: '확인 어려움 · 계산값 확인 필요',
  unavailable: '확인 어려움 · 계산하지 못함',
};
export function measurementText(item: ReportItem): string {
  const m = item.measurement;
  if (!m) return '이전 판정 기준의 리포트예요. 다시 불러와 확인해 주세요.';
  if (m.quality !== 'sufficient') return HARD_TEXT[m.quality] ?? '확인 어려움';
  if (m.applicability === 'flat') return '수치 확인 · 평지 영상이라 참고';
  if (m.applicability === 'youth') return '수치 확인 · 성장기라 참고';
  return m.validation === 'supported' ? '수치 확인 · 평가 가능' : '수치 확인 · 지표 검증 중';
}

/**
 * 수치를 확인한 지표 = 신뢰도가 충분하고 유한한 값이 있는 것. 참고 · 평가 칸은 늘 그렇고(judgeElements), 확인 못 함은 아니라
 * 요약(coverage)만으로는 total − unavailable 과 같다 — 화면 · 목록이 같은 셈을 쓰게 여기 하나로.
 */
export const isMeasured = (i: ReportItem) =>
  i.measurement?.quality === 'sufficient' && i.value != null && i.gauge != null && Number.isFinite(i.gauge.value);
export const measuredCount = (c: ReportCoverage) => c.total - c.unavailable;

export function coverageOf(items: ReportItem[]): ReportCoverage {
  return {
    evaluated: items.filter((i) => i.status !== 'note' && i.status !== 'unsure').length,
    reference: items.filter((i) => i.status === 'note').length,
    unavailable: items.filter((i) => i.status === 'unsure').length,
    total: items.length,
  };
}
/** 확인 범위 — 측정(수치 확인)과 평가는 다른 축이라 따로 센다(합이 아니다) */
export const coverageText = (c: ReportCoverage | undefined) =>
  c
    ? `수치 확인 ${measuredCount(c)}/${c.total} · 평가 가능 ${c.evaluated}/${c.total}`
    : '이전 판정 기준의 리포트예요. 다시 불러와 확인해 주세요.';
export function prescriptionMessage(report: PitchReport): string {
  if (report.criteria !== REPORT_CRITERIA || !report.coverage)
    return '리포트 기준을 업데이트하고 있어요. 다시 불러온 뒤 드릴을 확인해 주세요.';
  if (report.rx.length === 0 && report.items.some((i) => i.prescriptionEligible))
    return '기초 단계 드릴을 찾지 못해 개선 드릴을 보여 드리지 못했어요. 요소별 드릴에서 찾아 주세요.';
  const c = report.coverage;
  const lines = [
    c.evaluated
      ? `평가한 ${c.evaluated}개 지표에 고칠 점이 없어 따로 권할 드릴이 없어요.`
      : '평가할 수 있는 지표가 없어 드릴을 권하지 않아요.',
    c.reference ? '참고 지표의 수치로는 드릴을 권하지 않아요.' : null,
    c.unavailable ? '확인하지 못한 항목은 투구의 흐름에서 까닭을 볼 수 있어요.' : null,
    c.evaluated === c.total ? '이 결과가 투구 동작 전체를 평가한 것은 아니에요.' : null,
  ];
  return lines.filter(Boolean).join(' ');
}

/* ───────────────────────────── 처방 ───────────────────────────── */

const isBad = (i: ReportItem): i is ReportItem & { status: 'improve' | 'edge'; fault: FaultKey } =>
  i.prescriptionEligible && i.fault != null && (i.status === 'improve' || i.status === 'edge');

/** 주 문제 · 다음 문제 · 다음 차례(4절 · 6-2절) — 고칠 점이 있으면 그중 가장 앞, 없으면 경계 중 가장 앞 */
export function pickProblems(items: ReportItem[]): { primary: ReportItem | null; next: ReportItem | null; later: ReportItem[] } {
  const bad = items.filter(isBad);
  const primary = bad.find((i) => i.status === 'improve') ?? bad[0] ?? null;
  const rest = bad.filter((i) => i !== primary);
  return { primary, next: rest[0] ?? null, later: rest.slice(1) };
}

/** 문제·단계 표에 명시된 드릴만 사용한다. 같은 요소라는 이유로 다른 동작을 자동 대입하지 않는다. */
function prescribed(drills: ReportDrill[], item: ReportItem & { fault: FaultKey }, stage: DrillStage, n: number) {
  const byTitle = new Map(drills.map((d) => [d.title, d]));
  const picked = prescribedTitles(item.fault, stage, n).flatMap((t) => {
    const d = byTitle.get(t);
    return d ? [{ title: d.title, thumbUrl: d.thumbUrl, dose: doseText(doseOf(d.category, stage)) }] : [];
  });
  return picked;
}

function rxOf(item: ReportItem, drills: ReportDrill[], slots: 1 | 2): ElementRx | null {
  if (!item.prescriptionEligible || !item.fault || (item.status !== 'improve' && item.status !== 'edge')) return null;
  // 시작 단계는 판정의 심각도·신뢰도로 올리지 않는다. 검증된 수행 이력이 없으면 기초부터.
  const plan: { week: 1 | 2 | 3; label: string; stage: DrillStage }[] = [
    { week: 1, label: '1주', stage: RX_START_STAGE },
    { week: 2, label: '2주', stage: '연결' },
    { week: 3, label: '3주', stage: '통합' },
  ];
  const weeks = plan
    .map((w) => ({ ...w, drills: prescribed(drills, { ...item, fault: item.fault! }, w.stage, slots) }))
    .filter((w) => w.drills.length > 0);
  if (!weeks.some((w) => w.week === 1 && w.stage === RX_START_STAGE && w.drills.length === slots)) return null;
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
    ? [primary && rxOf(primary, drills, 1), next && rxOf(next, drills, 1)].filter(
        (x): x is ElementRx => x != null
      )
    : [];

  const coverage = coverageOf(items);
  const evaluated = items.filter((i) => i.status !== 'unsure' && i.status !== 'note');
  let headline: PitchReport['headline'];
  if (primary?.fault) {
    const improve = primary.status === 'improve';
    headline = {
      tone: improve ? 'improve' : 'edge',
      tag: `${primary.element} · ${improve ? '고칠 점' : '경계'}`,
      title: improve
        ? `${FAULT_TEXT[primary.fault]}\n여기부터 고쳐요.`
        : `확인한 ${primary.element} 지표가 경계에 있어요.\n기초 동작부터 확인해요.`,
      why: WHY_SHORT[primary.element],
      frame: primary.frame,
      moment: momentName(result, primary.frame),
    };
  } else if (evaluated.length > 0) {
    /* 평가한 것 · 참고로 수치만 본 것 · 확인 못 한 것을 섞지 않고 사실대로(참고를 '추가 확인 필요'로 묶지 않는다) */
    const { reference: refs, unavailable: hard } = coverage;
    const rest =
      refs && hard
        ? `${refs}개 지표는 수치를 참고로 볼 수 있고, ${hard}개는 확인하지 못했어요.`
        : refs
          ? `다른 ${refs}개 지표의 수치는 참고로 확인할 수 있어요.`
          : hard
            ? `다른 ${hard}개 지표는 확인하지 못했어요.`
            : null;
    headline = {
      tone: coverage.evaluated === coverage.total ? 'good' : 'unsure',
      tag: null,
      title:
        (evaluated.length === 1
          ? `${evaluated[0].element} 지표는 ${evaluated[0].status === 'good' ? '좋아요' : '보통이에요'}.`
          : `평가한 ${coverage.evaluated}개 지표에 고칠 점이 없어요.`) + (rest ? `\n${rest}` : ''),
      why: '이 결과는 확인한 지표의 평가예요. 투구 동작 전체에 대한 결론은 아니에요.',
      frame: result.events.release,
      moment: momentName(result, result.events.release),
    };
  } else {
    const lowConf = items.some((i) => i.why === 'lowConf');
    headline = {
      tone: 'unsure',
      tag: null,
      title: coverage.reference
        ? `${coverage.reference}개 지표의 수치를 참고로 확인할 수 있어요.` +
          (coverage.unavailable ? `\n${coverage.unavailable}개는 확인하지 못했어요.` : '')
        : '이 영상으로는 지표를 확인하지 못했어요.',
      why: coverage.reference
        ? '평가할 수 있는 지표는 없어요. 이 결과만으로 교정 운동을 정하지 않아요.'
        : lowConf
          ? '몸 전체가 두 영상에 잘 보이게 다시 찍으면 확인할 수 있어요. 항목마다 까닭을 볼 수 있어요.'
          : '항목마다 확인하지 못한 까닭을 볼 수 있어요.',
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
    coverage,
    items,
    primary: primary?.element ?? null,
    headline,
    rx,
    later: later.map((i) => i.element),
  };
}

export function reportSummary(report: PitchReport): ReportSummary {
  const p = report.primary ? report.items.find((i) => i.element === report.primary && isBad(i)) : null;
  return {
    v: 1,
    criteria: report.criteria,
    primary: p && (p.status === 'improve' || p.status === 'edge') ? { element: p.element, level: p.status } : null,
    bad: report.items.flatMap((i) => (isBad(i) ? [{ element: i.element, level: i.status }] : [])),
    judged: report.items.some((i) => i.status !== 'unsure' && i.status !== 'note'),
    coverage: coverageOf(report.items),
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
  const primary = p ? { element: p.element as ElementName, level: p.level as 'improve' | 'edge' } : null;
  /* bad 칸은 2026-10-22 에 더함 — 없는 옛 요약은 주 문제 하나로 */
  const bad = Array.isArray(r.bad)
    ? (r.bad as Record<string, unknown>[]).flatMap((b) =>
        b && CHAIN.includes(b.element as ElementName) && (b.level === 'improve' || b.level === 'edge')
          ? [{ element: b.element as ElementName, level: b.level as 'improve' | 'edge' }]
          : []
      )
    : primary
      ? [primary]
      : [];
  const c = r.coverage as ReportCoverage | undefined;
  const validCoverage =
    c &&
    [c.evaluated, c.reference, c.unavailable, c.total].every((n) => Number.isInteger(n) && n >= 0) &&
    c.total === CHAIN.length &&
    c.evaluated + c.reference + c.unavailable === c.total;
  return { v: 1, criteria: r.criteria, primary, bad, judged: r.judged, ...(validCoverage ? { coverage: c } : {}) };
}

/** 작업 기록(job.json)에 남기는 모양 — 결과 작업 번호와 함께 */
export const jobReport = (jobId: string, s: ReportSummary) => ({ ...s, jobId });

/** 작업 기록의 요약 — 보여 줄 결과의 것이고 지금 기준 판일 때만 */
export function jobReportSummary(job: { report?: unknown; shownJobId: string | null } | null): ReportSummary | null {
  if (!job?.shownJobId || !job.report || (job.report as { jobId?: unknown }).jobId !== job.shownJobId) return null;
  const s = readReportSummary(job.report);
  return s && s.criteria === REPORT_CRITERIA && s.coverage ? s : null;
}

/** 목록 줄의 꼬리표 — 주 문제 '브레이크' · '드리프트 · 경계', 없으면 확인 범위 '수치 6/6 · 평가 1/6'(참고를 좋음 · 문제로 세지 않는다) */
export function summaryChip(s: ReportSummary | null): { text: string; tone: 'improve' | 'edge' | 'good' | 'muted' } | null {
  if (!s) return null;
  if (s.primary) return { text: `${s.primary.element}${s.primary.level === 'improve' ? '' : ' · 경계'}`, tone: s.primary.level };
  if (!s.coverage) return { text: s.judged ? '확인 범위 보기' : '판정 못 함', tone: 'muted' };
  const measured = measuredCount(s.coverage);
  if (measured === 0) return { text: '확인 어려움', tone: 'muted' };
  return { text: `수치 ${measured}/${s.coverage.total} · 평가 ${s.coverage.evaluated}/${s.coverage.total}`, tone: 'muted' };
}

/** 이 리포트의 처방이 메카닉에서 진행 중이면 마친 세션 수 / 전체(메카닉 세션 P2 — MechanicsProgram.progress.focus) */
export type FocusProgress = { done: number; total: number; skill?: { label: string; finished: boolean } } | null;

export type RxAction = { kind: 'progress' | 'retake' | 'drills'; label: string; note: string };

/** 개선 드릴 카드의 맺음 한 줄 — 한 번 해서는 동작이 안 바뀐다 */
export const RX_PRACTICE_NOTE = '며칠에 걸쳐 몇 번 해 보고, 같은 자리에서 다시 찍으면 지난번과 숫자를 견줘 보여 드려요.';

/**
 * 개선 드릴 카드 맨 아래 단추(웹 · 앱 같은 판단) — 드릴 영상 보기(요소별 드릴). 2026-10-26 전에 시작한 3주 처방이 진행 중이면 진행 · 다시 찍기.
 * 새 3주 처방은 시작하지 않는다(lib/mechanics/focus-load.ts). 갈 주소는 화면마다(웹 · 앱 길이 달라서).
 */
export function rxAction(mine: boolean, focus: FocusProgress): RxAction {
  if (!mine) return { kind: 'drills', label: '드릴 영상 보기', note: '' };
  if (focus?.skill)
    return focus.skill.finished
      ? { kind: 'retake', label: '다시 찍어 리포트 받기', note: '자가 확인을 마쳤어요. 같은 자리에서 다시 찍어 측정값과 견줘요.' }
      : { kind: 'progress', label: `${focus.skill.label} 연습 중`, note: '메카닉에서 수행·다음 날 반응을 확인해요.' };
  if (focus && focus.done >= focus.total)
    return { kind: 'retake', label: '다시 찍어 리포트 받기', note: '처방을 마쳤어요. 같은 자리에서 다시 찍어 견줘요.' };
  if (focus) return { kind: 'progress', label: `처방 진행 중 ${focus.done} / ${focus.total}`, note: '메카닉 프로그램에서 이어서 해요.' };
  return { kind: 'drills', label: '드릴 영상 보기', note: RX_PRACTICE_NOTE };
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
  unsure: '확인 어려움',
};
