/**
 * 폰 기울기 계산 — 중력 방향(폰 좌표: x 오른쪽 · y 위 · z 화면 밖)에서 좌우 · 앞뒤 기울기(도). 웹 수평계(lib/use-device-level.ts —
 * deviceorientation 의 β · γ)와 아이폰 앱(native/ — CoreMotion 중력, 같은 좌표)이 같이 쓴다.
 */
export type Vec = [number, number, number];

/**
 * β · γ(도) → 폰 좌표의 중력 방향(단위 벡터, x 오른쪽 · y 위 · z 화면 밖). 방향 회전은 Z-X'-Y''(W3C) —
 * g = R(α,β,γ)ᵀ·(0,0,−1) = (cosβ sinγ, −sinβ, −cosβ cosγ). α(나침반)는 중력과 상관없다.
 */
export function gravityOf(betaDeg: number, gammaDeg: number): Vec {
  const b = (betaDeg * Math.PI) / 180;
  const g = (gammaDeg * Math.PI) / 180;
  return [Math.cos(b) * Math.sin(g), -Math.sin(b), -Math.cos(b) * Math.cos(g)];
}

/**
 * 화면이 돌아간 만큼(screen.orientation.angle, 반시계) 중력을 화면 좌표로 — 가로로 들면 화면의 '위'가 폰의 옆이다.
 * 가로 90°(폰 위쪽이 왼쪽)면 화면 x = −폰 y, 화면 y = 폰 x.
 */
export function toScreen(g: Vec, angleDeg: number): Vec {
  const a = (angleDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [g[0] * c - g[1] * s, g[0] * s + g[1] * c, g[2]];
}

/** 화면 좌표의 중력 → 좌우 · 앞뒤 기울기(도) */
export function tiltOf(g: Vec): { roll: number; pitch: number } {
  const deg = 180 / Math.PI;
  return {
    roll: Math.atan2(g[0], -g[1]) * deg,
    pitch: Math.atan2(g[2], Math.hypot(g[0], g[1])) * deg,
  };
}

