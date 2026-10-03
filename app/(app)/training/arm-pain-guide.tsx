'use client';

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Modal, useModalState } from '@/components/modal';
import { ModalBodyBoundary } from '@/components/modal-body-boundary';
import { armPainLevelLabel, armPainSpotLabel } from '@/lib/checkin';
import type { ArmcareAreaKey } from '@/lib/armcare/anatomy';

/*
 * 시트의 본문(부상 · 증상 글)은 시트를 처음 열 때 받는다 — arm-pain-guide-body.tsx.
 *
 * 이 단추는 체크인 요약(components/checkin-form.tsx)에도 서는데, 체크인 폼은 모든 화면에 실린다.
 * 부위 설명 글(lib/armcare/anatomy.ts · details.ts)을 단추와 함께 실으면 아픈 날이 아닌 대부분의
 * 방문에도 그 글을 받게 된다. '자세히 보기' 창(armcare-info.tsx)과 같은 방식이다.
 */
const ArmPainGuideBody = dynamic(
  () => import('./arm-pain-guide-body').then((m) => m.ArmPainGuideBody),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden
        className="h-64 rounded-2xl bg-surface-2 motion-safe:animate-pulse"
      />
    ),
  }
);

/** 시트가 보여 줄 오늘의 팔 통증 */
export type ArmPainView = {
  /** 고른 자리 — 오늘 '통증'인 관절의 것만(lib/checkin.ts 의 armPainSpotsFor) */
  spots: readonly ArmcareAreaKey[];
  /** 정도 1~3. 안 골랐으면 null */
  level: number | null;
  /** 만 나이. 모르면 null — 만 15세 미만이면 '오늘은'이 진료를 권한다 */
  age: number | null;
};

/**
 * [통증 안내 보기] — 누르면 팔 통증 안내 시트가 뜬다(휴대폰은 아래에서 올라오는 시트, PC 는 가운데 창).
 *
 * 2026-10-03 팔 통증 안내(재활 1편). 두 곳에서 연다 — 체크인 요약의 통증 카드, 암케어 탭의 쉬기 ·
 * 통증 루틴 카드. 시트 안의 글은 lib/armcare/pain-guide.ts 에서 모은다.
 *
 * 체크인 창 안에서 열면 창 위에 창이 뜬다 — Modal 이 그 경우를 다룬다(바깥 창은 그대로 남는다).
 */
export function ArmPainGuideButton({
  pain,
  routineHref,
  onGo,
  className,
  children,
}: {
  pain: ArmPainView;
  /**
   * '오늘은'의 [통증 루틴 하기]가 갈 곳. 주지 않으면 단추를 내지 않는다 — 암케어 탭은 바로 그 자리에
   * 루틴이 있어서 단추가 필요 없다.
   */
  routineHref?: string;
  /** [통증 루틴 하기]로 떠날 때 — 감싸는 창(체크인 창)을 닫는 데 쓴다 */
  onGo?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const modal = useModalState<true>();
  const where = pain.spots.map((s) => armPainSpotLabel(s) ?? s).join(' · ');
  const level = armPainLevelLabel(pain.level);
  const description =
    [where, level].filter(Boolean).join(' · ') || '아픈 곳 · 정도를 고르지 않았어요';

  return (
    <>
      <button type="button" onClick={(e) => modal.show(true, e)} className={className}>
        {children}
      </button>
      <Modal
        open={modal.open}
        onClose={modal.close}
        title="팔 통증 안내"
        description={description}
        origin={modal.origin}
      >
        <ModalBodyBoundary resetKey={modal.open}>
          {modal.content && (
            <ArmPainGuideBody
              pain={pain}
              routineHref={routineHref}
              onGo={() => {
                modal.close();
                onGo?.();
              }}
            />
          )}
        </ModalBodyBoundary>
      </Modal>
    </>
  );
}
