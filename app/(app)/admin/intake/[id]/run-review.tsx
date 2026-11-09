'use client';

import { lazy, Suspense, useState } from 'react';
import { Eye } from '@/components/icon';
import { ErrorLine } from '@/components/error-line';
import { Modal } from '@/components/modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui';
import type { PublicResult } from '@/lib/intake/public-result';
import { seoulDateKey } from '@/lib/intake/paths';
import { acknowledgeIntakeRunReview, getIntakeRunReview } from '@/app/actions/intake-admin';
import { useAction } from './use-action';

/* 받는 사람 화면 부품은 열 때만 불러온다 — 3D 보기(three)를 접수 화면 묶음에서 빼고, 상세 화면 시험(node)이 next/dynamic 을 안 불러도 되게 */
const ResultBody = lazy(() => import('@/components/intake/result-view').then((m) => ({ default: m.ResultBody })));

type Shown = { result: PublicResult; revisionNumber: number; isCurrentRevision: boolean; resultDigest: string; currentRevisionId: string | null };

/**
 * 공개 전 3D 검토(INTAKE-MAIN/R01) — 성공한 실행의 결과를 받는 사람이 볼 모양 그대로 연다. 3D 보기는 공개 화면과 같은 부품(ResultBody → Body3D)이다.
 * 여는 것은 검토가 아니다. 3D 가 실제로 그릴 준비가 된 뒤(ResultBody onReadyChange) 관리자가 '이 결과 검토 완료'를 눌러야
 * 서버가 그 관리자 · 그 결과 해시 · 그 판에 묶은 검토 완료를 남기고(acknowledgeIntakeRunReview), 공개 단추가 그 번호로 켜진다.
 * 공개는 서버가 이 번호를 잠금 안에서 다시 맞춰 본다 — 화면의 기억만으로 공개되지 않는다.
 * 설명은 공개할 때 적는 글을 그대로 넘겨 받는 사람 화면과 같게 보인다(설명은 검토 묶음에 안 들어간다).
 */
export function RunReview({
  submissionId,
  runId,
  explanation,
  acknowledged,
  onAcknowledged,
}: {
  submissionId: string;
  runId: string;
  explanation: string;
  /** 이 화면에서 이미 검토 완료를 받았나 */
  acknowledged: boolean;
  onAcknowledged: (acknowledgementId: string) => void;
}) {
  const opening = useAction();
  const acking = useAction();
  const [shown, setShown] = useState<Shown | null>(null);
  const [ready, setReady] = useState(false);
  const open = () => {
    setReady(false);
    opening.run(
      () => getIntakeRunReview(submissionId, runId),
      (r) =>
        setShown({
          result: { version: 0, athleteName: r.athleteName || '이름 미입력', explanation: null, resultDate: seoulDateKey(new Date()), view: r.view },
          revisionNumber: r.revisionNumber,
          isCurrentRevision: r.isCurrentRevision,
          resultDigest: r.resultDigest,
          currentRevisionId: r.currentRevisionId,
        }),
    );
  };
  const close = () => {
    setShown(null);
    setReady(false);
  };
  const acknowledge = () => {
    if (!shown || !ready) return;
    acking.run(
      () => acknowledgeIntakeRunReview(submissionId, runId, shown.resultDigest, shown.currentRevisionId),
      (r) => {
        onAcknowledged(r.acknowledgementId);
        close();
        toast('검토 완료를 남겼어요. 이제 공개할 수 있어요');
      },
    );
  };
  return (
    <>
      <Button type="button" variant="secondary" size="sm" disabled={opening.pending} onClick={open}>
        <Eye aria-hidden className="h-4 w-4" />
        {opening.pending ? '여는 중…' : acknowledged ? '3D 결과 다시 보기' : '3D 결과 검토'}
      </Button>
      {opening.error && <ErrorLine>{opening.error}</ErrorLine>}
      <Modal
        open={shown != null}
        onClose={close}
        size="page"
        title={shown ? `${shown.revisionNumber}판 결과 검토${shown.isCurrentRevision ? '' : ' · 옛 판'}` : '결과 검토'}
        description="받는 사람이 볼 모양 그대로예요. 결과일은 공개한 날로 바뀌어요."
      >
        {shown && (
          <>
            <Suspense fallback={<p className="text-sm text-muted">결과를 불러오는 중…</p>}>
              <ResultBody preview result={{ ...shown.result, explanation: explanation.trim() || null }} onReadyChange={setReady} />
            </Suspense>
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-5 pb-6 lg:px-8">
              <Button type="button" size="sm" disabled={!ready || acking.pending} onClick={acknowledge}>
                {acking.pending ? '남기는 중…' : '이 결과 검토 완료'}
              </Button>
              <p className="text-xs text-muted break-keep">
                {ready
                  ? '3D 를 돌려 보고 숫자를 확인한 뒤 눌러 주세요. 누르면 이 결과를 검토했다고 기록돼요.'
                  : '3D 가 다 그려지면 누를 수 있어요. 그릴 수 없거나 실패하면 검토를 마칠 수 없어요.'}
              </p>
              {acking.error && <ErrorLine>{acking.error}</ErrorLine>}
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
