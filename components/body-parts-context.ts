'use client';

import { createContext, useContext } from 'react';
import { BODY_PARTS, type BodyPart } from '@/lib/exercise-meta';

/** 부위 창을 연다 — 그 운동의 부위들, 누른 부위, 누른 단추(창이 거기서 날아오게) */
export type OpenBodyParts = (
  parts: readonly string[],
  current: BodyPart,
  e?: { currentTarget: Element } | null
) => void;

/**
 * 운동의 부위 태그를 누르면 뜨는 전신 3D 창을 여는 함수 — 창은 components/body-parts.tsx 의
 * BodyPartsProvider 가 띄운다.
 *
 * 여는 함수만 여기 따로 둔다. 운동 한 줄의 표시(components/meta-badges.tsx)는 거의 모든
 * 운동 화면에 실리는데, 그것이 창의 글(lib/body-map.ts)과 3D 까지 끌고 오지 않게.
 */
export const BodyPartsContext = createContext<OpenBodyParts | null>(null);

/** 부위 창을 여는 함수 — BodyPartsProvider 밖이면 null(그 화면의 부위는 글자로 둔다) */
export function useBodyParts() {
  return useContext(BodyPartsContext);
}

/**
 * 3D 로 볼 수 있는 부위 태그인가 — 앱의 부위 목록(BODY_PARTS)이면 모두 된다
 * (lib/body-map.ts 가 목록의 부위마다 켤 근육을 적어 둔다). 목록 밖 이름(옛 데이터)은 누를
 * 수 없는 글자로 둔다.
 */
export function isBodyPart(part: string): part is BodyPart {
  return (BODY_PARTS as readonly string[]).includes(part);
}
