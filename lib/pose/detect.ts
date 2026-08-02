import { LM, QUALITY_THRESHOLD, type PoseTrack } from '@/lib/pose/types';

/**
 * 관절 좌표 시계열에서 투구의 세 순간을 찾는다 — 니업(무릎 최고점),
 * 착지(앞발 접지), 릴리스(손이 앞으로 가장 뻗은 순간).
 *
 * 전부 규칙 기반이라 같은 영상이면 언제나 같은 결과가 나온다.
 * 화면을 벗어나거나 흐릿해서 신뢰도가 낮은 관절은 계산에서 뺀다.
 */

export type PitchEvent = {
  /** 영상에서의 시각 (초) */
  t: number;
  /** 그 순간 해당 관절의 인식 신뢰도 (0~1) */
  confidence: number;
};

export type PitchEvents = {
  /** 던지는 팔 — 오른손 투수면 'right' */
  throwingSide: 'left' | 'right';
  /** 화면 x축 기준 투구 진행 방향 (+1 = 오른쪽으로 던짐) */
  direction: 1 | -1;
  kneeUp: PitchEvent | null;
  footPlant: PitchEvent | null;
  release: PitchEvent | null;
};

const VIS_OK = QUALITY_THRESHOLD;
/** 릴리스 부근 손목은 모션 블러로 신뢰도가 낮게 나와 기준을 조금 낮춘다. */
const WRIST_VIS_OK = 0.35;
/** 무릎이 이만큼(몸통 길이 대비)은 올라와야 투구 동작으로 본다. */
const MIN_KNEE_LIFT_RATIO = 0.35;
/** 발목이 지면 기준선에서 이 비율(몸통 길이 대비) 안이면 접지로 본다. */
const PLANT_EPS_RATIO = 0.08;

/**
 * 릴리스 = 착지 후 손목 전방 신전이 최댓값의 이 비율에 처음 닿는 순간.
 * 공은 팔이 완전히 펴지기 직전에 손을 떠나고 완전 신전은 팔로스루에서
 * 나오기 때문에, 신전 최대 시점을 그대로 쓰면 릴리스가 늦게 잡힌다.
 * (실제 투구 영상에서 공이 손을 떠나는 프레임과 대조해 맞춘 값)
 */
const RELEASE_EXT_RATIO = 0.8;

type Pt = { x: number; y: number; v: number };

function jointSeries(track: PoseTrack, idx: number): (Pt | null)[] {
  return track.frames.map((f) => {
    const p = f.landmarks[idx];
    return p ? { x: p.x, y: p.y, v: p.visibility } : null;
  });
}

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

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}

/** 좌표만 뽑되 신뢰도가 낮은 프레임은 null 처리한다. */
function coordOf(series: (Pt | null)[], axis: 'x' | 'y', minVis: number): (number | null)[] {
  return series.map((p) => (p && p.v >= minVis ? p[axis] : null));
}

/** 손목의 프레임 간 이동 속도 상위값 — 던지는 팔 판별용. */
function wristPeakSpeed(track: PoseTrack, series: (Pt | null)[]): number {
  const speeds: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1];
    const b = series[i];
    if (!a || !b || a.v < WRIST_VIS_OK || b.v < WRIST_VIS_OK) continue;
    const dt = track.frames[i].t - track.frames[i - 1].t;
    if (dt <= 0) continue;
    speeds.push(Math.hypot(b.x - a.x, b.y - a.y) / dt);
  }
  // 최댓값은 노이즈에 튀기 쉬워 상위 5% 지점을 쓴다.
  return percentile(speeds, 0.95) ?? 0;
}

export function detectPitchEvents(
  track: PoseTrack,
  forcedSide?: 'left' | 'right'
): PitchEvents {
  const frames = track.frames;

  const leftWrist = jointSeries(track, LM.leftWrist);
  const rightWrist = jointSeries(track, LM.rightWrist);

  // 1) 던지는 팔 — 투구 중 가장 빠르게 움직이는 손목이 던지는 손이다.
  const throwingSide: 'left' | 'right' =
    forcedSide ??
    (wristPeakSpeed(track, leftWrist) > wristPeakSpeed(track, rightWrist)
      ? 'left'
      : 'right');
  const leadKneeIdx = throwingSide === 'right' ? LM.leftKnee : LM.rightKnee;
  const leadAnkleIdx = throwingSide === 'right' ? LM.leftAnkle : LM.rightAnkle;
  const leadShoulderIdx = throwingSide === 'right' ? LM.leftShoulder : LM.rightShoulder;
  const throwingWrist = throwingSide === 'right' ? rightWrist : leftWrist;

  // 몸통 길이(어깨 중심~골반 중심)를 자로 삼아 거리 기준을 몸 크기에 맞춘다.
  const trunkLengths: number[] = [];
  for (const f of frames) {
    const ls = f.landmarks[LM.leftShoulder];
    const rs = f.landmarks[LM.rightShoulder];
    const lh = f.landmarks[LM.leftHip];
    const rh = f.landmarks[LM.rightHip];
    if ([ls, rs, lh, rh].some((p) => !p || p.visibility < VIS_OK)) continue;
    trunkLengths.push(
      Math.hypot(
        (ls.x + rs.x) / 2 - (lh.x + rh.x) / 2,
        (ls.y + rs.y) / 2 - (lh.y + rh.y) / 2
      )
    );
  }
  const trunk = median(trunkLengths) ?? 0.15;

  // 2) 니업 — 리드 무릎(던지는 팔 반대쪽)이 화면에서 가장 높이 올라간 순간.
  const kneeSeries = jointSeries(track, leadKneeIdx);
  const kneeY = smooth(coordOf(kneeSeries, 'y', VIS_OK));
  const kneeVals = kneeY.filter((v): v is number => v != null);
  let kneeUp: PitchEvent | null = null;
  let kneeUpIdx = -1;
  if (kneeVals.length > 0) {
    const baseline = median(kneeVals)!;
    let minY = Infinity;
    for (let i = 0; i < kneeY.length; i++) {
      const v = kneeY[i];
      if (v != null && v < minY) {
        minY = v;
        kneeUpIdx = i;
      }
    }
    // 무릎이 충분히 올라오지 않았으면 투구 동작이 아니라고 본다.
    if (kneeUpIdx >= 0 && baseline - minY >= MIN_KNEE_LIFT_RATIO * trunk) {
      kneeUp = {
        t: frames[kneeUpIdx].t,
        confidence: kneeSeries[kneeUpIdx]?.v ?? 0,
      };
    } else {
      kneeUpIdx = -1;
    }
  }

  // 3) 진행 방향 — 니업 이후 골반이 이동하는 쪽. (스트라이드는 홈 방향이다)
  const hipCx = smooth(
    frames.map((f) => {
      const lh = f.landmarks[LM.leftHip];
      const rh = f.landmarks[LM.rightHip];
      if (!lh || !rh || lh.visibility < VIS_OK || rh.visibility < VIS_OK) return null;
      return (lh.x + rh.x) / 2;
    })
  );
  const spanStart = kneeUpIdx >= 0 ? kneeUpIdx : 0;
  const spanEnd = Math.min(frames.length - 1, spanStart + Math.max(5, Math.floor((frames.length - spanStart) * 0.4)));
  const before = hipCx[spanStart];
  const after = hipCx[spanEnd];
  const direction: 1 | -1 = before != null && after != null && after < before ? -1 : 1;

  // 4) 착지 — 니업 이후 리드 발목이 지면 기준선까지 내려와 머무는 첫 순간.
  const ankleSeries = jointSeries(track, leadAnkleIdx);
  const ankleY = smooth(coordOf(ankleSeries, 'y', VIS_OK));
  let footPlant: PitchEvent | null = null;
  let footPlantIdx = -1;
  if (kneeUpIdx >= 0) {
    const afterVals = ankleY
      .slice(kneeUpIdx)
      .filter((v): v is number => v != null);
    const ground = percentile(afterVals, 0.9);
    if (ground != null) {
      const eps = PLANT_EPS_RATIO * trunk;
      for (let i = kneeUpIdx + 1; i < frames.length; i++) {
        const v = ankleY[i];
        if (v == null || v < ground - eps) continue;
        // 다음 두 프레임도 바닥 근처면 튄 값이 아니라 진짜 접지다.
        const n1 = ankleY[i + 1];
        const n2 = ankleY[i + 2];
        const stable =
          (n1 == null || n1 >= ground - eps * 1.5) &&
          (n2 == null || n2 >= ground - eps * 1.5);
        if (!stable) continue;
        footPlantIdx = i;
        footPlant = { t: frames[i].t, confidence: ankleSeries[i]?.v ?? 0 };
        break;
      }
    }
  }

  // 5) 릴리스 — 착지 이후 손목 전방 신전이 최댓값의 80%에 처음 닿는 순간.
  let release: PitchEvent | null = null;
  const releaseFrom = footPlantIdx >= 0 ? footPlantIdx : kneeUpIdx;
  if (releaseFrom >= 0) {
    const ext = smooth(
      frames.map((f, i) => {
        const w = throwingWrist[i];
        const s = f.landmarks[leadShoulderIdx];
        if (!w || w.v < WRIST_VIS_OK) return null;
        if (!s || s.visibility < VIS_OK) return null;
        return direction * (w.x - s.x);
      }),
      3
    );
    let maxExt = 0; // 어깨보다 뒤(음수)면 릴리스로 치지 않는다.
    for (let i = releaseFrom + 1; i < frames.length; i++) {
      const v = ext[i];
      if (v != null && v > maxExt) maxExt = v;
    }
    if (maxExt > 0) {
      for (let i = releaseFrom + 1; i < frames.length; i++) {
        const v = ext[i];
        if (v != null && v >= maxExt * RELEASE_EXT_RATIO) {
          release = { t: frames[i].t, confidence: throwingWrist[i]?.v ?? 0 };
          break;
        }
      }
    }
  }

  return { throwingSide, direction, kneeUp, footPlant, release };
}
