import {
  BALL_DIAMETER_M,
  focalPxFromFov,
  type BallObservation,
  type CameraLens,
} from './geometry.ts';

/**
 * 정답을 아는 가상 투구를 만든다.
 *
 * 엔진이 맞게 계산하는지 확인하려면 "진짜 구속을 아는 촬영"이 있어야 하는데,
 * 실제 영상에는 정답이 없다. 그래서 원하는 구속으로 날아가는 공을 물리로
 * 그려서 프레임마다 화면 어디에 몇 픽셀로 찍힐지를 만들어낸다.
 *
 * 여기서 만든 관측을 엔진에 넣었을 때 원래 구속이 그대로 나오면, 적어도
 * 계산 자체는 맞는 것이다. 실제 영상에서 공을 잘 찾아내는지는 별개 문제이며
 * 그건 실제 촬영으로 확인해야 한다.
 */

/** 아이폰 후면 메인 카메라의 대략적인 가로 화각(도) */
export const IPHONE_MAIN_FOV_DEG = 69;

export function iphoneLens(frameWidth = 1920, frameHeight = 1080): CameraLens {
  return {
    focalPx: focalPxFromFov(frameWidth, IPHONE_MAIN_FOV_DEG),
    frameWidth,
    frameHeight,
  };
}

export type SimulationOptions = {
  /** 만들고 싶은 구속(km/h) */
  kmh: number;
  lens: CameraLens;
  /** 초당 프레임 수 */
  fps: number;
  /** 릴리스 지점이 카메라에서 떨어진 거리(m) */
  releaseDistanceM?: number;
  /** 공이 날아가는 거리(m) */
  travelM?: number;
  /** 릴리스가 화면 중앙에서 벗어난 정도(픽셀) */
  releaseOffsetPx?: { x: number; y: number };
  /** 공 지름을 재는 데 섞이는 오차(픽셀 단위 표준편차) */
  diameterNoisePx?: number;
  /** 공기저항으로 느려지는 정도(1/s). 0이면 등속 */
  dragPerSec?: number;
  /** 난수 씨앗 — 같은 값을 넣으면 같은 결과가 나온다 */
  seed?: number;
};

/** 씨앗이 있는 난수. 시험 결과가 매번 달라지면 비교를 할 수 없다. */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** 정규분포에 가까운 잡음 (박스-뮐러) */
function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export type Simulation = {
  observations: BallObservation[];
  /**
   * 이 촬영의 진짜 구간 평균 구속(km/h) — 채점 기준.
   *
   * 잡음이 섞이지 않은 값으로 계산한다. 처음에는 관측(잡음 포함)으로 계산했는데,
   * 마지막 프레임은 공이 6픽셀까지 작아져 정답 자체가 크게 흔들렸다. 그 바람에
   * 엔진이 맞게 계산해도 "오차 9km/h"로 찍혀, 엔진을 엉뚱하게 고칠 뻔했다.
   */
  trueAverageKmh: number;
  /** 잡음이 없었다면 각 프레임에서 공이 있었을 거리(m) */
  trueDistances: { t: number; z: number }[];
};

export function simulatePitch(opts: SimulationOptions): Simulation {
  const {
    kmh,
    lens,
    fps,
    releaseDistanceM = 1.2,
    travelM = 16,
    releaseOffsetPx = { x: 0, y: 0 },
    diameterNoisePx = 0,
    dragPerSec = 0,
    seed = 1,
  } = opts;

  const rand = makeRandom(seed);
  const speed0 = kmh / 3.6;
  const dt = 1 / fps;

  const observations: BallObservation[] = [];
  const trueDistances: { t: number; z: number }[] = [];
  let distance = releaseDistanceM;
  let traveled = 0;
  let t = 0;

  while (traveled < travelM) {
    const diameterTrue = (BALL_DIAMETER_M * lens.focalPx) / distance;
    const noise = diameterNoisePx > 0 ? gaussian(rand) * diameterNoisePx : 0;

    trueDistances.push({ t, z: distance });
    observations.push({
      t,
      // 투수 뒤에서 찍으면 공은 화면에서 거의 제자리에 머문다.
      x: lens.frameWidth / 2 + releaseOffsetPx.x,
      y: lens.frameHeight / 2 + releaseOffsetPx.y,
      diameterPx: Math.max(0.1, diameterTrue + noise),
    });

    // 공기저항이 있으면 조금씩 느려진다.
    const speed = speed0 * Math.exp(-dragPerSec * t);
    const step = speed * dt;
    distance += step;
    traveled += step;
    t += dt;
  }

  const first = trueDistances[0];
  const last = trueDistances[trueDistances.length - 1];
  const trueAverageKmh = ((last.z - first.z) / (last.t - first.t)) * 3.6;

  return { observations, trueAverageKmh, trueDistances };
}
