import { LM, QUALITY_THRESHOLD, type PoseTrack } from '@/lib/pose/types';

/**
 * 골반과 어깨가 언제 열리는가.
 *
 * 투구에서 힘은 아래에서 위로 간다 — 앞발이 닿고, 골반이 먼저 돌고, 그 뒤에
 * 어깨가 따라온다. 둘이 함께 돌면 몸통을 비틀어 모은 힘이 없는 셈이라 팔로만
 * 던지게 된다. 그 사이가 벌어진 정도를 '분리'라고 부른다.
 *
 * 세 순간(니업·착지·릴리스)의 각도 숫자로는 이것이 보이지 않는다. 순서와
 * 시간차의 문제라 곡선으로 봐야 한다.
 *
 * ■ 어떻게 재는가
 *
 * MediaPipe 가 관절마다 3D 좌표(world)를 함께 낸다. 골반 중심이 원점인 미터
 * 단위다. 왼쪽에서 오른쪽으로 가는 벡터를 수평면(x-z)에 눕히면 그 축이 얼마나
 * 돌았는지가 나온다. 골반 축과 어깨 축을 각각 재서 나란히 놓는다.
 *
 * ■ 믿을 수 있는 만큼만
 *
 * 깊이(z)는 카메라 한 대에서 추정한 값이라 절대 정확도가 낮다. 모션캡처가
 * ±3~5도라면 이쪽은 ±10~15도로 봐야 한다. 그래서 "오늘 42도"라는 절대값이
 * 아니라 '어느 쪽이 먼저 도는가'와 '지난번과 견줘 어떤가'에 쓴다 — 오차가
 * 같은 방향으로 생기므로 모양과 변화는 남는다.
 *
 * 시작점을 0으로 맞춰 그린다. 카메라가 놓인 각도에 따라 처음 값이 제각각인데,
 * 궁금한 것은 '처음보다 얼마나 돌았나'이지 절대 방위가 아니다.
 */

export type RotationPoint = {
  /** 영상에서의 시각(초) */
  t: number;
  /** 시작 자세 대비 골반이 돈 각도(도) */
  hip: number;
  /** 시작 자세 대비 어깨가 돈 각도(도) */
  shoulder: number;
  /** 어깨 − 골반. 클수록 몸통이 많이 비틀려 있다. */
  separation: number;
};

export type RotationSeries = {
  points: RotationPoint[];
  /** 분리가 가장 컸던 순간 */
  peak: { t: number; separation: number } | null;
};

/** 수평면에서 이 축이 얼마나 돌았는가(도). 왼쪽 → 오른쪽 벡터를 본다. */
function axisAngle(
  left: { x: number; z: number },
  right: { x: number; z: number }
): number {
  return Math.atan2(right.z - left.z, right.x - left.x) * (180 / Math.PI);
}

/**
 * 각도가 -180과 180을 넘나들 때 곡선이 튀지 않게 이어 붙인다.
 *
 * 몸이 반 바퀴를 돌면 179도 다음이 -179도가 된다. 그대로 그리면 곡선이
 * 위아래로 한 번 크게 튀어, 실제로는 2도 돈 것이 358도 돈 것처럼 보인다.
 */
function unwrap(prev: number, next: number): number {
  let d = next - prev;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return prev + d;
}

export function rotationSeries(track: PoseTrack): RotationSeries {
  const raw: { t: number; hip: number; shoulder: number }[] = [];

  for (const frame of track.frames) {
    const w = frame.world;
    if (!w) continue;
    const lh = w[LM.leftHip];
    const rh = w[LM.rightHip];
    const ls = w[LM.leftShoulder];
    const rs = w[LM.rightShoulder];
    if (!lh || !rh || !ls || !rs) continue;

    /* 네 관절 모두 또렷하게 보일 때만 쓴다 — 하나라도 흐리면 축이 엉뚱해진다 */
    const vis = Math.min(lh.visibility, rh.visibility, ls.visibility, rs.visibility);
    if (vis < QUALITY_THRESHOLD) continue;

    raw.push({
      t: frame.t,
      hip: axisAngle(lh, rh),
      shoulder: axisAngle(ls, rs),
    });
  }

  if (raw.length < 2) return { points: [], peak: null };

  /* 끊긴 곳을 이어 붙이고 시작점을 0으로 맞춘다 */
  let hip = raw[0].hip;
  let shoulder = raw[0].shoulder;
  const hip0 = hip;
  const shoulder0 = shoulder;

  const points: RotationPoint[] = raw.map((r, i) => {
    if (i > 0) {
      hip = unwrap(hip, r.hip);
      shoulder = unwrap(shoulder, r.shoulder);
    }
    const h = hip - hip0;
    const s = shoulder - shoulder0;
    return {
      t: r.t,
      hip: Math.round(h * 10) / 10,
      shoulder: Math.round(s * 10) / 10,
      separation: Math.round((s - h) * 10) / 10,
    };
  });

  const peak = points.reduce<RotationPoint | null>(
    (best, p) =>
      best == null || Math.abs(p.separation) > Math.abs(best.separation) ? p : best,
    null
  );

  return {
    points,
    peak: peak ? { t: peak.t, separation: peak.separation } : null,
  };
}
