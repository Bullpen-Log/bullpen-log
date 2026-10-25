/** App Store 참고 영상: 평상시 52pt 선택판, 잡으면 약 1.2 x 1.5배 유리 렌즈. */
export const TAB_MOTION = {
  height: 52,
  dragThreshold: 6,
  liftDuration: 140,
  liftX: 0.22,
  liftY: 0.46,
  releaseMargin: 32,
  acknowledgeMs: 1800,
  positionSpring: { stiffness: 620, damping: 44, mass: 1 },
  releaseSpring: { stiffness: 520, damping: 36, mass: 1 },
  liftSpring: { stiffness: 540, damping: 38, mass: 1 },
} as const;

/** row의 좌표다. 바깥 알약의 padding을 다시 빼면 끝 칸에서 어긋난다. */
export function tabIndexAt(x: number, cell: number, count: number): number {
  'worklet';
  if (!Number.isFinite(x) || cell <= 0 || count <= 0) return -1;
  return Math.max(0, Math.min(count - 1, Math.floor(x / cell)));
}

/** 손가락을 댄 자리와 칸 중심의 차이를 보존해서, 끌기 시작할 때 렌즈가 튀지 않는다. */
export function tabDragPosition(x: number, grabOffset: number, cell: number, count: number): number {
  'worklet';
  if (!Number.isFinite(x) || cell <= 0 || count <= 0) return 0;
  const raw = (x - grabOffset) / cell - 0.5;
  const clamped = Math.max(0, Math.min(count - 1, raw));
  // 양 끝에서는 조금만 늘어나며 저항한다. 아무리 멀리 끌어도 0.2칸을 넘지 않는다.
  const extra = raw - clamped;
  return clamped + (extra / (1 + Math.abs(extra) * 5)) * 0.8;
}

/** 크게 벗어나 놓거나 제스처가 취소되면 화면을 바꾸지 않는다. */
export function tabReleaseIndex(x: number, y: number, position: number, cell: number, count: number): number {
  'worklet';
  const margin = TAB_MOTION.releaseMargin;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(position) || cell <= 0 || count <= 0) return -1;
  if (x < -margin || x > cell * count + margin || y < -margin || y > TAB_MOTION.height + margin) return -1;
  return Math.max(0, Math.min(count - 1, Math.round(position)));
}
