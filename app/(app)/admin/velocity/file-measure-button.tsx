'use client';

import { Film } from 'lucide-react';
import { Modal, useModalState } from '@/components/modal';
import { Button } from '@/components/ui';
import { FileMeasure } from './file-measure';

/**
 * '영상 파일로 재기' — 탐색기의 '새로 만들기'처럼 머리 줄 단추에서 창을 연다.
 * 폰으로 찍어 둔 슬로모션 영상을 골라 재고 보정용으로 저장한다(file-measure.tsx).
 */
export function FileMeasureButton() {
  const modal = useModalState<true>();
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="w-full sm:w-auto"
        onClick={(e) => modal.show(true, e)}
      >
        <Film aria-hidden className="h-4 w-4" />
        영상 파일로 재기
      </Button>
      <Modal
        open={modal.open}
        onClose={modal.close}
        origin={modal.origin}
        size="wide"
        title="영상 파일로 재기(보정용)"
        description="폰으로 찍어 둔 슬로모션 영상을 골라 재고, 스피드건 값과 함께 보정용으로 저장해요. 영상은 그 공의 파일로 함께 올라가요."
      >
        {modal.content && (
          <div className="px-5 py-4">
            <FileMeasure onOpenSaved={modal.close} />
          </div>
        )}
      </Modal>
    </>
  );
}
