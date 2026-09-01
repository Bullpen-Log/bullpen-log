import { LM, type PoseTrack } from '@/lib/pose/types';

/**
 * 골반과 어깨가 언제 열리는가.
 *
 * 투구에서 힘은 아래에서 위로 간다 — 앞발이 닿고, 골반이 먼저 돌고, 그 뒤에
 * 어깨가 따라온다. 둘이 함께 돌면 몸통을 비틀어 모은 힘이 없는 셈이라 팔로만
 * 던지게 된다. 순서와 시간차의 문제라 곡선으로 봐야 보인다.
 *
 * ■ 깊이(z)를 쓰지 않는다
 *
 * 처음에는 MediaPipe 의 3D 좌표로 축의 방위각을 냈다. 그런데 옆에서 찍으면
 * 먼 쪽 어깨와 골반이 몸에 가려지고, 가려지는 때가 정확히 몸이 닫혀 있는
 * 순간이다 — 분리를 봐야 하는 바로 그 구간이다. 그 구간에서 깊이는 카메라가
 * 본 값이 아니라 모델이 지어낸 값이고, 신뢰도가 낮아 프레임 자체가 버려졌다.
 * 곡선이 분리가 끝난 지점에서야 시작됐다.
 *
 * 대신 화면에 보이는 폭을 쓴다. 몸이 닫히면 두 어깨가 겹쳐 폭이 좁아지고,
 * 열리면 넓어진다. 이건 카메라가 실제로 본 것이다.
 *
 *   닫힘 0°  → 폭 0        열림 90° → 폭 최대
 *   열린 정도 = asin(지금 폭 ÷ 그 영상에서 가장 넓었던 폭)
 *
 * ■ 무엇에 견주어 재는가
 *
 * 폭을 그대로 쓰면 안 된다. 스트라이드로 카메라와의 거리가 바뀌어 몸이 커졌다
 * 작아졌다 하기 때문이다. 몸통 길이(어깨 가운데 ↔ 골반 가운데)로 나눈다 —
 * 몸통은 수직축 회전에 거의 안 변해서 자尺으로 쓸 수 있다.
 *
 * ■ 믿을 수 있는 만큼만
 *
 * '가장 넓었던 폭'을 90도로 놓는 것이라, 그 영상에서 실제로 몸이 다 열리지
 * 않았다면 전체가 부풀려진다. 절대값이 아니라 순서와 모양, 그리고 같은
 * 방식으로 찍은 지난 영상과의 차이에 쓴다.
 */

export type RotationPoint = {
  /** 영상에서의 시각(초) */
  t: number;
  /** 골반이 열린 정도(0~90도). 0이 가장 닫힌 자세다. */
  hip: number;
  /** 어깨가 열린 정도(0~90도) */
  shoulder: number;
  /**
   * 어깨 − 골반.
   *
   * 음수면 골반이 앞서 열린 것이다 — 아래에서 위로 힘이 갔다는 뜻이다.
   * 양수면 어깨가 먼저 열린 것이라 팔로만 던진 쪽에 가깝다.
   */
  separation: number;
};

export type RotationSeries = {
  points: RotationPoint[];
  /** 분리가 가장 컸던 순간 */
  peak: { t: number; separation: number } | null;
};

/**
 * 이보다 낮으면 관절 위치 자체를 못 믿는다.
 *
 * 예전에는 0.5였는데, 옆모습에서 가려진 어깨가 그 아래로 떨어져 정작 필요한
 * 구간이 통째로 버려졌다. 가려져도 화면상 자리는 꽤 맞게 찍으므로, 완전히
 * 놓친 프레임만 걸러낸다.
 */
const MIN_VISIBILITY = 0.2;

/** 몸통이 이보다 짧게 잡히면 사람을 제대로 못 본 프레임이다 */
const MIN_TORSO_PX = 8;

/** 가장 넓었던 폭을 정할 때 위에서 몇 번째를 쓸 것인가 — 튄 값 하나에 안 끌리게 */
const WIDTH_PERCENTILE = 0.9;

type Sample = { t: number; hip: number; shoulder: number };

export function rotationSeries(track: PoseTrack): RotationSeries {
  const W = track.videoWidth || 1;
  const H = track.videoHeight || 1;
  const samples: Sample[] = [];

  for (const frame of track.frames) {
    const p = frame.landmarks;
    const ls = p[LM.leftShoulder];
    const rs = p[LM.rightShoulder];
    const lh = p[LM.leftHip];
    const rh = p[LM.rightHip];
    if (!ls || !rs || !lh || !rh) continue;
    if (
      Math.min(ls.visibility, rs.visibility, lh.visibility, rh.visibility) <
      MIN_VISIBILITY
    ) {
      continue;
    }

    /* 화면 픽셀로 옮긴다 — 가로·세로 정규화 기준이 달라 그대로 견주면 안 된다 */
    const sx = (a: { x: number }) => a.x * W;
    const sy = (a: { y: number }) => a.y * H;

    const shoulderW = Math.abs(sx(ls) - sx(rs));
    const hipW = Math.abs(sx(lh) - sx(rh));

    /* 자尺 — 어깨 가운데에서 골반 가운데까지 */
    const scx = (sx(ls) + sx(rs)) / 2;
    const scy = (sy(ls) + sy(rs)) / 2;
    const hcx = (sx(lh) + sx(rh)) / 2;
    const hcy = (sy(lh) + sy(rh)) / 2;
    const torso = Math.hypot(scx - hcx, scy - hcy);
    if (torso < MIN_TORSO_PX) continue;

    samples.push({ t: frame.t, hip: hipW / torso, shoulder: shoulderW / torso });
  }

  if (samples.length < 4) return { points: [], peak: null };

  /* 그 영상에서 가장 열렸던 순간을 90도로 놓는다 */
  const widest = (pick: (s: Sample) => number) => {
    const sorted = samples.map(pick).sort((a, b) => a - b);
    const at = Math.min(
      sorted.length - 1,
      Math.floor(sorted.length * WIDTH_PERCENTILE)
    );
    return Math.max(1e-6, sorted[at]);
  };
  const hipMax = widest((s) => s.hip);
  const shoulderMax = widest((s) => s.shoulder);

  const openness = (w: number, max: number) =>
    (Math.asin(Math.max(0, Math.min(1, w / max))) * 180) / Math.PI;

  const raw = samples.map((s) => ({
    t: s.t,
    hip: openness(s.hip, hipMax),
    shoulder: openness(s.shoulder, shoulderMax),
  }));

  /*
   * 세 점 가운데값으로 다듬는다.
   *
   * 관절이 프레임마다 한두 픽셀씩 떨려 곡선이 지저분해진다. 평균이 아니라
   * 가운데값을 쓰는 이유는, 한 프레임이 크게 튀었을 때 평균은 그 값에 끌려가고
   * 가운데값은 버티기 때문이다.
   */
  const mid3 = (a: number, b: number, c: number) => a + b + c - Math.min(a, b, c) - Math.max(a, b, c);
  const smooth = raw.map((r, i) => {
    if (i === 0 || i === raw.length - 1) return r;
    return {
      t: r.t,
      hip: mid3(raw[i - 1].hip, r.hip, raw[i + 1].hip),
      shoulder: mid3(raw[i - 1].shoulder, r.shoulder, raw[i + 1].shoulder),
    };
  });

  const points: RotationPoint[] = smooth.map((r) => ({
    t: r.t,
    hip: Math.round(r.hip * 10) / 10,
    shoulder: Math.round(r.shoulder * 10) / 10,
    separation: Math.round((r.shoulder - r.hip) * 10) / 10,
  }));

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
