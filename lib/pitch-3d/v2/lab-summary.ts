import { mechanicsElement } from '@/lib/mechanics/elements';
import type { DrillPick } from '@/lib/mechanics/drills';
import type { Metric, MetricKey } from '@/lib/pitch-3d/metrics';
import {
  isV2JobActive,
  plantFrame,
  shownEvents,
  v2WaitingText,
  type Pitch3dV2Job,
  type Pitch3dV2Ok,
} from './contract';
import { mechChecks } from './mech-checks';
import { judgeMechanics, type MechStatus, type MechVerdict } from './mech-judge';

/**
 * 3D 동작 분석 결과 화면의 숫자 · 메카닉 점검 줄(순수) — 웹 결과 화면(app/(app)/videos/lab/[id]/lab-detail.tsx · mech-card.tsx)과
 * 아이폰 앱 결과 화면(native/src/app/lab/[id].tsx, 서버 app/actions/pitch-lab.ts loadAppLabDetail)이 같이 쓴다. 이름 · 차례 · '그 순간'을
 * 한 곳에 두어 두 화면이 어긋나지 않게.
 */

export const METRIC_LABELS: Record<MetricKey, string> = {
  trunkForwardTilt: '몸통 앞 기울기 · 릴리스',
  trunkLateralTilt: '몸통 옆 기울기 · 릴리스',
  separationMax: '골반-어깨 꼬임 최대',
  separationAtPlant: '골반-어깨 꼬임 · 착지',
  leadKneeAtPlant: '앞 무릎 굽힘 · 착지',
  leadKneeAtRelease: '앞 무릎 굽힘 · 릴리스',
  strideLength: '보폭(키 대비)',
  strideOffset: '디딤 방향(+ 열림)',
  shoulderAbduction: '팔 높이 · 어깨 벌림',
  maxExternalRotation: '어깨 외회전 최대',
  plantToRelease: '착지 → 릴리스',
};

/**
 * 숫자 칸에 보이는 것 — 메카닉 점검이 판정에 쓰는 것(상하체 분리 · 앞다리 버티기의 앞무릎)과 보폭 · 디딤 방향(2026-10-14 김민: "숫자에 잡다한 게
 * 많다, 분석에 쓰는 것만"). 나머지 지표는 결과에 그대로 있다(인형 이름표 · 시험이 읽음).
 */
export const MAIN_METRICS: MetricKey[] = [
  'separationMax',
  'leadKneeAtPlant',
  'leadKneeAtRelease',
  'strideLength',
  'strideOffset',
];

/** 지표 → 보여 줄 순간 */
export const METRIC_MOMENT: Record<MetricKey, 'footPlant' | 'release'> = {
  trunkForwardTilt: 'release',
  trunkLateralTilt: 'release',
  separationMax: 'footPlant',
  separationAtPlant: 'footPlant',
  leadKneeAtPlant: 'footPlant',
  leadKneeAtRelease: 'release',
  strideLength: 'footPlant',
  strideOffset: 'footPlant',
  shoulderAbduction: 'release',
  maxExternalRotation: 'release',
  plantToRelease: 'release',
};

export const metricUnit = (m: Pick<Metric, 'unit'>): '°' | '%' | 'ms' =>
  m.unit === 'deg' ? '°' : m.unit === 'pct' ? '%' : 'ms';

export type LabMetricRow = {
  key: MetricKey;
  label: string;
  value: number;
  pm: number;
  unit: '°' | '%' | 'ms';
  experimental: boolean;
  check: boolean;
  /** 누르면 갈 장면 */
  frame: number;
};

/** 숫자 칸 줄(MAIN_METRICS 차례, 결과에 없는 지표는 뺀다) */
export function metricRows(result: Pitch3dV2Ok): LabMetricRow[] {
  const ev = shownEvents(result.events);
  return MAIN_METRICS.flatMap((k) => {
    const m = result.metrics.find((x) => x.key === k);
    if (!m) return [];
    return [
      {
        key: k,
        label: METRIC_LABELS[k],
        value: m.value,
        pm: m.pm,
        unit: metricUnit(m),
        experimental: m.experimental === true,
        check: m.check === true,
        frame: ev[METRIC_MOMENT[k]],
      },
    ];
  });
}

export const MECH_STATUS_TEXT: Record<MechStatus, string> = {
  improve: '고칠 점',
  fair: '보통',
  good: '좋아요',
  unsure: '판정 안 함',
};
/** 고칠 점이 먼저 */
const MECH_ORDER: MechStatus[] = ['improve', 'fair', 'good', 'unsure'];

export type LabMechItem = MechVerdict & {
  /** '그 순간 보기'가 갈 장면(없으면 단추 없음) */
  frame: number | null;
};

/** 메카닉 점검 — 화면에 내는 판정만, 고칠 점이 먼저. 한 구만 봤으면 tentative */
export function mechSummary(
  result: Pitch3dV2Ok,
  heightCm: number | null
): { tentative: boolean; items: LabMechItem[] } {
  const m = mechChecks(result, heightCm);
  const judgement = judgeMechanics([m], heightCm);
  const frames: Record<MechVerdict['key'], number | null> = {
    drift: result.events.kneeUp,
    separation: m.separation.frame,
    trunkTiming: m.separation.trunkHalfFrame,
    trunkAtPlant: plantFrame(result.events),
    block: result.events.release,
    pelvisLevel: plantFrame(result.events),
  };
  return {
    tentative: judgement.tentative,
    items: judgement.items
      .filter((i) => i.shown)
      .sort((a, b) => MECH_ORDER.indexOf(a.status) - MECH_ORDER.indexOf(b.status))
      .map((i) => ({ ...i, frame: frames[i.key] })),
  };
}

export type DrillPicks = Record<string, { count: number; items: DrillPick[] }>;

/** 메카닉 점검 줄에 붙는 드릴(요소별 드릴 칸 키 · 쉬운 드릴 셋 · 전체 수) */
export function mechDrills(
  focus: string,
  picks: DrillPicks
): { elementKey: string | null; count: number; items: DrillPick[] } | null {
  const p = picks[focus];
  if (!p || p.items.length === 0) return null;
  return { elementKey: mechanicsElement(focus)?.key ?? null, count: p.count, items: p.items };
}

/**
 * 결과가 없을 때 3D 칸의 글(웹 V2EmptyWell 과 같은 말) — 앱은 분석 걸기를 웹에 맡겨, 걸 수 있는 때는 그쪽으로 보낸다(canStart).
 * 영상 탓 실패의 고칠 안내 · 촬영 안내는 웹 화면에서 본다.
 */
export function labWaitingText(
  job: Pitch3dV2Job | null,
  nowMs: number,
  hasVideos: boolean
): { title: string; line: string | null; active: boolean; canStart: boolean } {
  if (job && isV2JobActive(job, nowMs))
    return {
      title: v2WaitingText(job, nowMs),
      line: '화면을 떠나도 분석은 계속돼요. 돌아오면 이어서 보여요.',
      active: true,
      canStart: false,
    };
  if (job?.status === 'failed' && job.fail) return { title: job.fail.reason, line: null, active: false, canStart: true };
  if (!hasVideos) return { title: '옆 · 뒤 영상이 다 있어야 해요', line: null, active: false, canStart: false };
  return {
    title: '아직 3D 분석을 하지 않았어요',
    line: '아래 동의를 확인하고 분석을 걸면 1~2분 뒤 여기에 인형이 움직여요.',
    active: false,
    canStart: true,
  };
}

/** 분석 걸기 동의 글(핵심 5, 글자 그대로 — 바꾸면 처리방침 쪽과 맞춰야 한다). 웹 analysis-v2 · 앱 결과 화면이 같이 쓴다 */
export const CONSENT_TEXT =
  '선수(미성년이면 보호자)에게 영상을 해외 분석 서버(미국)로 보내는 동의를 받았어요.';

/** 카드 · 머리의 상태 표시(웹 V2StatusBadge · 앱 결과 화면) — 없으면 null */
export function labStatusLabel(
  job: Pitch3dV2Job | null,
  nowMs: number
): { text: string; tone: 'sky' | 'muted' | 'warn' } | null {
  if (!job) return null;
  if (isV2JobActive(job, nowMs)) return { text: '3D 분석 중', tone: 'sky' };
  if (job.status === 'done') return { text: '3D 결과 있음', tone: 'muted' };
  if (job.status === 'failed')
    return { text: job.fail?.code === 'timeout' ? '3D 시간 초과' : '3D 실패', tone: 'warn' };
  /* queued · running 인데 15분 지남 — 다음 물음이 timeout 으로 돌린다 */
  return { text: '3D 시간 초과', tone: 'warn' };
}

const WHEN = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** 결과 화면 제목 — '10월 16일 14:05 투구'(올린 시각이 없으면 '투구') */
export const labTitle = (createdAt: string | null | undefined): string =>
  createdAt ? `${WHEN.format(new Date(createdAt))} 투구` : '투구';

/**
 * 리포트 머리의 날짜 — 아이폰이 적은 녹화 시작 시각(src 'apple')이 있으면 '찍은 때', 없으면 '올린 때'(createdAt). 둘 다 없으면 null.
 * 제목(labTitle)은 늘 올린 시각이라, 리포트에서는 그 뜻을 붙여 보인다(2026-10-27 — 날짜가 무엇의 날짜인지 추정하게 두지 않는다).
 */
export function labWhenText(meta: { createdAt?: string | null; files?: Partial<Record<'side' | 'back', { at?: string; src?: string }>> } | null | undefined): string | null {
  const shot = (['side', 'back'] as const).map((v) => meta?.files?.[v]).find((f) => f?.src === 'apple' && f.at && Number.isFinite(Date.parse(f.at)));
  if (shot?.at) return `찍은 때 ${WHEN.format(new Date(shot.at))}`;
  return meta?.createdAt && Number.isFinite(Date.parse(meta.createdAt)) ? `올린 때 ${WHEN.format(new Date(meta.createdAt))}` : null;
}

/** 영상으로 본 던지는 손이 올릴 때 고른 손과 다르면 한 줄(같으면 null) */
export function labHandNote(resultHand: 'L' | 'R', metaHand: 'L' | 'R' | null | undefined): string | null {
  if (!metaHand || resultHand === metaHand) return null;
  const h = resultHand === 'L' ? '왼손' : '오른손';
  return `영상으로 보면 ${h} 투수라 ${h}으로 분석했어요.`;
}
