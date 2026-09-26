'use client';

import { createContext, useContext } from 'react';
import type { ArmcareAreaKey } from '@/lib/armcare/anatomy';

/** 무엇을 자세히 볼까 — 부위 하나, 또는 근육 하나(3D 에서 누른 조각이 있으면 그것도) */
export type InfoTarget =
  | { kind: 'area'; key: ArmcareAreaKey }
  | { kind: 'muscle'; name: string; part?: string | null };

/** 창을 연다 — e 를 주면 그 단추 자리에서 날아온다(components/modal.tsx 의 origin) */
export type ShowArmcareInfo = (
  target: InfoTarget,
  e?: { currentTarget: Element } | null
) => void;

/**
 * 부위·근육 '자세히 보기' 창을 여는 함수. 창은 app/(app)/training/armcare-info.tsx 의
 * ArmcareInfoProvider 가 띄운다.
 *
 * 여는 함수만 여기 따로 둔다 — 근육 칩(components/muscle-chips.tsx)처럼 여러 화면이 쓰는
 * 작은 부품이 창의 글·3D 까지 끌고 오지 않게.
 */
export const ArmcareInfoContext = createContext<ShowArmcareInfo | null>(null);

/**
 * 자세히 보기 창을 여는 함수 — ArmcareInfoProvider 밖이면 null.
 *
 * 근육 칩은 창이 있는 화면에서만 누를 수 있게 하고, 없는 화면에서는 글자 칩으로 둔다.
 */
export function useArmcareInfo() {
  return useContext(ArmcareInfoContext);
}
