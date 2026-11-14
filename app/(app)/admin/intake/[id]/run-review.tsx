'use client';

import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import { Eye } from '@/components/icon';
import { ErrorLine } from '@/components/error-line';
import { Modal } from '@/components/modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui';
import type { PublicResult } from '@/lib/intake/public-result';
import { seoulDateKey } from '@/lib/intake/paths';
import { acknowledgeIntakeRunReview, getIntakeRunReview } from '@/app/actions/intake-admin';
import { dropsAcknowledgement, needsFreshView } from './detail-rules';
import { useAction } from './use-action';

/* 받는 사람 화면 부품은 열 때만 불러온다 — 3D 보기(three)를 접수 화면 묶음에서 빼고, 상세 화면 시험(node)이 next/dynamic 을 안 불러도 되게 */
const loadResultBody = () => import('@/components/intake/result-view').then((m) => ({ default: m.ResultBody }));
/*
 * React.lazy 는 한 번 실패한 import 를 그대로 기억한다 — 하나만 두면 '다시'를 눌러도 같은 실패만 다시 던졌다(INTAKE-MAIN/R02,
 * 실제 브라우저에서 청크를 막아 확인). 그래서 '다시'(이벤트 안)에서만 새로 만들어 다시 import 하게 한다. 그리는 동안에는 만들지 않는다.
 */
let ResultBody = lazy(loadResultBody);
const reloadResultBody = () => {
  ResultBody = lazy(loadResultBody);
};

type Shown = { result: PublicResult; revisionNumber: number; isCurrentRevision: boolean; resultDigest: string; currentRevisionId: string | null };

/**
 * 결과 부품(나중에 불러오는 조각)을 못 불러오면 창 안에서만 알린다 — 상세 화면 전체가 오류 화면으로 넘어가지 않게.
 * 실패한 동안 준비는 아니다(그 부품이 안 그려져 준비 신호도 안 온다). '다시'는 조각을 새로 붙인다.
 */
class ChunkBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-5 py-6 text-sm text-danger lg:px-8"
      >
        결과 화면을 불러오지 못했습니다.
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            this.setState({ failed: false });
            this.props.onRetry();
          }}
        >
          다시
        </Button>
      </div>
    );
  }
}

/**
 * 공개 전 3D 검토(INTAKE-MAIN/R01) — 성공한 실행의 결과를 받는 사람이 볼 모양 그대로 연다. 3D 보기는 공개 화면과 같은 부품(ResultBody → Body3D)이다.
 * 여는 것은 검토가 아니다. 3D 가 실제로 그릴 준비가 된 뒤(ResultBody onReadyChange) 관리자가 '이 결과 검토 완료'를 눌러야
 * 서버가 그 관리자 · 그 결과 해시 · 그 판 · 연 때의 상태에 묶은 검토 완료를 남기고(acknowledgeIntakeRunReview), 공개 단추가 그 번호로 켜진다.
 * 공개는 서버가 이 번호를 잠금 안에서 다시 맞춰 본다 — 화면의 기억만으로 공개되지 않는다.
 * 공개할 수 없는 실행(공개 중 · 옛 판)은 보기만 한다 — 검토 완료 단추를 안 둔다.
 * 연 뒤 상태가 바뀌어 서버가 막으면 창을 닫는다 — 다시 열어 지금 상태를 보고 누르게.
 * 설명은 공개할 때 적는 글을 그대로 넘겨 받는 사람 화면과 같게 보인다(설명은 검토 묶음에 안 들어간다).
 */
export function RunReview({
  submissionId,
  runId,
  explanation,
  canAcknowledge,
  acknowledged,
  onAcknowledged,
}: {
  submissionId: string;
  runId: string;
  explanation: string;
  /** 이 실행을 지금 공개할 수 있나 — 아니면 보기만 */
  canAcknowledge: boolean;
  /** 이 화면에서 이미 검토 완료를 받았나 */
  acknowledged: boolean;
  onAcknowledged: (acknowledgementId: string) => void;
}) {
  const opening = useAction();
  const acking = useAction();
  const [shown, setShown] = useState<Shown | null>(null);
  const [ready, setReady] = useState(false);
  const [mount, setMount] = useState(0);
  const hintId = `run-review-hint-${runId}`;
  const open = () => {
    setReady(false);
    acking.setError(undefined);
    opening.run(
      () => getIntakeRunReview(submissionId, runId),
      (r) =>
        setShown({
          result: {
            version: 0,
            athleteName: r.athleteName || '이름 미입력',
            explanation: null,
            resultDate: seoulDateKey(new Date()),
            view: r.view,
          },
          revisionNumber: r.revisionNumber,
          isCurrentRevision: r.isCurrentRevision,
          resultDigest: r.resultDigest,
          currentRevisionId: r.currentRevisionId,
        })
    );
  };
  const close = () => {
    setShown(null);
    setReady(false);
  };
  const acknowledge = () => {
    if (!shown || !ready || !canAcknowledge) return;
    acking.run(
      () =>
        acknowledgeIntakeRunReview(
          submissionId,
          runId,
          shown.resultDigest,
          shown.currentRevisionId
        ),
      (r) => {
        onAcknowledged(r.acknowledgementId);
        close();
        toast('검토 완료를 기록했습니다. 이제 공개할 수 있습니다');
      },
      (f) => {
        /* 연 뒤 상태가 바뀌었다 — 이 창은 낡았다. 닫고 다시 열게 한다(오류 글은 단추 밑에 남는다) */
        if (dropsAcknowledgement(f.code) || needsFreshView(f.code)) close();
      }
    );
  };
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={opening.pending}
        onClick={open}
      >
        <Eye aria-hidden className="h-4 w-4" />
        {opening.pending
          ? '여는 중…'
          : acknowledged || !canAcknowledge
            ? '3D 결과 보기'
            : '3D 결과 검토'}
      </Button>
      {opening.error && <ErrorLine>{opening.error}</ErrorLine>}
      {!shown && acking.error && (
        <ErrorLine>{acking.error} 다시 열어 확인합니다.</ErrorLine>
      )}
      <Modal
        open={shown != null}
        onClose={close}
        size="page"
        title={
          shown
            ? `${shown.revisionNumber}판 결과 ${canAcknowledge ? '검토' : '보기'}${shown.isCurrentRevision ? '' : ' · 옛 판'}`
            : '결과 검토'
        }
        description="받는 분에게 표시될 화면입니다. 결과일은 실제 공개일로 표시됩니다."
      >
        {shown && (
          <>
            <ChunkBoundary
              key={mount}
              onRetry={() => {
                reloadResultBody();
                setReady(false);
                setMount((n) => n + 1);
              }}
            >
              <Suspense
                fallback={
                  <p role="status" className="px-5 py-6 text-sm text-muted">
                    결과를 불러오는 중…
                  </p>
                }
              >
                <ResultBody
                  preview
                  result={{ ...shown.result, explanation: explanation.trim() || null }}
                  onReadyChange={setReady}
                />
              </Suspense>
            </ChunkBoundary>
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-5 pb-6 lg:px-8">
              {canAcknowledge ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!ready || acking.pending}
                    aria-describedby={hintId}
                    onClick={acknowledge}
                  >
                    {acking.pending ? '남기는 중…' : '이 결과 검토 완료'}
                  </Button>
                  <p
                    id={hintId}
                    role="status"
                    className="text-[13px] leading-5 text-muted break-keep"
                  >
                    {ready
                      ? '3D 동작과 수치를 확인한 뒤 검토 완료를 누릅니다. 검토 기록이 저장됩니다.'
                      : '3D 화면이 정상적으로 로드된 뒤 검토 완료를 누를 수 있습니다.'}
                  </p>
                </>
              ) : (
                <p className="text-[13px] leading-5 text-muted break-keep">
                  공개 중인 결과 또는 이전 판은 조회만 가능합니다.
                </p>
              )}
              {acking.error && <ErrorLine>{acking.error}</ErrorLine>}
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
