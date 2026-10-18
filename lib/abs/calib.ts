/**
 * 플레이트 보정 — 카메라 자세(세상 ↔ 카메라)를 **플레이트 앞변 양끝 + 폰 기울기 센서**로 정한다.
 *
 * 왜 오각형 다섯 모서리가 아닌가(2026-10-18 P1 에서 바꿈): 투수 뒤 3~5m · 높이 1.4m · 2배(f ≈ 2,790px)에서 21.5m 앞 플레이트는 가로 56px 인데
 * 세로(앞뒤 깊이 43cm)는 f·0.431·(1.4/21.5)/21.5 ≈ **3.6px** 다. 다섯 모서리 호모그래피는 조건이 나빠 자세가 튄다. 대신
 *   - 앞변 폭(px) → 플레이트까지 깊이 Z = f·W/w_px(0.3px 오차 → 0.5% → 0.1m),
 *   - 앞변 가운데 픽셀 → 플레이트 방향,
 *   - 폰 기울기 센서(deviceorientation, lib/use-device-level.ts) → 숙임(pitch) · 좌우 기울기(roll),
 *   - 플레이트 앞변이 카메라 → 플레이트 선과 직각이라고 둔다(yaw 0). 카메라가 0.5m 옆에 있으면 1.3° 어긋나는데 통과점 좌우에는 Δz·sin 1.3° ≈ 수 mm.
 * 숙임 센서 오차(0.5°)는 공 높이에 거의 안 번진다 — 높이는 '플레이트 바닥 픽셀과의 차 × Z/f' 라 같은 각 오차가 둘 다에 들어 상쇄되고,
 * 남는 것은 깊이 차(통과 면 − 플레이트 앞변 ≈ 0.2m) × 각 오차 ≈ 2mm 다(합성 시험대 '보정 나쁨' 줄).
 *
 * 좌표: 세상은 zone.ts(원점 플레이트 꼭지 · x 1루 · y 위 · z 투수 쪽), 카메라는 엔진(xc 오른쪽 · yc 아래 · zc 앞). 픽셀은 원본(source) px.
 */
import { PLATE_DEPTH_M, PLATE_WIDTH_M } from './rules.ts';
import { type CameraPose, type Vec3, worldToCam } from './cross.ts';

export type Pixel = [number, number];

export type CalibInput = {
  /** 플레이트 앞변 왼쪽 · 오른쪽 끝(원본 px) — 투수 뒤에서 본 왼쪽 = 3루 쪽 */
  frontLeft: Pixel;
  frontRight: Pixel;
  /** 초점거리(원본 px) · 원본 크기 */
  focalPx: number;
  width: number;
  height: number;
  /** 카메라가 아래로 숙인 각(라디안, 아래 +) — 기울기 센서의 pitch 는 위가 + 라 부호를 뒤집어 넘긴다 */
  tiltDown: number;
  /** 좌우 기울기(라디안, 오른쪽이 내려가면 +) */
  roll?: number;
};

export type Calib = {
  pose: CameraPose;
  focalPx: number;
  cx: number;
  cy: number;
  /** 카메라에서 플레이트 앞변까지 깊이(m, 광축 방향) */
  plateDepthM: number;
  /** 카메라 높이 · 카메라 ↔ 플레이트 꼭지 수평 거리(m) */
  cameraHeightM: number;
  cameraDistanceM: number;
  /** 카메라의 옆 비킴(m, +x = 1루 쪽) */
  lateralOffsetM: number;
  ok: boolean;
  reasons: string[];
};

/** 카메라 자세 — 숙임 · 롤 · 요(라디안). 앞(zc)은 −z, 요 + 는 오른쪽(+x)으로 돌아 봄, 롤 + 는 오른쪽이 내려감 */
export function poseFromAngles(position: Vec3, tiltDown: number, roll = 0, yaw = 0): CameraPose {
  const ct = Math.cos(tiltDown);
  const st = Math.sin(tiltDown);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const zc: Vec3 = [sy * ct, -st, -cy * ct];
  const x0: Vec3 = [cy, 0, sy];
  const y0: Vec3 = cross(zc, x0);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  /* 롤: 광축을 중심으로 오른쪽 · 아래 축을 돌린다 — 오른쪽이 내려가면 xc 가 yc 쪽으로 기운다 */
  const xc: Vec3 = [x0[0] * cr + y0[0] * sr, x0[1] * cr + y0[1] * sr, x0[2] * cr + y0[2] * sr];
  const yc: Vec3 = [y0[0] * cr - x0[0] * sr, y0[1] * cr - x0[1] * sr, y0[2] * cr - x0[2] * sr];
  return { position, R: [xc, yc, zc] };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** 카메라 좌표(m) → 원본 픽셀 */
export function projectCam(pc: Vec3, c: Pick<Calib, 'focalPx' | 'cx' | 'cy'>): Pixel | null {
  if (!(pc[2] > 0.05)) return null;
  return [c.cx + (c.focalPx * pc[0]) / pc[2], c.cy + (c.focalPx * pc[1]) / pc[2]];
}

export function projectWorld(pw: Vec3, c: Calib): Pixel | null {
  return projectCam(worldToCam(pw, c.pose), c);
}

/** 픽셀 → 세상 좌표의 반직선(카메라 자리에서 방향 단위 벡터) */
export function rayFromPixel(px: Pixel, c: Calib): { origin: Vec3; dir: Vec3 } {
  const dc: Vec3 = [(px[0] - c.cx) / c.focalPx, (px[1] - c.cy) / c.focalPx, 1];
  const [R0, R1, R2] = c.pose.R;
  const d: Vec3 = [
    R0[0] * dc[0] + R1[0] * dc[1] + R2[0] * dc[2],
    R0[1] * dc[0] + R1[1] * dc[1] + R2[1] * dc[2],
    R0[2] * dc[0] + R1[2] * dc[1] + R2[2] * dc[2],
  ];
  const n = Math.hypot(...d);
  return { origin: c.pose.position, dir: [d[0] / n, d[1] / n, d[2] / n] };
}

/** 픽셀이 지면(y = 0)에 닿는 세상 점 — 발 자리로 깊이를 재는 단서. 지면 위를 보는 픽셀이면 null */
export function groundPointFromPixel(px: Pixel, c: Calib): Vec3 | null {
  const { origin, dir } = rayFromPixel(px, c);
  if (!(dir[1] < -1e-6)) return null;
  const s = -origin[1] / dir[1];
  return [origin[0] + dir[0] * s, 0, origin[2] + dir[2] * s];
}

/** 픽셀이 z = zPlane 면에 닿는 세상 점(깊이를 아는 면 위의 점 — 존을 그릴 때 거꾸로 확인) */
export function planePointFromPixel(px: Pixel, zPlane: number, c: Calib): Vec3 | null {
  const { origin, dir } = rayFromPixel(px, c);
  if (!(dir[2] < -1e-6)) return null;
  const s = (zPlane - origin[2]) / dir[2];
  return [origin[0] + dir[0] * s, origin[1] + dir[1] * s, zPlane];
}

/**
 * 보정 — 앞변 양끝 · f · 기울기로 카메라 자세를 정한다.
 * 플레이트 앞변 가운데는 세상 (0, 0, PLATE_DEPTH_M). 앞변 폭이 Z 를, 가운데 픽셀이 방향을 준다.
 */
export function calibFromPlate(input: CalibInput): Calib {
  const { frontLeft: L, frontRight: R, focalPx: f, width, height } = input;
  const cx = width / 2;
  const cy = height / 2;
  const reasons: string[] = [];
  const wPx = Math.hypot(R[0] - L[0], R[1] - L[1]);
  const base = { focalPx: f, cx, cy };
  if (!(wPx > 4)) {
    return {
      pose: poseFromAngles([0, 1.4, 22], input.tiltDown, input.roll ?? 0),
      ...base,
      plateDepthM: NaN,
      cameraHeightM: NaN,
      cameraDistanceM: NaN,
      lateralOffsetM: 0,
      ok: false,
      reasons: ['플레이트 앞변이 너무 짧아요'],
    };
  }
  /* 앞변 양끝은 거의 같은 깊이 — 폭(px)에서 깊이 */
  const Z = (f * PLATE_WIDTH_M) / wPx;
  const mid: Pixel = [(L[0] + R[0]) / 2, (L[1] + R[1]) / 2];
  const pc: Vec3 = [((mid[0] - cx) / f) * Z, ((mid[1] - cy) / f) * Z, Z];
  /* 자세(회전)는 센서로, 자리는 '앞변 가운데가 세상 (0,0,depth)' 가 되게 */
  const R0 = poseFromAngles([0, 0, 0], input.tiltDown, input.roll ?? 0);
  const [a, b, c] = R0.R;
  const pwRel: Vec3 = [
    a[0] * pc[0] + b[0] * pc[1] + c[0] * pc[2],
    a[1] * pc[0] + b[1] * pc[1] + c[1] * pc[2],
    a[2] * pc[0] + b[2] * pc[1] + c[2] * pc[2],
  ];
  const position: Vec3 = [0 - pwRel[0], 0 - pwRel[1], PLATE_DEPTH_M - pwRel[2]];
  const pose = poseFromAngles(position, input.tiltDown, input.roll ?? 0);
  const cameraHeightM = position[1];
  const cameraDistanceM = Math.hypot(position[0], position[2]);
  if (!(cameraHeightM > 0.5 && cameraHeightM < 3)) reasons.push('카메라 높이가 0.5~3m 밖이에요');
  if (!(cameraDistanceM > 10 && cameraDistanceM < 30)) reasons.push('플레이트까지 거리가 10~30m 밖이에요');
  if (Math.abs(position[0]) > 2) reasons.push('카메라가 투수판 선에서 2m 넘게 비켜 있어요');
  return {
    pose,
    ...base,
    plateDepthM: Z,
    cameraHeightM,
    cameraDistanceM,
    lateralOffsetM: position[0],
    ok: reasons.length === 0,
    reasons,
  };
}

/** 세상 플레이트 다섯 모서리(앞왼 · 앞오 · 뒤오 · 꼭지 · 뒤왼) */
export const PLATE_CORNERS_WORLD: Vec3[] = (() => {
  const half = PLATE_WIDTH_M / 2;
  const backZ = PLATE_DEPTH_M - 0.2159;
  return [
    [-half, 0, PLATE_DEPTH_M],
    [half, 0, PLATE_DEPTH_M],
    [half, 0, backZ],
    [0, 0, 0],
    [-half, 0, backZ],
  ];
})();

/** 존 상자 여덟 모서리 · 플레이트 다섯 모서리를 픽셀로 — 화면이 그린다 */
export function zonePolygonPx(
  box: { left: number; right: number; bottom: number; top: number; zFront: number; zBack: number },
  c: Calib
): { front: Pixel[]; back: Pixel[]; plate: Pixel[] } | null {
  const corners = (z: number): Vec3[] => [
    [box.left, box.top, z],
    [box.right, box.top, z],
    [box.right, box.bottom, z],
    [box.left, box.bottom, z],
  ];
  const f = corners(box.zFront).map((p) => projectWorld(p, c));
  const b = corners(box.zBack).map((p) => projectWorld(p, c));
  const pl = PLATE_CORNERS_WORLD.map((p) => projectWorld(p, c));
  if (f.some((p) => !p) || b.some((p) => !p) || pl.some((p) => !p)) return null;
  return { front: f as Pixel[], back: b as Pixel[], plate: pl as Pixel[] };
}
