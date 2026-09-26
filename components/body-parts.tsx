'use client';

import { useCallback, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Modal, useModalState } from '@/components/modal';
import {
  BodyPartsContext,
  isBodyPart,
  type OpenBodyParts,
} from '@/components/body-parts-context';
import type { BodyPart } from '@/lib/exercise-meta';

/*
 * 창의 본문(전신 3D · 부위 설명)은 창을 처음 열 때 받는다 — components/body-parts-view.tsx.
 * 받는 동안은 3D 자리만큼 비워 둔다. 자리가 없다가 생기면 창이 한 번 크게 튄다.
 */
const BodyPartsView = dynamic(
  () => import('@/components/body-parts-view').then((m) => m.BodyPartsView),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden
        className="h-[min(46vh,380px)] min-h-[260px] rounded-2xl bg-surface-2 motion-safe:animate-pulse"
      />
    ),
  }
);

/** 창에 띄운 것 — 그 운동의 부위들과 지금 켠 것 */
export type BodyPartsShown = { parts: BodyPart[]; current: BodyPart | 'all' };

/**
 * 운동의 부위 태그를 누르면 뜨는 창 — 전신 3D 에서 그 부위의 근육을 켜고 한두 줄 설명.
 *
 * 2026-09-26 사용자분: 암케어 운동처럼 다른 운동 영상에서도 키워드를 누르면 그 부위의
 * 그래픽이 보이게. 다른 운동에는 근육 이름이 없고 부위 태그(ExerciseVideo.bodyParts)만 있어
 * 부위 단위로 켠다(lib/body-map.ts). 그 운동의 부위가 여럿이면 창 위의 칩으로 오가고,
 * '모두'로 한꺼번에 본다 — 이 운동이 어디를 쓰는지 한 번에.
 *
 * 창은 하나만 둔다. 3D 는 창이 떠 있는 동안만 만든다 — 닫으면(닫히는 움직임이 끝난 뒤)
 * 치운다(components/modal.tsx 의 useModalState). 여는 함수는 components/body-parts-context.ts.
 */
export function BodyPartsProvider({ children }: { children: ReactNode }) {
  const modal = useModalState<BodyPartsShown>();
  const { show, setContent } = modal;
  const shown = modal.content;

  const open = useCallback<OpenBodyParts>(
    (parts, current, e) => show({ parts: parts.filter(isBodyPart), current }, e),
    [show]
  );

  return (
    <BodyPartsContext.Provider value={open}>
      {children}
      <Modal
        open={modal.open}
        onClose={modal.close}
        title={
          !shown ? '' : shown.current === 'all' ? '이 운동이 쓰는 부위' : shown.current
        }
        description={
          !shown
            ? undefined
            : shown.current === 'all'
              ? shown.parts.join(' · ')
              : undefined
        }
        origin={modal.origin}
      >
        {shown && (
          <BodyPartsView
            shown={shown}
            onChange={(current) => setContent({ ...shown, current })}
          />
        )}
      </Modal>
    </BodyPartsContext.Provider>
  );
}
