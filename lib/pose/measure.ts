import { LM, QUALITY_THRESHOLD, type PoseFrame, type PoseTrack } from '@/lib/pose/types';
import { frameAt } from '@/lib/pose/extract';

/**
 * 니업·착지·릴리스 프레임에서 폼 지표를 잰다.
 *
 * 전부 규칙 기반 계산이라 같은 영상·같은 구간이면 언제나 같은 값이 나온다.
 * 각도가 왜곡되지 않도록 정규화 좌표를 픽셀 좌표로 되돌려 계산하고,
 * 길이는 "코~발목 최대 수직 길이"로 만든 몸자(신장 픽셀)로 나눠
 * 촬영 거리와 무관하게 비교할 수 있는 값으로 만든다.
 *
 * 90도 측면 촬영을 전제로 한다(촬영 가이드). 각도는 절대 정답이 아니라
 * "같은 조건으로 찍은 지난 영상과의 변화"를 보는 용도다.
 */

export type MetricPhase = 'kneeUp' | 'footPlant' | 'release';

export type PitchMetric = {
  key: string;
  label: string;
  phase: MetricPhase;
  /** null이면 측정 불가 — reason에 이유가 들어간다 */
  value: number | null;
  display: string | null;
  reason?: '구간 없음' | '인식 흐림' | '기준 없음';
  confidence: number;
};

/** 코는 정수리보다 약 7% 아래에 있다 — 코~발목 길이를 신장으로 보정하는 값. */
const NOSE_TO_HEIGHT = 0.93;

/**
 * 실제 투구의 스트라이드는 신장의 60%를 넘는 게 보통이다. 측정값이 이보다
 * 한참 작으면 90도 측면이 아닌 각도에서 찍혀 원근으로 압축된 것이므로
 * "촬영 각도가 잘못됐다"는 경고의 기준으로 쓴다.
 * (실영상 대조: 측면 영상 79% vs 정면·후면 영상 3~37%)
 */
export const MIN_PLAUSIBLE_STRIDE_PCT = 45;
/** 릴리스 손목은 모션 블러가 흔해 기준을 낮춘다 (detect와 동일). */
const WRIST_VIS_OK = 0.35;

type Px = { x: number; y: number; v: number };

function px(frame: PoseFrame, idx: number, w: number, h: number): Px | null {
  const p = frame.landmarks[idx];
  if (!p) return null;
  return { x: p.x * w, y: p.y * h, v: p.visibility };
}

function mid(a: Px, b: Px): Px {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) };
}

/** b를 꼭짓점으로 하는 각도 (0~180도) */
function angleAt(a: Px, b: Px, c: Px): number | null {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const m = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (m === 0) return null;
  const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / m));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * 몸자 — 영상 전체에서 가장 꼿꼿이 선 순간의 코~발목 수직 길이로
 * 신장 픽셀을 추정한다. 전신이 안 나온 영상이면 null.
 */
function estimateHeightPx(track: PoseTrack): number | null {
  const w = track.videoWidth;
  const h = track.videoHeight;
  let best = 0;
  for (const f of track.frames) {
    const nose = px(f, LM.nose, w, h);
    if (!nose || nose.v < QUALITY_THRESHOLD) continue;
    for (const ankleIdx of [LM.leftAnkle, LM.rightAnkle]) {
      const ankle = px(f, ankleIdx, w, h);
      if (!ankle || ankle.v < QUALITY_THRESHOLD) continue;
      const extent = ankle.y - nose.y;
      if (extent > best) best = extent;
    }
  }
  return best > 0 ? best / NOSE_TO_HEIGHT : null;
}

export function measurePitchMetrics(
  track: PoseTrack,
  times: Record<MetricPhase, number | null>,
  side: 'left' | 'right',
  direction: 1 | -1,
  heightCm?: number | null
): PitchMetric[] {
  const w = track.videoWidth;
  const h = track.videoHeight;

  const leadHip = side === 'right' ? LM.leftHip : LM.rightHip;
  const leadKnee = side === 'right' ? LM.leftKnee : LM.rightKnee;
  const leadAnkle = side === 'right' ? LM.leftAnkle : LM.rightAnkle;
  const rearAnkle = side === 'right' ? LM.rightAnkle : LM.leftAnkle;
  const throwShoulder = side === 'right' ? LM.rightShoulder : LM.leftShoulder;
  const throwWrist = side === 'right' ? LM.rightWrist : LM.leftWrist;

  const heightPx = estimateHeightPx(track);
  const cmPerPx = heightPx && heightCm ? heightCm / heightPx : null;

  const metrics: PitchMetric[] = [];

  /** 프레임과 관절들을 확인하고 통과하면 계산을 실행하는 공통 틀 */
  function add(
    key: string,
    label: string,
    phase: MetricPhase,
    joints: { idx: number; minVis: number }[],
    compute: (pts: Px[], frame: PoseFrame) => { value: number; display: string } | null
  ) {
    const t = times[phase];
    if (t == null) {
      metrics.push({ key, label, phase, value: null, display: null, reason: '구간 없음', confidence: 0 });
      return;
    }
    const frame = frameAt(track, t);
    if (!frame) {
      metrics.push({ key, label, phase, value: null, display: null, reason: '구간 없음', confidence: 0 });
      return;
    }
    const pts: Px[] = [];
    let confidence = 1;
    for (const { idx, minVis } of joints) {
      const p = px(frame, idx, w, h);
      if (!p || p.v < minVis) {
        metrics.push({ key, label, phase, value: null, display: null, reason: '인식 흐림', confidence: p?.v ?? 0 });
        return;
      }
      confidence = Math.min(confidence, p.v);
      pts.push(p);
    }
    const result = compute(pts, frame);
    if (!result) {
      metrics.push({ key, label, phase, value: null, display: null, reason: '기준 없음', confidence });
      return;
    }
    metrics.push({ key, label, phase, ...result, confidence });
  }

  const vis = QUALITY_THRESHOLD;

  // 1) 니업 — 무릎 최고 높이 (골반 기준)
  add(
    'kneeLift',
    '무릎 높이',
    'kneeUp',
    [
      { idx: LM.leftHip, minVis: vis },
      { idx: LM.rightHip, minVis: vis },
      { idx: leadKnee, minVis: vis },
    ],
    ([lh, rh, knee]) => {
      if (!heightPx) return null;
      const hipC = mid(lh, rh);
      const liftPx = hipC.y - knee.y; // 양수 = 무릎이 골반보다 위
      const pct = (liftPx / heightPx) * 100;
      const where = pct >= 0 ? '골반 위' : '골반 아래';
      const amount = cmPerPx
        ? `${Math.abs(Math.round(liftPx * cmPerPx))}㎝`
        : `신장의 ${Math.abs(Math.round(pct))}%`;
      return { value: Math.round(pct * 10) / 10, display: `${where} ${amount}` };
    }
  );

  // 2) 착지 — 스트라이드 길이
  add(
    'stride',
    '스트라이드',
    'footPlant',
    [
      { idx: leadAnkle, minVis: vis },
      { idx: rearAnkle, minVis: vis },
    ],
    ([lead, rear]) => {
      if (!heightPx) return null;
      const dist = Math.hypot(lead.x - rear.x, lead.y - rear.y);
      const pct = Math.round((dist / heightPx) * 100);
      const cm = cmPerPx ? ` · 약 ${Math.round(dist * cmPerPx)}㎝` : '';
      return { value: pct, display: `신장의 ${pct}%${cm}` };
    }
  );

  // 3) 착지 — 앞무릎 각도 (곧게 펴면 180도)
  add(
    'plantKnee',
    '앞무릎 각도',
    'footPlant',
    [
      { idx: leadHip, minVis: vis },
      { idx: leadKnee, minVis: vis },
      { idx: leadAnkle, minVis: vis },
    ],
    ([hip, knee, ankle]) => {
      const deg = angleAt(hip, knee, ankle);
      if (deg == null) return null;
      return { value: Math.round(deg), display: `${Math.round(deg)}°` };
    }
  );

  // 4·5) 몸통 기울기 (수직 기준, 홈 쪽이 +)
  const trunkTilt = (phase: MetricPhase, key: string, label: string) =>
    add(
      key,
      label,
      phase,
      [
        { idx: LM.leftShoulder, minVis: vis },
        { idx: LM.rightShoulder, minVis: vis },
        { idx: LM.leftHip, minVis: vis },
        { idx: LM.rightHip, minVis: vis },
      ],
      ([ls, rs, lh, rh]) => {
        const shoulderC = mid(ls, rs);
        const hipC = mid(lh, rh);
        const forward = (shoulderC.x - hipC.x) * direction;
        const up = hipC.y - shoulderC.y;
        if (up === 0 && forward === 0) return null;
        const deg = (Math.atan2(forward, up) * 180) / Math.PI;
        const label2 = deg >= 0 ? '앞으로' : '뒤로';
        return { value: Math.round(deg), display: `${label2} ${Math.abs(Math.round(deg))}°` };
      }
    );
  trunkTilt('footPlant', 'plantTrunk', '몸통 기울기');
  trunkTilt('release', 'releaseTrunk', '몸통 기울기');

  // 6) 릴리스 — 팔 슬롯 (수평 0도, 완전 오버핸드 90도)
  add(
    'armSlot',
    '팔 슬롯',
    'release',
    [
      { idx: throwShoulder, minVis: vis },
      { idx: throwWrist, minVis: WRIST_VIS_OK },
    ],
    ([shoulder, wrist]) => {
      const forward = (wrist.x - shoulder.x) * direction;
      const up = shoulder.y - wrist.y;
      if (forward === 0 && up === 0) return null;
      const deg = (Math.atan2(up, Math.abs(forward)) * 180) / Math.PI;
      return { value: Math.round(deg), display: `수평 대비 ${Math.round(deg)}°` };
    }
  );

  // 7) 릴리스 — 앞무릎 각도 (펴면서 버텨주는지)
  add(
    'releaseKnee',
    '앞무릎 각도',
    'release',
    [
      { idx: leadHip, minVis: vis },
      { idx: leadKnee, minVis: vis },
      { idx: leadAnkle, minVis: vis },
    ],
    ([hip, knee, ankle]) => {
      const deg = angleAt(hip, knee, ankle);
      if (deg == null) return null;
      return { value: Math.round(deg), display: `${Math.round(deg)}°` };
    }
  );

  return metrics;
}
