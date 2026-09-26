'use client';

import { useContext, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Modal, useModalState } from '@/components/modal';
import { ArmcareInfoContext, type InfoTarget } from '@/components/armcare-info-context';
import {
  ARMCARE_MUSCLES,
  areaOfMuscle,
  findArmcareArea,
  muscleInfo,
} from '@/lib/armcare/anatomy';

/*
 * 창의 본문(3D 그림 · 긴 설명)은 창을 처음 열 때 받는다 — armcare-info-body.tsx.
 * 받는 동안은 3D 자리만큼 비워 둔다. 자리가 없다가 생기면 창이 한 번 크게 튄다.
 */
const ArmcareInfoBody = dynamic(
  () => import('./armcare-info-body').then((m) => m.ArmcareInfoBody),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden
        className="mb-5 h-[min(36vh,280px)] min-h-[220px] rounded-2xl bg-surface-2 motion-safe:animate-pulse"
      />
    ),
  }
);

/**
 * 부위·근육 '자세히 보기' 창 — 부위별 보강(3D 아래 칸과 부위 카드), 루틴, 내 루틴 만들기,
 * 라이브러리가 함께 쓴다.
 *
 * 2026-09-26 사용자분: "기본적인 인터페이스는 단순하지만 클릭을 했을 경우에는 자세한
 * 정보들을 확인할 수 있는 느낌". 화면에는 이름·칩·한 줄만 두고, 기능·던질 때 하는
 * 일·왜 중요한가·흔한 부상·키우는 법은 이 창에 모은다(글은 lib/armcare/details.ts).
 *
 * 창은 하나만 둔다. 부위 창의 근육을 누르면 같은 창이 그 근육으로 바뀌고, 근육 창의
 * '‹ 부위'로 돌아온다 — 창 위에 창을 겹치지 않는다.
 *
 * 창 맨 위에는 3D 그림이 선다 — 그 근육(부위)만 하늘색으로 켜진다. 운동마다 붙은 근육
 * 칩을 누르면 이 창이 뜬다(components/muscle-chips.tsx). 2026-09-26 사용자분: "불펜로그의
 * 가장 큰 장점은 간편함 — 운동마다 근육이 글로만 적혀 있는데, 누르면 그 부위의 그래픽이
 * 보이게". 그래서 부위별 보강 화면으로 옮겨 가지 않고 그 자리에서 뜬다. 3D 는 창이 떠 있는
 * 동안만 만든다 — 닫으면(닫히는 움직임이 끝난 뒤) 치운다.
 *
 * 여는 함수는 components/armcare-info-context.ts 에 따로 있다(useArmcareInfo).
 */
export function ArmcareInfoProvider({
  side = 'right',
  children,
}: {
  /**
   * 3D 에서 켤 팔 — 던지는 팔. 양투는 오른팔로 연다. 부위별 보강은 3D 지도에서 고른 팔을
   * 넘긴다(armcare-guide.tsx) — 왼팔로 바꿔 보다가 '자세히 보기'를 누르면 창도 왼팔이어야
   * 한다(2026-09-26 검토 — 예전에는 늘 오른팔로 열렸다).
   */
  side?: 'right' | 'left';
  children: ReactNode;
}) {
  const modal = useModalState<InfoTarget>();
  const { show, setContent } = modal;
  const shown = modal.content;
  const head = shown ? headingOf(shown) : { title: '', description: undefined };

  return (
    <ArmcareInfoContext.Provider value={show}>
      {children}
      <Modal
        open={modal.open}
        onClose={modal.close}
        title={head.title}
        description={head.description}
        origin={modal.origin}
      >
        {shown && <ArmcareInfoBody view={shown} side={side} onChange={setContent} />}
      </Modal>
    </ArmcareInfoContext.Provider>
  );
}

/** 누르면 자세히 보기 창을 여는 단추 — ArmcareInfoProvider 안에서만 쓴다 */
export function InfoButton({
  target,
  className,
  children,
}: {
  target: InfoTarget;
  className?: string;
  children: ReactNode;
}) {
  const show = useContext(ArmcareInfoContext);
  if (!show) throw new Error('InfoButton 은 ArmcareInfoProvider 안에서 쓴다');
  return (
    <button type="button" onClick={(e) => show(target, e)} className={className}>
      {children}
    </button>
  );
}

/** '자세히 보기 ›' — 부위·근육 어디서나 같은 모양으로 */
export const INFO_PILL =
  'inline-flex shrink-0 items-center gap-0.5 rounded-full border border-sky-soft bg-sky-tint px-3 py-1.5 text-xs font-semibold text-sky-strong transition-colors hover:bg-sky hover:text-white';

function headingOf(view: InfoTarget): { title: string; description?: string } {
  if (view.kind === 'area') {
    const area = findArmcareArea(view.key);
    const n = ARMCARE_MUSCLES.filter((m) => m.area === view.key).length;
    return {
      title: area?.label ?? '',
      description: area ? `${area.joint} · 근육 ${n}개` : undefined,
    };
  }
  const area = areaOfMuscle(view.name);
  const info = muscleInfo(view.name);
  return {
    title: view.name,
    description: area && info ? `${area.label} · ${info.does}` : undefined,
  };
}
