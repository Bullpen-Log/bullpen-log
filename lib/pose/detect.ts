import { LM, QUALITY_THRESHOLD, type PoseTrack } from '@/lib/pose/types';

/**
 * 관절 좌표 시계열에서 투구의 세 순간을 찾는다 — 니업(리드 무릎 최고점),
 * 착지(앞발 접지), 릴리스(공이 손을 떠나는 순간).
 *
 * 기준점은 릴리스다. 무릎을 드는 폼이든(정통) 들지 않는 폼이든
 * (야마모토식·슬라이드스텝·캐치볼) 팔은 반드시 앞으로 뻗기 때문에,
 * 릴리스를 먼저 찾고 거기서 거꾸로 착지 → 니업 순으로 되짚는다.
 *
 * 전부 규칙 기반이라 같은 영상이면 언제나 같은 결과가 나온다.
 * 좌표는 화면 비율 왜곡을 없애려고 픽셀로 되돌려 계산하고,
 * 거리 기준은 몸통 길이로 나눠 촬영 거리와 무관하게 만든다.
 */

export type PitchEvent = {
  /** 영상에서의 시각 (초) */
  t: number;
  /** 그 순간 해당 관절의 인식 신뢰도 (0~1) */
  confidence: number;
};

export type PitchEvents = {
  /**
   * 화면에 보여줄 좌/우투 표기. 뒤에서 찍은 영상은 인식 모델이 좌우 라벨을
   * 뒤집어 붙이므로 사용자가 고칠 수 있다. 표기만 바뀔 뿐 측정에는 쓰지 않는다.
   */
  throwingSide: 'left' | 'right';
  /**
   * 실제로 던진 팔로 판정된 손목 — 측정은 항상 이 값을 쓴다.
   * 좌우 라벨과 무관하게 "많이 움직인 손"이라 촬영 방향에 흔들리지 않는다.
   */
  wristSide: 'left' | 'right';
  /** 앞(리드)다리 — 릴리스 때 홈 쪽으로 나가 있는 다리 */
  leadSide: 'left' | 'right';
  /**
   * 옆(90도)에서 찍혀 자동 분석이 가능한 영상인지.
   * 화면 안쪽으로 던지는 각도에서는 좌우 좌표에 동작이 거의 담기지 않아
   * 어떤 구간도 신뢰할 수 없으므로 아예 검출하지 않는다.
   */
  sideViewOk: boolean;
  /** 화면 x축 기준 투구 진행 방향 (+1 = 오른쪽으로 던짐) */
  direction: 1 | -1;
  kneeUp: PitchEvent | null;
  footPlant: PitchEvent | null;
  release: PitchEvent | null;
};

const VIS_OK = QUALITY_THRESHOLD;
/** 릴리스 부근 손목은 모션 블러로 신뢰도가 낮게 나와 기준을 낮춘다. */
const WRIST_VIS_OK = 0.35;

/**
 * 릴리스 = 손목 전방 신전이 최댓값의 이 비율에 처음 닿는 순간.
 * 공은 팔이 완전히 펴지기 직전에 손을 떠나고 완전 신전은 팔로스루에서
 * 나오기 때문에, 최대 시점을 그대로 쓰면 릴리스가 늦게 잡힌다.
 * (실제 투구 영상에서 공이 손을 떠나는 프레임과 대조해 맞춘 값)
 */
const RELEASE_EXT_RATIO = 0.8;

/**
 * 착지 = 앞발이 스트라이드 최고 속도의 이 비율까지 감속하는 첫 순간.
 * 속도를 그 투구 자체의 최고 속도로 나눠 보기 때문에 슬로모 배속이나
 * 폼의 빠르기와 무관하게 같은 지점을 잡는다.
 * (발끝이 지면에 닿는 프레임과 대조해 맞춘 값)
 */
const PLANT_SPEED_RATIO = 0.2;

/** 투구로 인정할 최소 팔 전방 신전 (몸통 길이 배수) */
const MIN_THROW_EXT = 0.4;
/** 투구로 인정할 최소 손목 최고 속도 (몸통 길이/초) */
const MIN_WRIST_SPEED = 3;

/**
 * 옆에서 찍은 영상으로 인정할 최소 양발 벌어짐 (몸통 길이 배수).
 * 스트라이드가 화면 좌우로 담기면 이 값이 크고, 카메라가 투구 방향
 * 앞뒤에 있으면 동작이 깊이 방향으로 가려 작아진다.
 * (실측: 측면 영상 2.5~2.7 vs 뒤에서 찍은 영상 1.47)
 */
const MIN_SIDE_VIEW_SPREAD = 2.0;

type Pt = { x: number; y: number; v: number };

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** null(미인식)을 건너뛰는 이동 평균. 창 안에 값이 없으면 null. */
function smooth(values: (number | null)[], win = 5): (number | null)[] {
  const half = Math.floor(win / 2);
  return values.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      const v = values[j];
      if (v != null) {
        sum += v;
        n++;
      }
    }
    return n > 0 ? sum / n : null;
  });
}

export function detectPitchEvents(
  track: PoseTrack,
  /** 사용자가 고친 좌/우투 표기. 표기만 바꾸고 검출·측정은 건드리지 않는다. */
  labelOverride?: 'left' | 'right'
): PitchEvents {
  const frames = track.frames;
  const W = track.videoWidth || 1;
  const H = track.videoHeight || 1;

  /** 정규화 좌표를 픽셀로 되돌린다 (각도·거리 왜곡 방지) */
  const px = (i: number, idx: number): Pt | null => {
    const p = frames[i]?.landmarks[idx];
    if (!p) return null;
    return { x: p.x * W, y: p.y * H, v: p.visibility };
  };

  const empty = (side: 'left' | 'right', sideViewOk = true): PitchEvents => ({
    throwingSide: labelOverride ?? side,
    wristSide: side,
    leadSide: side === 'right' ? 'left' : 'right',
    sideViewOk,
    direction: 1,
    kneeUp: null,
    footPlant: null,
    release: null,
  });

  if (frames.length < 5) return empty('right');

  // 몸통 길이(어깨 중심~골반 중심)를 자로 삼는다.
  const trunkLengths: number[] = [];
  const shoulderC: ({ x: number; y: number } | null)[] = [];
  const hipCx: (number | null)[] = [];
  for (let i = 0; i < frames.length; i++) {
    const ls = px(i, LM.leftShoulder);
    const rs = px(i, LM.rightShoulder);
    const lh = px(i, LM.leftHip);
    const rh = px(i, LM.rightHip);
    if (!ls || !rs || !lh || !rh || [ls, rs, lh, rh].some((p) => p.v < VIS_OK)) {
      shoulderC.push(null);
      hipCx.push(null);
      continue;
    }
    const sc = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
    const hc = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
    shoulderC.push(sc);
    hipCx.push(hc.x);
    trunkLengths.push(Math.hypot(sc.x - hc.x, sc.y - hc.y));
  }
  const trunk = median(trunkLengths);
  if (!trunk || trunk <= 0) return empty('right');

  const hipCy = frames.map((_, i) => {
    const lh = px(i, LM.leftHip);
    const rh = px(i, LM.rightHip);
    if (!lh || !rh || lh.v < VIS_OK || rh.v < VIS_OK) return null;
    return (lh.y + rh.y) / 2;
  });

  // 0) 촬영 각도 — 스트라이드가 화면 좌우로 담기지 않으면 어떤 구간도
  //    신뢰할 수 없다. 엉뚱한 수치를 내느니 분석을 하지 않는다.
  let maxAnkleSpread = 0;
  for (let i = 0; i < frames.length; i++) {
    const la = px(i, LM.leftAnkle);
    const ra = px(i, LM.rightAnkle);
    if (!la || !ra || la.v < VIS_OK || ra.v < VIS_OK) continue;
    maxAnkleSpread = Math.max(maxAnkleSpread, Math.abs(la.x - ra.x));
  }
  if (maxAnkleSpread / trunk < MIN_SIDE_VIEW_SPREAD) return empty('right', false);

  // 1) 진행 방향 — 골반 중심이 가장 빠르게 지속 이동한 쪽이 홈이다.
  const hipSmooth = smooth(hipCx, 5);
  const span = Math.max(2, Math.round(0.25 / track.sampleStep));
  let bestVel = 0;
  for (let i = span; i < hipSmooth.length; i++) {
    const a = hipSmooth[i - span];
    const b = hipSmooth[i];
    if (a == null || b == null) continue;
    const dt = frames[i].t - frames[i - span].t;
    if (dt <= 0) continue;
    const v = (b - a) / dt;
    if (Math.abs(v) > Math.abs(bestVel)) bestVel = v;
  }
  const direction: 1 | -1 = bestVel >= 0 ? 1 : -1;

  // 2) 던지는 팔 — 투구 내내 훨씬 멀리 움직이는 손이 던지는 손이다.
  //    (손목 속도는 모션 블러로 뒤집히기 쉬워 이동 거리를 쓴다)
  const wristPath = (idx: number) => {
    let len = 0;
    let peakSpeed = 0;
    for (let i = 2; i < frames.length; i++) {
      const a = px(i - 2, idx);
      const b = px(i, idx);
      if (!a || !b || a.v < WRIST_VIS_OK || b.v < WRIST_VIS_OK) continue;
      const dt = frames[i].t - frames[i - 2].t;
      if (dt <= 0) continue;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      len += d / 2;
      peakSpeed = Math.max(peakSpeed, d / dt);
    }
    return { len: len / trunk, peakSpeed: peakSpeed / trunk };
  };
  const leftPath = wristPath(LM.leftWrist);
  const rightPath = wristPath(LM.rightWrist);
  const wristSide: 'left' | 'right' = rightPath.len > leftPath.len ? 'right' : 'left';
  const throwWristIdx = wristSide === 'right' ? LM.rightWrist : LM.leftWrist;
  const throwPath = wristSide === 'right' ? rightPath : leftPath;

  // 팔을 휘두르지 않았으면 투구가 아니다.
  if (throwPath.peakSpeed < MIN_WRIST_SPEED) return empty(wristSide);

  // 3) 릴리스 — 팔 채찍(손목 최고 속도) 직후 손목 전방 신전이 만드는 첫 피크.
  //
  //    신전의 "전역 최대"를 쓰면 안 된다: 투구가 끝나고 걸어다니는 구간에서
  //    팔이 몸보다 앞에 오래 머물면 그쪽이 더 커질 수 있다. 반면 손목 최고
  //    속도는 어떤 영상에서도 팔 채찍 그 자체라 흔들리지 않는 닻이 된다.
  const ext = smooth(
    frames.map((_, i) => {
      const w = px(i, throwWristIdx);
      const sc = shoulderC[i];
      if (!w || w.v < WRIST_VIS_OK || !sc) return null;
      return (direction * (w.x - sc.x)) / trunk;
    }),
    3
  );

  const wristSpeed = smooth(
    frames.map((_, i) => {
      if (i < 2) return null;
      const a = px(i - 2, throwWristIdx);
      const b = px(i, throwWristIdx);
      if (!a || !b || a.v < WRIST_VIS_OK || b.v < WRIST_VIS_OK) return null;
      const dt = frames[i].t - frames[i - 2].t;
      if (dt <= 0) return null;
      return Math.hypot(b.x - a.x, b.y - a.y) / dt / trunk;
    }),
    3
  );
  let fastIdx = -1;
  let fastV = 0;
  for (let i = 0; i < wristSpeed.length; i++) {
    const v = wristSpeed[i];
    if (v != null && v > fastV) {
      fastV = v;
      fastIdx = i;
    }
  }

  // 채찍 지점부터 앞으로 훑어 신전의 첫 피크를 찾는다.
  // 피크를 지나 절반 아래로 떨어지거나 인식이 길게 끊기면 멈춘다.
  let extPeakIdx = -1;
  if (fastIdx >= 0) {
    let nullRun = 0;
    for (let j = fastIdx; j < ext.length; j++) {
      const v = ext[j];
      if (v == null) {
        if (++nullRun > 3) break;
        continue;
      }
      nullRun = 0;
      if (extPeakIdx < 0 || v > (ext[extPeakIdx] as number)) extPeakIdx = j;
      else if (v < (ext[extPeakIdx] as number) * 0.5) break;
    }
  }
  // 채찍 부근에서 피크를 못 찾으면(인식 결손) 전역 최대로 물러선다.
  if (extPeakIdx < 0 || ext[extPeakIdx] == null) {
    let best = 0;
    for (let i = 0; i < ext.length; i++) {
      const v = ext[i];
      if (v != null && v > best) {
        best = v;
        extPeakIdx = i;
      }
    }
  }
  const maxExt = extPeakIdx >= 0 ? (ext[extPeakIdx] as number) : 0;
  if (maxExt < MIN_THROW_EXT || extPeakIdx < 0) return empty(wristSide);

  // 피크에서 거꾸로 훑어 80% 선을 넘어선 첫 프레임 = 릴리스.
  // (공은 팔이 완전히 펴지기 직전에 손을 떠난다)
  let releaseIdx = extPeakIdx;
  while (releaseIdx > 0) {
    const prev = ext[releaseIdx - 1];
    if (prev == null || prev < maxExt * RELEASE_EXT_RATIO) break;
    releaseIdx--;
  }
  const release: PitchEvent = {
    t: frames[releaseIdx].t,
    confidence: px(releaseIdx, throwWristIdx)?.v ?? 0,
  };

  // 4) 리드 다리 — 릴리스 때 홈 쪽으로 더 나가 있는 다리.
  //    좌우 라벨이 아니라 위치로 정하므로 뒤에서 찍혀 좌우가 뒤집혀도 맞다.
  const la = px(releaseIdx, LM.leftAnkle);
  const ra = px(releaseIdx, LM.rightAnkle);
  const leadSide: 'left' | 'right' =
    la && ra && direction * la.x > direction * ra.x ? 'left' : 'right';
  const leadAnkleIdx = leadSide === 'left' ? LM.leftAnkle : LM.rightAnkle;
  const leadKneeIdx = leadSide === 'left' ? LM.leftKnee : LM.rightKnee;

  // 5) 착지 — 앞발이 스트라이드 최고 속도의 20%까지 감속하는 첫 순간.
  const ankleX = smooth(
    frames.map((_, i) => {
      const p = px(i, leadAnkleIdx);
      return p && p.v >= VIS_OK ? p.x : null;
    }),
    5
  );
  const forwardV = ankleX.map((_, i) => {
    if (i < 2) return null;
    const a = ankleX[i - 2];
    const b = ankleX[i];
    if (a == null || b == null) return null;
    const dt = frames[i].t - frames[i - 2].t;
    if (dt <= 0) return null;
    return (direction * (b - a)) / dt / trunk;
  });

  let peakV = 0;
  let peakIdx = -1;
  for (let i = 0; i < releaseIdx; i++) {
    const v = forwardV[i];
    if (v != null && v > peakV) {
      peakV = v;
      peakIdx = i;
    }
  }

  let footPlant: PitchEvent | null = null;
  let plantIdx = -1;
  if (peakIdx >= 0 && peakV > 0) {
    for (let i = peakIdx + 1; i <= releaseIdx; i++) {
      const v = forwardV[i];
      if (v != null && v <= peakV * PLANT_SPEED_RATIO) {
        plantIdx = i;
        footPlant = { t: frames[i].t, confidence: px(i, leadAnkleIdx)?.v ?? 0 };
        break;
      }
    }
  }

  // 6) 니업 — 착지 전 구간에서 리드 무릎이 골반보다 가장 높이 올라간 순간.
  //    화면 절대 높이가 아니라 골반 기준으로 봐야 몸이 화면에서 오르내려도
  //    같은 지점을 잡는다. 무릎을 들지 않는 폼이면 살짝 올라간 지점이 잡히고,
  //    높이 수치가 "골반 아래 N㎝"로 정직하게 나온다.
  let kneeUp: PitchEvent | null = null;
  if (plantIdx > 0) {
    // 스트라이드가 시작되기 전까지만 거슬러 본다 (앞 구간의 잡음 배제).
    let strideStart = peakIdx;
    while (strideStart > 0) {
      const v = forwardV[strideStart];
      if (v == null || v <= peakV * PLANT_SPEED_RATIO) break;
      strideStart--;
    }
    const strideLen = Math.max(1, plantIdx - strideStart);
    const from = Math.max(0, strideStart - strideLen * 2);

    let bestLift = -Infinity;
    let bestIdx = -1;
    for (let i = from; i < plantIdx; i++) {
      const p = px(i, leadKneeIdx);
      const hip = hipCy[i];
      if (!p || p.v < VIS_OK || hip == null) continue;
      const lift = hip - p.y; // 양수 = 무릎이 골반보다 위
      if (lift > bestLift) {
        bestLift = lift;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      kneeUp = { t: frames[bestIdx].t, confidence: px(bestIdx, leadKneeIdx)?.v ?? 0 };
    }
  }

  return {
    throwingSide: labelOverride ?? wristSide,
    wristSide,
    leadSide,
    sideViewOk: true,
    direction,
    kneeUp,
    footPlant,
    release,
  };
}
