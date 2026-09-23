/**
 * 화면이 보낸 '누른 시각'을 믿을 만한 범위로 자른다.
 *
 * 신호가 없어 폰에 담아 둔 세트는 한참 뒤에 보내진다 (lib/workout/outbox.ts).
 * 받은 시각으로 남기면 휴식 시계와 세트 순서가 그만큼 밀리므로, 누른 시각을
 * 함께 받아 그대로 남긴다.
 *
 * 다만 폰 시계는 몇 분 틀릴 수 있다. 판을 연 시각보다 앞이면 연 시각으로,
 * 지금보다 뒤면 지금으로 맞춘다. 읽을 수 없는 값이면 지금이다.
 */
export function clampRecordedAt(
  value: unknown,
  startedAt: Date,
  now = new Date()
): Date {
  const t = typeof value === 'string' ? new Date(value) : null;
  if (!t || Number.isNaN(t.getTime())) return now;
  if (t > now) return now;
  if (t < startedAt) return startedAt;
  return t;
}
