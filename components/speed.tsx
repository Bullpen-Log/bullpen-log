'use client';

import { formatSpeed } from '@/lib/units';
import { useSpeedUnit } from '@/components/use-units';

/**
 * 구속 하나를 고른 단위로 적는다 — '145.3km/h' 또는 '90.3mph'.
 *
 * 서버에서 그리는 화면에서도 쓸 수 있게 부품으로 둔다. 단위는 브라우저에만
 * 있는 값이라 서버가 알 수 없는데, 이 한 조각만 화면 쪽으로 넘기면 나머지는
 * 서버가 그대로 그려도 된다.
 */
export function Speed({ kmh }: { kmh: number | null | undefined }) {
  const unit = useSpeedUnit();
  const text = formatSpeed(kmh, unit);
  return text ? <>{text}</> : null;
}
