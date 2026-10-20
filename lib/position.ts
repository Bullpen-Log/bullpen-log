/**
 * 포지션 · 치는 손 — 타격 1단계(2026-10-20, docs/designs/hitting-restructure.md).
 *
 * User.position 은 비어 있으면 투수로 본다 — 이 칸이 생기기 전 회원은 모두 투구만 쓰던 사람이다.
 * 1단계는 화면(타자면 투구 전용 카드 숨김)만 이것을 본다. 운동 엔진 갈래는 2단계(D2).
 */

export const POSITIONS = ['pitcher', 'hitter', 'two-way'] as const;
export type Position = (typeof POSITIONS)[number];

export const POSITION_LABEL: Record<Position, string> = {
  pitcher: '투수',
  hitter: '타자',
  'two-way': '투타 겸업',
};

export const BATTING_HANDS = ['R', 'L', 'S'] as const;
export type BattingHand = (typeof BATTING_HANDS)[number];

export const BATTING_HAND_LABEL: Record<BattingHand, string> = {
  R: '우타',
  L: '좌타',
  S: '스위치',
};

export function isPosition(v: unknown): v is Position {
  return typeof v === 'string' && (POSITIONS as readonly string[]).includes(v);
}

export function isBattingHand(v: unknown): v is BattingHand {
  return typeof v === 'string' && (BATTING_HANDS as readonly string[]).includes(v);
}

/** 저장된 값을 읽는다 — 비었거나 모르는 값이면 투수 */
export function positionOf(user: { position: string | null }): Position {
  return isPosition(user.position) ? user.position : 'pitcher';
}

/** 투구 전용 화면(던지는 일정 · 팔 상태 · 암케어 권유)을 보일 사람인가 — 타자만 하는 사람은 빼고 */
export function pitches(user: { position: string | null }): boolean {
  return positionOf(user) !== 'hitter';
}
