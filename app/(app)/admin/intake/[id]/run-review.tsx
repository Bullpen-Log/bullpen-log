'use client';

import { lazy, Suspense, useState } from 'react';
import { Eye } from '@/components/icon';
import { ErrorLine } from '@/components/error-line';
import { Modal } from '@/components/modal';
import { Button } from '@/components/ui';
import type { PublicResult } from '@/lib/intake/public-result';
import { seoulDateKey } from '@/lib/intake/paths';
import { getIntakeRunReview } from '@/app/actions/intake-admin';
import { useAction } from './use-action';

/* 받는 사람 화면 부품은 열 때만 불러온다 — 3D 보기(three)를 접수 화면 묶음에서 빼고, 상세 화면 시험(node)이 next/dynamic 을 안 불러도 되게 */
const ResultBody = lazy(() => import('@/components/intake/result-view').then((m) => ({ default: m.ResultBody })));

/**
 * 공개 전 3D 검토(2026-11-09) — 성공한 실행의 결과를 받는 사람이 볼 모양 그대로 연다. 3D 보기는 공개 화면과 같은 부품(ResultBody → Body3D)이다.
 * 공개 단추는 이 실행을 한 번 연 뒤에 켜진다(RunItem). 이 화면의 기억일 뿐 서버가 막는 규칙은 아니다 — 무엇을 열었는지는 감사 기록('run.reviewed')이 남긴다.
 * 설명은 공개할 때 적는 글을 그대로 넘겨 받는 사람 화면과 같게 보인다.
 */
export function RunReview({ submissionId, runId, explanation, onReviewed }: { submissionId: string; runId: string; explanation: string; onReviewed: () => void }) {
  const { pending, error, run } = useAction();
  const [shown, setShown] = useState<{ result: PublicResult; revisionNumber: number; isCurrentRevision: boolean } | null>(null);
  const open = () =>
    run(
      () => getIntakeRunReview(submissionId, runId),
      (r) => {
        setShown({
          result: { version: 0, athleteName: r.athleteName || '이름 미입력', explanation: null, resultDate: seoulDateKey(new Date()), view: r.view },
          revisionNumber: r.revisionNumber,
          isCurrentRevision: r.isCurrentRevision,
        });
        onReviewed();
      },
    );
  return (
    <>
      <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={open}>
        <Eye aria-hidden className="h-4 w-4" />
        {pending ? '여는 중…' : '3D 결과 검토'}
      </Button>
      {error && <ErrorLine>{error}</ErrorLine>}
      <Modal
        open={shown != null}
        onClose={() => setShown(null)}
        size="page"
        title={shown ? `${shown.revisionNumber}판 결과 검토${shown.isCurrentRevision ? '' : ' · 옛 판'}` : '결과 검토'}
        description="받는 사람이 볼 모양 그대로예요. 결과일은 공개한 날로 바뀌어요."
      >
        {shown && (
          <Suspense fallback={<p className="text-sm text-muted">결과를 불러오는 중…</p>}>
            <ResultBody preview result={{ ...shown.result, explanation: explanation.trim() || null }} />
          </Suspense>
        )}
      </Modal>
    </>
  );
}
