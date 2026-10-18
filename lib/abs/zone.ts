/**
 * 스트라이크 존 — 세상 좌표(m)의 상자. 픽셀이 아니다.
 *
 * 좌표계(ABS 세상): 원점 = 홈플레이트 꼭지(뒤 끝)의 지면, x = 1루 쪽(+), y = 위(+), z = 투수 쪽(+).
 * 투수 뒤 카메라에서 보면 화면 오른쪽이 +x 다(투수가 보는 1루가 오른쪽). 포수 뒤면 좌우가 뒤집힌다(cellOf 의 cameraPos).
 */
import { BALL_RADIUS_M, PLATE_DEPTH_M, PLATE_WIDTH_M, type RuleSet } from './rules.ts';

export type ZoneBox = {
  left: number;
  right: number;
  bottom: number;
  top: number;
  /** 플레이트 앞면 · 중간면 · 꼭지의 z(m) — 꼭지가 원점이라 zBack = 0 */
  zFront: number;
  zMid: number;
  zBack: number;
};

export function zoneWorld(heightCm: number, rule: RuleSet): ZoneBox {
  const h = heightCm / 100;
  const half = PLATE_WIDTH_M / 2 + rule.sideMarginM;
  return {
    left: -half,
    right: half,
    bottom: h * rule.bottomPct,
    top: h * rule.topPct,
    zFront: PLATE_DEPTH_M,
    zMid: PLATE_DEPTH_M / 2,
    zBack: 0,
  };
}

/** 규칙이 판정하는 면의 z(m) — 'both' 는 앞면(1차는 앞면 하나만 더 보수적으로 본다 · P5 에서 둘 다) */
export function judgePlaneZ(box: ZoneBox, rule: RuleSet): number {
  return rule.judgePlane === 'mid' ? box.zMid : box.zFront;
}

/**
 * 공 중심(x, y)이 존의 몇 번째 칸인가 — 1~9, 투수 시점 왼쪽 위부터(`lib/velocity-setup.ts zoneOfPoint` 와 같은 번호).
 * 투수 뒤: 화면 왼쪽 = −x. 포수 뒤: 뒤집힘. 밖이면 null.
 */
export function cellOf(
  x: number,
  y: number,
  box: ZoneBox,
  cameraPos: 'behind-pitcher' | 'behind-catcher' = 'behind-pitcher'
): number | null {
  const u = (x - box.left) / (box.right - box.left);
  const v = (box.top - y) / (box.top - box.bottom);
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
  let col = Math.min(2, Math.floor(u * 3));
  const row = Math.min(2, Math.floor(v * 3));
  if (cameraPos === 'behind-catcher') col = 2 - col;
  return row * 3 + col + 1;
}

/**
 * 가장 가까운 세로 · 가로 가장자리에서 공 중심까지의 변위(m) — dx 는 오른쪽 +, dy 는 위 +(가장자리에서 어느 쪽으로 얼마나 떨어졌나).
 * 밖이면 가장자리 바깥쪽으로 부호가 나고(오른쪽 밖 +dx · 왼쪽 밖 −dx · 위 밖 +dy · 아래 밖 −dy), 안이면 가장자리 안쪽으로 난다.
 * edge: 가장자리까지 거리(m) — 안쪽이면 음수, 모서리 밖이면 모서리까지 직선 거리. inside 는 공 중심 기준.
 */
export function edgeDistance(
  x: number,
  y: number,
  box: ZoneBox
): { dx: number; dy: number; edge: number; inside: boolean } {
  const dxOut = x > (box.left + box.right) / 2 ? x - box.right : box.left - x;
  const dyOut = y > (box.bottom + box.top) / 2 ? y - box.top : box.bottom - y;
  const inside = dxOut <= 0 && dyOut <= 0;
  const edge = inside ? Math.max(dxOut, dyOut) : Math.hypot(Math.max(0, dxOut), Math.max(0, dyOut));
  return {
    dx: x > (box.left + box.right) / 2 ? dxOut : -dxOut,
    dy: y > (box.bottom + box.top) / 2 ? dyOut : -dyOut,
    edge,
    inside,
  };
}

/** 공의 일부가 존에 걸치나(any-part) · 중심이 들어오나(center) */
export function ballInZone(x: number, y: number, box: ZoneBox, rule: RuleSet): boolean {
  const r = rule.ballCountsIf === 'any-part' ? BALL_RADIUS_M : 0;
  return x + r >= box.left && x - r <= box.right && y + r >= box.bottom && y - r <= box.top;
}
